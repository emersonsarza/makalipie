import { z } from "zod";
import { businessDateSchema } from "../admin/schemas";
import { branchIdSchema } from "../branches/schema";
import { DEFAULT_BOOKING_HORIZON_DAYS } from "../orders/policy";

export const clockTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use a valid time.");
export function minutesOfDay(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}
export const branchScheduleSchema = z.object({
  enabled: z.boolean(),
  startTime: clockTimeSchema,
  cutoffTime: clockTimeSchema,
  openWeekdays: z.array(z.number().int().min(0).max(6)).max(7).refine((days) => new Set(days).size === days.length, "Do not repeat a weekday."),
  closedDates: z.array(businessDateSchema).max(366).refine((days) => new Set(days).size === days.length, "Do not repeat a closed date."),
}).strict().refine((s) => minutesOfDay(s.cutoffTime) - minutesOfDay(s.startTime) >= 60, { message: "Allow at least one full hour between start and cutoff, on the same day.", path: ["cutoffTime"] });
export const scheduleSettingsSchema = z.object({
  version: z.number().int().nonnegative(),
  bookingHorizonDays: z.number().int().min(1).max(365),
  branches: z.record(branchIdSchema, branchScheduleSchema),
}).strict();
export type ScheduleSettings = z.infer<typeof scheduleSettingsSchema>;
export type BranchSchedule = z.infer<typeof branchScheduleSchema>;
export function defaultBranchSchedule(): BranchSchedule {
  return { enabled: false, startTime: "10:00", cutoffTime: "19:00", openWeekdays: [0, 1, 2, 3, 4, 5, 6], closedDates: [] };
}
export function defaultScheduleSettings(): ScheduleSettings {
  return { version: 0, bookingHorizonDays: DEFAULT_BOOKING_HORIZON_DAYS, branches: { cebu: defaultBranchSchedule(), manila: defaultBranchSchedule() } };
}
