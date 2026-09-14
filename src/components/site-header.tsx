"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { LogoLockup } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { nav, navHashIds } from "@/lib/site";
import { cn } from "@/lib/utils";

function useActiveHash(pathname: string) {
  const [activeHash, setActiveHash] = useState<string | null>(null);

  useEffect(() => {
    if (pathname !== "/") {
      setActiveHash(null);
      return;
    }

    const readHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash && navHashIds.includes(hash as (typeof navHashIds)[number])) {
        setActiveHash(hash);
      }
    };

    readHash();
    window.addEventListener("hashchange", readHash);

    const sections = navHashIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (sections.length === 0) {
      return () => window.removeEventListener("hashchange", readHash);
    }

    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target.id, entry.intersectionRatio);
        }
        let best: string | null = null;
        let bestRatio = 0.18;
        for (const [id, ratio] of ratios) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = id;
          }
        }
        if (best) setActiveHash(best);
        else if (!window.location.hash) setActiveHash(null);
      },
      {
        threshold: [0.15, 0.3, 0.5, 0.7],
        rootMargin: "-28% 0px -52% 0px",
      }
    );

    sections.forEach((section) => observer.observe(section));

    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", readHash);
    };
  }, [pathname]);

  return activeHash;
}

function isNavActive(
  href: string,
  pathname: string,
  activeHash: string | null
) {
  if (href.startsWith("/#")) {
    return pathname === "/" && activeHash === href.slice(2);
  }
  return pathname === href;
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const activeHash = useActiveHash(pathname);

  return (
    <header className="site-header relative sticky top-0 z-50">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-50 focus:rounded-full focus:bg-crust focus:px-4 focus:py-2 focus:text-sm focus:font-semibold"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:h-[4.25rem] sm:px-6">
        <Link
          href="/"
          className="rounded-full focus-visible:ring-3 focus-visible:ring-charcoal/25 focus-visible:ring-offset-2 focus-visible:ring-offset-cream/80"
          onClick={() => setOpen(false)}
        >
          <LogoLockup />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {nav.map((item) => {
            const isActive = isNavActive(item.href, pathname, activeHash);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-2 text-sm font-semibold transition-colors duration-150 ease-[var(--ease-out)] focus-visible:ring-3 focus-visible:ring-charcoal/25",
                  isActive
                    ? "bg-butter text-charcoal"
                    : "text-charcoal/70 hover:text-charcoal"
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
            Order via Instagram
          </Link>
          <button
            type="button"
            className="pressable hover-surface inline-flex size-10 items-center justify-center rounded-full text-charcoal focus-visible:ring-3 focus-visible:ring-charcoal/25 lg:hidden"
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
          "site-header-panel grid overflow-hidden ease-[var(--ease-out)] lg:hidden",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <nav
            className={cn(
              "mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 ease-[var(--ease-out)]",
              open
                ? "translate-y-0 opacity-100"
                : "pointer-events-none -translate-y-2 opacity-0"
            )}
            aria-label="Mobile"
            aria-hidden={!open}
          >
            {nav.map((item) => {
              const isActive = isNavActive(item.href, pathname, activeHash);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  tabIndex={open ? undefined : -1}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "mobile-nav-item pressable hover-surface rounded-2xl px-4 py-3 text-base font-semibold text-charcoal focus-visible:ring-3 focus-visible:ring-charcoal/25",
                    isActive && "bg-butter"
                  )}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/order"
              tabIndex={open ? undefined : -1}
              className={cn(
                buttonVariants({ variant: "default" }),
                "mobile-nav-item mt-2 h-12 rounded-full px-5 text-base font-semibold"
              )}
              onClick={() => setOpen(false)}
            >
              Order via Instagram
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
