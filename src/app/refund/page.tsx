import type { Metadata } from "next";
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
      intro="This policy explains when we return payment and how to ask for a refund."
    >
      <LegalSection n={1} title="When refunds apply">
        <p>Refunds may apply when:</p>
        <ul>
          <li>You cancel according to our Terms (subject to any published cutoff)</li>
          <li>We cannot fulfill your order or must cancel from our side</li>
          <li>There is a quality issue we caused (for example wrong or damaged product from the bakery)</li>
        </ul>
        <LegalPending>We will publish the cancellation cutoff here once it is confirmed.</LegalPending>
      </LegalSection>
      <LegalSection n={2} title="When refunds generally do not apply">
        <p>
          We generally do not refund problems that happen after you arrange your own courier (damage, delay, or mishandling in transit). If you miss pickup after we have tried to reach you, your order may move to the waitlist.
        </p>
        <LegalPending>We will clarify whether a paid amount is refunded or transferred when an order goes to the waitlist once our operations policy is confirmed.</LegalPending>
      </LegalSection>
      <LegalSection n={3} title="Partial refunds">
        <p>Partial refunds are possible when only part of an order is affected (for example one incorrect item).</p>
      </LegalSection>
      <LegalSection n={4} title="How refunds are paid">
        <p>
          Refunds are sent back through the same channel you paid (GCash or bank transfer), as agreed in Instagram. We process approved refunds as soon as we can.
        </p>
      </LegalSection>
      <LegalSection n={5} title="Bakery-initiated date change">
        <p>If we must move your pickup or drop date, you may choose a new date or a refund.</p>
      </LegalSection>
      <LegalSection n={6} title="How to request">
        <p>Message us on Instagram or email makalipie@gmail.com with your order number and what happened.</p>
      </LegalSection>
      <LegalSection n={7} title="Updates">
        <p>We may update this policy. The “last updated” date at the top of this page shows the current version.</p>
      </LegalSection>
    </LegalPage>
  );
}
