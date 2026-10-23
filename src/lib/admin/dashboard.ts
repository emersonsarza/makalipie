import { z } from "zod";
import { AdminAccessError, pagePermissions, type PagePermissions } from "./access";
import { businessDateSchema, businessTimezone, type AdminIdentity } from "./schemas";
import { branchIdSchema } from "../branches/schema";
import { manilaDate } from "../catalog/rules";
import { flavorCapacityKey, type AllocationDay, type AllocationRecord } from "../orders/allocation";
import type { InboxOrder } from "../orders/schema";
import { addCalendarDays } from "../scheduling/rules";
import type { BranchSchedule, ScheduleSettings } from "../scheduling/schema";

/**
 * Read model for GET /api/admin/dashboard.
 *
 * Dates are Asia/Manila calendar dates, from 90 days before today through
 * 365 days after today. Summary and the schedule use the selected fulfillment
 * date. Attention and branch intake are the current operational state, so a
 * past or future date does not replay them.
 *
 * Attention is not the sidebar Needs action count. The sidebar counts pending
 * validation, processing, and unconfirmed delivery fees. This queue also
 * includes allocation, required-payment, and missing-rider warnings, so the
 * two totals must stay separate.
 *
 * Pie counts use the flavor holds written when the order was accepted. Those
 * holds are pie quantities. If a hold list is missing, selection-line
 * quantities are used because order acceptance treats each of those as one
 * pie. There is no package-to-pie map, so a box is never counted as a pie.
 *
 * Q1 is still open. An after-hours order for the first slot on the next
 * opening stays in the overnight queue. It is not blocked and it is not dropped.
 *
 * Ready delivery orders have no stored rider record, so they carry a rider
 * warning. That warning does not block dispatch.
 */

export const DASHBOARD_CACHE_CONTROL = "private, no-store";
export const DASHBOARD_PAST_DAYS = 90;
export const DASHBOARD_FUTURE_DAYS = 365;
export const DASHBOARD_PAGE_SIZE = 25;
const URGENT_HOLD_MS = 10 * 60 * 1000;
const PERSONAL_RETENTION_MS = 30 * 86400000;
const SCHEDULED_STATUSES = new Set(["requested", "processing", "confirmed", "preparing", "ready", "completed"]);
const TERMINAL_STATUSES = new Set(["completed", "cancelled", "expired"]);

export class DashboardQueryError extends Error {
  constructor(public readonly status: 400, message: string) {
    super(message);
    this.name = "DashboardQueryError";
  }
}

const reasonSchema = z.enum(["urgent", "overnight", "fee", "payment", "allocation", "rider"]);
const orderSummarySchema = z.object({
  id: z.string().min(1),
  number: z.string().min(1),
  customer: z.string().nullable(),
  branchId: z.string().min(1),
  branchName: z.string().min(1),
  fulfillmentDate: z.string().min(1),
  slotStartsAt: z.string().min(1),
  slotEndsAt: z.string().min(1),
  quantity: z.number().int().nonnegative(),
  fulfillment: z.enum(["pickup", "delivery"]),
  status: z.enum(["requested", "processing", "confirmed", "preparing", "ready", "completed", "cancelled", "expired"]),
  anonymized: z.boolean(),
}).strict();
const attentionSchema = orderSummarySchema.extend({
  reasons: z.array(reasonSchema).min(1),
  deadline: z.string().nullable(),
  submittedAt: z.string().min(1),
  nextAction: z.string().min(1),
}).strict();
const sectionSchema = z.object({
  state: z.enum(["ready", "error", "forbidden"]),
  updatedAt: z.string().nullable(),
}).strict();

export const dashboardResponseSchema = z.object({
  schemaVersion: z.literal(1),
  scope: z.object({
    branchIds: z.array(z.string()),
    date: z.string(),
    timezone: z.literal(businessTimezone),
  }).strict(),
  generatedAt: z.string(),
  serverNow: z.string(),
  permissions: z.object({
    dashboard: z.boolean(),
    orders: z.boolean(),
    schedule: z.boolean(),
    allocation: z.boolean(),
  }).strict(),
  summary: z.object({
    scheduledOrders: z.number().int().nonnegative(),
    scheduledPies: z.number().int().nonnegative(),
    readyForPickup: z.number().int().nonnegative(),
    completedOrders: z.number().int().nonnegative(),
  }).strict().nullable(),
  attention: z.object({
    totalDistinctOrders: z.number().int().nonnegative(),
    overnightCount: z.number().int().nonnegative(),
    items: z.array(attentionSchema),
    nextCursor: z.string().nullable(),
  }).strict().nullable(),
  fulfillment: z.object({
    total: z.number().int().nonnegative(),
    items: z.array(orderSummarySchema),
    nextCursor: z.string().nullable(),
  }).strict().nullable(),
  branches: z.array(z.object({
    id: z.string(),
    name: z.string(),
    intakeState: z.enum(["online", "paused", "outside_hours", "unconfigured"]),
    hoursLabel: z.string().nullable(),
    nextOpeningAt: z.string().nullable(),
  }).strict()).nullable(),
  availability: z.array(z.object({
    branchId: z.string(),
    productId: z.string(),
    name: z.string(),
    unit: z.literal("pies"),
    allocated: z.number().int().nonnegative().nullable(),
    remaining: z.number().int().nonnegative().nullable(),
    state: z.enum(["available", "sold_out", "unconfigured", "unlimited"]),
  }).strict()).nullable(),
  sections: z.object({
    summary: sectionSchema,
    attention: sectionSchema,
    fulfillment: sectionSchema,
    branches: sectionSchema,
    availability: sectionSchema,
  }).strict(),
}).strict();
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;

export type DashboardProduct = { id: string; name: string; branchIds: string[] };
export type DashboardBranch = { id: string; name: string; hoursLabel: string };

type Cursor = { k: string; id: string };
type Reason = z.infer<typeof reasonSchema>;

export function resolveDashboardScope(input: {
  admin: Pick<AdminIdentity, "role" | "branchIds" | "pages">;
  branch: string | null;
  date: string | null;
  now: Date;
  knownBranchIds: readonly string[];
}) {
  const permissions = pagePermissions(input.admin);
  if (!permissions.dashboard) {
    throw new AdminAccessError(403, "You don't have access to this page. Ask the owner.");
  }
  if (!input.date || !businessDateSchema.safeParse(input.date).success) {
    throw new DashboardQueryError(400, "Choose a valid fulfillment date.");
  }
  const today = manilaDate(input.now);
  const earliest = addCalendarDays(today, -DASHBOARD_PAST_DAYS);
  const latest = addCalendarDays(today, DASHBOARD_FUTURE_DAYS);
  if (input.date < earliest || input.date > latest) {
    throw new DashboardQueryError(400, `Choose a fulfillment date between ${earliest} and ${latest}.`);
  }
  if (!input.branch) throw new DashboardQueryError(400, "Choose a branch.");
  const known = new Set(input.knownBranchIds);
  let branchIds: string[];
  if (input.branch === "all") {
    branchIds = input.admin.role === "owner"
      ? [...known]
      : input.admin.branchIds.filter((id) => known.has(id));
  } else if (!branchIdSchema.safeParse(input.branch).success) {
    throw new DashboardQueryError(400, "Choose a branch.");
  } else if (input.admin.role !== "owner" && (!known.has(input.branch) || !input.admin.branchIds.includes(input.branch))) {
    throw new AdminAccessError(403, "This account cannot access this branch.");
  } else if (!known.has(input.branch)) {
    throw new DashboardQueryError(400, "Choose a saved branch.");
  } else {
    branchIds = [input.branch];
  }
  branchIds.sort();
  return { branchIds, date: input.date, permissions, timezone: businessTimezone };
}

export function buildDashboard(input: {
  now: Date;
  branchIds: string[];
  date: string;
  permissions: PagePermissions;
  orders: InboxOrder[] | null;
  branches: DashboardBranch[] | null;
  schedule: ScheduleSettings | null;
  allocations: AllocationRecord[] | null;
  pauses: AllocationDay[] | null;
  products: DashboardProduct[] | null;
  attentionCursor: string | null;
  fulfillmentCursor: string | null;
}): DashboardResponse {
  const attentionCursor = decodeCursor(input.attentionCursor);
  const fulfillmentCursor = decodeCursor(input.fulfillmentCursor);
  const nowIso = input.now.toISOString();
  const branchIds = [...input.branchIds].sort();
  const names = new Map((input.branches ?? []).map((branch) => [branch.id, branch.name]));
  const orders = (input.orders ?? []).filter((order) => branchIds.includes(order.branchId));
  const ordersReady = input.orders !== null;
  const allocationIndex = new Map((input.allocations ?? []).map((record) => [
    flavorCapacityKey(record.branchId, record.fulfillmentDate, record.productId),
    record,
  ]));

  const dayOrders = orders
    .filter((order) => order.fulfillmentDate === input.date)
    .sort((a, b) => fulfillmentKey(a).localeCompare(fulfillmentKey(b)));
  const scheduled = dayOrders.filter((order) => SCHEDULED_STATUSES.has(order.status));
  const attention = orders
    .flatMap((order) => {
      const item = attentionItem(order, input, names, allocationIndex, input.permissions.allocation);
      return item ? [item] : [];
    })
    .sort((a, b) => attentionKey(a).localeCompare(attentionKey(b)));
  const attentionPage = slicePage(attention, attentionCursor, attentionKey);
  const fulfillmentPage = slicePage(dayOrders.map((order) => orderSummary(order, input.now, names)), fulfillmentCursor, (item) => `${item.slotStartsAt}|${item.id}`);

  const branchesReady = input.branches !== null && input.schedule !== null && input.pauses !== null;
  const allocationAllowed = input.permissions.allocation;
  const availabilityReady = allocationAllowed && input.products !== null && input.allocations !== null;

  const body = {
    schemaVersion: 1 as const,
    scope: { branchIds, date: input.date, timezone: businessTimezone },
    generatedAt: nowIso,
    serverNow: nowIso,
    permissions: input.permissions,
    summary: ordersReady ? {
      scheduledOrders: scheduled.length,
      scheduledPies: scheduled.reduce((sum, order) => sum + pieCount(order), 0),
      readyForPickup: dayOrders.filter((order) => order.status === "ready" && order.delivery === "pickup").length,
      completedOrders: dayOrders.filter((order) => order.status === "completed").length,
    } : null,
    attention: ordersReady ? {
      totalDistinctOrders: attention.length,
      overnightCount: attention.filter((item) => item.reasons.includes("overnight")).length,
      items: attentionPage.items,
      nextCursor: attentionPage.nextCursor,
    } : null,
    fulfillment: ordersReady ? {
      total: dayOrders.length,
      items: fulfillmentPage.items,
      nextCursor: fulfillmentPage.nextCursor,
    } : null,
    branches: branchesReady ? branchPulse(input, branchIds) : null,
    availability: availabilityReady ? productCapacity(input, branchIds, allocationIndex) : null,
    sections: {
      summary: section(ordersReady ? "ready" : "error", input.now),
      attention: section(ordersReady ? "ready" : "error", input.now),
      fulfillment: section(ordersReady ? "ready" : "error", input.now),
      branches: section(branchesReady ? "ready" : "error", input.now),
      availability: section(allocationAllowed ? (availabilityReady ? "ready" : "error") : "forbidden", input.now),
    },
  };
  const parsed = dashboardResponseSchema.safeParse(body);
  if (!parsed.success) {
    console.error("Dashboard response failed validation.", parsed.error.issues.map((issue) => issue.path.join(".")));
    throw new Error("Dashboard response failed validation.");
  }
  return parsed.data;
}

function section(state: "ready" | "error" | "forbidden", now: Date) {
  return { state, updatedAt: state === "ready" ? now.toISOString() : null };
}

function pieCount(order: InboxOrder) {
  if (order.heldFlavors?.length) return order.heldFlavors.reduce((sum, flavor) => sum + flavor.quantity, 0);
  if (order.selection?.lines.length) return order.selection.lines.reduce((sum, line) => sum + line.quantity, 0);
  return 0;
}

function flavorIds(order: InboxOrder) {
  const source = order.heldFlavors?.length ? order.heldFlavors : order.selection?.lines ?? [];
  return [...new Set(source.map((line) => line.productId))];
}

function personalDataHidden(order: InboxOrder, now: Date) {
  if (order.anonymized) return true;
  if (!TERMINAL_STATUSES.has(order.status)) return false;
  const start = Date.parse(`${order.fulfillmentDate}T00:00:00+08:00`);
  return Number.isFinite(start) && now.getTime() >= start + PERSONAL_RETENTION_MS;
}

function slotWindow(date: string, slotId: string) {
  const start = Date.parse(`${date}T${slotId}:00+08:00`);
  return {
    slotStartsAt: new Date(start).toISOString(),
    slotEndsAt: new Date(start + 60 * 60 * 1000).toISOString(),
  };
}

function fulfillmentKey(order: InboxOrder) {
  return `${slotWindow(order.fulfillmentDate, order.slotId).slotStartsAt}|${order.id}`;
}

function orderSummary(order: InboxOrder, now: Date, names: Map<string, string>) {
  const hidden = personalDataHidden(order, now);
  const name = order.customerName.trim();
  return {
    id: order.id,
    number: order.orderNumber,
    customer: hidden || !name ? null : name,
    branchId: order.branchId,
    branchName: names.get(order.branchId) || order.branchId,
    fulfillmentDate: order.fulfillmentDate,
    ...slotWindow(order.fulfillmentDate, order.slotId),
    quantity: pieCount(order),
    fulfillment: order.delivery === "lalamove" ? "delivery" as const : "pickup" as const,
    status: order.status,
    anonymized: hidden,
  };
}

function reasonsFor(order: InboxOrder, now: Date, allocations: Map<string, AllocationRecord> | null, includeAllocation: boolean): Reason[] {
  if (TERMINAL_STATUSES.has(order.status)) return [];
  const reasons: Reason[] = [];
  if (order.status === "requested") {
    const deadline = Date.parse(order.deadline);
    if (Number.isFinite(deadline) && deadline - now.getTime() <= URGENT_HOLD_MS) reasons.push("urgent");
    if (order.submittedAfterHours) reasons.push("overnight");
  }
  if (order.delivery === "lalamove" && order.deliveryEligibility !== "eligible") reasons.push("fee");
  if (includeAllocation && allocations && flavorIds(order).some((productId) => {
    const entry = allocations.get(flavorCapacityKey(order.branchId, order.fulfillmentDate, productId));
    return !!entry && entry.limit != null && entry.held > entry.limit;
  })) reasons.push("allocation");
  if ((order.status === "confirmed" || order.status === "preparing") && (order.quoteStatus !== "finalized" || order.finalTotalCentavos == null || order.netReceivedCentavos < order.finalTotalCentavos)) {
    reasons.push("payment");
  }
  if (order.status === "ready" && order.delivery === "lalamove") reasons.push("rider");
  return reasons;
}

function attentionItem(
  order: InboxOrder,
  input: { now: Date; schedule: ScheduleSettings | null; allocations: AllocationRecord[] | null },
  names: Map<string, string>,
  allocations: Map<string, AllocationRecord>,
  includeAllocation: boolean,
) {
  const reasons = reasonsFor(order, input.now, input.allocations ? allocations : null, includeAllocation);
  if (!reasons.length) return null;
  const summary = orderSummary(order, input.now, names);
  return {
    ...summary,
    reasons,
    deadline: order.status === "requested" ? order.deadline : null,
    submittedAt: order.submittedAt,
    nextAction: headline(order, reasons, input.now, input.schedule),
  };
}

function headline(order: InboxOrder, reasons: Reason[], now: Date, schedule: ScheduleSettings | null) {
  if (reasons.includes("urgent")) {
    const deadline = Date.parse(order.deadline);
    return Number.isFinite(deadline) && deadline <= now.getTime() ? "The hold has ended." : "Validate this order before the hold ends.";
  }
  if (reasons.includes("overnight")) {
    return firstMorningSlot(order, schedule)
      ? "Waiting since last night. Confirm this first morning slot when the branch opens."
      : "Waiting since last night.";
  }
  if (reasons.includes("fee")) return "Confirm the delivery fee.";
  if (reasons.includes("allocation")) return "Allocation is over the saved limit.";
  if (reasons.includes("payment")) return "Full payment is still required.";
  return "Rider details are not recorded.";
}

function firstMorningSlot(order: InboxOrder, schedule: ScheduleSettings | null) {
  const branch = schedule?.branches[order.branchId];
  if (!branch || !order.openingAt) return false;
  const opening = new Date(order.openingAt);
  if (!Number.isFinite(opening.getTime())) return false;
  return order.fulfillmentDate === manilaDate(opening) && order.slotId === branch.startTime;
}

function attentionKey(item: { id: string; reasons: Reason[]; deadline: string | null; submittedAt: string }) {
  const group = item.reasons.includes("urgent") ? "0"
    : item.reasons.includes("overnight") ? "1"
    : item.reasons.some((reason) => reason === "fee" || reason === "allocation" || reason === "payment") ? "2"
    : "3";
  const secondary = group === "0" ? item.deadline ?? "9999-99-99T99:99:99.999Z" : item.submittedAt;
  return `${group}|${secondary}|${item.id}`;
}

function branchPulse(input: { now: Date; branches: DashboardBranch[] | null; schedule: ScheduleSettings | null; pauses: AllocationDay[] | null }, branchIds: string[]) {
  const allowed = new Set(branchIds);
  return (input.branches ?? [])
    .filter((branch) => allowed.has(branch.id))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((branch) => {
      const schedule = input.schedule?.branches[branch.id];
      const hoursLabel = branch.hoursLabel.trim() || (schedule?.enabled ? `${schedule.startTime}–${schedule.cutoffTime}` : null);
      if (!schedule?.enabled) {
        return { id: branch.id, name: branch.name, intakeState: "unconfigured" as const, hoursLabel: hoursLabel || null, nextOpeningAt: null };
      }
      const today = manilaDate(input.now);
      const paused = input.pauses?.some((day) => day.branchId === branch.id && day.fulfillmentDate === today && day.paused) === true;
      const open = openNow(schedule, input.now);
      const intakeState = paused ? "paused" as const : open ? "online" as const : "outside_hours" as const;
      return {
        id: branch.id,
        name: branch.name,
        intakeState,
        hoursLabel,
        nextOpeningAt: open ? null : nextOpening(schedule, input.now),
      };
    });
}

function weekday(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function openDay(schedule: BranchSchedule, date: string) {
  return schedule.openWeekdays.includes(weekday(date)) && !schedule.closedDates.includes(date);
}

function openNow(schedule: BranchSchedule, now: Date) {
  const today = manilaDate(now);
  if (!openDay(schedule, today)) return false;
  const time = now.getTime();
  return time >= Date.parse(`${today}T${schedule.startTime}:00+08:00`) && time < Date.parse(`${today}T${schedule.cutoffTime}:00+08:00`);
}

function nextOpening(schedule: BranchSchedule, now: Date) {
  const today = manilaDate(now);
  for (let offset = 0; offset <= 366; offset += 1) {
    const day = addCalendarDays(today, offset);
    if (!openDay(schedule, day)) continue;
    const candidate = Date.parse(`${day}T${schedule.startTime}:00+08:00`);
    if (candidate > now.getTime()) return new Date(candidate).toISOString();
  }
  return null;
}

function productCapacity(
  input: { date: string; products: DashboardProduct[] | null; allocations: AllocationRecord[] | null },
  branchIds: string[],
  allocations: Map<string, AllocationRecord>,
) {
  const allowed = new Set(branchIds);
  const names = new Map((input.products ?? []).map((product) => [product.id, product.name]));
  const rows = new Map<string, NonNullable<DashboardResponse["availability"]>[number]>();
  function add(branchId: string, productId: string, name: string) {
    if (!allowed.has(branchId)) return;
    const key = `${branchId}:${productId}`;
    if (rows.has(key)) return;
    const entry = allocations.get(flavorCapacityKey(branchId, input.date, productId));
    if (!entry) {
      rows.set(key, { branchId, productId, name, unit: "pies", allocated: null, remaining: null, state: "unconfigured" });
      return;
    }
    if (entry.limit == null) {
      rows.set(key, { branchId, productId, name, unit: "pies", allocated: null, remaining: null, state: "unlimited" });
      return;
    }
    const remaining = Math.max(0, entry.limit - entry.held);
    rows.set(key, {
      branchId,
      productId,
      name,
      unit: "pies",
      allocated: entry.limit,
      remaining,
      state: remaining === 0 ? "sold_out" : "available",
    });
  }
  for (const product of input.products ?? []) {
    for (const branchId of product.branchIds) add(branchId, product.id, product.name);
  }
  for (const entry of input.allocations ?? []) {
    if (entry.fulfillmentDate !== input.date) continue;
    add(entry.branchId, entry.productId, names.get(entry.productId) ?? entry.productId);
  }
  return [...rows.values()].sort((a, b) => a.branchId.localeCompare(b.branchId) || a.name.localeCompare(b.name) || a.productId.localeCompare(b.productId));
}

function decodeCursor(value: string | null): Cursor | null {
  if (value == null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new DashboardQueryError(400, "The page cursor is not valid.");
  }
  if (!parsed || typeof parsed !== "object") throw new DashboardQueryError(400, "The page cursor is not valid.");
  const cursor = parsed as { v?: unknown; k?: unknown; id?: unknown };
  if (cursor.v !== 1 || typeof cursor.k !== "string" || cursor.k.length > 300 || typeof cursor.id !== "string" || cursor.id.length < 1 || cursor.id.length > 200) {
    throw new DashboardQueryError(400, "The page cursor is not valid.");
  }
  return { k: cursor.k, id: cursor.id };
}

function encodeCursor(key: string, id: string) {
  return Buffer.from(JSON.stringify({ v: 1, k: key, id }), "utf8").toString("base64url");
}

function slicePage<T extends { id: string }>(items: T[], cursor: Cursor | null, keyOf: (item: T) => string) {
  let start = 0;
  if (cursor) {
    const exact = items.findIndex((item) => item.id === cursor.id && keyOf(item) === cursor.k);
    start = exact >= 0 ? exact + 1 : items.findIndex((item) => keyOf(item) > cursor.k);
    if (start < 0) start = items.length;
  }
  const page = items.slice(start, start + DASHBOARD_PAGE_SIZE);
  const last = page.at(-1);
  const more = start + page.length < items.length;
  return { items: page, nextCursor: more && last ? encodeCursor(keyOf(last), last.id) : null };
}
