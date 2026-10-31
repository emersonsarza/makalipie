"use client";

import { usePublicShop } from "@/components/public-shop-provider";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { type MenuItem } from "@/lib/site";
import { variantOrderMode } from "@/lib/catalog/mode";
type Filter = "House favourites" | "Sweet" | "Savoury";
export function PieSelection({ items: menuItems }: { items: MenuItem[] }) {
  const shop = usePublicShop();
  const activeItems = menuItems.filter((item) =>
    item.variants?.some((v) => v.active),
  );
  const featured = [...new Set(shop.featuredProductIds ?? [])].flatMap((id) =>
    activeItems.filter((item) => item.slug === id),
  );
  const filters: Filter[] = [
    ...(featured.length ? ["House favourites" as const] : []),
    ...(activeItems.some((i) => i.kind === "sweet") ? ["Sweet" as const] : []),
    ...(activeItems.some((i) => i.kind === "savory")
      ? ["Savoury" as const]
      : []),
  ];
  const [chosenFilter, setFilter] = useState<Filter | null>(null);
  const filter =
    chosenFilter && filters.includes(chosenFilter) ? chosenFilter : filters[0];
  const items =
    filter === "House favourites"
      ? featured
      : activeItems.filter(
          (item) => item.kind === (filter === "Sweet" ? "sweet" : "savory"),
        );
  return (
    <section id="pies" className="pie-section wrap section-space">
      <div className="section-heading">
        <div>
          <p className="eyebrow">MEET YOUR NEXT FAVOURITE</p>
          <h2>Good things come in pies.</h2>
        </div>
        <Link href="/menu" className="text-link">
          Explore the menu <ArrowUpRight size={18} aria-hidden />
        </Link>
      </div>
      <div className="pie-filters" role="group" aria-label="Filter pies">
        {filters.map((label) => (
          <button
            key={label}
            aria-pressed={filter === label}
            onClick={() => setFilter(label)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="pie-grid" aria-live="polite">
        {!items.length && (
          <p>No products to show here right now. Please check back soon.</p>
        )}
        {items.map((item) => (
          <Link
            key={item.slug}
            href={`${item.variants?.some((v) => v.active && variantOrderMode(v) === "regular") ? "/menu" : "/menu?view=preorders"}#${item.slug}`}
            className="pie-tile"
          >
            <div className="pie-photo">
              <Image
                src={item.image.src}
                unoptimized
                alt={item.image.alt}
                fill
                sizes="(max-width: 600px) 46vw, (max-width: 900px) 45vw, 23vw"
              />
            </div>
            <div className="pie-name">
              <h3>{item.name}</h3>
            </div>
            <p>{item.blurb}</p>
          </Link>
        ))}
      </div>
      <div className="pie-note">
        <span>
          For a Tuesday treat. For the whole table. For someone you like.
        </span>
        <Link href="/order">
          Make it a box <ArrowRight size={17} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
