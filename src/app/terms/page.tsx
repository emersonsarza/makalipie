import { ChatLinks } from "@/components/public-shop-provider";
import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { LegalSection } from "@/components/legal-section";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description: "How to send a Makalipie order from this website, and how confirmation, payment, pickup, and changes work.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      policy="terms"
      title="Terms and Conditions"
      intro="These Terms and Conditions explain how to send an order from this website, and how confirmation, payment, pickup, delivery, and changes work after we reply in chat."
    >
      <LegalSection n={1} title="About Makalipie">
        <p>
          Makalipie is a bakery based in Cebu, Philippines. Our registered address is Unit C2, Cedar Place, 12 Dagohoy St, Barangay Apas, Cebu City, Philippines. For inquiries, email <a href="mailto:makalipie@gmail.com">makalipie@gmail.com</a>.
        </p>
      </LegalSection>
      <LegalSection n={2} title="Sending an order">
        <p>
          Fill in the <Link href="/order">order form</Link>, copy it, and send it to us through <ChatLinks />. This website does not save the order. Copying the message does not reserve the pies.
        </p>
      </LegalSection>
      <LegalSection n={3} title="Confirmation">
        <p>
          Sending the copied order does not confirm it. The order is final only when our team confirms it on Instagram or Messenger.
        </p>
      </LegalSection>
      <LegalSection n={4} title="Availability">
        <p>
          The dates on the form are preferences. We confirm what we can bake when we reply. Messages sent outside business hours are read the next morning.
        </p>
      </LegalSection>
      <LegalSection n={5} title="Payment">
        <p>
          We accept GCash and bank transfer. Payment details are sent in the chat and are never shown on this website. This website does not take payment. Only big orders must be paid in full before we start baking. Other orders can pay later. We will say which applies in chat. Official receipts are available upon request. Check that the amount and the account match the instructions we send before you pay.
        </p>
      </LegalSection>
      <LegalSection n={6} title="Pickup and delivery">
        <p>
          Manila is pickup only. Cebu can be pickup or delivery. We book the rider for delivery. You pay the delivery fee with your order or directly to the driver. A rider you send yourself counts as pickup. The pickup address is the one shown on the order form.
        </p>
      </LegalSection>
      <LegalSection n={7} title="Courier responsibility">
        <p>
          Once a third-party courier has the order, we are not responsible for a wrong address, an unreachable customer, or courier trouble. Those count as a no-show. Please refer to our <Link href="/refund">Refund Policy</Link>.
        </p>
      </LegalSection>
      <LegalSection n={8} title="Changes">
        <p>
          You cannot cancel an order yourself. Change requests are handled case by case in chat. You can ask to change the order or the pickup time until we confirm it, if we allow that change. Big pre-orders cannot be cancelled and must be paid in full before we start baking. Refund eligibility is described in our <Link href="/refund">Refund Policy</Link>.
        </p>
      </LegalSection>
      <LegalSection n={9} title="If we need to reschedule">
        <p>
          If we cannot fulfill your order or must move the date, you choose a new date or a full refund.
        </p>
      </LegalSection>
      <LegalSection n={10} title="No-shows">
        <p>
          There is no refund for a no-show. We try to reach you first. After that, the slot can go to the waitlist.
        </p>
      </LegalSection>
      <LegalSection n={11} title="Products and photos">
        <p>Product photos are accurate.</p>
      </LegalSection>
      <LegalSection n={12} title="Allergens">
        <p>
          Our kitchen also handles nuts and gluten, so cross-contact is possible. Allergens for a specific pie stay on the menu and the order form.
        </p>
      </LegalSection>
      <LegalSection n={13} title="Custom toppers">
        <p>Available extras are shown at checkout, with their prices, preparation time, and message requirements.</p>
      </LegalSection>
      <LegalSection n={14} title="Complaints">
        <p>For questions or complaints, contact us through <ChatLinks /> or email <a href="mailto:makalipie@gmail.com">makalipie@gmail.com</a>. Tell us what you ordered and the pickup date.</p>
      </LegalSection>
      <LegalSection n={15} title="Governing law">
        <p>These terms are governed by the laws of the Philippines, with Cebu as the venue.</p>
      </LegalSection>
      <LegalSection n={16} title="Changes to these terms">
        <p>We may update these Terms and Conditions. The “Last updated” date at the top of this page identifies the current version.</p>
      </LegalSection>
    </LegalPage>
  );
}
