"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BranchSettings } from "@/lib/branches/schema";
import type { AllocationDay, AllocationRecord } from "@/lib/orders/allocation";
import { addCalendarDays } from "@/lib/scheduling/rules";

type FlavorOption = { branchId: string; productId: string; name: string };
type DayDraft = { fulfillmentDate: string; limit: string; version: number; held: number };
type PauseDraft = { paused: boolean; version: number };

function flavorKey(branchId: string, productId: string) {
  return `${branchId}:${productId}`;
}

function sundayOfWeek(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return addCalendarDays(iso, -new Date(Date.UTC(year, month - 1, day)).getUTCDay());
}

function dateParts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return {
    day: date.toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" }),
    weekday: date.toLocaleDateString("en-PH", { weekday: "short", timeZone: "UTC" }),
  };
}

function rangeLabel(start: string, end: string) {
  return `${dateParts(start).day} – ${dateParts(end).day}`;
}

function draftFor(branchId: string, productId: string, dates: string[], records: AllocationRecord[]): DayDraft[] {
  return dates.map((fulfillmentDate) => {
    const saved = records.find((record) => record.branchId === branchId && record.productId === productId && record.fulfillmentDate === fulfillmentDate);
    return {
      fulfillmentDate,
      limit: saved?.limit == null ? "" : String(saved.limit),
      version: saved?.version ?? 0,
      held: saved?.held ?? 0,
    };
  });
}

function pauseFor(branchId: string, today: string, pauses: AllocationDay[]): PauseDraft {
  const saved = pauses.find((day) => day.branchId === branchId && day.fulfillmentDate === today);
  return { paused: saved?.paused === true, version: saved?.version ?? 0 };
}

export function AllocationManager({
  branches,
  flavors,
  today,
  horizonDays,
  closedDates,
  initialAllocations,
  initialPauses,
}: {
  branches: BranchSettings;
  flavors: FlavorOption[];
  today: string;
  horizonDays: number;
  closedDates: Record<string, string[]>;
  initialAllocations: AllocationRecord[];
  initialPauses: AllocationDay[];
}) {
  const currentSunday = sundayOfWeek(today);
  const horizonEnd = addCalendarDays(today, horizonDays);
  const lastSunday = sundayOfWeek(horizonEnd);
  const dates = useMemo(() => {
    const spanEnd = addCalendarDays(lastSunday, 6);
    const list: string[] = [];
    for (let date = currentSunday; date <= spanEnd; date = addCalendarDays(date, 1)) list.push(date);
    return list;
  }, [currentSunday, lastSunday]);
  const [branchId, setBranchId] = useState(branches.branches[0]?.id ?? "cebu");
  const [sunday, setSunday] = useState(currentSunday);
  const [query, setQuery] = useState("");
  const [listMode, setListMode] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, DayDraft[]>>(() => Object.fromEntries(flavors.map((flavor) => [flavorKey(flavor.branchId, flavor.productId), draftFor(flavor.branchId, flavor.productId, dates, initialAllocations)])));
  const [baseline, setBaseline] = useState(drafts);
  const [pauses, setPauses] = useState<Record<string, PauseDraft>>(() => Object.fromEntries(branches.branches.map((branch) => [branch.id, pauseFor(branch.id, today, initialPauses)])));
  const [pauseBaseline, setPauseBaseline] = useState(pauses);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const branch = branches.branches.find((item) => item.id === branchId) ?? branches.branches[0];
  const branchFlavors = flavors.filter((flavor) => flavor.branchId === branch?.id);
  const pause = branch ? pauses[branch.id] ?? { paused: false, version: 0 } : { paused: false, version: 0 };
  const savedPause = branch ? pauseBaseline[branch.id] ?? { paused: false, version: 0 } : { paused: false, version: 0 };
  const pauseDirty = pause.paused !== savedPause.paused;
  const dirtyFlavors = branch
    ? branchFlavors.filter((flavor) => JSON.stringify(drafts[flavorKey(branch.id, flavor.productId)]) !== JSON.stringify(baseline[flavorKey(branch.id, flavor.productId)]))
    : [];
  const dirty = dirtyFlavors.length > 0 || pauseDirty;
  const week = Array.from({ length: 7 }, (_, index) => addCalendarDays(sunday, index));
  const closed = new Set(branch ? closedDates[branch.id] ?? [] : []);
  const visibleBranches = branches.branches.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));

  function capCount(id: string) {
    return flavors.filter((flavor) => flavor.branchId === id).reduce((sum, flavor) => {
      const days = drafts[flavorKey(id, flavor.productId)] ?? [];
      return sum + days.filter((day) => day.limit.trim() !== "" && day.fulfillmentDate >= today && day.fulfillmentDate <= horizonEnd).length;
    }, 0);
  }

  function updateDay(productId: string, date: string, limit: string) {
    if (!branch || date < today || date > horizonEnd) return;
    const key = flavorKey(branch.id, productId);
    setDrafts((current) => ({
      ...current,
      [key]: (current[key] ?? []).map((day) => day.fulfillmentDate === date ? { ...day, limit } : day),
    }));
    setNotice("");
    setError("");
  }

  function updatePause(paused: boolean) {
    if (!branch) return;
    setPauses((current) => ({ ...current, [branch.id]: { ...pause, paused } }));
    setNotice("");
    setError("");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!branch || busy || !dirty) return;
    const jobs = dirtyFlavors.map((flavor) => ({
      productId: flavor.productId,
      days: (drafts[flavorKey(branch.id, flavor.productId)] ?? [])
        .filter((day) => day.fulfillmentDate >= today && day.fulfillmentDate <= horizonEnd)
        .map((day) => {
          const trimmed = day.limit.trim();
          return { fulfillmentDate: day.fulfillmentDate, limit: trimmed === "" ? null : Number(trimmed), version: day.version };
        }),
    }));
    if (jobs.some((job) => job.days.some((day) => day.limit !== null && (!Number.isInteger(day.limit) || day.limit < 0 || day.limit > 500)))) {
      setError("Each limit is a whole number from 0 to 500. Leave a day blank to keep that flavor open.");
      return;
    }
    const requests = jobs.map((job, index) => ({ ...job, pause: pauseDirty && index === jobs.length - 1 ? { paused: pause.paused, version: pause.version } : undefined }));
    if (pauseDirty && requests.length === 0 && branchFlavors[0]) {
      requests.push({ productId: branchFlavors[0].productId, days: [], pause: { paused: pause.paused, version: pause.version } });
    }
    if (requests.length === 0) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      for (const job of requests) {
        const response = await fetch("/api/admin/allocation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ branchId: branch.id, productId: job.productId, days: job.days, ...(job.pause ? { pause: job.pause } : {}) }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not save allocation.");
        const records = data.allocations as AllocationRecord[];
        const key = flavorKey(branch.id, job.productId);
        const nextDays = draftFor(branch.id, job.productId, dates, records);
        setDrafts((current) => ({ ...current, [key]: nextDays }));
        setBaseline((current) => ({ ...current, [key]: nextDays }));
        if (job.pause) {
          const nextPause = pauseFor(branch.id, today, data.pauses as AllocationDay[]);
          setPauses((current) => ({ ...current, [branch.id]: nextPause }));
          setPauseBaseline((current) => ({ ...current, [branch.id]: nextPause }));
        }
      }
      setNotice("Allocation saved. Existing held requests were left in place.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save. Your changes are still here.");
    } finally {
      setBusy(false);
    }
  }

  if (!branch) return <p role="status">Add a branch before setting daily allocation.</p>;

  return (
    <form className="catalog-workspace alloc-sheet-page" data-detail={listMode ? "false" : "true"} onSubmit={save}>
      <aside className="catalog-finder-list" aria-label="Branches">
        <div className="catalog-finder-tools">
          <h2 className="font-semibold">
            Branches <span className="text-muted-foreground text-xs">({branches.branches.length})</span>
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search branches…" aria-label="Search branches" />
          </div>
        </div>
        <nav className="catalog-finder-items" aria-label="Choose a branch">
          {visibleBranches.map((item) => {
            const caps = capCount(item.id);
            return (
              <div key={item.id} className="catalog-finder-item" aria-current={item.id === branch.id ? "true" : undefined}>
                <button
                  type="button"
                  className="catalog-finder-open"
                  onClick={() => { setBranchId(item.id); setListMode(false); setNotice(""); setError(""); }}
                >
                  <span className="alloc-mark" aria-hidden="true">{item.id.slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <strong>{item.name}</strong>
                    <small>{branchFlavorsFor(flavors, item.id)}{caps ? ` · ${caps} ${caps === 1 ? "cap" : "caps"}` : " · all open"}</small>
                  </span>
                </button>
              </div>
            );
          })}
          {!visibleBranches.length ? (
            <div className="p-4 text-sm">
              <p>No matching branches.</p>
              <Button type="button" variant="ghost" onClick={() => setQuery("")}>Clear filters</Button>
            </div>
          ) : null}
        </nav>
      </aside>
      <div className="catalog-finder-detail" tabIndex={-1}>
        <Button type="button" className="catalog-mobile-back" variant="ghost" onClick={() => setListMode(true)}>
          <ArrowLeft aria-hidden />Back to branches
        </Button>
        <Tabs value="sheet">
          <div className="catalog-tabbar">
            <TabsList className="catalog-tabs" aria-label="Allocation sections">
              <TabsTrigger value="sheet">All flavors</TabsTrigger>
            </TabsList>
            <div className="catalog-tab-actions">
              <div className="catalog-visibility" role="radiogroup" aria-label="New requests today">
                <button type="button" role="radio" aria-checked={!pause.paused} data-on={!pause.paused ? "true" : undefined} disabled={busy} onClick={() => updatePause(false)}>Today open</button>
                <button type="button" role="radio" aria-checked={pause.paused} data-tone="hidden" data-on={pause.paused ? "true" : undefined} disabled={busy} onClick={() => updatePause(true)}>Today paused</button>
              </div>
              <Button type="submit" variant={dirty ? "default" : "outline"} disabled={busy || !dirty || branchFlavors.length === 0}>
                {busy ? "Saving…" : dirty ? "Save allocation" : "Saved"}
              </Button>
            </div>
          </div>
          {error ? <p className="alloc-banner alloc-banner-error" role="alert">{error}</p> : null}
          {notice ? <p className="alloc-banner" role="status">{notice}</p> : null}
          <p className="product-help">Every flavor for this branch sits on one week, starting Sunday. A blank cell stays open. Pausing today applies to the whole branch.</p>
          <TabsContent value="sheet" className="alloc-panel">
            {branchFlavors.length === 0 ? <p className="product-help">Add a flavor before setting daily allocation.</p> : (
              <>
                <div className="alloc-week-head">
                  <Button type="button" className="alloc-week-nav" variant="outline" aria-label="Previous week" disabled={busy || sunday <= currentSunday} onClick={() => setSunday(addCalendarDays(sunday, -7))}>
                    <ChevronLeft aria-hidden />
                  </Button>
                  <h2>{rangeLabel(week[0], week[6])}</h2>
                  <Button type="button" className="alloc-week-nav" variant="outline" aria-label="Next week" disabled={busy || sunday >= lastSunday} onClick={() => setSunday(addCalendarDays(sunday, 7))}>
                    <ChevronRight aria-hidden />
                  </Button>
                </div>
                <div className="alloc-sheet-wrap" key={`${branch.id}-${sunday}`}>
                  <table className="alloc-sheet">
                    <caption className="sr-only">{branch.name} online pies</caption>
                    <thead>
                      <tr>
                        <th scope="col">Flavor</th>
                        {week.map((date) => {
                          const label = dateParts(date);
                          return <th key={date} scope="col" data-closed={closed.has(date) ? "true" : undefined}>{label.weekday}<span>{label.day}{date === today ? " · Today" : ""}</span></th>;
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {branchFlavors.map((flavor) => (
                        <tr key={flavor.productId}>
                          <th scope="row">{flavor.name}</th>
                          {week.map((date) => {
                            const day = (drafts[flavorKey(branch.id, flavor.productId)] ?? []).find((item) => item.fulfillmentDate === date);
                            const locked = date < today || date > horizonEnd;
                            return (
                              <td key={date} data-closed={closed.has(date) ? "true" : undefined} data-capped={day?.limit ? "true" : undefined}>
                                <Input
                                  className="alloc-limit"
                                  inputMode="numeric"
                                  placeholder="Open"
                                  aria-label={`${flavor.name} online pies for ${dateParts(date).day}`}
                                  value={day?.limit ?? ""}
                                  disabled={busy || locked}
                                  onChange={(event) => updateDay(flavor.productId, date, event.target.value)}
                                />
                                {day && day.held > 0 ? <small>{day.held} held</small> : null}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </form>
  );
}

function branchFlavorsFor(flavors: FlavorOption[], branchId: string) {
  const count = flavors.filter((flavor) => flavor.branchId === branchId).length;
  return `${count} ${count === 1 ? "flavor" : "flavors"}`;
}
