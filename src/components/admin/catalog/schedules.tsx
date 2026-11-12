"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { StoreLocation, StoreOverride, StoreSchedule } from "@/lib/storefront/types";
import { useAdminBlocked, useAdminFetch } from "../query-provider";
import { manilaToday } from "../orders-data";
import { useDraftRevision, CatalogLoading, catalogChange, catalogError, EditorActions, Feedback, SplitEditor, TextField, Toggle, useAllowDiscard, useCatalog, useDraftGuard, type Catalog } from "./catalog-ui";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Review = {
  action: "save_override" | "delete_override";
  payload: object;
  affected: { id: string; number: string; slot: string | null }[];
};
const newOverride = (locationId: string): StoreOverride => ({ locationId, date: manilaToday(), closed: true, opens: null, cutoff: null, updatedAt: "" });

function ScheduleFields({ catalog, branch, reload, branchGuardRef }: { catalog: Catalog; branch: StoreLocation; reload: () => Promise<Catalog | undefined>; branchGuardRef: RefObject<{ dirty: boolean; busy: boolean }> }) {
  const fetchAdmin = useAdminFetch();
  const blocked = useAdminBlocked();
  const saved = catalog.schedules.find(schedule => schedule.locationId === branch.id);
  const [draft, setDraft] = useState<StoreSchedule>();
  const [accepting, setAccepting] = useState<boolean>();
  const [override, setOverride] = useState<StoreOverride>();
  const [review, setReview] = useState<Review>();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const schedule = draft ?? saved;
  const weeklyDirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  const pauseDirty = accepting !== undefined && accepting !== branch.acceptingOrders;
  const dirty = weeklyDirty || pauseDirty || !!override;
  const draftVersion = useDraftRevision(catalog.revision, dirty || !!review);
  const allowDiscard = useAllowDiscard();
  useDraftGuard(dirty);
  useEffect(() => {
    branchGuardRef.current = { dirty, busy };
    return () => { branchGuardRef.current = { dirty: false, busy: false }; };
  }, [branchGuardRef, dirty, busy]);

  function update(patch: Partial<StoreSchedule>) {
    if (schedule) setDraft({ ...schedule, ...patch });
    setSuccess("");
  }

  async function save(action: string, payload: object, onSaved: () => void) {
    setBusy(true); setError(""); setSuccess("");
    try {
      await catalogChange(action, draftVersion.revision!, payload);
      onSaved();
      setSuccess(await reload() ? "Changes saved." : "Changes saved. Reload to see the latest schedule.");
    } catch (failure) { setError(catalogError(failure)); }
    finally { setBusy(false); }
  }

  async function preview(action: Review["action"], payload: object) {
    setBusy(true); setError(""); setSuccess("");
    try {
      const { affected } = await fetchAdmin<{ affected: Review["affected"] }>("/api/admin/catalog/override-preview", {
        action, payload: { ...payload, revision: draftVersion.revision },
      });
      setReview({ action, payload, affected });
    } catch (failure) { setError(catalogError(failure)); }
    finally { setBusy(false); }
  }

  return <div className="space-y-6">
    <h2 className="text-lg font-semibold">{branch.name}</h2>
    <Feedback error={error || (draftVersion.stale ? "Someone changed the catalog. Reload before saving this draft." : "")} success={success} />
    {(draftVersion.stale || error.startsWith("Someone")) && <Button variant="outline" onClick={async () => {
      if (await allowDiscard(dirty) && await reload()) { setDraft(undefined); setOverride(undefined); setAccepting(undefined); setError(""); }
    }}>Reload catalog</Button>}
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (!busy && pauseDirty) void save("save_location", { ...branch, acceptingOrders: accepting }, () => setAccepting(undefined)); }}>
      <Toggle label="Accepting orders" checked={accepting ?? branch.acceptingOrders} disabled={busy} change={setAccepting} />
      {!(accepting ?? branch.acceptingOrders) && <p className="text-sm text-muted-foreground">Customers see: Online ordering is paused at {branch.name}.</p>}
      <EditorActions saveDisabled={draftVersion.stale} busy={busy} dirty={pauseDirty} reset={() => setAccepting(undefined)} />
    </form>
    {schedule ? <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!busy && weeklyDirty) void save("save_schedule", schedule, () => setDraft(undefined)); }}>
      <h3 className="font-semibold">Weekly hours</h3>
      <p className="text-sm text-muted-foreground">Pickup and delivery share these hours. Available slots are one hour long. Change the booking horizon or preorder preparation time in <Link href="/admin/settings" className="underline">Settings</Link>.</p>
      <fieldset disabled={busy} className="space-y-3">
        <Toggle label="Weekly schedule enabled" checked={schedule.enabled} change={enabled => update({ enabled })} />
        <div className="grid gap-3 sm:grid-cols-2"><TextField required label="Opens" type="time" value={schedule.opens} change={opens => update({ opens })} /><TextField required label="Cutoff" type="time" value={schedule.cutoff} change={cutoff => update({ cutoff })} /></div>
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1"><legend className="text-sm font-medium">Open days</legend>
          {days.map((day, index) => <Toggle key={day} label={day} checked={schedule.weekdays.includes(index)} change={checked => update({ weekdays: checked ? [...schedule.weekdays, index].sort() : schedule.weekdays.filter(value => value !== index) })} />)}
        </fieldset>
      </fieldset>
      <EditorActions saveDisabled={draftVersion.stale} busy={busy} dirty={weeklyDirty} reset={() => setDraft(undefined)} />
    </form> : <p className="text-sm text-muted-foreground">This branch has no weekly schedule.</p>}
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Date overrides</h3><Button variant="outline" disabled={busy || !!override} onClick={() => setOverride(newOverride(branch.id))}>Add override</Button></div>
      <ul className="divide-y">{catalog.overrides.filter(item => item.locationId === branch.id).map(item => <li key={item.date} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span className="text-sm">{item.date} · {item.closed ? "Closed" : `${item.opens}–${item.cutoff}`}</span>
        <span className="flex gap-1"><Button size="sm" variant="outline" disabled={busy || !!override} onClick={() => setOverride(item)}>Edit</Button>
          <Button size="sm" variant="ghost" disabled={busy || !!override} onClick={() => void preview("delete_override", { locationId: branch.id, date: item.date, updatedAt: item.updatedAt })}>Remove override</Button></span>
      </li>)}</ul>
      {override && <form className="space-y-3 rounded-lg border p-3" onSubmit={event => {
        event.preventDefault();
        if (!busy) void preview("save_override", { ...override, updatedAt: override.updatedAt || undefined });
      }}>
        <TextField label="Date" type="date" required disabled={!!override.updatedAt} value={override.date} change={date => setOverride({ ...override, date })} />
        <Toggle label="Close this date" checked={override.closed} disabled={busy} change={closed => setOverride({ ...override, closed, opens: closed ? null : schedule?.opens ?? "09:00", cutoff: closed ? null : schedule?.cutoff ?? "17:00" })} />
        {!override.closed && <div className="grid gap-3 sm:grid-cols-2"><TextField label="Replacement opening time" required type="time" value={override.opens ?? ""} change={opens => setOverride({ ...override, opens })} /><TextField label="Replacement cutoff" required type="time" value={override.cutoff ?? ""} change={cutoff => setOverride({ ...override, cutoff })} /></div>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => { void allowDiscard(true).then(ok => { if (ok) setOverride(undefined); }); }}>Discard</Button><Button type="submit" disabled={busy}>Review affected orders</Button></div>
      </form>}
    </section>
    <AlertDialog open={!!review} onOpenChange={open => { if (!open) setReview(undefined); }}>
      <AlertDialogContent className="admin-theme">
        <AlertDialogHeader>
          <AlertDialogTitle>Review affected orders</AlertDialogTitle>
          <AlertDialogDescription>{review?.affected.length ? "These orders fall outside the proposed hours. Their existing dates and times will stay booked." : "No pending or confirmed orders fall outside the proposed hours."}</AlertDialogDescription>
        </AlertDialogHeader>
        {!!review?.affected.length && <ul className="max-h-48 divide-y overflow-auto text-sm">{review.affected.map(order => <li key={order.id} className="py-1">{order.number}{order.slot && " · " + order.slot}</li>)}</ul>}
        <AlertDialogFooter><AlertDialogCancel>Back</AlertDialogCancel><Button disabled={blocked || busy || draftVersion.stale} onClick={() => {
          if (!review || busy) return;
          setReview(undefined);
          void save(review.action, review.payload, () => setOverride(undefined));
        }}>{review?.action === "delete_override" ? "Remove override" : "Save override"}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

export function SchedulesEditor() {
  const { catalog, error, reload } = useCatalog();
  const [selected, select] = useState("");
  const [phone, showEditor] = useState(false);
  const branchGuardRef = useRef({ dirty: false, busy: false });

  const allowDiscard = useAllowDiscard();
  if (!catalog) return <CatalogLoading error={error} retry={() => void reload()} />;
  const branches = catalog.locations.filter(location => location.kind === "regular");
  const branch = branches.find(item => item.id === selected) ?? branches[0];
  return <SplitEditor showEditor={phone} back={() => showEditor(false)} list={<>
    <ul className="divide-y">{branches.map(item => <li key={item.id}><Button variant="ghost" aria-pressed={branch?.id === item.id} className="h-auto w-full justify-between whitespace-normal p-3 text-left aria-pressed:bg-accent" onClick={() => {
      void (async () => {
        if (item.id !== branch?.id && (branchGuardRef.current.busy || !(await allowDiscard(branchGuardRef.current.dirty)))) return;
        if (!await reload()) return;
        select(item.id); showEditor(true);
      })();
    }}>
      {item.name}<Badge variant="outline">{item.acceptingOrders ? "Accepting" : "Paused"}</Badge>
    </Button></li>)}</ul>
    <Link href="/admin/drops" className="text-sm underline">Manage drop schedules in Drops</Link>
  </>} editor={branch ? <ScheduleFields key={branch.id} catalog={catalog} branch={branch} reload={reload} branchGuardRef={branchGuardRef} /> : <p>No regular branches.</p>} />;
}
