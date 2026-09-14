"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { LogoLockup } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { nav } from "@/lib/site";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-mustard">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-50 focus:rounded-full focus:bg-paper focus:px-4 focus:py-2 focus:text-sm focus:font-bold"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-[4.25rem] max-w-6xl items-end justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="rounded-full pb-3 focus-visible:ring-3 focus-visible:ring-ring/60"
          onClick={() => setOpen(false)}
        >
          <LogoLockup />
        </Link>

        <nav
          className="hidden h-full items-end gap-1 lg:flex"
          aria-label="Primary"
        >
          {nav.map((item) => {
            const isActive =
              item.href === pathname ||
              (item.href.startsWith("/#") && pathname === "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "font-display inline-flex h-[2.85rem] items-center rounded-t-[1.1rem] px-5 text-lg font-bold tracking-[0.06em] uppercase transition-[transform,background-color,color] duration-150 ease-[var(--ease-out)]",
                  isActive
                    ? "bg-mustard text-ink"
                    : "bg-ink text-paper hover:bg-ink/90 active:scale-[0.97]"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-end gap-2 pb-2">
          <Link
            href="/order"
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "hidden h-10 rounded-full border-2 border-ink px-4 font-display text-base font-bold tracking-wide uppercase sm:inline-flex"
            )}
          >
            Order now
          </Link>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full text-ink transition-[background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-ink/8 active:scale-[0.97] lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          </button>
        </div>
      </div>

      <div
        id="mobile-nav"
        data-state={open ? "open" : "closed"}
        className={cn(
          "grid overflow-hidden bg-mustard transition-[grid-template-rows] duration-[240ms] ease-[var(--ease-drawer)] lg:hidden",
          open ? "grid-rows-[1fr] border-t-2 border-ink/25" : "grid-rows-[0fr]"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <nav
            className={cn(
              "mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 transition-[opacity,transform] duration-[240ms] ease-[var(--ease-drawer)]",
              open
                ? "translate-y-0 opacity-100"
                : "pointer-events-none -translate-y-2 opacity-0"
            )}
            aria-label="Mobile"
            aria-hidden={!open}
          >
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                tabIndex={open ? undefined : -1}
                className="font-display rounded-2xl px-4 py-3 text-xl font-bold tracking-[0.06em] text-ink uppercase active:scale-[0.97]"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/order"
              tabIndex={open ? undefined : -1}
              className={cn(
                buttonVariants({ variant: "default" }),
                "font-display mt-2 h-12 rounded-full px-5 text-base font-bold tracking-wide uppercase"
              )}
              onClick={() => setOpen(false)}
            >
              Order now
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
