import type { BranchSchedule } from "@/lib/scheduling/schema";
import type { ShopSettings } from "@/lib/settings/schema";
import { manilaDate } from "@/lib/catalog/rules";
import { configuredSlots } from "@/lib/scheduling/rules";

/**
 * During open hours the hold runs from submission.
 * After hours it runs from the next opening.
 * Both are capped by slot start minus the confirmation buffer.
 * Q1 exception: an after-hours request for the first slot of that
 * fulfillment date does not use a buffer that falls before opening.
 * Staff get the normal hold after they arrive, so the deadline is
 * opening plus holdMinutes and is not already in the past.
 * Later slots keep the ordinary cap. Existing stored deadlines are not rewritten.
 */
export function orderHold(now: Date, schedule: BranchSchedule, date: string, slotId: string, settings: ShopSettings) {
  const today = manilaDate(now);
  const isOpenDay = (day: string) => schedule.openWeekdays.includes(new Date(`${day}T00:00:00Z`).getUTCDay()) && !schedule.closedDates.includes(day);
  const afterHours = !isOpenDay(today) || now.getTime() < Date.parse(`${today}T${schedule.startTime}:00+08:00`) || now.getTime() >= Date.parse(`${today}T${schedule.cutoffTime}:00+08:00`);
  let opening = new Date(`${today}T${schedule.startTime}:00+08:00`);
  if (afterHours) {
    let found = false;
    for (let n = 0; n <= 366; n++) {
      const day = new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
      const candidate = new Date(`${day}T${schedule.startTime}:00+08:00`);
      if (isOpenDay(day) && candidate > now) { opening = candidate; found = true; break; }
    }
    if (!found) throw new Error("No opening date is available. Please contact us.");
  }
  const holdFrom = afterHours ? opening.getTime() : now.getTime();
  const holdDeadline = holdFrom + settings.holdMinutes * 60_000;
  const slotStart = Date.parse(`${date}T${slotId}:00+08:00`);
  const slotCap = slotStart - settings.confirmBeforeSlotMinutes * 60_000;
  const firstSlot = configuredSlots(schedule, date)[0]?.id;
  const firstMorningAfterHours = afterHours && slotId === firstSlot && Number.isFinite(slotCap) && slotCap < opening.getTime();
  const deadlineMs = firstMorningAfterHours ? holdDeadline : Math.min(holdDeadline, slotCap);
  if (!Number.isFinite(deadlineMs)) throw new Error("A reservation requires a valid submission time and duration.");
  return { deadline: new Date(deadlineMs), submittedAfterHours: afterHours, openingAt: opening.toISOString() };
}
