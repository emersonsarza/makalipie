"use client";

import { ShoppingBag } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CartBody, FlavorStubList, useDemoCart } from "./cart-shared";

/** Desktop drawer: floating badge opens right Sheet. */
export function SideCart() {
  const cart = useDemoCart();

  return (
    <div className="oc-root oc-side">
      <div className="oc-stage">
        <header className="oc-top">
          <strong>makalipie</strong>
          <span>Order · prototype</span>
        </header>
        <FlavorStubList cart={cart} />
      </div>

      <Sheet>
        <SheetTrigger
          render={
            <button type="button" className="oc-fab" aria-label={`Open your box, ${cart.pieCount} pies`} />
          }
        >
          <ShoppingBag size={20} aria-hidden />
          {cart.pieCount > 0 ? <span className="oc-fab-badge">{cart.pieCount}</span> : null}
        </SheetTrigger>
        <SheetContent side="right" className="oc-sheet oc-sheet-side w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-[var(--brand-line)] px-5 py-5">
            <p className="oc-eyebrow">A BOX TO LOOK FORWARD TO</p>
            <SheetTitle className="text-xl">Your little lineup</SheetTitle>
            <SheetDescription>
              {cart.pieCount === 0
                ? "Your favourites will appear here."
                : `${cart.pieCount} ${cart.pieCount === 1 ? "pie" : "pies"} picked. Good choices.`}
            </SheetDescription>
          </SheetHeader>
          <div className="oc-sheet-scroll flex-1 overflow-y-auto px-5 py-4">
            <CartBody cart={cart} showGiftEmpty />
            {cart.pieCount > 0 ? (
              <div className="oc-logistics">
                <span>Pickup at Streetscape, Banilad</span>
                <span>Choose your preferred date on the order form.</span>
              </div>
            ) : null}
          </div>
          <SheetFooter className="border-t border-[var(--brand-line)] px-5 py-4">
            <Button type="button" className="oc-cta" disabled={cart.pieCount === 0}>
              Continue to order details
            </Button>
            <p className="oc-footer-note">Copy your order into Instagram when you’re ready.</p>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
