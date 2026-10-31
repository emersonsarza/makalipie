import type { Metadata } from "next";
import Link from "next/link";
import { ChatLinks } from "@/components/public-shop-provider";
import { LegalPage } from "@/components/legal-page";
import { LegalSection } from "@/components/legal-section";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What this website does with your information, and what stays in the Instagram or Messenger chat.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      policy="privacy"
      title="Privacy Policy"
      intro="This Privacy Policy explains what happens to the details in an order you send us, and how to contact us about them."
    >
      <LegalSection n={1} title="Who we are">
        <p>
          Makalipie is based at Unit C2, Cedar Place, 12 Dagohoy St, Barangay Apas, Cebu City, Philippines. For privacy inquiries, email <a href="mailto:makalipie@gmail.com">makalipie@gmail.com</a>.
        </p>
      </LegalSection>
      <LegalSection n={2} title="Information we collect">
        <p>
          This website does not receive or store your order. The form stays in your browser until you copy it and send it through <ChatLinks />. That message can include your name, phone number, delivery address, pies, date, time, and notes. Instagram or Messenger then holds the chat under its own terms.
        </p>
      </LegalSection>
      <LegalSection n={3} title="Payment credentials">
        <p>
          This website does not collect card numbers, GCash passwords, or account numbers. Payment details are sent in the chat, never on this website.
        </p>
      </LegalSection>
      <LegalSection n={4} title="How we use your information">
        <p>
          We use the chat to confirm the order, arrange pickup or delivery, and handle payment or a complaint. See our <Link href="/terms">Terms and Conditions</Link> and <Link href="/refund">Refund Policy</Link>.
        </p>
      </LegalSection>
      <LegalSection n={5} title="Marketing">
        <p>We don’t send marketing messages after an order.</p>
      </LegalSection>
      <LegalSection n={6} title="Access to your information">
        <p>The Makalipie team who reply to your chat can see that conversation.</p>
      </LegalSection>
      <LegalSection n={7} title="Third parties">
        <p>
          Conversations on Instagram and Messenger are subject to Meta’s terms and privacy policies. When we book a rider, we share the delivery address and the contact details the rider needs. If you book your own courier, the details you give that courier are handled under its own policies.
        </p>
      </LegalSection>
      <LegalSection n={8} title="Retention">
        <p>This website does not keep a copy of your order. The details live in the chat you send us.</p>
      </LegalSection>
      <LegalSection n={9} title="Your rights">
        <p>
          To ask about the details you sent, reply in the same chat or email <a href="mailto:makalipie@gmail.com">makalipie@gmail.com</a>.
        </p>
      </LegalSection>
      <LegalSection n={10} title="Security">
        <p>This website is served over HTTPS. We do not ask you to enter payment passwords or account numbers here.</p>
      </LegalSection>
      <LegalSection n={11} title="Governing law">
        <p>This policy is governed by the laws of the Philippines, with Cebu as the venue.</p>
      </LegalSection>
      <LegalSection n={12} title="Updates">
        <p>We may update this Privacy Policy. The “Last updated” date at the top of this page identifies the current version.</p>
      </LegalSection>
    </LegalPage>
  );
}
