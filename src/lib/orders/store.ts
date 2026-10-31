import "server-only";
import { readShopSettings } from "../settings/store";
import { orderHold } from "./hold";

import { createHash, randomBytes } from "node:crypto";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import type { AdminIdentity } from "../admin/schemas";
import { selectionSchema, type Catalog, type Selection } from "../catalog/schema";
import { manilaDate, quoteSelection } from "../catalog/rules";
import { branchById, branchCatalog as branchCatalogFor, orderingBranchCatalog, catalogForSelection, resolveBranch } from "../branches/schema";
import { readBranchSettings } from "../branches/store";
import { getServerFirebase } from "../firebase/server";
import { popupClaimsBranch } from "../popups/schema";
import { readPopupSettings } from "../popups/store";
import { readPublicMenu } from "../products/public";
import { ProductError } from "../products/store";
import { forget, publicCacheKeys, remember, stockCacheKey } from "../public-cache";
import { addCalendarDays, preparationStartDate, scheduleValidationError, slotsForDate } from "../scheduling/rules";
import { defaultScheduleSettings, scheduleSettingsSchema, type ScheduleSettings } from "../scheduling/schema";
import { readScheduleSettings } from "../scheduling/store";
import { allocationDaySchema, allocationRecordSchema, allocationSaveSchema, capacityOpen, flavorAvailabilityMessage, flavorCapacityKey, flavorHasRoom, flavorQuantities, type AllocationDay, type AllocationRecord, type AllocationSave } from "./allocation";
import { dueHoldConstraints } from "./expiry";
import { assertPaymentBeforePreparation, dailyCapacityKey, defaultOrderingPolicy } from "./policy";
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

function allocationQuery(start?: string, end?: string) {
  let query: FirebaseFirestore.Query = getServerFirebase().db.collection("allocations");
  if (start && end) query = query.where("fulfillmentDate", ">=", start).where("fulfillmentDate", "<=", end);
  return query;
}

function allocationDayQuery(start?: string, end?: string) {
  let query: FirebaseFirestore.Query = getServerFirebase().db.collection("allocationDays");
  if (start && end) query = query.where("fulfillmentDate", ">=", start).where("fulfillmentDate", "<=", end);
  return query;
}

export async function readAllocationMap(start?: string, end?: string) {
  const snap = await allocationQuery(start, end).get();
  const map = new Map<string, AllocationRecord>();
  for (const doc of snap.docs) {
    const parsed = allocationFromData(doc.data());
    if (parsed) map.set(flavorCapacityKey(parsed.branchId, parsed.fulfillmentDate, parsed.productId), parsed);
  }
  return map;
}

export async function readAllocationDayMap(start?: string, end?: string) {
  const snap = await allocationDayQuery(start, end).get();
  const map = new Map<string, AllocationDay>();
  for (const doc of snap.docs) {
    const parsed = allocationDayFromData(doc.data());
    if (parsed) map.set(dailyCapacityKey(parsed.branchId, parsed.fulfillmentDate), parsed);
  }
  return map;
}

export async function readOrderingAvailability(now = new Date()) {
  const [schedule, branches, menu] = await Promise.all([readScheduleSettings(), readBranchSettings(), readPublicMenu()]);
  const today = manilaDate(now);
  const horizon = addCalendarDays(today, schedule.bookingHorizonDays);
  const { allocations, days } = await remember(stockCacheKey(today, horizon), async () => {
    const [allocations, days] = await Promise.all([readAllocationMap(today, horizon), readAllocationDayMap(today, horizon)]);
    return { allocations, days };
  });
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
  forget(publicCacheKeys.stock);
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
  const activePayments = payments.filter((payment) => !payment.voidedAt);
  const signed = activePayments.reduce((total, payment) => total + (payment.kind === "refund" ? -payment.amountCentavos : payment.amountCentavos), 0);
  const voided = payments.some((payment) => payment.voidedAt);
  const netReceivedCentavos = voided
    ? Math.max(0, signed)
    : Number.isInteger(data.netReceivedCentavos) && data.netReceivedCentavos >= 0
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
    requireFullPayment: data.requireFullPayment === true,
    customerEditable: data.customerEditable === true,
    submittedAfterHours: data.submittedAfterHours === true,
    ...(typeof data.openingAt === "string" ? { openingAt: data.openingAt } : {}),
    heldFlavors: Array.isArray(data.heldFlavors) ? data.heldFlavors.flatMap((flavor) => {
      const parsed = heldFlavorSchema.safeParse(flavor);
      return parsed.success ? [parsed.data] : [];
    }) : [],
    anonymized: data.anonymized === true || typeof data.anonymizedAt === "string",
    cancelReason: typeof data.cancelReason === "string" ? data.cancelReason : [...events].reverse().find((event) => event.action === "reject")?.reason ?? null,
    ...(data.deliveryFeePayment ? { deliveryFeePayment: data.deliveryFeePayment } : {}),
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

function guestStatusCopy(status: InboxOrder["status"], delivery: "pickup" | "lalamove") {
  const statusLabel = orderStatusLabel(status, delivery);
  const copy: Record<string, string> = { requested: "We've got your order. Send your order number so we can confirm it.", processing: delivery === "lalamove" ? "We're checking your order and getting a rider quote for your address." : "We're checking your order.", confirmed: "Your order is confirmed.", preparing: "We're baking your order.", ready: delivery === "lalamove" ? "Your order is on its way." : "Your order is ready for pickup.", completed: "Thank you for choosing Makalipie.", expired: "Your hold ended before we could confirm it.", cancelled: "We couldn't take this order." };
  return { statusLabel, message: copy[status] ?? "Here if you need us." };
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
  const settled = await db.runTransaction(async (tx) => {
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
      ...(["confirmed", "cancelled", "expired"].includes(nextStatus) ? { customerEditable: false } : {}),
      ...(nextStatus === "cancelled" && reason ? { cancelReason: reason } : {}),
      ...(releasing ? { capacityReleased: true } : {}),
      ...(nextStatus === "processing" ? { processingStartedAt: now.toISOString() } : {}),
      events: withEvent(data, event),
    };
    tx.update(orderRef, next);
    const order = decodeInboxOrder(id, { ...data, ...next });
    if (expiring && action !== "expire") return { conflict: "That hold already expired.", order };
    return { order };
  });
  if ("order" in settled && settled.order && (settled.order.status === "expired" || settled.order.status === "cancelled")) forget(publicCacheKeys.stock);
  return settled;
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
  if (action === "complete" && !pickup) {
    return { conflict: "Pickup progress is for pickup requests.", order: decodeInboxOrder(id, data) };
  }
  if (action === "ready" && data.status !== "preparing") {
    return { conflict: "This request changed. Reload it and try again.", order: decodeInboxOrder(id, data) };
  }
  if (action === "complete" && data.status !== "ready") {
    return { conflict: "This request changed. Reload it and try again.", order: decodeInboxOrder(id, data) };
  }
  if (action === "preparing" || action === "complete") {
    const commercial = commercialFields(data);
    try {
      assertPaymentBeforePreparation({
        quoteStatus: commercial.quoteStatus,
        paymentStatus: commercial.paymentStatus,
        finalTotalCentavos: commercial.finalTotalCentavos,
        netReceivedCentavos: commercial.netReceivedCentavos,
      });
    } catch (error) {
      const fallback = action === "complete" ? "Finalize the total and verify full payment before completing this order." : "Finalize the total and verify full payment before preparation.";
      return { conflict: error instanceof Error && action === "preparing" ? error.message : fallback, order: decodeInboxOrder(id, data) };
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
  const { db } = getServerFirebase();
  const bounds = dueHoldConstraints(now);
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let scanned = 0;
  for (;;) {
    let query = db.collection("orders").where("status", "==", bounds.status).where("deadline", "<=", bounds.deadlineMax).orderBy("deadline").limit(100);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    for (const doc of snap.docs) {
      if (!orderIsDue(doc.data(), now)) continue;
      await settleOrder(doc.id, now, "system", "expire", "requested");
    }
    scanned += snap.size;
    if (snap.size < 100 || scanned >= 2000) return;
    const next = snap.docs.at(-1);
    if (!next) return;
    cursor = next;
  }
}

const PERSONAL_RETENTION_MS = 30 * 86400000;

function scrubPersonalLine(line: string) {
  return line.replace(/:\s*“[^”]*”/g, "");
}

/** Removes personal fields from closed orders 30 days after fulfillment. Active orders are left unchanged. Safe to run more than once. */
export async function anonymizeDueOrders(now = new Date()) {
  const { db } = getServerFirebase();
  for (const status of ["completed", "cancelled", "expired"] as const) {
    const snap = await db.collection("orders").where("status", "==", status).limit(200).get();
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.anonymizedAt || data.anonymized === true) continue;
      if (typeof data.fulfillmentDate !== "string") continue;
      const start = Date.parse(`${data.fulfillmentDate}T00:00:00+08:00`);
      if (!Number.isFinite(start) || now.getTime() < start + PERSONAL_RETENTION_MS) continue;
      const events = Array.isArray(data.events) ? data.events.flatMap((event) => {
        const parsed = orderEventSchema.safeParse(event);
        if (!parsed.success) return [];
        const { reason: _reason, changes: _changes, ...rest } = parsed.data;
        void _reason;
        void _changes;
        return [rest];
      }) : [];
      const selection = selectionSchema.safeParse(data.selection);
      const payments = Array.isArray(data.payments) ? data.payments.flatMap((payment) => {
        const parsed = paymentRecordSchema.safeParse(payment);
        if (!parsed.success) return [];
        const { reference: _reference, note: _note, ...rest } = parsed.data;
        void _reference;
        void _note;
        return [rest];
      }) : [];
      await doc.ref.update({
        customerName: "",
        contact: "",
        address: "",
        notes: "",
        cancelReason: null,
        staffNotes: [],
        rider: null,
        anonymized: true,
        anonymizedAt: now.toISOString(),
        accessTokenHash: FieldValue.delete(),
        events,
        payments,
        lines: Array.isArray(data.lines) ? data.lines.map((line) => typeof line === "string" ? scrubPersonalLine(line) : line) : [],
        addonLines: Array.isArray(data.addonLines) ? data.addonLines.map((line) => typeof line === "string" ? scrubPersonalLine(line) : line) : [],
        ...(selection.success ? {
          selection: {
            ...selection.data,
            lines: selection.data.lines.map((line) => ({ ...line, addons: line.addons.map((addon) => ({ ...addon, message: "" })) })),
            addons: selection.data.addons.map((addon) => ({ ...addon, message: "" })),
          },
        } : {}),
      });
    }
  }
}

export async function readOrderForAdmin(id: string) {
  const snap = await getServerFirebase().db.doc(`orders/${id}`).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  const order = decodeInboxOrder(snap.id, data);
  if (!order) return null;
  return { order, data };
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
  const fee = data.delivery === "lalamove" && data.deliveryFeePayment !== "to_driver" && Number.isInteger(data.deliveryFeeCentavos) && data.deliveryFeeCentavos >= 0 ? data.deliveryFeeCentavos : 0;
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

async function reviseOrder(input: OrderAction, admin: Pick<AdminIdentity, "uid" | "role">, now: Date, guest?: { token: string; revision: string }) {
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
  if (guest && (!preview.customerEditable || !["requested", "processing"].includes(preview.status))) throw new ProductError(403, "Editing is no longer allowed. Return to your order for the latest update.");
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
  assertCustomerLimit(destination, nextSelection);
  const branchCatalog = orderingBranchCatalog(catalog, branchSettings, input.branchId);
  const preparationSchedule = await readScheduleSettings();
  const quote = quoteSelection(branchCatalog, nextSelection, today, {preparationStart:preparationStartDate(preparationSchedule,input.branchId,now)});
  if (quote.errors.length) return { conflict: quote.errors.join(" "), order: preview };
  const nextHolds = flavorQuantities(nextSelection.lines);
  const flavorNames = new Map(branchCatalog.products.map((product) => [product.id, product.name]));
  const branchId = input.branchId;
  const slotId = input.slotId;

  const revised = await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return { missing: true as const };
    const data = snap.data()!;
    const order = decodeInboxOrder(input.orderId, data);
    if (guest && (data.accessTokenHash !== tokenHash(guest.token) || !data.customerEditable || !["requested", "processing"].includes(data.status) || orderIsDue(data, now))) throw new ProductError(403, "Editing is no longer allowed. Return to your order for the latest update.");
    if (guest && revisionFor(data) !== guest.revision) throw new ProductError(409, "Your order changed while you were editing. Return to your order and open Edit again; your changes have not been saved.");
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
    const preparationError = quoteSelection(branchCatalog,nextSelection,today,{preparationStart:preparationStartDate(liveSchedule,branchId,now)}).errors[0];
    if(preparationError) return {conflict:preparationError,order};
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
    if (JSON.stringify(order.selection) !== JSON.stringify(nextSelection) && !changes.some((change) => change.field === "Pies")) changes.push({ field: "Pies", from: "Previous selection", to: "Updated quantities" });
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
  if ("order" in revised && revised.order && !("conflict" in revised)) forget(publicCacheKeys.stock);
  return revised;
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
    if (!order || data.delivery !== "lalamove" || data.status !== "ready" || data.status !== input.expectedStatus) {
      return { conflict: data.delivery === "lalamove" ? "This request changed. Reload it and try again." : "Pickup progress is for pickup requests.", order };
    }
    const commercial = commercialFields(data);
    try {
      assertPaymentBeforePreparation({
        quoteStatus: commercial.quoteStatus,
        paymentStatus: commercial.paymentStatus,
        finalTotalCentavos: commercial.finalTotalCentavos,
        netReceivedCentavos: commercial.netReceivedCentavos,
      });
    } catch {
      return { conflict: "Finalize the total and verify full payment before completing this order.", order };
    }
    const next = {
      status: "completed" as const,
      events: withEvent(data, {
        at: now.toISOString(),
        actorUid,
        action: "delivered" as const,
        previousStatus: "ready" as const,
        status: "completed" as const,
      }),
    };
    tx.update(orderRef, next);
    return { order: decodeInboxOrder(input.orderId, { ...data, ...next }) };
  });
}

export async function transitionOrder(raw: unknown, admin: AdminIdentity, now = new Date()): Promise<{ order: InboxOrder; conflict?: string; review?: RecoveryReview }> {
  const input = orderActionSchema.parse(raw) as OrderAction;
  const { db } = getServerFirebase();
  const snap = await db.doc(`orders/${input.orderId}`).get();
  if (!snap.exists) throw new ProductError(404, "This request is no longer available.");
  const branchId = String(snap.data()?.branchId ?? "");
  if (admin.role !== "owner" && !admin.branchIds.some((id) => id === branchId)) {
    throw new ProductError(403, "This request is not in your branch.");
  }
  const settled = input.action === "preferences"
    ? await updateCustomerPreferences(input, admin.uid, now)
    : input.action === "pay"
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
  const review = "review" in settled && settled.review && typeof settled.review === "object" && "clear" in settled.review ? settled.review as RecoveryReview : undefined;
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
  delivery: "pickup" | "lalamove";
  address?: string;
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
    addBlocker(blockers, scoped.error ?? "A selected size is unavailable at this branch.");
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
    quote = quoteSelection(scoped.catalog, input.selection, today, {preparationStart:preparationStartDate(input.schedule,input.branchId,input.now)});
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
  const doc = snap.docs[0];
  return doc && !guestAccessEnded(doc.data(), new Date()) ? doc : null;
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
  if (input.token && preview.status !== "expired") throw new ProductError(409, "Only expired orders can be reopened. Place a reorder instead.");
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
  assertCustomerLimit(branchById(context.branches, preview.branchId), previewSelection);
  const hold = orderHold(now, context.schedule.branches[preview.branchId], previewSelection.date, preview.slotId, await readShopSettings());
  const deadline = hold.deadline;
  if (deadline <= now) return { conflict: "This time is too soon to confirm. Reorder for a later slot.", order: preview };
  const flavorRefs = assessed.heldFlavors.map((flavor) => db.doc(`allocations/${flavorCapacityKey(preview.branchId, previewSelection.date, flavor.productId)}`));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { missing: true as const };
    const data = snap.data()!;
    const order = decodeInboxOrder(ref.id, data);
    if (!order?.selection) return { conflict: "This request was saved before item changes.", order };
    if (data.status === "requested" && data.reopenKey === input.reopenKey) return { order };
    if (input.token && data.status !== "expired") return { conflict: "This order changed. Only expired orders can be reopened.", order };
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
      submittedAfterHours: hold.submittedAfterHours,
      openingAt: hold.openingAt,
      customerEditable: false,
      cancelReason: null,
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
  address?: string;
  deliveryFeePayment?: "with_total" | "to_driver";
  payment: "bank" | "gcash" | "cash";
  catalogMode: "regular" | "preorder";
  selection: Selection;
  quote: ReturnType<typeof quoteSelection>;
  catalog: Catalog;
  heldFlavors: { productId: string; quantity: number }[];
  flavorNames: Map<string, string>;
  schedule: ScheduleSettings;
  now: Date;
  sourceId?: string;
  actorUid: string;
}) {
  const today = manilaDate(input.now);
  const shopSettings = await readShopSettings();
  const hold = orderHold(input.now, input.schedule.branches[input.branchId], input.selection.date, input.slot.id, shopSettings);
  const deadline = hold.deadline;
  if (deadline <= input.now) throw new ProductError(409, "This time is too soon to confirm. Choose a later slot.");
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
    const saved = await db.runTransaction(async (tx) => {
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
      const liveQuote = quoteSelection(input.catalog,input.selection,today,{preparationStart:preparationStartDate(liveSchedule,input.branchId,input.now)});
      if(liveQuote.errors.length) throw new ProductError(409,liveQuote.errors.join(" "));
      const liveError = scheduleValidationError(liveSchedule, input.branchId, input.selection.date, input.slot.id, input.now);
      const paused = input.selection.date === today && daySnap.data()?.paused === true;
      if (liveError || paused) {
        throw new ProductError(409, "That date is no longer available for online requests. Choose another date; your cart has been kept.");
      }
      const entries = flavorSnaps.map((snap) => allocationFromData(snap.data()));
      const short = input.heldFlavors.flatMap((flavor, index) => flavorHasRoom(entries[index], flavor.quantity, input.selection.date, today, false) ? [] : [input.flavorNames.get(flavor.productId) ?? flavor.productId]);
      if (short.length) throw new ProductError(409, flavorAvailabilityMessage(short));
      const nextNumber = (Number.isInteger(counterSnap.data()?.value) ? counterSnap.data()!.value : 1000) + 1;
      const orderNumber = `MK-${String(nextNumber).padStart(4, "0")}`;
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
        delivery: input.delivery,
        address: input.delivery === "lalamove" ? input.address ?? "" : "",
        ...(input.delivery === "lalamove" ? { deliveryEligibility: "pending", deliveryFeeCentavos: null, deliveryFeePayment: input.deliveryFeePayment ?? "with_total" } : {}),
        requireFullPayment: shopSettings.requireFullPaymentDefault,
        customerEditable: shopSettings.customerEditDefault,
        submittedAfterHours: hold.submittedAfterHours,
        openingAt: hold.openingAt,
        cancelReason: null,
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
        quoteStatus: input.quote.quoteRequired || input.delivery === "lalamove" ? "pending" as const : "finalized" as const,
        finalTotalCentavos: input.quote.quoteRequired || input.delivery === "lalamove" ? null : input.quote.knownSubtotalCentavos,
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
    if (!saved.replayed) forget(publicCacheKeys.stock);
    return saved;
  } catch (error) {
    if (error instanceof ProductError && error.status === 409 && (error.message.startsWith("That date") || error.message.includes("online availability"))) {
      const availability = await readOrderingAvailability(input.now);
      throw new OrderAvailabilityError(error.message, availability.schedule, availability.openDates, availability.openProducts, availability.serverNow);
    }
    throw error;
  }
}

const DASHBOARD_ORDER_PAGE = 200;
const DASHBOARD_ORDER_CAP = 2000;

/** Reads every saved order for dashboard totals. Stops with an error once the scan cap is reached so a truncated read cannot be reported as a complete count. */
export async function readOrdersForDashboard() {
  const { db } = getServerFirebase();
  const orders: InboxOrder[] = [];
  let scanned = 0;
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let query = db.collection("orders").orderBy(FieldPath.documentId()).limit(DASHBOARD_ORDER_PAGE);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    scanned += snap.size;
    for (const doc of snap.docs) {
      const order = decodeInboxOrder(doc.id, doc.data());
      if (order) orders.push(order);
    }
    if (snap.size < DASHBOARD_ORDER_PAGE) return orders;
    if (scanned >= DASHBOARD_ORDER_CAP) {
      throw new ProductError(503, "The dashboard couldn't be loaded. Please try again.");
    }
    const next = snap.docs.at(-1);
    if (!next) return orders;
    cursor = next;
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
  if (!doc || guestAccessEnded(doc.data(), now)) return null;
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
    const photo = product?.variants.find((variant) => variant.id === selected.variantId)?.image ?? product?.image;
    return photo ? { src: photo.url, alt: photo.alt } : null;
  });
  return {
    orderNumber: order.orderNumber,
    requireFullPayment: order.requireFullPayment,
    paymentStatus: order.paymentStatus,
    customerEditable: order.customerEditable && ["requested", "processing"].includes(order.status),
    submittedAfterHours: order.submittedAfterHours,
    openingAt: order.openingAt ?? null,
    cancelReason: order.status === "cancelled" ? order.cancelReason : null,
    deliveryAddress: order.address,
    deliveryFeePayment: order.deliveryFeePayment ?? "with_total",
    branchHours: branch.hoursLabel,
    branchMapUrl: branch.mapUrl,
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
    message: order.status === "requested" && order.submittedAfterHours && order.openingAt
      ? `We're closed right now. We'll confirm your order when we open at ${new Date(order.openingAt).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })}.`
      : copy.message,
  };
}

export async function reopenGuestOrder(token: string, reopenKey: string, now = new Date()) {
  const result = await reopenOrder({ token, reopenKey, actorUid: "customer" }, now);
  if ("missing" in result && result.missing) return null;
  const order = await readGuestOrder(token, now);
  if (!order) return null;
  return { order, conflict: "conflict" in result ? result.conflict : undefined };
}

function assertCustomerLimit(branch: Awaited<ReturnType<typeof readBranchSettings>>["branches"][number], selection: Selection) {
  const limit = branch.customerLimit;
  if (!limit?.quantity) return;
  // Q7: only the brief's initial per-order/pies configuration is supported until box/day policy is decided.
  if (limit.per !== "order" || limit.unit !== "pies") throw new ProductError(409, "This branch’s order limit needs confirmation. Please contact us.");
  if (selection.lines.reduce((sum, line) => sum + line.quantity, 0) > limit.quantity) throw new ProductError(400, `That’s over the limit for ${branch.name}.`);
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
  if (!branchSettings.branches.some((b) => b.id === input.branchId && b.visible)) throw new ProductError(409, "This branch is no longer available. Choose another branch.");
  const branchId = resolveBranch(input.branchId, branchSettings);
  const destination = branchById(branchSettings, branchId);
  if (input.delivery === "pickup" && !destination.pickupEnabled) throw new ProductError(409, "Pickup is not available from this branch.");
  assertCustomerLimit(destination, input.selection);
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
  const quote = quoteSelection(scoped.catalog, input.selection, today, {preparationStart:preparationStartDate(schedule,branchId,now)});
  if (quote.errors.length) throw new ProductError(400, quote.errors.join(" "));
  return {
    branchId,
    slot,
    schedule,
    catalogMode: "regular" as const,
    catalog: scoped.catalog,
    quote,
    heldFlavors: flavorQuantities(input.selection.lines),
    flavorNames: new Map(scoped.catalog.products.map((product) => [product.id, product.name])),
  };
}

export async function submitOrder(raw: unknown, now = new Date()) {
  const input = orderRequestSchema.parse(raw);
  const prepared = await preparedReservation({...input,catalogMode:"regular"}, now);
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
    deliveryFeePayment: input.deliveryFeePayment,
    payment: input.payment,
    catalogMode: prepared.catalogMode,
    selection: input.selection,
    quote: prepared.quote,
    catalog: prepared.catalog,
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
    delivery: "pickup",
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
    delivery: "pickup",
    payment: order.payment,
    catalogMode: prepared.catalogMode,
    selection: nextSelection,
    quote: prepared.quote,
    catalog: prepared.catalog,
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

function revisionFor(data: FirebaseFirestore.DocumentData) {
  return createHash("sha256").update(JSON.stringify([data.selection, data.status, data.events, data.customerEditable, data.deadline])).digest("hex");
}
export async function readGuestEdit(token: string, now = new Date()) {
  await expireDueHolds(now);
  const doc = await orderByToken(token);
  if (!doc) throw new ProductError(404, "This order link is unavailable.");
  const data = doc.data();
  const order = decodeInboxOrder(doc.id, data);
  if (!order?.selection || !order.customerEditable || !["requested", "processing"].includes(order.status) || orderIsDue(data, now)) throw new ProductError(403, "Editing is no longer allowed. Return to your order for the latest update.");
  return { orderNumber: order.orderNumber, revision: revisionFor(data), branchId: order.branchId, slotId: order.slotId, delivery: order.delivery, address: order.address, name: order.customerName, contact: order.contact, payment: order.payment, notes: order.notes, selection: order.selection, review: { priceChanges: [], unavailableLines: [] } };
}
export async function reviseGuestOrder(token: string, revision: string, selection: Selection, slotId: string, now = new Date()) {
  await expireDueHolds(now);
  const doc = await orderByToken(token);
  if (!doc) throw new ProductError(404, "This order link is unavailable.");
  const order = decodeInboxOrder(doc.id, doc.data());
  if (!order || !["requested", "processing"].includes(order.status)) throw new ProductError(403, "Editing is no longer allowed.");
  const input = orderActionSchema.parse({ orderId: doc.id, expectedStatus: order.status, action: "revise", branchId: order.branchId, slotId, selection });
  const result = await reviseOrder(input, { uid: "customer", role: "staff" }, now, { token, revision });
  if ("conflict" in result) throw new ProductError(409, result.conflict || "Your order changed. Please reload it.");
  if ("missing" in result) throw new ProductError(404, "This order link is unavailable.");
  return { token };
}

async function updateCustomerPreferences(input: OrderAction, actorUid: string, now: Date) {
  const db = getServerFirebase().db;
  const ref = db.doc(`orders/${input.orderId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { missing: true as const };
    const data = snap.data()!;
    const order = decodeInboxOrder(ref.id, data);
    if (!order || order.status !== input.expectedStatus || orderIsDue(data, now)) throw new ProductError(409, "This order changed. Refresh it before changing permissions.");
    if (input.customerEditable !== undefined && !["requested", "processing"].includes(order.status)) throw new ProductError(409, "Customer edits are only available before approval.");
    if (input.requireFullPayment === false) throw new ProductError(400, "Full payment is required before preparation.");
    if (input.requireFullPayment !== undefined && !["requested", "processing", "confirmed"].includes(order.status)) throw new ProductError(409, "Payment requirements cannot change once preparation starts.");
    const flags = { ...(input.customerEditable !== undefined ? { customerEditable: input.customerEditable } : {}), ...(input.requireFullPayment !== undefined ? { requireFullPayment: input.requireFullPayment } : {}) };
    const changes = Object.entries(flags).filter(([key,value]) => Boolean(data[key]) !== value).map(([key,value]) => ({ field: key === "customerEditable" ? "Customer editing" : "Full payment required", from: data[key] ? "On" : "Off", to: value ? "On" : "Off" }));
    const next = { ...flags, events: changes.length ? withEvent(data, { at: now.toISOString(), actorUid, action: "revise", previousStatus: order.status, status: order.status, changes }) : data.events ?? [] };
    tx.update(ref, next);
    return { order: decodeInboxOrder(ref.id, { ...data, ...next }) };
  });
}

function guestAccessEnded(data: FirebaseFirestore.DocumentData, now: Date) {
  return Boolean(data.anonymizedAt || data.anonymized) || (["completed", "cancelled", "expired"].includes(data.status) && typeof data.fulfillmentDate === "string" && now.getTime() >= Date.parse(`${data.fulfillmentDate}T00:00:00+08:00`) + 30 * 86400000);
}
