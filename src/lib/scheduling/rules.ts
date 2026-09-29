import { businessDateSchema } from "../admin/schemas";
import type { BranchId } from "../branches/schema";
import type { Catalog, Selection } from "../catalog/schema";
import { manilaDate, quoteSelection } from "../catalog/rules";
import { minutesOfDay, type BranchSchedule, type ScheduleSettings } from "./schema";

export type TimeSlot = { id: string; label: string; startsAt: string; endsAt: string };
export type AvailableDate = { date: string; slots: TimeSlot[] };
export function addCalendarDays(date: string, count: number) {
  const d = new Date(`${businessDateSchema.parse(date)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export function timeLabel(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
export function configuredSlots(schedule: BranchSchedule, date: string): TimeSlot[] {
  if (!businessDateSchema.safeParse(date).success) return [];
  const result: TimeSlot[] = [];
  for (let start = minutesOfDay(schedule.startTime); start + 60 <= minutesOfDay(schedule.cutoffTime); start += 60) {
    const id = clock(start), end = clock(start + 60);
    result.push({ id, label: `${timeLabel(id)}–${timeLabel(end)}`, startsAt: new Date(`${date}T${id}:00+08:00`).toISOString(), endsAt: new Date(`${date}T${end}:00+08:00`).toISOString() });
  }
  return result;
}
export function slotsForDate(settings: ScheduleSettings, branch: BranchId, date: string, now = new Date()): TimeSlot[] {
  if (!businessDateSchema.safeParse(date).success || !Number.isFinite(now.getTime())) return [];
  const today = manilaDate(now), schedule = settings.branches[branch];
  if (!schedule || !schedule.enabled || date < today || date > addCalendarDays(today, settings.bookingHorizonDays)) return [];
  if (schedule.closedDates.includes(date) || !schedule.openWeekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) return [];
  if (date === today && now.getTime() >= Date.parse(`${date}T${schedule.cutoffTime}:00+08:00`)) return [];
  return configuredSlots(schedule, date).filter((slot) => Date.parse(slot.startsAt) > now.getTime());
}

// Caller scopes the catalog to the branch and ordering mode first.
export function availableOrderDates(settings: ScheduleSettings, branch: BranchId, catalog: Catalog, selection: Omit<Selection, "date">, now = new Date()): AvailableDate[] {
  const today = manilaDate(now), dates: AvailableDate[] = [];
  for (let offset = 0; offset <= settings.bookingHorizonDays; offset++) {
    const date = addCalendarDays(today, offset), slots = slotsForDate(settings, branch, date, now);
    if (!slots.length) continue;
    if (quoteSelection(catalog, { ...selection, date }, today).errors.length) continue;
    dates.push({ date, slots });
  }
  return dates;
}

export function scheduleValidationError(settings: ScheduleSettings, branch: BranchId, date: string, slotId: string, now = new Date()) {
  if (!settings.branches[branch]?.enabled) return "Online dates are not currently available for this branch. Your cart has been kept.";
  if (date > addCalendarDays(manilaDate(now), settings.bookingHorizonDays)) return `Choose a date within ${settings.bookingHorizonDays} days ahead.`;
  if (!slotsForDate(settings, branch, date, now).some((slot) => slot.id === slotId)) return "That date or time slot is no longer available. Choose another available date and time; your cart has been kept.";
  return null;
}
