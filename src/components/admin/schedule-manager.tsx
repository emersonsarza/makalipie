"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BranchRecord, BranchSettings } from "@/lib/branches/schema";
import { manilaDate } from "@/lib/catalog/rules";
import { addCalendarDays, configuredSlots } from "@/lib/scheduling/rules";
import { defaultBranchSchedule, scheduleSettingsSchema, type BranchSchedule, type ScheduleSettings } from "@/lib/scheduling/schema";

const WEEKDAYS = [
  { value: 0, short: "Sun" },
  { value: 1, short: "Mon" },
  { value: 2, short: "Tue" },
  { value: 3, short: "Wed" },
  { value: 4, short: "Thu" },
  { value: 5, short: "Fri" },
  { value: 6, short: "Sat" },
] as const;

function parseIso(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIso(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function slotStarts(schedule: BranchSchedule) {
  return configuredSlots(schedule, "2026-01-01").map((slot) => {
    const [hour, minute] = slot.id.split(":").map(Number);
    const suffix = hour < 12 ? "AM" : "PM";
    const hourLabel = hour % 12 || 12;
    return minute === 0 ? `${hourLabel} ${suffix}` : `${hourLabel}:${String(minute).padStart(2, "0")} ${suffix}`;
  });
}

function placeLabel(branch: BranchRecord) {
  if (branch.address.trim()) return branch.address.trim();
  return branch.id.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function closureParts(iso: string) {
  const date = parseIso(iso);
  return {
    day: date.toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
    weekday: date.toLocaleDateString("en-PH", { weekday: "short" }),
  };
}

export function ScheduleManager({ initialSettings, branches }: { initialSettings: ScheduleSettings; branches: BranchSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [baseline, setBaseline] = useState(initialSettings);
  const [branchId, setBranchId] = useState(branches.branches[0]?.id ?? "cebu");
  const [month, setMonth] = useState(() => parseIso(manilaDate()));
  const [closedView, setClosedView] = useState<"calendar" | "list">("calendar");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(baseline), [baseline, settings]);
  const today = manilaDate();
  const branch = branches.branches.find((item) => item.id === branchId) ?? branches.branches[0];
  const current = branch ? (settings.branches[branch.id] ?? defaultBranchSchedule()) : defaultBranchSchedule();
  const horizonEnd = Number.isInteger(settings.bookingHorizonDays) ? addCalendarDays(today, settings.bookingHorizonDays) : today;
  const upcoming = current.closedDates.filter((iso) => iso >= today).sort();

  function clearStatus() {
    setNotice("");
    setError("");
  }

  function patch(id: string, update: Partial<BranchSchedule>) {
    setSettings((currentSettings) => ({
      ...currentSettings,
      branches: {
        ...currentSettings.branches,
        [id]: { ...(currentSettings.branches[id] ?? defaultBranchSchedule()), ...update },
      },
    }));
    clearStatus();
  }

  function inWindow(iso: string) {
    return iso >= today && iso <= horizonEnd;
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !dirty) return;
    setError("");
    setNotice("");
    const nextBranches: ScheduleSettings["branches"] = {};
    for (const item of branches.branches) {
      const schedule = settings.branches[item.id] ?? defaultBranchSchedule();
      nextBranches[item.id] = { ...schedule, openWeekdays: [...schedule.openWeekdays].sort((a, b) => a - b), closedDates: [...schedule.closedDates].sort() };
    }
    const parsed = scheduleSettingsSchema.safeParse({ ...settings, branches: nextBranches });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.fields ? Object.values(data.fields).join(" ") : data.error || "Could not save the schedule.");
      setSettings(data.settings);
      setBaseline(data.settings);
      setNotice("Schedule saved. Customer dates and slots now follow these settings.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Your changes are still here.");
    } finally {
      setBusy(false);
    }
  }

  if (!branch) return <p role="status">Add a branch before setting online hours.</p>;

  return (
    <form className="schedule-ledger" onSubmit={save}>
      <fieldset disabled={busy} className="schedule-ledger-body">
        <legend className="sr-only">Bakery schedule</legend>
        <div className="schedule-toolbar">
          <div className="schedule-horizon">
            <Label htmlFor="schedule-horizon">Book ahead</Label>
            <Input
              id="schedule-horizon"
              type="number"
              min={1}
              max={365}
              inputMode="numeric"
              value={Number.isNaN(settings.bookingHorizonDays) ? "" : settings.bookingHorizonDays}
              onChange={(event) => {
                setSettings({ ...settings, bookingHorizonDays: event.target.valueAsNumber });
                clearStatus();
              }}
            />
            <span>days</span>
          </div>
          <Button type="submit" variant={dirty ? "default" : "outline"}>
            {busy ? "Saving…" : dirty ? "Save schedule" : "Saved"}
          </Button>
        </div>
        {error ? <p className="schedule-banner schedule-banner-error" role="alert">{error}</p> : null}
        {notice ? <p className="schedule-banner" role="status">{notice}</p> : null}
        <div className="schedule-board">
          <aside className="schedule-rail">
            <div className="schedule-rail-head">
              <h2>Branches ({branches.branches.length})</h2>
            </div>
            <ul>
              {branches.branches.map((item) => {
                const row = settings.branches[item.id] ?? defaultBranchSchedule();
                const count = slotStarts(row).length;
                return (
                  <li key={item.id}>
                    <button type="button" aria-current={item.id === branch.id ? "true" : undefined} onClick={() => setBranchId(item.id)}>
                      <span>
                        <strong>{item.name}</strong>
                        <em>{row.enabled ? `${count} slots · ${placeLabel(item)}` : `Paused · ${placeLabel(item)}`}</em>
                      </span>
                      <i className={row.enabled ? "schedule-dot-on" : "schedule-dot-off"} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
          <section className="schedule-detail" aria-label={branch.name}>
            <div className="schedule-detail-head">
              <div>
                <h2>{branch.name}</h2>
                <p>
                  Hours control online pickup and delivery, apart from the shop’s own closing time.
                  {branch.visible ? "" : " This branch is hidden on the site."}
                </p>
              </div>
              <div className="schedule-status" role="radiogroup" aria-label={`Online ordering for ${branch.name}`}>
                <button type="button" role="radio" aria-checked={current.enabled} data-on={current.enabled ? "" : undefined} onClick={() => patch(branch.id, { enabled: true })}>
                  Online
                </button>
                <button type="button" role="radio" aria-checked={!current.enabled} data-off={!current.enabled ? "" : undefined} onClick={() => patch(branch.id, { enabled: false })}>
                  Paused
                </button>
              </div>
            </div>
            <div className="schedule-split">
              <div className="schedule-card schedule-hours">
                <h3>Hours</h3>
                <div className="schedule-times">
                  <div>
                    <Label htmlFor={`${branch.id}-start`}>First slot starts</Label>
                    <Input id={`${branch.id}-start`} type="time" value={current.startTime} onChange={(event) => patch(branch.id, { startTime: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor={`${branch.id}-cutoff`}>Cutoff, last slot ends</Label>
                    <Input id={`${branch.id}-cutoff`} type="time" value={current.cutoffTime} onChange={(event) => patch(branch.id, { cutoffTime: event.target.value })} />
                  </div>
                </div>
                <div className="schedule-days" role="group" aria-label="Open weekdays">
                  {WEEKDAYS.map((day) => {
                    const on = current.openWeekdays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        aria-pressed={on}
                        data-on={on ? "" : undefined}
                        onClick={() => {
                          const openWeekdays = on ? current.openWeekdays.filter((value) => value !== day.value) : [...current.openWeekdays, day.value].sort((a, b) => a - b);
                          patch(branch.id, { openWeekdays });
                        }}
                      >
                        {day.short}
                      </button>
                    );
                  })}
                </div>
                <SlotLine schedule={current} />
              </div>
              <div className="schedule-card schedule-closed">
                <div className="schedule-closed-head">
                  <h3>Closed dates</h3>
                  <div className="schedule-status" role="radiogroup" aria-label="Closed dates view">
                    <button type="button" role="radio" aria-checked={closedView === "calendar"} data-on={closedView === "calendar" ? "" : undefined} onClick={() => setClosedView("calendar")}>
                      Calendar
                    </button>
                    <button type="button" role="radio" aria-checked={closedView === "list"} data-on={closedView === "list" ? "" : undefined} onClick={() => setClosedView("list")}>
                      List
                    </button>
                  </div>
                </div>
                {closedView === "list" ? (
                  upcoming.length ? (
                    <ul className="schedule-closed-list">
                      {upcoming.map((iso) => {
                        const label = closureParts(iso);
                        return (
                          <li key={iso}>
                            <span>
                              {label.day} <em>({label.weekday})</em>
                            </span>
                            <button type="button" aria-label={`Remove ${label.day}`} onClick={() => patch(branch.id, { closedDates: current.closedDates.filter((date) => date !== iso) })}>
                              Remove
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="schedule-help">No upcoming closures. Open days stay bookable.</p>
                  )
                ) : (
                  <>
                    <ul className="schedule-legend">
                      <li><i className="schedule-swatch-open" /> Open</li>
                      <li><i className="schedule-swatch-closed" /> Closed</li>
                    </ul>
                    <Calendar
                      mode="multiple"
                      month={month}
                      onMonthChange={setMonth}
                      selected={current.closedDates.map(parseIso)}
                      onSelect={(days) => {
                        const picked = new Set((days ?? []).map(toIso));
                        const closedDates = current.closedDates.filter((iso) => !inWindow(iso) || picked.has(iso));
                        for (const iso of picked) {
                          if (inWindow(iso) && current.openWeekdays.includes(parseIso(iso).getDay()) && !closedDates.includes(iso)) closedDates.push(iso);
                        }
                        closedDates.sort();
                        if (closedDates.join() === [...current.closedDates].sort().join()) return;
                        patch(branch.id, { closedDates });
                      }}
                      disabled={(date) => !inWindow(toIso(date))}
                      modifiers={{
                        bookable: (date) => {
                          const iso = toIso(date);
                          return inWindow(iso) && current.openWeekdays.includes(parseIso(iso).getDay()) && !current.closedDates.includes(iso);
                        },
                      }}
                      modifiersClassNames={{ bookable: "schedule-bookable" }}
                    />
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      </fieldset>
    </form>
  );
}

function SlotLine({ schedule }: { schedule: BranchSchedule }) {
  const slots = slotStarts(schedule);
  if (!schedule.enabled) return <p className="schedule-slots">Dates stay hidden until this branch is online and saved.</p>;
  if (!slots.length) return <p className="schedule-slots">Enter a start and cutoff with at least one complete hour.</p>;
  return (
    <div className="schedule-slots">
      <p>{slots.length} one-hour slots</p>
      <ul>
        {slots.map((slot) => (
          <li key={slot}>
            <Badge variant="outline">{slot}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
