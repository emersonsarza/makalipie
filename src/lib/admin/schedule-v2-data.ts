import "server-only";
import { createHash } from "node:crypto";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { AdminAccessError, isAllowedMutationOrigin } from "../admin/access";
import { requireAdmin } from "../admin/session";
import { parseBranchSettings, type BranchSettings } from "../branches/schema";
import { getServerFirebase } from "../firebase/server";
import { ProductError } from "../products/store";
import { scheduleSettingsSchema, type ScheduleSettings } from "../scheduling/schema";
import {
  pauseKey, planScheduleSave, presentSchedule, resolveScheduleBranch, scheduleAccess, scheduleRevision,
  ScheduleCommandError, ScheduleQueryError, type ScheduleCommand,
} from "./schedule-v2";

const commands = "adminScheduleCommands";
type Pause = { paused: boolean; version: number } | null;
type Loaded = { stored: ScheduleSettings | null; settings: BranchSettings; updatedAt: string; pause: Pause };

export async function readAdminSchedule(branch: string | null, now = new Date()) {
  const admin = await requireAdmin();
  if (!scheduleAccess(admin).allowed) throw new AdminAccessError(403, "You do not have access to this page.");
  const loaded = await loadBase();
  const branchId = resolveScheduleBranch(branch, admin, loaded.settings);
  const pause = await loadPause(getServerFirebase().db, branchId, now);
  if (!loaded.stored?.branches[branchId]) throw new ScheduleQueryError(404, "This branch has no saved schedule yet.");
  return presentSchedule({ branchId, stored: loaded.stored, settings: loaded.settings, updatedAt: loaded.updatedAt, pause, access: scheduleAccess(admin) });
}

export async function commitAdminSchedule(request: Request, command: ScheduleCommand, now = new Date()) {
  if (!isAllowedMutationOrigin(request, process.env.ADMIN_APP_ORIGIN ?? "")) throw new ProductError(403, "This save could not be verified. Refresh the page and try again.");
  const admin = await requireAdmin();
  const access = scheduleAccess(admin);
  if (!access.allowed) throw new AdminAccessError(403, "You do not have access to this page.");
  const db = getServerFirebase().db;
  const preview = await loadBase();
  resolveScheduleBranch(command.branchId, admin, preview.settings);
  const previewPause = await loadPause(db, command.branchId, now);
  planScheduleSave({ command, stored: preview.stored, settings: preview.settings, pause: previewPause, access });
  const claim = await claimCommand(db, command, admin.uid, now);
  if (claim === "replay") return finish(command.branchId, admin, now);
  let completed = false;
  try {
    await db.runTransaction(async (tx) => {
      const loaded = await readLocked(tx, db, command.branchId, now);
      const decision = planScheduleSave({ command, stored: loaded.stored, settings: loaded.settings, pause: loaded.pause, access });
      tx.set(db.doc("settings/orderingSchedule"), { ...decision, version: decision.version + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid });
      tx.create(db.collection("scheduleSettingsEvents").doc(), {
        actorUid: admin.uid, at: FieldValue.serverTimestamp(), branchId: command.branchId,
        before: loaded.stored, after: { ...decision, version: decision.version + 1 },
      });
    });
    completed = true;
    await completeCommand(db, command.idempotencyKey);
    return finish(command.branchId, admin, now);
  } catch (error) {
    if (!completed) await db.collection(commands).doc(command.idempotencyKey).delete().catch(() => undefined);
    throw error;
  }
}

async function finish(branchId: string, admin: Awaited<ReturnType<typeof requireAdmin>>, now: Date) {
  const loaded = await loadBase();
  const pause = await loadPause(getServerFirebase().db, branchId, now);
  if (!loaded.stored) throw new ScheduleCommandError(503, "network", "Schedule couldn't be loaded. Please try again.");
  return { ok: true as const, snapshot: presentSchedule({ branchId, stored: loaded.stored, settings: loaded.settings, updatedAt: loaded.updatedAt, pause, access: scheduleAccess(admin) }) };
}

async function loadBase(): Promise<Omit<Loaded, "pause">> {
  const db = getServerFirebase().db;
  const [scheduleSnap, branchSnap] = await Promise.all([
    db.doc("settings/orderingSchedule").get(),
    db.doc("settings/branches").get(),
  ]);
  const settings = parseSavedBranches(branchSnap.data());
  if (!scheduleSnap.exists) return { stored: null, settings, updatedAt: "" };
  return { stored: parseSchedule(scheduleSnap.data()), settings, updatedAt: stamp(scheduleSnap.data()?.updatedAt) };
}

async function loadPause(db: Firestore, branchId: string, now: Date) {
  const snap = await db.doc(`allocationDays/${pauseKey(branchId, now)}`).get();
  return pauseFrom(snap.data());
}

function parseSavedBranches(data: FirebaseFirestore.DocumentData | undefined) {
  if (!data) throw new ScheduleQueryError(404, "Branch settings have not been saved yet.");
  try {
    const { updatedAt: _at, updatedBy: _by, ...rest } = data; void _at; void _by;
    return parseBranchSettings(rest);
  } catch {
    throw new ScheduleCommandError(503, "network", "Schedule couldn't be loaded. Please try again.");
  }
}

function parseSchedule(data: FirebaseFirestore.DocumentData | undefined) {
  try {
    const { updatedAt: _at, updatedBy: _by, ...rest } = data ?? {}; void _at; void _by;
    return scheduleSettingsSchema.parse(rest);
  } catch {
    throw new ScheduleCommandError(503, "network", "Schedule couldn't be loaded. Please try again.");
  }
}

function stamp(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return (value.toDate() as Date).toISOString();
  return "";
}

async function readLocked(tx: Transaction, db: Firestore, branchId: string, now: Date) {
  const scheduleSnap = await tx.get(db.doc("settings/orderingSchedule"));
  const branchSnap = await tx.get(db.doc("settings/branches"));
  const pauseSnap = await tx.get(db.doc(`allocationDays/${pauseKey(branchId, now)}`));
  return {
    stored: scheduleSnap.exists ? parseSchedule(scheduleSnap.data()) : null,
    settings: parseSavedBranches(branchSnap.data()),
    pause: pauseFrom(pauseSnap.data()),
  };
}

function pauseFrom(data: FirebaseFirestore.DocumentData | undefined): Pause {
  if (!data) return null;
  if (typeof data.paused !== "boolean" || typeof data.version !== "number") throw new ScheduleCommandError(503, "network", "Schedule couldn't be loaded. Please try again.");
  return { paused: data.paused, version: data.version };
}

async function claimCommand(db: Firestore, command: ScheduleCommand, uid: string, now: Date) {
  const ref = db.collection(commands).doc(command.idempotencyKey);
  const hash = createHash("sha256").update(JSON.stringify(command)).digest("hex");
  const judge = async (saved: FirebaseFirestore.DocumentData) => {
    if (saved.uid !== uid || saved.hash !== hash) throw new ScheduleCommandError(409, "conflict", "This save was already used.");
    if (saved.completed === true) return "replay" as const;
    const loaded = await loadBase();
    const pause = await loadPause(db, command.branchId, now);
    const live = loaded.stored ? revisionOf(command.branchId, loaded.stored, loaded.settings, pause) : "";
    if (live !== command.expectedRevision) {
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
    if (!again.exists) throw new ScheduleCommandError(409, "conflict", "This save was already used.");
    const judged = await judge(again.data() ?? {});
    if (judged === "replay") return judged;
    await ref.create({ uid, hash, completed: false, at: new Date().toISOString() });
  }
  return "claimed" as const;
}

function revisionOf(branchId: string, stored: ScheduleSettings, settings: BranchSettings, pause: Pause) {
  const hoursLabel = settings.branches.find((item) => item.id === branchId)?.hoursLabel?.trim() || null;
  return scheduleRevision({ branchId, scheduleVersion: stored.version, branchVersion: settings.version, pauseVersion: pause?.version ?? 0, paused: pause?.paused ?? false, hoursLabel });
}

async function completeCommand(db: Firestore, key: string) {
  await db.collection(commands).doc(key).set({ completed: true }, { merge: true });
}
