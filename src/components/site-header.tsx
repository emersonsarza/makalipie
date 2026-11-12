"use client";

import { usePublicShop } from "@/components/public-shop-provider";
import { dropEventAnchor, locationAnchor } from "@/lib/popups/locations";
import { ArrowUpRight, ChevronDown, Menu, Minus, Plus, X } from "lucide-react";
import { BrandSeal } from "@/components/brand-seal";
import { ThemeLink as Link } from "@/components/site-theme";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type MouseEvent, type RefObject, type SetStateAction } from "react";

const storyLink = { href: "/#story", label: "Our story" };

const pieLinks = [
  { href: "/menu", label: "4-inch pies", view: "menu" as const },
  { href: "/menu?view=preorders", label: "Pre-orders", view: "preorders" as const },
];

type NavLink = { key: string; href: string; label: string; current?: boolean; group?: "Locations" | "Upcoming events"; city?: string };

function scrollToHash(href: string, pathname: string, event: MouseEvent) {
  const hash = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";
  if (!hash || pathname !== "/") return;

  if (window.location.hash === `#${hash}`) {
    event.preventDefault();
    document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
  }
}

function NavLinks({ links, iconSize, scroll, onNavigate }: {
  links: NavLink[]; iconSize: number; scroll?: boolean;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  return links.map((link, index) => <div key={link.key}>
    {link.group && link.group !== links[index - 1]?.group && <p className="find-nav-group">{link.group}</p>}
    {link.city && link.city !== links[index - 1]?.city && <p className="find-nav-city">{link.city}</p>}
    <Link href={link.href} scroll={scroll} aria-current={link.current ? "page" : undefined} onClick={event => onNavigate?.(event, link.href)}>
      <span>{link.label}</span><ArrowUpRight size={iconSize} aria-hidden />
    </Link>
  </div>);
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
  underline = true,
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
  underline?: boolean;
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
        data-underline={underline ? undefined : "false"}
        onClick={() => setMenu(menu)}
      >
        {label} <ChevronDown size={14} aria-hidden />
      </button>
      <div id={id} className="nav-drop-menu" hidden={!open}>
        <NavLinks links={links} iconSize={15} scroll={scroll} onNavigate={onNavigate} />
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
  const [placeSelection, setPlaceSelection] = useState(0);
  const pathname = usePathname();
  const toggle = useRef<HTMLButtonElement>(null);
  const mobileNav = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const menu = mobileNav.current;
    const header = menu?.parentElement;
    if (!menu || !header) return;
    const viewport = window.visualViewport;
    const syncHeight = () => {
      const bottom = header.getBoundingClientRect().bottom;
      menu.style.setProperty("--mobile-menu-height", `${Math.max(0, (viewport?.height ?? window.innerHeight) - bottom)}px`);
    };
    syncHeight();
    window.addEventListener("resize", syncHeight);
    window.addEventListener("scroll", syncHeight, { passive: true });
    viewport?.addEventListener("resize", syncHeight);
    return () => {
      window.removeEventListener("resize", syncHeight);
      window.removeEventListener("scroll", syncHeight);
      viewport?.removeEventListener("resize", syncHeight);
    };
  }, [open]);
  const piesTrigger = useRef<HTMLButtonElement>(null);
  const findTrigger = useRef<HTMLButtonElement>(null);
  const events = [
    ...(shop.locations?.upcoming ?? []).map(popup => ({
      key: locationAnchor(popup.id), label: popup.name, date: popup.startDate, open: false,
      city: popup.city || (/\bCebu\b/i.test(popup.address) ? "Cebu" : "Other locations"),
    })),
    ...(shop.upcomingDrops ?? []).map(drop => ({
      key: dropEventAnchor(drop.id), label: drop.name, date: drop.nextDate, open: drop.ordering === "open", city: drop.city,
    })),
  ].sort((left, right) => Number(right.city === "Cebu") - Number(left.city === "Cebu")
    || left.city.localeCompare(right.city) || Number(right.open) - Number(left.open)
    || left.date.localeCompare(right.date) || left.label.localeCompare(right.label));
  const places = [
    ...(shop.branches ?? []).filter(branch => branch.visible && branch.id === "cebu").map(branch => ({
      key: locationAnchor(branch.id), label: "Makalipie Cebu", group: "Locations" as const,
    })),
    ...events.map(event => ({ ...event, group: "Upcoming events" as const })),
  ];
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [pathname]);
  useEffect(() => {
    if (pathname !== "/" || (!hash.startsWith("#location-") && !hash.startsWith("#drop-event-"))) return;
    const card = document.getElementById(hash.slice(1));
    if (!card?.matches("article.location-anchor")) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const header = document.querySelector(".brand-header")?.getBoundingClientRect().height ?? 0;
    let clearHighlight: number | undefined;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.15)) return;
      observer.disconnect();
      card.focus({ preventScroll: true });
      card.setAttribute("data-find-highlight", "");
      clearHighlight = window.setTimeout(() => card.removeAttribute("data-find-highlight"), 1200);
    }, { rootMargin: `-${header}px 0px 0px`, threshold: 0.15 });
    observer.observe(card);
    card.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "start" });
    return () => {
      observer.disconnect();
      window.clearTimeout(clearHighlight);
      card.removeAttribute("data-find-highlight");
    };
  }, [hash, pathname, placeSelection]);
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
      toggle.current?.focus();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [desktopMenu, open]);
  const closeMobile = () => {
    setOpen(false);
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
    href: `/#${place.key}`,
    current: pathname === "/" && hash === `#${place.key}`,
  }));
  const findCurrent = placeItems.some((place) => place.current);
  const goToPlace = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    setDesktopMenu(null);
    closeMobile();
    if (pathname !== "/") return;
    event.preventDefault();
    const nextHash = href.slice(href.indexOf("#"));
    if (window.location.hash !== nextHash) window.history.pushState(null, "", nextHash);
    setHash(nextHash);
    setPlaceSelection(selection => selection + 1);
  };

  return (
    <header className="brand-header" onBlur={event => {
      if (open && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) closeMobile();
    }}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="brand-nav wrap">
        <Link href="/" className="brand-lockup" aria-label="Makalipie home" onClick={closeMobile}>
          <BrandSeal alt="" width={72} height={72} priority />
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
            scroll={false}
            onNavigate={goToPlace}
            underline={false}
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
              if (!open) {
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
      <button type="button" className="mobile-menu-backdrop" data-open={open} inert={!open}
        aria-label="Dismiss menu" tabIndex={-1} onClick={() => { closeMobile(); toggle.current?.focus(); }} />
      <nav ref={mobileNav} id="mobile-nav" className="mobile-menu" aria-label="Mobile" data-open={open} inert={!open}>
        <div className="mobile-menu-links">
          <Link href="/" aria-current={pathname === "/" ? "page" : undefined} onClick={closeMobile}>
            Home <ArrowUpRight size={20} aria-hidden />
          </Link>
          <Collapsible open={mobilePiesOpen} onOpenChange={setMobilePiesOpen}>
            <CollapsibleTrigger className="mobile-menu-trigger" data-current={piesCurrent ? "" : undefined}>
              Our pies {mobilePiesOpen ? <Minus size={20} aria-hidden /> : <Plus size={20} aria-hidden />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mobile-drop-menu">
              <div className="mobile-drop-links">
                {pieItems.map(link => <Link key={link.key} href={link.href} scroll={pieLinkScroll}
                  aria-current={link.current ? "page" : undefined} onClick={closeMobile}>
                  {link.label} <ArrowUpRight size={18} aria-hidden />
                </Link>)}
              </div>
            </CollapsibleContent>
          </Collapsible>
          <Collapsible open={mobileFindOpen} onOpenChange={setMobileFindOpen}>
            <CollapsibleTrigger className="mobile-menu-trigger" data-current={findCurrent ? "" : undefined}>
              Find us {mobileFindOpen ? <Minus size={20} aria-hidden /> : <Plus size={20} aria-hidden />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mobile-drop-menu">
              <div className="mobile-drop-links">
                <NavLinks links={placeItems} iconSize={18} scroll={false} onNavigate={goToPlace} />
              </div>
            </CollapsibleContent>
          </Collapsible>
          <Link href={storyLink.href} onClick={event => {
            scrollToHash(storyLink.href, pathname, event);
            closeMobile();
          }}>
            {storyLink.label} <ArrowUpRight size={20} aria-hidden />
          </Link>
        </div>
        <div className="mobile-menu-order">
          <Link className="brand-button" href="/order" onClick={closeMobile}>
            Bring home a pie <ArrowUpRight size={20} aria-hidden />
          </Link>
        </div>
      </nav>
    </header>
  );
}
