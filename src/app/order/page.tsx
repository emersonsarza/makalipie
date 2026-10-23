export const dynamic = "force-dynamic";
import type { Metadata } from "next";

import { OrderScreen } from "@/components/order-screen";

export const metadata: Metadata = {
  title: "Order Tarts & Pies in Cebu",
  description:
    "Choose your branch and date, then order available Makalipie pies for pickup or delivery where offered. Confirm your order in chat; no payment is collected online.",
  openGraph: {
    title: "Order Tarts & Pies in Cebu · Makalipie",
    description:
      "Choose your branch and date, then order available Makalipie pies for pickup or delivery where offered. Confirm your order in chat; no payment is collected online.",
    url: "/order",
    type: "website",
    locale: "en_PH",
    siteName: "Makalipie",
  },
  twitter: {
    card: "summary_large_image",
    title: "Order Tarts & Pies in Cebu · Makalipie",
    description:
      "Choose your branch and date, then order available Makalipie pies for pickup or delivery where offered. Confirm your order in chat; no payment is collected online.",
  },
  alternates: {
    canonical: "/order",
  },
};

export default async function OrderPage({ searchParams }: { searchParams: Promise<{ branch?: string | string[] }> }) {
  return <OrderScreen mode="regular" searchParams={searchParams} />;
}
