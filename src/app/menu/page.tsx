import type { Metadata } from "next";

import { MenuCatalog } from "@/components/sections/menu-catalog";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Menu",
  description:
    "Browse Makalipie tarts and pies — Keylime, Pecan, S’mores, Banoffee, Oreo, Buko, and Sunday savory — with prices and order links.",
  alternates: {
    canonical: "/menu",
  },
};

export default function MenuPage() {
  return (
    <SiteShell>
      <MenuCatalog />
    </SiteShell>
  );
}
