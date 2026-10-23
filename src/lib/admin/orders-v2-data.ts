import "server-only";

import { createHash } from "node:crypto";
import { readBranchSettings } from "@/lib/branches/store";
import { flavorCapacityKey } from "@/lib/orders/allocation";
import type { InboxOrder } from "@/lib/orders/schema";
import { anonymizeDueOrders, expireDueHolds, readAllocationMap, readOrderForAdmin, readOrdersForDashboard, transitionOrder } from "@/lib/orders/store";
import { cancelOrderV2, changeOrderToPickup, confirmOrderFee, recordOrderRider, recordStaffNote, recordV2Payment, voidOrderPayment } from "@/lib/orders/v2-commands";
import { ProductError } from "@/lib/products/store";
import { readScheduleSettings } from "@/lib/scheduling/store";
import { readShopSettings } from "@/lib/settings/store";
import { getServerFirebase } from "@/lib/firebase/server";
import type { AdminIdentity } from "./schemas";
import { requireAdmin } from "./session";
import { AdminAccessError, isAllowedMutationOrigin, pagePermissions } from "./access";
import {
  OrdersQueryError,
  buildOrderDetail,
  buildOrdersList,
  commandPayload,
  normalizeOrderView,
  orderVersion,
  resolveOrdersScope,
  type OrderCommand,
  type OrderExtras,
  type RiderRecord,
  type StaffNote,
} from "./orders-v2";

const NOT_FOUND = "Order not found.";

export async function readAdminOrdersList(query: {
  branch: string | null;
  view: string | null;
  q: string | null;
  date: string | null;
  to: string | null;
  fulfillment: string | null;
  pay: string | null;
  cursor: string | null;
  order: string | null;
}) {
  const admin = await requireAdmin();
  const now = new Date();
  const loaded = await loadScope(admin, query.branch, now);
  const fulfillment = query.fulfillment === "pickup" || query.fulfillment === "delivery" ? query.fulfillment : query.fulfillment ? invalid("Choose pickup or delivery.") : null;
  const pay = query.pay === "unpaid" || query.pay === "partial" || query.pay === "paid" || query.pay === "required" ? query.pay : query.pay ? invalid("Choose a payment filter.") : null;
  return buildOrdersList({
    now,
    branchIds: loaded.branchIds,
    orders: loaded.orders,
    names: loaded.names,
    schedule: loaded.schedule,
    view: normalizeOrderView(query.view),
    query: query.q ?? "",
    date: query.date,
    to: query.to,
    fulfillment,
    pay,
    cursor: query.cursor,
    selectedId: query.order,
  });
}

export async function readAdminOrderDetail(id: string) {
  const admin = await requireAdmin();
  if (!pagePermissions(admin).orders) throw new AdminAccessError(403, "You don't have access to this page. Ask the owner.");
  const now = new Date();
  await prepareOrders(now);
  const loaded = await loadOrder(admin, id, now);
  if (!loaded) throw new OrdersQueryError(404, NOT_FOUND, "not_found");
  return buildOrderDetail(loaded.order, loaded.extras, loaded.schedule, now, admin);
}

export async function commitAdminOrderCommand(request: Request, command: OrderCommand) {
  if (!isAllowedMutationOrigin(request, process.env.ADMIN_APP_ORIGIN ?? "")) {
    throw new ProductError(403, "This request is not allowed. Reload the page and try again.");
  }
  const admin = await requireAdmin();
  if (!pagePermissions(admin).orders) throw new AdminAccessError(403, "You don't have access to this page. Ask the owner.");
  const now = new Date();
  const payload = commandPayload(command);
  await prepareOrders(now);
  const replay = await claimCommand(admin, command);
  if (replay === "replay") return readAdminOrderDetail(command.orderId);
  try {
    const loaded = await loadOrder(admin, command.orderId, now);
    if (!loaded) throw new OrdersQueryError(404, NOT_FOUND, "not_found");
    if (orderVersion(loaded.data) !== command.expectedVersion) throw new OrdersQueryError(409, "This order changed. Refresh to see the latest.", "version_conflict");
    const detail = buildOrderDetail(loaded.order, loaded.extras, loaded.schedule, now, admin);
    const blocked = detail.guardReasons.find((guard) => guard.action === command.action && guard.severity === "block");
    if (blocked || !detail.allowedActions.includes(command.action)) throw new OrdersQueryError(409, blocked?.message ?? "This action is not available.", blocked?.code ?? "blocked");
    const outcome = await applyCommand(admin, command, payload, loaded.order, now);
    if (outcome && "missing" in outcome) throw new OrdersQueryError(404, NOT_FOUND, "not_found");
    if (outcome && "conflict" in outcome) throw new OrdersQueryError(409, outcome.conflict, "conflict");
    await completeCommand(command.idempotencyKey);
    return readAdminOrderDetail(command.orderId);
  } catch (error) {
    await releaseCommand(command.idempotencyKey);
    throw error;
  }
}

async function applyCommand(admin: AdminIdentity, command: OrderCommand, payload: ReturnType<typeof commandPayload>, order: InboxOrder, now: Date) {
  const body = payload as Record<string, unknown>;
  if (command.action === "cancel") return cancelOrderV2(admin, command.orderId, command.expectedVersion, String(body.reason), now);
  if (command.action === "fee") return confirmOrderFee(admin, command.orderId, command.expectedVersion, Number(body.feeCentavos), body.destination === "to_rider" ? "to_rider" : "with_total", now);
  if (command.action === "pickup") return changeOrderToPickup(admin, command.orderId, command.expectedVersion, now);
  if (command.action === "rider") return recordOrderRider(admin, command.orderId, command.expectedVersion, { name: String(body.name ?? ""), plate: String(body.plate ?? ""), trackingUrl: String(body.trackingUrl ?? "") }, now);
  if (command.action === "note") return recordStaffNote(admin, command.orderId, command.expectedVersion, String(body.text), now);
  if (command.action === "payment" || command.action === "refund") {
    const method = body.method === "bank" || body.method === "gcash" || body.method === "cash" ? body.method : "cash";
    return recordV2Payment(admin, command.orderId, command.expectedVersion, {
      amountCentavos: Number(body.amountCentavos),
      method,
      reference: String(body.reference ?? ""),
      note: String(body.note ?? ""),
      kind: command.action === "refund" ? "refund" : "payment",
    }, now);
  }
  if (command.action === "void") return voidOrderPayment(admin, command.orderId, command.expectedVersion, String(body.paymentId), String(body.reason), now);
  const action = command.action === "customerEdit" || command.action === "requirePayment" ? "preferences"
    : command.action === "complete" ? "complete"
    : command.action === "delivered" ? "delivered"
    : command.action;
  const result = await transitionOrder({
    orderId: command.orderId,
    action,
    expectedStatus: order.status,
    ...(command.action === "customerEdit" ? { customerEditable: body.enabled === true } : {}),
    ...(command.action === "requirePayment" ? { requireFullPayment: body.enabled === true } : {}),
    ...(command.action === "revise" ? { branchId: body.branchId, slotId: body.slotId, selection: body.selection } : {}),
  }, admin, now) as { conflict?: string };
  if (result.conflict) return { conflict: result.conflict };
  return { ok: true as const };
}

async function loadScope(admin: AdminIdentity, branch: string | null, now: Date) {
  await prepareOrders(now);
  let settings;
  try { settings = await readBranchSettings(); }
  catch { throw new ProductError(503, "Orders couldn't be loaded. Please try again."); }
  const scope = resolveOrdersScope({ admin, branch, now, knownBranchIds: settings.branches.map((item) => item.id) });
  const [orders, schedule] = await Promise.all([
    readOrdersForDashboard().catch(() => { throw new ProductError(503, "Orders couldn't be loaded. Please try again."); }),
    readScheduleSettings().catch(() => null),
  ]);
  const visible = orders.filter((order) => scope.branchIds.includes(order.branchId) && (admin.role === "owner" || admin.branchIds.includes(order.branchId)));
  return { branchIds: scope.branchIds, orders: visible, names: new Map(settings.branches.map((item) => [item.id, item.name])), schedule };
}

async function loadOrder(admin: AdminIdentity, id: string, now: Date) {
  const record = await readOrderForAdmin(id);
  if (!record) return null;
  if (admin.role !== "owner" && !admin.branchIds.includes(record.order.branchId)) return null;
  let settings;
  try { settings = await readBranchSettings(); }
  catch { throw new ProductError(503, "Orders couldn't be loaded. Please try again."); }
  if (!settings.branches.some((branch) => branch.id === record.order.branchId)) return null;
  const branch = settings.branches.find((item) => item.id === record.order.branchId)!;
  const [schedule, shop, allocations] = await Promise.all([
    readScheduleSettings().catch(() => null),
    readShopSettings().catch(() => null),
    readAllocationMap().catch(() => null),
  ]);
  const extras: OrderExtras = {
    staffNotes: notesFrom(record.data.staffNotes),
    rider: riderFrom(record.data.rider),
    anonymizedAt: typeof record.data.anonymizedAt === "string" ? record.data.anonymizedAt : null,
    allocationBlocked: allocationOver(record.order, allocations),
    pickupEnabled: branch.pickupEnabled !== false,
    branchName: branch.name,
    mapUrl: branch.mapUrl?.startsWith("https://") ? branch.mapUrl : null,
    instagram: shop?.links.instagramDm || shop?.links.instagram || null,
    messenger: shop?.links.messenger || null,
  };
  void now;
  return { ...record, extras, schedule };
}

function allocationOver(order: InboxOrder, allocations: Awaited<ReturnType<typeof readAllocationMap>> | null) {
  if (!allocations) return false;
  const flavors = order.heldFlavors?.length ? order.heldFlavors : order.selection?.lines ?? [];
  return [...new Set(flavors.map((flavor) => flavor.productId))].some((productId) => {
    const entry = allocations.get(flavorCapacityKey(order.branchId, order.fulfillmentDate, productId));
    return !!entry && entry.limit != null && entry.held > entry.limit;
  });
}

function notesFrom(value: unknown): StaffNote[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((note) => {
    if (!note || typeof note !== "object") return [];
    const text = "text" in note ? String(note.text) : "";
    const at = "at" in note ? String(note.at) : "";
    const actorUid = "actorUid" in note ? String(note.actorUid) : "";
    return text && at && actorUid ? [{ text, at, actorUid }] : [];
  });
}

function riderFrom(value: unknown): RiderRecord | null {
  if (!value || typeof value !== "object") return null;
  const name = "name" in value ? String(value.name) : "";
  const plate = "plate" in value ? String(value.plate) : "";
  const trackingUrl = "trackingUrl" in value ? String(value.trackingUrl) : "";
  if (!name && !plate && !trackingUrl) return null;
  return { name, plate, trackingUrl };
}

async function prepareOrders(now: Date) {
  await expireDueHolds(now).catch((error) => console.error("Order hold expiry failed.", error));
  await anonymizeDueOrders(now).catch((error) => console.error("Order anonymization failed.", error));
}

async function claimCommand(admin: AdminIdentity, command: OrderCommand) {
  const ref = getServerFirebase().db.doc(`adminOrderCommands/${command.idempotencyKey}`);
  const payloadHash = createHash("sha256").update(JSON.stringify(command.payload ?? null)).digest("hex");
  const judge = async (saved: FirebaseFirestore.DocumentData) => {
    const same = saved.uid === admin.uid && saved.orderId === command.orderId && saved.action === command.action && saved.payloadHash === payloadHash;
    if (!same) throw new OrdersQueryError(409, "This save was already used.", "idempotency");
    if (saved.completed === true) return "replay" as const;
    const current = await readOrderForAdmin(command.orderId);
    if (current && orderVersion(current.data) !== command.expectedVersion) {
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
    await ref.create({ uid: admin.uid, orderId: command.orderId, action: command.action, payloadHash, pending: true, completed: false, at: new Date().toISOString() });
  } catch {
    const again = await ref.get();
    if (!again.exists) throw new OrdersQueryError(409, "This save was already used.", "idempotency");
    const judged = await judge(again.data() ?? {});
    if (judged === "replay") return judged;
    await ref.create({ uid: admin.uid, orderId: command.orderId, action: command.action, payloadHash, pending: true, completed: false, at: new Date().toISOString() });
  }
  return "claimed" as const;
}

async function completeCommand(key: string) {
  await getServerFirebase().db.doc(`adminOrderCommands/${key}`).set({ completed: true, pending: false }, { merge: true });
}

async function releaseCommand(key: string) {
  const ref = getServerFirebase().db.doc(`adminOrderCommands/${key}`);
  const snap = await ref.get();
  if (snap.exists && snap.data()?.completed !== true) await ref.delete().catch(() => undefined);
}

function invalid(message: string): never {
  throw new OrdersQueryError(400, message);
}
