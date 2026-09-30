import type { Metadata } from "next";
import Link from "next/link";
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
      intro="These Terms and Conditions explain how Makalipie manages order requests, confirmation, payment, pickup, delivery, and cancellations."
    >
      <LegalSection n={1} title="About Makalipie">
        <p>
          Makalipie is a bakery based in Cebu, Philippines. Our registered address is Unit C2, Cedar Place, 12 Dagohoy St, Barangay Apas, Cebu City, Philippines. For inquiries, email <a href="mailto:makalipie@gmail.com">makalipie@gmail.com</a>.
        </p>
      </LegalSection>
      <LegalSection n={2} title="Placing an order request">
        <p>
          Select your items and submit an order request through our website. Your order page will display an order number and the status of your request. When contacting us on Instagram, include your order number so our team can assist with availability, payment, and pickup or delivery arrangements.
        </p>
      </LegalSection>
      <LegalSection n={3} title="Order confirmation">
        <p>
          Submitting an order request does not confirm your order. Our team must review and approve the request, including availability and, for delivery requests, the address and delivery fee. Your order page shows the current status. Payment and fulfillment arrangements are communicated separately, including through Instagram.
        </p>
      </LegalSection>
      <LegalSection n={4} title="Temporary holds and availability">
        <p>
          Order requests are subject to available baking capacity and are handled on a first-come, first-served basis. A submitted request may temporarily reserve capacity while awaiting review. Refer to the hold deadline shown on your order page. An unreviewed request may expire when that deadline passes.
        </p>
      </LegalSection>
      <LegalSection n={5} title="Payment">
        <p>
          The final order total must be confirmed and full payment verified by our team before preparation begins. We accept GCash and bank transfer. Payments are arranged separately; this website does not process payment transactions. You are responsible for checking that the payment amount and recipient account match the instructions provided by Makalipie before sending payment. Official receipts are available upon request.
        </p>
      </LegalSection>
      <LegalSection n={6} title="Pickup and delivery">
        <p>
          Pickup locations and available time slots are displayed on the website and your order page. If you request delivery, we collect your delivery address through the order form. Our team must confirm whether the address can be served and the applicable delivery fee before approving the delivery request. Submitting an address does not guarantee delivery. Any independently booked courier arrangements should be coordinated with our team.
        </p>
      </LegalSection>
      <LegalSection n={7} title="Courier responsibility">
        <p>
          If you independently book a courier, damage, delays, or mishandling after the order is handed over to that courier are outside our control. We recommend using an insulated bag during transport. Please refer to our <Link href="/refund">Refund Policy</Link> for information about refund eligibility.
        </p>
      </LegalSection>
      <LegalSection n={8} title="Cancellation">
        <p>
          You may cancel an order request before confirmation, after confirmation, or after payment, subject to any cancellation cutoff published for your scheduled pickup or delivery. Refund eligibility is described in our <Link href="/refund">Refund Policy</Link>.
        </p>
        <LegalPending>The cancellation cutoff has not yet been finalized. This policy will be updated when it is confirmed.</LegalPending>
      </LegalSection>
      <LegalSection n={9} title="Rescheduling">
        <p>
          To request a change to your pickup or delivery schedule, contact our team on Instagram. If Makalipie must change the scheduled date due to capacity constraints, an emergency, or weather conditions, you may choose a new date or a refund.
        </p>
      </LegalSection>
      <LegalSection n={10} title="No-shows and missed pickup">
        <p>
          If you miss your scheduled pickup window, we will attempt to contact you. If we are unable to reach you, your order may be offered to customers on the waiting list. The treatment of any payment in these circumstances remains pending, as noted in our <Link href="/refund">Refund Policy</Link>.
        </p>
      </LegalSection>
      <LegalSection n={11} title="Products and photos">
        <LegalPending>Guidance on how website product photographs represent the finished products has not yet been finalized. This section will be updated when confirmed.</LegalPending>
      </LegalSection>
      <LegalSection n={12} title="Allergens">
        <p>
          Where available, product-specific allergen information is provided on our menu and ordering pages.
        </p>
        <LegalPending>Any applicable information about shared-kitchen allergen cross-contact will be added once confirmed.</LegalPending>
      </LegalSection>
      <LegalSection n={13} title="Custom toppers">
        <p>Custom toppers are not offered for standard drop orders.</p>
      </LegalSection>
      <LegalSection n={14} title="Complaints">
        <p>For questions or complaints, contact us on Instagram or email <a href="mailto:makalipie@gmail.com">makalipie@gmail.com</a>. Include your order number, where applicable, and a description of your concern.</p>
      </LegalSection>
      <LegalSection n={15} title="Governing law">
        <p>These terms are governed by the laws of the Philippines.</p>
      </LegalSection>
      <LegalSection n={16} title="Changes">
        <p>We may update these Terms and Conditions. The “Last updated” date at the top of this page identifies the current version.</p>
      </LegalSection>
    </LegalPage>
  );
}
