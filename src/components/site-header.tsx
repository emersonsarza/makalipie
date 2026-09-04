"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { LogoLockup } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { nav, site } from "@/lib/site";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-charcoal/8 bg-cream/90 backdrop-blur-md">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-crust focus:px-4 focus:py-2 focus:text-sm focus:font-semibold"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:h-[4.25rem] sm:px-6">
        <Link
          href="/"
          className="rounded-full focus-visible:ring-3 focus-visible:ring-ring/60"
          onClick={() => setOpen(false)}
        >
          <LogoLockup />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {nav.map((item) => {
            const isActive =
              item.href === pathname ||
              (item.href.startsWith("/#") && pathname === "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-full px-3 py-2 text-sm font-semibold transition-colors",
                  isActive
                    ? "text-charcoal"
                    : "text-charcoal/75 hover:text-charcoal"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/order"
            className={cn(
              buttonVariants({ variant: "default" }),
              "hidden h-10 rounded-full px-4 font-semibold sm:inline-flex"
            )}
          >
            Order now
          </Link>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full text-charcoal transition-[background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-butter active:scale-[0.97] lg:hidden"
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
          "grid overflow-hidden bg-cream transition-[grid-template-rows] duration-[240ms] ease-[var(--ease-out)] lg:hidden",
          open ? "grid-rows-[1fr] border-t border-charcoal/8" : "grid-rows-[0fr]"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <nav
            className={cn(
              "mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 transition-[opacity,transform] duration-[240ms] ease-[var(--ease-out)]",
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
                className="rounded-2xl px-4 py-3 text-base font-semibold text-charcoal hover:bg-butter"
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
                "mt-2 h-12 rounded-full px-5 text-base font-semibold"
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
