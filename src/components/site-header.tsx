"use client";

import { usePublicShop } from "@/components/public-shop-provider";
import { locationAnchor } from "@/lib/popups/locations";
import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type Dispatch, type MouseEvent, type RefObject, type SetStateAction } from "react";

const storyLink = { href: "/#story", label: "Our story" };

const pieLinks = [
  { href: "/menu", label: "4-inch pies", view: "menu" as const },
  { href: "/menu?view=preorders", label: "Pre-orders", view: "preorders" as const },
];

type NavLink = { key: string; href: string; label: string; current?: boolean };

function scrollToHash(href: string, pathname: string, event: MouseEvent) {
  const hash = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";
  if (!hash || pathname !== "/") return;

  if (window.location.hash === `#${hash}`) {
    event.preventDefault();
    document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
  }
}

function NavDrop({
  id,
  label,
  open,
  menu,
  setMenu,
  triggerRef,
  current,
  links,
  scroll,
  onNavigate,
}: {
  id: string;
  label: string;
  open: boolean;
  menu: "pies" | "find";
  setMenu: Dispatch<SetStateAction<"pies" | "find" | null>>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  current?: boolean;
  links: NavLink[];
  scroll?: boolean;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  return (
    <div
      className="nav-drop"
      onMouseEnter={() => setMenu(menu)}
      onMouseLeave={() => setMenu((current) => (current === menu ? null : current))}
      onFocusCapture={() => setMenu(menu)}
      onBlurCapture={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          setMenu(null);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="nav-drop-trigger"
        aria-expanded={open}
        aria-controls={id}
        data-current={current ? "" : undefined}
        onClick={() => setMenu(menu)}
      >
        {label} <ChevronDown size={14} aria-hidden />
      </button>
      <div id={id} className="nav-drop-menu" hidden={!open}>
        {links.map((link) => (
          <Link
            key={link.key}
            href={link.href}
            scroll={scroll}
            aria-current={link.current ? "page" : undefined}
            onClick={(event) => onNavigate?.(event, link.href)}
          >
            <span>{link.label}</span>
            <ArrowUpRight size={15} aria-hidden />
          </Link>
        ))}
      </div>
    </div>
  );
}

export function SiteHeader({ menuView }: { menuView?: "menu" | "preorders" }) {
  const shop = usePublicShop();
  const [open, setOpen] = useState(false);
  const [desktopMenu, setDesktopMenu] = useState<"pies" | "find" | null>(null);
  const [mobilePiesOpen, setMobilePiesOpen] = useState(false);
  const [mobileFindOpen, setMobileFindOpen] = useState(false);
  const [hash, setHash] = useState("");
  const pathname = usePathname();
  const toggle = useRef<HTMLButtonElement>(null);
  const piesTrigger = useRef<HTMLButtonElement>(null);
  const findTrigger = useRef<HTMLButtonElement>(null);
  const places = [
    ...(shop.branches ?? []).filter((branch) => branch.visible && branch.id === "cebu").map((branch) => ({
      key: branch.id,
      href: `/#${locationAnchor(branch.id)}`,
      label: branch.id === "cebu" ? "Makalipie Cebu" : branch.name,
    })),
    ...(shop.locations?.upcoming ?? []).map((popup) => ({
      key: popup.id,
      href: `/#${locationAnchor(popup.id)}`,
      label: popup.name,
    })),
    ...(shop.locations?.recent ?? []).map((popup) => ({
      key: popup.id,
      href: `/#${locationAnchor(popup.id)}`,
      label: popup.name,
    })),
  ];
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [pathname]);
  useEffect(() => {
    if (!open && !desktopMenu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (desktopMenu) {
        const trigger = desktopMenu === "pies" ? piesTrigger : findTrigger;
        setDesktopMenu(null);
        trigger.current?.focus();
        return;
      }
      setOpen(false);
      setMobilePiesOpen(false);
      setMobileFindOpen(false);
      toggle.current?.focus();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [desktopMenu, open]);
  const closeMobile = () => {
    setOpen(false);
    setMobilePiesOpen(false);
    setMobileFindOpen(false);
  };
  const piesCurrent = pathname === "/menu";
  const pieLinkScroll = !piesCurrent;
  const pieItems: NavLink[] = pieLinks.map((link) => ({
    key: link.view,
    href: link.href,
    label: link.label,
    current: piesCurrent && menuView === link.view,
  }));
  const placeItems: NavLink[] = places.map((place) => ({
    ...place,
    current: pathname === "/" && hash === `#${locationAnchor(place.key)}`,
  }));
  const findCurrent = placeItems.some((place) => place.current);
  const goToPlace = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    scrollToHash(href, pathname, event);
    closeMobile();
  };

  return (
    <header className="brand-header">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="brand-nav wrap">
        <Link href="/" className="brand-lockup" aria-label="Makalipie home" onClick={closeMobile}>
          <Image src="/brand/seal.png" alt="" width={72} height={72} priority />
          <span>
            makalipie<span>TARTS & PIES · CEBU</span>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="Primary">
          <Link href="/" aria-current={pathname === "/" ? "page" : undefined} onClick={closeMobile}>
            Home
          </Link>
          <NavDrop
            id="desktop-pies-menu"
            label="Our pies"
            menu="pies"
            open={desktopMenu === "pies"}
            setMenu={setDesktopMenu}
            triggerRef={piesTrigger}
            current={piesCurrent}
            links={pieItems}
            scroll={pieLinkScroll}
          />
          <NavDrop
            id="desktop-find-menu"
            label="Find us"
            menu="find"
            open={desktopMenu === "find"}
            setMenu={setDesktopMenu}
            triggerRef={findTrigger}
            current={findCurrent}
            links={placeItems}
            onNavigate={goToPlace}
          />
          <Link href={storyLink.href} onClick={(event) => scrollToHash(storyLink.href, pathname, event)}>
            {storyLink.label}
          </Link>
        </nav>
        <div className="nav-actions">
          <Link className="brand-button nav-order" href="/order">
            Bring home a pie <ArrowUpRight size={17} aria-hidden />
          </Link>
          <button
            className="nav-toggle"
            ref={toggle}
            onClick={() => {
              setOpen((value) => !value);
              if (open) {
                setMobilePiesOpen(false);
                setMobileFindOpen(false);
              }
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
            onClick={() => setMobilePiesOpen((value) => !value)}
          >
            Our pies
            <ChevronDown size={20} aria-hidden />
          </button>
          <div id="mobile-pies-menu" className="mobile-drop-menu" hidden={!mobilePiesOpen}>
            {pieItems.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                scroll={pieLinkScroll}
                aria-current={link.current ? "page" : undefined}
                onClick={closeMobile}
              >
                {link.label}
                <ArrowUpRight size={18} aria-hidden />
              </Link>
            ))}
          </div>
          <button
            type="button"
            className="mobile-menu-trigger"
            aria-expanded={mobileFindOpen}
            aria-controls="mobile-find-menu"
            data-current={findCurrent ? "" : undefined}
            onClick={() => setMobileFindOpen((value) => !value)}
          >
            Find us
            <ChevronDown size={20} aria-hidden />
          </button>
          <div id="mobile-find-menu" className="mobile-drop-menu" hidden={!mobileFindOpen}>
            {placeItems.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                aria-current={link.current ? "page" : undefined}
                onClick={(event) => goToPlace(event, link.href)}
              >
                {link.label}
                <ArrowUpRight size={18} aria-hidden />
              </Link>
            ))}
          </div>
          <Link
            href={storyLink.href}
            onClick={(event) => {
              scrollToHash(storyLink.href, pathname, event);
              closeMobile();
            }}
          >
            {storyLink.label}
            <ArrowUpRight size={20} aria-hidden />
          </Link>
          <Link href="/order" onClick={closeMobile}>
            Bring home a pie
            <ArrowUpRight size={20} aria-hidden />
          </Link>
        </nav>
      )}
    </header>
  );
}
