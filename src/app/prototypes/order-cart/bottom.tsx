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
import { CartBody, FlavorStubList, formatKnown, useDemoCart } from "./cart-shared";

/** Mobile sheet-first: sticky trigger opens bottom Sheet. */
export function BottomCart() {
  const cart = useDemoCart();

  return (
    <div className="oc-root oc-bottom">
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
            <button type="button" className="oc-bottom-trigger" aria-label="Open your box" />
          }
        >
          <ShoppingBag size={18} aria-hidden />
          <span>
            Your box
            {cart.pieCount > 0 ? ` · ${cart.pieCount}` : ""}
          </span>
          <strong>{cart.pieCount > 0 ? formatKnown(cart.knownSubtotal) : "Empty"}</strong>
        </SheetTrigger>
        <SheetContent side="bottom" className="oc-sheet oc-sheet-bottom max-h-[85dvh] gap-0 rounded-t-2xl p-0">
          <SheetHeader className="border-b border-[var(--brand-line)] px-5 py-4">
            <SheetTitle>Your little lineup</SheetTitle>
            <SheetDescription>
              {cart.pieCount === 0
                ? "Add pies from the list."
                : `${cart.pieCount} ${cart.pieCount === 1 ? "pie" : "pies"} ready to confirm on Instagram.`}
            </SheetDescription>
          </SheetHeader>
          <div className="oc-sheet-scroll px-5 py-4">
            <CartBody cart={cart} />
          </div>
          <SheetFooter className="border-t border-[var(--brand-line)] px-5 py-4">
            <Button type="button" className="oc-cta" disabled={cart.pieCount === 0}>
              Continue to order details
            </Button>
            <p className="oc-footer-note">We’ll confirm availability and payment in Instagram.</p>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
