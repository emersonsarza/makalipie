import "server-only";
import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { isAllowedMutationOrigin } from "../admin/access";
import { requireOwner } from "../admin/session";
import { getServerFirebase } from "../firebase/server";
import { ProductError } from "../products/store";
import { defaultPopupSettings, parsePopupSettings, type PopupSettings } from "../popups/schema";
import { savePopupSettings } from "../popups/store";
import { PopupCommandError, planPopupSave, popupsAccess, popupsRevision, presentPopups, type PopupCommand } from "./popups-v2";

const commands = "adminPopupCommands";
const LOAD_ERROR = "Pop-ups couldn't be loaded. Please try again.";

export async function readAdminPopups() {
  const owner = await requireOwner();
  const [stored, reservedIds] = await Promise.all([loadPopups(), loadReservedIds()]);
  return presentPopups(stored, reservedIds, popupsAccess(owner).canEdit);
}

export async function commitAdminPopups(request: Request, command: PopupCommand) {
  if (!isAllowedMutationOrigin(request, process.env.ADMIN_APP_ORIGIN ?? "")) throw new ProductError(403, "This save could not be verified. Refresh the page and try again.");
  const owner = await requireOwner();
  const access = popupsAccess(owner);
  const db = getServerFirebase().db;
  const [stored, reservedIds] = await Promise.all([loadPopups(), loadReservedIds()]);
  const next = planPopupSave({ command, stored, reservedIds, access });
  const claim = await claimCommand(db, command, owner.uid);
  if (claim === "replay") return finish(owner);
  let completed = false;
  try {
    await savePopupSettings(next, owner.uid);
    completed = true;
    await db.collection(commands).doc(command.idempotencyKey).set({ completed: true }, { merge: true });
    return finish(owner);
  } catch (error) {
    if (!completed) await db.collection(commands).doc(command.idempotencyKey).delete().catch(() => undefined);
    if (error instanceof ProductError && error.status === 409) throw new PopupCommandError(409, "conflict", error.message);
    if (error instanceof ProductError && error.status === 400) throw new PopupCommandError(400, "validation", error.message);
    throw error;
  }
}

async function finish(owner: { role: string }) {
  const [stored, reservedIds] = await Promise.all([loadPopups(), loadReservedIds()]);
  return { ok: true as const, snapshot: presentPopups(stored, reservedIds, popupsAccess(owner).canEdit) };
}

async function loadPopups(): Promise<PopupSettings> {
  const snap = await getServerFirebase().db.doc("settings/popups").get();
  if (!snap.exists) return defaultPopupSettings();
  try {
    const { updatedAt: _at, updatedBy: _by, ...rest } = snap.data() ?? {};
    void _at; void _by;
    return parsePopupSettings(rest);
  } catch {
    throw new PopupCommandError(503, "network", LOAD_ERROR);
  }
}

async function loadReservedIds() {
  const snap = await getServerFirebase().db.doc("settings/branches").get();
  if (!snap.exists || !Array.isArray(snap.data()?.branches)) return [];
  return snap.data()!.branches.flatMap((branch: { id?: unknown }) => typeof branch?.id === "string" && branch.id ? [branch.id] : []);
}

async function claimCommand(db: Firestore, command: PopupCommand, uid: string) {
  const ref = db.collection(commands).doc(command.idempotencyKey);
  const hash = createHash("sha256").update(JSON.stringify(command)).digest("hex");
  const judge = async (saved: FirebaseFirestore.DocumentData) => {
    if (saved.uid !== uid || saved.hash !== hash) throw new PopupCommandError(409, "conflict", "This save was already used.");
    if (saved.completed === true) return "replay" as const;
    const stored = await loadPopups();
    if (popupsRevision(stored) !== command.expectedRevision) {
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
    if (!again.exists) throw new PopupCommandError(409, "conflict", "This save was already used.");
    const judged = await judge(again.data() ?? {});
    if (judged === "replay") return judged;
    await ref.create({ uid, hash, completed: false, at: new Date().toISOString() });
  }
  return "claimed" as const;
}
