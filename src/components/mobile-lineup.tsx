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
    const media = window.matchMedia("(max-width: 767px)");
    const resize = () => { if (!media.matches) setOpen(false); };
    const viewport = window.visualViewport;
    const inApp = /Instagram|FBAN|FBAV|FB_IAB/i.test(navigator.userAgent);
    const detectKeyboard = () => {
      const field = document.activeElement;
      const typing = field instanceof HTMLElement && (field.matches("input, textarea") || field.isContentEditable);
      setKeyboard(Boolean(typing && viewport && window.innerHeight - viewport.height > 150));
    };
    const liftBar = () => {
      const occluded = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
      document.documentElement.style.setProperty("--in-app-bottom", `${inApp ? Math.max(occluded, 56) : occluded}px`);
      document.documentElement.classList.toggle("in-app-browser", inApp);
    };
    liftBar();
    media.addEventListener("change", resize);
    viewport?.addEventListener("resize", detectKeyboard);
    viewport?.addEventListener("resize", liftBar);
    viewport?.addEventListener("scroll", liftBar);
    document.addEventListener("focusin", detectKeyboard);
    const detectAfterBlur = () => queueMicrotask(detectKeyboard);
    document.addEventListener("focusout", detectAfterBlur);
    return () => {
      media.removeEventListener("change", resize);
      viewport?.removeEventListener("resize", detectKeyboard);
      viewport?.removeEventListener("resize", liftBar);
      viewport?.removeEventListener("scroll", liftBar);
      document.removeEventListener("focusin", detectKeyboard);
      document.removeEventListener("focusout", detectAfterBlur);
    };
  }, []);
  const summary = `${count} ${count === 1 ? "item" : "items"} · ${amount}`;
  const form = "form" in action ? action.form : undefined;
  const advance = "onClick" in action ? action.onClick : undefined;

  function submitForm() {
    if (!form) return;
    const target = document.getElementById(form);
    if (!(target instanceof HTMLFormElement)) return;
    if (typeof target.requestSubmit === "function") target.requestSubmit();
    else target.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }

  function runSheetAction() {
    movingToAction.current = true;
    setOpen(false);
    if (advance) advance();
    else requestAnimationFrame(submitForm);
  }

  function runBarAction(event: { preventDefault(): void }) {
    if (advance) {
      event.preventDefault();
      advance();
      return;
    }
    if (!form) return;
    event.preventDefault();
    submitForm();
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
        <Button type="button" variant="ghost" className="mobile-checkout-primary" disabled={action.disabled} onClick={runBarAction}>
          {action.label} <ArrowRight aria-hidden />
        </Button>
      </div>
    </div>
    <span className="sr-only" role="status" aria-atomic="true">{summary}</span>
    <SheetContent side="bottom" className="mobile-lineup-sheet" showCloseButton={false}
      finalFocus={() => {
        if (movingToAction.current) return false;
        return count > 0 && !keyboard && window.matchMedia("(max-width: 767px)").matches ? true : fallbackFocus.current;
      }}>
      <header className="mobile-lineup-header"><div><SheetTitle>Your order</SheetTitle><SheetDescription>{count} {count === 1 ? "item" : "items"} in your lineup</SheetDescription></div><SheetClose className="mobile-lineup-close">Close</SheetClose></header>
      <div className="mobile-lineup-scroll">{count === 0 ? <p className="mobile-lineup-empty">Your lineup is empty.</p> : children}</div>
      <footer className="mobile-lineup-footer"><div><span>{totalLabel}</span><strong>{amount}</strong></div><Button type="button" variant="ghost" className="mobile-lineup-continue" disabled={action.disabled} onClick={runSheetAction}>
        {action.label} <ArrowRight aria-hidden />
      </Button></footer>
    </SheetContent>
  </Sheet>;
}
