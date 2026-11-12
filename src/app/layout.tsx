import { socialImageMetadata } from "@/lib/social-metadata";
import { readPublishedShop, readUpcomingDrops, storefrontRenderTime } from "@/lib/public/published-shop";
import { publicShopView } from "@/lib/public/storefront-view";
import { SiteThemeController } from "@/components/site-theme";
import { publicLocations } from "@/lib/popups/locations";
import { manilaDate } from "@/lib/catalog/rules";
import { staticBranchSettings, staticPopups, staticPublicShop } from "@/lib/public/static-shop";
import { PublicShopProvider } from "@/components/public-shop-provider";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { getSiteUrl, site } from "@/lib/site";

import "./globals.css";
import "./christmas.css";
import "./storefront-polish.css";

const garet = localFont({
  src: [
    {
      path: "../../public/fonts/Garet-Book.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/Garet-Heavy.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-garet",
  display: "swap",
});

const siteUrl = getSiteUrl();

export const viewport: Viewport = {
  themeColor: "#FAF9F6",
  width: "device-width",
  initialScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  const published = await readPublishedShop();
  const image = socialImageMetadata("home", published?.theme ?? "christmas");
  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: "Makalipie | Handcrafted Tarts & Pies in Cebu",
      template: "%s · Makalipie",
    },
    description: site.description,
    keywords: [
      "Makalipie",
      "Cebu pies",
      "Cebu tarts",
      "Buko pie Cebu",
      "Streetscape Banilad",
      "Cebuana bakery",
    ],
    authors: [{ name: "Makalipie" }],
    openGraph: {
      images: [image],
      type: "website",
      locale: "en_PH",
      url: siteUrl,
      siteName: site.name,
      title: "Makalipie | Handcrafted Tarts & Pies in Cebu",
      description: site.description,
    },
    twitter: {
      images: [image],
      card: "summary_large_image",
      title: "Makalipie | Handcrafted Tarts & Pies in Cebu",
      description: site.description,
    },
    alternates: {
      canonical: "/",
    },
    verification: { google: process.env.GOOGLE_SITE_VERIFICATION || undefined },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Bakery",
  "@id": `${siteUrl}/#bakery`,
  logo: `${siteUrl}/brand/seal.png`,
  hasMenu: `${siteUrl}/menu`,
  hasMap: site.mapsUrl,
  name: site.name,
  description: site.description,
  url: siteUrl,
  image: [
    `${siteUrl}/images/brand/hero.webp`,
    `${siteUrl}/images/brand/gift.webp`,
  ],
  sameAs: [site.instagramUrl],
  address: {
    "@type": "PostalAddress",
    streetAddress: `${site.kiosk.floor}, ${site.kiosk.place}`,
    addressLocality: site.kiosk.city,
    addressRegion: "Cebu",
    addressCountry: "PH",
  },
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ],
    opens: site.kiosk.opens,
    closes: site.kiosk.closes,
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [published, drops] = await Promise.all([readPublishedShop(), readUpcomingDrops()]);
  const shop = published ? publicShopView(published) : {
    ...staticPublicShop(),
    locations: publicLocations(staticPopups().listings, manilaDate(storefrontRenderTime())),
    branches: staticBranchSettings().branches.filter(branch => branch.visible),
  };
  const theme = published?.theme ?? "christmas";
  const publicJsonLd = { ...jsonLd, hasMap: shop.mapUrl, sameAs: [shop.links.instagram, shop.links.messenger].filter(Boolean), address: { "@type": "PostalAddress", streetAddress: shop.address, addressCountry: "PH" }, openingHoursSpecification: undefined, openingHours: shop.hoursLabel };
  return (
    <html suppressHydrationWarning lang="en" data-site-theme={theme} className={`${garet.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(publicJsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <SiteThemeController theme={theme}>
          <PublicShopProvider value={{ ...shop, upcomingDrops: drops }}>{children}</PublicShopProvider>
        </SiteThemeController>
      </body>
    </html>
  );
}
