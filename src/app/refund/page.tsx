import type { Metadata } from "next";
import Link from "next/link";
import { ChatLinks } from "@/components/public-shop-provider";
import { LegalPage } from "@/components/legal-page";
import { LegalSection } from "@/components/legal-section";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "When Makalipie offers a refund for an order confirmed in chat.",
  alternates: { canonical: "/refund" },
};

export default function RefundPage() {
  return (
    <LegalPage
      policy="refund"
      title="Refund Policy"
      intro="This Refund Policy explains refunds for an order we have confirmed in chat, and how to ask for help."
    >
      <LegalSection n={1} title="Refund eligibility">
        <p>If we reschedule your order or cannot fulfill it, you choose a new date or a full refund.</p>
        <p>
          You cannot cancel an order yourself. Big pre-orders cannot be cancelled. See our <Link href="/terms">Terms and Conditions</Link>.
        </p>
      </LegalSection>
      <LegalSection n={2} title="Courier issues and missed pickup">
        <p>
          There is no refund for a no-show. We try to reach you first. After that, the slot can go to the waitlist.
        </p>
        <p>
          There is no refund for courier trouble, a wrong address, or an unreachable customer. Those count as a no-show. We are not responsible once a third-party courier has the order.
        </p>
      </LegalSection>
      <LegalSection n={3} title="Part of an order">
        <p>If we got part of the order wrong before it left the bakery, message us. We will agree the next step in chat. A refund is not automatic.</p>
      </LegalSection>
      <LegalSection n={4} title="Refund method and processing">
        <p>
          An approved refund goes back by GCash or bank transfer. We arrange it in the same chat, and we send it as soon as we can.
        </p>
      </LegalSection>
      <LegalSection n={5} title="Schedule changes initiated by Makalipie">
        <p>If we must change your date, you choose a new date or a full refund.</p>
      </LegalSection>
      <LegalSection n={6} title="Requesting a refund">
        <p>
          To ask, message us through <ChatLinks /> or email <a href="mailto:makalipie@gmail.com">makalipie@gmail.com</a>. Describe the order and the date. Information you send is handled as described in our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </LegalSection>
      <LegalSection n={7} title="Updates">
        <p>We may update this Refund Policy. The “Last updated” date at the top of this page identifies the current version.</p>
      </LegalSection>
    </LegalPage>
  );
}
