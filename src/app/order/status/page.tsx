import type { Metadata } from "next";
import { OrderConfirmation } from "@/components/checkout/confirmation";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Order confirmation",
  robots: { index: false, follow: false },
};

export default function OrderStatusPage() {
  return <SiteShell showFooterCta={false}><OrderConfirmation /></SiteShell>;
}
