import { themedMetadata, type SocialSearchParams } from "@/lib/social-metadata";
import type { Metadata } from "next";

import { redirect } from "next/navigation";

const pageMetadata: Metadata = {
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

export function generateMetadata({ searchParams }: { searchParams: Promise<SocialSearchParams> }) {
  return themedMetadata(pageMetadata, "order", searchParams);
}

export default async function PreorderPage({ searchParams }: { searchParams: Promise<SocialSearchParams> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["loc", "drop", "product", "size"]) {
    const value = params[key];
    if (typeof value === "string") query.set(key, value);
  }
  redirect(query.size ? `/order?${query}` : "/order");
}
