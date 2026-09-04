"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";

import { LogoLockup } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { nav, site } from "@/lib/site";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-charcoal/8 bg-cream/90 backdrop-blur-md">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-crust focus:px-4 focus:py-2 focus:text-sm focus:font-semibold"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:h-[4.25rem] sm:px-6">
        <a
          href="#top"
          className="rounded-full focus-visible:ring-3 focus-visible:ring-ring/60"
          onClick={() => setOpen(false)}
        >
          <LogoLockup />
        </a>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-2 text-sm font-semibold text-charcoal/75 transition-colors hover:text-charcoal"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={site.instagramDmUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(
              buttonVariants({ variant: "default" }),
              "hidden h-10 rounded-full px-4 font-semibold sm:inline-flex"
            )}
          >
            Message us
          </a>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full text-charcoal hover:bg-butter lg:hidden"
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
        className={cn("border-t border-charcoal/8 bg-cream lg:hidden", !open && "hidden")}
      >
        <nav
          className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4"
          aria-label="Mobile"
        >
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-2xl px-4 py-3 text-base font-semibold text-charcoal hover:bg-butter"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
          <a
            href={site.instagramDmUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(
              buttonVariants({ variant: "default" }),
              "mt-2 h-12 rounded-full px-5 text-base font-semibold"
            )}
          >
            Message us on Instagram
          </a>
        </nav>
      </div>
    </header>
  );
}
