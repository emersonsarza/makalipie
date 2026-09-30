import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalPending } from "@/components/legal-page";
import { LegalSection } from "@/components/legal-section";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "When Makalipie offers refunds and how they are processed.",
  alternates: { canonical: "/refund" },
};

export default function RefundPage() {
  return (
    <LegalPage
      policy="refund"
      title="Refund Policy"
      intro="This Refund Policy explains when a refund may be available, how approved refunds are processed, and how to request assistance with your order."
    >
      <LegalSection n={1} title="Refund eligibility">
        <p>Refunds may apply when:</p>
        <ul>
          <li>You cancel in accordance with our <Link href="/terms">Terms and Conditions</Link>, subject to any published cancellation cutoff</li>
          <li>Makalipie is unable to fulfill your order or cancels it</li>
          <li>An issue caused by the bakery affects your order, such as an incorrect item or a product damaged before handover</li>
        </ul>
        <LegalPending>The cancellation cutoff has not yet been finalized. This policy will be updated when it is confirmed.</LegalPending>
      </LegalSection>
      <LegalSection n={2} title="Courier issues and missed pickup">
        <p>
          Refunds are generally not available for damage, delays, or mishandling by an independently booked courier after the order has been handed over. If you miss your scheduled pickup window and we are unable to reach you, your order may be offered to customers on the waiting list.
        </p>
        <LegalPending>The treatment of payments when an uncollected order is offered to the waiting list has not yet been finalized. We will clarify whether payment is refunded or transferred once the policy is confirmed.</LegalPending>
      </LegalSection>
      <LegalSection n={3} title="Partial refunds">
        <p>A partial refund may be available when an issue affects only part of an order, such as one incorrect item.</p>
      </LegalSection>
      <LegalSection n={4} title="Refund method and processing">
        <p>
          Approved refunds are returned through the original payment channel, GCash or bank transfer, with the arrangements confirmed on Instagram. We process approved refunds as soon as possible.
        </p>
      </LegalSection>
      <LegalSection n={5} title="Schedule changes initiated by Makalipie">
        <p>If Makalipie must change your scheduled pickup or delivery date, you may choose a new date or a refund.</p>
      </LegalSection>
      <LegalSection n={6} title="Requesting a refund">
        <p>To request a refund, contact us on Instagram or email <a href="mailto:makalipie@gmail.com">makalipie@gmail.com</a>. Provide your order number and a description of the issue so our team can review your request. Information provided with your request is handled as described in our <Link href="/privacy">Privacy Policy</Link>.</p>
      </LegalSection>
      <LegalSection n={7} title="Updates">
        <p>We may update this Refund Policy. The “Last updated” date at the top of this page identifies the current version.</p>
      </LegalSection>
    </LegalPage>
  );
}
