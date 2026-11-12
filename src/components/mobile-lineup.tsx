"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowRight, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetDescription, SheetClose } from "@/components/ui/sheet";

export function MobileLineup({ count, amount, totalLabel, fallbackFocus, action, hint, children }: {
  count: number;
  amount: string;
  totalLabel: "Total" | "Subtotal";
  fallbackFocus: RefObject<HTMLElement | null>;
  action: { label: string; disabled: boolean } & ({ form: string } | { onClick: () => void });
  hint?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const movingToAction = useRef(false);
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
  const form = "form" in action ? action.form : undefined;
  const advance = "onClick" in action ? action.onClick : undefined;

  function runSheetAction() {
    movingToAction.current = true;
    setOpen(false);
    if (advance) advance();
    else requestAnimationFrame(() => {
      const target = form && document.getElementById(form);
      if (target instanceof HTMLFormElement) target.requestSubmit();
    });
  }

  return <Sheet open={open} onOpenChange={next => {
    if (next) movingToAction.current = false;
    setOpen(next);
  }}>
    <div className="mobile-lineup-bar" data-empty={count === 0} hidden={keyboard}>
      {count > 0 && <SheetTrigger className="mobile-lineup-trigger">
        <strong>{totalLabel} · {summary}</strong>
        <span>View lineup <ChevronUp size={16} aria-hidden /></span>
      </SheetTrigger>}
      <div className="mobile-checkout-action">
        {hint && <p className="mobile-checkout-hint" role="status">{hint}</p>}
        <Button type={form ? "submit" : "button"} variant="ghost" className="mobile-checkout-primary" form={form} onClick={advance} disabled={action.disabled}>
          {action.label} <ArrowRight aria-hidden />
        </Button>
      </div>
    </div>
    <span className="sr-only" role="status" aria-atomic="true">{summary}</span>
    <SheetContent side="bottom" className="mobile-lineup-sheet" showCloseButton={false}
      finalFocus={() => {
        if (movingToAction.current) return false;
        return count > 0 && !keyboard && window.matchMedia("(max-width: 959px)").matches ? true : fallbackFocus.current;
      }}>
      <header className="mobile-lineup-header"><div><SheetTitle>Your order</SheetTitle><SheetDescription>{count} {count === 1 ? "item" : "items"} in your lineup</SheetDescription></div><SheetClose className="mobile-lineup-close">Close</SheetClose></header>
      <div className="mobile-lineup-scroll">{count === 0 ? <p className="mobile-lineup-empty">Your lineup is empty.</p> : children}</div>
      <footer className="mobile-lineup-footer"><div><span>{totalLabel}</span><strong>{amount}</strong></div><Button type="button" variant="ghost" className="mobile-lineup-continue" disabled={action.disabled} onClick={runSheetAction}>
        {action.label} <ArrowRight aria-hidden />
      </Button></footer>
    </SheetContent>
  </Sheet>;
}
