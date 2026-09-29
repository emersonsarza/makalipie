export const dynamic = "force-dynamic";
import type { Metadata } from "next";

import { OrderScreen } from "@/components/order-screen";

export const metadata: Metadata = {
  title: "Pre-order Tarts & Pies in Cebu",
  description:
    "Pre-order Makalipie tarts and pies that need preparation time. Pickup and delivery use the same request, and the earliest date follows the longest preparation.",
  openGraph: {
    title: "Pre-order Tarts & Pies in Cebu · Makalipie",
    description:
      "Pre-order Makalipie tarts and pies that need preparation time. Pickup and delivery use the same request, and the earliest date follows the longest preparation.",
    url: "/order/preorder",
    type: "website",
    locale: "en_PH",
    siteName: "Makalipie",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pre-order Tarts & Pies in Cebu · Makalipie",
    description:
      "Pre-order Makalipie tarts and pies that need preparation time. Pickup and delivery use the same request, and the earliest date follows the longest preparation.",
  },
  alternates: {
    canonical: "/order/preorder",
  },
};

export default async function PreorderPage({ searchParams }: { searchParams: Promise<{ branch?: string | string[] }> }) {
  return <OrderScreen mode="preorder" searchParams={searchParams} />;
}
