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
    anchor.current = { server: Date.parse(initialServerNow), client: Date.now() };
    const clockTimer = window.setInterval(() => {
      if (anchor.current) setNow(new Date(anchor.current.server + Date.now() - anchor.current.client).toISOString());
    }, 15_000);
    return () => window.clearInterval(clockTimer);
  }, [initialServerNow]);
  function acceptFreshSettings(next: ScheduleSettings, serverNow: string, dates?: Record<string, string[]>, products?: Record<string, Record<string, string[]>>) {
    const parsed = scheduleSettingsSchema.parse(next);
    if (!Number.isFinite(Date.parse(serverNow))) return;
    anchor.current = { server: Date.parse(serverNow), client: Date.now() };
    setSettings(parsed); setNow(serverNow); setError("");
    if (dates) setOpenDates(openDateMap(dates));
    if (products) setOpenProducts(openProductMap(products));
  }
  function refresh() {
    if (anchor.current) setNow(new Date(anchor.current.server + Date.now() - anchor.current.client).toISOString());
    setError("");
  }
  return { settings, openDates, openProducts, now: new Date(now), error, acceptFreshSettings, refresh };
}
