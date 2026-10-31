"use client";

import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react";
import Image from "next/image";
import { LocationSelector } from "@/components/location-selector";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";

const links = [
  { href: "/#story", label: "Our story" },
  { href: "/#visit", label: "Find us" },
];

const pieLinks = [
  { href: "/menu", label: "4-inch pies", view: "menu" as const },
  { href: "/menu?view=preorders", label: "Pre-orders", view: "preorders" as const },
];

function scrollToHash(href: string, pathname: string, event: MouseEvent) {
  const hash = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";
  if (!hash || pathname !== "/") return;

  // Same-hash clicks are a no-op for the browser; force scroll when already on #visit / #story.
  if (window.location.hash === `#${hash}`) {
    event.preventDefault();
    document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
  }
}

export function SiteHeader({ menuView }: { menuView?: "menu" | "preorders" }) {
  const [open, setOpen] = useState(false);
  const [desktopPiesOpen, setDesktopPiesOpen] = useState(false);
  const [mobilePiesOpen, setMobilePiesOpen] = useState(false);
  const pathname = usePathname();
  const toggle = useRef<HTMLButtonElement>(null);
  const piesTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open && !desktopPiesOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (desktopPiesOpen) {
          setDesktopPiesOpen(false);
          piesTrigger.current?.focus();
          return;
        }
        setOpen(false);
        setMobilePiesOpen(false);
        toggle.current?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [desktopPiesOpen, open]);
  const closeMobile = () => {
    setOpen(false);
    setMobilePiesOpen(false);
  };
  const piesCurrent = pathname === "/menu";
  const pieLinkScroll = !piesCurrent;
  return (
    <header className="brand-header">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="brand-nav wrap">
        <Link
          href="/"
          className="brand-lockup"
          aria-label="Makalipie home"
          onClick={closeMobile}
        >
          <Image src="/brand/seal.png" alt="" width={72} height={72} priority />
          <span>
            makalipie<span>TARTS & PIES · CEBU</span>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="Primary">
          <Link href="/" aria-current={pathname === "/" ? "page" : undefined} onClick={closeMobile}>
            Home
          </Link>
          <div
            className="desktop-pies"
            onMouseEnter={() => setDesktopPiesOpen(true)}
            onMouseLeave={() => setDesktopPiesOpen(false)}
            onFocusCapture={() => setDesktopPiesOpen(true)}
            onBlurCapture={(event) => {
              if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
                setDesktopPiesOpen(false);
              }
            }}
          >
            <button
              ref={piesTrigger}
              type="button"
              className="desktop-pies-trigger"
              aria-expanded={desktopPiesOpen}
              aria-controls="desktop-pies-menu"
              data-current={piesCurrent ? "" : undefined}
              onClick={() => setDesktopPiesOpen(true)}
            >
              Our pies <ChevronDown size={14} aria-hidden />
            </button>
            <div id="desktop-pies-menu" className="desktop-pies-menu" hidden={!desktopPiesOpen}>
              {pieLinks.map(link => (
                <Link key={link.view} href={link.href} scroll={pieLinkScroll} aria-current={piesCurrent && menuView === link.view ? "page" : undefined}>
                  <span>{link.label}</span>
                  <ArrowUpRight size={15} aria-hidden />
                </Link>
              ))}
            </div>
          </div>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              onClick={(event) => scrollToHash(link.href, pathname, event)}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="nav-actions">
          <LocationSelector onNavigate={closeMobile} />
          <Link className="brand-button nav-order" href="/order">
            Bring home a pie <ArrowUpRight size={17} aria-hidden />
          </Link>
          <button
            className="nav-toggle"
            ref={toggle}
            onClick={() => {
              setOpen(value => !value);
              if (open) setMobilePiesOpen(false);
            }}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" className="mobile-menu" aria-label="Mobile">
          <Link href="/" aria-current={pathname === "/" ? "page" : undefined} onClick={closeMobile}>
            Home
            <ArrowUpRight size={20} aria-hidden />
          </Link>
          <button
            type="button"
            className="mobile-menu-trigger"
            aria-expanded={mobilePiesOpen}
            aria-controls="mobile-pies-menu"
            data-current={piesCurrent ? "" : undefined}
            onClick={() => setMobilePiesOpen(value => !value)}
          >
            Our pies
            <ChevronDown size={20} aria-hidden />
          </button>
          <div id="mobile-pies-menu" className="mobile-pies-menu" hidden={!mobilePiesOpen}>
            {pieLinks.map(link => (
              <Link
                key={link.view}
                href={link.href}
                scroll={pieLinkScroll}
                aria-current={piesCurrent && menuView === link.view ? "page" : undefined}
                onClick={closeMobile}
              >
                {link.label}
                <ArrowUpRight size={18} aria-hidden />
              </Link>
            ))}
          </div>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={(event) => {
                scrollToHash(link.href, pathname, event);
                closeMobile();
              }}
            >
              {link.label}
              <ArrowUpRight size={20} aria-hidden />
            </Link>
          ))}
          <Link href="/order" onClick={closeMobile}>
            Bring home a pie
            <ArrowUpRight size={20} aria-hidden />
          </Link>
        </nav>
      )}
    </header>
  );
}
