import { businessDateSchema } from "../admin/schemas";
import type { BranchId } from "../branches/schema";
import type { Catalog, Selection } from "../catalog/schema";
import { availabilityReason, manilaDate, quoteSelection } from "../catalog/rules";
import { variantOrderMode } from "../catalog/mode";
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

/** The preparation clock starts at the next date with an orderable branch slot. */
export function preparationStartDate(settings: ScheduleSettings, branch: BranchId, now = new Date()) {
  const today = manilaDate(now);
  for (let offset = 0; offset <= settings.bookingHorizonDays; offset++) {
    const date = addCalendarDays(today, offset);
    if (slotsForDate(settings, branch, date, now).length) return date;
  }
  // No open date in the horizon: positive preparation cannot fit inside it.
  return addCalendarDays(today, settings.bookingHorizonDays + 1);
}

// Caller scopes the catalog to the branch first; it may contain every size.
export function availableOrderDates(settings: ScheduleSettings, branch: BranchId, catalog: Catalog, selection: Omit<Selection, "date">, now = new Date()): AvailableDate[] {
  const today = manilaDate(now), dates: AvailableDate[] = [];
  const preparationStart = preparationStartDate(settings,branch,now);
  for (let offset = 0; offset <= settings.bookingHorizonDays; offset++) {
    const date = addCalendarDays(today, offset), slots = slotsForDate(settings, branch, date, now);
    if (!slots.length) continue;
    if (quoteSelection(catalog, { ...selection, date }, today, {preparationStart}).errors.length) continue;
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

/** Calendar and catalog share eligibility; markers never promise sold-out or closed dates. */
export function orderingDateOptions(settings: ScheduleSettings, branch: BranchId, catalog: Catalog, now = new Date(), options: {intakeEnabled?:boolean; openProducts?:Record<string,string[]>; editingDate?:string} = {}) {
  const preparationStart=preparationStartDate(settings,branch,now);
  const today=manilaDate(now);
  return availableOrderDates(settings,branch,catalog,{lines:[],addons:[]},now).flatMap(date=>{
    const variants=catalog.products.flatMap(product=>product.variants.filter(variant=>{
      if(options.intakeEnabled && !options.openProducts?.[date.date]?.includes(product.id)) return false;
      return !availabilityReason(product,variant,date.date,0,today,{categoryWeekdays:catalog.sections.find(section=>section.id===product.menuCategoryId)?.availableWeekdays,preorderLeadDays:catalog.preorderLeadDays ?? 3,preparationStart});
    }));
    return variants.length || date.date===options.editingDate ? [{...date,preorderAvailable:variants.some(variant=>variantOrderMode(variant)==="preorder")}] : [];
  });
}
