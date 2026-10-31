import { menuSizes } from "@/lib/catalog/menu-view";
import { customerSizeLabel } from "@/lib/catalog/size";
import { staticPublicMenu } from "@/lib/public/static-shop";
import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site";

import { MenuCatalog } from "@/components/sections/menu-catalog";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Tarts & Pies Menu in Cebu",
  description:
    "Browse Makalipie 4-inch pies and larger pre-order sizes. Choose your branch and date to check availability.",
  openGraph: {
    title: "Tarts & Pies Menu in Cebu · Makalipie",
    description:
      "Browse Makalipie 4-inch pies and larger pre-order sizes. Choose your branch and date to check availability.",
    url: "/menu",
    type: "website",
    locale: "en_PH",
    siteName: "Makalipie",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tarts & Pies Menu in Cebu · Makalipie",
    description:
      "Browse Makalipie 4-inch pies and larger pre-order sizes. Choose your branch and date to check availability.",
  },
  alternates: {
    canonical: "/menu",
  },
};

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const view = (await searchParams).view;
  const preorder = view === "preorders";
  const { items: allItems, unavailable, sections } = staticPublicMenu();
  const items = menuSizes(allItems, preorder);
  return (
    <SiteShell menuView={preorder ? "preorders" : "menu"}>
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
              offers: (item.variants ?? []).filter((v) => v.active && v.pricingMode === "fixed").map((v) => ({ "@type": "Offer", name: customerSizeLabel(v.label) ?? item.name, price: v.priceCentavos! / 100, priceCurrency: "PHP", url: `${getSiteUrl()}/order` })),
            })),
          }).replace(/</g, "\\u003c"),
        }}
      />
      <MenuCatalog preorder={preorder} items={items} sections={sections} unavailable={unavailable} />
    </SiteShell>
  );
}
