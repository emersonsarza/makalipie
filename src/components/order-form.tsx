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
  addons,
  deliveryOptions,
  formatPrice,
  getOrderSummarySource,
  itemPriceText,
  menuItems,
  paymentMethods,
  pickupTimes,
  savoryItems,
  site,
  sweetItems,
  type MenuItem,
} from "@/lib/site";
import { cn } from "@/lib/utils";

type FormState = {
  name: string;
  contact: string;
  preferredDate: Date | undefined;
  preferredTime: string;
  quantities: Record<string, number>;
  notes: string;
  selectedAddons: string[];
  noteMessage: string;
  delivery: string;
  address: string;
  payment: string;
};

const initialQuantities = Object.fromEntries(
  menuItems.map((item) => [item.slug, 0]),
) as Record<string, number>;

const initialState: FormState = {
  name: "",
  contact: "",
  preferredDate: undefined,
  preferredTime: "",
  quantities: initialQuantities,
  notes: "",
  selectedAddons: [],
  noteMessage: "",
  delivery: "pickup",
  address: "",
  payment: "bank",
};

function formatPreferredWhen(date: Date | undefined, time: string) {
  if (!date || !time) return "";
  return `${dayjs(date).format("ddd MMM D")} · ${time}`;
}

function flavorNote(item: MenuItem) {
  if (item.slug === "buko") return "Fri-Sun";
  if (item.slug === "butter-chicken-curry") return "Availability to confirm";
  return item.note;
}

function buildFlavorLines(quantities: Record<string, number>) {
  return menuItems
    .filter((item) => (quantities[item.slug] ?? 0) > 0)
    .map((item) => {
      const qty = quantities[item.slug];
      const extra = flavorNote(item);
      return `- ${qty}× ${item.name} (${itemPriceText(item)})${extra ? ` · ${extra}` : ""}`;
    });
}

function buildOrderSummary(form: FormState) {
  const addonLines = form.selectedAddons
    .map((id) => {
      const addon = addons.find((item) => item.id === id);
      if (!addon) return null;
      const price = formatPrice(addon.price);
      if (addon.id === "note-card" && form.noteMessage.trim()) {
        return `- ${addon.label} (${price}): "${form.noteMessage.trim()}"`;
      }
      return `- ${addon.label} (${price})`;
    })
    .filter(Boolean);

  const delivery = deliveryOptions.find(
    (option) => option.id === form.delivery,
  );
  const payment = paymentMethods.find((method) => method.id === form.payment);
  const flavorLines = buildFlavorLines(form.quantities);

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
    "Sent via " + getOrderSummarySource(),
  ];

  return lines.filter((line) => line !== null).join("\n");
}

function QtyStepper({
  value,
  onChange,
  label,
}: {
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
}: {
  item: MenuItem;
  quantity: number;
  onQuantityChange: (next: number) => void;
}) {
  const selected = quantity > 0;
  const extra = flavorNote(item);

  return (
    <div className={cn("order-flavor", selected ? "is-selected" : "")}>
      {item.price != null ? (
        <Image
          src={`/images/thumbs/${item.slug}.webp`}
          unoptimized
          alt=""
          width={72}
          height={72}
          className="order-thumb"
        />
      ) : (
        <Image
          src="/brand/seal.png"
          alt=""
          width={72}
          height={72}
          className="order-thumb order-seal"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="font-heading text-base font-semibold">{item.name}</p>
          <p className="text-sm font-semibold text-charcoal/70">
            {itemPriceText(item)}
          </p>
        </div>
        {extra ? (
          <p className="mt-0.5 text-xs font-medium text-charcoal/55">{extra}</p>
        ) : null}
      </div>
      <QtyStepper
        value={quantity}
        onChange={onQuantityChange}
        label={item.name}
      />
    </div>
  );
}

export function OrderForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "copied" | "fallback">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fallbackSummary, setFallbackSummary] = useState("");

  const needsAddress = form.delivery === "lalamove";
  const needsNote = form.selectedAddons.includes("note-card");
  const selectedCount = useMemo(
    () => Object.values(form.quantities).reduce((sum, qty) => sum + qty, 0),
    [form.quantities],
  );
  const selectedItems = menuItems.filter(
    (item) => form.quantities[item.slug] > 0,
  );
  const chosenAddons = addons.filter((addon) =>
    form.selectedAddons.includes(addon.id),
  );
  const subtotal =
    selectedItems.reduce(
      (sum, item) => sum + (item.price ?? 0) * form.quantities[item.slug],
      0,
    ) + chosenAddons.reduce((sum, addon) => sum + addon.price, 0);
  const hasUnpriced = selectedItems.some((item) => item.price == null);
  const today = useMemo(
    () => dayjs().tz(site.timezone).startOf("day").toDate(),
    [],
  );
  const dateLabel = form.preferredDate
    ? dayjs(form.preferredDate).format("ddd, MMM D")
    : "Pick a date";
  const bukoQty = form.quantities.buko ?? 0;
  const selectedWeekday = form.preferredDate
    ? dayjs(form.preferredDate).day()
    : null;
  const bukoDayOk =
    selectedWeekday === 0 || selectedWeekday === 5 || selectedWeekday === 6;

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

    const summary = buildOrderSummary(form);

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
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Pick your pies</legend>
              <p className="text-xs text-charcoal/55">
                A few for you, a few to share. Use + to add your favourites.
              </p>
              <div className="space-y-2">
                {sweetItems.map((item) => (
                  <FlavorRow
                    key={item.slug}
                    item={item}
                    quantity={form.quantities[item.slug] ?? 0}
                    onQuantityChange={(next) => setQuantity(item.slug, next)}
                  />
                ))}
              </div>
              <p className="pt-2 text-xs font-semibold tracking-wide text-charcoal/50 uppercase">
                Savoury
              </p>
              <div className="space-y-2">
                {savoryItems.map((item) => (
                  <FlavorRow
                    key={item.slug}
                    item={item}
                    quantity={form.quantities[item.slug] ?? 0}
                    onQuantityChange={(next) => setQuantity(item.slug, next)}
                  />
                ))}
              </div>
              {bukoQty > 0 && form.preferredDate && !bukoDayOk ? (
                <p className="text-sm text-charcoal/70">
                  Buko is baked Friday to Sunday. We&apos;ll confirm timing in
                  DM.
                </p>
              ) : null}
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
              {addons.map((addon) => (
                <label
                  key={addon.id}
                  className="pressable flex cursor-pointer items-start gap-3 rounded-xl bg-butter/60 px-4 py-3"
                >
                  <input
                    type="checkbox"
                    checked={form.selectedAddons.includes(addon.id)}
                    onChange={() => toggleAddon(addon.id)}
                    className="mt-1 size-4 accent-crust"
                  />
                  <span className="text-sm">
                    <span className="font-semibold">{addon.label}</span>
                    <span className="text-charcoal/60">
                      {" "}
                      (+{formatPrice(addon.price)})
                    </span>
                  </span>
                </label>
              ))}
              {needsNote ? (
                <div className="space-y-2 pl-1">
                  <Label htmlFor="noteMessage">Message for note card</Label>
                  <Input
                    id="noteMessage"
                    name="noteMessage"
                    value={form.noteMessage}
                    onChange={(event) =>
                      update("noteMessage", event.target.value)
                    }
                    className="h-11 rounded-xl bg-cream px-3"
                    placeholder="Write your note…"
                  />
                </div>
              ) : null}
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
              className={cn(
                buttonVariants({ variant: "default" }),
                "order-submit brand-button",
              )}
            >
              Copy order &amp; open Instagram{" "}
              <ArrowUpRight size={18} aria-hidden />
            </button>
            <p className="order-submit-note">
              Your order is placed once we confirm it in our conversation. No
              payment is taken here.
            </p>
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
          {chosenAddons.length > 0 && (
            <ul className="order-summary-lines order-summary-addons">
              {chosenAddons.map((addon) => (
                <li key={addon.id}>
                  <span>{addon.label}</span>
                  <span>{formatPrice(addon.price)}</span>
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
              ? "Weekend pie prices will be added after confirmation. "
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
