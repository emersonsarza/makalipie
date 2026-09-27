import { readPublicMenu } from "@/lib/products/public";
export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site";

import { MenuCatalog } from "@/components/sections/menu-catalog";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Tarts & Pies Menu in Cebu",
  description:
    "Explore handmade sweet tarts, Friday-to-Sunday Buko pie, and Butter Chicken Curry. Find your favourites and check availability with Makalipie in Cebu.",
  openGraph: {
    title: "Tarts & Pies Menu in Cebu · Makalipie",
    description:
      "Explore handmade sweet tarts, Friday-to-Sunday Buko pie, and Butter Chicken Curry. Find your favourites and check availability with Makalipie in Cebu.",
    url: "/menu",
    type: "website",
    locale: "en_PH",
    siteName: "Makalipie",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tarts & Pies Menu in Cebu · Makalipie",
    description:
      "Explore handmade sweet tarts, Friday-to-Sunday Buko pie, and Butter Chicken Curry. Find your favourites and check availability with Makalipie in Cebu.",
  },
  alternates: {
    canonical: "/menu",
  },
};

export default async function MenuPage() {
  const { items, unavailable } = await readPublicMenu();
  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Menu",
            "@id": `${getSiteUrl()}/menu#menu`,
            name: "Makalipie Tarts & Pies Menu",
            url: `${getSiteUrl()}/menu`,
            inLanguage: "en-PH",
            hasMenuItem: items.map((item) => ({
              "@type": "MenuItem",
              name: item.name,
              description: item.description,
              offers: (item.variants ?? []).filter((v) => v.active && v.pricingMode === "fixed").map((v) => ({ "@type": "Offer", name: v.label, price: v.priceCentavos! / 100, priceCurrency: "PHP", url: `${getSiteUrl()}/order` })),
            })),
          }).replace(/</g, "\\u003c"),
        }}
      />
      <MenuCatalog items={items} unavailable={unavailable} />
    </SiteShell>
  );
}
