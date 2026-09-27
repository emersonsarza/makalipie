"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { itemPriceText, type MenuItem } from "@/lib/site";

const filters = ["House favourites", "Sweet", "Savoury"] as const;
export function PieSelection({ items: menuItems }: { items: MenuItem[] }) {
  const [filter, setFilter] =
    useState<(typeof filters)[number]>("House favourites");
  const items =
    filter === "House favourites"
      ? menuItems.slice(0, 4)
      : menuItems.filter(
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
        {!items.length && <p>No products to show here right now. Please check back soon.</p>}
        {items.map((item) => (
          <Link
            key={item.slug}
            href={`/menu#${item.slug}`}
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
              <ArrowUpRight size={20} aria-hidden />
            </div>
            <p>{item.blurb}</p>
            <span className="pie-price">
              {itemPriceText(item)}{" "}
              <span>{item.price != null && item.variants?.length === 1 ? `/ ${item.variants[0].label.toLowerCase()}` : ""}</span>
            </span>
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
