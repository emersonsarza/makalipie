import "server-only";
import { createHash } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { isAllowedMutationOrigin } from "../admin/access";
import { requireOwner } from "../admin/session";
import { parseBranchSettings, type BranchSettings } from "../branches/schema";
import { getServerFirebase } from "../firebase/server";
import { forget, publicCacheKeys } from "../public-cache";
import { ProductError } from "../products/store";
import {
  BranchCommandError, BranchQueryError, branchesAccess, branchesRevision, planBranchSave, presentBranches, type BranchCommand,
} from "./branches-v2";

const commands = "adminBranchCommands";

export async function readAdminBranches() {
  const owner = await requireOwner();
  const stored = await loadSettings();
  if (!stored) throw new BranchQueryError(404, "Branch settings have not been saved yet.");
  return presentBranches(stored, branchesAccess(owner).canEdit);
}

export async function commitAdminBranches(request: Request, command: BranchCommand) {
  if (!isAllowedMutationOrigin(request, process.env.ADMIN_APP_ORIGIN ?? "")) throw new ProductError(403, "This save could not be verified. Refresh the page and try again.");
  const owner = await requireOwner();
  const access = branchesAccess(owner);
  const db = getServerFirebase().db;
  planBranchSave({ command, stored: await loadSettings(), access });
  const claim = await claimCommand(db, command, owner.uid);
  if (claim === "replay") return finish(owner);
  let completed = false;
  try {
    await db.runTransaction(async (tx) => {
      const ref = db.doc("settings/branches");
      const [existing, marker] = await Promise.all([tx.get(ref), tx.get(db.doc("privateSettings/catalogV2"))]);
      if (!marker.exists) throw new BranchCommandError(409, "conflict", "Set up your catalog options before saving branches.");
      const stored = existing.exists ? parseStored(existing.data()) : null;
      const decision = planBranchSave({ command, stored, access });
      tx.set(ref, { ...decision, version: decision.version + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: owner.uid });
      tx.create(db.collection("branchSettingsEvents").doc(), {
        actorUid: owner.uid, at: FieldValue.serverTimestamp(), branchId: command.branch.id,
        before: existing.exists ? existing.data() : null, after: { ...decision, version: decision.version + 1 },
      });
    });
    completed = true;
    await db.collection(commands).doc(command.idempotencyKey).set({ completed: true }, { merge: true });
    forget(publicCacheKeys.branches);
    return finish(owner);
  } catch (error) {
    if (!completed) await db.collection(commands).doc(command.idempotencyKey).delete().catch(() => undefined);
    throw error;
  }
}

async function finish(owner: Awaited<ReturnType<typeof requireOwner>>) {
  const stored = await loadSettings();
  if (!stored) throw new BranchCommandError(503, "network", "Branch settings couldn't be loaded. Please try again.");
  return { ok: true as const, snapshot: presentBranches(stored, branchesAccess(owner).canEdit) };
}

async function loadSettings() {
  const snap = await getServerFirebase().db.doc("settings/branches").get();
  if (!snap.exists) return null;
  return parseStored(snap.data());
}

function parseStored(data: FirebaseFirestore.DocumentData | undefined): BranchSettings {
  try {
    const { updatedAt: _at, updatedBy: _by, ...rest } = data ?? {}; void _at; void _by;
    return parseBranchSettings(rest);
  } catch {
    throw new BranchCommandError(503, "network", "Branch settings couldn't be loaded. Please try again.");
  }
}

async function claimCommand(db: Firestore, command: BranchCommand, uid: string) {
  const ref = db.collection(commands).doc(command.idempotencyKey);
  const hash = createHash("sha256").update(JSON.stringify(command)).digest("hex");
  const judge = async (saved: FirebaseFirestore.DocumentData) => {
    if (saved.uid !== uid || saved.hash !== hash) throw new BranchCommandError(409, "conflict", "This save was already used.");
    if (saved.completed === true) return "replay" as const;
    const stored = await loadSettings();
    if (stored && branchesRevision(stored) !== command.expectedRevision) {
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
    if (!again.exists) throw new BranchCommandError(409, "conflict", "This save was already used.");
    const judged = await judge(again.data() ?? {});
    if (judged === "replay") return judged;
    await ref.create({ uid, hash, completed: false, at: new Date().toISOString() });
  }
  return "claimed" as const;
}
