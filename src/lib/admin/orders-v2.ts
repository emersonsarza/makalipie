import { createHash } from "node:crypto";
import { z } from "zod";
import { AdminAccessError, pagePermissions, type PagePermissions } from "./access";
import { businessDateSchema, businessTimezone, type AdminIdentity } from "./schemas";
import { branchIdSchema } from "../branches/schema";
import { selectionSchema } from "../catalog/schema";
import { manilaDate } from "../catalog/rules";
import type { InboxOrder } from "../orders/schema";
import { paymentMethodSchema } from "../orders/schema";
import { addCalendarDays } from "../scheduling/rules";
import type { ScheduleSettings } from "../scheduling/schema";

/**
 * V2 orders read model and command checks.
 *
 * Counts follow authorized branches only. Date, fulfillment, payment, and
 * search filters do not change the tab counts.
 *
 * Needs action is pending validation, processing, a non-terminal delivery
 * whose fee is not confirmed, and an approved or preparing order whose
 * bakery total is unknown or still unpaid. It is not the dashboard attention queue.
 *
 * Preparation and completion require a final, fully paid bakery total
 * even when an older order is not flagged requireFullPayment.
 * A first-morning after-hours order stays in the overnight list and is
 * marked pickupSoon. Its hold is opening plus the normal hold, not a
 * confirmation buffer that already passed.
 * Boxing is not calculated here.
 * Payment proof files are not accepted here.
 */

export const ORDERS_CACHE_CONTROL = "private, no-store";
export const ORDERS_PAGE_SIZE = 25;
export const orderViews = ["needs-action", "overnight", "today", "upcoming", "ready", "completed", "closed", "all"] as const;
export type OrderView = (typeof orderViews)[number];
export const orderCommandActions = ["processing", "approve", "preparing", "ready", "complete", "delivered", "cancel", "revise", "customerEdit", "requirePayment", "fee", "pickup", "rider", "payment", "refund", "void", "note"] as const;
export type OrderCommandAction = (typeof orderCommandActions)[number];

export class OrdersQueryError extends Error {
  constructor(public readonly status: 400 | 404 | 409, message: string, public readonly code = "invalid") {
    super(message);
    this.name = "OrdersQueryError";
  }
}

const viewSchema = z.enum(orderViews);
const rowSchema = z.object({
  id: z.string().min(1),
  number: z.string().min(1),
  branchId: z.string().min(1),
  branchName: z.string().min(1),
  customer: z.string().nullable(),
  contact: z.string().nullable(),
  fulfillmentDate: z.string(),
  slotId: z.string(),
  slotLabel: z.string(),
  slotStartsAt: z.string(),
  slotEndsAt: z.string(),
  submittedAt: z.string(),
  closedAt: z.string().nullable(),
  status: z.enum(["requested", "processing", "confirmed", "preparing", "ready", "completed", "cancelled", "expired"]),
  fulfillment: z.enum(["pickup", "delivery"]),
  feeConfirmed: z.boolean(),
  feeDestination: z.enum(["with_total", "to_rider"]).nullable(),
  requireFullPayment: z.boolean(),
  customerEditable: z.boolean(),
  submittedAfterHours: z.boolean(),
  pickupSoon: z.boolean(),
  paymentStatus: z.enum(["unpaid", "partially_paid", "paid", "refunded"]),
  collectionCentavos: z.number().int().nonnegative().nullable(),
  refundDueCentavos: z.number().int().nonnegative().nullable(),
  anonymized: z.boolean(),
  sourceView: viewSchema,
}).strict();

const guardSchema = z.object({
  action: z.enum(orderCommandActions),
  code: z.string(),
  message: z.string(),
  severity: z.enum(["block", "warning"]),
}).strict();

export const ordersListSchema = z.object({
  schemaVersion: z.literal(1),
  serverNow: z.string(),
  updatedAt: z.string(),
  counts: z.object({
    "needs-action": z.number().int().nonnegative(),
    overnight: z.number().int().nonnegative(),
    today: z.number().int().nonnegative(),
    upcoming: z.number().int().nonnegative(),
    ready: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    closed: z.number().int().nonnegative(),
    all: z.number().int().nonnegative(),
  }).strict(),
  rows: z.array(rowSchema),
  nextCursor: z.string().nullable(),
  exactMatchId: z.string().nullable(),
  selected: z.object({ id: z.string(), matchesFilters: z.boolean() }).strict().nullable(),
  scope: z.object({ branchIds: z.array(z.string()), timezone: z.literal(businessTimezone) }).strict(),
}).strict();
export type OrdersListResponse = z.infer<typeof ordersListSchema>;

const paymentSchema = z.object({
  id: z.string(),
  at: z.string(),
  actorUid: z.string(),
  method: z.enum(["bank", "gcash", "cash"]),
  amountCentavos: z.number().int().positive(),
  kind: z.enum(["payment", "refund"]),
  reference: z.string().nullable(),
  note: z.string().nullable(),
  voidedAt: z.string().nullable(),
  voidReason: z.string().nullable(),
  voidedBy: z.string().nullable(),
}).strict();

export const orderDetailSchema = z.object({
  id: z.string(),
  number: z.string(),
  version: z.number().int().nonnegative(),
  branchId: z.string(),
  branchName: z.string(),
  customer: z.string().nullable(),
  contact: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  anonymized: z.boolean(),
  anonymizedAt: z.string().nullable(),
  status: rowSchema.shape.status,
  fulfillment: z.enum(["pickup", "delivery"]),
  fulfillmentDate: z.string(),
  slotId: z.string(),
  slotLabel: z.string(),
  slotStartsAt: z.string(),
  slotEndsAt: z.string(),
  submittedAt: z.string(),
  deadline: z.string().nullable(),
  submittedAfterHours: z.boolean(),
  pickupSoon: z.boolean(),
  openingAt: z.string().nullable(),
  requireFullPayment: z.boolean(),
  customerEditable: z.boolean(),
  feeConfirmed: z.boolean(),
  feeDestination: z.enum(["with_total", "to_rider"]).nullable(),
  deliveryFeeCentavos: z.number().int().nonnegative().nullable(),
  knownSubtotalCentavos: z.number().int().nonnegative(),
  finalTotalCentavos: z.number().int().nonnegative().nullable(),
  netReceivedCentavos: z.number().int().nonnegative(),
  collectionCentavos: z.number().int().nonnegative().nullable(),
  refundDueCentavos: z.number().int().nonnegative().nullable(),
  paymentStatus: rowSchema.shape.paymentStatus,
  quoteStatus: z.enum(["pending", "finalized"]),
  lines: z.array(z.string()),
  selection: selectionSchema.nullable(),
  payments: z.array(paymentSchema),
  staffNotes: z.array(z.object({ text: z.string(), at: z.string(), actorUid: z.string() }).strict()),
  rider: z.object({ name: z.string(), plate: z.string(), trackingUrl: z.string() }).strict().nullable(),
  cancelReason: z.string().nullable(),
  history: z.array(z.object({
    at: z.string(),
    actorUid: z.string(),
    action: z.string(),
    previousStatus: z.string(),
    status: z.string(),
    reason: z.string().nullable(),
    changes: z.array(z.object({ field: z.string(), from: z.string(), to: z.string() }).strict()),
  }).strict()),
  boxing: z.object({ provenance: z.literal("unavailable") }).strict(),
  mapUrl: z.string().nullable(),
  contactLinks: z.object({ instagram: z.string().nullable(), messenger: z.string().nullable() }).strict(),
}).strict();

export const orderDetailResponseSchema = z.object({
  order: orderDetailSchema,
  version: z.number().int().nonnegative(),
  allowedActions: z.array(z.enum(orderCommandActions)),
  guardReasons: z.array(guardSchema),
  serverNow: z.string(),
}).strict();
export type OrderDetailResponse = z.infer<typeof orderDetailResponseSchema>;

export type StaffNote = { text: string; at: string; actorUid: string };
export type RiderRecord = { name: string; plate: string; trackingUrl: string };
export type OrderExtras = {
  staffNotes: StaffNote[];
  rider: RiderRecord | null;
  anonymizedAt: string | null;
  allocationBlocked: boolean;
  pickupEnabled: boolean;
  branchName: string;
  mapUrl: string | null;
  instagram: string | null;
  messenger: string | null;
};

const httpsUrl = z.string().trim().url().refine((value) => value.startsWith("https://"), "Use an HTTPS link.");

export const orderCommandSchema = z.object({
  orderId: z.string().trim().min(1).max(200),
  action: z.enum(orderCommandActions),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().uuid(),
  payload: z.unknown().optional(),
}).strict();
export type OrderCommand = z.infer<typeof orderCommandSchema>;

export function orderActionAllowed(admin: Pick<AdminIdentity, "role" | "pages">, action: OrderCommandAction) {
  if (admin.role === "owner") return true;
  const grant = admin.pages?.orderActions?.[action];
  return grant !== false;
}

export function resolveOrdersScope(input: {
  admin: Pick<AdminIdentity, "role" | "branchIds" | "pages">;
  branch: string | null;
  now: Date;
  knownBranchIds: readonly string[];
}) {
  const permissions: PagePermissions = pagePermissions(input.admin);
  if (!permissions.orders) throw new AdminAccessError(403, "You don't have access to this page. Ask the owner.");
  if (!input.branch) throw new OrdersQueryError(400, "Choose a branch.");
  const known = new Set(input.knownBranchIds);
  let branchIds: string[];
  if (input.branch === "all") {
    branchIds = input.admin.role === "owner" ? [...known] : input.admin.branchIds.filter((id) => known.has(id));
  } else if (!branchIdSchema.safeParse(input.branch).success) {
    throw new OrdersQueryError(400, "Choose a branch.");
  } else if (input.admin.role !== "owner" && (!known.has(input.branch) || !input.admin.branchIds.includes(input.branch))) {
    throw new AdminAccessError(403, "This account cannot access this branch.");
  } else if (!known.has(input.branch)) {
    throw new OrdersQueryError(400, "Choose a saved branch.");
  } else branchIds = [input.branch];
  branchIds.sort();
  return { branchIds, permissions, timezone: businessTimezone, today: manilaDate(input.now) };
}

export function normalizeOrderView(value: string | null): OrderView {
  if (value && orderViews.includes(value as OrderView)) return value as OrderView;
  if (value === "requested" || value === "processing" || value === "confirmed") return "needs-action";
  if (value === "ready") return "ready";
  if (value === "completed") return "completed";
  if (value === "cancelled" || value === "expired") return "closed";
  return "all";
}

export function normalizeOrderNumber(value: string) {
  const compact = value.trim().toUpperCase().replace(/[\s-]/g, "").replace(/^MK/, "");
  return /^\d+$/.test(compact) ? `MK-${compact}` : null;
}

export function orderVersion(data: {
  status?: unknown;
  events?: unknown;
  payments?: unknown;
  staffNotes?: unknown;
  rider?: unknown;
  customerEditable?: unknown;
  requireFullPayment?: unknown;
  delivery?: unknown;
  deliveryFeeCentavos?: unknown;
  deliveryFeePayment?: unknown;
  deliveryEligibility?: unknown;
  address?: unknown;
  branchId?: unknown;
  fulfillmentDate?: unknown;
  slotId?: unknown;
  selection?: unknown;
  finalTotalCentavos?: unknown;
  netReceivedCentavos?: unknown;
  cancelReason?: unknown;
  anonymized?: unknown;
  notes?: unknown;
}) {
  const basis = JSON.stringify({
    status: data.status ?? "",
    events: data.events ?? [],
    payments: data.payments ?? [],
    staffNotes: data.staffNotes ?? [],
    rider: data.rider ?? null,
    customerEditable: data.customerEditable === true,
    requireFullPayment: data.requireFullPayment === true,
    delivery: data.delivery ?? "",
    deliveryFeeCentavos: data.deliveryFeeCentavos ?? null,
    deliveryFeePayment: data.deliveryFeePayment ?? null,
    deliveryEligibility: data.deliveryEligibility ?? null,
    address: data.address ?? "",
    branchId: data.branchId ?? "",
    fulfillmentDate: data.fulfillmentDate ?? "",
    slotId: data.slotId ?? "",
    selection: data.selection ?? null,
    finalTotalCentavos: data.finalTotalCentavos ?? null,
    netReceivedCentavos: data.netReceivedCentavos ?? null,
    cancelReason: data.cancelReason ?? null,
    anonymized: data.anonymized === true,
    notes: data.notes ?? "",
  });
  return Number.parseInt(createHash("sha256").update(basis).digest("hex").slice(0, 8), 16);
}

export function paymentIdentity(payment: { id?: string; at: string; actorUid: string; amountCentavos: number; method: string; kind?: string }, index: number) {
  if (payment.id) return payment.id;
  return createHash("sha256").update(`${index}|${payment.at}|${payment.actorUid}|${payment.amountCentavos}|${payment.method}|${payment.kind ?? "payment"}`).digest("hex").slice(0, 16);
}

type Dated = { fulfillmentDate: string; slotId: string; id: string; submittedAt: string; status: InboxOrder["status"]; deadline: string; events: InboxOrder["events"] };

export function buildOrdersList(input: {
  now: Date;
  branchIds: string[];
  orders: InboxOrder[];
  names: Map<string, string>;
  schedule: ScheduleSettings | null;
  view: OrderView;
  query: string;
  date: string | null;
  to: string | null;
  fulfillment: "pickup" | "delivery" | null;
  pay: "unpaid" | "partial" | "paid" | "required" | null;
  cursor: string | null;
  selectedId: string | null;
}): OrdersListResponse {
  const cursor = decodeCursor(input.cursor);
  const today = manilaDate(input.now);
  const range = dateRange(input.date, input.to, today);
  const scoped = input.orders.filter((order) => input.branchIds.includes(order.branchId));
  const counts = Object.fromEntries(orderViews.map((view) => [view, scoped.filter((order) => inView(order, view, today)).length])) as OrdersListResponse["counts"];
  const filtered = scoped.filter((order) => matchesFilters(order, input, today, range));
  const searched = input.query.trim()
    ? filtered.filter((order) => matchesSearch(order, input.query, input.now))
    : filtered.filter((order) => inView(order, input.view, today));
  const sorted = [...searched].sort((a, b) => sortKey(a, input.view, input.query.trim() ? "all" : input.view).localeCompare(sortKey(b, input.view, input.query.trim() ? "all" : input.view)));
  const page = slicePage(sorted, cursor, (order) => sortKey(order, input.view, input.query.trim() ? "all" : input.view));
  const number = normalizeOrderNumber(input.query);
  const numbered = number ? scoped.filter((order) => order.orderNumber.toUpperCase() === number) : [];
  const selected = input.selectedId ? scoped.find((order) => order.id === input.selectedId) : undefined;
  const body: OrdersListResponse = {
    schemaVersion: 1,
    serverNow: input.now.toISOString(),
    updatedAt: latestUpdate(scoped) ?? input.now.toISOString(),
    counts,
    rows: page.items.map((order) => listRow(order, input.names, input.schedule, today, input.now)),
    nextCursor: page.nextCursor,
    exactMatchId: numbered.length === 1 ? numbered[0].id : null,
    selected: !input.selectedId ? null : selected ? { id: selected.id, matchesFilters: sorted.some((order) => order.id === selected.id) } : null,
    scope: { branchIds: [...input.branchIds].sort(), timezone: businessTimezone },
  };
  const parsed = ordersListSchema.safeParse(body);
  if (!parsed.success) {
    console.error("Orders list failed validation.", parsed.error.issues.map((issue) => issue.path.join(".")));
    throw new Error("Orders list failed validation.");
  }
  return parsed.data;
}

export function buildOrderDetail(order: InboxOrder, extras: OrderExtras, schedule: ScheduleSettings | null, now: Date, admin: Pick<AdminIdentity, "role" | "pages">): OrderDetailResponse {
  const today = manilaDate(now);
  const hidden = personalHidden(order, now);
  const money = moneyOf(order);
  const version = orderVersion(order);
  const guards = guardReasons(order, extras, schedule, now, admin);
  const blocked = new Set(guards.filter((guard) => guard.severity === "block").map((guard) => guard.action));
  const orderBody = {
    id: order.id,
    number: order.orderNumber,
    version,
    branchId: order.branchId,
    branchName: extras.branchName || order.branchId,
    customer: hidden || !order.customerName.trim() ? null : order.customerName,
    contact: hidden || !order.contact.trim() ? null : order.contact,
    address: hidden || !order.address.trim() ? null : order.address,
    notes: hidden || !order.notes.trim() ? null : order.notes,
    anonymized: hidden,
    anonymizedAt: extras.anonymizedAt,
    status: order.status,
    fulfillment: order.delivery === "lalamove" ? "delivery" as const : "pickup" as const,
    fulfillmentDate: order.fulfillmentDate,
    slotId: order.slotId,
    slotLabel: order.slotLabel,
    ...slotWindow(order.fulfillmentDate, order.slotId),
    submittedAt: order.submittedAt,
    deadline: order.status === "requested" ? order.deadline : null,
    submittedAfterHours: order.submittedAfterHours,
    pickupSoon: isPickupSoon(order, schedule),
    openingAt: order.openingAt ?? null,
    requireFullPayment: order.requireFullPayment,
    customerEditable: order.customerEditable && ["requested", "processing"].includes(order.status),
    feeConfirmed: feeConfirmed(order),
    feeDestination: presentedFeeDestination(order),
    deliveryFeeCentavos: order.delivery === "lalamove" ? order.deliveryFeeCentavos ?? null : null,
    knownSubtotalCentavos: order.knownSubtotalCentavos,
    finalTotalCentavos: order.quoteStatus === "finalized" ? order.finalTotalCentavos : null,
    netReceivedCentavos: money.net,
    collectionCentavos: money.collection,
    refundDueCentavos: money.refundDue,
    paymentStatus: order.paymentStatus,
    quoteStatus: order.quoteStatus,
    lines: hidden ? order.lines.map((line) => line.replace(/:\s*“[^”]*”/g, "")) : order.lines,
    selection: hidden ? scrubSelection(order.selection ?? null) : order.selection ?? null,
    payments: order.payments.map((payment, index) => ({
      id: paymentIdentity(payment, index),
      at: payment.at,
      actorUid: payment.actorUid,
      method: payment.method,
      amountCentavos: payment.amountCentavos,
      kind: payment.kind ?? "payment" as const,
      reference: hidden ? null : payment.reference ?? null,
      note: hidden ? null : payment.note ?? null,
      voidedAt: payment.voidedAt ?? null,
      voidReason: payment.voidReason ?? null,
      voidedBy: payment.voidedBy ?? null,
    })),
    staffNotes: hidden ? [] : extras.staffNotes,
    rider: order.delivery === "lalamove" ? extras.rider : null,
    cancelReason: hidden ? null : order.cancelReason,
    history: order.events.map((event) => ({
      at: event.at,
      actorUid: event.actorUid,
      action: event.action,
      previousStatus: event.previousStatus,
      status: event.status,
      reason: hidden ? null : event.reason ?? null,
      changes: hidden ? [] : event.changes ?? [],
    })),
    boxing: { provenance: "unavailable" as const },
    mapUrl: hidden ? null : order.delivery === "lalamove" && order.address.trim()
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address.trim())}`
      : extras.mapUrl,
    contactLinks: { instagram: extras.instagram, messenger: extras.messenger },
  };
  void today;
  const body = {
    order: orderBody,
    version,
    allowedActions: orderCommandActions.filter((action) => !blocked.has(action) && orderActionAllowed(admin, action)),
    guardReasons: guards,
    serverNow: now.toISOString(),
  };
  const parsed = orderDetailResponseSchema.safeParse(body);
  if (!parsed.success) {
    console.error("Order detail failed validation.", parsed.error.issues.map((issue) => issue.path.join(".")));
    throw new Error("Order detail failed validation.");
  }
  return parsed.data;
}

export function commandPayload(command: OrderCommand) {
  const payload = command.payload ?? {};
  if (payload && typeof payload === "object" && ("proof" in payload || "proofUrl" in payload)) {
    throw new OrdersQueryError(400, "Payment proof upload is not available.", "proof_unavailable");
  }
  if (["processing", "approve", "preparing", "ready", "complete", "delivered"].includes(command.action)) return {};
  if (command.action === "cancel" || command.action === "void") {
    const parsed = z.object({ reason: z.string().trim().min(1).max(300), paymentId: z.string().trim().min(1).max(80).optional() }).strict().safeParse(payload);
    if (!parsed.success || (command.action === "void" && !parsed.data.paymentId)) throw new OrdersQueryError(400, "Add a reason.");
    return parsed.data;
  }
  if (command.action === "note") {
    const parsed = z.object({ text: z.string().trim().min(1).max(500) }).strict().safeParse(payload);
    if (!parsed.success) throw new OrdersQueryError(400, "Write a staff note.");
    return parsed.data;
  }
  if (command.action === "customerEdit" || command.action === "requirePayment") {
    const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(payload);
    if (!parsed.success) throw new OrdersQueryError(400, "Choose on or off.");
    if (command.action === "requirePayment" && parsed.data.enabled === false) throw new OrdersQueryError(400, "Full payment is required before preparation.");
    return parsed.data;
  }
  if (command.action === "fee") {
    const parsed = z.object({ feeCentavos: z.number().int().nonnegative().max(1_000_000_00), destination: z.enum(["with_total", "to_rider"]) }).strict().safeParse(payload);
    if (!parsed.success) throw new OrdersQueryError(400, "Record the delivery fee and where it is paid.");
    return parsed.data;
  }
  if (command.action === "pickup") {
    const parsed = z.object({ customerAgreed: z.literal(true) }).strict().safeParse(payload);
    if (!parsed.success) throw new OrdersQueryError(400, "Record that the customer agreed to change this order to pickup.");
    return parsed.data;
  }
  if (command.action === "rider") {
    const parsed = z.object({
      name: z.string().trim().max(80).optional().default(""),
      plate: z.string().trim().max(40).optional().default(""),
      trackingUrl: z.union([z.literal(""), httpsUrl]).optional().default(""),
    }).strict().safeParse(payload);
    if (!parsed.success) throw new OrdersQueryError(400, "Check the rider name, plate, and tracking link.");
    return parsed.data;
  }
  if (command.action === "payment" || command.action === "refund") {
    const parsed = z.object({
      amountCentavos: z.number().int().positive().max(1_000_000_00),
      method: paymentMethodSchema,
      reference: z.string().trim().max(80).optional().default(""),
      note: z.string().trim().max(300).optional().default(""),
    }).strict().safeParse(payload);
    if (!parsed.success) throw new OrdersQueryError(400, "Record a payment amount and method.");
    return parsed.data;
  }
  if (command.action === "revise") {
    const parsed = z.object({ branchId: branchIdSchema, slotId: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), selection: selectionSchema }).strict().safeParse(payload);
    if (!parsed.success) throw new OrdersQueryError(400, "Choose the branch, time, and pies to keep.");
    return parsed.data;
  }
  throw new OrdersQueryError(400, "This action is not available.");
}

function guardReasons(order: InboxOrder, extras: OrderExtras, schedule: ScheduleSettings | null, now: Date, admin: Pick<AdminIdentity, "role" | "pages">): z.infer<typeof guardSchema>[] {
  const guards: z.infer<typeof guardSchema>[] = [];
  const block = (action: OrderCommandAction, code: string, message: string) => guards.push({ action, code, message, severity: "block" });
  const warn = (action: OrderCommandAction, code: string, message: string) => guards.push({ action, code, message, severity: "warning" });
  const hidden = personalHidden(order, now);
  const money = moneyOf(order);
  void schedule;
  if (hidden || order.anonymized) {
    for (const action of orderCommandActions) block(action, "anonymized", "Personal details were removed. This order can no longer be changed.");
    return guards;
  }
  const settlementGuard = (action: "complete" | "delivered") => {
    if (money.collection === null || money.refundDue === null) block(action, "total_pending", "The total is not final.");
    else if (money.collection > 0) block(action, "payment_required", "Full payment is required before completing this order.");
  };
  const due = order.status === "requested" && Date.parse(order.deadline) <= now.getTime();
  if (order.status !== "requested" || due) block("processing", due ? "hold_expired" : "status", due ? "That hold already expired." : "Start processing from a request that is still pending.");
  if (order.status !== "processing") block("approve", "status", "Approve a request that is in processing.");
  if (order.delivery === "lalamove" && order.deliveryEligibility !== "eligible") block("approve", "fee_unconfirmed", "Confirm the delivery fee first.");
  if (extras.allocationBlocked) block("approve", "allocation", "Allocation is over the saved limit. Revise the order or raise the day's allocation.");
  if (order.status !== "confirmed") block("preparing", "status", "Start preparing from an approved request.");
  if (money.collection === null || money.collection > 0) block("preparing", "payment_required", "Full payment is required before preparing.");
  if (order.status !== "preparing") block("ready", "status", "Mark a request ready after preparation.");
  if (order.status === "preparing" && order.delivery === "lalamove" && !riderRecorded(extras.rider)) warn("ready", "rider_missing", "No rider recorded. You can continue.");
  if (order.status === "ready" && order.delivery === "pickup") settlementGuard("complete");
  else block("complete", "status", "Complete a pickup that is ready.");
  if (order.status === "ready" && order.delivery === "lalamove") settlementGuard("delivered");
  else block("delivered", "status", "Mark a delivery delivered after it is out for delivery.");
  const cancelable = ["requested", "processing", "confirmed", "preparing"].includes(order.status) || (order.status === "ready" && order.delivery === "pickup");
  if (!cancelable) block("cancel", "status", "This order can no longer be cancelled here.");
  const revisable = ["requested", "processing", "confirmed", "preparing"].includes(order.status) || (order.status === "ready" && order.delivery === "pickup");
  if (!revisable) block("revise", order.status === "ready" ? "out_for_delivery" : "status", order.status === "ready" ? "Revise is not available while the order is out for delivery." : "Revise a request before it is completed.");
  if (!["requested", "processing"].includes(order.status)) block("customerEdit", "status", "Customer edits are only available before approval.");
  if (!["requested", "processing", "confirmed"].includes(order.status)) block("requirePayment", "status", "Payment requirements cannot change once preparation starts.");
  if (order.delivery !== "lalamove" || !["requested", "processing", "confirmed"].includes(order.status)) block("fee", "status", "Confirm a delivery fee before preparation.");
  if (order.delivery !== "lalamove" || !["requested", "processing", "confirmed"].includes(order.status)) block("pickup", "status", "Change to pickup before preparation, and only for a delivery order.");
  if (!extras.pickupEnabled) block("pickup", "pickup_unavailable", "Pickup is not available from this branch.");
  if (order.delivery !== "lalamove" || !["preparing", "ready"].includes(order.status)) block("rider", "status", "Record a rider when the delivery is being prepared or is out for delivery.");
  const payable = ["confirmed", "preparing", "ready", "completed"].includes(order.status);
  if (!payable || order.quoteStatus !== "finalized" || order.finalTotalCentavos === null) block("payment", "total_pending", "Record a payment after the total is final.");
  const refundable = ["confirmed", "preparing", "ready", "completed", "cancelled"].includes(order.status);
  if (!refundable) block("refund", "status", "Record a refund on an approved or closed order.");
  if (money.net <= 0) block("refund", "nothing_received", "There is no recorded payment to refund.");
  if (!order.payments.some((payment) => !payment.voidedAt)) block("void", "status", "There is no payment to void.");
  for (const action of orderCommandActions) {
    if (!orderActionAllowed(admin, action)) block(action, "forbidden", "You don't have access to this action. Ask the owner.");
  }
  return guards;
}

function riderRecorded(rider: RiderRecord | null) {
  return !!rider && Boolean(rider.name.trim() || rider.plate.trim() || rider.trackingUrl.trim());
}

function inView(order: InboxOrder, view: OrderView, today: string) {
  const active = ["confirmed", "preparing", "ready"].includes(order.status);
  const money = moneyOf(order);
  switch (view) {
    case "needs-action":
      if (["completed", "cancelled", "expired"].includes(order.status)) return false;
      return order.status === "requested" || order.status === "processing" || (order.delivery === "lalamove" && order.deliveryEligibility !== "eligible") || ((order.status === "confirmed" || order.status === "preparing") && (money.collection === null || money.collection > 0));
    case "overnight":
      return order.status === "requested" && order.submittedAfterHours;
    case "today":
      return active && order.fulfillmentDate === today;
    case "upcoming":
      return active && order.fulfillmentDate > today;
    case "ready":
      return order.status === "ready";
    case "completed":
      return order.status === "completed";
    case "closed":
      return order.status === "cancelled" || order.status === "expired";
    default:
      return true;
  }
}

function sourceView(order: InboxOrder, today: string): OrderView {
  return orderViews.find((view) => view !== "all" && inView(order, view, today)) ?? "all";
}

function matchesFilters(order: InboxOrder, input: { fulfillment: "pickup" | "delivery" | null; pay: "unpaid" | "partial" | "paid" | "required" | null }, today: string, range: { start: string; end: string } | null) {
  void today;
  if (range && (order.fulfillmentDate < range.start || order.fulfillmentDate > range.end)) return false;
  if (input.fulfillment === "pickup" && order.delivery !== "pickup") return false;
  if (input.fulfillment === "delivery" && order.delivery !== "lalamove") return false;
  const money = moneyOf(order);
  if (input.pay === "unpaid" && money.net > 0) return false;
  if (input.pay === "partial" && !(money.net > 0 && (money.collection ?? 0) > 0)) return false;
  if (input.pay === "paid" && !(money.collection === 0 && money.refundDue === 0)) return false;
  if (input.pay === "required" && !(money.collection === null || money.collection > 0)) return false;
  return true;
}

function matchesSearch(order: InboxOrder, query: string, now: Date) {
  const number = normalizeOrderNumber(query);
  if (number) return order.orderNumber.toUpperCase() === number;
  if (personalHidden(order, now)) return false;
  return `${order.customerName} ${order.contact}`.toLowerCase().includes(query.trim().toLowerCase());
}

function dateRange(date: string | null, to: string | null, today: string) {
  if (!date) {
    if (to) throw new OrdersQueryError(400, "Choose a start date before an end date.");
    return null;
  }
  if (date === "today") return { start: today, end: today };
  if (date === "tomorrow") { const next = addCalendarDays(today, 1); return { start: next, end: next }; }
  if (date === "next3") return { start: today, end: addCalendarDays(today, 2) };
  if (date === "week") {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    const start = addCalendarDays(today, weekday === 0 ? -6 : 1 - weekday);
    return { start, end: addCalendarDays(start, 6) };
  }
  if (!businessDateSchema.safeParse(date).success) throw new OrdersQueryError(400, "Choose a valid fulfillment date.");
  const end = to ?? date;
  if (!businessDateSchema.safeParse(end).success || end < date) throw new OrdersQueryError(400, "Choose a valid fulfillment date.");
  if (addCalendarDays(date, 366) < end) throw new OrdersQueryError(400, "Choose a shorter date range.");
  return { start: date, end };
}

function listRow(order: InboxOrder, names: Map<string, string>, schedule: ScheduleSettings | null, today: string, now: Date): z.infer<typeof rowSchema> {
  const hidden = personalHidden(order, now);
  const money = moneyOf(order);
  return {
    id: order.id,
    number: order.orderNumber,
    branchId: order.branchId,
    branchName: names.get(order.branchId) || order.branchId,
    customer: hidden || !order.customerName.trim() ? null : order.customerName,
    contact: hidden || !order.contact.trim() ? null : order.contact,
    fulfillmentDate: order.fulfillmentDate,
    slotId: order.slotId,
    slotLabel: order.slotLabel,
    ...slotWindow(order.fulfillmentDate, order.slotId),
    submittedAt: order.submittedAt,
    closedAt: closedAt(order),
    status: order.status,
    fulfillment: order.delivery === "lalamove" ? "delivery" : "pickup",
    feeConfirmed: feeConfirmed(order),
    feeDestination: presentedFeeDestination(order),
    requireFullPayment: order.requireFullPayment,
    customerEditable: order.customerEditable && ["requested", "processing"].includes(order.status),
    submittedAfterHours: order.submittedAfterHours,
    pickupSoon: isPickupSoon(order, schedule),
    paymentStatus: order.paymentStatus,
    collectionCentavos: money.collection,
    refundDueCentavos: money.refundDue,
    anonymized: hidden,
    sourceView: sourceView(order, today),
  };
}

function feeConfirmed(order: InboxOrder) {
  return order.delivery !== "lalamove" || order.deliveryEligibility === "eligible";
}

function presentedFeeDestination(order: InboxOrder): "with_total" | "to_rider" | null {
  if (order.delivery !== "lalamove" || !order.deliveryFeePayment) return null;
  return order.deliveryFeePayment === "to_driver" ? "to_rider" : "with_total";
}

function moneyOf(order: InboxOrder) {
  const net = order.payments.some((payment) => payment.voidedAt)
    ? Math.max(0, order.payments.filter((payment) => !payment.voidedAt).reduce((sum, payment) => sum + (payment.kind === "refund" ? -payment.amountCentavos : payment.amountCentavos), 0))
    : order.netReceivedCentavos;
  if (order.quoteStatus !== "finalized" || order.finalTotalCentavos === null) return { net, collection: null as number | null, refundDue: null as number | null };
  return { net, collection: Math.max(0, order.finalTotalCentavos - net), refundDue: Math.max(0, net - order.finalTotalCentavos) };
}

function personalHidden(order: InboxOrder, now: Date) {
  if (order.anonymized) return true;
  if (!["completed", "cancelled", "expired"].includes(order.status)) return false;
  const start = Date.parse(`${order.fulfillmentDate}T00:00:00+08:00`);
  return Number.isFinite(start) && now.getTime() >= start + 30 * 86400000;
}

function isPickupSoon(order: InboxOrder, schedule: ScheduleSettings | null) {
  const branch = schedule?.branches[order.branchId];
  if (!branch || order.status !== "requested" || !order.submittedAfterHours || !order.openingAt) return false;
  const opening = new Date(order.openingAt);
  if (!Number.isFinite(opening.getTime())) return false;
  return order.fulfillmentDate === manilaDate(opening) && order.slotId === branch.startTime;
}

function closedAt(order: Dated) {
  if (order.status !== "cancelled" && order.status !== "expired") return null;
  const event = [...order.events].reverse().find((item) => item.action === "reject" || item.action === "expire");
  return event?.at ?? order.submittedAt;
}

function slotWindow(date: string, slotId: string) {
  const start = Date.parse(`${date}T${slotId}:00+08:00`);
  return { slotStartsAt: new Date(start).toISOString(), slotEndsAt: new Date(start + 60 * 60 * 1000).toISOString() };
}

function sortKey(order: Dated, requestedView: OrderView, effective: OrderView) {
  const view = effective;
  const slot = `${order.fulfillmentDate}T${order.slotId}|${order.id}`;
  if (view === "needs-action") {
    const group = order.status === "requested" ? "0" : "1";
    const deadline = order.status === "requested" ? order.deadline : "9999-99-99T99:99:99.999Z";
    return `${group}|${deadline}|${slot}`;
  }
  if (view === "overnight" || view === "today" || view === "upcoming" || view === "ready") return `${slot}|${order.submittedAt}`;
  if (view === "completed") return `${invertNumber(order.fulfillmentDate.replaceAll("-", ""))}|${order.slotId}|${order.id}`;
  if (view === "closed") return `${invertTime(closedAt(order) ?? order.submittedAt)}|${order.id}`;
  return `${invertTime(order.submittedAt)}|${order.id}`;
  void requestedView;
}

function invertNumber(value: string) {
  return String(99_999_999 - Number(value)).padStart(8, "0");
}

function invertTime(iso: string) {
  const time = Date.parse(iso);
  return String(9_000_000_000_000_000 - (Number.isFinite(time) ? time : 0)).padStart(16, "0");
}

function latestUpdate(orders: InboxOrder[]) {
  const times = orders.flatMap((order) => [order.submittedAt, ...order.events.map((event) => event.at)]);
  return times.sort().at(-1) ?? null;
}

function scrubSelection(selection: InboxOrder["selection"] | null) {
  if (!selection) return null;
  return {
    ...selection,
    lines: selection.lines.map((line) => ({ ...line, addons: line.addons.map((addon) => ({ ...addon, message: "" })) })),
    addons: selection.addons.map((addon) => ({ ...addon, message: "" })),
  };
}

function decodeCursor(value: string | null) {
  if (value == null) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { v?: unknown; k?: unknown; id?: unknown };
    if (parsed.v !== 1 || typeof parsed.k !== "string" || parsed.k.length > 400 || typeof parsed.id !== "string" || parsed.id.length < 1 || parsed.id.length > 200) {
      throw new OrdersQueryError(400, "The page cursor is not valid.");
    }
    return { k: parsed.k, id: parsed.id };
  } catch (error) {
    if (error instanceof OrdersQueryError) throw error;
    throw new OrdersQueryError(400, "The page cursor is not valid.");
  }
}

function slicePage<T extends { id: string }>(items: T[], cursor: { k: string; id: string } | null, keyOf: (item: T) => string) {
  let start = 0;
  if (cursor) {
    const exact = items.findIndex((item) => item.id === cursor.id && keyOf(item) === cursor.k);
    start = exact >= 0 ? exact + 1 : items.findIndex((item) => keyOf(item) > cursor.k);
    if (start < 0) start = items.length;
  }
  const page = items.slice(start, start + ORDERS_PAGE_SIZE);
  const last = page.at(-1);
  const more = start + page.length < items.length;
  return { items: page, nextCursor: more && last ? Buffer.from(JSON.stringify({ v: 1, k: keyOf(last), id: last.id }), "utf8").toString("base64url") : null };
}
