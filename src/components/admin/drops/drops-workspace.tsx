"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin/admin-select";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { DropAddon, DropDate, DropEvent, DropOffering, DropStore } from "@/lib/drops/types";
import type { StoreCatalog } from "@/lib/storefront/types";
import { CatalogLoading, catalogError, EditorActions, Feedback, Field, SplitEditor, TextField, Toggle, uniqueSlug, useAllowDiscard, useDraftGuard } from "../catalog/catalog-ui";
import { adminRequest, manilaToday, OrderRequestError, pesos } from "../orders-data";
import { AllocationFields, DropDateFields, DropSection, dropSources, OfferingFields, type Source } from "./drop-fields";

type AdminDrops = DropStore & { bookedDates: Record<string, string[]> };
type Lifecycle = "publish_drop" | "unpublish_drop" | "end_drop" | "duplicate_drop";
const lifecycleLabels: Record<Lifecycle, string> = { publish_drop: "Publish drop", unpublish_drop: "Unpublish drop", end_drop: "End drop", duplicate_drop: "Duplicate drop" };
const lifecycleHelp: Record<Lifecycle, string> = {
  publish_drop: "Customers can discover this drop and order during the configured hours.",
  unpublish_drop: "The drop will return to Draft and close to new customer orders. Existing bookings stay in place.",
  end_drop: "This closes the drop to new orders and makes it read-only. Existing bookings stay in place.",
  duplicate_drop: "The copy keeps the lineup and prices. Add new dates, hours, and allocations before publishing.",
};
const groups = ["draft", "published", "ended"] as const;
const newAllocation = (date: string) => ({ date, included: true, allocated: 0, committed: 0 });

function statusFor(drop: DropEvent) {
  if (drop.status !== "published" || !drop.dates.length) return drop.status;
  const latest = Math.max(...drop.dates.map(date => Date.parse(`${date.date}T${[date.pickupEnds, date.dispatchEnds ?? ""].sort().at(-1)}:00+08:00`)));
  return Date.now() >= latest ? "ended" : "published";
}

function cityAddons(catalog: StoreCatalog, locationId: string): DropAddon[] {
  return catalog.addOns.filter(item => item.enabled && item.locationIds.includes(locationId)).map(item => ({
    addOnId: item.id, name: item.name, icon: item.icon, priceCentavos: item.priceCentavos, sortOrder: item.sortOrder,
  }));
}

function errorFor(error: unknown) {
  if (error instanceof OrderRequestError) {
    switch (error.body.error) {
      case "stale_save": return "This drop changed. Reload the latest version before saving.";
      case "booked_date_locked": return "A date now has orders. Keep its pickup and dispatch windows and reload to see the lock.";
      case "committed_allocation": return "Stock changed while you were editing. Reload and keep each allocation at or above committed stock.";
      case "disabled_drop_source": return "Enable the source pies and sizes or replace them before publishing.";
    }
  }
  return catalogError(error);
}

function validate(drop: DropEvent, sources: Source[], publish: boolean) {
  if (!drop.name.trim() || !drop.address.trim() || !drop.locationId) return "Enter a drop name, drop city, and pickup address.";
  if (drop.mapUrl && !drop.mapUrl.startsWith("https://")) return "Enter an HTTPS map link.";
  if (publish && !drop.dates.length) return "Add at least one date before publishing.";
  if (publish && !drop.offerings.length) return "Add at least one offering before publishing.";
  for (const date of drop.dates) {
    if (!date.date || !date.orderingOpens || !date.orderingCutoff || date.orderingOpens >= date.orderingCutoff) return `Set a valid ordering window for ${date.date || "each date"}.`;
    if (!date.pickupStarts || !date.pickupEnds || date.pickupStarts >= date.pickupEnds) return `Set a valid pickup window for ${date.date}.`;
    if (drop.deliveryEnabled && (!date.dispatchStarts || !date.dispatchEnds || date.dispatchStarts >= date.dispatchEnds)) return `Set a valid dispatch window for ${date.date}.`;
  }
  for (const offering of drop.offerings) {
    const name = offering.name.trim();
    if (!name) return "Give each offering a name.";
    if (!Number.isInteger(offering.perOrderMax) || offering.perOrderMax < 1 || offering.perOrderMax > 99) return `Set a per-order maximum from 1 to 99 for ${name}.`;
    if (!Number.isSafeInteger(offering.priceCentavos) || offering.priceCentavos < 0 || offering.priceCentavos > 2147483647) return `Enter a valid price for ${name}.`;
    if (offering.kind === "package" && (offering.components.some(part => !Number.isInteger(part.quantity) || part.quantity < 1) || offering.components.reduce((sum, part) => sum + part.quantity, 0) !== 4)) return `${name} must contain exactly four pies.`;
    const parts = offering.kind === "size" ? [offering] : offering.components;
    if (parts.some(part => !sources.some(source => source.productId === part.productId && source.sizeId === part.sizeId))) return `Choose a valid pie and size for ${name}.`;
    if (publish && parts.some(part => !sources.some(source => source.enabled && source.productId === part.productId && source.sizeId === part.sizeId))) return `${name} uses a disabled pie or size.`;
    if (drop.dates.some(date => !offering.dates.some(allocation => allocation.date === date.date))) return `Set allocations for ${name} on every date.`;
    if (offering.dates.some(item => !Number.isInteger(item.allocated) || item.allocated < item.committed || item.allocated > 2147483647)) return `Set whole allocations at or above committed stock for ${name}.`;
  }
  return "";
}

export function DropsWorkspace() {
  const [catalog, setCatalog] = useState<StoreCatalog>();
  const [store, setStore] = useState<AdminDrops>();
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<DropEvent>();
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [phone, setPhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [action, setAction] = useState<Lifecycle>();
  const [editorVersion, setEditorVersion] = useState(0);
  const saved = store?.drops.find(drop => drop.id === selected) ?? store?.drops[0];
  const active = draft ?? saved;
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  const allowDiscard = useAllowDiscard();
  useDraftGuard(dirty);

  async function load() {
    try {
      const [next, items] = await Promise.all([adminRequest<AdminDrops>("/api/admin/drops"), adminRequest<StoreCatalog>("/api/admin/catalog")]);
      setStore(next); setCatalog(items); setLoadError("");
      return next;
    } catch { setLoadError("Could not load drops. Try again."); return undefined; }
  }
  useEffect(() => { void Promise.resolve().then(load); }, []);

  if (!catalog || !store) return <CatalogLoading error={loadError} retry={() => void load()} />;
  const cities = catalog.locations.filter(location => location.kind === "drop");
  const sources = dropSources(catalog);
  const bookedDates = active?.id ? store.bookedDates[active.id] ?? [] : [];
  const state = active ? (active.id && saved?.id === active.id ? statusFor(saved) : active.status) : undefined;
  const readOnly = state === "ended";
  const availableAddons = active ? cityAddons(catalog, active.locationId) : [];
  const revision = store.revision;
  const usedIds = store.drops.map(drop => drop.id);

  async function select(drop: DropEvent, isNew = false) {
    if (busy || !(await allowDiscard(dirty))) return;
    setSelected(drop.id); setDraft(isNew ? drop : undefined); setPhone(true);
    setError(""); setSuccess(""); setEditorVersion(value => value + 1);
  }

  function update(patch: Partial<DropEvent>) {
    if (active) setDraft({ ...active, ...patch });
    setSuccess("");
  }

  function addDate() {
    if (!active || active.dates.length >= 31) return;
    const previous = [...active.dates].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    const date = previous ? dayjs(previous.date).add(1, "day").format("YYYY-MM-DD") : manilaToday();
    const next: DropDate = {
      orderingOpens: "09:00", orderingCutoff: "15:00", pickupStarts: "10:00", pickupEnds: "17:00",
      dispatchStarts: active.deliveryEnabled ? "10:00" : null, dispatchEnds: active.deliveryEnabled ? "17:00" : null,
      ...previous, date,
    };
    update({ dates: [...active.dates, next], offerings: active.offerings.map(item => ({ ...item, dates: [...item.dates, newAllocation(date)] })) });
  }

  function patchDate(date: DropDate, patch: Partial<DropDate>) {
    if (!active) return;
    const next = { ...date, ...patch };
    if (!next.date) return;
    if (next.date !== date.date && active.dates.some(item => item.date === next.date)) { setError("Each date can only be added once."); return; }
    setError("");
    update({
      dates: active.dates.map(item => item.date === date.date ? next : item),
      offerings: active.offerings.map(item => ({ ...item, dates: item.dates.map(allocation => allocation.date === date.date ? { ...allocation, date: next.date } : allocation) })),
    });
  }

  function addOffering(kind: DropOffering["kind"]) {
    if (!active || active.offerings.length >= 40) return;
    const id = uniqueSlug(kind === "size" ? "pie" : "package", active.offerings.map(item => item.id), "offering");
    const item: DropOffering = {
      id, kind, name: "", priceCentavos: 0, perOrderMax: 1, productId: null, sizeId: null,
      sortOrder: Math.max(-1, ...active.offerings.map(entry => entry.sortOrder)) + 1, contentsLockedAt: null, components: [],
      dates: active.dates.map(date => newAllocation(date.date)),
    };
    update({ offerings: [...active.offerings, item] });
  }

  async function commit(name: string, payload: object, id: string, message: string) {
    setBusy(true); setError(""); setSuccess("");
    try {
      await adminRequest("/api/admin/drops", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: name, payload: { ...payload, revision } }),
      });
      const fresh = await load();
      setSelected(id); setDraft(undefined); setEditorVersion(value => value + 1);
      if (fresh) setSuccess(message);
      else setError("Changes were saved, but the list could not refresh. Reload before editing.");
    } catch (failure) { setError(errorFor(failure)); }
    finally { setBusy(false); }
  }

  function lifecycle() {
    if (!active || !action || busy || dirty) return;
    const current = action;
    setAction(undefined);
    if (current === "publish_drop") {
      const invalid = validate(active, sources, true);
      if (invalid) { setError(invalid); return; }
      if (active.dates.every(date => date.date < manilaToday())) { setError("Add a current or future date before publishing."); return; }
    }
    const id = current === "duplicate_drop" ? uniqueSlug(active.id + "-copy", usedIds, "drop-copy") : active.id;
    void commit(current, { id: active.id, updatedAt: active.updatedAt, ...(current === "duplicate_drop" ? { newId: id } : {}) }, id,
      current === "duplicate_drop" ? "Draft duplicated. Add dates and allocations before publishing." : "Drop status updated.");
  }

  return <SplitEditor showEditor={phone} back={() => { if (!busy) setPhone(false); }} list={<>
    <div className="flex flex-wrap items-center gap-2"><Button disabled={busy || !cities.length} onClick={() => select({
      id: "", status: "draft", name: "", locationId: cities[0].id, address: cities[0].address, mapUrl: cities[0].mapUrl,
      deliveryEnabled: false, updatedAt: "", dates: [], offerings: [], addons: cityAddons(catalog, cities[0].id),
    }, true)}>New drop</Button>
    {!cities.length && <Link className="text-sm underline" href="/admin/settings">Add a drop city in Settings</Link>}</div>
    <Input aria-label="Search drops" placeholder="Search drops" value={search} onChange={event => setSearch(event.target.value)} />
    {groups.map(group => {
      const items = store.drops.filter(drop => statusFor(drop) === group && `${drop.name} ${cities.find(city => city.id === drop.locationId)?.name ?? drop.locationId}`.toLowerCase().includes(search.trim().toLowerCase()));
      return <section key={group}><h2 className="px-2 py-1 text-xs font-semibold capitalize text-muted-foreground">{group} · {items.length}</h2>
        <ul className="divide-y">{items.map(drop => <li key={drop.id}><Button variant="ghost" disabled={busy} aria-pressed={active?.id === drop.id} className="h-auto w-full justify-between gap-2 whitespace-normal p-2 text-left aria-pressed:bg-accent" onClick={() => select(drop)}>
          <span className="min-w-0"><span className="block font-medium">{drop.name}</span><span className="block text-xs text-muted-foreground">{cities.find(city => city.id === drop.locationId)?.name ?? drop.locationId}{drop.dates.length ? ` · ${drop.dates.length} date${drop.dates.length === 1 ? "" : "s"}` : ""}</span></span>
        </Button></li>)}</ul>
      </section>;
    })}
  </>} editor={<>
    <Feedback error={error || loadError} success={success} />
    {(loadError || /Reload|reload/.test(error)) && <Button variant="outline" disabled={busy} onClick={async () => {
      if (await allowDiscard(dirty) && await load()) { setDraft(undefined); setError(""); setEditorVersion(value => value + 1); }
    }}>Reload drops</Button>}
    {active ? <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1"><h2 className="text-lg font-semibold">{active.name || "New drop"}</h2><Badge variant="outline">{state}</Badge></div>
        <div className="flex flex-wrap gap-2">
          {active.id && !dirty && <Button variant="outline" render={<Link href={`/admin/drops/preview?slug=${encodeURIComponent(active.id)}`} target="_blank" rel="noopener noreferrer" />}>Preview</Button>}
          {active.id && <Button variant="outline" disabled={busy || dirty} onClick={() => setAction("duplicate_drop")}>Duplicate</Button>}
          {active.id && state === "draft" && <Button disabled={busy || dirty} onClick={() => setAction("publish_drop")}>Publish</Button>}
          {state === "published" && <>
            <Button variant="outline" disabled={busy || dirty} onClick={() => setAction("unpublish_drop")}>Unpublish</Button>
            <Button variant="destructive" disabled={busy || dirty} onClick={() => setAction("end_drop")}>End drop</Button>
          </>}
        </div>
      </div>
      {dirty && <p className="text-xs text-muted-foreground">Save changes before previewing, publishing, or duplicating.</p>}
      {readOnly && <p className="text-sm text-muted-foreground">This drop has ended. Duplicate it to use the lineup again.</p>}
      <form className="space-y-4" noValidate onSubmit={event => {
        event.preventDefault();
        if (busy || !dirty || readOnly) return;
        const invalid = validate(active, sources, state === "published");
        if (invalid) { setError(invalid); return; }
        const id = active.id || uniqueSlug(active.name, usedIds, "drop");
        void commit("save_drop", { ...active, id, mapUrl: active.mapUrl.trim(), updatedAt: active.updatedAt || undefined }, id, "Drop saved.");
      }}>
        <fieldset disabled={busy || readOnly} key={active.id + ":" + editorVersion} className="min-w-0 space-y-3">
          <DropSection title="Details" defaultOpen>
            <TextField label="Drop name" maxLength={120} value={active.name} change={name => update({ name })} />
            <Field label="Drop city"><AdminSelect label="Drop city" value={active.locationId} disabled={!!active.id} onValueChange={cityId => {
              const city = cities.find(item => item.id === cityId);
              if (city) update({ locationId: city.id, address: city.address, mapUrl: city.mapUrl, addons: cityAddons(catalog, city.id) });
            }} options={cities.map(city => ({ value: city.id, label: city.name }))} /></Field>
            <TextField label="Pickup address" maxLength={300} value={active.address} change={address => update({ address })} />
            <TextField label="Map link (optional)" type="url" value={active.mapUrl} change={mapUrl => update({ mapUrl })} />
            <Toggle label="Enable delivery" checked={active.deliveryEnabled} disabled={bookedDates.length > 0} change={deliveryEnabled => update({
              deliveryEnabled, dates: active.dates.map(date => ({ ...date, dispatchStarts: deliveryEnabled ? date.pickupStarts : null, dispatchEnds: deliveryEnabled ? date.pickupEnds : null })),
            })} />
            <p className="text-xs text-muted-foreground">{bookedDates.length ? "Delivery settings are locked because this drop has bookings." : "Pickup is available for every drop. Enable delivery to set dispatch windows."}</p>
          </DropSection>
          <DropSection title="Dates">
            <p className="text-sm text-muted-foreground">Customers order on the same day during its ordering hours. Future dates can be previewed. All times are Manila time.</p>
            {active.dates.map((date, index) => <DropDateFields key={index} date={date} booked={bookedDates.includes(date.date)} delivery={active.deliveryEnabled}
              change={patch => patchDate(date, patch)} remove={() => update({
                dates: active.dates.filter(item => item.date !== date.date),
                offerings: active.offerings.map(item => ({ ...item, dates: item.dates.filter(allocation => allocation.date !== date.date) })),
              })} />)}
            <Button type="button" variant="outline" disabled={active.dates.length >= 31} onClick={addDate}>Add date</Button>
          </DropSection>
          <DropSection title="Offerings">
            <p className="text-sm text-muted-foreground">Drops use their own lineup and dates. Regular availability rules do not apply to enabled source pies and sizes.</p>
            {active.offerings.map(offering => <OfferingFields key={offering.id} offering={offering} sources={sources} change={patch => update({ offerings: active.offerings.map(item => item.id === offering.id ? { ...item, ...patch } : item) })}
              remove={() => update({ offerings: active.offerings.filter(item => item.id !== offering.id) })} />)}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={active.offerings.length >= 40} onClick={() => addOffering("size")}>Add individual pie</Button>
              <Button type="button" variant="outline" disabled={active.offerings.length >= 40} onClick={() => addOffering("package")}>Add package</Button>
            </div>
          </DropSection>
          <DropSection title="Daily allocations"><AllocationFields drop={active} change={offerings => update({ offerings })} /></DropSection>
          <DropSection title="Add-ons">
            <p className="text-sm text-muted-foreground">New drops start with this city’s enabled add-ons.</p>
            {[...availableAddons, ...active.addons.filter(item => !availableAddons.some(addon => addon.addOnId === item.addOnId))].map(item => <Toggle key={item.addOnId}
              label={item.name + " · " + pesos(active.addons.find(addon => addon.addOnId === item.addOnId)?.priceCentavos ?? item.priceCentavos)}
              checked={active.addons.some(addon => addon.addOnId === item.addOnId)}
              disabled={active.addons.length >= 20 && !active.addons.some(addon => addon.addOnId === item.addOnId)}
              change={checked => update({ addons: checked ? [...active.addons, item] : active.addons.filter(addon => addon.addOnId !== item.addOnId) })} />)}
            {!availableAddons.length && !active.addons.length && <p className="text-sm">No add-ons are assigned to this city.</p>}
          </DropSection>
        </fieldset>
        {!readOnly && <EditorActions busy={busy} dirty={dirty} reset={() => { setDraft(undefined); setError(""); setEditorVersion(value => value + 1); }} />}
      </form>
    </> : <p className="text-sm text-muted-foreground">Select a drop or create a draft.</p>}
    <AlertDialog open={!!action} onOpenChange={open => { if (!open) setAction(undefined); }}>
      <AlertDialogContent className="admin-theme"><AlertDialogHeader>
        <AlertDialogTitle>{action && lifecycleLabels[action]}</AlertDialogTitle>
        <AlertDialogDescription>{action && lifecycleHelp[action]}</AlertDialogDescription>
      </AlertDialogHeader><AlertDialogFooter>
        <AlertDialogCancel>Back</AlertDialogCancel><Button variant={action === "end_drop" ? "destructive" : "default"} disabled={busy} onClick={lifecycle}>{action && lifecycleLabels[action]}</Button>
      </AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </>} />;
}
