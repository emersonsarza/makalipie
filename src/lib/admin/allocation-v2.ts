import { z } from "zod";
import { AdminAccessError, pagePermissions } from "./access";
import { businessDateSchema, businessTimezone, type AdminIdentity } from "./schemas";
import { branchIdSchema } from "../branches/schema";
import { availabilityReason } from "../catalog/rules";
import type { Variant } from "../catalog/schema";
import { productIdSchema } from "../products/schema";
import { addCalendarDays } from "../scheduling/rules";
import type { BranchSchedule } from "../scheduling/schema";

/**
 * Daily allocation for one branch and one Manila fulfillment date.
 *
 * Stored rows stay on the existing allocations ledger. Held is the counter
 * order acceptance already maintains. This API does not recount orders and
 * does not treat a package as a pie: selection lines are pie quantities, and
 * add-ons are not lines. There is no package-to-flavor map.
 *
 * Customer availability is unchanged. capacityOpen still treats a missing row
 * and a saved null limit as orderable, and a saved number as the cap. The
 * screen shows those as three modes:
 * - no row: unconfigured
 * - saved null: unlimited
 * - saved number: limited
 * Unconfigured and unlimited therefore remain orderable. Clearing a zero-hold
 * row deletes it and returns it to unconfigured. A row with reservations is
 * not deleted, because that counter is the reservation. Pausing still applies
 * to today only and does not cancel orders.
 */

export const ALLOCATION_CACHE_CONTROL = "private, no-store";
export const ALLOCATION_MAX_QUANTITY = 500;
export const ALLOCATION_PAST_DAYS = 90;
export const ALLOCATION_FUTURE_DAYS = 365;

export class AllocationQueryError extends Error {
  constructor(public readonly status: 400, message: string) {
    super(message);
    this.name = "AllocationQueryError";
  }
}

export class AllocationCommandError extends Error {
  constructor(
    public readonly status: 400 | 403 | 409 | 503,
    public readonly kind: "validation" | "permission" | "conflict" | "network",
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AllocationCommandError";
  }
}

const limitSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("limited"), quantity: z.number().int().min(0).max(ALLOCATION_MAX_QUANTITY) }).strict(),
  z.object({ mode: z.enum(["unconfigured", "unlimited"]), quantity: z.null() }).strict(),
]);

export const allocationCommandSchema = z.object({
  branchId: branchIdSchema,
  date: businessDateSchema,
  expectedDayVersion: z.number().int().nonnegative(),
  changes: z.array(z.object({
    productId: productIdSchema,
    expectedVersion: z.number().int().nonnegative(),
    expectedHeld: z.number().int().nonnegative().nullable(),
    limit: limitSchema,
  }).strict()).max(200),
  paused: z.boolean().optional(),
  acknowledgeBelowHeld: z.boolean(),
  idempotencyKey: z.string().uuid(),
}).strict().refine((command) => command.changes.length > 0 || command.paused !== undefined, "Choose a flavor limit or today's pause.");
export type AllocationCommand = z.infer<typeof allocationCommandSchema>;

export type AllocationPermissions = { edit: boolean; pause: boolean; unlimited: boolean; lowerBelowHeld: boolean };
export type AllocationLimit = z.infer<typeof limitSchema>;
export type AllocationFlavor = {
  id: string;
  name: string;
  active: boolean;
  availableWeekdays: number[];
  unavailableDates: string[];
  variants: { id: string; label: string; active: boolean; minLeadDays: number; availableWeekdays?: number[]; assigned: boolean }[];
};
export type AllocationEntry = {
  exists: boolean;
  readable: boolean;
  limit: number | null;
  held: number | null;
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
};
export type AllocationSnapshot = {
  branchId: string;
  date: string;
  generatedAt: string;
  dayVersion: number;
  intake: "online" | "paused" | "closed" | "unconfigured";
  rows: {
    productId: string;
    name: string;
    sizeSummary: string;
    unit: "pies";
    limit: AllocationLimit;
    held: number | null;
    version: number;
    eligibility: "eligible" | "not-sold" | "lead-time" | "inactive";
    eligibilityNote: string | null;
    editable: boolean;
    updatedAt: string | null;
    updatedBy: string | null;
  }[];
  permissions: AllocationPermissions;
  maximumQuantity: number;
};

const snapshotSchema = z.object({
  branchId: z.string(),
  date: z.string(),
  generatedAt: z.string(),
  dayVersion: z.number().int().nonnegative(),
  intake: z.enum(["online", "paused", "closed", "unconfigured"]),
  rows: z.array(z.object({
    productId: z.string(),
    name: z.string(),
    sizeSummary: z.string(),
    unit: z.literal("pies"),
    limit: limitSchema,
    held: z.number().int().nonnegative().nullable(),
    version: z.number().int().nonnegative(),
    eligibility: z.enum(["eligible", "not-sold", "lead-time", "inactive"]),
    eligibilityNote: z.string().nullable(),
    editable: z.boolean(),
    updatedAt: z.string().nullable(),
    updatedBy: z.string().nullable(),
  }).strict()),
  permissions: z.object({
    edit: z.boolean(),
    pause: z.boolean(),
    unlimited: z.boolean(),
    lowerBelowHeld: z.boolean(),
  }).strict(),
  maximumQuantity: z.literal(ALLOCATION_MAX_QUANTITY),
}).strict();

export function allocationPermissions(admin: Pick<AdminIdentity, "role" | "pages">): AllocationPermissions {
  if (admin.role === "owner") return { edit: true, pause: true, unlimited: true, lowerBelowHeld: true };
  const grant = admin.pages?.allocationActions;
  return {
    edit: grant?.edit === true,
    pause: grant?.pause === true,
    unlimited: grant?.unlimited === true,
    lowerBelowHeld: grant?.lowerBelowHeld === true,
  };
}

export function resolveAllocationScope(input: {
  admin: Pick<AdminIdentity, "role" | "branchIds" | "pages">;
  branch: string | null;
  date: string | null;
  now: Date;
  knownBranchIds: readonly string[];
}) {
  if (!pagePermissions(input.admin).allocation) throw new AdminAccessError(403, "You don't have access to this page. Ask the owner.");
  if (!input.branch || input.branch === "all") throw new AllocationQueryError(400, "Choose one branch.");
  if (!input.date || !realCalendarDate(input.date)) throw new AllocationQueryError(400, "Choose a valid fulfillment date.");
  const today = manilaToday(input.now);
  const earliest = addCalendarDays(today, -ALLOCATION_PAST_DAYS);
  const latest = addCalendarDays(today, ALLOCATION_FUTURE_DAYS);
  if (input.date < earliest || input.date > latest) throw new AllocationQueryError(400, `Choose a fulfillment date between ${earliest} and ${latest}.`);
  const known = new Set(input.knownBranchIds);
  if (!branchIdSchema.safeParse(input.branch).success) throw new AllocationQueryError(400, "Choose one branch.");
  if (input.admin.role !== "owner" && (!known.has(input.branch) || !input.admin.branchIds.includes(input.branch))) {
    throw new AdminAccessError(403, "This account cannot access this branch.");
  }
  if (!known.has(input.branch)) throw new AllocationQueryError(400, "Choose a saved branch.");
  return { branchId: input.branch, date: input.date, today, earliest, latest, timezone: businessTimezone };
}

export function buildAllocationSnapshot(input: {
  now: Date;
  branchId: string;
  date: string;
  permissions: AllocationPermissions;
  schedule: BranchSchedule | null;
  horizonDays: number;
  paused: boolean;
  dayVersion: number;
  flavors: AllocationFlavor[];
  entries: ReadonlyMap<string, AllocationEntry>;
}): AllocationSnapshot {
  const today = manilaToday(input.now);
  const latest = addCalendarDays(today, ALLOCATION_FUTURE_DAYS);
  const flavors = new Map(input.flavors.map((flavor) => [flavor.id, flavor]));
  for (const [productId, entry] of input.entries) {
    if (!entry.exists || flavors.has(productId)) continue;
    flavors.set(productId, { id: productId, name: productId, active: false, availableWeekdays: [], unavailableDates: [], variants: [] });
  }
  const rows = [...flavors.values()]
    .filter((flavor) => flavor.variants.some((variant) => variant.assigned) || input.entries.get(flavor.id)?.exists)
    .map((flavor) => {
      const entry = input.entries.get(flavor.id);
      const readable = entry?.readable !== false;
      const held = !entry?.exists ? 0 : readable ? entry.held : null;
      const assigned = flavor.variants.filter((variant) => variant.assigned);
      const eligibility = eligibilityFor(flavor, assigned, input.date, today, input.horizonDays, input.now);
      return {
        productId: flavor.id,
        name: flavor.name,
        sizeSummary: assigned.length ? assigned.map((variant) => variant.active ? variant.label : `${variant.label} (inactive)`).sort((a, b) => a.localeCompare(b)).join(", ") : "No sizes on the menu",
        unit: "pies" as const,
        limit: limitOf(entry),
        held,
        version: entry?.exists && readable ? entry.version : 0,
        eligibility: eligibility.eligibility,
        eligibilityNote: eligibility.note,
        editable: input.permissions.edit && input.date >= today && input.date <= latest && held !== null && readable && Boolean(entry?.readable ?? true),
        updatedAt: entry?.updatedAt ?? null,
        updatedBy: entry?.updatedBy ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.productId.localeCompare(b.productId));
  const snapshot: AllocationSnapshot = {
    branchId: input.branchId,
    date: input.date,
    generatedAt: input.now.toISOString(),
    dayVersion: input.dayVersion,
    intake: intakeFor(input.schedule, input.date, today, input.horizonDays, input.paused, input.now),
    rows,
    permissions: input.permissions,
    maximumQuantity: ALLOCATION_MAX_QUANTITY,
  };
  const parsed = snapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    console.error("Allocation snapshot failed validation.", parsed.error.issues.map((issue) => issue.path.join(".")));
    throw new Error("Allocation snapshot failed validation.");
  }
  return parsed.data;
}

export type AllocationWrite =
  | { kind: "delete"; productId: string }
  | { kind: "limit"; productId: string; limit: number | null; held: number; version: number }
  | { kind: "pause"; paused: boolean; version: number };

export function assessAllocationSave(input: {
  now: Date;
  command: AllocationCommand;
  permissions: AllocationPermissions;
  scheduleEnabled: boolean;
  dayVersion: number;
  paused: boolean;
  entries: ReadonlyMap<string, AllocationEntry>;
  knownProductIds: ReadonlySet<string>;
}): { ok: true; writes: AllocationWrite[] } | { ok: false; error: AllocationCommandError } {
  const today = manilaToday(input.now);
  const latest = addCalendarDays(today, ALLOCATION_FUTURE_DAYS);
  if (!realCalendarDate(input.command.date)) return { ok: false, error: new AllocationCommandError(400, "validation", "Choose a valid fulfillment date.") };
  if (input.command.date < today) return { ok: false, error: new AllocationCommandError(400, "validation", "Past-date allocation is read-only.") };
  if (input.command.date > latest) return { ok: false, error: new AllocationCommandError(400, "validation", "Choose a date inside the next year.") };
  if (input.command.paused !== undefined && input.command.date !== today) {
    return { ok: false, error: new AllocationCommandError(400, "validation", "Pausing is only available for today. Future closures belong in Schedule.") };
  }
  if (input.command.paused !== undefined && !input.scheduleEnabled) {
    return { ok: false, error: new AllocationCommandError(400, "validation", "Online ordering is not configured for this branch.") };
  }
  const seen = new Set<string>();
  for (const change of input.command.changes) {
    if (seen.has(change.productId)) return { ok: false, error: new AllocationCommandError(400, "validation", "Each flavor can be saved once.", { [change.productId]: "This flavor is listed twice." }) };
    seen.add(change.productId);
  }
  if (input.dayVersion !== input.command.expectedDayVersion) {
    return { ok: false, error: new AllocationCommandError(409, "conflict", "Allocation changed. Refresh before saving.") };
  }
  for (const change of input.command.changes) {
    const entry = input.entries.get(change.productId);
    if (entry?.exists && !entry.readable) return { ok: false, error: new AllocationCommandError(409, "conflict", "Allocation could not be read. Refresh before saving.") };
    const version = entry?.exists ? entry.version : 0;
    const held = entry?.exists ? entry.held : 0;
    if (version !== change.expectedVersion || held !== change.expectedHeld) {
      return { ok: false, error: new AllocationCommandError(409, "conflict", "Reservations changed. Refresh before saving.") };
    }
  }
  if (input.command.changes.length > 0 && !input.permissions.edit) {
    return { ok: false, error: new AllocationCommandError(403, "permission", "You have view-only access to allocation.") };
  }
  if (input.command.paused !== undefined && input.command.paused !== input.paused && !input.permissions.pause) {
    return { ok: false, error: new AllocationCommandError(403, "permission", "You cannot pause online ordering.") };
  }
  if (input.command.changes.some((change) => change.limit.mode === "unlimited") && !input.permissions.unlimited) {
    return { ok: false, error: new AllocationCommandError(403, "permission", "Unlimited allocation is not enabled for your account.") };
  }
  const fields: Record<string, string> = {};
  const writes: AllocationWrite[] = [];
  for (const change of input.command.changes) {
    if (!input.knownProductIds.has(change.productId)) {
      fields[change.productId] = "This flavor is not on this branch.";
      continue;
    }
    const entry = input.entries.get(change.productId);
    const held = entry?.exists ? entry.held : 0;
    if (held === null || change.expectedHeld === null) {
      fields[change.productId] = "Reservations are unavailable. Refresh before changing this allocation.";
      continue;
    }
    if (change.limit.mode === "limited" && change.limit.quantity < held) {
      if (!input.permissions.lowerBelowHeld) {
        return { ok: false, error: new AllocationCommandError(403, "permission", "The limit cannot be lowered below reservations.") };
      }
      if (!input.command.acknowledgeBelowHeld) {
        fields[change.productId] = "Confirm that existing orders stay when the limit is below reservations.";
        continue;
      }
    }
    if (change.limit.mode === "unconfigured") {
      if (!entry?.exists) continue;
      if (held > 0) {
        fields[change.productId] = "This flavor has reservations. Set a quantity or unlimited instead of clearing it.";
        continue;
      }
      writes.push({ kind: "delete", productId: change.productId });
      continue;
    }
    writes.push({
      kind: "limit",
      productId: change.productId,
      limit: change.limit.mode === "limited" ? change.limit.quantity : null,
      held,
      version: change.expectedVersion + 1,
    });
  }
  if (Object.keys(fields).length) {
    return { ok: false, error: new AllocationCommandError(400, "validation", "Correct the allocation fields.", fields) };
  }
  if (input.command.paused !== undefined && input.command.paused !== input.paused) {
    writes.push({ kind: "pause", paused: input.command.paused, version: input.dayVersion + 1 });
  }
  if (!writes.length) return { ok: false, error: new AllocationCommandError(400, "validation", "Those values are already saved.") };
  return { ok: true, writes };
}

function limitOf(entry: AllocationEntry | undefined): AllocationLimit {
  if (!entry?.exists || !entry.readable) return { mode: "unconfigured", quantity: null };
  if (entry.limit === null) return { mode: "unlimited", quantity: null };
  return { mode: "limited", quantity: entry.limit };
}

function eligibilityFor(flavor: AllocationFlavor, assigned: AllocationFlavor["variants"], date: string, today: string, horizonDays: number, now: Date) {
  if (!flavor.variants.length) return { eligibility: "inactive" as const, note: "This flavor is no longer on the menu. Its reservation count is kept." };
  if (!assigned.length) return { eligibility: "inactive" as const, note: "This flavor is not assigned to this branch. Allocation does not assign it." };
  if (!flavor.active || assigned.every((variant) => !variant.active)) {
    return { eligibility: "inactive" as const, note: "This product is inactive. Changing its allocation will not make it orderable." };
  }
  if (date < today) return { eligibility: "not-sold" as const, note: "This date has passed. Saved allocation does not change orders already placed." };
  if (date > addCalendarDays(today, horizonDays)) return { eligibility: "not-sold" as const, note: "This date is outside the ordering window. Allocation does not open it." };
  const reasons = assigned.filter((variant) => variant.active).map((variant) => availabilityReason(flavor, variantAsCatalog(variant), date, 0, manilaToday(now)));
  if (reasons.some((reason) => reason === null)) return { eligibility: "eligible" as const, note: null };
  const lead = reasons.find((reason) => reason?.includes("preparation"));
  if (lead && reasons.every((reason) => reason?.includes("preparation"))) return { eligibility: "lead-time" as const, note: lead };
  return { eligibility: "not-sold" as const, note: reasons.find(Boolean) ?? "This product is not orderable on this date. Changing its allocation will not make it eligible." };
}

function variantAsCatalog(variant: AllocationFlavor["variants"][number]): Variant {
  return {
    id: variant.id,
    label: variant.label,
    pricingMode: "fixed",
    priceCentavos: 0,
    minLeadDays: variant.minLeadDays,
    ...(variant.availableWeekdays ? { availableWeekdays: variant.availableWeekdays } : {}),
    active: variant.active,
    sortOrder: 0,
  };
}

function intakeFor(schedule: BranchSchedule | null, date: string, today: string, horizonDays: number, paused: boolean, now: Date): AllocationSnapshot["intake"] {
  if (!schedule?.enabled) return "unconfigured";
  if (date < today || date > addCalendarDays(today, horizonDays)) return "closed";
  if (date === today && paused) return "paused";
  if (date === today) return openNow(schedule, now) ? "online" : "closed";
  return openDay(schedule, date) ? "online" : "closed";
}

function openDay(schedule: BranchSchedule, date: string) {
  return schedule.openWeekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay()) && !schedule.closedDates.includes(date);
}

function openNow(schedule: BranchSchedule, now: Date) {
  const today = manilaToday(now);
  if (!openDay(schedule, today)) return false;
  const time = now.getTime();
  return time >= Date.parse(`${today}T${schedule.startTime}:00+08:00`) && time < Date.parse(`${today}T${schedule.cutoffTime}:00+08:00`);
}

function manilaToday(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: businessTimezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function realCalendarDate(value: string) {
  if (!businessDateSchema.safeParse(value).success) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
