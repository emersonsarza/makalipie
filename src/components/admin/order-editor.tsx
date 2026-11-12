"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin/admin-select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ChevronDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import type { AdminOrder } from "@/lib/orders/query";
import { sizeEligibleOnDate, slotsForBranch } from "@/lib/storefront/eligibility";
import type { StoreCatalog } from "@/lib/storefront/types";
import type { DropStore } from "@/lib/drops/types";
import { manilaToday, OrderRequestError, pesos, writeOrder } from "./orders-data";

type Item = { key: string; name: string; unitPriceCentavos: number; quantity: number; productId?: string | null; sizeId?: string | null; offeringId?: string | null; lineId?: string; id?: string; max?: number; contents?: string };

export function OrderEditor({ order, catalog, drops, stale, open, onClosed, close, saved, reload }: {
  order: AdminOrder | null; catalog: StoreCatalog; drops: DropStore; stale: boolean;
  open: boolean; onClosed: () => void; close: () => void; saved: (id: string) => void; reload: () => void;
}) {
  const [locationId, setLocation] = useState(order?.locationId ?? catalog.locations[0]?.id ?? "");
  const [dropId, setDrop] = useState(order?.dropId ?? "");
  const [date, setDate] = useState(order?.fulfillmentDate ?? manilaToday());
  const [method, setMethod] = useState(order?.fulfillment ?? "pickup");
  const [slotId, setSlot] = useState(order?.slotId ?? "");
  const [name, setName] = useState(order?.customerName ?? "");
  const [phone, setPhone] = useState(order?.customerPhone ?? "");
  const [address, setAddress] = useState(order?.deliveryAddress ?? "");
  const [notes, setNotes] = useState(order?.notes ?? "");
  const [feeMode, setFeeMode] = useState(order?.deliveryFeeMode ?? "unknown");
  const [fee, setFee] = useState(order?.deliveryFeeCentavos != null ? String(order.deliveryFeeCentavos / 100) : "");
  const [items, setItems] = useState<Item[]>(() => [
    ...(order?.lines.map(line => ({ ...line, id: undefined, lineId: line.id, key: line.offeringId ?? line.productId + ":" + line.sizeId })) ?? []),
    ...(order?.addons.map(addon => ({ ...addon, key: "addon:" + addon.id })) ?? []),
  ]);
  const [search, setSearch] = useState("");
  const mobile = useIsMobile();
  const [detailsOpen, setDetailsOpen] = useState(!order);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [tab, setTab] = useState("items");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<OrderRequestError["body"]>();
  const [conflict, setConflict] = useState(false);
  const [allowUnavailable, setOverride] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const location = catalog.locations.find(item => item.id === locationId);
  const drop = drops.drops.find(item => item.id === dropId);
  const channel = location?.kind ?? order?.channel ?? "regular";
  const slots = date && channel === "regular" ? slotsForBranch(catalog, locationId, date) : [];
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCentavos, 0);
  const feeCentavos = Math.round(Number(fee) * 100);
  const available: Item[] = channel === "drop"
    ? (drop?.offerings ?? []).flatMap(offering => {
        const allocation = offering.dates.find(item => item.date === date && item.included);
        const original = order?.fulfillmentDate === date ? order.lines.find(line => line.offeringId === offering.id)?.quantity ?? 0 : 0;
        const max = allocation ? Math.min(offering.perOrderMax, allocation.allocated - allocation.committed + original) : 0;
        return max > 0 ? [{ key: offering.id, offeringId: offering.id, name: offering.name, quantity: 1, unitPriceCentavos: offering.priceCentavos, max, contents: offering.components.map(part => part.quantity + " × " + (catalog.products.find(product => product.id === part.productId)?.name ?? part.productId)).join(", ") }] : [];
      })
    : catalog.products.flatMap(product => product.sizes.filter(size => allowUnavailable || (date && sizeEligibleOnDate(catalog, product, size, catalog.sections.find(section => section.id === product.sectionId), locationId, date))).map(size => ({
        key: product.id + ":" + size.id, productId: product.id, sizeId: size.id, name: product.name + " · " + size.label, quantity: 1, unitPriceCentavos: size.priceCentavos,
      })));
  const addons = channel === "drop" ? (drop?.addons ?? []).map(addon => ({ ...addon, id: addon.addOnId })) : catalog.addOns.filter(addon => addon.enabled && addon.locationIds.includes(locationId));
  available.push(...addons.map(addon => ({ id: addon.id, key: "addon:" + addon.id, name: addon.name, unitPriceCentavos: addon.priceCentavos, quantity: 1 })));

  function discard() {
    if (busy) return;
    if (dirty) setDiscardOpen(true);
    else close();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || stale || conflict || review?.error === "price_change") return;
    const lines = items.filter(item => !item.id).map(({ productId, sizeId, offeringId, lineId, quantity, unitPriceCentavos }) => ({ productId, sizeId, offeringId, lineId, quantity, unitPriceCentavos }));
    if (!name.trim() || phone.trim().length < 8 || !date || (method === "delivery" && !address.trim())) {
      setError("Enter the customer name, phone, fulfillment date, and delivery address when required.");
      setTab("items");
      setDetailsOpen(true);
      return;
    }
    if (!lines.length || (channel === "drop" && !dropId) || (channel === "regular" && !slotId) || (method === "delivery" && feeMode === "known" && !fee.trim())) {
      setError("Add at least one pie or package and complete the fulfillment details.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await writeOrder<{ orderId: string }>(order ? "update_order" : "place_order", {
        ...(order ? { orderId: order.id, updatedAt: order.updatedAt } : { idempotencyKey: key, channel, locationId, dropId: dropId || null, allowUnavailable }),
        fulfillmentDate: date, fulfillment: method, slotId: channel === "regular" ? slotId : null,
        customerName: name, customerPhone: phone, deliveryAddress: address, notes,
        lines, addons: items.filter(item => item.id).map(({ id, quantity, unitPriceCentavos }) => ({ id, quantity, unitPriceCentavos })),
        deliveryFeeMode: method === "delivery" ? feeMode : undefined,
        deliveryFeeCentavos: method === "delivery" && feeMode === "known" ? feeCentavos : null,
      });
      saved(result.orderId);
    } catch (failure) {
      setError(failure instanceof OrderRequestError ? failure.message : "Connection lost. Retry this same draft to check whether it saved.");
      if (failure instanceof OrderRequestError) {
        setReview(failure.body);
        if (failure.body.error === "stale_save") setConflict(true);
      }
    } finally { setBusy(false); }
  }

  function revisedPrice(item: Item) {
    return item.id ? review?.addons?.find(change => change.id === item.id) :
      review?.lines?.find(change => item.offeringId ? change.offeringId === item.offeringId :
        change.productId === item.productId && change.sizeId === item.sizeId);
  }

  const itemsPanel = (
          <section className="space-y-4 p-5">
            <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} className="rounded-lg border bg-white p-4">
              <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 text-left font-semibold">
                Order details <ChevronDown aria-hidden="true" className="size-4 transition-transform group-data-[panel-open]:rotate-180 motion-reduce:transition-none" />
              </CollapsibleTrigger>
              <CollapsibleContent className="admin-disclosure">
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label>Location<AdminSelect label="Location" disabled={!!order} value={locationId} onValueChange={value => {
                  setLocation(value); setDrop(""); setSlot(""); setItems([]); setOverride(false);
                }} options={catalog.locations.map(item => ({ value: item.id, label: item.name }))} /></label>
                {channel === "drop" && <label>Drop<AdminSelect label="Drop" disabled={!!order} value={dropId} onValueChange={value => { setDrop(value); setItems([]); }}
                  options={[{ value: "", label: "Select a drop" }, ...drops.drops
                    .filter(item => item.locationId === locationId && (item.status === "published" || item.id === dropId))
                    .map(item => ({ value: item.id, label: item.name }))]} /></label>}
                <label>Fulfillment date{channel === "drop" ? <AdminSelect label="Fulfillment date" value={date} onValueChange={setDate}
                  options={[{ value: "", label: "Select date" }, ...(drop?.dates ?? []).map(item => ({ value: item.date, label: item.date }))]} /> : <Input required type="date" value={date} onChange={event => { setDate(event.target.value); setSlot(""); }} />}</label>
                <label>Method<AdminSelect label="Method" value={method} onValueChange={setMethod} options={[
                  { value: "pickup", label: "Pickup" },
                  { value: "delivery", label: "Delivery", disabled: !(drop?.deliveryEnabled ?? location?.deliveryEnabled) && method !== "delivery" },
                ]} /></label>
                {channel === "regular" && <label>{method === "delivery" ? "Dispatch slot" : "Pickup slot"}{allowUnavailable ? <Input type="time" value={slotId} onChange={event => setSlot(event.target.value)} /> :
                  <AdminSelect label={method === "delivery" ? "Dispatch slot" : "Pickup slot"} value={slotId} onValueChange={setSlot} options={[
                    { value: "", label: "Select a slot" },
                    ...(slotId && !slots.some(slot => slot.id === slotId) ? [{ value: slotId, label: slotId }] : []),
                    ...slots.map(slot => ({ value: slot.id, label: slot.label })),
                  ]} />}</label>}
                <label>Customer name<Input required value={name} onChange={event => setName(event.target.value)} /></label>
                <label>Phone<Input required type="tel" value={phone} onChange={event => setPhone(event.target.value)} /></label>
                {method === "delivery" && <label>Delivery address<Input required value={address} onChange={event => setAddress(event.target.value)} /></label>}
                <label className="sm:col-span-2">Notes<Textarea value={notes} onChange={event => setNotes(event.target.value)} /></label>
              </div>
            </CollapsibleContent>
            </Collapsible>
            {!order && channel === "regular" && <label className="flex gap-2 text-sm"><input type="checkbox" checked={allowUnavailable} onChange={event => setOverride(event.target.checked && window.confirm("Allow this order to bypass regular availability rules?"))} /> Override regular availability</label>}
            <Input aria-label="Search items" placeholder="Search pies, packages and add-ons" value={search} onChange={event => setSearch(event.target.value)} />
            <div className="grid gap-2 sm:grid-cols-2">{available.filter(item => item.name.toLowerCase().includes(search.toLowerCase())).map(item => {
              const count = items.find(selected => selected.key === item.key)?.quantity ?? 0;
              return <Button type="button" variant="outline" key={item.key} disabled={count >= (item.max ?? 99)} className="h-auto min-h-12 flex-col items-start whitespace-normal py-2 text-left" onClick={() => {
                setDirty(true);
                setItems(current => count ? current.map(selected => selected.key === item.key ? { ...selected, quantity: selected.quantity + 1 } : selected) : [...current, item]);
              }}><span>{item.name}</span><span className="text-xs text-muted-foreground">{pesos(item.unitPriceCentavos)}{item.contents ? " · " + item.contents : ""}</span></Button>;
            })}</div>
          </section>
  );
  const summaryPanel = (
          <section className="space-y-4 bg-neutral-50 p-5 md:border-l">
            <h2 className="text-lg font-semibold">Order summary</h2>
            {!items.length && <p className="text-sm text-muted-foreground">Add an item to begin.</p>}
            {items.map(item => <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2" key={item.key}>
              <div><p className="font-medium">{item.name}</p><p className="text-sm">{pesos(item.unitPriceCentavos)} each</p></div>
              <div className="flex items-center gap-2"><Input aria-label={item.name + " quantity"} className="w-20" type="number" min={1} max={available.find(choice => choice.key === item.key)?.max ?? 99} value={item.quantity} onChange={event => setItems(current => current.map(row => row.key === item.key ? { ...row, quantity: Math.max(1, Number(event.target.value)) } : row))} /><Button type="button" variant="ghost" onClick={() => { setDirty(true); setItems(current => current.filter(row => row.key !== item.key)); }}>Remove</Button></div>
            </div>)}
            {method === "delivery" && <div className="space-y-2"><label>Delivery fee<AdminSelect label="Delivery fee" value={feeMode} onValueChange={setFeeMode} options={[
              { value: "unknown", label: "Fee pending" }, { value: "known", label: "Known amount" }, { value: "rider", label: "Customer pays rider" },
            ]} /></label>
              {feeMode === "known" && <label>Fee in pesos<Input type="number" min="0" step=".01" value={fee} onChange={event => setFee(event.target.value)} /></label>}</div>}
            <p>Subtotal <strong>{pesos(subtotal)}</strong></p>
            <p className="text-xl font-semibold">{method === "delivery" && feeMode === "unknown" ? "Delivery fee pending" : "Total " + pesos(subtotal + (method === "delivery" && feeMode === "known" ? feeCentavos : 0))}</p>
          </section>
  );

  return <Sheet open={open} onOpenChange={next => { if (!next) discard(); }} onOpenChangeComplete={next => { if (!next) onClosed(); }}>
    <SheetContent side="right" className="admin-theme admin-order-sheet flex h-full flex-col gap-0 data-[side=right]:w-full data-[side=right]:sm:w-[80vw] data-[side=right]:sm:max-w-[1440px]">
      <header className="border-b px-5 py-4 pr-14"><SheetTitle>{order ? "Edit " + order.orderNumber : "New order"}</SheetTitle><SheetDescription>Select items and review the order before saving.</SheetDescription></header>
      <form noValidate onSubmit={submit} onChange={() => setDirty(true)} className="flex min-h-0 flex-1 flex-col">
        {mobile ? <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="border-b p-3"><TabsList aria-label="Order editor sections">
            <TabsTrigger value="items">Items</TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
          </TabsList></div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <TabsContent value="items" className="admin-panel-enter">{itemsPanel}</TabsContent>
            <TabsContent value="summary" className="admin-panel-enter">{summaryPanel}</TabsContent>
          </div>
        </Tabs> : <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] overflow-y-auto">
          {itemsPanel}
          {summaryPanel}
        </div>}
        <footer className="space-y-2 border-t bg-white p-4">
          {(error || stale) && <Alert variant="destructive"><AlertDescription>{stale ? "This order changed while you were editing." : error}{(stale || conflict) && <Button type="button" variant="ghost" onClick={() => { if (window.confirm("Discard this draft and load the latest order?")) reload(); }}>Reload order</Button>}</AlertDescription></Alert>}
          {review?.error === "price_change" && <div className="space-y-2 text-sm">
            {items.flatMap(item => {
              const change = revisedPrice(item);
              return change ? [<p key={item.key}>{item.name}: {pesos(item.unitPriceCentavos)} → {change.unitPriceCentavos == null ? "Unavailable" : pesos(change.unitPriceCentavos)}</p>] : [];
            })}
            <Button type="button" variant="outline" onClick={() => {
              setItems(current => current.flatMap(item => {
                const change = revisedPrice(item);
                return !change ? [item] : change.unitPriceCentavos == null ? [] : [{ ...item, unitPriceCentavos: change.unitPriceCentavos }];
              }));
              setReview(undefined);
              setError("");
            }}>Apply current prices</Button>
          </div>}
          {review?.offerings?.map(item => <p key={item.id} className="text-sm">{available.find(choice => choice.key === item.id)?.name ?? item.id}: {item.remaining} remaining</p>)}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={discard}>Discard</Button><Button type="submit" disabled={busy || stale || conflict || review?.error === "price_change"}>{busy ? "Saving…" : order ? "Save changes" : "Create order"}</Button></div>
        </footer>
      </form>
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent className="admin-theme">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>Changes in this order editor will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <Button variant="destructive" onClick={() => { setDiscardOpen(false); close(); }}>Discard changes</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SheetContent>
  </Sheet>;
}
