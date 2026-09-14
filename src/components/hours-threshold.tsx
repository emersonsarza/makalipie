"use client";

import { useEffect, useRef, useState } from "react";

import { getHoursSnapshot, type HoursPhase } from "@/lib/hours";
import { cn } from "@/lib/utils";

type HoursThresholdProps = {
  className?: string;
};

export function HoursThreshold({ className }: HoursThresholdProps) {
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [switching, setSwitching] = useState(false);
  const lastPhase = useRef<HoursPhase | null>(null);
  const snapshot = getHoursSnapshot(nowMs);

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (lastPhase.current == null) {
      lastPhase.current = snapshot.id;
      return;
    }
    if (lastPhase.current === snapshot.id) return;
    lastPhase.current = snapshot.id;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setSwitching(true);
    const id = window.setTimeout(() => setSwitching(false), 200);
    return () => window.clearTimeout(id);
  }, [snapshot.id]);

  return (
    <div
      data-phase={snapshot.id}
      className={cn(
        "hours-strip flex items-center justify-between gap-4 border-y-2 border-ink/30 px-4 py-2.5 sm:px-6",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <p
        className="hours-copy font-display min-w-0 leading-none font-bold tracking-[0.04em] uppercase"
        data-switching={switching ? "" : undefined}
      >
        {snapshot.label}
        <span className="mt-1 block font-sans text-[0.8em] font-normal tracking-normal normal-case">
          {snapshot.detail}
        </span>
      </p>
      <span
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          snapshot.id === "closed" ? "bg-paper/55" : "bg-ink"
        )}
        aria-hidden
      />
    </div>
  );
}
