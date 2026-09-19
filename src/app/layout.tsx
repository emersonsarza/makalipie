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
    default: "Makalipie · Making people happy, one pie at a time",
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
    title: "Makalipie · Making people happy, one pie at a time",
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Makalipie · Making people happy, one pie at a time",
    description: site.description,
  },
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Bakery",
  name: site.name,
  description: site.description,
  url: siteUrl,
  image: `${siteUrl}/opengraph-image`,
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
