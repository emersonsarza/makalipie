import { readPublicMenu } from "@/lib/products/public";
export const dynamic = "force-dynamic";
import type { Metadata } from "next";

import { OrderForm } from "@/components/order-form";
import { SiteShell } from "@/components/site-shell";

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

export default async function OrderPage() {
  const { items, addons, unavailable } = await readPublicMenu();
  const orderable = items.filter((item) => item.variants?.some((v) => v.active));
  return (
    <SiteShell>
      {orderable.length ? (
        <OrderForm items={orderable} catalogAddons={addons} />
      ) : (
        <section className="wrap section-space">
          <h1>Our menu is being updated.</h1>
          <p>
            {unavailable
              ? "We couldn’t load the menu right now."
              : "There are no products available right now."}{" "}
            Please{" "}
            <a href="https://www.instagram.com/makalipie/">
              message us on Instagram
            </a>{" "}
            for help with your order.
          </p>
        </section>
      )}
    </SiteShell>
  );
}
