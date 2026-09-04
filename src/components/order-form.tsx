"use client";

import { useMemo, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addons,
  bankDetails,
  deliveryOptions,
  formatPrice,
  paymentMethods,
  site,
  sweetItems,
} from "@/lib/site";
import { cn } from "@/lib/utils";

type FormState = {
  name: string;
  contact: string;
  preferredWhen: string;
  orderDetails: string;
  selectedAddons: string[];
  noteMessage: string;
  delivery: string;
  address: string;
  payment: string;
};

const initialState: FormState = {
  name: "",
  contact: "",
  preferredWhen: "",
  orderDetails: "",
  selectedAddons: [],
  noteMessage: "",
  delivery: "pickup",
  address: "",
  payment: "bank",
};

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

  const lines = [
    "Makalipie Order Form",
    "--------------------",
    `Name: ${form.name.trim()}`,
    `Contact Number: ${form.contact.trim()}`,
    `Preferred Date & Time: ${form.preferredWhen.trim()}`,
    "",
    "Order Details:",
    form.orderDetails.trim(),
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
    "Sent via makalipie.vercel.app/order",
  ];

  return lines.filter((line) => line !== null).join("\n");
}

export function OrderForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [status, setStatus] = useState<"idle" | "copied" | "fallback">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fallbackSummary, setFallbackSummary] = useState("");

  const flavorHint = useMemo(
    () =>
      sweetItems
        .filter((item) => item.price != null)
        .map((item) => `${item.name} ${formatPrice(item.price!)}`)
        .join(" · "),
    []
  );

  const needsAddress = form.delivery === "lalamove";
  const needsNote = form.selectedAddons.includes("note-card");

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
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

    if (
      !form.name.trim() ||
      !form.contact.trim() ||
      !form.preferredWhen.trim() ||
      !form.orderDetails.trim()
    ) {
      setError("Please fill in name, contact, preferred date & time, and order details.");
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
        <p className="text-xs font-bold tracking-[0.2em] text-charcoal/60 uppercase">
          Order form
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Fill this out and send through our inbox
        </h1>
        <p className="mt-4 text-charcoal/70">
          We&apos;ll copy your order summary, then open Instagram so you can
          paste it into our DM.
        </p>

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

          <div className="space-y-2">
            <Label htmlFor="preferredWhen">Preferred Date &amp; Time</Label>
            <Input
              id="preferredWhen"
              name="preferredWhen"
              required
              placeholder="e.g. Sat Mar 15 · 3PM pickup"
              value={form.preferredWhen}
              onChange={(event) => update("preferredWhen", event.target.value)}
              className="h-11 rounded-xl bg-cream px-3"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="orderDetails">Order Details</Label>
            <textarea
              id="orderDetails"
              name="orderDetails"
              required
              rows={4}
              placeholder="List flavors and quantity (e.g. 2 Pecan, 1 Keylime)"
              value={form.orderDetails}
              onChange={(event) => update("orderDetails", event.target.value)}
              className="w-full rounded-xl border border-input bg-cream px-3 py-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
            />
            <p className="text-xs text-charcoal/55">{flavorHint}</p>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Add-Ons</legend>
            {addons.map((addon) => (
              <label
                key={addon.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl bg-butter/60 px-4 py-3"
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
                className="flex cursor-pointer items-start gap-3 rounded-xl bg-butter/60 px-4 py-3"
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
            {paymentMethods.map((method) => (
              <label
                key={method.id}
                className="flex cursor-pointer items-center gap-3 rounded-xl bg-butter/60 px-4 py-3"
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
          <h2 className="font-heading text-xl font-semibold">Payment details</h2>
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

        <p className="text-sm text-charcoal/60">
          After you send the form, wait for confirmation and invoice, then pay
          and share proof of payment to secure your slot.
        </p>
      </aside>
    </div>
  );
}
