"use client";

import { ArrowUpRight, CalendarDays, Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import Image from "next/image";
import Link from "next/link";
import { Calendar } from "@/components/ui/calendar";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { dayjs } from "@/lib/dayjs";
import {
  deliveryOptions,
  formatPrice,
  getOrderSummarySource,
  itemPriceText,
  paymentMethods,
  pickupTimes,
  site,
  type MenuItem,
} from "@/lib/site";
import { CatalogAddonOptions } from "@/components/catalog-addon-options";
import { availabilityReason, availabilityText, manilaDate, quoteSelection } from "@/lib/catalog/rules";
import type { Addon, Catalog, Selection, Variant } from "@/lib/catalog/schema";
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
  delivery: string;
  address: string;
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
  delivery: "pickup",
  address: "",
  payment: "bank",
};

function formatPreferredWhen(date: Date | undefined, time: string) {
  if (!date || !time) return "";
  return `${dayjs(date).format("ddd MMM D")} · ${time}`;
}

function flavorNote(item: MenuItem) {
  return item.note;
}

function buildOrderSummary(form: FormState, quote: ReturnType<typeof quoteSelection>) {
  const addonLines = quote.addonLines;
  const delivery = deliveryOptions.find(
    (option) => option.id === form.delivery,
  );
  const payment = paymentMethods.find((method) => method.id === form.payment);
  const flavorLines = quote.lines;

  const lines = [
    "Makalipie Order Form",
    "--------------------",
    `Name: ${form.name.trim()}`,
    `Contact Number: ${form.contact.trim()}`,
    `Preferred Date & Time: ${formatPreferredWhen(form.preferredDate, form.preferredTime)}`,
    "",
    "Order Details:",
    flavorLines.length > 0 ? flavorLines.join("\n") : "- None selected",
    form.notes.trim() ? `\nNotes:\n${form.notes.trim()}` : null,
    "",
    "Add-Ons:",
    addonLines.length > 0 ? addonLines.join("\n") : "- None",
    "",
    `Delivery: ${delivery?.label ?? form.delivery}${
      delivery?.detail ? ` (${delivery.detail})` : ""
    }`,
    form.delivery === "lalamove" && form.address.trim()
      ? `Address: ${form.address.trim()}`
      : null,
    `Mode of Payment: ${payment?.label ?? form.payment}`,
    "",
    `Known subtotal: ₱${(quote.knownSubtotalCentavos / 100).toLocaleString("en-PH")}${quote.quoteRequired ? " · quoted items still to confirm" : ""}`,
    "Sent via " + getOrderSummarySource(),
  ];

  return lines.filter((line) => line !== null).join("\n");
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
      <button
        type="button"
        className="pressable inline-flex size-11 items-center justify-center rounded-full text-charcoal disabled:opacity-30"
        aria-label={`Decrease ${label}`}
        disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
      >
        <Minus className="size-3.5" />
      </button>
      <span className="w-7 text-center text-sm font-semibold tabular-nums">
        {value}
      </span>
      <button
        type="button"
        className="pressable inline-flex size-11 items-center justify-center rounded-full text-charcoal"
        aria-label={`Increase ${label}`}
        disabled={unavailable || value >= 100}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="size-3.5" />
      </button>
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
export function OrderForm({ items, catalogAddons }: { items: MenuItem[]; catalogAddons: Addon[] }) {
  const menuItems: OrderItem[] = items.flatMap((item) => (item.variants ?? []).filter((v) => v.active).map((v) => ({ ...item, productId: item.slug, slug: `${item.slug}:${v.id}`, name: `${item.name} · ${v.label}`, price: v.pricingMode === "fixed" ? v.priceCentavos! / 100 : undefined, priceLabel: "DM for price", variant: v })));
  const sweetItems = menuItems.filter((item) => item.kind === "sweet");
  const savoryItems = menuItems.filter((item) => item.kind === "savory");
  const [form, setForm] = useState<FormState>(() => ({ ...initialState, quantities: Object.fromEntries(menuItems.map((item) => [item.slug, 0])) }));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "copied" | "fallback">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fallbackSummary, setFallbackSummary] = useState("");

  const needsAddress = form.delivery === "lalamove";
  const [checking, setChecking] = useState(false);
  const selectedCount = menuItems.reduce((sum, item) => sum + (form.quantities[item.slug] ?? 0), 0);
  const selectedItems = menuItems.filter(
    (item) => form.quantities[item.slug] > 0,
  );
  const chosenAddons = catalogAddons.filter((a) => form.selectedAddons.includes(a.id));
  const selectedDate = form.preferredDate ? dayjs(form.preferredDate).format("YYYY-MM-DD") : "";
  const selection: Selection = { date: selectedDate, lines: selectedItems.map((item) => ({ productId: item.productId, variantId: item.variant.id, quantity: form.quantities[item.slug], addons: (form.lineAddons[item.slug] ?? []).map((id) => ({ id, message: form.lineMessages[item.slug]?.[id] ?? "" })) })), addons: form.selectedAddons.map((id) => ({ id, message: form.addonMessages[id] ?? "" })) };
  const clientCatalog: Catalog = { initialized: true, addons: catalogAddons, products: items.map((p) => ({ id: p.slug, slug: p.slug, name: p.name, blurb: p.blurb, description: p.description, category: p.kind, image: { url: p.image.src, alt: p.image.alt }, allergens: p.allergens ?? [], publicNotes: p.note ?? "", active: true, sortOrder: 0, version: 1, updatedAt: null, legacyPriceCentavos: null, variants: p.variants ?? [], availableWeekdays: p.availableWeekdays ?? [], unavailableDates: p.unavailableDates ?? [], allowedAddonIds: p.allowedAddonIds ?? [] })) };
  const quote = quoteSelection(clientCatalog, { ...selection, date: selectedDate || manilaDate() });
  const subtotal = quote.knownSubtotalCentavos / 100;
  const hasUnpriced = quote.quoteRequired;
  const today = useMemo(() => new Date(`${manilaDate()}T00:00:00`), []);
  function row(item: OrderItem) {
    const quantity = form.quantities[item.slug] ?? 0;
    const product = clientCatalog.products.find((p) => p.id === item.productId)!;
    const reason = selectedDate ? availabilityReason(product, item.variant, selectedDate) : null;
    const extras = catalogAddons.filter((a) => a.scope === "per_item" && (product.allowedAddonIds.includes(a.id) || form.lineAddons[item.slug]?.includes(a.id)));
    return <div key={item.slug} className="space-y-2"><FlavorRow item={item} quantity={quantity} onQuantityChange={(n) => setQuantity(item.slug, n)} reason={reason} /><p className="px-3 text-xs text-charcoal/65">{availabilityText(product)}{item.variant.minLeadDays > 0 ? ` · ${item.variant.minLeadDays} days preparation` : ""}</p>{quantity > 0 && extras.length > 0 && <div className="ml-3 border-l border-charcoal/15 pl-3"><p className="mb-2 text-xs font-semibold">Extras for {item.name}</p><CatalogAddonOptions addons={extras} quantity={quantity} prefix={item.slug} selected={form.lineAddons[item.slug] ?? []} messages={form.lineMessages[item.slug] ?? {}} toggle={(id) => { const current = form.lineAddons[item.slug] ?? []; update("lineAddons", { ...form.lineAddons, [item.slug]: current.includes(id) ? current.filter((x) => x !== id) : [...current, id] }); }} message={(id, value) => update("lineMessages", { ...form.lineMessages, [item.slug]: { ...form.lineMessages[item.slug], [id]: value } })} /></div>}</div>;
  }
  const dateLabel = form.preferredDate
    ? dayjs(form.preferredDate).format("ddd, MMM D")
    : "Pick a date";
  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setStatus("idle");
    setError(null);
  }

  function setQuantity(slug: string, next: number) {
    setForm((current) => ({
      ...current,
      quantities: { ...current.quantities, [slug]: next },
    }));
    setStatus("idle");
    setError(null);
  }

  function toggleAddon(id: string) {
    setForm((current) => {
      const selected = current.selectedAddons.includes(id)
        ? current.selectedAddons.filter((item) => item !== id)
        : [...current.selectedAddons, id];
      return { ...current, selectedAddons: selected };
    });
    setStatus("idle");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (checking) return;

    if (!form.name.trim() || !form.contact.trim()) {
      setError("Please fill in your name and contact number.");
      return;
    }

    if (!form.preferredDate || !form.preferredTime) {
      setError("Please pick a preferred date and time.");
      return;
    }

    if (selectedCount < 1) {
      setError("Please add at least one flavor.");
      return;
    }

    if (needsAddress && !form.address.trim()) {
      setError("Please add a delivery address for Lalamove.");
      return;
    }

    let summary: string;
    setChecking(true);
    try {
      const response = await fetch("/api/catalog/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(selection) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Please check your selections.");
      summary = buildOrderSummary(form, result);
    } catch(e) { setError(e instanceof Error ? e.message : "Could not check the current menu. Please retry."); setChecking(false); return; }
    setChecking(false);

    try {
      await navigator.clipboard.writeText(summary);
      setStatus("copied");
      setFallbackSummary("");
      window.open(site.instagramDmUrl, "_blank", "noopener,noreferrer");
    } catch {
      setFallbackSummary(summary);
      setStatus("fallback");
      window.open(site.instagramDmUrl, "_blank", "noopener,noreferrer");
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
              <div className="space-y-2">
                {sweetItems.map(row)}
              </div>
              <p className="pt-2 text-xs font-semibold tracking-wide text-charcoal/50 uppercase">
                Savoury
              </p>
              <div className="space-y-2">
                {savoryItems.map(row)}
              </div>
              {!!selectedDate && quote.errors.length > 0 && <p role="status" className="text-sm text-berry">{quote.errors.join(" ")}</p>}
              <div className="space-y-2 pt-1">
                <Label htmlFor="notes">Notes (optional)</Label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  value={form.notes}
                  onChange={(event) => update("notes", event.target.value)}
                  className="w-full rounded-xl border border-input bg-cream px-3 py-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
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
                        form.preferredDate
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
                      selected={form.preferredDate}
                      onSelect={(date) => {
                        update("preferredDate", date);
                        if (date) setCalendarOpen(false);
                      }}
                      disabled={{ before: today }}
                      defaultMonth={form.preferredDate ?? today}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-3">
                <Label>Preferred time</Label>
                <div className="flex flex-wrap gap-2">
                  {pickupTimes.map((time) => {
                    const active = form.preferredTime === time;
                    return (
                      <button
                        key={time}
                        type="button"
                        onClick={() => update("preferredTime", time)}
                        className={cn(
                          "pressable rounded-full px-3.5 py-2 text-sm font-semibold ring-1 transition-colors duration-150 ease-[var(--ease-out)]",
                          active
                            ? "bg-charcoal text-white ring-charcoal"
                            : "bg-cream text-charcoal/80 ring-charcoal/10 hover:bg-butter",
                        )}
                        aria-pressed={active}
                      >
                        {time}
                      </button>
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

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">
                How shall we get it to you?
              </legend>
              {deliveryOptions.map((option) => (
                <label
                  key={option.id}
                  className="pressable flex cursor-pointer items-start gap-3 rounded-xl bg-butter/60 px-4 py-3"
                >
                  <input
                    type="radio"
                    name="delivery"
                    value={option.id}
                    checked={form.delivery === option.id}
                    onChange={() => update("delivery", option.id)}
                    className="mt-1 size-4 accent-crust"
                  />
                  <span className="text-sm">
                    <span className="font-semibold">{option.label}</span>
                    <span className="mt-0.5 block text-charcoal/60">
                      {option.detail}
                    </span>
                  </span>
                </label>
              ))}
              {needsAddress ? (
                <div className="space-y-2 pl-1">
                  <Label htmlFor="address">Delivery Address</Label>
                  <textarea
                    id="address"
                    name="address"
                    rows={3}
                    value={form.address}
                    onChange={(event) => update("address", event.target.value)}
                    className="w-full rounded-xl border border-input bg-cream px-3 py-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                    placeholder="Full address for Lalamove"
                  />
                </div>
              ) : null}
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">
                Your payment preference
              </legend>
              <p className="text-xs text-charcoal/55">
                Choose how you&apos;d like to pay after we confirm and send an
                invoice. No payment yet.
              </p>
              {paymentMethods.map((method) => (
                <label
                  key={method.id}
                  className="pressable flex cursor-pointer items-center gap-3 rounded-xl bg-butter/60 px-4 py-3"
                >
                  <input
                    type="radio"
                    name="payment"
                    value={method.id}
                    checked={form.payment === method.id}
                    onChange={() => update("payment", method.id)}
                    className="size-4 accent-crust"
                  />
                  <span className="text-sm font-semibold">{method.label}</span>
                </label>
              ))}
            </fieldset>

            {error ? (
              <p className="text-sm font-medium text-berry" role="alert">
                {error}
              </p>
            ) : null}

            {status === "copied" ? (
              <p className="text-sm font-medium text-charcoal" role="status">
                Order copied. Paste it into the Instagram DM that just opened.
              </p>
            ) : null}

            {status === "fallback" ? (
              <div className="space-y-2" role="status">
                <p className="text-sm font-medium text-charcoal">
                  Couldn&apos;t copy automatically. Select and copy the summary
                  below, then paste into Instagram.
                </p>
                <textarea
                  readOnly
                  value={fallbackSummary}
                  rows={12}
                  className="w-full rounded-xl border border-charcoal/15 bg-cream px-3 py-2.5 font-mono text-xs"
                  onFocus={(event) => event.currentTarget.select()}
                />
              </div>
            ) : null}

            <button
              type="submit"
              disabled={checking}
              className={cn(
                buttonVariants({ variant: "default" }),
                "order-submit brand-button",
              )}
            >
              {checking ? "Checking the latest menu…" : "Copy order & open Instagram"}{" "}
              <ArrowUpRight size={18} aria-hidden />
            </button>
            <p className="order-submit-note">
              Your order is placed once we confirm it in our conversation. No
              payment is taken here.
            </p>
            </fieldset>
          </form>
        </div>

        <aside className="order-summary" aria-label="Your order summary">
          <div className="order-summary-heading">
            <p className="eyebrow">A BOX TO LOOK FORWARD TO</p>
            <h2>Your little lineup.</h2>
            <p aria-live="polite">
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
            {needsAddress ? "Delivery fee is not included. " : ""}We’ll confirm
            the final total in Instagram.
          </p>
          <div className="order-summary-logistics">
            <span>
              {needsAddress
                ? "Lalamove delivery"
                : "Pickup at Streetscape, Banilad"}
            </span>
            <span>
              {formatPreferredWhen(form.preferredDate, form.preferredTime) ||
                "Choose your preferred date and time."}
            </span>
          </div>
          <div className="order-next">
            <p className="eyebrow">WHAT HAPPENS NEXT</p>
            <p>
              Copy your order and paste it into our Instagram conversation.
              We’ll confirm your pies and send payment details.
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
    </div>
  );
}
