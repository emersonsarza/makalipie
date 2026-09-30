"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronUp } from "lucide-react";
import { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetDescription, SheetClose } from "@/components/ui/sheet";
import { formatPrice } from "@/lib/site";

export function MobileLineup({ count, subtotal, hasUnpriced, children }: { count: number; subtotal: number; hasUnpriced: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
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
  const summary = `${count} ${count === 1 ? "pc" : "pcs"} · ${formatPrice(subtotal)}`;
  return <Sheet open={open} onOpenChange={setOpen}>
    <div className="mobile-lineup-bar" hidden={keyboard}>
      <SheetTrigger className="mobile-lineup-trigger">
        <span><small>{hasUnpriced ? "Known subtotal" : "Subtotal"}</small><strong>{summary}</strong></span>
        <span>View lineup <ChevronUp size={18} aria-hidden /></span>
      </SheetTrigger>
    </div>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{summary}{hasUnpriced ? ". Some prices are to confirm." : ""}</span>
    <SheetContent side="bottom" className="mobile-lineup-sheet" showCloseButton={false}>
      <header className="mobile-lineup-header"><div><SheetTitle>Your lineup</SheetTitle><SheetDescription>{count} {count === 1 ? "piece" : "pieces"} in your box</SheetDescription></div><SheetClose className="mobile-lineup-close">Close</SheetClose></header>
      <div className="mobile-lineup-scroll">{count === 0 ? <p className="mobile-lineup-empty">Your box is waiting. Choose your favourite pies to get started.</p> : children}</div>
      <footer className="mobile-lineup-footer"><div><span>{hasUnpriced ? "Known subtotal" : "Subtotal"}</span><strong>{formatPrice(subtotal)}</strong></div><SheetClose className="mobile-lineup-continue">Continue ordering</SheetClose></footer>
    </SheetContent>
  </Sheet>;
}
