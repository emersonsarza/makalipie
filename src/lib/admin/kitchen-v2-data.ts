import "server-only";
import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { AdminAccessError, isAllowedMutationOrigin } from "../admin/access";
import { requireAdmin } from "../admin/session";
import { readBranchSettings } from "../branches/store";
import { selectionSchema } from "../catalog/schema";
import { getServerFirebase } from "../firebase/server";
import { paymentRecordSchema, type InboxOrder } from "../orders/schema";
import { expireDueHolds, transitionOrder } from "../orders/store";
import { ProductError } from "../products/store";
import { clockTimeSchema } from "../scheduling/schema";
import { orderVersion } from "./orders-v2";
import {
  kitchenAccess, planKitchenAdvance, presentKitchen, resolveKitchenScope, KitchenCommandError, type KitchenCatalog, type KitchenCommand, type KitchenOrderInput,
} from "./kitchen-v2";

const commands = "adminKitchenCommands";
const LOAD_ERROR = "Kitchen couldn't be loaded. Please try again.";

export async function readAdminKitchen(branch: string | null, date: string | null, now = new Date()) {
  const admin = await requireAdmin();
  await expireDueHolds(now).catch((error) => console.error("Kitchen hold expiry failed.", error));
  const settings = await readBranchSettings();
  const scope = resolveKitchenScope(branch, date, admin, settings);
  const orders = await loadOrders(getServerFirebase().db, scope.branchId, scope.date);
  const catalog = await loadCatalog(getServerFirebase().db, orders);
  return presentKitchen({ ...scope, orders, catalog, access: kitchenAccess(admin), now });
}

export async function commitAdminKitchen(request: Request, command: KitchenCommand, now = new Date()) {
  if (!isAllowedMutationOrigin(request, process.env.ADMIN_APP_ORIGIN ?? "")) throw new ProductError(403, "This save could not be verified. Refresh the page and try again.");
  const admin = await requireAdmin();
  const access = kitchenAccess(admin);
  if (!access.allowed) throw new AdminAccessError(403, "You do not have access to this page.");
  const db = getServerFirebase().db;
  const settings = await readBranchSettings();
  resolveKitchenScope(command.branchId, command.date, admin, settings);
  const preview = await snapshotFor(db, command.branchId, command.date, access, now);
  const decision = planKitchenAdvance({ command, snapshot: preview, access, now });
  const claim = await claimCommand(db, command, admin.uid, now);
  if (claim === "replay") return { ok: true as const, snapshot: await snapshotFor(db, command.branchId, command.date, access, now) };
  let completed = false;
  try {
    const orders = await loadOrders(db, command.branchId, command.date);
    const catalog = await loadCatalog(db, orders);
    const snapshot = presentKitchen({ branchId: command.branchId, date: command.date, orders, catalog, access, now });
    planKitchenAdvance({ command, snapshot, access, now });
    const result = await transitionOrder({ orderId: command.orderId, action: decision.action, expectedStatus: decision.expectedStatus, idempotencyKey: command.idempotencyKey }, admin, now) as { conflict?: string };
    if (result.conflict) throw conflictError(result.conflict);
    completed = true;
    await db.collection(commands).doc(command.idempotencyKey).set({ completed: true }, { merge: true });
    return { ok: true as const, snapshot: await snapshotFor(db, command.branchId, command.date, access, now) };
  } catch (error) {
    if (!completed) await db.collection(commands).doc(command.idempotencyKey).delete().catch(() => undefined);
    throw error;
  }
}

async function snapshotFor(db: Firestore, branchId: string, date: string, access: { canAdvance: boolean }, now: Date) {
  const orders = await loadOrders(db, branchId, date);
  const catalog = await loadCatalog(db, orders);
  return presentKitchen({ branchId, date, orders, catalog, access, now });
}

async function loadOrders(db: Firestore, branchId: string, date: string) {
  let snap: FirebaseFirestore.QuerySnapshot;
  try {
    snap = await db.collection("orders").where("branchId", "==", branchId).where("fulfillmentDate", "==", date).limit(501).get();
  } catch (error) {
    console.error("Kitchen order query failed.", error);
    throw new KitchenCommandError(503, "network", LOAD_ERROR);
  }
  if (snap.size > 500) throw new KitchenCommandError(503, "network", LOAD_ERROR);
  return snap.docs.flatMap((doc) => {
    const order = sourceFrom(doc.id, doc.data());
    return order ? [order] : [];
  });
}

function sourceFrom(id: string, data: FirebaseFirestore.DocumentData): KitchenOrderInput | null {
  const status = data.status;
  if (!["requested", "processing", "confirmed", "preparing", "ready"].includes(status)) return null;
  const slot = clockTimeSchema.safeParse(data.slotId);
  const selection = selectionSchema.safeParse(data.selection);
  if (typeof data.orderNumber !== "string" || !slot.success || (data.delivery !== "pickup" && data.delivery !== "lalamove")) throw new KitchenCommandError(503, "network", LOAD_ERROR);
  const commercial = paymentFields(data);
  return {
    id,
    orderNumber: data.orderNumber,
    branchId: String(data.branchId),
    fulfillmentDate: String(data.fulfillmentDate),
    slotId: slot.data,
    slotLabel: typeof data.slotLabel === "string" && data.slotLabel.trim() ? data.slotLabel : slot.data,
    status: status as InboxOrder["status"],
    delivery: data.delivery,
    requireFullPayment: data.requireFullPayment === true,
    quoteStatus: commercial.quoteStatus,
    finalTotalCentavos: commercial.finalTotalCentavos,
    netReceivedCentavos: commercial.netReceivedCentavos,
    paymentStatus: commercial.paymentStatus,
    notes: typeof data.notes === "string" ? data.notes : "",
    selection: selection.success ? selection.data : null,
    riderRecorded: riderRecorded(data.rider),
    version: String(orderVersion({ ...data, rider: data.rider ?? null, staffNotes: data.staffNotes ?? [] })),
  };
}

function paymentFields(data: FirebaseFirestore.DocumentData) {
  const known = Number.isInteger(data.knownSubtotalCentavos) && data.knownSubtotalCentavos >= 0 ? data.knownSubtotalCentavos : 0;
  const quoteStatus = data.quoteStatus === "pending" || data.quoteStatus === "finalized" ? data.quoteStatus : "finalized";
  const finalTotalCentavos = quoteStatus === "pending" ? null : Number.isInteger(data.finalTotalCentavos) && data.finalTotalCentavos >= 0 ? data.finalTotalCentavos : known;
  const payments = Array.isArray(data.payments) ? data.payments.flatMap((payment) => {
    const parsed = paymentRecordSchema.safeParse(payment);
    return parsed.success ? [parsed.data] : [];
  }) : [];
  const active = payments.filter((payment) => !payment.voidedAt);
  const signed = active.reduce((total, payment) => total + (payment.kind === "refund" ? -payment.amountCentavos : payment.amountCentavos), 0);
  const netReceivedCentavos = payments.some((payment) => payment.voidedAt) ? Math.max(0, signed) : Number.isInteger(data.netReceivedCentavos) && data.netReceivedCentavos >= 0 ? data.netReceivedCentavos : Math.max(0, signed);
  const paymentStatus = data.paymentStatus === "unpaid" || data.paymentStatus === "partially_paid" || data.paymentStatus === "paid" || data.paymentStatus === "refunded" ? data.paymentStatus : "unpaid";
  return { quoteStatus, finalTotalCentavos, netReceivedCentavos, paymentStatus } as const;
}

function riderRecorded(rider: unknown) {
  if (!rider || typeof rider !== "object") return false;
  const record = rider as { name?: unknown; plate?: unknown; trackingUrl?: unknown };
  return [record.name, record.plate, record.trackingUrl].some((value) => typeof value === "string" && value.trim());
}

async function loadCatalog(db: Firestore, orders: KitchenOrderInput[]): Promise<KitchenCatalog> {
  const productIds = new Set<string>();
  const addonIds = new Set<string>();
  for (const order of orders) {
    for (const line of order.selection?.lines ?? []) {
      productIds.add(line.productId);
      for (const addon of line.addons) addonIds.add(addon.id);
    }
    for (const addon of order.selection?.addons ?? []) addonIds.add(addon.id);
  }
  const products: KitchenCatalog["products"] = new Map();
  await Promise.all([...productIds].map(async (id) => {
    const [doc, variants] = await Promise.all([db.doc(`products/${id}`).get(), db.collection(`products/${id}/variants`).get()]);
    const data = doc.data();
    if (!doc.exists || !data || (data.category !== "sweet" && data.category !== "savory") || typeof data.name !== "string") return;
    const sizes = new Map<string, string>();
    for (const variant of variants.docs) if (typeof variant.data().label === "string") sizes.set(variant.id, variant.data().label);
    const allergens = Array.isArray(data.allergens) ? data.allergens.filter((item): item is string => typeof item === "string") : [];
    products.set(id, { name: data.name, category: data.category, allergens, variants: sizes });
  }));
  const addons = new Map<string, string>();
  await Promise.all([...addonIds].map(async (id) => {
    const doc = await db.doc(`addons/${id}`).get();
    const name = doc.data()?.name;
    if (typeof name === "string" && name.trim()) addons.set(id, name.trim());
  }));
  return { products, addons };
}

function conflictError(message: string) {
  if (message.includes("payment") || message.includes("Finalize the total")) {
    return new KitchenCommandError(400, "validation", "Full payment is required before preparing. Record payment in Orders.");
  }
  if (message.includes("changed") || message.includes("Reload")) {
    return new KitchenCommandError(409, "conflict", "This order changed. Refresh the queue and inspect it again.");
  }
  return new KitchenCommandError(409, "conflict", message);
}

async function claimCommand(db: Firestore, command: KitchenCommand, uid: string, now: Date) {
  const ref = db.collection(commands).doc(command.idempotencyKey);
  const hash = createHash("sha256").update(JSON.stringify(command)).digest("hex");
  const judge = async (saved: FirebaseFirestore.DocumentData) => {
    if (saved.uid !== uid || saved.hash !== hash) throw new KitchenCommandError(409, "conflict", "This save was already used.");
    if (saved.completed === true) return "replay" as const;
    const orders = await loadOrders(db, command.branchId, command.date);
    const current = orders.find((order) => order.id === command.orderId);
    const advanced = current && current.version !== command.expectedVersion && reached(current, command.target);
    if (advanced) { await ref.set({ completed: true }, { merge: true }); return "replay" as const; }
    await ref.delete();
    return "open" as const;
  };
  const existing = await ref.get();
  if (existing.exists) {
    const judged = await judge(existing.data() ?? {});
    if (judged === "replay") return judged;
  }
  try {
    await ref.create({ uid, hash, completed: false, at: now.toISOString() });
  } catch {
    const again = await ref.get();
    if (!again.exists) throw new KitchenCommandError(409, "conflict", "This save was already used.");
    const judged = await judge(again.data() ?? {});
    if (judged === "replay") return judged;
    await ref.create({ uid, hash, completed: false, at: now.toISOString() });
  }
  return "claimed" as const;
}

function reached(order: KitchenOrderInput, target: KitchenCommand["target"]) {
  if (target === "preparing") return order.status === "preparing";
  return order.status === "ready" && ((target === "ready_pickup" && order.delivery === "pickup") || (target === "out_delivery" && order.delivery === "lalamove"));
}
