import "server-only";

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { isAllowedMutationOrigin, pagePermissions } from "./access";
import {
  AllocationCommandError,
  allocationPermissions,
  assessAllocationSave,
  buildAllocationSnapshot,
  resolveAllocationScope,
  type AllocationCommand,
  type AllocationEntry,
  type AllocationFlavor,
} from "./allocation-v2";
import type { AdminIdentity } from "./schemas";
import { requireAdmin } from "./session";
import { variantAvailable } from "@/lib/branches/schema";
import { readBranchSettings } from "@/lib/branches/store";
import { forget, publicCacheKeys } from "@/lib/public-cache";
import { readPublicMenu } from "@/lib/products/public";
import { ProductError } from "@/lib/products/store";
import { allocationDaySchema, allocationRecordSchema, flavorCapacityKey } from "@/lib/orders/allocation";
import { dailyCapacityKey } from "@/lib/orders/policy";
import { getServerFirebase } from "@/lib/firebase/server";
import { readScheduleSettings } from "@/lib/scheduling/store";
import { scheduleSettingsSchema, type BranchSchedule } from "@/lib/scheduling/schema";

const LOAD_ERROR = "Allocation couldn't be loaded. Please try again.";

export async function readAdminAllocation(query: { branch: string | null; date: string | null }) {
  const admin = await requireAdmin();
  if (!pagePermissions(admin).allocation) throw new AllocationCommandError(403, "permission", "You don't have access to this page. Ask the owner.");
  const now = new Date();
  const loaded = await loadScope(admin, query.branch, query.date, now);
  return buildAllocationSnapshot({ ...loaded, now, permissions: allocationPermissions(admin) });
}

export async function commitAdminAllocation(request: Request, command: AllocationCommand) {
  if (!isAllowedMutationOrigin(request, process.env.ADMIN_APP_ORIGIN ?? "")) {
    throw new AllocationCommandError(403, "permission", "This request is not allowed. Reload the page and try again.");
  }
  const admin = await requireAdmin();
  if (!pagePermissions(admin).allocation) throw new AllocationCommandError(403, "permission", "You don't have access to this page. Ask the owner.");
  const now = new Date();
  const loaded = await loadScope(admin, command.branchId, command.date, now);
  const permissions = allocationPermissions(admin);
  const knownProductIds = new Set(loaded.flavors.filter((flavor) => flavor.variants.some((variant) => variant.assigned)).map((flavor) => flavor.id));
  for (const [productId, entry] of loaded.entries) if (entry.exists) knownProductIds.add(productId);
  const preview = assessAllocationSave({
    now,
    command,
    permissions,
    scheduleEnabled: loaded.schedule?.enabled === true,
    dayVersion: loaded.dayVersion,
    paused: loaded.paused,
    entries: loaded.entries,
    knownProductIds,
  });
  if (!preview.ok) throw preview.error;
  const replay = await claimCommand(admin, command);
  if (replay === "replay") return { ok: true as const, snapshot: await readAdminAllocation({ branch: command.branchId, date: command.date }) };
  try {
    const { db } = getServerFirebase();
    await db.runTransaction(async (tx) => {
      const dayRef = db.doc(`allocationDays/${dailyCapacityKey(command.branchId, command.date)}`);
      const refs = new Map(command.changes.map((change) => [change.productId, db.doc(`allocations/${flavorCapacityKey(command.branchId, command.date, change.productId)}`)]));
      const daySnap = await tx.get(dayRef);
      const scheduleSnap = command.paused === undefined ? null : await tx.get(db.doc("settings/orderingSchedule"));
      const snaps = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      for (const [productId, ref] of refs) snaps.set(productId, await tx.get(ref));
      const entries = new Map(loaded.entries);
      for (const [productId, snap] of snaps) entries.set(productId, entryFrom(snap.exists ? snap.data() : undefined));
      const day = dayFrom(daySnap.exists ? daySnap.data() : undefined);
      if (daySnap.exists && !day) throw new AllocationCommandError(503, "network", LOAD_ERROR);
      let scheduleEnabled = loaded.schedule?.enabled === true;
      if (scheduleSnap) {
        if (!scheduleSnap.exists) scheduleEnabled = false;
        else {
          const { updatedAt: _at, updatedBy: _by, ...stored } = scheduleSnap.data() ?? {};
          void _at; void _by;
          const parsed = scheduleSettingsSchema.safeParse(stored);
          scheduleEnabled = parsed.success && parsed.data.branches[command.branchId]?.enabled === true;
        }
      }
      const decision = assessAllocationSave({
        now,
        command,
        permissions,
        scheduleEnabled,
        dayVersion: day?.version ?? 0,
        paused: day?.paused ?? false,
        entries,
        knownProductIds,
      });
      if (!decision.ok) throw decision.error;
      for (const write of decision.writes) {
        if (write.kind === "delete") tx.delete(refs.get(write.productId)!);
        if (write.kind === "limit") {
          tx.set(refs.get(write.productId)!, {
            branchId: command.branchId,
            fulfillmentDate: command.date,
            productId: write.productId,
            limit: write.limit,
            held: write.held,
            version: write.version,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: admin.uid,
          });
        }
        if (write.kind === "pause") {
          tx.set(dayRef, {
            branchId: command.branchId,
            fulfillmentDate: command.date,
            paused: write.paused,
            version: write.version,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: admin.uid,
          });
        }
      }
      tx.create(db.collection("allocationEvents").doc(), {
        actorUid: admin.uid,
        branchId: command.branchId,
        at: FieldValue.serverTimestamp(),
        date: command.date,
        writes: decision.writes.map((write) => write.kind === "pause" ? { pause: write.paused } : { productId: write.productId, kind: write.kind, limit: write.kind === "limit" ? write.limit : null }),
      });
    });
    await completeCommand(command.idempotencyKey);
    forget(publicCacheKeys.stock);
    return { ok: true as const, snapshot: await readAdminAllocation({ branch: command.branchId, date: command.date }) };
  } catch (error) {
    await releaseCommand(command.idempotencyKey);
    throw error;
  }
}

async function loadScope(admin: AdminIdentity, branch: string | null, date: string | null, now: Date) {
  let settings;
  try { settings = await readBranchSettings(); }
  catch { throw new ProductError(503, LOAD_ERROR); }
  const scope = resolveAllocationScope({ admin, branch, date, now, knownBranchIds: settings.branches.map((item) => item.id) });
  const [menu, schedule, allocationSnap, daySnap] = await Promise.all([
    readPublicMenu().catch(() => { throw new ProductError(503, LOAD_ERROR); }),
    readScheduleSettings().catch(() => { throw new ProductError(503, LOAD_ERROR); }),
    getServerFirebase().db.collection("allocations").get().catch(() => { throw new ProductError(503, LOAD_ERROR); }),
    getServerFirebase().db.doc(`allocationDays/${dailyCapacityKey(scope.branchId, scope.date)}`).get().catch(() => { throw new ProductError(503, LOAD_ERROR); }),
  ]);
  if (menu.unavailable || !menu.catalog) throw new ProductError(503, LOAD_ERROR);
  const day = dayFrom(daySnap.exists ? daySnap.data() : undefined);
  if (daySnap.exists && !day) throw new ProductError(503, LOAD_ERROR);
  const entries = new Map<string, AllocationEntry>();
  for (const doc of allocationSnap.docs) {
    const data = doc.data();
    if (data.branchId !== scope.branchId || data.fulfillmentDate !== scope.date) continue;
    const productId = typeof data.productId === "string" ? data.productId : "";
    if (!productId) continue;
    entries.set(productId, entryFrom(data));
  }
  const branchSchedule: BranchSchedule | null = schedule.branches[scope.branchId] ?? null;
  const flavors: AllocationFlavor[] = menu.catalog.products.map((product) => ({
    id: product.id,
    name: product.name,
    active: product.active,
    availableWeekdays: product.availableWeekdays,
    unavailableDates: product.unavailableDates,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      active: variant.active,
      minLeadDays: variant.minLeadDays,
      ...(variant.availableWeekdays ? { availableWeekdays: variant.availableWeekdays } : {}),
      assigned: variantAvailable(settings, scope.branchId, product.id, variant.id, variant.minLeadDays, "regular"),
    })),
  }));
  return {
    branchId: scope.branchId,
    date: scope.date,
    schedule: branchSchedule,
    horizonDays: schedule.bookingHorizonDays,
    paused: day?.paused ?? false,
    dayVersion: day?.version ?? 0,
    flavors,
    entries,
  };
}

function entryFrom(data: FirebaseFirestore.DocumentData | undefined): AllocationEntry {
  if (!data) return { exists: false, readable: true, limit: null, held: 0, version: 0, updatedAt: null, updatedBy: null };
  const parsed = allocationRecordSchema.safeParse({
    branchId: data.branchId,
    fulfillmentDate: data.fulfillmentDate,
    productId: data.productId,
    limit: data.limit === undefined ? null : data.limit,
    held: data.held,
    version: data.version ?? 0,
  });
  if (!parsed.success) return { exists: true, readable: false, limit: null, held: null, version: 0, updatedAt: null, updatedBy: null };
  return {
    exists: true,
    readable: true,
    limit: parsed.data.limit,
    held: parsed.data.held,
    version: parsed.data.version,
    updatedAt: timestampIso(data.updatedAt),
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : null,
  };
}

function dayFrom(data: FirebaseFirestore.DocumentData | undefined) {
  if (!data) return null;
  if ("paused" in data && typeof data.paused !== "boolean") return null;
  const parsed = allocationDaySchema.safeParse({
    branchId: data.branchId,
    fulfillmentDate: data.fulfillmentDate,
    paused: data.paused === true,
    version: data.version ?? 0,
  });
  return parsed.success ? parsed.data : null;
}

function timestampIso(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

async function claimCommand(admin: AdminIdentity, command: AllocationCommand) {
  const ref = getServerFirebase().db.doc(`adminAllocationCommands/${command.idempotencyKey}`);
  const payloadHash = createHash("sha256").update(JSON.stringify(command)).digest("hex");
  const judge = async (saved: FirebaseFirestore.DocumentData) => {
    const same = saved.uid === admin.uid && saved.payloadHash === payloadHash;
    if (!same) throw new AllocationCommandError(409, "conflict", "This save was already used.");
    if (saved.completed === true) return "replay" as const;
    const current = await loadScope(admin, command.branchId, command.date, new Date());
    const moved = current.dayVersion !== command.expectedDayVersion || command.changes.some((change) => {
      const entry = current.entries.get(change.productId);
      const version = entry?.exists ? entry.version : 0;
      return version !== change.expectedVersion;
    });
    if (moved) {
      await ref.set({ completed: true, pending: false }, { merge: true });
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
    await ref.create({ uid: admin.uid, payloadHash, pending: true, completed: false, at: new Date().toISOString() });
  } catch {
    const again = await ref.get();
    if (!again.exists) throw new AllocationCommandError(409, "conflict", "This save was already used.");
    const judged = await judge(again.data() ?? {});
    if (judged === "replay") return judged;
    await ref.create({ uid: admin.uid, payloadHash, pending: true, completed: false, at: new Date().toISOString() });
  }
  return "claimed" as const;
}

async function completeCommand(key: string) {
  await getServerFirebase().db.doc(`adminAllocationCommands/${key}`).set({ completed: true, pending: false }, { merge: true });
}

async function releaseCommand(key: string) {
  const ref = getServerFirebase().db.doc(`adminAllocationCommands/${key}`);
  const saved = await ref.get();
  if (saved.exists && saved.data()?.completed !== true) await ref.delete().catch(() => undefined);
}
