import { manilaDate } from "../catalog/rules";
import { addCalendarDays, configuredSlots, type TimeSlot } from "../scheduling/rules";
import { minutesOfDay } from "../scheduling/schema";
import type { StoreCatalog, StoreProduct, StoreSection, StoreSize } from "./types";

export type OrderWindow = { opens: string; cutoff: string };

export function clockMinutes(time: string) {
  return minutesOfDay(time.slice(0, 5));
}

export function weekday(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function inSeason(product: Pick<StoreProduct, "seasonStart" | "seasonEnd">, date: string) {
  if (!product.seasonStart || !product.seasonEnd) return true;
  return date >= product.seasonStart && date <= product.seasonEnd;
}

export function branchWindow(catalog: StoreCatalog, locationId: string, date: string): OrderWindow | null {
  const override = catalog.overrides.find((item) => item.locationId === locationId && item.date === date);
  if (override?.closed) return null;
  if (override && !override.closed && override.opens && override.cutoff) return { opens: override.opens.slice(0, 5), cutoff: override.cutoff.slice(0, 5) };
  const schedule = catalog.schedules.find((item) => item.locationId === locationId);
  if (!schedule?.enabled || !schedule.weekdays.includes(weekday(date))) return null;
  return { opens: schedule.opens.slice(0, 5), cutoff: schedule.cutoff.slice(0, 5) };
}

export function slotsForBranch(catalog: StoreCatalog, locationId: string, date: string, now = new Date()): TimeSlot[] {
  const location = catalog.locations.find((item) => item.id === locationId);
  const today = manilaDate(now);
  if (!location || location.kind !== "regular" || !location.acceptingOrders) return [];
  if (date < today || date > addCalendarDays(today, catalog.settings.bookingHorizonDays)) return [];
  const window = branchWindow(catalog, locationId, date);
  if (!window || clockMinutes(window.cutoff) - clockMinutes(window.opens) < 60) return [];
  if (date === today && now.getTime() >= Date.parse(`${date}T${window.cutoff}:00+08:00`)) return [];
  const slots = configuredSlots({ enabled: true, startTime: window.opens, cutoffTime: window.cutoff, openWeekdays: [], closedDates: [] }, date);
  return slots.filter((slot) => Date.parse(slot.startsAt) > now.getTime());
}

export function preparationStart(catalog: StoreCatalog, locationId: string, now = new Date()) {
  const today = manilaDate(now);
  for (let offset = 0; offset <= catalog.settings.bookingHorizonDays; offset += 1) {
    const date = addCalendarDays(today, offset);
    if (slotsForBranch(catalog, locationId, date, now).length) return date;
  }
  return addCalendarDays(today, catalog.settings.bookingHorizonDays + 1);
}

export function sizeEligibleOnDate(catalog: StoreCatalog, product: StoreProduct, size: StoreSize, section: StoreSection | undefined, locationId: string, date: string, now = new Date()) {
  if (!product.enabled || !size.enabled || !size.branchIds.includes(locationId) || !inSeason(product, date)) return false;
  if (!slotsForBranch(catalog, locationId, date, now).length) return false;
  if (size.mode === "regular") return Boolean(section?.weekdays.includes(weekday(date)));
  const start = preparationStart(catalog, locationId, now);
  const lead = catalog.settings.preorderLeadDays;
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
  return days >= lead;
}

export function orderableDates(catalog: StoreCatalog, locationId: string, now = new Date()) {
  const today = manilaDate(now);
  const dates = [];
  for (let offset = 0; offset <= catalog.settings.bookingHorizonDays; offset += 1) {
    const date = addCalendarDays(today, offset);
    const slots = slotsForBranch(catalog, locationId, date, now);
    if (slots.length) dates.push({ date, slots });
  }
  return dates;
}

/** A seasonal product stays on the menu when the season overlaps an open branch day in the horizon, even if ordering is paused. */
export function seasonVisible(catalog: StoreCatalog, product: StoreProduct, locationId: string, now = new Date()) {
  if (!product.seasonStart || !product.seasonEnd) return true;
  const today = manilaDate(now);
  for (let offset = 0; offset <= catalog.settings.bookingHorizonDays; offset += 1) {
    const date = addCalendarDays(today, offset);
    if (inSeason(product, date) && branchWindow(catalog, locationId, date)) return true;
  }
  return false;
}

export function bookableProduct(catalog: StoreCatalog, product: StoreProduct, locationId: string, now = new Date()) {
  const section = catalog.sections.find((item) => item.id === product.sectionId);
  return product.sizes.some((size) => orderableDates(catalog, locationId, now).some((day) => sizeEligibleOnDate(catalog, product, size, section, locationId, day.date, now)));
}
