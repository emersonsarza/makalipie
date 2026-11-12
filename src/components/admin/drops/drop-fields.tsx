"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AdminSelect } from "@/components/admin/admin-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DropDate, DropEvent, DropOffering } from "@/lib/drops/types";
import type { StoreCatalog, StoreImage } from "@/lib/storefront/types";
import { Field, PriceField, TextField, Toggle } from "../catalog/catalog-ui";
import { pesos } from "../orders-data";

export function DropSection({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return <Collapsible defaultOpen={defaultOpen} className="rounded-lg border">
    <CollapsibleTrigger render={<Button type="button" variant="ghost" className="group h-auto w-full justify-between px-3 py-2 text-left font-semibold" />}>
      {title}<ChevronDown aria-hidden className="size-4 transition-transform group-data-[panel-open]:rotate-180 motion-reduce:transition-none" />
    </CollapsibleTrigger>
    <CollapsibleContent keepMounted className="admin-disclosure">
      <div className="space-y-3 p-3 pt-1">{children}</div>
    </CollapsibleContent>
  </Collapsible>;
}

export type Source = { productId: string; sizeId: string; name: string; priceCentavos: number; image: StoreImage; enabled: boolean };

export function dropSources(catalog: StoreCatalog): Source[] {
  return catalog.products.flatMap(product => product.sizes.map(size => ({
    productId: product.id, sizeId: size.id, name: product.name + " · " + size.label,
    priceCentavos: size.priceCentavos, enabled: product.enabled && size.enabled,
    image: size.themeImages.find(image => image.theme === catalog.settings.theme) ?? size.image ?? product.image,
  })));
}
const sourceKey = (source: { productId: string | null; sizeId: string | null }) => `${source.productId ?? ""}/${source.sizeId ?? ""}`;

function SourcePicker({ label, sources, value, disabled, change }: { label: string; sources: Source[]; value: string; disabled?: boolean; change: (source: Source) => void }) {
  return <Field label={label}><AdminSelect label={label} value={value} disabled={disabled} placeholder="Choose an enabled size" onValueChange={key => {
    const source = sources.find(item => sourceKey(item) === key);
    if (source?.enabled) change(source);
  }} options={sources.filter(source => source.enabled || sourceKey(source) === value).map(source => ({
    value: sourceKey(source), label: source.enabled ? source.name : source.name + " (disabled)", disabled: !source.enabled,
  }))} /></Field>;
}

export function DropDateFields({ date, booked, delivery, change, remove }: {
  date: DropDate; booked: boolean; delivery: boolean; change: (patch: Partial<DropDate>) => void; remove: () => void;
}) {
  return <div className="space-y-3 rounded-md border p-3">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <TextField label="Date" type="date" value={date.date} disabled={booked} change={value => change({ date: value })} />
      <Button type="button" variant="ghost" disabled={booked} onClick={remove}>Remove date</Button>
    </div>
    {booked && <p className="text-xs text-muted-foreground">This date has orders. Pickup and dispatch windows are locked.</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField label="Ordering opens" type="time" value={date.orderingOpens} change={orderingOpens => change({ orderingOpens })} />
      <TextField label="Ordering cutoff" type="time" value={date.orderingCutoff} change={orderingCutoff => change({ orderingCutoff })} />
      <TextField label="Pickup starts" type="time" value={date.pickupStarts} disabled={booked} change={pickupStarts => change({ pickupStarts })} />
      <TextField label="Pickup ends" type="time" value={date.pickupEnds} disabled={booked} change={pickupEnds => change({ pickupEnds })} />
      {delivery && <>
        <TextField label="Dispatch starts" type="time" value={date.dispatchStarts ?? ""} disabled={booked} change={dispatchStarts => change({ dispatchStarts: dispatchStarts || null })} />
        <TextField label="Dispatch ends" type="time" value={date.dispatchEnds ?? ""} disabled={booked} change={dispatchEnds => change({ dispatchEnds: dispatchEnds || null })} />
      </>}
    </div>
  </div>;
}

export function OfferingFields({ offering, sources, change, remove }: {
  offering: DropOffering; sources: Source[]; change: (patch: Partial<DropOffering>) => void; remove: () => void;
}) {
  const locked = !!offering.contentsLockedAt;
  const committed = offering.dates.some(date => date.committed > 0);
  const [autoPrice, setAutoPrice] = useState(!offering.components.length);
  const [priceRevision, setPriceRevision] = useState(0);
  const sum = offering.components.reduce((count, part) => count + part.quantity, 0);
  function updateParts(components: DropOffering["components"]) {
    const price = components.reduce((total, part) => total + (sources.find(source => sourceKey(source) === sourceKey(part))?.priceCentavos ?? 0) * part.quantity, 0);
    if (autoPrice) setPriceRevision(value => value + 1);
    change({ components, ...(autoPrice ? { priceCentavos: price } : {}) });
  }

  return <DropSection title={offering.name || (offering.kind === "size" ? "New individual pie" : "New package")} defaultOpen={!offering.name}>
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField label="Offering name" value={offering.name} maxLength={120} change={name => change({ name })} />
      <TextField label="Maximum per order" type="number" min={1} max={99} value={String(offering.perOrderMax)} change={value => change({ perOrderMax: Number(value) })} />
      <PriceField key={priceRevision} cents={offering.priceCentavos} change={priceCentavos => { setAutoPrice(false); change({ priceCentavos }); }} />
    </div>
    {offering.kind === "size" ? <SourcePicker label="Pie and size" sources={sources} value={sourceKey(offering) === "/" ? "" : sourceKey(offering)} disabled={committed} change={source => {
      setPriceRevision(value => value + 1);
      change({ productId: source.productId, sizeId: source.sizeId, name: offering.name || source.name, priceCentavos: source.priceCentavos });
    }} /> : <>
      <p className="text-sm text-muted-foreground">{locked ? "This package has been ordered. Its contents are locked." : `${sum} of 4 pies. Customers cannot substitute package items.`}</p>
      {offering.components.map((part, index) => {
        const source = sources.find(item => sourceKey(item) === sourceKey(part));
        return <div key={sourceKey(part)} className="flex flex-wrap items-end gap-2 border-b pb-2">
          {source && <Image src={source.image.path} alt="" width={40} height={40} className="size-10 rounded object-cover" />}
          <span className="min-w-0 flex-1 text-sm">{source?.name ?? sourceKey(part)}{source && !source.enabled && " (disabled)"}</span>
          <TextField label="Quantity" type="number" min={1} max={4} className="w-16" disabled={locked} value={String(part.quantity)} change={value => updateParts(offering.components.map((item, offset) => offset === index ? { ...item, quantity: Number(value) } : item))} />
          <Button type="button" variant="ghost" disabled={locked} onClick={() => updateParts(offering.components.filter((_, offset) => offset !== index))}>Remove pie</Button>
        </div>;
      })}
      {!locked && sum < 4 && <SourcePicker label="Add a pie to this package" value="" sources={sources.filter(source => !offering.components.some(part => sourceKey(part) === sourceKey(source)))} change={source => updateParts([
        ...offering.components, { productId: source.productId, sizeId: source.sizeId, quantity: 1 },
      ])} />}
    </>}
    <p className="text-xs text-muted-foreground">This limit applies to one order. Daily stock is set separately. Current price: {pesos(offering.priceCentavos)}.</p>
    <Button type="button" variant="outline" disabled={locked || committed} onClick={remove}>Remove offering</Button>
  </DropSection>;
}

export function AllocationFields({ drop, change }: { drop: DropEvent; change: (offerings: DropOffering[]) => void }) {
  return <>
    <p className="text-sm text-muted-foreground">Pending orders already consume stock. An offering’s per-order maximum does not change its daily allocation.</p>
    {!drop.dates.length || !drop.offerings.length ? <p className="text-sm">Add dates and offerings to set allocations.</p> : drop.dates.map(date => (
      <div key={date.date} className="space-y-1">
        <h3 className="text-sm font-semibold">{date.date || "New date"}</h3>
        <Table aria-label={`Allocations for ${date.date}`}><TableHeader><TableRow>
          <TableHead>Offering</TableHead><TableHead>Include</TableHead><TableHead>Allocated</TableHead><TableHead>Committed</TableHead><TableHead>Remaining</TableHead>
        </TableRow></TableHeader><TableBody>
          {drop.offerings.map(offering => {
            const allocation = offering.dates.find(item => item.date === date.date);
            if (!allocation) return null;
            const name = offering.name || "Unnamed offering";
            const patch = (values: Partial<typeof allocation>) => change(drop.offerings.map(item => item.id === offering.id ? {
              ...item, dates: item.dates.map(record => record.date === date.date ? { ...record, ...values } : record),
            } : item));
            return <TableRow key={offering.id}>
              <TableCell className="whitespace-normal">{name}</TableCell>
              <TableCell><Toggle label={`Include ${name} on ${date.date}`} hideLabel checked={allocation.included} change={included => patch({ included })} /></TableCell>
              <TableCell><TextField label={`Allocated for ${name} on ${date.date}`} hideLabel className="w-20" type="number" min={allocation.committed} step={1} value={String(allocation.allocated)} change={value => patch({ allocated: Number(value) })} /></TableCell>
              <TableCell>{allocation.committed}</TableCell><TableCell>{allocation.allocated - allocation.committed}</TableCell>
            </TableRow>;
          })}
        </TableBody></Table>
      </div>
    ))}
  </>;
}
