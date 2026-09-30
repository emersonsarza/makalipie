"use client";

import { ArrowUpRight, CalendarDays, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Image from "next/image";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar } from "@/components/ui/calendar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { dayjs } from "@/lib/dayjs";
import {
  formatPrice,
  itemPriceText,
  paymentMethods,
  site,
  type MenuItem,
} from "@/lib/site";
import { PickupAddress } from "@/components/pickup-address";
import { MobileLineup } from "@/components/mobile-lineup";
import { CatalogAddonOptions } from "@/components/catalog-addon-options";
import { availabilityReason, availabilityText, manilaDate, quoteSelection } from "@/lib/catalog/rules";
import type { Addon, Catalog, Selection, Variant } from "@/lib/catalog/schema";
import { useOrderSchedule } from "@/hooks/use-order-schedule";
import type { ScheduleSettings } from "@/lib/scheduling/schema";
import { addCalendarDays, availableOrderDates } from "@/lib/scheduling/rules";
import { branchById, branchCatalog, variantAssignment, variantAvailable, visibleBranches, type BranchId, type BranchSettings, type CatalogMode } from "@/lib/branches/schema";
import { cn } from "@/lib/utils";

type FormState = {
  name: string;
  contact: string;
  preferredDate: Date | undefined;
  preferredTime: string;
  quantities: Record<string, number>;
  notes: string;
  selectedAddons: string[];
  addonMessages: Record<string, string>;
  lineAddons: Record<string, string[]>;
  lineMessages: Record<string, Record<string, string>>;
  payment: string;
};

const initialState: FormState = {
  name: "",
  contact: "",
  preferredDate: undefined,
  preferredTime: "",
  quantities: {},
  notes: "",
  selectedAddons: [],
  addonMessages: {}, lineAddons: {}, lineMessages: {},
  payment: "bank",
};

function formatPreferredWhen(date: Date | undefined, time: string) {
  if (!date || !time) return "";
  return `${dayjs(date).format("ddd MMM D")} · ${time}`;
}

function flavorNote(item: MenuItem) {
  return item.note;
}

function QtyStepper({
  value,
  onChange,
  label,
  unavailable = false,
}: {
  unavailable?: boolean;
  value: number;
  onChange: (next: number) => void;
  label: string;
}) {
  return (
    <div className="order-stepper">
      <Button
        type="button"
        variant="ghost"
        className="pressable size-11 rounded-full text-charcoal hover:bg-transparent"
        aria-label={`Decrease ${label}`}
        disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
      >
        <Minus className="size-3.5" />
      </Button>
      <span className="w-7 text-center text-sm font-semibold tabular-nums">
        {value}
      </span>
      <Button
        type="button"
        variant="ghost"
        className="pressable size-11 rounded-full text-charcoal hover:bg-transparent"
        aria-label={`Increase ${label}`}
        disabled={unavailable || value >= 100}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}

function FlavorRow({
  item,
  quantity,
  onQuantityChange,
  reason,
}: {
  reason?: string | null;
  item: MenuItem;
  quantity: number;
  onQuantityChange: (next: number) => void;
}) {
  const selected = quantity > 0;
  const extra = flavorNote(item);

  return (
    <div className={cn("order-flavor", selected ? "is-selected" : "")}>
      <Image src={item.image.src} unoptimized alt="" width={72} height={72} className="order-thumb" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="font-heading text-base font-semibold">{item.name}</p>
          <p className="text-sm font-semibold text-charcoal/70">
            {itemPriceText(item)}
          </p>
        </div>
        {!!item.allergens?.length && <p className="text-xs">Contains: {item.allergens.join(", ")}.</p>}
        {reason && <p className="mt-1 text-xs text-berry">{reason}</p>}
        {extra ? (
          <p className="mt-0.5 text-xs font-medium text-charcoal/55">{extra}</p>
        ) : null}
      </div>
      <QtyStepper
        value={quantity}
        onChange={onQuantityChange}
        unavailable={Boolean(reason)}
        label={item.name}
      />
    </div>
  );
}

type OrderItem = MenuItem & { productId: string; variant: Variant };
export function OrderForm({ items, catalogAddons, branches, initialBranch, schedule, serverNow, openDates = {}, openProducts = {}, intakeEnabled = false, mode = "regular" }: { items: MenuItem[]; catalogAddons: Addon[]; branches: BranchSettings; initialBranch: BranchId; schedule: ScheduleSettings; serverNow: string; openDates?: Record<string, string[]>; openProducts?: Record<string, Record<string, string[]>>; intakeEnabled?: boolean; mode?: CatalogMode }) {
  const scheduleState = useOrderSchedule(schedule, serverNow, openDates, openProducts);
  const router = useRouter();
  const idempotencyKey = useRef("");
  const recoveryToken = useRef("");
  const [recovery, setRecovery] = useState<{ orderNumber: string; priceChanges: { from: string; to: string }[]; unavailableLines: { productId: string; variantId: string; label: string }[] } | null>(null);
  const [dismissedLines, setDismissedLines] = useState<string[]>([]);
  const [branch, setBranch] = useState<BranchId>(initialBranch);
  const shop = branchById(branches, branch);
  const publicBranches = visibleBranches(branches);
  const menuItems: OrderItem[] = items.flatMap((item) => (item.variants ?? []).filter((v) => v.active && variantAssignment(branches, item.slug, v.id, v.minLeadDays).mode === mode && (mode === "preorder" || v.minLeadDays === 0)).map((v) => ({ ...item, productId: item.slug, slug: `${item.slug}:${v.id}`, name: `${item.name} · ${v.label}`, price: v.pricingMode === "fixed" ? v.priceCentavos! / 100 : undefined, priceLabel: "DM for price", variant: v })));
  const availableHere = (item: OrderItem) => variantAvailable(branches, branch, item.productId, item.variant.id, item.variant.minLeadDays, mode);
  const visibleItems = menuItems.filter(availableHere);
  const sweetItems = visibleItems.filter((item) => item.kind === "sweet");
  const savoryItems = visibleItems.filter((item) => item.kind === "savory");
  const [form, setForm] = useState<FormState>(() => ({ ...initialState, quantities: Object.fromEntries(menuItems.map((item) => [item.slug, 0])) }));
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash.startsWith("reorder=")) return;
    const token = decodeURIComponent(hash.slice("reorder=".length));
    let disposed = false;
    void (async () => {
      try {
        const response = await fetch("/api/orders/recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await response.json();
        if (disposed) return;
        if (!response.ok) throw new Error(data.error || "This request can no longer be reordered.");
        const draft = data.draft;
        if (draft.catalogMode !== mode) {
          setError(mode === "preorder" ? "Open the regular order page to reorder these pies." : "Open the pre-order page to reorder these pies.");
          return;
        }
        recoveryToken.current = token;
        setBranch(draft.branchId);
        setRecovery({ orderNumber: draft.orderNumber, priceChanges: draft.review.priceChanges ?? [], unavailableLines: draft.review.unavailableLines ?? [] });
        setForm((current) => ({
          ...current,
          name: draft.name,
          contact: draft.contact,
          notes: draft.notes,
          payment: draft.payment,
          preferredDate: new Date(`${draft.selection.date}T12:00:00`),
          preferredTime: draft.slotId,
          selectedAddons: draft.selection.addons.map((addon: { id: string }) => addon.id),
          addonMessages: Object.fromEntries(draft.selection.addons.map((addon: { id: string; message?: string }) => [addon.id, addon.message ?? ""])),
          quantities: {
            ...current.quantities,
            ...Object.fromEntries(draft.selection.lines.map((line: { productId: string; variantId: string; quantity: number }) => [`${line.productId}:${line.variantId}`, line.quantity])),
          },
          lineAddons: Object.fromEntries(draft.selection.lines.map((line: { productId: string; variantId: string; addons: { id: string }[] }) => [`${line.productId}:${line.variantId}`, line.addons.map((addon) => addon.id)])),
          lineMessages: Object.fromEntries(draft.selection.lines.map((line: { productId: string; variantId: string; addons: { id: string; message?: string }[] }) => [`${line.productId}:${line.variantId}`, Object.fromEntries(line.addons.map((addon) => [addon.id, addon.message ?? ""]))])),
        }));
      } catch (loadError) {
        if (!disposed) setError(loadError instanceof Error ? loadError.message : "This request can no longer be reordered.");
      }
    })();
    return () => { disposed = true; };
  }, [mode]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [checking, setChecking] = useState(false);
  const selectedCount = menuItems.reduce((sum, item) => sum + (form.quantities[item.slug] ?? 0), 0);
  const selectedItems = menuItems.filter(
    (item) => form.quantities[item.slug] > 0,
  );
  const unavailableItems = selectedItems.filter((item) => !availableHere(item));
  const pendingUnavailable = (recovery?.unavailableLines ?? []).filter((line) => !dismissedLines.includes(`${line.productId}:${line.variantId}`));
  function changeBranch(next: BranchId) {
    setBranch(next);
    setError(null);
    const url = new URL(window.location.href); url.searchParams.set("branch", next);
    window.history.replaceState(null, "", url.toString());
  }
  const chosenAddons = catalogAddons.filter((a) => form.selectedAddons.includes(a.id));
  const selectedContent: Omit<Selection, "date"> = { lines: selectedItems.map((item) => ({ productId: item.productId, variantId: item.variant.id, quantity: form.quantities[item.slug], addons: (form.lineAddons[item.slug] ?? []).map((id) => ({ id, message: form.lineMessages[item.slug]?.[id] ?? "" })) })), addons: form.selectedAddons.map((id) => ({ id, message: form.addonMessages[id] ?? "" })) };
  const clientCatalog: Catalog = { initialized: true, addons: catalogAddons, products: items.map((p) => ({ id: p.slug, slug: p.slug, name: p.name, blurb: p.blurb, description: p.description, category: p.kind, image: { url: p.image.src, alt: p.image.alt }, allergens: p.allergens ?? [], publicNotes: p.note ?? "", active: true, sortOrder: 0, version: 1, updatedAt: null, legacyPriceCentavos: null, variants: p.variants ?? [], availableWeekdays: p.availableWeekdays ?? [], unavailableDates: p.unavailableDates ?? [], allowedAddonIds: p.allowedAddonIds ?? [] })) };
  const modeCatalog = branchCatalog(clientCatalog, branches, branch, mode);
  const scheduledDates = availableOrderDates(scheduleState.settings, branch, modeCatalog, selectedContent, scheduleState.now);
  const chosenFlavorIds = [...new Set(selectedItems.map((item) => item.productId))];
  const modeFlavorIds = new Set(modeCatalog.products.map((product) => product.id));
  const availableDates = intakeEnabled ? scheduledDates.filter((date) => {
    const open = new Set(scheduleState.openProducts[branch]?.[date.date] ?? []);
    return chosenFlavorIds.length === 0 ? [...modeFlavorIds].some((id) => open.has(id)) : chosenFlavorIds.every((id) => open.has(id));
  }) : scheduledDates;
  const selectedDate = form.preferredDate ? dayjs(form.preferredDate).format("YYYY-MM-DD") : availableDates[0]?.date ?? "";
  const dateValue = selectedDate ? new Date(`${selectedDate}T12:00:00`) : undefined;
  const slots = availableDates.find((d) => d.date === selectedDate)?.slots ?? [];
  const selectedSlot = slots.find((slot) => slot.id === form.preferredTime);
  const dateInvalid = Boolean(selectedDate && !availableDates.some((d) => d.date === selectedDate));
  const selection: Selection = { ...selectedContent, date: selectedDate };
  const quote = quoteSelection(clientCatalog, { ...selection, date: selectedDate || manilaDate(scheduleState.now) }, manilaDate(scheduleState.now));
  const subtotal = quote.knownSubtotalCentavos / 100;
  const hasUnpriced = quote.quoteRequired;
  const today = new Date(`${manilaDate(scheduleState.now)}T12:00:00`);
  const lastDate = new Date(`${addCalendarDays(manilaDate(scheduleState.now), scheduleState.settings.bookingHorizonDays)}T12:00:00`);
  function row(item: OrderItem) {
    const quantity = form.quantities[item.slug] ?? 0;
    const product = clientCatalog.products.find((p) => p.id === item.productId)!;
    const reason = !availableHere(item) ? `Not available at ${shop.name}. Remove this item or switch back.` : form.preferredDate && selectedDate ? availabilityReason(product, item.variant, selectedDate, 0, manilaDate(scheduleState.now)) : null;
    const extras = catalogAddons.filter((a) => a.scope === "per_item" && (product.allowedAddonIds.includes(a.id) || form.lineAddons[item.slug]?.includes(a.id)));
    return <div key={item.slug} className="space-y-2"><FlavorRow item={item} quantity={quantity} onQuantityChange={(n) => setQuantity(item.slug, n)} reason={reason} /><p className="px-3 text-xs text-charcoal/65">{availabilityText(product)}{item.variant.minLeadDays > 0 ? ` · ${item.variant.minLeadDays} ${item.variant.minLeadDays === 1 ? "day" : "days"} of preparation` : mode === "preorder" ? " · No extra preparation days." : ""}</p>{quantity > 0 && extras.length > 0 && <div className="ml-3 border-l border-charcoal/15 pl-3"><p className="mb-2 text-xs font-semibold">Extras for {item.name}</p><CatalogAddonOptions addons={extras} quantity={quantity} prefix={item.slug} selected={form.lineAddons[item.slug] ?? []} messages={form.lineMessages[item.slug] ?? {}} toggle={(id) => { const current = form.lineAddons[item.slug] ?? []; update("lineAddons", { ...form.lineAddons, [item.slug]: current.includes(id) ? current.filter((x) => x !== id) : [...current, id] }); }} message={(id, value) => update("lineMessages", { ...form.lineMessages, [item.slug]: { ...form.lineMessages[item.slug], [id]: value } })} /></div>}</div>;
  }
  const dateLabel = dateValue
    ? dayjs(dateValue).format("ddd, MMM D")
    : "Pick a date";
  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function setQuantity(slug: string, next: number) {
    setForm((current) => ({
      ...current,
      quantities: { ...current.quantities, [slug]: next },
    }));
    setError(null);
  }

  function toggleAddon(id: string) {
    setForm((current) => {
      const selected = current.selectedAddons.includes(id)
        ? current.selectedAddons.filter((item) => item !== id)
        : [...current.selectedAddons, id];
      return { ...current, selectedAddons: selected };
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (checking) return;

    if (unavailableItems.length || pendingUnavailable.length) { setError("Remove unavailable items or switch branches before continuing."); return; }

    if (!form.name.trim() || !form.contact.trim()) {
      setError("Please fill in your name and contact number.");
      return;
    }

    if (!selectedDate || !selectedSlot || scheduleState.error) {
      setError("Please pick a preferred date and time.");
      return;
    }

    if (selectedCount < 1) {
      setError("Please add at least one flavor.");
      return;
    }

    setChecking(true);
    try {
      if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKey.current,
          branchId: branch,
          slotId: selectedSlot.id,
          name: form.name.trim(),
          contact: form.contact.trim(),
          notes: form.notes.trim(),
          delivery: "pickup",
          payment: form.payment,
          catalogMode: mode,
          ...(recoveryToken.current ? { recoveryToken: recoveryToken.current } : {}),
          selection,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.schedule && result.serverNow) scheduleState.acceptFreshSettings(result.schedule, result.serverNow, result.openDates, result.openProducts);
        throw new Error(result.error || "Could not place your request.");
      }
      sessionStorage.setItem("makalipie-request-token", result.token);
      router.push(`/order/status#${result.token}`);
    } catch(e) {
      setError(e instanceof Error ? e.message : "Could not place your request. Please retry.");
      setChecking(false);
    }
  }

  return (
    <div className="order-page wrap">
      <header className="order-intro">
        <div>
          <p className="eyebrow">A LITTLE HAPPINESS, COMING YOUR WAY</p>
          <h1>
            Let’s put together
            <br />
            your <span>box of happy.</span>
          </h1>
          <p>
            Choose your pies and tell us the details.
            <br />
            We’ll take it from there, together on Instagram.
          </p>
        </div>
        <Image
          src="/brand/seal.png"
          alt="Makalipie Tarts & Pies"
          width={145}
          height={145}
        />
      </header>
      <section className="mb-6 max-w-xl space-y-2" aria-label="Main branch">
        {publicBranches.length > 1 ? (
          <>
            <Label htmlFor="order-branch">Ordering from</Label>
            <NativeSelect
              id="order-branch"
              className="h-12 rounded-xl border-charcoal/20 bg-cream text-base"
              disabled={checking}
              value={branch}
              onChange={(e) => changeBranch(e.target.value as BranchId)}
            >
              {publicBranches.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </NativeSelect>
            <p className="text-sm text-charcoal/65">{mode === "preorder" ? "Pre-order pies available from your selected main branch." : "Regular pies available from your selected main branch."} <Link href={mode === "preorder" ? "/order" : "/order/preorder"} className="underline">{mode === "preorder" ? "Order pies without extra preparation." : "Order pies that need preparation."}</Link></p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">Ordering from</p>
            <p className="text-base">{shop.name}</p>
            <p className="text-sm text-charcoal/65">{mode === "preorder" ? "Pre-order pies available from this main branch." : "Regular pies available from this main branch."} <Link href={mode === "preorder" ? "/order" : "/order/preorder"} className="underline">{mode === "preorder" ? "Order pies without extra preparation." : "Order pies that need preparation."}</Link></p>
          </>
        )}
      </section>
      {recovery ? (
        <section className="mb-6 max-w-xl space-y-2" aria-label={`Reorder ${recovery.orderNumber}`}>
          <p className="text-sm font-medium">Reordering {recovery.orderNumber}</p>
          {recovery.priceChanges.map((change) => <p key={change.from} className="text-sm text-charcoal/70">{change.from} is now {change.to}</p>)}
          {pendingUnavailable.map((line) => (
            <div key={`${line.productId}:${line.variantId}`} className="flex flex-wrap items-center gap-2">
              <p className="text-sm">{line.label} is no longer on the menu.</p>
              <Button type="button" variant="link" className="h-11 px-0" onClick={() => setDismissedLines((current) => [...current, `${line.productId}:${line.variantId}`])}>Remove</Button>
            </div>
          ))}
        </section>
      ) : null}
      <div className="order-layout">
        <div>
          <form id="pie-order" onSubmit={handleSubmit} className="order-form">
            <fieldset disabled={checking} className="contents">
              <legend className="sr-only">Your order</legend>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Pick your pies</legend>
              <p className="text-xs text-charcoal/55">
                A few for you, a few to share. Use + to add your favourites.
              </p>
              {visibleItems.length === 0 && (
                <Alert role="status" className="border-transparent bg-butter/60 text-charcoal">
                  <AlertDescription className="text-charcoal">
                    No {mode === "preorder" ? "pre-order" : "regular"} pies are currently available at {shop.name}. {publicBranches.length > 1 ? "Choose another main branch or contact us." : "Contact us."}
                  </AlertDescription>
                </Alert>
              )}
              {unavailableItems.length > 0 && (
                <section aria-label="Unavailable cart items" className="space-y-3">
                  <Alert className="border-berry/40 bg-transparent text-berry">
                    <AlertDescription className="text-berry">
                      Some selected items are unavailable at this branch. Matching items remain in your order.
                    </AlertDescription>
                  </Alert>
                  {unavailableItems.map((item) => (
                    <div key={item.slug}>
                      {row(item)}
                      <Button type="button" variant="link" className="h-11 px-3 text-charcoal" onClick={() => setQuantity(item.slug, 0)}>
                        Remove {item.name}
                      </Button>
                    </div>
                  ))}
                </section>
              )}
              <div className="space-y-2">
                {sweetItems.map(row)}
              </div>
              {savoryItems.length > 0 && <p className="pt-2 text-xs font-semibold tracking-wide text-charcoal/50 uppercase">Savoury</p>}
              <div className="space-y-2">
                {savoryItems.map(row)}
              </div>
              {!!selectedDate && quote.errors.length > 0 && (
                <Alert role="status" className="border-berry/40 bg-transparent text-berry">
                  <AlertDescription className="text-berry">{quote.errors.join(" ")}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2 pt-1">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  value={form.notes}
                  onChange={(event) => update("notes", event.target.value)}
                  className="min-h-0 rounded-xl bg-cream"
                  placeholder="Allergies, packing notes, or anything else"
                />
              </div>
            </fieldset>

            <fieldset className="order-details-fields space-y-5">
              <legend>Your details & timing</legend>
              <p className="order-section-help">
                Let us know who it’s for and when you’d like it.
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    name="name"
                    required
                    value={form.name}
                    onChange={(event) => update("name", event.target.value)}
                    className="h-11 rounded-xl bg-cream px-3"
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact">Contact Number</Label>
                  <Input
                    id="contact"
                    type="tel"
                    name="contact"
                    required
                    value={form.contact}
                    onChange={(event) => update("contact", event.target.value)}
                    className="h-11 rounded-xl bg-cream px-3"
                    autoComplete="tel"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm text-charcoal/65">Choose up to {scheduleState.settings.bookingHorizonDays} days ahead. All times are in Manila time.</p>
                {quote.preparationDays > 0 ? <p className="text-sm text-charcoal/65">This box needs {quote.preparationDays} {quote.preparationDays === 1 ? "day" : "days"} of preparation. Earlier dates stay closed.</p> : null}
                {scheduleState.error && (
                  <Alert className="border-berry/40 bg-transparent text-berry">
                    <AlertDescription className="text-berry">{scheduleState.error}</AlertDescription>
                  </Alert>
                )}
                <Button type="button" variant="link" className="h-11 px-0 text-charcoal" onClick={scheduleState.refresh}>
                  Refresh available dates
                </Button>
                {!availableDates.length && (
                  <Alert role="status" className="border-transparent bg-butter/60 text-charcoal">
                    <AlertDescription className="text-charcoal">
                      {intakeEnabled
                        ? "No online dates are currently available. Your items are still here."
                        : "No online dates are currently available for this branch and selection. Your items are still here; try another branch or adjust your selection."}
                    </AlertDescription>
                  </Alert>
                )}
                {availableDates.length > 0 && !availableDates.some((d) => d.date === manilaDate(scheduleState.now)) && (
                  <Alert role="status" className="border-transparent bg-transparent text-charcoal">
                    <AlertDescription className="text-charcoal">
                      Today is unavailable for this selection. Earliest available: {dayjs(`${availableDates[0].date}T12:00:00`).format("ddd, MMM D")}.
                    </AlertDescription>
                  </Alert>
                )}
                {dateInvalid && (
                  <Alert className="border-berry/40 bg-transparent text-berry">
                    <AlertDescription className="text-berry">
                      Your selected date is no longer available. Please choose another date; your items have been kept.
                    </AlertDescription>
                  </Alert>
                )}
                <Label htmlFor="preferred-date">Preferred date</Label>
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger
                    id="preferred-date"
                    type="button"
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "h-11 w-full justify-start rounded-xl border-charcoal/15 bg-cream px-3 text-base font-medium md:text-sm",
                    )}
                  >
                    <CalendarDays className="size-4 text-charcoal/60" />
                    <span
                      className={
                        dateValue
                          ? "text-charcoal"
                          : "text-charcoal/45"
                      }
                    >
                      {dateLabel}
                    </span>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-auto overflow-hidden rounded-2xl p-2"
                  >
                    <Calendar
                      mode="single"
                      selected={dateValue}
                      onSelect={(date) => {
                        setForm((current) => ({ ...current, preferredDate: date, preferredTime: "" }));
                        setError(null);
                        if (date) setCalendarOpen(false);
                      }}
                      disabled={(date) => !availableDates.some((d) => d.date === dayjs(date).format("YYYY-MM-DD"))}
                      startMonth={today}
                      endMonth={lastDate}
                      defaultMonth={dateValue ?? today}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium" id="time-slots-label">Preferred time slot</p>
                {form.preferredTime && !selectedSlot && (
                  <Alert className="border-berry/40 bg-transparent text-berry">
                    <AlertDescription className="text-berry">Your selected time is no longer available. Please choose a new slot.</AlertDescription>
                  </Alert>
                )}
                {!slots.length && <p className="text-sm text-charcoal/65">Choose an available date to see one-hour slots.</p>}
                <div className="flex flex-wrap gap-2" role="group" aria-labelledby="time-slots-label">
                  {slots.map((slot) => {
                    const active = form.preferredTime === slot.id;
                    return (
                      <Button
                        key={slot.id}
                        type="button"
                        variant="outline"
                        onClick={() => { setForm((current) => ({ ...current, preferredDate: dateValue, preferredTime: slot.id })); setError(null); }}
                        className={cn(
                          "pressable h-11 rounded-full px-3.5 font-semibold ring-1",
                          active
                            ? "border-charcoal bg-charcoal text-white ring-charcoal hover:bg-charcoal hover:text-white"
                            : "border-transparent bg-cream text-charcoal/80 ring-charcoal/10 hover:bg-butter",
                        )}
                        aria-pressed={active}
                      >
                        {slot.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">
                Make it a little personal
              </legend>
              <p className="text-xs text-charcoal/60">Choose a pie to see compatible extras for the whole order.</p>
              <CatalogAddonOptions addons={catalogAddons.filter((a) => a.scope === "per_order" && (selectedItems.some((item) => item.allowedAddonIds?.includes(a.id)) || form.selectedAddons.includes(a.id)))} selected={form.selectedAddons} messages={form.addonMessages} prefix="order-extra" toggle={toggleAddon} message={(id, value) => update("addonMessages", { ...form.addonMessages, [id]: value })} />
            </fieldset>

            <PickupAddress name={shop.name} address={shop.address} />

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">
                Your payment preference
              </legend>
              <p className="text-xs text-charcoal/55">
                Choose how you&apos;d like to pay after we confirm and send an
                invoice. Payment must be verified before preparation. No payment yet.
              </p>
              <RadioGroup
                name="payment"
                value={form.payment}
                disabled={checking}
                onValueChange={(value) => update("payment", value)}
                className="gap-3"
              >
                {paymentMethods.filter((method) => method.id !== "cash").map((method) => (
                  <Label
                    key={method.id}
                    className="pressable h-auto cursor-pointer gap-3 rounded-xl bg-butter/60 px-4 py-3 font-normal"
                  >
                    <RadioGroupItem value={method.id} />
                    <span className="text-sm font-semibold">{method.label}</span>
                  </Label>
                ))}
              </RadioGroup>
            </fieldset>

            {error ? (
              <Alert className="border-berry/40 bg-transparent text-berry">
                <AlertDescription className="font-medium text-berry">{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="submit"
              disabled={checking || unavailableItems.length > 0 || pendingUnavailable.length > 0 || visibleItems.length === 0 || !selectedSlot || dateInvalid || Boolean(scheduleState.error)}
              className="order-submit brand-button"
            >
              {checking ? "Placing your order…" : "Place order"}{" "}
              <ArrowUpRight size={18} aria-hidden />
            </Button>
            <p className="order-submit-note">
              Placing this request reserves the pies and opens your order page. Staff still need to confirm it. No payment is taken here.{" "}
              <Link href="/terms">Terms</Link>, <Link href="/privacy">Privacy</Link>, and{" "}
              <Link href="/refund">Refund policy</Link>.
            </p>
            </fieldset>
          </form>
        </div>

        <aside className="order-summary" aria-label="Your order summary">
          <div className="order-summary-heading">
            <p className="eyebrow">A BOX TO LOOK FORWARD TO</p>
            <h2>Your little lineup.</h2>
            <p>
              {selectedCount === 0
                ? "Your favourites will appear here."
                : `${selectedCount} ${selectedCount === 1 ? "pie" : "pies"} picked. Good choices.`}
            </p>
          </div>
          {selectedCount === 0 ? (
            <div className="order-empty">
              <Image
                src="/images/brand/gift.webp"
                alt="An assortment of Makalipie tarts in a gift box"
                width={700}
                height={500}
              />
              <p>
                A tart for Tuesday.
                <br />A box for the whole table.
              </p>
            </div>
          ) : (
            <ul className="order-summary-lines">
              {selectedItems.map((item) => (
                <li key={item.slug}>
                  <span>
                    {form.quantities[item.slug]} × {item.name}
                  </span>
                  <span>
                    {item.price == null
                      ? "To confirm"
                      : formatPrice(item.price * form.quantities[item.slug])}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {selection.lines.some((line) => line.addons.length) && <p className="order-total-note">Selected per-pie extras are included in the known subtotal.</p>}
          {chosenAddons.length > 0 && (
            <ul className="order-summary-lines order-summary-addons">
              {chosenAddons.map((addon) => (
                <li key={addon.id}>
                  <span>{addon.name}</span>
                  <span>{formatPrice(addon.priceCentavos / 100)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="order-subtotal">
            <span>Known subtotal</span>
            <strong>{formatPrice(subtotal)}</strong>
          </div>
          <p className="order-total-note">
            {hasUnpriced
              ? "Quoted sizes will be priced after confirmation. "
              : ""}
            Staff confirm the final total on your order page.
          </p>
          <div className="order-summary-logistics">
            <span>
              {`Pickup at ${shop.name}${shop.address ? ` · ${shop.address}` : ""}`}
            </span>
            <span>
              {formatPreferredWhen(dateValue, selectedSlot?.label ?? "") ||
                "Choose your preferred date and time."}
            </span>
          </div>
          <div className="order-next">
            <p className="eyebrow">WHAT HAPPENS NEXT</p>
            <p>
              Place the order to open your order page. Copy the order number there when you want to continue on Instagram.
            </p>
            <a href={site.instagramDmUrl} target="_blank" rel="noreferrer">
              Have a question? Talk to us <ArrowUpRight size={15} aria-hidden />
            </a>
          </div>
          <Link href="/menu" className="order-back-menu">
            Take another look at the menu <ArrowUpRight size={15} aria-hidden />
          </Link>
        </aside>
      </div>
      <MobileLineup count={selectedCount} subtotal={subtotal} hasUnpriced={hasUnpriced}>
        <ul className="mobile-lineup-items">
          {selectedItems.map((item) => {
            const quantity = form.quantities[item.slug];
            const product = clientCatalog.products.find((p) => p.id === item.productId)!;
            const reason = !availableHere(item) ? `Not available at ${shop.name}. Remove this item or switch back.` : form.preferredDate && selectedDate ? availabilityReason(product, item.variant, selectedDate, 0, manilaDate(scheduleState.now)) : null;
            const extras = catalogAddons.filter((addon) => form.lineAddons[item.slug]?.includes(addon.id));
            return <li key={item.slug}>
              <div className="mobile-lineup-item">
                <Image src={item.image.src} alt="" width={56} height={56} unoptimized />
                <div><strong>{item.name}</strong><p>{quantity} {quantity === 1 ? "pc" : "pcs"}{item.price == null ? " · Price to confirm" : ` · ${formatPrice(item.price)} each`}</p></div>
                <strong>{item.price == null ? "To confirm" : formatPrice(item.price * quantity)}</strong>
              </div>
              {reason ? <p className="mobile-lineup-warning">{reason}</p> : null}
              {extras.map((addon) => <p className="mobile-lineup-extra" key={addon.id}>{addon.name}{form.lineMessages[item.slug]?.[addon.id] ? `: ${form.lineMessages[item.slug][addon.id]}` : ""} · {formatPrice(addon.priceCentavos * quantity / 100)}</p>)}
              <div className="mobile-lineup-controls"><QtyStepper label={item.name} value={quantity} onChange={(next) => setQuantity(item.slug, next)} unavailable={Boolean(reason)} /><Button type="button" variant="ghost" className="h-11" onClick={() => setQuantity(item.slug, 0)} aria-label={`Remove ${item.name}`}>Remove</Button></div>
            </li>;
          })}
        </ul>
        {chosenAddons.length ? <section className="mobile-lineup-extras"><h3>Order extras</h3>{chosenAddons.map((addon) => <p key={addon.id}><span>{addon.name}{form.addonMessages[addon.id] ? `: ${form.addonMessages[addon.id]}` : ""}</span><strong>{formatPrice(addon.priceCentavos / 100)}</strong></p>)}</section> : null}
        <p className="mobile-lineup-note">{hasUnpriced ? "Some prices are to confirm. " : ""}Priced extras are included in the subtotal. Staff confirm the final total on your order page.</p>
        <section className="mobile-lineup-logistics"><h3>Your schedule</h3><p>{`Pickup at ${shop.name}`}</p><p>{formatPreferredWhen(dateValue, selectedSlot?.label ?? "") || "Choose your date and time in the form."}</p>{dateInvalid ? <p className="mobile-lineup-warning">Choose an available date in the form.</p> : null}</section>
      </MobileLineup>
    </div>
  );
}
