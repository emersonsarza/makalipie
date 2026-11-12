import dayjs from "@/lib/dayjs";

type BoundaryDate = { date: string; orderingOpens: string; orderingCutoff: string; pickupEnds?: string; dispatchEnds?: string | null; pickup?: { ends: string }; dispatch?: { ends: string } | null };
type ClockData = {
  schedules?: { opens: string; cutoff: string }[];
  overrides?: { date: string; opens: string | null; cutoff: string | null }[];
  drops?: { dates: BoundaryDate[] }[];
  dates?: BoundaryDate[];
};
/** One timer for the next known boundary, including midnight; no periodic polling. */
export function nextAdminBoundary(values: unknown[], now = Date.now()) {
  const today = dayjs(now).tz("Asia/Manila");
  const candidates = [today.add(1, "day").startOf("day").valueOf()];
  function add(date: string, time?: string | null) {
    if (time) candidates.push(dayjs.tz(`${date} ${time}`, "Asia/Manila").valueOf());
  }
  for (const value of values) {
    const data = value as ClockData | undefined;
    for (const entry of [...(data?.schedules ?? []), ...(data?.overrides ?? [])]) {
      const date = "date" in entry ? entry.date : today.format("YYYY-MM-DD");
      add(date, entry.opens); add(date, entry.cutoff);
    }
    for (const date of [...(data?.drops ?? []).flatMap(drop => drop.dates), ...(data?.dates ?? [])]) {
      // Some published views expose dates as strings rather than schedule records.
      if (typeof date !== "object") continue;
      for (const time of [date.orderingOpens, date.orderingCutoff, date.pickupEnds, date.dispatchEnds, date.pickup?.ends, date.dispatch?.ends]) add(date.date, time);
    }
  }
  return Math.min(...candidates.filter(time => Number.isFinite(time) && time > now));
}
