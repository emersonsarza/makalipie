export const dynamic = "force-dynamic";
import type { Metadata } from "next";

import { OrderScreen } from "@/components/order-screen";

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

export default async function PreorderPage({ searchParams }: { searchParams: Promise<{ branch?: string | string[] }> }) {
  return <OrderScreen mode="preorder" searchParams={searchParams} />;
}
