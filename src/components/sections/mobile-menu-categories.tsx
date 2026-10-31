"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { ArrowLeftRight, ArrowUpRight, List } from "lucide-react";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

type Category = { id: string; name: string };

export function MobileMenuCategories({ categories, regionRef, preorder }: { categories: Category[]; regionRef: RefObject<HTMLDivElement | null>; preorder: boolean }) {
  const [position, setPosition] = useState({ visible: false, current: "" });
  const [open, setOpen] = useState(false);
  const navigating = useRef(false);
  const categoryKey = JSON.stringify(categories);

  useEffect(() => {
    const region = regionRef.current;
    const page = region?.closest<HTMLElement>(".menu-catalog-page");
    const header = document.querySelector<HTMLElement>(".brand-header");
    if (!region || !page || !header) return;
    const media = window.matchMedia("(max-width: 767px)");
    const entries = JSON.parse(categoryKey) as Category[];
    let frame = 0;
    const update = () => {
      frame = 0;
      const headerRect = header.getBoundingClientRect();
      page.style.setProperty("--mobile-menu-offset", `${headerRect.height + 16}px`);
      const edge = headerRect.bottom + 16;
      const bounds = region.getBoundingClientRect();
      const visible = media.matches && entries.length > 0 && bounds.top <= edge && bounds.bottom > edge;
      let current = entries[0]?.id ?? "";
      for (const entry of entries) {
        const section = document.getElementById(`menu-${entry.id}`);
        if (section && section.getBoundingClientRect().top <= edge + 1) current = entry.id;
      }
      setPosition(previous => previous.visible === visible && previous.current === current ? previous : { visible, current });
      if (!visible) setOpen(false);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    observer.observe(region);
    observer.observe(header);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    media.addEventListener("change", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      media.removeEventListener("change", schedule);
      page.style.removeProperty("--mobile-menu-offset");
    };
  }, [categoryKey, regionRef]);

  if (!position.visible || !categories.length) return null;
  return <div className="mobile-category-control">
    <Popover open={open} onOpenChange={next => { if (next) navigating.current = false; setOpen(next); }}>
      <PopoverTrigger className="mobile-category-trigger"><List size={18} aria-hidden /><span>Categories</span></PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={10} className="mobile-category-popup" finalFocus={() => !navigating.current}>
        <Link className="mobile-category-switch" href={preorder ? "/menu" : "/menu?view=preorders"} scroll={false} onClick={() => { setOpen(false); }}>
          <span>{preorder ? "4-inch pies" : "Pre-orders"}</span><ArrowLeftRight size={16} aria-hidden />
        </Link>
        <PopoverTitle className="mobile-category-label">Jump to a category</PopoverTitle>
        <nav aria-label="Menu categories">{categories.map(category => <a key={category.id} href={`#menu-${category.id}`} aria-current={position.current === category.id ? "location" : undefined} onClick={event => {
          event.preventDefault();
          navigating.current = true;
          setOpen(false);
          const target = document.getElementById(`menu-${category.id}`);
          if (!target) return;
          const url = new URL(window.location.href);
          url.hash = `menu-${category.id}`;
          if (url.href !== window.location.href) window.history.pushState(null, "", url);
          requestAnimationFrame(() => {
            target.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
            target.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
          });
        }}><span>{category.name}</span><ArrowUpRight size={16} aria-hidden /></a>)}</nav>
      </PopoverContent>
    </Popover>
  </div>;
}
