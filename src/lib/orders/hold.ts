import type { BranchSchedule } from "@/lib/scheduling/schema";
import type { ShopSettings } from "@/lib/settings/schema";
import { manilaDate } from "@/lib/catalog/rules";
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
  const deadline = new Date(Math.min((afterHours ? opening.getTime() : now.getTime()) + settings.holdMinutes * 60000, Date.parse(`${date}T${slotId}:00+08:00`) - settings.confirmBeforeSlotMinutes * 60000));
  return { deadline, submittedAfterHours: afterHours, openingAt: opening.toISOString() };
}
