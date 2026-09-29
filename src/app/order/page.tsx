export const dynamic = "force-dynamic";
import type { Metadata } from "next";

import { OrderScreen } from "@/components/order-screen";

export const metadata: Metadata = {
  title: "Order Tarts & Pies in Cebu",
  description:
    "Build a box of Makalipie tarts and pies for Cebu pickup or delivery. Copy your order and send it on Instagram to confirm availability and payment.",
  openGraph: {
    title: "Order Tarts & Pies in Cebu · Makalipie",
    description:
      "Build a box of Makalipie tarts and pies for Cebu pickup or delivery. Copy your order and send it on Instagram to confirm availability and payment.",
    url: "/order",
    type: "website",
    locale: "en_PH",
    siteName: "Makalipie",
  },
  twitter: {
    card: "summary_large_image",
    title: "Order Tarts & Pies in Cebu · Makalipie",
    description:
      "Build a box of Makalipie tarts and pies for Cebu pickup or delivery. Copy your order and send it on Instagram to confirm availability and payment.",
  },
  alternates: {
    canonical: "/order",
  },
};

export default async function OrderPage({ searchParams }: { searchParams: Promise<{ branch?: string | string[] }> }) {
  return <OrderScreen mode="regular" searchParams={searchParams} />;
}
