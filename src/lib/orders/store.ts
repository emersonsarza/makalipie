import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import type { AdminIdentity } from "../admin/schemas";
import { selectionSchema, type Catalog, type Selection } from "../catalog/schema";
import { manilaDate, quoteSelection } from "../catalog/rules";
import { branchById, branchCatalog as branchCatalogFor, catalogForSelection, resolveBranch } from "../branches/schema";
import { readBranchSettings } from "../branches/store";
import { getServerFirebase } from "../firebase/server";
import { popupClaimsBranch } from "../popups/schema";
import { readPopupSettings } from "../popups/store";
import { readPublicMenu } from "../products/public";
import { ProductError } from "../products/store";
import { addCalendarDays, scheduleValidationError, slotsForDate } from "../scheduling/rules";
import { defaultScheduleSettings, scheduleSettingsSchema, type ScheduleSettings } from "../scheduling/schema";
import { readScheduleSettings } from "../scheduling/store";
import { allocationDaySchema, allocationRecordSchema, allocationSaveSchema, capacityOpen, flavorAvailabilityMessage, flavorCapacityKey, flavorHasRoom, flavorQuantities, type AllocationDay, type AllocationRecord, type AllocationSave } from "./allocation";
import { assertPaymentBeforePreparation, dailyCapacityKey, defaultOrderingPolicy, initialReservationDeadline } from "./policy";
import { inboxOrderSchema, orderActionSchema, orderEventSchema, orderRequestSchema, ordersVisibleTo, paymentRecordSchema, type InboxOrder, type OrderAction, type OrderEvent, type PaymentRecord } from "./schema";
import { orderStatusLabel } from "./status-display";

export class OrderAvailabilityError extends Error {
  constructor(
    message: string,
    public schedule: ScheduleSettings,
    public openDates: Record<string, string[]>,
    public openProducts: Record<string, Record<string, string[]>>,
    public serverNow: string,
  ) {
    super(message);
    this.name = "OrderAvailabilityError";
  }
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function allocationFromData(data: FirebaseFirestore.DocumentData | undefined): AllocationRecord | null {
  if (!data?.productId) return null;
  const parsed = allocationRecordSchema.safeParse({
    branchId: data.branchId,
    fulfillmentDate: data.fulfillmentDate,
    productId: data.productId,
    limit: data.limit === undefined ? null : data.limit,
    held: data.held ?? 0,
    version: data.version ?? 0,
  });
  return parsed.success ? parsed.data : null;
}

function allocationDayFromData(data: FirebaseFirestore.DocumentData | undefined): AllocationDay | null {
  if (!data) return null;
  const parsed = allocationDaySchema.safeParse({
    branchId: data.branchId,
    fulfillmentDate: data.fulfillmentDate,
    paused: data.paused === true,
    version: data.version ?? 0,
  });
  return parsed.success ? parsed.data : null;
}

export async function readAllocationMap() {
  const snap = await getServerFirebase().db.collection("allocations").get();
  const map = new Map<string, AllocationRecord>();
  for (const doc of snap.docs) {
    const parsed = allocationFromData(doc.data());
    if (parsed) map.set(flavorCapacityKey(parsed.branchId, parsed.fulfillmentDate, parsed.productId), parsed);
  }
  return map;
}

export async function readAllocationDayMap() {
  const snap = await getServerFirebase().db.collection("allocationDays").get();
  const map = new Map<string, AllocationDay>();
  for (const doc of snap.docs) {
    const parsed = allocationDayFromData(doc.data());
    if (parsed) map.set(dailyCapacityKey(parsed.branchId, parsed.fulfillmentDate), parsed);
  }
  return map;
}

export async function readOrderingAvailability(now = new Date()) {
  const [schedule, branches, allocations, days, menu] = await Promise.all([readScheduleSettings(), readBranchSettings(), readAllocationMap(), readAllocationDayMap(), readPublicMenu()]);
  const today = manilaDate(now);
  const openDates: Record<string, string[]> = {};
  const openProducts: Record<string, Record<string, string[]>> = {};
  for (const branch of branches.branches) {
    const flavorIds = menu.catalog ? [...new Set((["regular", "preorder"] as const).flatMap((mode) => branchCatalogFor(menu.catalog!, branches, branch.id, mode).products.map((product) => product.id)))] : [];
    const dates: string[] = [];
    const products: Record<string, string[]> = {};
    for (let offset = 0; offset <= schedule.bookingHorizonDays; offset += 1) {
      const date = addCalendarDays(today, offset);
      if (!slotsForDate(schedule, branch.id, date, now).length) continue;
      const paused = date === today && days.get(dailyCapacityKey(branch.id, date))?.paused === true;
      const ids = flavorIds
        .filter((productId) => capacityOpen(allocations.get(flavorCapacityKey(branch.id, date, productId)), date, today, paused))
        .sort();
      if (!ids.length) continue;
      products[date] = ids;
      dates.push(date);
    }
    openProducts[branch.id] = products;
    openDates[branch.id] = dates;
  }
  return { schedule, branches, openDates, openProducts, serverNow: now.toISOString() };
}

export async function saveBranchAllocations(input: AllocationSave, uid: string, now = new Date()) {
  const parsed = allocationSaveSchema.parse(input);
  const today = manilaDate(now);
  const horizonEnd = addCalendarDays(today, 365);
  const { db } = getServerFirebase();
  await db.runTransaction(async (tx) => {
    const refs = parsed.days.map((day) => db.doc(`allocations/${flavorCapacityKey(parsed.branchId, day.fulfillmentDate, parsed.productId)}`));
    const pauseRef = parsed.pause ? db.doc(`allocationDays/${dailyCapacityKey(parsed.branchId, today)}`) : null;
    const snaps = [];
    for (const ref of refs) snaps.push(await tx.get(ref));
    const pauseSnap = pauseRef ? await tx.get(pauseRef) : null;
    snaps.forEach((snap, index) => {
      const day = parsed.days[index];
      if (day.fulfillmentDate < today || day.fulfillmentDate > horizonEnd) throw new ProductError(400, "Choose a date inside the next year.");
      const version = snap.exists ? snap.data()?.version ?? 0 : 0;
      if (version !== day.version) throw new ProductError(409, "Allocation changed in another editor. Reload before saving again.");
      if (snap.exists && (!Number.isInteger(snap.data()?.held) || snap.data()?.held < 0)) throw new ProductError(409, "Allocation could not be saved.");
    });
    if (parsed.pause && pauseSnap) {
      const version = pauseSnap.exists ? pauseSnap.data()?.version ?? 0 : 0;
      if (version !== parsed.pause.version) throw new ProductError(409, "Allocation changed in another editor. Reload before saving again.");
    }
    snaps.forEach((snap, index) => {
      const day = parsed.days[index];
      tx.set(refs[index], {
        branchId: parsed.branchId,
        fulfillmentDate: day.fulfillmentDate,
        productId: parsed.productId,
        limit: day.limit,
        held: snap.exists ? snap.data()!.held : 0,
        version: day.version + 1,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: uid,
      });
    });
    if (parsed.pause && pauseRef && pauseSnap) {
      const version = pauseSnap.exists ? pauseSnap.data()?.version ?? 0 : 0;
      tx.set(pauseRef, {
        branchId: parsed.branchId,
        fulfillmentDate: today,
        paused: parsed.pause.paused,
        version: version + 1,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: uid,
      });
    }
    tx.create(db.collection("allocationEvents").doc(), {
      actorUid: uid,
      branchId: parsed.branchId,
      productId: parsed.productId,
      at: FieldValue.serverTimestamp(),
      days: parsed.days.map((day) => ({ fulfillmentDate: day.fulfillmentDate, limit: day.limit })),
      pause: parsed.pause ? { paused: parsed.pause.paused, fulfillmentDate: today } : null,
    });
  });
  const [allocations, pauses] = await Promise.all([readAllocationMap(), readAllocationDayMap()]);
  return { allocations, pauses };
}

const heldFlavorSchema = z.object({ productId: z.string().min(1), quantity: z.number().int().positive() }).strict();

function commercialFields(data: FirebaseFirestore.DocumentData) {
  const known = Number.isInteger(data.knownSubtotalCentavos) && data.knownSubtotalCentavos >= 0 ? data.knownSubtotalCentavos : 0;
  const quoteStatus = data.quoteStatus === "pending" || data.quoteStatus === "finalized" ? data.quoteStatus : "finalized";
  const finalTotalCentavos = quoteStatus === "pending"
    ? null
    : Number.isInteger(data.finalTotalCentavos) && data.finalTotalCentavos >= 0 ? data.finalTotalCentavos : known;
  const payments = Array.isArray(data.payments) ? data.payments.flatMap((payment) => {
    const parsed = paymentRecordSchema.safeParse(payment);
    return parsed.success ? [parsed.data] : [];
  }) : [];
  const signed = payments.reduce((total, payment) => total + (payment.kind === "refund" ? -payment.amountCentavos : payment.amountCentavos), 0);
  const netReceivedCentavos = Number.isInteger(data.netReceivedCentavos) && data.netReceivedCentavos >= 0
    ? data.netReceivedCentavos
    : Math.max(0, signed);
  const paymentStatus = data.paymentStatus === "unpaid" || data.paymentStatus === "partially_paid" || data.paymentStatus === "paid" || data.paymentStatus === "refunded"
    ? data.paymentStatus
    : "unpaid";
  return { quoteStatus, finalTotalCentavos, payments, netReceivedCentavos, paymentStatus };
}

function decodeInboxOrder(id: string, data: FirebaseFirestore.DocumentData): InboxOrder | null {
  const events = Array.isArray(data.events) ? data.events.flatMap((event) => {
    const parsed = orderEventSchema.safeParse(event);
    return parsed.success ? [parsed.data] : [];
  }) : [];
  const commercial = commercialFields(data);
  const selection = selectionSchema.safeParse(data.selection);
  const parsed = inboxOrderSchema.safeParse({
    id,
    orderNumber: data.orderNumber,
    branchId: data.branchId,
    fulfillmentDate: data.fulfillmentDate,
    slotId: data.slotId,
    slotLabel: data.slotLabel,
    customerName: data.customerName,
    contact: data.contact,
    address: data.address ?? "",
    delivery: data.delivery,
    ...(data.delivery === "lalamove" ? {
      deliveryEligibility: data.deliveryEligibility === "eligible" ? "eligible" as const : "pending" as const,
      deliveryFeeCentavos: Number.isInteger(data.deliveryFeeCentavos) && data.deliveryFeeCentavos >= 0 ? data.deliveryFeeCentavos : null,
    } : {}),
    payment: data.payment,
    catalogMode: data.catalogMode === "preorder" ? "preorder" as const : "regular" as const,
    preparationDays: Number.isInteger(data.preparationDays) && data.preparationDays > 0 ? data.preparationDays : 0,
    notes: data.notes ?? "",
    lines: data.lines ?? [],
    addonLines: data.addonLines ?? [],
    ...(selection.success ? { selection: selection.data } : {}),
    knownSubtotalCentavos: data.knownSubtotalCentavos ?? 0,
    ...commercial,
    deadline: data.deadline,
    submittedAt: data.submittedAt,
    ...(typeof data.processingStartedAt === "string" ? { processingStartedAt: data.processingStartedAt } : {}),
    status: data.status,
    events,
    ...(typeof data.sourceOrderNumber === "string" && data.sourceOrderNumber ? { sourceOrderNumber: data.sourceOrderNumber } : {}),
  });
  return parsed.success ? parsed.data : null;
}

function guestStatusCopy(status: InboxOrder["status"], delivery: InboxOrder["delivery"]) {
  const courier = delivery === "lalamove";
  const statusLabel = orderStatusLabel(status, delivery);
  if (status === "processing") return { statusLabel, message: courier ? "Staff are reviewing this address and the delivery fee. The hold stays in place." : "Staff are reviewing this request. The hold stays in place." };
  if (status === "confirmed") return { statusLabel, message: courier ? "This delivery is approved. Payment is arranged separately." : "This request is approved. Payment is arranged separately." };
  if (status === "preparing") return { statusLabel, message: courier ? "The bakery is preparing this delivery." : "The bakery is preparing this pickup." };
  if (status === "ready") return { statusLabel, message: courier ? "This order is ready for delivery." : "This order is ready for pickup." };
  if (status === "completed") return { statusLabel, message: courier ? "This delivery is complete." : "This pickup is complete." };
  if (status === "expired") return { statusLabel, message: "This hold ended." };
  if (status === "cancelled") return { statusLabel, message: courier ? "This delivery was not approved." : "This request was not approved." };
  if (status === "requested") return { statusLabel, message: courier ? "Staff still need to confirm this address and the delivery fee. Delivery is not confirmed yet." : "Staff still need to confirm this request. Approval is not complete." };
  return { statusLabel, message: "This request is no longer waiting for approval." };
}

function guestPaymentLabel(status: InboxOrder["paymentStatus"]) {
  if (status === "paid") return "Payment recorded";
  if (status === "partially_paid") return "Part of the payment is recorded";
  if (status === "refunded") return "Payment was refunded";
  return "Payment is not recorded yet";
}

function orderIsDue(data: FirebaseFirestore.DocumentData, now: Date) {
  return data.status === "requested" && typeof data.deadline === "string" && new Date(data.deadline).getTime() <= now.getTime();
}

async function releaseHeldFlavors(tx: FirebaseFirestore.Transaction, data: FirebaseFirestore.DocumentData) {
  if (data.capacityReleased === true) return;
  if (data.status !== "requested" && data.status !== "processing" && data.status !== "confirmed") return;
  const holds = Array.isArray(data.heldFlavors) ? data.heldFlavors.flatMap((flavor) => {
    const parsed = heldFlavorSchema.safeParse(flavor);
    return parsed.success ? [parsed.data] : [];
  }) : [];
  const { db } = getServerFirebase();
  const refs = holds.map((flavor) => db.doc(`allocations/${flavorCapacityKey(String(data.branchId), String(data.fulfillmentDate), flavor.productId)}`));
  const snaps = [];
  for (const ref of refs) snaps.push(await tx.get(ref));
  snaps.forEach((snap, index) => {
    if (!snap.exists) return;
    const held = snap.data()?.held;
    const current = Number.isInteger(held) && held > 0 ? held : 0;
    tx.update(snap.ref, { held: Math.max(0, current - holds[index].quantity) });
  });
}

function withEvent(data: FirebaseFirestore.DocumentData, event: OrderEvent) {
  const events = Array.isArray(data.events) ? data.events.flatMap((item) => {
    const parsed = orderEventSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  }) : [];
  return [...events, event];
}

async function settleOrder(id: string, now: Date, actorUid: string, action: OrderEvent["action"], expectedStatus: InboxOrder["status"] | null, reason?: string) {
  const { db } = getServerFirebase();
  const orderRef = db.doc(`orders/${id}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return { missing: true as const };
    const data = snap.data()!;
    const due = orderIsDue(data, now);
    const expiring = data.status === "requested" && due && (action === "expire" || action === "processing" || action === "reject");
    if (!expiring && expectedStatus && data.status !== expectedStatus) {
      return { conflict: "This request changed. Reload it and try again.", order: decodeInboxOrder(id, data) };
    }
    if (action === "preparing" || action === "ready" || action === "complete") {
      return advanceFulfillment(tx, orderRef, id, data, now, actorUid, action);
    }
    if (action === "reject" && data.status !== "requested" && data.status !== "processing" && data.status !== "confirmed") {
      return { conflict: "This request changed. Reload it and try again.", order: decodeInboxOrder(id, data) };
    }
    if (data.status !== "requested" && data.status !== "processing" && data.status !== "confirmed" && action !== "expire") {
      return { conflict: "This request changed. Reload it and try again.", order: decodeInboxOrder(id, data) };
    }
    if (action === "expire" && !due) return { order: decodeInboxOrder(id, data) };
    if (action === "approve" && data.status !== "processing") {
      return { conflict: "This request changed. Reload it and try again.", order: decodeInboxOrder(id, data) };
    }
    if (action === "approve" && data.delivery === "lalamove" && data.deliveryEligibility !== "eligible") {
      return { conflict: "Confirm the address and delivery fee before approval.", order: decodeInboxOrder(id, data) };
    }
    const nextStatus = expiring || action === "expire" ? "expired" : action === "processing" ? "processing" : action === "approve" ? "confirmed" : "cancelled";
    const releasing = nextStatus === "expired" || nextStatus === "cancelled";
    if (releasing) await releaseHeldFlavors(tx, data);
    const event: OrderEvent = {
      at: now.toISOString(),
      actorUid: expiring || action === "expire" ? "system" : actorUid,
      action: expiring || action === "expire" ? "expire" : action,
      previousStatus: data.status as OrderEvent["previousStatus"],
      status: nextStatus,
      ...(reason && !expiring && action === "reject" ? { reason } : {}),
    };
    const next = {
      status: nextStatus,
      ...(releasing ? { capacityReleased: true } : {}),
      ...(nextStatus === "processing" ? { processingStartedAt: now.toISOString() } : {}),
      events: withEvent(data, event),
    };
    tx.update(orderRef, next);
    const order = decodeInboxOrder(id, { ...data, ...next });
    if (expiring && action !== "expire") return { conflict: "That hold already expired.", order };
    return { order };
  });
}

function advanceFulfillment(
  tx: FirebaseFirestore.Transaction,
  orderRef: FirebaseFirestore.DocumentReference,
  id: string,
  data: FirebaseFirestore.DocumentData,
  now: Date,
  actorUid: string,
  action: "preparing" | "ready" | "complete",
) {
  const pickup = data.delivery === "pickup";
  if (action === "preparing" && data.status !== "confirmed") {
    return { conflict: "This request changed. Reload it and try again.", order: decodeInboxOrder(id, data) };
  }
  if ((action === "ready" || action === "complete") && !pickup) {
    return { conflict: "Pickup progress is for pickup requests.", order: decodeInboxOrder(id, data) };
  }
  if (action === "ready" && data.status !== "preparing") {
    return { conflict: "This request changed. Reload it and try again.", order: decodeInboxOrder(id, data) };
  }
  if (action === "complete" && data.status !== "ready") {
    return { conflict: "This request changed. Reload it and try again.", order: decodeInboxOrder(id, data) };
  }
  if (action === "preparing") {
    const commercial = commercialFields(data);
    try {
      assertPaymentBeforePreparation({
        quoteStatus: commercial.quoteStatus,
        paymentStatus: commercial.paymentStatus,
        finalTotalCentavos: commercial.finalTotalCentavos,
        netReceivedCentavos: commercial.netReceivedCentavos,
      });
    } catch (error) {
      return { conflict: error instanceof Error ? error.message : "Finalize the total and verify full payment before preparation.", order: decodeInboxOrder(id, data) };
    }
  }
  const nextStatus = action === "preparing" ? "preparing" : action === "ready" ? "ready" : "completed";
  const event: OrderEvent = {
    at: now.toISOString(),
    actorUid,
    action,
    previousStatus: data.status as OrderEvent["previousStatus"],
    status: nextStatus,
  };
  const next = { status: nextStatus, events: withEvent(data, event) };
  tx.update(orderRef, next);
  return { order: decodeInboxOrder(id, { ...data, ...next }) };
}

async function recordOrderPayment(input: OrderAction, actorUid: string, now: Date) {
  const { db } = getServerFirebase();
  const orderRef = db.doc(`orders/${input.orderId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return { missing: true as const };
    const data = snap.data()!;
    if (data.status !== "confirmed" || data.status !== input.expectedStatus) {
      return { conflict: data.status === "confirmed" ? "This request changed. Reload it and try again." : "Record payment after the request is approved.", order: decodeInboxOrder(input.orderId, data) };
    }
    const commercial = commercialFields(data);
    if (commercial.payments.length > 0 || commercial.paymentStatus === "paid") {
      return { conflict: "This request already has a payment recorded.", order: decodeInboxOrder(input.orderId, data) };
    }
    if (commercial.quoteStatus !== "finalized" || commercial.finalTotalCentavos === null) {
      return { conflict: "Finalize the total and verify full payment before preparation.", order: decodeInboxOrder(input.orderId, data) };
    }
    const remaining = commercial.finalTotalCentavos - commercial.netReceivedCentavos;
    if (remaining <= 0) {
      return { conflict: "This request is already paid.", order: decodeInboxOrder(input.orderId, data) };
    }
    if (input.amountCentavos !== undefined && input.amountCentavos !== remaining) {
      return { conflict: "Record the full remaining total.", order: decodeInboxOrder(input.orderId, data) };
    }
    const payment: PaymentRecord = {
      at: now.toISOString(),
      actorUid,
      method: input.method ?? "cash",
      amountCentavos: remaining,
    };
    const next = {
      payments: [...commercial.payments, payment],
      paymentStatus: "paid" as const,
      netReceivedCentavos: commercial.finalTotalCentavos,
      quoteStatus: commercial.quoteStatus,
      finalTotalCentavos: commercial.finalTotalCentavos,
    };
    tx.update(orderRef, next);
    return { order: decodeInboxOrder(input.orderId, { ...data, ...next }) };
  });
}

export async function expireDueHolds(now = new Date()) {
  const snap = await getServerFirebase().db.collection("orders").where("status", "==", "requested").limit(100).get();
  for (const doc of snap.docs) {
    if (!orderIsDue(doc.data(), now)) continue;
    await settleOrder(doc.id, now, "system", "expire", "requested");
  }
}

const revisableStatuses = new Set(["requested", "processing", "confirmed", "preparing", "ready"]);

function paymentStatusFor(net: number, total: number): InboxOrder["paymentStatus"] {
  if (net <= 0) return "unpaid";
  if (net < total) return "partially_paid";
  return "paid";
}

function pricedTotal(data: FirebaseFirestore.DocumentData, knownSubtotalCentavos: number, itemQuotePending: boolean) {
  const awaitingFee = data.delivery === "lalamove" && data.deliveryEligibility !== "eligible";
  if (itemQuotePending || awaitingFee) return { quoteStatus: "pending" as const, finalTotalCentavos: null as number | null };
  const fee = data.delivery === "lalamove" && Number.isInteger(data.deliveryFeeCentavos) && data.deliveryFeeCentavos >= 0 ? data.deliveryFeeCentavos : 0;
  return { quoteStatus: "finalized" as const, finalTotalCentavos: knownSubtotalCentavos + fee };
}

function pesosLabel(centavos: number | null) {
  return centavos === null ? "Total to confirm" : `₱${(centavos / 100).toFixed(2)}`;
}

function revisedSelection(stored: Selection, requested: Selection): Selection | "empty" | "unknown" {
  if (requested.lines.length < 1) return "empty";
  const original = new Map(stored.lines.map((line) => [`${line.productId}:${line.variantId}`, line]));
  const seen = new Set<string>();
  const lines = [];
  for (const line of requested.lines) {
    const key = `${line.productId}:${line.variantId}`;
    const prior = original.get(key);
    if (!prior || seen.has(key)) return "unknown";
    seen.add(key);
    lines.push({ ...prior, quantity: line.quantity });
  }
  return { date: requested.date, lines, addons: stored.addons };
}

function heldFlavorList(data: FirebaseFirestore.DocumentData) {
  return Array.isArray(data.heldFlavors) ? data.heldFlavors.flatMap((flavor) => {
    const parsed = heldFlavorSchema.safeParse(flavor);
    return parsed.success ? [parsed.data] : [];
  }) : [];
}

async function reviseOrder(input: OrderAction, admin: AdminIdentity, now: Date) {
  const { db } = getServerFirebase();
  const orderRef = db.doc(`orders/${input.orderId}`);
  const previewSnap = await orderRef.get();
  if (!previewSnap.exists) return { missing: true as const };
  const preview = decodeInboxOrder(input.orderId, previewSnap.data()!);
  if (!preview?.selection || !input.selection || !input.branchId || !input.slotId) {
    return { conflict: preview?.selection ? "Choose the pies to keep." : "This request was saved before item changes.", order: preview };
  }
  if (!revisableStatuses.has(preview.status) || preview.status !== input.expectedStatus) {
    return { conflict: "This request changed. Reload it and try again.", order: preview };
  }
  if (input.branchId !== preview.branchId && admin.role !== "owner") {
    throw new ProductError(403, "Only an owner can move a request to another branch.");
  }
  const nextSelection = revisedSelection(preview.selection, input.selection);
  if (nextSelection === "empty") return { conflict: "Keep at least one pie on this request.", order: preview };
  if (nextSelection === "unknown") return { conflict: "Only the pies already on this request can change.", order: preview };
  const today = manilaDate(now);
  const { catalog } = await readPublicMenu();
  if (!catalog) throw new ProductError(503, "The menu is temporarily unavailable. Please try again.");
  const branchSettings = await readBranchSettings();
  const destination = branchSettings.branches.find((branch) => branch.id === input.branchId && branch.visible);
  if (!destination) return { conflict: "Choose a branch that is open for requests.", order: preview };
  if (preview.delivery === "lalamove" && !destination.deliveryEnabled) {
    return { conflict: "Delivery is not available from this branch.", order: preview };
  }
  const mode = preview.catalogMode === "preorder" ? "preorder" as const : "regular" as const;
  const branchCatalog = branchCatalogFor(catalog, branchSettings, input.branchId, mode);
  const quote = quoteSelection(branchCatalog, nextSelection, today);
  if (quote.errors.length) return { conflict: quote.errors.join(" "), order: preview };
  const nextHolds = flavorQuantities(nextSelection.lines);
  const flavorNames = new Map(branchCatalog.products.map((product) => [product.id, product.name]));
  const branchId = input.branchId;
  const slotId = input.slotId;

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return { missing: true as const };
    const data = snap.data()!;
    const order = decodeInboxOrder(input.orderId, data);
    if (!order?.selection || order.status !== input.expectedStatus || !revisableStatuses.has(order.status)) {
      return { conflict: "This request changed. Reload it and try again.", order };
    }
    if (JSON.stringify(order.selection) !== JSON.stringify(preview.selection) || order.branchId !== preview.branchId || order.fulfillmentDate !== preview.fulfillmentDate) {
      return { conflict: "This request changed. Reload it and try again.", order };
    }
    const scheduleSnap = await tx.get(db.doc("settings/orderingSchedule"));
    const daySnap = await tx.get(db.doc(`allocationDays/${dailyCapacityKey(branchId, nextSelection.date)}`));
    const { updatedAt: _at, updatedBy: _by, ...storedSchedule } = scheduleSnap.exists ? scheduleSnap.data()! : {};
    void _at; void _by;
    const liveSchedule = scheduleSnap.exists ? scheduleSettingsSchema.parse(storedSchedule) : defaultScheduleSettings();
    const deltas = new Map<string, { branchId: string; fulfillmentDate: string; productId: string; delta: number }>();
    const addDelta = (holdBranch: string, date: string, productId: string, delta: number) => {
      const key = flavorCapacityKey(holdBranch, date, productId);
      const current = deltas.get(key) ?? { branchId: holdBranch, fulfillmentDate: date, productId, delta: 0 };
      current.delta += delta;
      deltas.set(key, current);
    };
    for (const flavor of heldFlavorList(data)) addDelta(String(data.branchId), String(data.fulfillmentDate), flavor.productId, -flavor.quantity);
    for (const flavor of nextHolds) addDelta(branchId, nextSelection.date, flavor.productId, flavor.quantity);
    const deltaList = [...deltas.values()].filter((item) => item.delta !== 0);
    const refs = deltaList.map((item) => db.doc(`allocations/${flavorCapacityKey(item.branchId, item.fulfillmentDate, item.productId)}`));
    const snaps = [];
    for (const ref of refs) snaps.push(await tx.get(ref));
    const liveError = scheduleValidationError(liveSchedule, branchId, nextSelection.date, slotId, now);
    const slot = slotsForDate(liveSchedule, branchId, nextSelection.date, now).find((item) => item.id === slotId);
    if (liveError || !slot) {
      return { conflict: liveError || "That date or time slot is no longer available. Choose another available date and time; your cart has been kept.", order };
    }
    const paused = nextSelection.date === today && daySnap.data()?.paused === true;
    const short: string[] = [];
    snaps.forEach((allocation, index) => {
      const item = deltaList[index];
      if (item.delta <= 0) return;
      const entry = allocationFromData(allocation.data());
      if (!flavorHasRoom(entry, item.delta, item.fulfillmentDate, today, item.fulfillmentDate === nextSelection.date && paused)) {
        short.push(flavorNames.get(item.productId) ?? item.productId);
      }
    });
    if (short.length) return { conflict: flavorAvailabilityMessage(short), order };
    const commercial = commercialFields(data);
    const quoted = pricedTotal(data, quote.knownSubtotalCentavos, quote.quoteRequired);
    const changeRows: { field: string; from: string; to: string }[] = [
      { field: "Branch", from: order.branchId, to: branchId },
      { field: "Date", from: order.fulfillmentDate, to: nextSelection.date },
      { field: "Time", from: order.slotLabel, to: slot.label },
      { field: "Pies", from: String(heldFlavorList(data).reduce((total, flavor) => total + flavor.quantity, 0)), to: String(nextHolds.reduce((total, flavor) => total + flavor.quantity, 0)) },
      { field: "Total", from: pesosLabel(commercial.finalTotalCentavos), to: pesosLabel(quoted.finalTotalCentavos) },
    ];
    const changes = changeRows.filter((change) => change.from !== change.to);
    if (changes.length === 0) return { order };
    snaps.forEach((allocation, index) => {
      const item = deltaList[index];
      const current = Number.isInteger(allocation.data()?.held) && allocation.data()!.held > 0 ? allocation.data()!.held : 0;
      const nextHeld = Math.max(0, current + item.delta);
      if (allocation.exists) tx.update(allocation.ref, { held: nextHeld });
      else if (item.delta > 0) tx.set(allocation.ref, { branchId: item.branchId, fulfillmentDate: item.fulfillmentDate, productId: item.productId, limit: null, held: nextHeld, version: 0 });
    });
    const event: OrderEvent = {
      at: now.toISOString(),
      actorUid: admin.uid,
      action: "revise",
      previousStatus: order.status,
      status: order.status,
      changes,
    };
    const next = {
      branchId,
      fulfillmentDate: nextSelection.date,
      slotId: slot.id,
      slotLabel: slot.label,
      selection: nextSelection,
      lines: quote.lines,
      addonLines: quote.addonLines,
      heldFlavors: nextHolds,
      preparationDays: quote.preparationDays,
      knownSubtotalCentavos: quote.knownSubtotalCentavos,
      itemQuotePending: quote.quoteRequired,
      quoteStatus: quoted.quoteStatus,
      finalTotalCentavos: quoted.finalTotalCentavos,
      paymentStatus: quoted.finalTotalCentavos === null ? commercial.paymentStatus : paymentStatusFor(commercial.netReceivedCentavos, quoted.finalTotalCentavos),
      events: withEvent(data, event),
    };
    tx.update(orderRef, next);
    return { order: decodeInboxOrder(input.orderId, { ...data, ...next }) };
  });
}

async function recordSettlement(input: OrderAction, actorUid: string, now: Date) {
  const { db } = getServerFirebase();
  const orderRef = db.doc(`orders/${input.orderId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return { missing: true as const };
    const data = snap.data()!;
    const order = decodeInboxOrder(input.orderId, data);
    if (!order || !revisableStatuses.has(data.status) || data.status !== input.expectedStatus) {
      return { conflict: "This request changed. Reload it and try again.", order };
    }
    const commercial = commercialFields(data);
    if (commercial.quoteStatus !== "finalized" || commercial.finalTotalCentavos === null) {
      return { conflict: "This request does not have a final total.", order };
    }
    const balance = commercial.finalTotalCentavos - commercial.netReceivedCentavos;
    if (balance === 0) return { conflict: "Nothing is due on this request.", order };
    const kind = balance > 0 ? "payment" as const : "refund" as const;
    if (input.kind !== kind || !input.method) {
      return { conflict: balance > 0 ? "Record the amount due." : "Record the refund due.", order };
    }
    const amount = Math.abs(balance);
    if (input.amountCentavos !== amount) {
      return { conflict: balance > 0 ? "Record the exact amount due." : "Record the exact refund due.", order };
    }
    const nextNet = kind === "refund" ? commercial.netReceivedCentavos - amount : commercial.netReceivedCentavos + amount;
    const payment: PaymentRecord = { at: now.toISOString(), actorUid, method: input.method, amountCentavos: amount, kind };
    const next = {
      payments: [...commercial.payments, payment],
      netReceivedCentavos: nextNet,
      paymentStatus: paymentStatusFor(nextNet, commercial.finalTotalCentavos),
      events: withEvent(data, {
        at: payment.at,
        actorUid,
        action: "settle" as const,
        previousStatus: order.status,
        status: order.status,
        reason: kind === "refund" ? "Refund due" : "Amount due",
      }),
    };
    tx.update(orderRef, next);
    return { order: decodeInboxOrder(input.orderId, { ...data, ...next }) };
  });
}

async function recordDeliveryFee(input: OrderAction, actorUid: string, now: Date) {
  const { db } = getServerFirebase();
  const orderRef = db.doc(`orders/${input.orderId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return { missing: true as const };
    const data = snap.data()!;
    const order = decodeInboxOrder(input.orderId, data);
    if (!order || data.delivery !== "lalamove" || (data.status !== "requested" && data.status !== "processing" && data.status !== "confirmed") || data.status !== input.expectedStatus) {
      return { conflict: "This request changed. Reload it and try again.", order };
    }
    if (input.feeCentavos === undefined) return { conflict: "Record the delivery fee.", order };
    const itemQuotePending = data.itemQuotePending === true;
    const known = Number.isInteger(data.knownSubtotalCentavos) && data.knownSubtotalCentavos >= 0 ? data.knownSubtotalCentavos : 0;
    const finalTotalCentavos = itemQuotePending ? null : known + input.feeCentavos;
    const commercial = commercialFields(data);
    const next = {
      deliveryEligibility: "eligible" as const,
      deliveryFeeCentavos: input.feeCentavos,
      quoteStatus: finalTotalCentavos === null ? "pending" as const : "finalized" as const,
      finalTotalCentavos,
      paymentStatus: finalTotalCentavos === null ? commercial.paymentStatus : paymentStatusFor(commercial.netReceivedCentavos, finalTotalCentavos),
      events: withEvent(data, {
        at: now.toISOString(),
        actorUid,
        action: "deliverable" as const,
        previousStatus: order.status,
        status: order.status,
        changes: [{ field: "Delivery fee", from: Number.isInteger(data.deliveryFeeCentavos) ? pesosLabel(data.deliveryFeeCentavos) : "Not recorded", to: pesosLabel(input.feeCentavos) }],
      }),
    };
    tx.update(orderRef, next);
    return { order: decodeInboxOrder(input.orderId, { ...data, ...next }) };
  });
}

async function markDelivered(input: OrderAction, actorUid: string, now: Date) {
  const { db } = getServerFirebase();
  const orderRef = db.doc(`orders/${input.orderId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return { missing: true as const };
    const data = snap.data()!;
    const order = decodeInboxOrder(input.orderId, data);
    if (!order || data.delivery !== "lalamove" || data.status !== "preparing" || data.status !== input.expectedStatus) {
      return { conflict: data.delivery === "lalamove" ? "This request changed. Reload it and try again." : "Pickup progress is for pickup requests.", order };
    }
    const next = {
      status: "completed" as const,
      events: withEvent(data, {
        at: now.toISOString(),
        actorUid,
        action: "delivered" as const,
        previousStatus: "preparing" as const,
        status: "completed" as const,
      }),
    };
    tx.update(orderRef, next);
    return { order: decodeInboxOrder(input.orderId, { ...data, ...next }) };
  });
}

export async function transitionOrder(raw: unknown, admin: AdminIdentity, now = new Date()) {
  const input = orderActionSchema.parse(raw) as OrderAction;
  const { db } = getServerFirebase();
  const snap = await db.doc(`orders/${input.orderId}`).get();
  if (!snap.exists) throw new ProductError(404, "This request is no longer available.");
  const branchId = String(snap.data()?.branchId ?? "");
  if (admin.role !== "owner" && !admin.branchIds.some((id) => id === branchId)) {
    throw new ProductError(403, "This request is not in your branch.");
  }
  const settled = input.action === "pay"
    ? await recordOrderPayment(input, admin.uid, now)
    : input.action === "revise"
      ? await reviseOrder(input, admin, now)
      : input.action === "settle"
        ? await recordSettlement(input, admin.uid, now)
        : input.action === "deliverable"
          ? await recordDeliveryFee(input, admin.uid, now)
          : input.action === "delivered"
            ? await markDelivered(input, admin.uid, now)
            : input.action === "review"
              ? await reviewClosedOrder(input, now)
              : input.action === "reopen"
                ? await reopenOrder({ orderId: input.orderId, reopenKey: input.reopenKey ?? "", expectedStatus: input.expectedStatus, actorUid: admin.uid }, now)
                : input.action === "reorder"
                  ? await reorderClosedOrder(input, admin, now)
                  : await settleOrder(input.orderId, now, admin.uid, input.action, input.expectedStatus, input.reason);
  if (!("order" in settled) || !settled.order || ("missing" in settled && settled.missing)) throw new ProductError(404, "This request is no longer available.");
  const review = "review" in settled ? settled.review : undefined;
  if ("conflict" in settled && settled.conflict) return { order: settled.order, conflict: settled.conflict, review };
  return { order: settled.order, review };
}

const recoverableStatuses = new Set(["expired", "cancelled"]);

export type RecoveryReview = {
  clear: boolean;
  blockers: string[];
  priceChanges: { from: string; to: string }[];
  unavailableLines: { productId: string; variantId: string; label: string }[];
  previousSubtotalCentavos: number;
  nextSubtotalCentavos: number | null;
};

export type RecoveryDraft = {
  orderNumber: string;
  catalogMode: "regular" | "preorder";
  branchId: InboxOrder["branchId"];
  slotId: string;
  delivery: InboxOrder["delivery"];
  address: string;
  name: string;
  contact: string;
  payment: InboxOrder["payment"];
  notes: string;
  selection: Selection;
  review: RecoveryReview;
};

function lineHead(line: string) {
  return line.split("\n")[0] ?? line;
}

function addBlocker(blockers: string[], message: string) {
  if (!blockers.includes(message)) blockers.push(message);
}

function assessRecovery(input: {
  catalog: Catalog;
  branches: Awaited<ReturnType<typeof readBranchSettings>>;
  schedule: ScheduleSettings;
  branchId: InboxOrder["branchId"];
  slotId: string;
  delivery: InboxOrder["delivery"];
  catalogMode: "regular" | "preorder";
  selection: Selection;
  storedLines: string[];
  storedSelection?: Selection;
  previousSubtotalCentavos: number;
  allocations: Map<string, AllocationRecord | null>;
  paused: boolean;
  now: Date;
}): RecoveryReview & { quote: ReturnType<typeof quoteSelection> | null; slot: { id: string; label: string } | null; heldFlavors: { productId: string; quantity: number }[] } {
  const blockers: string[] = [];
  const unavailableLines: RecoveryReview["unavailableLines"] = [];
  const priceChanges: RecoveryReview["priceChanges"] = [];
  const today = manilaDate(input.now);
  const scheduleError = scheduleValidationError(input.schedule, input.branchId, input.selection.date, input.slotId, input.now);
  const slot = slotsForDate(input.schedule, input.branchId, input.selection.date, input.now).find((item) => item.id === input.slotId) ?? null;
  if (scheduleError || input.paused || !slot) {
    addBlocker(blockers, scheduleError || "That date or time slot is no longer available. Choose another available date and time; your cart has been kept.");
  }
  if (input.delivery === "lalamove" && !branchById(input.branches, input.branchId).deliveryEnabled) {
    addBlocker(blockers, "Delivery is not available from this branch. Pickup is still available.");
  }
  const scoped = catalogForSelection(input.catalog, input.branches, input.branchId, input.selection.lines, input.catalogMode);
  let quote: ReturnType<typeof quoteSelection> | null = null;
  if ("error" in scoped) {
    addBlocker(blockers, scoped.error ?? "Regular pies and pre-order pies need separate requests.");
  } else {
    for (const line of input.selection.lines) {
      const product = scoped.catalog.products.find((item) => item.id === line.productId);
      const variant = product?.variants.find((item) => item.id === line.variantId);
      if (product && variant) continue;
      const storedIndex = input.storedSelection?.lines.findIndex((item) => item.productId === line.productId && item.variantId === line.variantId) ?? -1;
      const stored = storedIndex >= 0 ? input.storedLines[storedIndex] : undefined;
      unavailableLines.push({
        productId: line.productId,
        variantId: line.variantId,
        label: stored ? lineHead(stored) : `${line.productId} · ${line.variantId}`,
      });
    }
    if (unavailableLines.length) addBlocker(blockers, "A selected product or size is no longer available.");
    quote = quoteSelection(scoped.catalog, input.selection, today);
    for (const error of quote.errors) addBlocker(blockers, error);
    quote.lines.forEach((line, index) => {
      const selected = input.selection.lines[index];
      if (!selected || unavailableLines.some((item) => item.productId === selected.productId && item.variantId === selected.variantId)) return;
      const storedIndex = input.storedSelection?.lines.findIndex((item) => item.productId === selected.productId && item.variantId === selected.variantId) ?? index;
      const stored = input.storedLines[storedIndex];
      if (stored && lineHead(stored) !== lineHead(line)) priceChanges.push({ from: lineHead(stored), to: lineHead(line) });
    });
    if (quote.errors.length === 0 && quote.knownSubtotalCentavos !== input.previousSubtotalCentavos && priceChanges.length === 0) {
      priceChanges.push({ from: pesosLabel(input.previousSubtotalCentavos), to: pesosLabel(quote.knownSubtotalCentavos) });
    }
    if (!scheduleError && !input.paused && slot) {
      const heldFlavors = flavorQuantities(input.selection.lines);
      const names = new Map(scoped.catalog.products.map((product) => [product.id, product.name]));
      const short = heldFlavors.flatMap((flavor) => {
        const entry = input.allocations.get(flavorCapacityKey(input.branchId, input.selection.date, flavor.productId)) ?? null;
        return flavorHasRoom(entry, flavor.quantity, input.selection.date, today, false) ? [] : [names.get(flavor.productId) ?? flavor.productId];
      });
      if (short.length) addBlocker(blockers, flavorAvailabilityMessage(short));
    }
  }
  const heldFlavors = quote && quote.errors.length === 0 ? flavorQuantities(input.selection.lines) : [];
  return {
    clear: blockers.length === 0,
    blockers,
    priceChanges,
    unavailableLines,
    previousSubtotalCentavos: input.previousSubtotalCentavos,
    nextSubtotalCentavos: quote && quote.errors.length === 0 ? quote.knownSubtotalCentavos : null,
    quote,
    slot,
    heldFlavors,
  };
}

async function recoveryContext(now: Date) {
  const [menu, branches, schedule, allocations, days] = await Promise.all([readPublicMenu(), readBranchSettings(), readScheduleSettings(), readAllocationMap(), readAllocationDayMap()]);
  if (!menu.catalog) throw new ProductError(503, "The menu is temporarily unavailable. Please try again.");
  return { catalog: menu.catalog, branches, schedule, allocations, days, now };
}

function reviewSubject(order: InboxOrder, proposal?: { branchId?: string; slotId?: string; selection?: Selection }) {
  const selection = proposal?.selection ?? order.selection;
  if (!selection) return null;
  return {
    branchId: (proposal?.branchId ?? order.branchId) as InboxOrder["branchId"],
    slotId: proposal?.slotId ?? order.slotId,
    delivery: order.delivery,
    catalogMode: order.catalogMode === "preorder" ? "preorder" as const : "regular" as const,
    selection,
    storedLines: order.lines,
    storedSelection: order.selection,
    previousSubtotalCentavos: order.knownSubtotalCentavos,
  };
}

export async function reviewRecovery(order: InboxOrder, now = new Date(), proposal?: { branchId?: string; slotId?: string; selection?: Selection }) {
  const subject = reviewSubject(order, proposal);
  if (!subject) {
    return { clear: false, blockers: ["This request was saved before item changes."], priceChanges: [], unavailableLines: [], previousSubtotalCentavos: order.knownSubtotalCentavos, nextSubtotalCentavos: null } satisfies RecoveryReview;
  }
  const context = await recoveryContext(now);
  const paused = subject.selection.date === manilaDate(now) && context.days.get(dailyCapacityKey(subject.branchId, subject.selection.date))?.paused === true;
  const assessed = assessRecovery({ ...subject, catalog: context.catalog, branches: context.branches, schedule: context.schedule, allocations: context.allocations, paused, now });
  return {
    clear: assessed.clear,
    blockers: assessed.blockers,
    priceChanges: assessed.priceChanges,
    unavailableLines: assessed.unavailableLines,
    previousSubtotalCentavos: assessed.previousSubtotalCentavos,
    nextSubtotalCentavos: assessed.nextSubtotalCentavos,
  } satisfies RecoveryReview;
}

async function orderByToken(token: string) {
  const snap = await getServerFirebase().db.collection("orders").where("accessTokenHash", "==", tokenHash(token)).limit(1).get();
  return snap.docs[0] ?? null;
}

export async function readRecoveryDraft(token: string, now = new Date()): Promise<RecoveryDraft | null> {
  await expireDueHolds(now);
  const doc = await orderByToken(token);
  if (!doc) return null;
  const fresh = orderIsDue(doc.data(), now) ? await doc.ref.get() : doc;
  const order = decodeInboxOrder(fresh.id, fresh.data() ?? {});
  if (!order?.selection) return null;
  if (!recoverableStatuses.has(order.status)) throw new ProductError(409, "This request can no longer be reordered.");
  return {
    orderNumber: order.orderNumber,
    catalogMode: order.catalogMode,
    branchId: order.branchId,
    slotId: order.slotId,
    delivery: order.delivery,
    address: order.address,
    name: order.customerName,
    contact: order.contact,
    payment: order.payment,
    notes: order.notes,
    selection: order.selection,
    review: await reviewRecovery(order, now),
  };
}

function freshQuoteFields(data: FirebaseFirestore.DocumentData, quote: NonNullable<ReturnType<typeof assessRecovery>["quote"]>) {
  const pickupTotal = data.delivery === "lalamove" || quote.quoteRequired ? null : quote.knownSubtotalCentavos;
  return {
    lines: quote.lines,
    addonLines: quote.addonLines,
    preparationDays: quote.preparationDays,
    knownSubtotalCentavos: quote.knownSubtotalCentavos,
    itemQuotePending: quote.quoteRequired,
    ...(data.delivery === "lalamove"
      ? { deliveryEligibility: "pending" as const, deliveryFeeCentavos: null, quoteStatus: "pending" as const, finalTotalCentavos: null }
      : { quoteStatus: pickupTotal === null ? "pending" as const : "finalized" as const, finalTotalCentavos: pickupTotal }),
  };
}

export async function reopenOrder(input: { orderId?: string; token?: string; reopenKey: string; expectedStatus?: InboxOrder["status"]; actorUid: string }, now = new Date()) {
  const { db } = getServerFirebase();
  const located = input.orderId ? await db.doc(`orders/${input.orderId}`).get() : await orderByToken(input.token ?? "");
  if (!located || !("exists" in located ? located.exists : true) || !located) return { missing: true as const };
  const ref = located.ref;
  const previewData = located.data();
  if (!previewData) return { missing: true as const };
  const preview = decodeInboxOrder(ref.id, previewData);
  if (!preview?.selection) return { conflict: "This request was saved before item changes.", order: preview };
  const previewSelection = preview.selection;
  if (preview.status === "requested" && previewData.reopenKey === input.reopenKey) return { order: preview };
  if (!recoverableStatuses.has(preview.status)) return { order: preview };
  if (input.expectedStatus && preview.status !== input.expectedStatus) {
    return { conflict: "This request changed. Reload it and try again.", order: preview };
  }
  const context = await recoveryContext(now);
  const paused = preview.fulfillmentDate === manilaDate(now) && context.days.get(dailyCapacityKey(preview.branchId, preview.fulfillmentDate))?.paused === true;
  const assessed = assessRecovery({
    catalog: context.catalog,
    branches: context.branches,
    schedule: context.schedule,
    branchId: preview.branchId,
    slotId: preview.slotId,
    delivery: preview.delivery,
    catalogMode: preview.catalogMode === "preorder" ? "preorder" : "regular",
    selection: previewSelection,
    storedLines: preview.lines,
    storedSelection: previewSelection,
    previousSubtotalCentavos: preview.knownSubtotalCentavos,
    allocations: context.allocations,
    paused,
    now,
  });
  if (!assessed.clear || !assessed.quote || !assessed.slot) return { conflict: assessed.blockers.join(" "), order: preview };
  const deadline = initialReservationDeadline(now, defaultOrderingPolicy);
  const flavorRefs = assessed.heldFlavors.map((flavor) => db.doc(`allocations/${flavorCapacityKey(preview.branchId, previewSelection.date, flavor.productId)}`));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { missing: true as const };
    const data = snap.data()!;
    const order = decodeInboxOrder(ref.id, data);
    if (!order?.selection) return { conflict: "This request was saved before item changes.", order };
    if (data.status === "requested" && data.reopenKey === input.reopenKey) return { order };
    if (!recoverableStatuses.has(data.status)) return { order };
    if (input.expectedStatus && data.status !== input.expectedStatus) {
      return { conflict: "This request changed. Reload it and try again.", order };
    }
    const daySnap = await tx.get(db.doc(`allocationDays/${dailyCapacityKey(order.branchId, order.selection.date)}`));
    const scheduleSnap = await tx.get(db.doc("settings/orderingSchedule"));
    const flavorSnaps = [];
    for (const flavorRef of flavorRefs) flavorSnaps.push(await tx.get(flavorRef));
    const { updatedAt: _at, updatedBy: _by, ...storedSchedule } = scheduleSnap.exists ? scheduleSnap.data()! : {};
    void _at; void _by;
    const liveSchedule = scheduleSnap.exists ? scheduleSettingsSchema.parse(storedSchedule) : defaultScheduleSettings();
    const livePaused = order.selection.date === manilaDate(now) && daySnap.data()?.paused === true;
    const live = assessRecovery({
      catalog: context.catalog,
      branches: context.branches,
      schedule: liveSchedule,
      branchId: order.branchId,
      slotId: order.slotId,
      delivery: order.delivery,
      catalogMode: order.catalogMode === "preorder" ? "preorder" : "regular",
      selection: order.selection,
      storedLines: order.lines,
      storedSelection: order.selection,
      previousSubtotalCentavos: order.knownSubtotalCentavos,
      allocations: new Map(flavorSnaps.map((flavorSnap, index) => [flavorRefs[index].id, allocationFromData(flavorSnap.data())])),
      paused: livePaused,
      now,
    });
    if (!live.clear || !live.quote || !live.slot) return { conflict: live.blockers.join(" "), order };
    const entries = flavorSnaps.map((flavorSnap) => allocationFromData(flavorSnap.data()));
    const event: OrderEvent = {
      at: now.toISOString(),
      actorUid: input.actorUid,
      action: "reopen",
      previousStatus: data.status as OrderEvent["previousStatus"],
      status: "requested",
    };
    const next = {
      status: "requested" as const,
      deadline: deadline.toISOString(),
      slotId: live.slot.id,
      slotLabel: live.slot.label,
      heldFlavors: live.heldFlavors,
      capacityReleased: false,
      reopenKey: input.reopenKey,
      events: withEvent(data, event),
      ...freshQuoteFields(data, live.quote),
    };
    flavorSnaps.forEach((flavorSnap, index) => {
      const flavor = assessed.heldFlavors[index];
      const entry = entries[index];
      tx.set(flavorSnap.ref, {
        branchId: order.branchId,
        fulfillmentDate: order.selection!.date,
        productId: flavor.productId,
        limit: entry?.limit ?? null,
        held: (entry?.held ?? 0) + flavor.quantity,
        version: entry?.version ?? 0,
      });
    });
    tx.update(ref, next);
    return { order: decodeInboxOrder(ref.id, { ...data, ...next }) };
  });
}

async function commitReservedOrder(input: {
  idempotencyKey: string;
  branchId: string;
  slot: { id: string; label: string };
  name: string;
  contact: string;
  notes: string;
  delivery: "pickup" | "lalamove";
  address: string;
  payment: "bank" | "gcash" | "cash";
  catalogMode: "regular" | "preorder";
  selection: Selection;
  quote: ReturnType<typeof quoteSelection>;
  heldFlavors: { productId: string; quantity: number }[];
  flavorNames: Map<string, string>;
  schedule: ScheduleSettings;
  now: Date;
  sourceId?: string;
  actorUid: string;
}) {
  const today = manilaDate(input.now);
  const deadline = initialReservationDeadline(input.now, defaultOrderingPolicy);
  const { db } = getServerFirebase();
  const idemRef = db.doc(`orderIdempotency/${input.idempotencyKey}`);
  const dayRef = db.doc(`allocationDays/${dailyCapacityKey(input.branchId, input.selection.date)}`);
  const flavorRefs = input.heldFlavors.map((flavor) => db.doc(`allocations/${flavorCapacityKey(input.branchId, input.selection.date, flavor.productId)}`));
  const scheduleRef = db.doc("settings/orderingSchedule");
  const counterRef = db.doc("counters/orders");
  const orderRef = db.collection("orders").doc();
  const sourceRef = input.sourceId ? db.doc(`orders/${input.sourceId}`) : null;
  await expireDueHolds(input.now);
  try {
    return await db.runTransaction(async (tx) => {
      const idem = await tx.get(idemRef);
      if (idem.exists) {
        const existing = idem.data();
        if (existing?.token && existing.orderNumber && existing.orderId) {
          return { orderNumber: String(existing.orderNumber), token: String(existing.token), deadline: String(existing.deadline), orderId: String(existing.orderId), replayed: true };
        }
        throw new ProductError(409, "This request was already submitted. Open your receipt link.");
      }
      const sourceSnap = sourceRef ? await tx.get(sourceRef) : null;
      if (sourceRef && (!sourceSnap?.exists || !recoverableStatuses.has(String(sourceSnap.data()?.status)))) {
        throw new ProductError(409, "This request can no longer be reordered.");
      }
      const daySnap = await tx.get(dayRef);
      const flavorSnaps = [];
      for (const ref of flavorRefs) flavorSnaps.push(await tx.get(ref));
      const scheduleSnap = await tx.get(scheduleRef);
      const counterSnap = await tx.get(counterRef);
      let liveSchedule = input.schedule;
      if (scheduleSnap.exists) {
        const { updatedAt: _at, updatedBy: _by, ...stored } = scheduleSnap.data()!;
        void _at; void _by;
        liveSchedule = scheduleSettingsSchema.parse(stored);
      }
      const liveError = scheduleValidationError(liveSchedule, input.branchId, input.selection.date, input.slot.id, input.now);
      const paused = input.selection.date === today && daySnap.data()?.paused === true;
      if (liveError || paused) {
        throw new ProductError(409, "That date is no longer available for online requests. Choose another date; your cart has been kept.");
      }
      const entries = flavorSnaps.map((snap) => allocationFromData(snap.data()));
      const short = input.heldFlavors.flatMap((flavor, index) => flavorHasRoom(entries[index], flavor.quantity, input.selection.date, today, false) ? [] : [input.flavorNames.get(flavor.productId) ?? flavor.productId]);
      if (short.length) throw new ProductError(409, flavorAvailabilityMessage(short));
      const nextNumber = (Number.isInteger(counterSnap.data()?.value) ? counterSnap.data()!.value : 1000) + 1;
      const orderNumber = `MP-${String(nextNumber).padStart(4, "0")}`;
      const token = randomBytes(32).toString("base64url");
      const sourceData = sourceSnap?.data();
      const order = {
        orderNumber,
        branchId: input.branchId,
        fulfillmentDate: input.selection.date,
        slotId: input.slot.id,
        slotLabel: input.slot.label,
        customerName: input.name,
        contact: input.contact,
        address: input.delivery === "lalamove" ? input.address : "",
        delivery: input.delivery,
        payment: input.payment,
        catalogMode: input.catalogMode,
        preparationDays: input.quote.preparationDays,
        notes: input.notes,
        lines: input.quote.lines,
        addonLines: input.quote.addonLines,
        selection: input.selection,
        heldFlavors: input.heldFlavors,
        knownSubtotalCentavos: input.quote.knownSubtotalCentavos,
        itemQuotePending: input.quote.quoteRequired,
        ...(input.delivery === "lalamove" ? { deliveryEligibility: "pending" as const, deliveryFeeCentavos: null } : {}),
        quoteStatus: input.delivery === "lalamove" || input.quote.quoteRequired ? "pending" as const : "finalized" as const,
        finalTotalCentavos: input.delivery === "lalamove" || input.quote.quoteRequired ? null : input.quote.knownSubtotalCentavos,
        paymentStatus: "unpaid" as const,
        netReceivedCentavos: 0,
        payments: [],
        deadline: deadline.toISOString(),
        submittedAt: input.now.toISOString(),
        status: "requested" as const,
        accessTokenHash: tokenHash(token),
        idempotencyKey: input.idempotencyKey,
        ...(sourceData?.orderNumber ? { sourceOrderId: sourceRef!.id, sourceOrderNumber: String(sourceData.orderNumber) } : {}),
      };
      tx.set(orderRef, order);
      input.heldFlavors.forEach((flavor, index) => {
        const entry = entries[index];
        tx.set(flavorRefs[index], {
          branchId: input.branchId,
          fulfillmentDate: input.selection.date,
          productId: flavor.productId,
          limit: entry?.limit ?? null,
          held: (entry?.held ?? 0) + flavor.quantity,
          version: entry?.version ?? 0,
        });
      });
      tx.set(counterRef, { value: nextNumber });
      tx.create(idemRef, { orderId: orderRef.id, orderNumber, token, deadline: order.deadline, at: FieldValue.serverTimestamp() });
      if (sourceRef && sourceSnap?.exists && sourceData) {
        const event: OrderEvent = {
          at: input.now.toISOString(),
          actorUid: input.actorUid,
          action: "reorder",
          previousStatus: sourceData.status as OrderEvent["previousStatus"],
          status: sourceData.status as OrderEvent["status"],
          changes: [{ field: "New request", from: String(sourceData.orderNumber), to: orderNumber }],
        };
        tx.update(sourceRef, { events: withEvent(sourceData, event) });
      }
      return { orderNumber, token, deadline: order.deadline, orderId: orderRef.id, replayed: false };
    });
  } catch (error) {
    if (error instanceof ProductError && error.status === 409 && (error.message.startsWith("That date") || error.message.includes("online availability"))) {
      const availability = await readOrderingAvailability(input.now);
      throw new OrderAvailabilityError(error.message, availability.schedule, availability.openDates, availability.openProducts, availability.serverNow);
    }
    throw error;
  }
}

export async function readHeldOrders(admin: AdminIdentity, now = new Date()) {
  await expireDueHolds(now);
  const snap = await getServerFirebase().db.collection("orders").where("status", "in", ["requested", "processing", "confirmed", "preparing", "ready", "completed"]).limit(100).get();
  const orders = snap.docs.flatMap((doc) => {
    const order = decodeInboxOrder(doc.id, doc.data());
    return order ? [order] : [];
  });
  return ordersVisibleTo(admin.role, admin.branchIds, orders).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export async function readClosedOrders(admin: AdminIdentity) {
  const snap = await getServerFirebase().db.collection("orders").where("status", "in", ["expired", "cancelled"]).limit(40).get();
  const orders = snap.docs.flatMap((doc) => {
    const order = decodeInboxOrder(doc.id, doc.data());
    return order ? [order] : [];
  });
  return ordersVisibleTo(admin.role, admin.branchIds, orders).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export async function readGuestOrder(token: string, now = new Date()) {
  await expireDueHolds(now);
  const { db } = getServerFirebase();
  const snap = await db.collection("orders").where("accessTokenHash", "==", tokenHash(token)).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) return null;
  if (orderIsDue(doc.data(), now)) await settleOrder(doc.id, now, "system", "expire", "requested");
  const fresh = orderIsDue(doc.data(), now) ? await doc.ref.get() : doc;
  const order = decodeInboxOrder(fresh.id, fresh.data() ?? {});
  if (!order) return null;
  const branches = await readBranchSettings();
  const branch = branchById(branches, order.branchId);
  const copy = guestStatusCopy(order.status, order.delivery);
  // Photos are optional enrichment: a catalog outage must not hide the receipt.
  const { catalog } = await readPublicMenu();
  const products = new Map(catalog?.products.map((product) => [product.id, product]) ?? []);
  const lineImages = order.lines.map((_, index) => {
    const selected = order.selection?.lines[index];
    if (!selected || order.selection?.lines.length !== order.lines.length) return null;
    const product = products.get(selected.productId);
    return product ? { src: product.image.url, alt: product.image.alt } : null;
  });
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: copy.statusLabel,
    branchName: branch.name,
    delivery: order.delivery,
    branchAddress: branch.address,
    fulfillmentDate: order.fulfillmentDate,
    slotLabel: order.slotLabel,
    deadline: order.deadline,
    lines: order.lines,
    lineImages,
    addonLines: order.addonLines,
    totalCentavos: order.finalTotalCentavos,
    totalLabel: order.finalTotalCentavos === null ? "to confirm" : `₱${(order.finalTotalCentavos / 100).toFixed(2)}`,
    deliveryFeeCentavos: order.delivery === "lalamove" ? order.deliveryFeeCentavos ?? null : null,
    preparationDays: order.preparationDays,
    paymentLabel: guestPaymentLabel(order.paymentStatus),
    message: copy.message,
  };
}

export async function reopenGuestOrder(token: string, reopenKey: string, now = new Date()) {
  const result = await reopenOrder({ token, reopenKey, actorUid: "customer" }, now);
  if ("missing" in result && result.missing) return null;
  const order = await readGuestOrder(token, now);
  if (!order) return null;
  return { order, conflict: "conflict" in result ? result.conflict : undefined };
}

async function preparedReservation(input: {
  branchId: string;
  slotId: string;
  delivery: "pickup" | "lalamove";
  catalogMode?: "regular" | "preorder";
  selection: Selection;
}, now: Date) {
  const popups = await readPopupSettings();
  if (popupClaimsBranch(input.branchId, popups.listings)) {
    throw new ProductError(409, "That stop is for visits. Online requests use the main branches.");
  }
  const today = manilaDate(now);
  const { catalog } = await readPublicMenu();
  if (!catalog) throw new ProductError(503, "The menu is temporarily unavailable. Please try again.");
  const branchSettings = await readBranchSettings();
  const branchId = resolveBranch(input.branchId, branchSettings);
  if (input.delivery === "lalamove" && !branchById(branchSettings, branchId).deliveryEnabled) {
    throw new ProductError(409, "Delivery is not available from this branch. Pickup is still available.");
  }
  const schedule = await readScheduleSettings();
  const scheduleError = scheduleValidationError(schedule, branchId, input.selection.date, input.slotId, now);
  if (scheduleError) {
    const availability = await readOrderingAvailability(now);
    throw new OrderAvailabilityError(scheduleError, availability.schedule, availability.openDates, availability.openProducts, availability.serverNow);
  }
  const slot = slotsForDate(schedule, branchId, input.selection.date, now).find((item) => item.id === input.slotId);
  if (!slot) throw new ProductError(409, "That date or time slot is no longer available. Choose another available date and time; your cart has been kept.");
  const scoped = catalogForSelection(catalog, branchSettings, branchId, input.selection.lines, input.catalogMode);
  if ("error" in scoped) throw new ProductError(400, scoped.error);
  const quote = quoteSelection(scoped.catalog, input.selection, today);
  if (quote.errors.length) throw new ProductError(400, quote.errors.join(" "));
  return {
    branchId,
    slot,
    schedule,
    catalogMode: scoped.mode,
    quote,
    heldFlavors: flavorQuantities(input.selection.lines),
    flavorNames: new Map(scoped.catalog.products.map((product) => [product.id, product.name])),
  };
}

export async function submitOrder(raw: unknown, now = new Date()) {
  const input = orderRequestSchema.parse(raw);
  const prepared = await preparedReservation(input, now);
  let sourceId: string | undefined;
  if (input.recoveryToken) {
    const source = await orderByToken(input.recoveryToken);
    if (!source || !recoverableStatuses.has(String(source.data()?.status))) {
      throw new ProductError(409, "This request can no longer be reordered.");
    }
    sourceId = source.id;
  }
  const saved = await commitReservedOrder({
    idempotencyKey: input.idempotencyKey,
    branchId: prepared.branchId,
    slot: prepared.slot,
    name: input.name,
    contact: input.contact,
    notes: input.notes,
    delivery: input.delivery,
    address: input.address,
    payment: input.payment,
    catalogMode: prepared.catalogMode,
    selection: input.selection,
    quote: prepared.quote,
    heldFlavors: prepared.heldFlavors,
    flavorNames: prepared.flavorNames,
    schedule: prepared.schedule,
    now,
    sourceId,
    actorUid: "customer",
  });
  return { ...saved, status: "requested" as const };
}

async function reviewClosedOrder(input: OrderAction, now: Date) {
  const snap = await getServerFirebase().db.doc(`orders/${input.orderId}`).get();
  if (!snap.exists) return { missing: true as const };
  const order = decodeInboxOrder(input.orderId, snap.data()!);
  if (!order || !recoverableStatuses.has(order.status) || order.status !== input.expectedStatus) {
    return { conflict: "This request changed. Reload it and try again.", order };
  }
  const proposal = input.selection && input.branchId && input.slotId ? { branchId: input.branchId, slotId: input.slotId, selection: input.selection } : undefined;
  if (proposal && order.selection) {
    const nextSelection = revisedSelection(order.selection, proposal.selection);
    if (nextSelection === "empty") return { conflict: "Keep at least one pie on this request.", order };
    if (nextSelection === "unknown") return { conflict: "Only the pies already on this request can change.", order };
    proposal.selection = nextSelection;
  }
  return { order, review: await reviewRecovery(order, now, proposal) };
}

async function reorderClosedOrder(input: OrderAction, admin: AdminIdentity, now: Date) {
  const { db } = getServerFirebase();
  const snap = await db.doc(`orders/${input.orderId}`).get();
  if (!snap.exists) return { missing: true as const };
  const order = decodeInboxOrder(input.orderId, snap.data()!);
  if (!order?.selection || !input.selection || !input.branchId || !input.slotId || !input.idempotencyKey) {
    return { conflict: order?.selection ? "Choose the pies to keep." : "This request was saved before item changes.", order };
  }
  if (!recoverableStatuses.has(order.status) || order.status !== input.expectedStatus) {
    return { conflict: "This request changed. Reload it and try again.", order };
  }
  if (input.branchId !== order.branchId && admin.role !== "owner") {
    throw new ProductError(403, "Only an owner can move a request to another branch.");
  }
  const nextSelection = revisedSelection(order.selection, input.selection);
  if (nextSelection === "empty") return { conflict: "Keep at least one pie on this request.", order };
  if (nextSelection === "unknown") return { conflict: "Only the pies already on this request can change.", order };
  const prepared = await preparedReservation({
    branchId: input.branchId,
    slotId: input.slotId,
    delivery: order.delivery,
    catalogMode: order.catalogMode,
    selection: nextSelection,
  }, now);
  const saved = await commitReservedOrder({
    idempotencyKey: input.idempotencyKey,
    branchId: prepared.branchId,
    slot: prepared.slot,
    name: order.customerName,
    contact: order.contact,
    notes: order.notes,
    delivery: order.delivery,
    address: order.address,
    payment: order.payment,
    catalogMode: prepared.catalogMode,
    selection: nextSelection,
    quote: prepared.quote,
    heldFlavors: prepared.heldFlavors,
    flavorNames: prepared.flavorNames,
    schedule: prepared.schedule,
    now,
    sourceId: input.orderId,
    actorUid: admin.uid,
  });
  const created = await db.doc(`orders/${saved.orderId}`).get();
  const createdOrder = created.exists ? decodeInboxOrder(created.id, created.data()!) : null;
  if (!createdOrder) return { missing: true as const };
  return { order: createdOrder };
}
