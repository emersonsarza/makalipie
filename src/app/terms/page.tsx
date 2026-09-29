import type { Metadata } from "next";
import { LegalPage, LegalPending } from "@/components/legal-page";
import { LegalSection } from "@/components/legal-section";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description: "How ordering, payment, pickup, and cancellations work at Makalipie.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      policy="terms"
      title="Terms and Conditions"
      intro="These terms explain how online requests work, what we ask of you, and what you can expect from Makalipie."
    >
      <LegalSection n={1} title="About Makalipie">
        <p>
          Makalipie is a Cebu-based bakery. You can reach us at makalipie@gmail.com. Our registered address is Unit C2, Cedar Place, 12 Dagohoy St, Barangay Apas, Cebu City, Philippines.
        </p>
      </LegalSection>
      <LegalSection n={2} title="How to order">
        <p>
          Choose your pies on our website and place your request. You will receive an order number on your order page. Message us on Instagram with that number so we can confirm availability, payment, and pickup details.
        </p>
      </LegalSection>
      <LegalSection n={3} title="When an order is confirmed">
        <p>
          A submitted request is not confirmed until our team approves it in Instagram. Until then, capacity may change and payment is not final. After confirmation, the pickup and payment steps we agree on in chat apply.
        </p>
      </LegalSection>
      <LegalSection n={4} title="Order hold and capacity">
        <p>
          Orders are first come, first served until daily capacity is reached. Submitting a request may hold your slot for a limited time while you message us on Instagram.
        </p>
        <LegalPending>We will publish the exact hold duration here once it is confirmed.</LegalPending>
      </LegalSection>
      <LegalSection n={5} title="Payment">
        <p>
          Full payment is due before your pickup or drop, as agreed in Instagram. We accept GCash or bank transfer. Payment does not happen on this website. Sending to the wrong amount or account is your responsibility. Official receipts are available on request.
        </p>
      </LegalSection>
      <LegalSection n={6} title="Pickup">
        <p>
          Pickup location and hours are shown on this site (including the order form and your order page). We do not collect a delivery address from you on the website. You arrange your own courier or pickup when we confirm your order.
        </p>
      </LegalSection>
      <LegalSection n={7} title="Courier responsibility">
        <p>
          Once your order leaves our care through a courier you booked, damage, delay, or mishandling by that courier is outside our control. We recommend an insulated bag for transport.
        </p>
      </LegalSection>
      <LegalSection n={8} title="Cancellation">
        <p>
          You may cancel before confirmation, after confirmation, and after payment, subject to any cutoff we publish for your pickup or drop date.
        </p>
        <LegalPending>We will publish the cancellation cutoff here once it is confirmed.</LegalPending>
      </LegalSection>
      <LegalSection n={9} title="Rescheduling">
        <p>
          If you need to move pickup, arrange it with us in Instagram. If we must change a date because of capacity, emergency, or weather, you may choose a new date or a refund.
        </p>
      </LegalSection>
      <LegalSection n={10} title="No-shows and missed pickup">
        <p>
          If you miss your pickup window, we will try to reach you. If we cannot reach you, your order may be offered to the waitlist.
        </p>
      </LegalSection>
      <LegalSection n={11} title="Products and photos">
        <LegalPending>We will publish how product photos on the site relate to the baked item once this is confirmed.</LegalPending>
      </LegalSection>
      <LegalSection n={12} title="Allergens">
        <p>
          Allergen information is listed per product on our menu and ordering pages where available.
        </p>
        <LegalPending>We will add a shared-kitchen cross-contact note here if it applies.</LegalPending>
      </LegalSection>
      <LegalSection n={13} title="Custom toppers">
        <p>Custom toppers are not offered for standard drop orders.</p>
      </LegalSection>
      <LegalSection n={14} title="Complaints">
        <p>Reach us on Instagram or at makalipie@gmail.com so we can look into your concern.</p>
      </LegalSection>
      <LegalSection n={15} title="Governing law">
        <p>These terms are governed by the laws of the Philippines.</p>
      </LegalSection>
      <LegalSection n={16} title="Changes">
        <p>We may update these terms. The “last updated” date at the top of this page shows the current version.</p>
      </LegalSection>
    </LegalPage>
  );
}
