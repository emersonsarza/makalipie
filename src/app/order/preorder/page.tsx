import type { Metadata } from "next";

import { LegacyOrderRedirect } from "@/components/legacy-order-redirect";

export const metadata: Metadata = {
  title: "Pre-order Tarts & Pies in Cebu",
  description:
    "Choose your branch and date, then order available Makalipie pies for pickup or delivery where offered. Confirm your order in chat; no payment is collected online.",
  openGraph: {
    title: "Pre-order Tarts & Pies in Cebu · Makalipie",
    description:
      "Choose your branch and date, then order available Makalipie pies for pickup or delivery where offered. Confirm your order in chat; no payment is collected online.",
    url: "/order/preorder",
    type: "website",
    locale: "en_PH",
    siteName: "Makalipie",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pre-order Tarts & Pies in Cebu · Makalipie",
    description:
      "Choose your branch and date, then order available Makalipie pies for pickup or delivery where offered. Confirm your order in chat; no payment is collected online.",
  },
  alternates: {
    canonical: "/order",
  },
};

export default function PreorderPage() {
  return <LegacyOrderRedirect />;
}
