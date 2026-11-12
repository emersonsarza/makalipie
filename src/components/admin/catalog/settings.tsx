"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, Truck, type LucideIcon } from "lucide-react";
import { formatCebuAddress } from "@/components/address-lines";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminSelect } from "@/components/admin/admin-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StoreLocation } from "@/lib/storefront/types";
import { adminRequest, OrderRequestError } from "../orders-data";
import { CatalogLoading, catalogChange, catalogError, EditorActions, Feedback, Field, TextField, uniqueSlug, useAllowDiscard, useCatalog, useDraftGuard, type Catalog } from "./catalog-ui";
import { BackupSettings } from "../backups/backup-settings";
import { ResourceEditor } from "./resource-editor";

function FulfillmentSwitch({ icon: Icon, label, checked, change }: {
  icon: LucideIcon; label: string; checked: boolean; change: (checked: boolean) => void;
}) {
  const id = useId();
  return <div className="flex min-h-9 items-center gap-3">
    <Icon className="size-4 shrink-0" aria-hidden />
    <label className="flex-1 text-sm font-medium" htmlFor={id}>{label}</label>
    <Switch id={id} checked={checked} onCheckedChange={change} />
  </div>;
}

function Locations({ catalog, reload }: { catalog: Catalog; reload: () => Promise<Catalog | undefined> }) {
  const locations = catalog.locations.map(location => location.id === "cebu"
    ? { ...location, address: formatCebuAddress(location.address) }
    : location);
  return <ResourceEditor<StoreLocation>
    catalog={catalog} items={locations} reload={reload} action="save_location" label="location"
    create={() => ({ id: "", kind: "regular", name: "", address: "", mapUrl: "", hoursLabel: "", visible: false,
      pickupEnabled: true, deliveryEnabled: false, acceptingOrders: false, grabFoodUrl: "", foodpandaUrl: "", updatedAt: "" })}
    payload={draft => {
      const nameSlug = uniqueSlug(draft.name, catalog.locations.map(item => item.id), "location");
      const id = draft.id || (nameSlug === "cebu" ? uniqueSlug("cebu-branch", catalog.locations.map(item => item.id), "branch") : nameSlug);
      return { ...draft, id, updatedAt: draft.updatedAt || undefined, visible: id === "cebu" || draft.visible,
        grabFoodUrl: draft.kind === "regular" ? draft.grabFoodUrl.trim() : "", foodpandaUrl: draft.kind === "regular" ? draft.foodpandaUrl.trim() : "", mapUrl: draft.mapUrl.trim() };
    }}
    summary={item => <><span className="flex-1">{item.name}<span className="block text-xs text-muted-foreground">{item.kind === "regular" ? "Regular branch" : "Drop city"}</span></span><Badge variant="outline">{item.visible ? "Visible" : "Hidden"}</Badge></>}
    editorHeading={item => <div className="flex flex-wrap items-center gap-3">
      <h2 className="text-2xl font-semibold tracking-tight">{item.id ? item.name : "New location"}</h2>
      <Badge className={item.visible
        ? "rounded-md bg-green-100 text-green-900 normal-case tracking-normal"
        : "rounded-md bg-neutral-100 text-neutral-700 normal-case tracking-normal"}>
        {item.visible ? "Visible" : "Hidden"}
      </Badge>
    </div>}
    fields={(draft, update) => <div className="@container/location space-y-5">
      <div className="grid gap-5 border-t pt-4 @min-[30rem]/location:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="@container/details min-w-0 space-y-3" aria-label="Location details">
          <h3 className="text-base font-semibold">Location details</h3>
          <div className="grid gap-3 @min-[15rem]/details:grid-cols-2">
            <TextField label="Name" required maxLength={100} value={draft.name} change={name => update({ name })} />
            <Field label="Location type"><AdminSelect label="Location type" disabled={!!draft.id} value={draft.kind} onValueChange={kind => update({ kind })}
              options={[{ value: "regular", label: "Regular branch" }, { value: "drop", label: "Drop city" }]} /></Field>
          </div>
          <Field label="Address">
            <Textarea rows={2} maxLength={300} className="min-h-16 resize-y text-sm"
              value={draft.address} onChange={event => update({ address: event.target.value })} />
          </Field>
          <TextField label="Map link" type="url" placeholder="https://" value={draft.mapUrl} change={mapUrl => update({ mapUrl })} />
        </section>
        <section className="min-w-0 space-y-3 @min-[30rem]/location:border-l @min-[30rem]/location:pl-5" aria-label="Storefront visibility">
          <h3 className="text-base font-semibold">Storefront visibility</h3>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 py-1">
            <Switch id="location-storefront-visible" className="mt-0.5" checked={draft.visible} disabled={draft.id === "cebu"}
              aria-describedby={draft.id === "cebu" ? "location-storefront-help" : undefined}
              onCheckedChange={visible => update({ visible })} />
            <label htmlFor="location-storefront-visible" className="text-sm font-medium">Visible on storefront</label>
            {draft.id === "cebu" && <p id="location-storefront-help" className="col-start-2 text-sm text-muted-foreground">Cebu is always visible.</p>}
          </div>
          <TextField label="Public hours label" maxLength={150} value={draft.hoursLabel} change={hoursLabel => update({ hoursLabel })} />
        </section>
      </div>
      <div className="grid gap-5 border-t pt-4 @min-[30rem]/location:grid-cols-2">
        <section className="min-w-0 space-y-2" aria-label="Fulfillment">
          <h3 className="text-base font-semibold">Fulfillment</h3>
          <FulfillmentSwitch icon={ShoppingBag} label="Allow pickup" checked={draft.pickupEnabled} change={pickupEnabled => update({ pickupEnabled })} />
          <FulfillmentSwitch icon={Truck} label="Allow delivery" checked={draft.deliveryEnabled} change={deliveryEnabled => update({ deliveryEnabled })} />
          {draft.kind === "drop" && <p className="text-sm text-muted-foreground">Customers can order from this city when it has a published drop. Set event dates and windows in Drops.</p>}
        </section>
        {draft.kind === "regular" && <section className="min-w-0 space-y-3 @min-[30rem]/location:border-l @min-[30rem]/location:pl-5" aria-label="Delivery apps">
          <h3 className="text-base font-semibold">Delivery apps</h3>
          <TextField label="GrabFood link" type="url" placeholder="https://" value={draft.grabFoodUrl} change={grabFoodUrl => update({ grabFoodUrl })} />
          <TextField label="foodpanda link" type="url" placeholder="https://" value={draft.foodpandaUrl} change={foodpandaUrl => update({ foodpandaUrl })} />
        </section>}
      </div>
    </div>}
  />;
}

function OrderingRules({ catalog, reload }: { catalog: Catalog; reload: () => Promise<Catalog | undefined> }) {
  const [draft, setDraft] = useState<{ horizon: string; lead: string; revision: number; updatedAt: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const saved = { horizon: String(catalog.settings.bookingHorizonDays), lead: String(catalog.settings.preorderLeadDays), revision: catalog.revision, updatedAt: catalog.settings.updatedAt };
  const current = draft ?? saved;
  const stale = !!draft && draft.revision !== catalog.revision;
  const dirty = current.horizon !== saved.horizon || current.lead !== saved.lead;
  const allowDiscard = useAllowDiscard();
  useDraftGuard(dirty);

  return <form className="max-w-xl space-y-4 rounded-lg border bg-background p-4 sm:p-5" onSubmit={async event => {
    event.preventDefault();
    if (busy || !dirty) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await catalogChange("save_settings", current.revision, {
        ...catalog.settings, updatedAt: current.updatedAt,
        bookingHorizonDays: Number(current.horizon), preorderLeadDays: Number(current.lead),
      });
      setDraft(undefined);
      setSuccess(await reload() ? "Ordering rules saved." : "Ordering rules saved. Reload to see the latest values.");
    } catch (failure) { setError(catalogError(failure)); }
    finally { setBusy(false); }
  }}>
    <h2 className="text-lg font-semibold">Ordering rules</h2>
    <p className="text-sm text-muted-foreground">These settings apply to regular branches. Drops use their own ordering dates and hours.</p>
    <Feedback error={error || (stale ? "Someone changed the catalog. Reload before saving this draft." : "")} success={success} />
    {(stale || error.startsWith("Someone")) && <Button type="button" variant="outline" onClick={async () => {
      if (await allowDiscard(dirty) && await reload()) { setDraft(undefined); setError(""); }
    }}>Reload catalog</Button>}
    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      <TextField label="Booking horizon (days)" type="number" required min={1} max={60} step={1} value={current.horizon} change={horizon => setDraft({ ...current, horizon })} />
      <TextField label="Preorder preparation (days)" type="number" required min={0} max={30} step={1} value={current.lead} change={lead => setDraft({ ...current, lead })} />
    </fieldset>
    <EditorActions saveDisabled={stale} busy={busy} dirty={dirty} reset={() => { setDraft(undefined); setError(""); }} />
  </form>;
}

function AccountSettings() {
  const router = useRouter();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const dirty = Boolean(currentPassword || newPassword || confirmation);
  useDraftGuard(dirty);

  function reset() { setCurrent(""); setNew(""); setConfirmation(""); setError(""); }

  return <form className="max-w-xl space-y-4 rounded-lg border bg-background p-4 sm:p-5" onSubmit={async event => {
    event.preventDefault();
    if (busy || !dirty) return;
    setSuccess("");
    if (newPassword !== confirmation) { setError("The new passwords do not match."); return; }
    if (newPassword === currentPassword) { setError("Choose a different password."); return; }
    setBusy(true); setError("");
    try {
      await adminRequest("/api/admin/session/password", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }),
      });
      reset(); setSuccess("Password updated. Other sessions were signed out."); router.refresh();
    } catch (failure) {
      setError(failure instanceof OrderRequestError && failure.body.error === "invalid_credentials"
        ? "The current password was incorrect." : "Could not update the password. Sign in again if your session has expired.");
    } finally { setBusy(false); }
  }}>
    <h2 className="text-lg font-semibold">Change password</h2>
    <Feedback error={error} success={success} />
    <fieldset disabled={busy} className="space-y-3">
      <TextField label="Current password" type="password" autoComplete="current-password" required value={currentPassword} change={setCurrent} />
      <TextField label="New password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={newPassword} change={setNew} />
      <TextField label="Confirm new password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={confirmation} change={setConfirmation} />
    </fieldset>
    <EditorActions busy={busy} dirty={dirty} reset={reset} />
  </form>;
}

export function SettingsEditor() {
  const { catalog, error, reload } = useCatalog();
  if (!catalog) return <CatalogLoading error={error} retry={() => void reload()} />;

  return <Tabs defaultValue="locations" className="space-y-4">
    <div className="overflow-x-auto p-1"><TabsList aria-label="Settings sections"><TabsTrigger value="locations">Locations</TabsTrigger><TabsTrigger value="rules">Ordering rules</TabsTrigger><TabsTrigger value="account">Account</TabsTrigger><TabsTrigger value="backups">Backups</TabsTrigger></TabsList></div>
    <TabsContent value="locations" keepMounted className="admin-panel-enter"><Locations catalog={catalog} reload={reload} /></TabsContent>
    <TabsContent value="rules" keepMounted className="admin-panel-enter"><OrderingRules catalog={catalog} reload={reload} /></TabsContent>
    <TabsContent value="account" keepMounted className="admin-panel-enter"><AccountSettings /></TabsContent>
    <TabsContent value="backups" className="admin-panel-enter"><BackupSettings /></TabsContent>
  </Tabs>;
}
