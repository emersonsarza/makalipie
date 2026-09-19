import type { Metadata } from "next";

import { MenuCatalog } from "@/components/sections/menu-catalog";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Menu",
  description:
    "Explore handmade sweet tarts, Friday-to-Sunday Buko pie, and Butter Chicken Curry. Find your favourites and check availability with Makalipie in Cebu.",
  openGraph: {
    title: "Menu · Makalipie",
    description:
      "Explore handmade sweet tarts, Friday-to-Sunday Buko pie, and Butter Chicken Curry. Find your favourites and check availability with Makalipie in Cebu.",
    url: "/menu",
    type: "website",
    locale: "en_PH",
    siteName: "Makalipie",
  },
  twitter: {
    card: "summary_large_image",
    title: "Menu · Makalipie",
    description:
      "Explore handmade sweet tarts, Friday-to-Sunday Buko pie, and Butter Chicken Curry. Find your favourites and check availability with Makalipie in Cebu.",
  },
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
