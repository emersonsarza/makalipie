import type { Metadata, Viewport } from "next";
import { Geist_Mono, Nunito, Oswald, Satisfy } from "next/font/google";

import { getSiteUrl, site } from "@/lib/site";

import "./globals.css";

const sans = Nunito({
  variable: "--font-sans-face",
  subsets: ["latin"],
  display: "swap",
});

const display = Oswald({
  variable: "--font-display-face",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const script = Satisfy({
  variable: "--font-script-face",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = getSiteUrl();

export const viewport: Viewport = {
  themeColor: "#F4C430",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Makalipie — Where every bite tastes like home",
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
    title: "Makalipie — Where every bite tastes like home",
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Makalipie — Where every bite tastes like home",
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
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${script.variable} ${geistMono.variable} h-full antialiased`}
    >
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
