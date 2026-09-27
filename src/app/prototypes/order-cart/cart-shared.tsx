"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/site";

export type CartLine = {
  id: string;
  name: string;
  unitPrice: number | null;
  quantity: number;
};

export type CartAddon = {
  id: string;
  name: string;
  priceCentavos: number;
};

const INITIAL_LINES: CartLine[] = [
  { id: "buko", name: "Buko", unitPrice: 480, quantity: 2 },
  { id: "keylime", name: "Keylime", unitPrice: 420, quantity: 1 },
  { id: "pecan", name: "Pecan", unitPrice: null, quantity: 0 },
];

const ADDON: CartAddon = {
  id: "topper",
  name: "Birthday topper",
  priceCentavos: 5000,
};

export function useDemoCart() {
  const [lines, setLines] = useState(INITIAL_LINES);
  const [addonOn, setAddonOn] = useState(true);

  function setQty(id: string, quantity: number) {
    setLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, quantity: Math.max(0, Math.min(12, quantity)) } : line)),
    );
  }

  const selected = useMemo(() => lines.filter((line) => line.quantity > 0), [lines]);
  const pieCount = useMemo(() => selected.reduce((sum, line) => sum + line.quantity, 0), [selected]);
  const knownSubtotal = useMemo(() => {
    const pies = selected.reduce((sum, line) => sum + (line.unitPrice == null ? 0 : line.unitPrice * line.quantity), 0);
    return pies + (addonOn && pieCount > 0 ? ADDON.priceCentavos / 100 : 0);
  }, [selected, addonOn, pieCount]);
  const hasUnpriced = selected.some((line) => line.unitPrice == null);

  return {
    lines,
    setQty,
    selected,
    pieCount,
    knownSubtotal,
    hasUnpriced,
    addonOn,
    setAddonOn,
    addon: ADDON,
    menuLines: lines,
  };
}

export type DemoCart = ReturnType<typeof useDemoCart>;

export function formatKnown(subtotal: number) {
  return formatPrice(subtotal);
}

export function CartBody({
  cart,
  showGiftEmpty = false,
}: {
  cart: DemoCart;
  showGiftEmpty?: boolean;
}) {
  const { selected, pieCount, knownSubtotal, hasUnpriced, addonOn, setAddonOn, addon, setQty } = cart;

  if (pieCount === 0) {
    return (
      <div className="oc-empty">
        {showGiftEmpty ? (
          <Image src="/images/brand/gift.webp" alt="" width={280} height={200} className="oc-empty-img" />
        ) : null}
        <p className="oc-empty-title">Your box is empty</p>
        <p className="oc-empty-copy">Pick a pie from the list—your favourites will gather here.</p>
      </div>
    );
  }

  return (
    <div className="oc-body">
      <ul className="oc-lines" aria-label="Pies in your box">
        {selected.map((line) => (
          <li key={line.id} className="oc-line">
            <div className="oc-line-copy">
              <strong>{line.name}</strong>
              <span>
                {line.unitPrice == null ? "To confirm" : formatPrice(line.unitPrice * line.quantity)}
              </span>
            </div>
            <div className="oc-qty" role="group" aria-label={`${line.name} quantity`}>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={`Fewer ${line.name}`}
                onClick={() => setQty(line.id, line.quantity - 1)}
              >
                <Minus aria-hidden />
              </Button>
              <span aria-live="polite">{line.quantity}</span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={`More ${line.name}`}
                onClick={() => setQty(line.id, line.quantity + 1)}
              >
                <Plus aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <label className="oc-addon">
        <input type="checkbox" checked={addonOn} onChange={(e) => setAddonOn(e.target.checked)} />
        <span>
          {addon.name}
          <small>{formatPrice(addon.priceCentavos / 100)}</small>
        </span>
      </label>

      <div className="oc-subtotal">
        <span>Known subtotal</span>
        <strong>{formatKnown(knownSubtotal)}</strong>
      </div>
      <p className="oc-note">
        {hasUnpriced ? "Quoted sizes will be priced after confirmation. " : ""}
        Pickup at Streetscape, Banilad. Final total confirmed on Instagram—no payment here.
      </p>
    </div>
  );
}

export function FlavorStubList({ cart }: { cart: DemoCart }) {
  return (
    <section className="oc-menu" aria-label="Sample menu">
      <p className="oc-eyebrow">BUILD YOUR BOX</p>
      <h2>Choose a few favourites</h2>
      <p className="oc-menu-lead">Prototype flavors—adjust quantities, then open your box.</p>
      <ul className="oc-menu-list">
        {cart.menuLines.map((line) => (
          <li key={line.id}>
            <div>
              <strong>{line.name}</strong>
              <span>{line.unitPrice == null ? "Quote on confirm" : formatPrice(line.unitPrice)}</span>
            </div>
            <div className="oc-qty" role="group" aria-label={`${line.name} quantity`}>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={`Fewer ${line.name}`}
                onClick={() => cart.setQty(line.id, line.quantity - 1)}
              >
                <Minus aria-hidden />
              </Button>
              <span aria-live="polite">{line.quantity}</span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={`More ${line.name}`}
                onClick={() => cart.setQty(line.id, line.quantity + 1)}
              >
                <Plus aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
