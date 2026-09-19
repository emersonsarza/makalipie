import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { getSiteUrl, site } from "@/lib/site";

import "./globals.css";

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

export const metadata: Metadata = {
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
    type: "website",
    locale: "en_PH",
    url: siteUrl,
    siteName: site.name,
    title: "Makalipie | Handcrafted Tarts & Pies in Cebu",
    description: site.description,
  },
  twitter: {
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${garet.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
        {children}
      </body>
    </html>
  );
}
