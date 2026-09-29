import type { Metadata } from "next";
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
      title="Privacy Policy"
      intro="This policy describes the personal information we collect through ordering and how we handle it."
    >
      <LegalSection n={1} title="Who we are">
        <p>
          Makalipie · makalipie@gmail.com · Unit C2, Cedar Place, 12 Dagohoy St, Barangay Apas, Cebu City, Philippines.
        </p>
      </LegalSection>
      <LegalSection n={2} title="What we collect">
        <p>When you place a request on our site, we may collect:</p>
        <ul>
          <li>Your name and contact details</li>
          <li>Your order items, fulfillment date, time slot, and notes</li>
          <li>Order number, status, and timestamps</li>
          <li>Payment preference you select on the form (not payment credentials)</li>
        </ul>
      </LegalSection>
      <LegalSection n={3} title="What we do not collect">
        <p>
          We do not collect your delivery street address on the website. We do not collect card numbers, GCash passwords, or other payment credentials on the site. Payment is arranged off-site in chat.
        </p>
      </LegalSection>
      <LegalSection n={4} title="Why we use it">
        <p>
          To receive and manage orders, plan baking and capacity, communicate about your request, and handle refunds or complaints when needed.
        </p>
      </LegalSection>
      <LegalSection n={5} title="Marketing">
        <p>We do not send promotional or “we miss you” messages based on your order data.</p>
      </LegalSection>
      <LegalSection n={6} title="Who can see your data">
        <p>Makalipie owners and authorized staff through our admin tools. Developers may access systems only as needed to operate and improve the service.</p>
      </LegalSection>
      <LegalSection n={7} title="Third parties">
        <p>
          We use hosting and infrastructure providers (including Firebase and our web host) to run the site. When you message us on Instagram, Meta’s terms apply to that conversation. If you book your own courier, we do not share your home address with them through this site beyond the public pickup location we show you.
        </p>
      </LegalSection>
      <LegalSection n={8} title="Retention">
        <LegalPending>We will publish how long we keep personal details after your pickup or drop, and when we anonymize them, once this is confirmed.</LegalPending>
      </LegalSection>
      <LegalSection n={9} title="Your rights">
        <p>
          You may ask us to delete or anonymize your personal information by messaging us on Instagram or emailing makalipie@gmail.com.
        </p>
      </LegalSection>
      <LegalSection n={10} title="Security">
        <p>
          We use reasonable technical measures such as HTTPS, access controls for staff, and secured admin access to protect order data.
        </p>
      </LegalSection>
      <LegalSection n={11} title="Governing law">
        <p>This policy is governed by the laws of the Philippines.</p>
      </LegalSection>
      <LegalSection n={12} title="Updates">
        <p>We may update this policy. The “last updated” date at the top of this page shows the current version.</p>
      </LegalSection>
    </LegalPage>
  );
}
