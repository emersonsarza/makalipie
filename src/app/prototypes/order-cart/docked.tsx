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
import { useIsMobile } from "@/hooks/use-mobile";
import { CartBody, FlavorStubList, formatKnown, useDemoCart } from "./cart-shared";

/** Hybrid: persistent dock summary; full edit list always opens in Sheet. */
export function DockedCart() {
  const cart = useDemoCart();
  const isMobile = useIsMobile();
  const side = isMobile ? "bottom" : "right";

  return (
    <div className="oc-root oc-docked">
      <div className="oc-stage oc-stage-docked">
        <header className="oc-top">
          <strong>makalipie</strong>
          <span>Order · prototype</span>
        </header>
        <FlavorStubList cart={cart} />
      </div>

      <Sheet>
        <div className="oc-dock" role="region" aria-label="Your box summary">
          <div className="oc-dock-copy">
            <ShoppingBag size={18} aria-hidden />
            <div>
              <strong>
                {cart.pieCount === 0
                  ? "Your box is empty"
                  : `${cart.pieCount} ${cart.pieCount === 1 ? "pie" : "pies"}`}
              </strong>
              <span>{cart.pieCount > 0 ? formatKnown(cart.knownSubtotal) : "Add something delicious"}</span>
            </div>
          </div>
          <SheetTrigger render={<Button type="button" className="oc-cta oc-dock-cta" />}>
            View box
          </SheetTrigger>
        </div>
        <SheetContent
          side={side}
          className={
            side === "bottom"
              ? "oc-sheet oc-sheet-bottom max-h-[85dvh] gap-0 rounded-t-2xl p-0"
              : "oc-sheet oc-sheet-side w-full gap-0 p-0 sm:max-w-md"
          }
        >
          <SheetHeader className="border-b border-[var(--brand-line)] px-5 py-4">
            <SheetTitle>Your little lineup</SheetTitle>
            <SheetDescription>
              Edit quantities here. The dock stays put so you can keep browsing.
            </SheetDescription>
          </SheetHeader>
          <div className="oc-sheet-scroll px-5 py-4">
            <CartBody cart={cart} showGiftEmpty={side === "right"} />
          </div>
          <SheetFooter className="border-t border-[var(--brand-line)] px-5 py-4">
            <Button type="button" className="oc-cta" disabled={cart.pieCount === 0}>
              Continue to order details
            </Button>
            <p className="oc-footer-note">Final total confirmed on Instagram—no payment on this page.</p>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
