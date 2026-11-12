"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminSelect } from "@/components/admin/admin-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StoreLocation } from "@/lib/storefront/types";
import { adminRequest, OrderRequestError } from "../orders-data";
import { allowDiscard, CatalogLoading, catalogChange, catalogError, EditorActions, Feedback, Field, TextField, Toggle, uniqueSlug, useCatalog, useDraftGuard, type Catalog } from "./catalog-ui";
import { BackupSettings } from "../backups/backup-settings";
import { ResourceEditor } from "./resource-editor";

function Locations({ catalog, reload }: { catalog: Catalog; reload: () => Promise<Catalog | undefined> }) {
  return <ResourceEditor<StoreLocation>
    catalog={catalog} items={catalog.locations} reload={reload} action="save_location" label="location"
    create={() => ({ id: "", kind: "regular", name: "", address: "", mapUrl: "", hoursLabel: "", visible: false,
      pickupEnabled: true, deliveryEnabled: false, acceptingOrders: false, grabFoodUrl: "", foodpandaUrl: "", updatedAt: "" })}
    payload={draft => {
      const nameSlug = uniqueSlug(draft.name, catalog.locations.map(item => item.id), "location");
      const id = draft.id || (nameSlug === "cebu" ? uniqueSlug("cebu-branch", catalog.locations.map(item => item.id), "branch") : nameSlug);
      return { ...draft, id, updatedAt: draft.updatedAt || undefined, visible: id === "cebu" || draft.visible,
        grabFoodUrl: draft.kind === "regular" ? draft.grabFoodUrl.trim() : "", foodpandaUrl: draft.kind === "regular" ? draft.foodpandaUrl.trim() : "", mapUrl: draft.mapUrl.trim() };
    }}
    summary={item => <><span className="flex-1">{item.name}<span className="block text-xs text-muted-foreground">{item.kind === "regular" ? "Regular branch" : "Drop city"}</span></span><Badge variant="outline">{item.visible ? "Visible" : "Hidden"}</Badge></>}
    fields={(draft, update) => <>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Name" required maxLength={100} value={draft.name} change={name => update({ name })} />
        <Field label="Location type"><AdminSelect label="Location type" disabled={!!draft.id} value={draft.kind} onValueChange={kind => update({ kind })}
          options={[{ value: "regular", label: "Regular branch" }, { value: "drop", label: "Drop city" }]} /></Field>
      </div>
      <TextField label="Address" maxLength={300} value={draft.address} change={address => update({ address })} />
      <TextField label="Map link" type="url" placeholder="https://" value={draft.mapUrl} change={mapUrl => update({ mapUrl })} />
      <TextField label="Public hours label" maxLength={150} value={draft.hoursLabel} change={hoursLabel => update({ hoursLabel })} />
      <Toggle label="Visible on storefront" checked={draft.visible} disabled={draft.id === "cebu"} change={visible => update({ visible })} />
      {draft.id === "cebu" && <p className="text-sm text-muted-foreground">Cebu is always visible.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle label="Allow pickup" checked={draft.pickupEnabled} change={pickupEnabled => update({ pickupEnabled })} />
        <Toggle label="Allow delivery" checked={draft.deliveryEnabled} change={deliveryEnabled => update({ deliveryEnabled })} />
      </div>
      {draft.kind === "regular" ? <>
        <TextField label="GrabFood link" type="url" placeholder="https://" value={draft.grabFoodUrl} change={grabFoodUrl => update({ grabFoodUrl })} />
        <TextField label="foodpanda link" type="url" placeholder="https://" value={draft.foodpandaUrl} change={foodpandaUrl => update({ foodpandaUrl })} />
      </> : <p className="text-sm text-muted-foreground">Customers can order from this city when it has a published drop. Set event dates and windows in Drops.</p>}
    </>}
  />;
}

function OrderingRules({ catalog, reload }: { catalog: Catalog; reload: () => Promise<Catalog | undefined> }) {
  const [draft, setDraft] = useState<{ horizon: string; lead: string; revision: number; updatedAt: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const saved = { horizon: String(catalog.settings.bookingHorizonDays), lead: String(catalog.settings.preorderLeadDays), revision: catalog.revision, updatedAt: catalog.settings.updatedAt };
  const current = draft ?? saved;
  const dirty = current.horizon !== saved.horizon || current.lead !== saved.lead;
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
    <Feedback error={error} success={success} />
    {error.startsWith("Someone") && <Button type="button" variant="outline" onClick={async () => {
      if (allowDiscard(dirty) && await reload()) { setDraft(undefined); setError(""); }
    }}>Reload catalog</Button>}
    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      <TextField label="Booking horizon (days)" type="number" required min={1} max={60} step={1} value={current.horizon} change={horizon => setDraft({ ...current, horizon })} />
      <TextField label="Preorder preparation (days)" type="number" required min={0} max={30} step={1} value={current.lead} change={lead => setDraft({ ...current, lead })} />
    </fieldset>
    <EditorActions busy={busy} dirty={dirty} reset={() => { setDraft(undefined); setError(""); }} />
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
