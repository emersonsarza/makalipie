import { createHash } from "node:crypto";
import { z } from "zod";
import { AdminAccessError } from "./access";
import { businessDateSchema, type AdminIdentity } from "./schemas";
import { branchIdSchema, type BranchSettings } from "../branches/schema";
import { manilaDate } from "../catalog/rules";
import type { Selection } from "../catalog/schema";
import type { InboxOrder } from "../orders/schema";

/**
 * Kitchen reads one branch and one Manila date.
 * Requested and processing orders are a separate list. They are not
 * included in preparation totals and cannot be advanced here.
 * Packing follows the confirmed size rules. An unrecognized size stays
 * uncounted until staff confirm it. Package groups are not flattened
 * into that count because orders do not carry a package snapshot yet.
 * Status changes go through the existing order transition.
 */
export const KITCHEN_CACHE_CONTROL = "private, no-store";
export const KITCHEN_POLICY = "separate" as const;

const versionSchema = z.string().regex(/^[0-9]+$/);
export const kitchenCommandSchema = z.object({
  branchId: branchIdSchema,
  date: businessDateSchema,
  orderId: z.string().trim().min(1).max(200),
  expectedVersion: versionSchema,
  expectedRevision: z.string().regex(/^[a-f0-9]{16}$/),
  target: z.enum(["preparing", "ready_pickup", "out_delivery"]),
  acknowledgeMissingRider: z.boolean(),
  idempotencyKey: z.uuid(),
}).strict();
export type KitchenCommand = z.infer<typeof kitchenCommandSchema>;

export type KitchenCatalog = {
  products: Map<string, { name: string; category: "sweet" | "savory"; allergens: string[]; variants: Map<string, string> }>;
  addons: Map<string, string>;
};

export type KitchenOrderInput = {
  id: string;
  orderNumber: string;
  branchId: string;
  fulfillmentDate: string;
  slotId: string;
  slotLabel: string;
  status: InboxOrder["status"];
  delivery: "pickup" | "lalamove";
  requireFullPayment: boolean;
  quoteStatus: "pending" | "finalized";
  finalTotalCentavos: number | null;
  netReceivedCentavos: number;
  paymentStatus: InboxOrder["paymentStatus"];
  notes: string;
  selection: Selection | null;
  riderRecorded: boolean;
  version: string;
};

export type KitchenOrder = {
  id: string;
  number: string;
  version: string;
  status: "approved" | "preparing" | "ready_pickup" | "out_delivery" | "pending" | "processing";
  fulfillment: "pickup" | "delivery";
  slotStart: string;
  slotLabel: string;
  lines: { id: string; productId: string; variantId: string; name: string; size: string; quantity: number; category: "sweet" | "savory"; allergens: string[]; extras: string[] }[];
  contentsComplete: boolean;
  notes: string[];
  extras: string[];
  boxes: { label: string; contents: string }[] | null;
  boxingNote: string | null;
  requireFullPayment: boolean;
  fullyPaid: boolean | null;
  riderRecorded: boolean;
  canAdvance: boolean;
  blockReason: string | null;
};

export type KitchenSnapshot = {
  branchId: string;
  date: string;
  revision: string;
  updatedAt: string;
  orders: KitchenOrder[];
  unconfirmedPolicy: typeof KITCHEN_POLICY;
  canAdvance: boolean;
};

export class KitchenQueryError extends Error {
  constructor(readonly status: 400 | 403, message: string) { super(message); this.name = "KitchenQueryError"; }
}
export class KitchenCommandError extends Error {
  constructor(readonly status: 400 | 403 | 409 | 503, readonly kind: "validation" | "permission" | "conflict" | "network", message: string) {
    super(message); this.name = "KitchenCommandError";
  }
}

export function kitchenAccess(admin: Pick<AdminIdentity, "role" | "pages">) {
  const owner = admin.role === "owner";
  const allowed = owner || admin.pages?.kitchen === true;
  return { allowed, canAdvance: owner || (allowed && admin.pages?.kitchenActions?.advance === true) };
}

export function resolveKitchenScope(branch: string | null, date: string | null, admin: Pick<AdminIdentity, "role" | "branchIds" | "pages">, settings: BranchSettings) {
  if (!kitchenAccess(admin).allowed) throw new AdminAccessError(403, "You do not have access to this page.");
  if (!branch || branch === "all") throw new KitchenQueryError(400, "Choose one branch.");
  const parsedBranch = branchIdSchema.safeParse(branch);
  if (!parsedBranch.success || !settings.branches.some((item) => item.id === parsedBranch.data)) throw new KitchenQueryError(400, "Choose a valid branch.");
  if (admin.role !== "owner" && !admin.branchIds.includes(parsedBranch.data)) throw new AdminAccessError(403, "You do not have access to this branch.");
  const parsedDate = businessDateSchema.safeParse(date);
  if (!parsedDate.success) throw new KitchenQueryError(400, "Choose a valid date.");
  return { branchId: parsedBranch.data, date: parsedDate.data };
}

export function presentKitchen(input: {
  branchId: string;
  date: string;
  orders: KitchenOrderInput[];
  catalog: KitchenCatalog;
  access: { canAdvance: boolean };
  now: Date;
}): KitchenSnapshot {
  const today = manilaDate(input.now);
  const readOnly = input.date < today ? "Past-date kitchen records are read-only." : input.access.canAdvance ? null : "You have view-only Kitchen access.";
  const orders = input.orders.flatMap((order) => {
    if (order.branchId !== input.branchId || order.fulfillmentDate !== input.date) return [];
    const presented = presentOrder(order, input.catalog, readOnly);
    return presented ? [presented] : [];
  }).sort((a, b) => a.slotStart.localeCompare(b.slotStart) || a.number.localeCompare(b.number));
  return {
    branchId: input.branchId,
    date: input.date,
    revision: kitchenRevision(input.branchId, input.date, orders),
    updatedAt: input.now.toISOString(),
    orders,
    unconfirmedPolicy: KITCHEN_POLICY,
    canAdvance: readOnly == null,
  };
}

export function planKitchenAdvance(input: { command: KitchenCommand; snapshot: KitchenSnapshot; access: { canAdvance: boolean }; now: Date }) {
  if (!input.access.canAdvance) throw new KitchenCommandError(403, "permission", "You have view-only Kitchen access.");
  if (input.command.date < manilaDate(input.now)) throw new KitchenCommandError(400, "validation", "Past-date kitchen records are read-only.");
  if (input.snapshot.branchId !== input.command.branchId || input.snapshot.date !== input.command.date) throw new KitchenCommandError(409, "conflict", "This kitchen queue changed. Refresh before updating another order.");
  if (input.snapshot.revision !== input.command.expectedRevision) throw new KitchenCommandError(409, "conflict", "This kitchen queue changed. Refresh before updating another order.");
  const order = input.snapshot.orders.find((item) => item.id === input.command.orderId);
  if (!order || order.version !== input.command.expectedVersion) throw new KitchenCommandError(409, "conflict", "This order changed. Refresh the queue and inspect it again.");
  if (!order.contentsComplete) throw new KitchenCommandError(400, "validation", "Order contents are incomplete. Resolve them in Orders first.");
  if (input.command.target === "preparing") {
    if (order.status !== "approved") throw new KitchenCommandError(409, "conflict", "This order changed. Refresh the queue and inspect it again.");
    if (order.fullyPaid !== true) {
      throw new KitchenCommandError(400, "validation", order.fullyPaid === null ? "Payment status is unavailable. Refresh before preparing." : "Full payment is required before preparing. Record payment in Orders.");
    }
    return { action: "preparing" as const, expectedStatus: "confirmed" as const };
  }
  if (order.status !== "preparing") throw new KitchenCommandError(409, "conflict", "This order changed. Refresh the queue and inspect it again.");
  if (input.command.target === "ready_pickup") {
    if (order.fulfillment !== "pickup") throw new KitchenCommandError(400, "validation", "Pickup progress is for pickup orders.");
    return { action: "ready" as const, expectedStatus: "preparing" as const };
  }
  if (order.fulfillment !== "delivery") throw new KitchenCommandError(400, "validation", "Out for delivery is for bakery-booked delivery.");
  if (!order.riderRecorded && !input.command.acknowledgeMissingRider) throw new KitchenCommandError(400, "validation", "Confirm the rider handoff before sending this order out for delivery.");
  return { action: "ready" as const, expectedStatus: "preparing" as const };
}

function presentOrder(order: KitchenOrderInput, catalog: KitchenCatalog, readOnly: string | null): KitchenOrder | null {
  if (!["requested", "processing", "confirmed", "preparing", "ready"].includes(order.status)) return null;
  const unconfirmed = order.status === "requested" || order.status === "processing";
  const status = order.status === "requested" ? "pending" : order.status === "processing" ? "processing" : order.status === "confirmed" ? "approved" : order.status === "preparing" ? "preparing" : order.delivery === "pickup" ? "ready_pickup" : "out_delivery";
  const fulfillment = order.delivery === "pickup" ? "pickup" : "delivery";
  const built = buildLines(order.selection, catalog);
  const paid = paymentState(order);
  const packed = packing(built.lines, built.complete);
  const blockReason = unconfirmed ? "Not confirmed. These orders are excluded from preparation totals." : block(status, paid, built.complete, readOnly);
  const canAdvance = !unconfirmed && readOnly == null && (status === "approved" || status === "preparing") && !blockReason;
  return {
    id: order.id,
    number: order.orderNumber,
    version: order.version,
    status,
    fulfillment,
    slotStart: new Date(`${order.fulfillmentDate}T${order.slotId}:00+08:00`).toISOString(),
    slotLabel: order.slotLabel,
    lines: built.lines,
    contentsComplete: built.complete,
    notes: order.notes.trim() ? [order.notes.trim()] : [],
    extras: built.extras,
    boxes: packed.boxes,
    boxingNote: packed.boxingNote,
    requireFullPayment: true,
    fullyPaid: paid,
    riderRecorded: order.riderRecorded,
    canAdvance,
    blockReason,
  };
}

function buildLines(selection: Selection | null, catalog: KitchenCatalog) {
  if (!selection) return { lines: [], extras: [], complete: false };
  let complete = true;
  const lines = selection.lines.flatMap((line, index) => {
    const product = catalog.products.get(line.productId);
    const size = product?.variants.get(line.variantId);
    if (!product || !size) { complete = false; return []; }
    const extras = line.addons.map((addon) => extraText(catalog, addon.id, addon.message));
    if (extras.some((extra) => extra == null)) complete = false;
    return [{
      id: `${line.productId}:${line.variantId}:${index}`,
      productId: line.productId,
      variantId: line.variantId,
      name: product.name,
      size,
      quantity: line.quantity,
      category: product.category,
      allergens: product.allergens,
      extras: extras.filter((extra): extra is string => extra != null),
    }];
  });
  if (lines.length !== selection.lines.length) complete = false;
  const extras = selection.addons.map((addon) => extraText(catalog, addon.id, addon.message));
  if (extras.some((extra) => extra == null)) complete = false;
  return { lines, extras: extras.filter((extra): extra is string => extra != null), complete };
}

function extraText(catalog: KitchenCatalog, id: string, message: string) {
  const name = catalog.addons.get(id);
  if (!name) return null;
  const text = message.trim();
  return text ? `${name}: ${text}` : name;
}

function paymentState(order: KitchenOrderInput): boolean | null {
  if (order.quoteStatus !== "finalized" || order.finalTotalCentavos == null) return null;
  return order.paymentStatus === "paid" && order.netReceivedCentavos >= order.finalTotalCentavos;
}

const fourInch = /^4(?:[- ]?inch|[″"])?$/i;
const tenInch = /^10(?:[- ]?inch|[″"])?$/i;

function packing(lines: KitchenOrder["lines"], complete: boolean) {
  if (!complete || !lines.length) return { boxes: null, boxingNote: null };
  const unrecognized = lines.some((line) => line.category === "sweet" && !fourInch.test(line.size.trim()) && !tenInch.test(line.size.trim()));
  if (unrecognized) return { boxes: null, boxingNote: "A size needs staff confirmation before it can be packed. No box count was assumed." };
  const small = lines.filter((line) => line.category === "sweet" && fourInch.test(line.size.trim())).reduce((sum, line) => sum + line.quantity, 0);
  const large = lines.filter((line) => tenInch.test(line.size.trim())).reduce((sum, line) => sum + line.quantity, 0);
  const savory = lines.filter((line) => line.category === "savory").reduce((sum, line) => sum + line.quantity, 0);
  const boxes: { label: string; contents: string }[] = [];
  const full = Math.floor(small / 4);
  const remaining = small % 4;
  if (full) boxes.push({ label: full === 1 ? "1 four-pie box" : `${full} four-pie boxes`, contents: `${full * 4} 4-inch sweet pies` });
  if (remaining) boxes.push({ label: remaining === 1 ? "1 individual container" : `${remaining} individual containers`, contents: `${remaining} remaining 4-inch sweet ${remaining === 1 ? "pie" : "pies"}` });
  if (large) boxes.push({ label: large === 1 ? "1 custom box" : `${large} custom boxes`, contents: `${large} large ${large === 1 ? "pie" : "pies"}` });
  if (savory) boxes.push({ label: "Savory, packed separately", contents: `${savory} savory ${savory === 1 ? "pie" : "pies"}` });
  return { boxes, boxingNote: null };
}

function block(status: KitchenOrder["status"], paid: boolean | null, complete: boolean, readOnly: string | null) {
  if (readOnly) return status === "approved" || status === "preparing" ? readOnly : null;
  if (status === "approved" && paid !== true) return paid === null ? "Payment status is unavailable. Refresh before preparing." : "Full payment is required before preparing. Record payment in Orders.";
  if ((status === "approved" || status === "preparing") && !complete) return "Order contents are incomplete. Resolve them in Orders first.";
  return null;
}

function kitchenRevision(branchId: string, date: string, orders: KitchenOrder[]) {
  return createHash("sha256").update(JSON.stringify({ branchId, date, policy: KITCHEN_POLICY, orders: orders.map((order) => ({ id: order.id, version: order.version, status: order.status })) })).digest("hex").slice(0, 16);
}
