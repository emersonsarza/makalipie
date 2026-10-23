import "server-only";

import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { AdminIdentity } from "@/lib/admin/schemas";
import { orderVersion, paymentIdentity } from "@/lib/admin/orders-v2";
import { getServerFirebase } from "@/lib/firebase/server";
import { flavorCapacityKey } from "./allocation";
import { orderEventSchema, paymentRecordSchema, type OrderEvent, type PaymentRecord } from "./schema";

type Outcome = { missing: true } | { conflict: string } | { ok: true };

function blocked(data: FirebaseFirestore.DocumentData, admin: AdminIdentity, expectedVersion: number): Outcome | null {
  if (admin.role !== "owner" && !admin.branchIds.includes(String(data.branchId ?? ""))) return { missing: true };
  if (orderVersion(data) !== expectedVersion) return { conflict: "This order changed. Refresh to see the latest." };
  if (data.anonymized === true || typeof data.anonymizedAt === "string") return { conflict: "Personal details were removed. This order can no longer be changed." };
  return null;
}

function eventsOf(data: FirebaseFirestore.DocumentData) {
  return Array.isArray(data.events) ? data.events.flatMap((event) => {
    const parsed = orderEventSchema.safeParse(event);
    return parsed.success ? [parsed.data] : [];
  }) : [];
}

function paymentsOf(data: FirebaseFirestore.DocumentData) {
  return Array.isArray(data.payments) ? data.payments.flatMap((payment) => {
    const parsed = paymentRecordSchema.safeParse(payment);
    return parsed.success ? [parsed.data] : [];
  }) : [];
}

function withEvent(data: FirebaseFirestore.DocumentData, event: OrderEvent) {
  return [...eventsOf(data), event];
}

function paymentStatus(net: number, total: number, payments: PaymentRecord[] = []) {
  if (net <= 0) return payments.some((payment) => !payment.voidedAt && payment.kind === "refund") ? "refunded" as const : "unpaid" as const;
  if (net < total) return "partially_paid" as const;
  return "paid" as const;
}

function netOf(payments: PaymentRecord[]) {
  return Math.max(0, payments.filter((payment) => !payment.voidedAt).reduce((sum, payment) => sum + (payment.kind === "refund" ? -payment.amountCentavos : payment.amountCentavos), 0));
}

async function releaseHolds(tx: FirebaseFirestore.Transaction, data: FirebaseFirestore.DocumentData) {
  if (data.capacityReleased === true) return;
  const holds = Array.isArray(data.heldFlavors) ? data.heldFlavors.flatMap((flavor) => {
    if (!flavor || typeof flavor !== "object") return [];
    const productId = "productId" in flavor ? String(flavor.productId) : "";
    const quantity = "quantity" in flavor ? flavor.quantity : 0;
    return productId && Number.isInteger(quantity) && quantity > 0 ? [{ productId, quantity: quantity as number }] : [];
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

export async function cancelOrderV2(admin: AdminIdentity, orderId: string, expectedVersion: number, reason: string, now: Date): Promise<Outcome> {
  const { db } = getServerFirebase();
  const ref = db.doc(`orders/${orderId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { missing: true };
    const data = snap.data()!;
    const stop = blocked(data, admin, expectedVersion);
    if (stop) return stop;
    const delivery = data.delivery === "lalamove";
    const allowed = ["requested", "processing", "confirmed", "preparing"].includes(data.status) || (data.status === "ready" && !delivery);
    if (!allowed) return { conflict: "This order can no longer be cancelled here." };
    await releaseHolds(tx, data);
    const event: OrderEvent = { at: now.toISOString(), actorUid: admin.uid, action: "reject", previousStatus: data.status, status: "cancelled", reason };
    tx.update(ref, { status: "cancelled", cancelReason: reason, customerEditable: false, capacityReleased: true, events: withEvent(data, event) });
    return { ok: true };
  });
}

export async function confirmOrderFee(admin: AdminIdentity, orderId: string, expectedVersion: number, feeCentavos: number, destination: "with_total" | "to_rider", now: Date): Promise<Outcome> {
  const { db } = getServerFirebase();
  const ref = db.doc(`orders/${orderId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { missing: true };
    const data = snap.data()!;
    const stop = blocked(data, admin, expectedVersion);
    if (stop) return stop;
    if (data.delivery !== "lalamove" || !["requested", "processing", "confirmed"].includes(data.status)) return { conflict: "Confirm a delivery fee before preparation." };
    const storedDestination = destination === "to_rider" ? "to_driver" as const : "with_total" as const;
    const known = Number.isInteger(data.knownSubtotalCentavos) && data.knownSubtotalCentavos >= 0 ? data.knownSubtotalCentavos : 0;
    const pending = data.quoteStatus === "pending";
    const finalTotalCentavos = pending ? null : known + (storedDestination === "to_driver" ? 0 : feeCentavos);
    const payments = paymentsOf(data);
    const net = netOf(payments);
    const event: OrderEvent = {
      at: now.toISOString(), actorUid: admin.uid, action: "deliverable", previousStatus: data.status, status: data.status,
      changes: [{ field: "Delivery fee", from: Number.isInteger(data.deliveryFeeCentavos) ? String(data.deliveryFeeCentavos) : "Not recorded", to: String(feeCentavos) }, { field: "Fee payment", from: data.deliveryFeePayment === "to_driver" ? "To the rider" : "With total", to: storedDestination === "to_driver" ? "To the rider" : "With total" }],
    };
    tx.update(ref, {
      deliveryEligibility: "eligible",
      deliveryFeeCentavos: feeCentavos,
      deliveryFeePayment: storedDestination,
      quoteStatus: finalTotalCentavos === null ? "pending" : "finalized",
      finalTotalCentavos,
      paymentStatus: finalTotalCentavos === null ? data.paymentStatus ?? "unpaid" : paymentStatus(net, finalTotalCentavos, payments),
      events: withEvent(data, event),
    });
    return { ok: true };
  });
}

export async function changeOrderToPickup(admin: AdminIdentity, orderId: string, expectedVersion: number, now: Date): Promise<Outcome> {
  const { db } = getServerFirebase();
  const ref = db.doc(`orders/${orderId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { missing: true };
    const data = snap.data()!;
    const stop = blocked(data, admin, expectedVersion);
    if (stop) return stop;
    if (data.delivery !== "lalamove" || !["requested", "processing", "confirmed"].includes(data.status)) return { conflict: "Change to pickup before preparation, and only for a delivery order." };
    const fee = Number.isInteger(data.deliveryFeeCentavos) ? data.deliveryFeeCentavos : 0;
    const included = data.deliveryFeePayment !== "to_driver" && fee > 0 && Number.isInteger(data.finalTotalCentavos);
    const finalTotalCentavos = !Number.isInteger(data.finalTotalCentavos) ? data.finalTotalCentavos ?? null : included ? Math.max(0, data.finalTotalCentavos - fee) : data.finalTotalCentavos;
    const payments = paymentsOf(data);
    const net = netOf(payments);
    const event: OrderEvent = { at: now.toISOString(), actorUid: admin.uid, action: "revise", previousStatus: data.status, status: data.status, changes: [{ field: "Fulfillment", from: "Delivery", to: "Pickup" }] };
    tx.update(ref, {
      delivery: "pickup",
      address: "",
      deliveryEligibility: FieldValue.delete(),
      deliveryFeeCentavos: FieldValue.delete(),
      deliveryFeePayment: FieldValue.delete(),
      finalTotalCentavos,
      paymentStatus: finalTotalCentavos === null ? data.paymentStatus ?? "unpaid" : paymentStatus(net, finalTotalCentavos, payments),
      events: withEvent(data, event),
    });
    return { ok: true };
  });
}

export async function recordOrderRider(admin: AdminIdentity, orderId: string, expectedVersion: number, rider: { name: string; plate: string; trackingUrl: string }, now: Date): Promise<Outcome> {
  const { db } = getServerFirebase();
  const ref = db.doc(`orders/${orderId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { missing: true };
    const data = snap.data()!;
    const stop = blocked(data, admin, expectedVersion);
    if (stop) return stop;
    if (data.delivery !== "lalamove" || !["preparing", "ready"].includes(data.status)) return { conflict: "Record a rider when the delivery is being prepared or is out for delivery." };
    const event: OrderEvent = { at: now.toISOString(), actorUid: admin.uid, action: "revise", previousStatus: data.status, status: data.status, changes: [{ field: "Rider", from: data.rider ? "Recorded" : "Not recorded", to: "Recorded" }] };
    tx.update(ref, { rider, events: withEvent(data, event) });
    return { ok: true };
  });
}

export async function recordStaffNote(admin: AdminIdentity, orderId: string, expectedVersion: number, text: string, now: Date): Promise<Outcome> {
  const { db } = getServerFirebase();
  const ref = db.doc(`orders/${orderId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { missing: true };
    const data = snap.data()!;
    const stop = blocked(data, admin, expectedVersion);
    if (stop) return stop;
    const notes = Array.isArray(data.staffNotes) ? data.staffNotes.filter((note) => note && typeof note.text === "string").slice(-39) : [];
    tx.update(ref, { staffNotes: [...notes, { text, at: now.toISOString(), actorUid: admin.uid }] });
    return { ok: true };
  });
}

export async function recordV2Payment(admin: AdminIdentity, orderId: string, expectedVersion: number, input: { amountCentavos: number; method: PaymentRecord["method"]; reference: string; note: string; kind: "payment" | "refund" }, now: Date): Promise<Outcome> {
  const { db } = getServerFirebase();
  const ref = db.doc(`orders/${orderId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { missing: true };
    const data = snap.data()!;
    const stop = blocked(data, admin, expectedVersion);
    if (stop) return stop;
    const payments = paymentsOf(data);
    const net = netOf(payments);
    if (input.kind === "refund" && input.amountCentavos > net) return { conflict: "A refund cannot be more than the amount recorded." };
    if (data.quoteStatus === "pending" || !Number.isInteger(data.finalTotalCentavos)) return { conflict: "Record a payment after the total is final." };
    const nextNet = input.kind === "refund" ? net - input.amountCentavos : net + input.amountCentavos;
    const payment: PaymentRecord = {
      id: randomBytes(8).toString("hex"),
      at: now.toISOString(),
      actorUid: admin.uid,
      method: input.method,
      amountCentavos: input.amountCentavos,
      kind: input.kind,
      ...(input.reference ? { reference: input.reference } : {}),
      ...(input.note ? { note: input.note } : {}),
    };
    const event: OrderEvent = { at: payment.at, actorUid: admin.uid, action: "settle", previousStatus: data.status, status: data.status, reason: input.kind === "refund" ? "Refund recorded" : "Payment recorded" };
    tx.update(ref, {
      payments: [...payments, payment],
      netReceivedCentavos: nextNet,
      paymentStatus: paymentStatus(nextNet, data.finalTotalCentavos, [...payments, payment]),
      events: withEvent(data, event),
    });
    return { ok: true };
  });
}

export async function voidOrderPayment(admin: AdminIdentity, orderId: string, expectedVersion: number, paymentId: string, reason: string, now: Date): Promise<Outcome> {
  const { db } = getServerFirebase();
  const ref = db.doc(`orders/${orderId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { missing: true };
    const data = snap.data()!;
    const stop = blocked(data, admin, expectedVersion);
    if (stop) return stop;
    const payments = paymentsOf(data).map((payment, index) => ({ ...payment, id: paymentIdentity(payment, index) }));
    const target = payments.find((payment) => payment.id === paymentId);
    if (!target) return { conflict: "That payment is no longer on this order." };
    if (target.voidedAt) return { conflict: "That payment is already voided." };
    const next = payments.map((payment) => payment.id === paymentId ? { ...payment, voidedAt: now.toISOString(), voidReason: reason, voidedBy: admin.uid } : payment);
    const net = netOf(next);
    const total = Number.isInteger(data.finalTotalCentavos) ? data.finalTotalCentavos : 0;
    const event: OrderEvent = { at: now.toISOString(), actorUid: admin.uid, action: "settle", previousStatus: data.status, status: data.status, reason: "Payment voided" };
    tx.update(ref, { payments: next, netReceivedCentavos: net, paymentStatus: data.quoteStatus === "finalized" ? paymentStatus(net, total, next) : data.paymentStatus ?? "unpaid", events: withEvent(data, event) });
    return { ok: true };
  });
}
