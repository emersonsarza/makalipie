import { themedMetadata, type SocialSearchParams } from "@/lib/social-metadata";
import type { Metadata } from "next";
import { ThemeLink as Link } from "@/components/site-theme";
import { ChatLinks } from "@/components/public-shop-provider";
import { SiteShell } from "@/components/site-shell";

const pageMetadata: Metadata = {
  title: "Order confirmation",
  description: "Makalipie confirms orders in Instagram or Messenger chat.",
  robots: { index: false, follow: false },
};

export function generateMetadata({ searchParams }: { searchParams: Promise<SocialSearchParams> }) {
  return themedMetadata(pageMetadata, "order", searchParams);
}

export default function OrderStatusPage() {
  return (
    <SiteShell showFooterCta={false}>
      <section className="wrap order-confirmation" aria-labelledby="confirmation-heading">
        <p className="eyebrow">MAKALIPIE</p>
        <h1 id="confirmation-heading">Orders are confirmed in chat</h1>
        <p>
          This page does not show an order status. Copy your order from the order form and send it through <ChatLinks />. The order is final only when we confirm it there.
        </p>
        <div className="confirmation-action">
          <Link href="/order" className="brand-button">Back to the order form</Link>
        </div>
      </section>
    </SiteShell>
  );
}
