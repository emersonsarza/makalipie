import { createHash } from "node:crypto";
import { z } from "zod";
import { AdminAccessError, pagePermissions } from "./access";
import { type AdminIdentity } from "./schemas";
import { branchIdSchema, type BranchSettings } from "../branches/schema";
import { manilaDate } from "../catalog/rules";
import { dailyCapacityKey } from "../orders/policy";
import { configuredSlots, type TimeSlot } from "../scheduling/rules";
import { branchScheduleSchema, scheduleSettingsSchema, type BranchSchedule, type ScheduleSettings } from "../scheduling/schema";

/**
 * Schedule v2 edits the saved ordering schedule for one branch.
 * A missing schedule document is not filled with the 10:00–19:00 default.
 * `cutoffTime` stays the end of the fulfillment window: `configuredSlots`
 * includes a slot only when that slot finishes at or before the cutoff,
 * so no slot starts at the cutoff. Storefront hours text is the branch
 * `hoursLabel` and is never derived from this window.
 *
 * `enabled: false` is a persistent branch setting. It does not expire and
 * it is not the today-only allocation pause. Today's pause lives on the
 * allocation day, blocks today's capacity, and does not change this
 * document. A schedule save does not cancel, move, or release orders.
 * Hold deadlines and the first-morning-slot question stay unchanged.
 */
export const SCHEDULE_CACHE_CONTROL = "private, no-store";

const revisionSchema = z.string().regex(/^[a-f0-9]{16}$/);
export const scheduleCommandSchema = z.object({
  branchId: branchIdSchema,
  expectedRevision: revisionSchema,
  schedule: branchScheduleSchema,
  bookingHorizonDays: z.number().int().min(1).max(365).optional(),
  idempotencyKey: z.uuid(),
}).strict();
export type ScheduleCommand = z.infer<typeof scheduleCommandSchema>;

export type ScheduleSnapshot = {
  branchId: string;
  revision: string;
  values: { enabled: boolean; startTime: string; cutoffTime: string; openWeekdays: number[]; closedDates: string[]; bookingHorizonDays: string };
  canEdit: boolean;
  canEditBookingWindow: boolean;
  updatedAt: string;
  hoursLabel: string | null;
};

export class ScheduleQueryError extends Error {
  constructor(readonly status: 400 | 404, message: string) { super(message); this.name = "ScheduleQueryError"; }
}
export class ScheduleCommandError extends Error {
  constructor(readonly status: 400 | 403 | 409 | 503, readonly kind: "validation" | "permission" | "conflict" | "network", message: string) {
    super(message); this.name = "ScheduleCommandError";
  }
}

type ScheduleActor = { role: AdminIdentity["role"]; branchIds?: AdminIdentity["branchIds"]; pages?: AdminIdentity["pages"] };

export function scheduleAccess(admin: ScheduleActor) {
  const allowed = pagePermissions({ role: admin.role, pages: admin.pages }).schedule;
  const owner = admin.role === "owner";
  return {
    allowed,
    canEdit: owner || (allowed && admin.pages?.scheduleActions?.edit === true),
    canEditBookingWindow: owner || (allowed && admin.pages?.scheduleActions?.bookingWindow === true),
  };
}

export function resolveScheduleBranch(branch: string | null, admin: ScheduleActor & { branchIds: AdminIdentity["branchIds"] }, settings: BranchSettings) {
  if (!pagePermissions({ role: admin.role, pages: admin.pages }).schedule) throw new AdminAccessError(403, "You do not have access to this page.");
  if (!branch || branch === "all") throw new ScheduleQueryError(400, "Choose one branch.");
  const parsed = branchIdSchema.safeParse(branch);
  if (!parsed.success || !settings.branches.some((item) => item.id === parsed.data)) throw new ScheduleQueryError(400, "Choose a valid branch.");
  if (admin.role !== "owner" && !admin.branchIds.includes(parsed.data)) throw new AdminAccessError(403, "You do not have access to this branch.");
  return parsed.data;
}

export function scheduleRevision(input: { branchId: string; scheduleVersion: number; branchVersion: number; pauseVersion: number; paused: boolean; hoursLabel: string | null }) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16);
}

export function savedBranchSchedule(stored: ScheduleSettings | null, branchId: string) {
  const schedule = stored?.branches[branchId];
  if (!stored || !schedule) throw new ScheduleQueryError(404, "This branch has no saved schedule yet.");
  return schedule;
}

export function presentSchedule(input: {
  branchId: string;
  stored: ScheduleSettings;
  settings: BranchSettings;
  updatedAt: string;
  pause: { paused: boolean; version: number } | null;
  access: { canEdit: boolean; canEditBookingWindow: boolean };
}): ScheduleSnapshot {
  const schedule = savedBranchSchedule(input.stored, input.branchId);
  const branch = input.settings.branches.find((item) => item.id === input.branchId);
  const hoursLabel = branch?.hoursLabel?.trim() || null;
  const pause = input.pause ?? { paused: false, version: 0 };
  return {
    branchId: input.branchId,
    revision: scheduleRevision({
      branchId: input.branchId,
      scheduleVersion: input.stored.version,
      branchVersion: input.settings.version,
      pauseVersion: pause.version,
      paused: pause.paused,
      hoursLabel,
    }),
    values: {
      enabled: schedule.enabled,
      startTime: schedule.startTime,
      cutoffTime: schedule.cutoffTime,
      openWeekdays: schedule.openWeekdays,
      closedDates: schedule.closedDates,
      bookingHorizonDays: String(input.stored.bookingHorizonDays),
    },
    canEdit: input.access.canEdit,
    canEditBookingWindow: input.access.canEditBookingWindow,
    updatedAt: input.updatedAt,
    hoursLabel,
  };
}

export function planScheduleSave(input: {
  command: ScheduleCommand;
  stored: ScheduleSettings | null;
  settings: BranchSettings;
  pause: { paused: boolean; version: number } | null;
  access: { canEdit: boolean; canEditBookingWindow: boolean };
}) {
  if (!input.access.canEdit) throw new ScheduleCommandError(403, "permission", "You have view-only access to this schedule.");
  const stored = input.stored;
  savedBranchSchedule(stored, input.command.branchId);
  if (!stored) throw new ScheduleQueryError(404, "This branch has no saved schedule yet.");
  const snapshot = presentSchedule({ branchId: input.command.branchId, stored, settings: input.settings, updatedAt: "", pause: input.pause, access: input.access });
  if (snapshot.revision !== input.command.expectedRevision) throw new ScheduleCommandError(409, "conflict", "This schedule changed in another editor. Reload before saving again.");
  const schedule = branchScheduleSchema.parse(input.command.schedule);
  const horizon = input.command.bookingHorizonDays;
  if (horizon !== undefined && horizon !== stored.bookingHorizonDays && !input.access.canEditBookingWindow) {
    throw new ScheduleCommandError(403, "permission", "Branch schedule permission does not allow changing the shop-wide booking window.");
  }
  return mergeScheduleSave(stored, input.command.branchId, schedule, horizon ?? stored.bookingHorizonDays);
}

export function mergeScheduleSave(current: ScheduleSettings, branchId: string, schedule: BranchSchedule, bookingHorizonDays: number) {
  return scheduleSettingsSchema.parse({
    version: current.version,
    bookingHorizonDays,
    branches: { ...current.branches, [branchId]: schedule },
  });
}

export function pauseKey(branchId: string, now: Date) {
  return dailyCapacityKey(branchId, manilaDate(now));
}

/** Documents the existing slot boundary. A slot that would start at the cutoff is not included. */
export function windowSlots(schedule: BranchSchedule, date: string): TimeSlot[] {
  return configuredSlots(schedule, date);
}
