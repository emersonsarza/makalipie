"use client";

import { ArrowUpRight, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";

const links = [
  { href: "/menu", label: "Our pies" },
  { href: "/#story", label: "Our story" },
  { href: "/#visit", label: "Find us" },
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

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
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
          onClick={() => setOpen(false)}
        >
          <Image src="/brand/seal.png" alt="" width={72} height={72} priority />
          <span>
            makalipie<span>TARTS & PIES · CEBU</span>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="Primary">
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
          <Link className="brand-button nav-order" href="/order">
            Bring home a pie <ArrowUpRight size={17} aria-hidden />
          </Link>
          <button
            className="nav-toggle"
            ref={toggle}
            onClick={() => setOpen(!open)}
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
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={(event) => {
                scrollToHash(link.href, pathname, event);
                setOpen(false);
              }}
            >
              {link.label}
              <ArrowUpRight size={20} aria-hidden />
            </Link>
          ))}
          <Link href="/order" onClick={() => setOpen(false)}>
            Bring home a pie
            <ArrowUpRight size={20} aria-hidden />
          </Link>
        </nav>
      )}
    </header>
  );
}
