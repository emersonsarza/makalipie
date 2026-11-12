"use client";

import { Gift, PackagePlus, StickyNote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { StoreAddOn } from "@/lib/storefront/types";
import { pesos } from "../orders-data";
import { CatalogLoading, PriceField, TextField, Toggle, uniqueSlug, useCatalog } from "./catalog-ui";
import { ResourceEditor } from "./resource-editor";

const icons = [{ id: "default", label: "Default", Icon: PackagePlus }, { id: "gift", label: "Gift", Icon: Gift }, { id: "note", label: "Note", Icon: StickyNote }];

export function AddonsEditor() {
  const { catalog, error, reload } = useCatalog();
  if (!catalog) return <CatalogLoading error={error} retry={() => void reload()} />;
  return <ResourceEditor<StoreAddOn>
    catalog={catalog} items={catalog.addOns} reload={reload} action="save_addon" label="add-on"
    create={() => ({ id: "", name: "", priceCentavos: 0, icon: "default", enabled: false, sortOrder: Math.max(-1, ...catalog.addOns.map(item => item.sortOrder)) + 1, locationIds: [], updatedAt: "" })}
    payload={draft => ({ ...draft, id: draft.id || uniqueSlug(draft.name, catalog.addOns.map(item => item.id), "addon"), updatedAt: draft.updatedAt || undefined })}
    filterEnabled={item => item.enabled}
    summary={item => {
      const Icon = icons.find(icon => icon.id === item.icon)?.Icon ?? PackagePlus;
      return <><Icon aria-hidden /><span className="min-w-0 flex-1">{item.name}<span className="block text-xs text-muted-foreground">{pesos(item.priceCentavos)}</span></span><Badge variant="outline">{item.enabled ? "Enabled" : "Disabled"}</Badge></>;
    }}
    fields={(draft, update) => <>
      <TextField label="Name" required maxLength={80} value={draft.name} change={name => update({ name })} />
      <div className="grid gap-3 sm:grid-cols-2"><PriceField cents={draft.priceCentavos} change={priceCentavos => update({ priceCentavos })} />
        <TextField label="Display order" type="number" min={0} step={1} required value={String(draft.sortOrder)} change={value => update({ sortOrder: Number(value) })} /></div>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">Icon</legend>
        <RadioGroup value={draft.icon} onValueChange={value => update({ icon: String(value) })} className="flex flex-wrap gap-2">
          {icons.map(({ id, label, Icon }) => <label key={id} className="flex items-center gap-2 rounded-md border p-2 text-sm"><RadioGroupItem value={id} /><Icon className="size-4" aria-hidden />{label}</label>)}
        </RadioGroup>
      </fieldset>
      <Toggle label="Add-on enabled" checked={draft.enabled} change={enabled => update({ enabled })} />
      <fieldset className="space-y-1"><legend className="text-sm font-medium">Locations</legend>
        {catalog.locations.map(location => <Toggle key={location.id} label={location.name} checked={draft.locationIds.includes(location.id)} change={checked => update({ locationIds: checked ? [...draft.locationIds, location.id] : draft.locationIds.filter(id => id !== location.id) })} />)}
      </fieldset>
      <p className="text-sm text-muted-foreground">Customers choose the quantity per order. Disable an add-on to stop offering it.</p>
    </>}
  />;
}
