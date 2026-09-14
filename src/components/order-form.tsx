"use client";

import { CalendarDays, Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { OrderChannelLine } from "@/components/order-channel-line";
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
  bankDetails,
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
  menuItems.map((item) => [item.slug, 0])
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
  if (item.slug === "buko") return "Fri–Sun";
  if (item.slug === "butter-chicken-curry") return "Sunday Market";
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

  const delivery = deliveryOptions.find((option) => option.id === form.delivery);
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
    <div className="inline-flex items-center rounded-full bg-cream ring-1 ring-charcoal/10">
      <button
        type="button"
        className="pressable inline-flex size-9 items-center justify-center rounded-full text-charcoal disabled:opacity-30"
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
        className="pressable inline-flex size-9 items-center justify-center rounded-full text-charcoal"
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
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl px-3 py-3 ring-1 transition-[background-color,box-shadow] duration-150 ease-[var(--ease-out)] sm:px-4",
        selected
          ? "bg-butter ring-crust/70"
          : "bg-cream ring-charcoal/10"
      )}
    >
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
    [form.quantities]
  );
  const today = useMemo(
    () => dayjs().tz(site.timezone).startOf("day").toDate(),
    []
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
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Order via Instagram
        </h1>
        <p className="mt-4 text-charcoal/70">
          Tap flavors and quantities. We&apos;ll copy a clean summary, then open
          Instagram so you can paste it into our DM.
        </p>
        <OrderChannelLine className="mt-3" />

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
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
            <Label>Preferred date</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger
                type="button"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-11 w-full justify-start rounded-xl border-charcoal/15 bg-cream px-3 text-base font-medium md:text-sm"
                )}
              >
                <CalendarDays className="size-4 text-charcoal/60" />
                <span
                  className={
                    form.preferredDate ? "text-charcoal" : "text-charcoal/45"
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
                        ? "bg-crust text-charcoal ring-crust"
                        : "bg-cream text-charcoal/80 ring-charcoal/10 hover:bg-butter"
                    )}
                    aria-pressed={active}
                  >
                    {time}
                  </button>
                );
              })}
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Flavors</legend>
            <p className="text-xs text-charcoal/55">
              Tap + to add a pie. Buko is Friday to Sunday; Butter Chicken
              Curry is the Sunday market savory.
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
              Savory
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
                Buko is baked Friday to Sunday. We&apos;ll confirm timing in DM.
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

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Add-Ons</legend>
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
                  onChange={(event) => update("noteMessage", event.target.value)}
                  className="h-11 rounded-xl bg-cream px-3"
                  placeholder="Write your note…"
                />
              </div>
            ) : null}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Delivery Option</legend>
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
            <legend className="text-sm font-medium">Mode of Payment</legend>
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
                Couldn&apos;t copy automatically — select and copy the summary
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
              "h-12 w-full rounded-full px-6 text-base font-semibold sm:w-auto"
            )}
          >
            Copy order &amp; open Instagram
          </button>
        </form>
      </div>

      <aside className="space-y-6 lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-[1.6rem] bg-butter p-6 ring-1 ring-charcoal/8">
          <h2 className="font-heading text-xl font-semibold">
            Payment after confirmation
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-charcoal/70">
            Bank and GCash details are here so you&apos;re ready. Please wait
            for our confirmation and invoice before paying, then send proof of
            payment to secure your slot.
          </p>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-charcoal/80">
            <div>
              <p className="font-bold tracking-wide text-charcoal uppercase">
                {bankDetails.bank}
              </p>
              <p>{bankDetails.accountName}</p>
              <p className="font-mono text-base text-charcoal">
                {bankDetails.accountNumber}
              </p>
            </div>
            <div>
              <p className="font-bold tracking-wide text-charcoal uppercase">
                GCash
              </p>
              <p>Account name: {bankDetails.gcashName}</p>
              <p className="mt-1 text-charcoal/60">
                Scan or send via the QR we share in DM after confirmation.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[1.6rem] bg-cream p-6 ring-1 ring-charcoal/8">
          <h2 className="font-heading text-xl font-semibold">Delivery</h2>
          <ul className="mt-4 space-y-3 text-sm text-charcoal/80">
            <li>
              <span className="font-semibold text-charcoal">Self pick-up</span>
              <br />
              {site.kiosk.floor}, {site.kiosk.place}
            </li>
            <li>
              <span className="font-semibold text-charcoal">Lalamove booking</span>
              <br />
              Share your address on the form; we&apos;ll confirm logistics in DM.
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
