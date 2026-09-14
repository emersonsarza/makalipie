import { dayjs } from "@/lib/dayjs";
import { site } from "@/lib/site";

export type HoursPhase = "market" | "buko" | "kiosk" | "closed";

export type HoursSnapshot = {
  id: HoursPhase;
  label: string;
  detail: string;
};

function parseHour(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours + minutes / 60;
}

export function getHoursSnapshot(nowMs: number | null): HoursSnapshot {
  if (nowMs == null || nowMs === 0) {
    return {
      id: "kiosk",
      label: site.kiosk.hoursLabel,
      detail: `${site.kiosk.floor}, ${site.kiosk.place}`,
    };
  }

  const now = dayjs(nowMs).tz(site.timezone);
  const current = now.hour() + now.minute() / 60;
  const weekday = now.day();
  const kioskOpen =
    current >= parseHour(site.kiosk.opens) &&
    current < parseHour(site.kiosk.closes);
  const marketOpen =
    weekday === 0 &&
    current >= parseHour(site.sundayMarket.opens) &&
    current < parseHour(site.sundayMarket.closes);
  const bukoDay = weekday === 5 || weekday === 6 || weekday === 0;

  if (marketOpen) {
    return {
      id: "market",
      label: "Sunday Market is on",
      detail: `${site.sundayMarket.item} until 3PM`,
    };
  }

  if (kioskOpen && bukoDay) {
    return {
      id: "buko",
      label: "Buko window is open",
      detail: "Bestseller · Fri–Sun · message us to secure a pie",
    };
  }

  if (kioskOpen) {
    return {
      id: "kiosk",
      label: "Kiosk is open now",
      detail: `Streetscape until 8PM · ${site.kiosk.floor}`,
    };
  }

  return {
    id: "closed",
    label: "Kiosk is closed",
    detail: "Daily 10AM — 8PM · Buko Fri–Sun",
  };
}
