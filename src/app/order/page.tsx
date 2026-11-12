import { themedMetadata, type SocialSearchParams } from "@/lib/social-metadata";
import type { Metadata } from "next";

import { OrderScreen, type OrderSearch } from "@/components/order-screen";

const pageMetadata: Metadata = {
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

export function generateMetadata({ searchParams }: { searchParams: Promise<SocialSearchParams> }) {
  return themedMetadata(pageMetadata, "order", searchParams);
}

export default async function OrderPage({ searchParams }: { searchParams: Promise<OrderSearch> }) {
  return <OrderScreen searchParams={searchParams} />;
}
