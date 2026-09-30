import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalPending } from "@/components/legal-page";
import { LegalSection } from "@/components/legal-section";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Makalipie collects when you place a request and how we use it.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      policy="privacy"
      title="Privacy Policy"
      intro="This Privacy Policy explains what personal information Makalipie collects in connection with order requests, how we use it, and how to contact us about your information."
    >
      <LegalSection n={1} title="Who we are">
        <p>
          Makalipie is based at Unit C2, Cedar Place, 12 Dagohoy St, Barangay Apas, Cebu City, Philippines. For privacy inquiries, email <a href="mailto:makalipie@gmail.com">makalipie@gmail.com</a>.
        </p>
      </LegalSection>
      <LegalSection n={2} title="Information we collect">
        <p>When you submit an order request or communicate with us about an order, we may collect:</p>
        <ul>
          <li>Your name and contact details</li>
          <li>Your order items, fulfillment date, time slot, and notes</li>
          <li>Order number, status, and timestamps</li>
          <li>Your selected payment preference and payment records entered by authorized staff, such as amounts, payment methods, and payment or refund dates</li>
        </ul>
      </LegalSection>
      <LegalSection n={3} title="Payment credentials">
        <p>
          This website does not collect card numbers, GCash passwords, or other payment credentials. Payment is arranged separately, including through instructions shared on Instagram. Staff-recorded payment details are used to track payment and refund status; they are not payment credentials.
        </p>
      </LegalSection>
      <LegalSection n={4} title="How we use your information">
        <p>
          We use this information to receive and manage order requests, plan baking capacity, coordinate pickup, communicate with you, and handle payments, refunds, or complaints. See our <Link href="/terms">Terms and Conditions</Link> and <Link href="/refund">Refund Policy</Link> for details of the ordering process.
        </p>
      </LegalSection>
      <LegalSection n={5} title="Marketing">
        <p>We do not use your order information to send promotional or re-engagement messages.</p>
      </LegalSection>
      <LegalSection n={6} title="Access to your information">
        <p>Makalipie owners and authorized staff can access order information through our administration tools. Developers may access systems only as needed to operate and improve the service.</p>
      </LegalSection>
      <LegalSection n={7} title="Third parties">
        <p>
          We use hosting and infrastructure providers, including Firebase and our web host, to operate the website. Conversations on Instagram are subject to Meta’s applicable terms and privacy policies. We do not collect a drop-off address for new order requests. If you book your own courier, provide your destination details directly to that courier; information you provide to it is handled under its own policies.
        </p>
      </LegalSection>
      <LegalSection n={8} title="Retention">
        <LegalPending>The retention period for personal information and the timing of anonymization have not yet been finalized. This section will be updated when those arrangements are confirmed.</LegalPending>
      </LegalSection>
      <LegalSection n={9} title="Your rights">
        <p>
          You may request deletion or anonymization of your personal information by contacting us on Instagram or emailing <a href="mailto:makalipie@gmail.com">makalipie@gmail.com</a>.
        </p>
      </LegalSection>
      <LegalSection n={10} title="Security">
        <p>
          We use reasonable technical measures to protect order information, including HTTPS, staff access controls, and authenticated administration tools.
        </p>
      </LegalSection>
      <LegalSection n={11} title="Governing law">
        <p>This policy is governed by the laws of the Philippines.</p>
      </LegalSection>
      <LegalSection n={12} title="Updates">
        <p>We may update this Privacy Policy. The “Last updated” date at the top of this page identifies the current version.</p>
      </LegalSection>
    </LegalPage>
  );
}
