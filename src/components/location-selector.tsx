"use client";
import { useRef, useState } from "react";
import { ArrowUpRight, CalendarDays, ChevronDown, MapPin } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePublicShop } from "@/components/public-shop-provider";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { locationAnchor } from "@/lib/popups/locations";

export function LocationSelector({ onNavigate }: { onNavigate?: () => void }) {
  const shop = usePublicShop();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navigating = useRef(false);
  const groups = [
    { title: "Branch", items: (shop.branches ?? []).filter(branch => branch.visible && branch.id === "cebu"), icon: MapPin },
    { title: "Popups", items: shop.locations?.upcoming ?? [], icon: CalendarDays },
    { title: "Recent popups", items: shop.locations?.recent ?? [], icon: CalendarDays },
  ];
  return <Popover open={open} onOpenChange={next => { if (next) navigating.current = false; setOpen(next); }}>
    <PopoverTrigger className="location-trigger" aria-label="Locations: find a branch or popup">
      <MapPin size={17} strokeWidth={1.6} aria-hidden />
      <span>Locations</span><ChevronDown size={13} aria-hidden />
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={12} className="location-menu" aria-label="Locations" finalFocus={() => !navigating.current}>
      <PopoverTitle className="sr-only">Find a branch or popup</PopoverTitle>
      {groups.filter(group => group.items.length).map(({ title, items, icon: Icon }) => <section className="location-menu-group" key={title} aria-label={title}>
        <p className="location-menu-label">{title}</p>
        {items.map(item => {
          const anchor = locationAnchor(item.id);
          return <Link key={item.id} href={`/#${anchor}`} onClick={event => {
            navigating.current = true;
            setOpen(false);
            onNavigate?.();
            if (pathname === "/") {
              event.preventDefault();
              if (window.location.hash !== `#${anchor}`) window.history.pushState(null, "", `/#${anchor}`);
              requestAnimationFrame(() => {
                const target = document.getElementById(anchor);
                target?.focus({ preventScroll: true });
                target?.scrollIntoView({ behavior: "instant", block: "start" });
              });
            }
          }}><Icon size={16} strokeWidth={1.5} aria-hidden /><span>{item.name}</span><ArrowUpRight size={15} aria-hidden /></Link>;
        })}
      </section>)}
    </PopoverContent>
  </Popover>;
}
