"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { ChevronUp } from "lucide-react";
import { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetDescription, SheetClose } from "@/components/ui/sheet";

export function MobileLineup({ count, amount, totalLabel, fallbackFocus, children }: {
  count: number;
  amount: string;
  totalLabel: "Total" | "Subtotal";
  fallbackFocus: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 959px)");
    const resize = () => { if (!media.matches) setOpen(false); };
    const viewport = window.visualViewport;
    const detectKeyboard = () => {
      const field = document.activeElement;
      const typing = field instanceof HTMLElement && (field.matches('input, textarea') || field.isContentEditable);
      setKeyboard(Boolean(typing && viewport && window.innerHeight - viewport.height > 150));
    };
    media.addEventListener("change", resize);
    viewport?.addEventListener("resize", detectKeyboard);
    document.addEventListener("focusin", detectKeyboard);
    document.addEventListener("focusout", detectKeyboard);
    return () => {
      media.removeEventListener("change", resize);
      viewport?.removeEventListener("resize", detectKeyboard);
      document.removeEventListener("focusin", detectKeyboard);
      document.removeEventListener("focusout", detectKeyboard);
    };
  }, []);
  const summary = `${count} ${count === 1 ? "item" : "items"} · ${amount}`;
  return <Sheet open={open} onOpenChange={setOpen}>
    {count > 0 && <div className="mobile-lineup-bar" hidden={keyboard}>
      <SheetTrigger className="mobile-lineup-trigger">
        <span><small>{totalLabel}</small><strong>{summary}</strong></span>
        <span>View lineup <ChevronUp size={18} aria-hidden /></span>
      </SheetTrigger>
    </div>}
    <span className="sr-only" role="status" aria-atomic="true">{summary}</span>
    <SheetContent side="bottom" className="mobile-lineup-sheet" showCloseButton={false}
      finalFocus={() => count > 0 && !keyboard && window.matchMedia("(max-width: 959px)").matches ? true : fallbackFocus.current}>
      <header className="mobile-lineup-header"><div><SheetTitle>Your order</SheetTitle><SheetDescription>{count} {count === 1 ? "item" : "items"} in your lineup</SheetDescription></div><SheetClose className="mobile-lineup-close">Close</SheetClose></header>
      <div className="mobile-lineup-scroll">{count === 0 ? <p className="mobile-lineup-empty">Your lineup is empty.</p> : children}</div>
      <footer className="mobile-lineup-footer"><div><span>{totalLabel}</span><strong>{amount}</strong></div><SheetClose className="mobile-lineup-continue">Continue ordering</SheetClose></footer>
    </SheetContent>
  </Sheet>;
}
