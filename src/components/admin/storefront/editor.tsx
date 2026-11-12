"use client";

import { useAdminBlocked } from "../query-provider";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AdminSelect } from "@/components/admin/admin-select";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { manilaToday } from "../orders-data";
import { selectFeatured } from "@/lib/storefront/featured";
import { THEMES, type StorePopup, type StoreProduct, type StoreSection, type StoreSettings, type ThemeName } from "@/lib/storefront/types";
import { useConfirm } from "../admin-confirm";
import { useDraftRevision, CatalogLoading, catalogChange, catalogError, EditorActions, Feedback, Field, SplitEditor, TextField, Toggle, uniqueSlug, useCatalog, useDraftGuard, type Catalog } from "../catalog/catalog-ui";
import { SortableList } from "../catalog/sortable-list";

const tabs = [
  ["theme", "Theme"], ["featured", "Featured pies"], ["sections", "Menu sections"],
  ["popups", "Pop-ups"], ["links", "Links"],
] as const;
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const themeName = (theme: ThemeName) => theme === "christmas" ? "Christmas" : "Original";
type Links = Pick<StoreSettings, "instagramUrl" | "instagramDmUrl" | "messengerUrl">;
type Draft =
  | { type: "theme"; theme: ThemeName }
  | { type: "featured"; ids: string[] }
  | { type: "section"; item: StoreSection }
  | { type: "sectionOrder"; items: StoreSection[] }
  | { type: "popup"; item: StorePopup; descriptions: string }
  | { type: "links"; links: Links };

function PopupStatus({ item, today }: { item: StorePopup; today: string }) {
  const status = item.endDate < today ? "Expired" : item.startDate > today ? "Upcoming" : "Ongoing";
  return <Badge className="shrink-0 rounded-md bg-muted text-muted-foreground normal-case tracking-normal">{status}</Badge>;
}

function rankedRow(item: { name: string }, grip: React.ReactNode, controls: React.ReactNode) {
  return <div className="flex min-w-0 items-center justify-between gap-2 p-2">
    <span className="flex min-w-0 items-center gap-2">{grip}<span className="break-words">{item.name}</span></span>
    {controls}
  </div>;
}

function linksFrom({ instagramUrl, instagramDmUrl, messengerUrl }: StoreSettings): Links {
  return { instagramUrl, instagramDmUrl, messengerUrl };
}

function mutation(draft: Draft, catalog: Catalog): [string, object] {
  switch (draft.type) {
    case "theme": return ["save_settings", { ...catalog.settings, theme: draft.theme }];
    case "links": return ["save_settings", { ...catalog.settings, ...draft.links }];
    case "featured": return ["save_featured", { productIds: draft.ids }];
    case "sectionOrder": return ["reorder_sections", { items: draft.items.map(({ id, updatedAt }) => ({ id, updatedAt })) }];
    case "section": {
      const { item } = draft;
      return ["save_section", { ...item, id: item.id || uniqueSlug(item.name, catalog.sections.map(section => section.id), "section"), updatedAt: item.updatedAt || undefined }];
    }
    case "popup": {
      const { item } = draft;
      return ["save_popup", {
        ...item, id: item.id || uniqueSlug(item.name, catalog.popups.map(popup => popup.id), "popup"),
        updatedAt: item.updatedAt || undefined, items: draft.descriptions.split("\n").map(line => line.trim()).filter(Boolean),
      }];
    }
  }
}

export function StorefrontEditor() {
  const blocked = useAdminBlocked();
  const { catalog, error: loadError, reload } = useCatalog();
  const [tab, setTab] = useState<string>("theme");
  const [draft, setDraft] = useState<Draft>();
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedPopup, setSelectedPopup] = useState("");
  const [popupSearch, setPopupSearch] = useState("");
  const [showPopupEditor, setShowPopupEditor] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [pendingView, setPendingView] = useState<(() => void)>();
  const draftVersion = useDraftRevision(catalog?.revision, !!draft);
  const confirm = useConfirm();
  useDraftGuard(Boolean(draft));

  if (!catalog) return <CatalogLoading error={loadError} retry={() => void reload()} />;
  const snapshot = catalog;
  const today = manilaToday();
  const section = draft?.type === "section" ? draft.item : catalog.sections.find(item => item.id === selectedSection) ?? catalog.sections[0];
  const popup = draft?.type === "popup" ? draft.item : catalog.popups.find(item => item.id === selectedPopup) ?? catalog.popups[0];
  const filteredPopups = catalog.popups.filter(item => item.name.toLowerCase().includes(popupSearch.trim().toLowerCase()));
  const theme = draft?.type === "theme" ? draft.theme : catalog.settings.theme;
  const links = draft?.type === "links" ? draft.links : linksFrom(catalog.settings);
  const ranking = draft?.type === "featured" ? draft.ids : catalog.featuredIds;
  const products = new Map(catalog.products.map(product => [product.id, product]));
  const ranked = ranking.map(id => products.get(id)).filter((item): item is StoreProduct => Boolean(item));
  const resolved = tab === "featured" ? selectFeatured({ ...catalog, featuredIds: ranking }) : [];
  const used = section ? catalog.products.some(product => product.sectionId === section.id) : false;

  function reset() {
    setDraft(undefined);
    setError("");
    setMessage("");
  }

  function switchView(change: () => void) {
    if (busy) return;
    if (draft) { setPendingView(() => change); return; }
    reset();
    change();
  }

  function edit(next: Draft) {
    setDraft(next);
    setMessage("");
  }

  async function save(action: string, payload: object) {
    if (busy || needsRefresh) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await catalogChange(action, draftVersion.revision!, payload);
      if ("id" in payload && typeof payload.id === "string") {
        if (action === "save_section") setSelectedSection(payload.id);
        if (action === "save_popup") setSelectedPopup(payload.id);
      }
      setDraft(undefined);
      const refreshed = await reload();
      setNeedsRefresh(!refreshed);
      if (refreshed) setMessage("Changes saved.");
      else setError("Changes were saved. Refresh the catalog before making another edit.");
    } catch (failure) {
      const description = catalogError(failure);
      setError(description);
      if (description.startsWith("Someone")) setNeedsRefresh(true);
    } finally {
      setBusy(false);
    }
  }

  async function refreshForReview() {
    setBusy(true);
    const fresh = await reload();
    setBusy(false);
    if (!fresh) { setError("Could not refresh the catalog. Your draft is still here."); return; }
    if (draft?.type === "section" || draft?.type === "popup") {
      const latest = (draft.type === "section" ? fresh.sections : fresh.popups).find(item => item.id === draft.item.id);
      if (draft.item.id && (!latest || latest.updatedAt !== draft.item.updatedAt)) {
        setError("This record changed or was removed. Your draft is still here. Discard it to reopen the current record.");
        return;
      }
    }
    if (draft?.type === "sectionOrder") {
      const previous = new Map(draft.items.map(item => [item.id, item.updatedAt]));
      if (fresh.sections.length !== previous.size || fresh.sections.some(item => previous.get(item.id) !== item.updatedAt)) {
        setError("The menu sections changed. Your draft order is still here. Discard it to reorder the current sections.");
        return;
      }
    }
    draftVersion.capture(fresh.revision);
    setNeedsRefresh(false);
    setError("");
    setMessage(draft ? "Catalog refreshed. Review your draft before saving again." : "Catalog refreshed.");
  }

  function discard() {
    reset();
    if (needsRefresh) void refreshDiscarded();
  }

  async function refreshDiscarded() {
    if (await reload()) setNeedsRefresh(false);
    else setError("Could not refresh the catalog. Try again.");
  }

  function renderForm(children: React.ReactNode, embedded = false) {
    return <form className={embedded ? "space-y-4" : "max-w-3xl space-y-4 rounded-lg border bg-background p-4 sm:p-5"} onSubmit={event => {
      event.preventDefault();
      if (draft && !needsRefresh) void save(...mutation(draft, snapshot));
    }}>
      <fieldset className="min-w-0 space-y-4" disabled={busy}>{children}</fieldset>
      <EditorActions saveDisabled={draftVersion.stale} busy={busy} dirty={Boolean(draft)} reset={discard} />
    </form>;
  }

  return <><Tabs value={tab} onValueChange={value => switchView(() => {
    setTab(value);
    if (needsRefresh) void refreshDiscarded();
  })} className="space-y-4">
    <div className="overflow-x-auto p-1"><TabsList aria-label="Storefront sections">{tabs.map(([id, label]) => <TabsTrigger key={id} value={id}>{label}</TabsTrigger>)}</TabsList></div>
    <Feedback error={error || (draftVersion.stale ? "Someone changed the catalog. Reload before saving this draft." : "")} success={message} />
    {(needsRefresh || draftVersion.stale) && <Button variant="outline" disabled={busy} onClick={() => void refreshForReview()}>Reload catalog for review</Button>}
    <TabsContent value="theme" className="admin-panel-enter">{tab === "theme" && renderForm(<>
      <Field label="Storefront theme"><AdminSelect label="Storefront theme" value={theme} onValueChange={value => {
        if (value === catalog.settings.theme) reset(); else edit({ type: "theme", theme: value });
      }} options={THEMES.map(value => ({ value, label: themeName(value) }))} /></Field>
      <a className={buttonVariants({ variant: "outline" })} href={`/admin/storefront/preview?theme=${theme}`} target="_blank" rel="noopener noreferrer">Preview theme</a>
    </>)}</TabsContent>
    <TabsContent value="featured" className="admin-panel-enter">{tab === "featured" && renderForm(<>
      <p className="text-sm text-muted-foreground">The homepage shows up to four eligible pies for Cebu. Menu items fill any open spots in menu order.</p>
      <Field label="Add a pie"><AdminSelect label="Add a pie" value="" placeholder="Choose a pie" disabled={ranking.length >= 20}
        onValueChange={id => edit({ type: "featured", ids: [...ranking, id] })}
        options={catalog.products.filter(item => !ranking.includes(item.id)).map(item => ({ value: item.id, label: item.name }))} /></Field>
      <SortableList items={ranked} label={item => item.name} disabled={busy} onReorder={items => edit({ type: "featured", ids: items.map(item => item.id) })}
        row={(item, grip, controls) => rankedRow(item, grip, <div className="flex items-center gap-1">{controls}
          <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${item.name} from featured pies`} onClick={() => edit({ type: "featured", ids: ranking.filter(id => id !== item.id) })}>Remove</Button>
        </div>)} />
      <div className="border-t pt-3">
        <h2 className="text-sm font-semibold">Cebu homepage today</h2>
        {resolved.length ? <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{resolved.map(id =>
          <li key={id}>{products.get(id)?.name}{!ranking.includes(id) && <span className="text-muted-foreground"> · Menu fallback</span>}</li>)}</ol>
          : <p className="mt-2 text-sm text-muted-foreground">No eligible pies today.</p>}
      </div>
    </>)}</TabsContent>
    <TabsContent value="sections" className="admin-panel-enter">{tab === "sections" && renderForm(<>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => switchView(() => {
          setReordering(false);
          edit({ type: "section", item: { id: "", name: "", note: "", updatedAt: "", weekdays: [0, 1, 2, 3, 4, 5, 6], sortOrder: Math.max(-1, ...catalog.sections.map(item => item.sortOrder)) + 1 } });
        })}>New section</Button>
        <Button type="button" variant="outline" onClick={() => switchView(() => setReordering(!reordering))}>{reordering ? "Edit a section" : "Reorder sections"}</Button>
      </div>
      {reordering ? <SortableList items={draft?.type === "sectionOrder" ? draft.items : catalog.sections} label={item => item.name}
        disabled={busy} row={rankedRow} onReorder={items => edit({ type: "sectionOrder", items })} /> : <>
        <Field label="Menu section"><AdminSelect label="Menu section" value={section?.id ?? ""} placeholder="Choose a section"
          onValueChange={id => switchView(() => setSelectedSection(id))}
          options={catalog.sections.map(item => ({ value: item.id, label: item.name }))} /></Field>
        {section && <>
          <TextField label="Name" required maxLength={80} value={section.name} change={name => edit({ type: "section", item: { ...section, name } })} />
          <Field label="Note"><Textarea maxLength={200} value={section.note} onChange={event => edit({ type: "section", item: { ...section, note: event.target.value } })} /></Field>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Available weekdays</legend>
            <p className="text-sm text-muted-foreground">Weekdays apply to regular sizes.</p>
            <div className="grid gap-2 sm:grid-cols-2">{weekdays.map((day, index) =>
              <Toggle key={day} label={day} disabled={section.weekdays.length === 1 && section.weekdays.includes(index)} checked={section.weekdays.includes(index)} change={checked => edit({
                type: "section", item: { ...section, weekdays: checked ? [...section.weekdays, index].sort() : section.weekdays.filter(value => value !== index) },
              })} />)}</div>
          </fieldset>
          {section.id && <div className="space-y-2">
            <Button type="button" variant="destructive" disabled={blocked || used || Boolean(draft) || needsRefresh} onClick={() => {
              void confirm({
                title: `Delete ${section.name}?`,
                description: "This menu section will be removed. Assigned products must already be moved.",
                confirmLabel: "Delete section",
                cancelLabel: "Keep section",
                destructive: true,
              }).then(ok => { if (ok) void save("delete_section", { id: section.id, updatedAt: section.updatedAt }); });
            }}>Delete section</Button>
            {used && <p className="text-sm text-muted-foreground">Move assigned products to another section before deleting this one.</p>}
          </div>}
        </>}
      </>}
    </>)}</TabsContent>
    <TabsContent value="popups" className="admin-panel-enter">{tab === "popups" && <SplitEditor
      showEditor={showPopupEditor} back={() => { if (!busy) setShowPopupEditor(false); }}
      list={<>
        <Button type="button" disabled={busy} onClick={() => switchView(() => {
          edit({ type: "popup", descriptions: "", item: {
            id: "", name: "", locationId: catalog.locations[0]?.id ?? "", address: "", mapUrl: "", startDate: today, endDate: today, hours: "", items: [], updatedAt: "",
          } });
          setShowPopupEditor(true);
        })}><Plus aria-hidden /> New pop-up</Button>
        <Input aria-label="Search pop-ups" placeholder="Search pop-ups" value={popupSearch} onChange={event => setPopupSearch(event.target.value)} />
        {filteredPopups.length ? <ul className="divide-y">{filteredPopups.map(item => <li key={item.id}>
          <Button type="button" variant="ghost" className="h-auto w-full justify-between gap-2 whitespace-normal p-2 text-left aria-pressed:bg-accent"
            aria-pressed={popup?.id === item.id} disabled={busy} onClick={() => {
              if (popup?.id === item.id) { setShowPopupEditor(true); return; }
              switchView(() => { setSelectedPopup(item.id); setShowPopupEditor(true); });
            }}>
            <span className="min-w-0 break-words">
              <span className="block font-medium">{item.name}</span>
              <span className="block text-xs text-muted-foreground">{catalog.locations.find(location => location.id === item.locationId)?.name}</span>
            </span>
            <PopupStatus item={item} today={today} />
          </Button>
        </li>)}</ul> : <p className="text-sm text-muted-foreground">{popupSearch.trim() ? "No matching pop-ups." : "No pop-ups yet."}</p>}
      </>}
      editor={popup ? renderForm(<div className="@container/popups space-y-5">
        {(() => {
          const descriptions = draft?.type === "popup" ? draft.descriptions : popup.items.join("\n");
          const update = (patch: Partial<StorePopup>) => edit({ type: "popup", item: { ...popup, ...patch }, descriptions });
          return <>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="break-words text-2xl font-semibold tracking-tight">{popup.id ? popup.name || "Untitled pop-up" : "New pop-up"}</h2>
              {popup.id && <PopupStatus item={popup} today={today} />}
            </div>
            <div className="grid gap-5 @min-[34rem]/popups:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
              <section className="@container/event min-w-0 space-y-3" aria-label="Event details">
                <h3 className="text-base font-semibold">Event details</h3>
                <div className="grid gap-3 @min-[15rem]/event:grid-cols-2">
                  <TextField label="Name" required maxLength={120} value={popup.name} change={name => update({ name })} />
                  <Field label="City"><AdminSelect label="City" required value={popup.locationId} onValueChange={locationId => update({ locationId })}
                    options={catalog.locations.map(item => ({ value: item.id, label: item.name }))} /></Field>
                </div>
                <Field label="Address"><Textarea required rows={2} maxLength={300} className="min-h-16 resize-y text-sm"
                  value={popup.address} onChange={event => update({ address: event.target.value })} /></Field>
                <TextField label="Map link" type="url" value={popup.mapUrl} change={mapUrl => update({ mapUrl })} />
              </section>
              <section className="@container/schedule min-w-0 space-y-3 @min-[34rem]/popups:border-l @min-[34rem]/popups:pl-5" aria-label="Schedule">
                <h3 className="text-base font-semibold">Schedule</h3>
                <div className="grid gap-3 @min-[16rem]/schedule:grid-cols-2">
                  <TextField label="Starts" required type="date" value={popup.startDate} change={startDate => update({ startDate })} />
                  <TextField label="Ends" required type="date" min={popup.startDate} value={popup.endDate} change={endDate => update({ endDate })} />
                </div>
                <TextField label="Hours" required maxLength={80} value={popup.hours} change={hours => update({ hours })} />
                <p className="text-sm text-muted-foreground">This pop-up leaves Find Us after its end date in Manila time.</p>
              </section>
            </div>
            <div className="space-y-2 border-t pt-4">
              <Field label="Items"><Textarea rows={2} className="min-h-16 resize-y text-sm" aria-describedby="popup-items-help" value={descriptions}
                onChange={event => edit({ type: "popup", item: popup, descriptions: event.target.value })} /></Field>
              <p id="popup-items-help" className="text-sm text-muted-foreground">One item per line.</p>
            </div>
          </>;
        })()}
      </div>, true) : <p className="text-sm text-muted-foreground">Select or create a pop-up.</p>}
    />}</TabsContent>
    <TabsContent value="links" className="admin-panel-enter">{tab === "links" && renderForm(<>
      <p className="text-sm text-muted-foreground">Leave unused links blank to hide them. Manage branch delivery-app links in Settings.</p>
      {([["instagramUrl", "Instagram"], ["instagramDmUrl", "Instagram DM"], ["messengerUrl", "Messenger"]] as const).map(([key, label]) =>
        <TextField key={key} label={label} type="url" pattern="https://.*" placeholder="https://" value={links[key]}
          change={value => edit({ type: "links", links: { ...links, [key]: value } })} />)}
    </>)}</TabsContent>
  </Tabs>
  <AlertDialog open={Boolean(pendingView)} onOpenChange={open => { if (!open) setPendingView(undefined); }}>
    <AlertDialogContent className="admin-theme motion-reduce:animate-none">
      <AlertDialogHeader>
        <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
        <AlertDialogDescription>Stay here to keep working on this draft, or discard it and continue.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Stay</AlertDialogCancel>
        <Button variant="destructive" onClick={() => {
          reset();
          pendingView?.();
          setPendingView(undefined);
        }}>Discard and continue</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog></>;
}
