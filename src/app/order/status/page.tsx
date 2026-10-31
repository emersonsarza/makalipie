import type { Metadata } from "next";
import Link from "next/link";
import { ChatLinks } from "@/components/public-shop-provider";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Order confirmation",
  description: "Makalipie confirms orders in Instagram or Messenger chat.",
  robots: { index: false, follow: false },
};

export default function OrderStatusPage() {
  return (
    <SiteShell>
      <section className="wrap section-space">
        <p className="eyebrow">MAKALIPIE</p>
        <h1>Orders are confirmed in chat</h1>
        <p>
          This page does not show an order status. Copy your order from the order form and send it through <ChatLinks />. The order is final only when we confirm it there.
        </p>
        <p>
          <Link href="/order" className="brand-button">Back to the order form</Link>
        </p>
      </section>
    </SiteShell>
  );
}
