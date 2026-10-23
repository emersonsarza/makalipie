import "server-only";
import { createHash } from "node:crypto";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { cookies } from "next/headers";
import { AdminAccessError, assertRecentSignIn, isAllowedMutationOrigin } from "../admin/access";
import { adminProfileSchema } from "../admin/schemas";
import { isInvalidCredential, requireOwner, SESSION_COOKIE } from "../admin/session";
import { parseBranchSettings } from "../branches/schema";
import { getServerFirebase } from "../firebase/server";
import { ProductError } from "../products/store";
import {
  planSettingsSave, presentSettings, settingsAccess, settingsRevision, SettingsCommandError, type SettingsCommand, type StoredStaff,
} from "./settings-v2";

const commands = "adminSettingsCommands";
const LOAD_ERROR = "Settings couldn't be loaded. Please try again.";

export async function readAdminSettings() {
  const owner = await requireOwner();
  const loaded = await loadContext([]);
  return presentSettings({ ...loaded, canEdit: settingsAccess(owner).canEdit });
}

export async function commitAdminSettings(request: Request, command: SettingsCommand) {
  if (!isAllowedMutationOrigin(request, process.env.ADMIN_APP_ORIGIN ?? "")) throw new ProductError(403, "This save could not be verified. Refresh the page and try again.");
  const owner = await requireOwner();
  const access = settingsAccess(owner);
  const db = getServerFirebase().db;
  const preview = await loadContext(command.values.staff.map((person) => person.uid));
  const decision = planSettingsSave({ command, ...preview, actorUid: owner.uid, access });
  if (decision.reauth) await assertRecentOwner();
  if (!Object.keys(decision.shopWrites).length && !decision.staffWrites.length) return finish(owner);
  const claim = await claimCommand(db, command, owner.uid);
  if (claim === "replay") return finish(owner);
  let completed = false;
  try {
    await db.runTransaction(async (tx) => {
      const loaded = await readLocked(tx, db, command.values.staff.map((person) => person.uid));
      const next = planSettingsSave({ command, ...loaded, actorUid: owner.uid, access });
      if (Object.keys(next.shopWrites).length) {
        tx.set(db.doc("settings/shop"), { ...next.shopWrites, updatedBy: owner.uid, updatedAt: new Date().toISOString() }, { merge: true });
      }
      for (const person of next.staffWrites) {
        tx.update(db.doc(`admins/${person.uid}`), { displayName: person.displayName, active: person.active, branchIds: person.branchIds, pages: person.pages });
      }
      tx.create(db.collection("shopSettingsEvents").doc(), {
        actorUid: owner.uid, at: FieldValue.serverTimestamp(), shop: next.shopWrites,
        staff: next.staffWrites.map(({ uid, displayName, active, branchIds }) => ({ uid, displayName, active, branchIds })),
      });
    });
    completed = true;
    await db.collection(commands).doc(command.idempotencyKey).set({ completed: true }, { merge: true });
    return finish(owner);
  } catch (error) {
    if (!completed) await db.collection(commands).doc(command.idempotencyKey).delete().catch(() => undefined);
    throw error;
  }
}

async function finish(owner: Awaited<ReturnType<typeof requireOwner>>) {
  const loaded = await loadContext([]);
  return { ok: true as const, snapshot: presentSettings({ ...loaded, canEdit: settingsAccess(owner).canEdit }) };
}

async function assertRecentOwner() {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) throw new SettingsCommandError(401, "reauth", "A recent sign-in is required before changing staff access.");
  try {
    const token = await getServerFirebase().auth.verifySessionCookie(cookie, true);
    assertRecentSignIn(token.auth_time);
  } catch (error) {
    if (error instanceof AdminAccessError || isInvalidCredential(error)) throw new SettingsCommandError(401, "reauth", "A recent sign-in is required before changing staff access.");
    throw error;
  }
}

async function loadContext(extraUids: string[]) {
  const db = getServerFirebase().db;
  const [shopSnap, branchSnap, staffSnap] = await Promise.all([
    db.doc("settings/shop").get(),
    db.doc("settings/branches").get(),
    db.collection("admins").where("role", "==", "staff").limit(101).get(),
  ]);
  return assemble(shopSnap.data(), branchSnap.data(), staffSnap.docs, await extraDocs(db, extraUids, staffSnap.docs.map((doc) => doc.id)), shopSnap.exists);
}

async function readLocked(tx: Transaction, db: Firestore, extraUids: string[]) {
  const shopSnap = await tx.get(db.doc("settings/shop"));
  const branchSnap = await tx.get(db.doc("settings/branches"));
  const staffSnap = await tx.get(db.collection("admins").where("role", "==", "staff").limit(101));
  const known = new Set(staffSnap.docs.map((doc) => doc.id));
  const extras = [];
  for (const uid of extraUids) if (!known.has(uid)) extras.push(await tx.get(db.doc(`admins/${uid}`)));
  return assemble(shopSnap.data(), branchSnap.data(), staffSnap.docs, extras, shopSnap.exists);
}

function assemble(shopData: FirebaseFirestore.DocumentData | undefined, branchData: FirebaseFirestore.DocumentData | undefined, staffDocs: FirebaseFirestore.QueryDocumentSnapshot[], extras: FirebaseFirestore.DocumentSnapshot[], shopExists: boolean) {
  if (staffDocs.length > 100) throw new SettingsCommandError(503, "network", "Staff list is too large to edit together.");
  const staff = staffDocs.map(readStaff);
  const identities = new Map<string, { role: "owner" | "staff" }>(staff.map((person) => [person.uid, { role: "staff" }]));
  for (const doc of extras) {
    if (!doc.exists) continue;
    const role = doc.data()?.role;
    if (role !== "owner" && role !== "staff") continue;
    identities.set(doc.id, { role });
    if (role === "staff" && !staff.some((person) => person.uid === doc.id)) staff.push(readStaff(doc as FirebaseFirestore.QueryDocumentSnapshot));
  }
  return { shop: shopExists ? shopData ?? {} : null, staff, branches: readBranches(branchData), identities };
}

function readStaff(doc: FirebaseFirestore.DocumentSnapshot): StoredStaff {
  const data = doc.data() ?? {};
  const parsed = adminProfileSchema.safeParse(data);
  if (!parsed.success || parsed.data.role !== "staff") throw new SettingsCommandError(503, "network", LOAD_ERROR);
  const pages = data.pages && typeof data.pages === "object" && !Array.isArray(data.pages) ? data.pages as Record<string, unknown> : {};
  return { uid: doc.id, displayName: parsed.data.displayName ?? "", active: parsed.data.active, branchIds: parsed.data.branchIds, pages };
}

function readBranches(data: FirebaseFirestore.DocumentData | undefined) {
  if (!data) return [];
  try {
    const { updatedAt: _at, updatedBy: _by, ...rest } = data; void _at; void _by;
    return parseBranchSettings(rest).branches.map(({ id, name }) => ({ id, name }));
  } catch {
    throw new SettingsCommandError(503, "network", LOAD_ERROR);
  }
}

async function extraDocs(db: Firestore, uids: string[], known: string[]) {
  const seen = new Set(known);
  const missing = uids.filter((uid) => !seen.has(uid));
  return Promise.all(missing.map((uid) => db.doc(`admins/${uid}`).get()));
}

async function claimCommand(db: Firestore, command: SettingsCommand, uid: string) {
  const ref = db.collection(commands).doc(command.idempotencyKey);
  const hash = createHash("sha256").update(JSON.stringify(command)).digest("hex");
  const judge = async (saved: FirebaseFirestore.DocumentData) => {
    if (saved.uid !== uid || saved.hash !== hash) throw new SettingsCommandError(409, "conflict", "This save was already used.");
    if (saved.completed === true) return "replay" as const;
    const loaded = await loadContext(command.values.staff.map((person) => person.uid));
    if (settingsRevision(loaded) !== command.expectedRevision) {
      await ref.set({ completed: true }, { merge: true });
      return "replay" as const;
    }
    await ref.delete();
    return "open" as const;
  };
  const existing = await ref.get();
  if (existing.exists) {
    const judged = await judge(existing.data() ?? {});
    if (judged === "replay") return judged;
  }
  try {
    await ref.create({ uid, hash, completed: false, at: new Date().toISOString() });
  } catch {
    const again = await ref.get();
    if (!again.exists) throw new SettingsCommandError(409, "conflict", "This save was already used.");
    const judged = await judge(again.data() ?? {});
    if (judged === "replay") return judged;
    await ref.create({ uid, hash, completed: false, at: new Date().toISOString() });
  }
  return "claimed" as const;
}
