"use client";

import { Clock } from "lucide-react";
import { useSyncExternalStore } from "react";

import { dayjs } from "@/lib/dayjs";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(id);
}

function getSnapshot() {
  return Date.now();
}

function getServerSnapshot() {
  return 0;
}

function parseHour(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours + minutes / 60;
}

export function KioskStatus({ className }: { className?: string }) {
  const nowMs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const now = nowMs === 0 ? null : dayjs(nowMs).tz(site.timezone);

  let label: string = site.kiosk.hoursLabel;
  let open: boolean | null = null;

  if (now) {
    const current = now.hour() + now.minute() / 60;
    const kioskOpen =
      current >= parseHour(site.kiosk.opens) &&
      current < parseHour(site.kiosk.closes);
    const marketOpen =
      now.day() === 0 &&
      current >= parseHour(site.sundayMarket.opens) &&
      current < parseHour(site.sundayMarket.closes);

    open = kioskOpen;
    if (marketOpen) {
      label = "Sunday Market is on · Butter Chicken Curry pie until 3PM";
    } else if (kioskOpen) {
      label = "Kiosk is open now · until 8PM";
    } else {
      label = "Kiosk hours · daily 10AM — 8PM";
    }
  }

  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 text-sm font-semibold",
        className
      )}
    >
      <Clock className="size-4 shrink-0" aria-hidden />
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          open === true ? "bg-emerald-600" : "bg-charcoal/30"
        )}
        aria-hidden
      />
      {label}
    </p>
  );
}
