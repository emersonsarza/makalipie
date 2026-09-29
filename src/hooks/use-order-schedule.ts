"use client";
import { useEffect, useRef, useState } from "react";
import { scheduleSettingsSchema, type ScheduleSettings } from "@/lib/scheduling/schema";

function openDateMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([branch, dates]) => Array.isArray(dates) ? [[branch, dates.filter((date) => typeof date === "string")]] : []));
}

function openProductMap(value: unknown): Record<string, Record<string, string[]>> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([branch, dates]) => {
    if (!dates || typeof dates !== "object" || Array.isArray(dates)) return [];
    const parsed = Object.fromEntries(Object.entries(dates).flatMap(([date, ids]) => Array.isArray(ids) ? [[date, ids.filter((id) => typeof id === "string")]] : []));
    return [[branch, parsed]];
  }));
}

export function useOrderSchedule(initial: ScheduleSettings, initialServerNow: string, initialOpenDates: Record<string, string[]> = {}, initialOpenProducts: Record<string, Record<string, string[]>> = {}) {
  const [settings, setSettings] = useState(initial);
  const [openDates, setOpenDates] = useState(initialOpenDates);
  const [openProducts, setOpenProducts] = useState(initialOpenProducts);
  const [now, setNow] = useState(initialServerNow);
  const [error, setError] = useState("");
  const anchor = useRef<{ server: number; client: number } | null>(null);
  useEffect(() => {
    let disposed = false, refreshing = false;
    anchor.current = { server: Date.parse(initialServerNow), client: Date.now() };
    async function refresh() {
      if (refreshing) return; refreshing = true;
      try {
        const response = await fetch("/api/ordering/schedule", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not refresh dates.");
        const parsed = scheduleSettingsSchema.parse(data.settings);
        if (!Number.isFinite(Date.parse(data.serverNow))) throw new Error("Could not refresh dates.");
        if (!disposed) { anchor.current = { server: Date.parse(data.serverNow), client: Date.now() }; setSettings(parsed); setOpenDates(openDateMap(data.openDates)); setOpenProducts(openProductMap(data.openProducts)); setNow(data.serverNow); setError(""); }
      } catch { if (!disposed) setError("We couldn’t refresh available dates. Your cart is saved on this page. Try refreshing dates again."); }
      finally { refreshing = false; }
    }
    const clockTimer = window.setInterval(() => { if (anchor.current) setNow(new Date(anchor.current.server + Date.now() - anchor.current.client).toISOString()); }, 15_000);
    const refreshTimer = window.setInterval(() => { void refresh(); }, 60_000);
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    window.addEventListener("makalipie-refresh-schedule", focus);
    return () => { disposed = true; window.clearInterval(clockTimer); window.clearInterval(refreshTimer); window.removeEventListener("focus", focus); window.removeEventListener("makalipie-refresh-schedule", focus); };
  }, [initialServerNow]);
  function acceptFreshSettings(next: ScheduleSettings, serverNow: string, dates?: Record<string, string[]>, products?: Record<string, Record<string, string[]>>) {
    const parsed = scheduleSettingsSchema.parse(next);
    if (!Number.isFinite(Date.parse(serverNow))) return;
    anchor.current = { server: Date.parse(serverNow), client: Date.now() };
    setSettings(parsed); setNow(serverNow); setError("");
    if (dates) setOpenDates(openDateMap(dates));
    if (products) setOpenProducts(openProductMap(products));
  }
  return { settings, openDates, openProducts, now: new Date(now), error, acceptFreshSettings, refresh: () => window.dispatchEvent(new Event("makalipie-refresh-schedule")) };
}
