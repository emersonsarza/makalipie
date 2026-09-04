import type { Metadata } from "next";

import { OrderForm } from "@/components/order-form";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Order",
  description:
    "Fill out the Makalipie order form, copy your summary, and send it through our Instagram inbox for confirmation.",
  alternates: {
    canonical: "/order",
  },
};

export default function OrderPage() {
  return (
    <SiteShell>
      <OrderForm />
    </SiteShell>
  );
}
