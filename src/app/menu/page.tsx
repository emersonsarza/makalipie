import type { Metadata } from "next";
import { getSiteUrl, menuItems } from "@/lib/site";

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

export default function MenuPage() {
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
            hasMenuItem: menuItems.map((item) => ({
              "@type": "MenuItem",
              name: item.name,
              description: item.description,
              ...(item.price != null
                ? {
                    offers: {
                      "@type": "Offer",
                      price: item.price,
                      priceCurrency: "PHP",
                      url: `${getSiteUrl()}/order`,
                    },
                  }
                : {}),
            })),
          }).replace(/</g, "\\u003c"),
        }}
      />
      <MenuCatalog />
    </SiteShell>
  );
}
