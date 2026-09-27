# Makalipie — Admin Data Model & Build Plan

Implementation specification for the existing Next.js Makalipie bakery site. This document describes intended behavior; it does not imply that the backend or admin features already exist.

## 1. Product and scope

Makalipie (@makalipie) is a Cebuana artisan tart and pie bakery at the 2nd Floor, Streetscape, Banilad. Kiosk hours are daily 10AM–8PM. Preserve approved content in `src/lib/site.ts`; resolve conflicting marketing copy with the client before replacing it.

- Frontend: existing Next.js app, hosted on Vercel.
- Backend: Firebase Auth, Firestore, and Storage.
- Public domain: `makalipie.com`; admin domain: `admin.makalipie.com`.
- Purchase only the main domain; configure the admin subdomain in DNS.
- Cloudflare may manage DNS. Start with DNS-only records pointing to Vercel, using Vercel-managed TLS. Add a proxy only for a documented requirement and after testing Vercel compatibility.

The website collects order requests. Customers confirm details and arrange payment in chat. A submitted request is not a confirmed order or permission to pay.

Do not build payment capture, payment gateways, automated customer DMs, customer accounts, loyalty, promo codes, or a conventional checkout. Copyable chat messages and messaging links are in scope.

## 2. Preserve the existing design

Retain the existing bakery palette and interface character:

| Token | Color |
| --- | --- |
| Crust Gold | `#F4C430` |
| Cream | `#FFF8F0` |
| Charcoal | `#2C2A28` |
| Butter | `#F5E6C8` |
| Berry Accent | `#E85D4C` |

Repository: `emersonsarza/makalipie`. Local project: `/Users/emerson/makalipie`. Historical draft domain: `https://makalipie.by1002.com/`.

## 3. Order request flow and trusted creation

1. Customer selects available products, variants, quantities, add-ons, and fulfillment details.
2. Public form submits to a trusted server endpoint. Browsers cannot create Firestore order documents directly.
3. Server validates input and current ordering configuration, loads authoritative catalog data, calculates known prices, and checks availability and capacity.
4. One Firestore transaction creates the order, allocates its display number, reserves capacity, and records a durable alert event. It also records the submission's idempotency key.
5. Customer sees the order number, reservation deadline, and explicit “Request received — awaiting confirmation” wording.
6. Customer copies a message containing the order number and opens their selected chat app. Provide a manual copy fallback when clipboard or deep links fail.
7. Staff confirms availability and the final quote in chat, records confirmation in admin, and provides payment instructions. Payment remains outside the website.

### Server authority

The client submits identifiers, selections, and customer details—not authoritative prices, totals, statuses, timestamps, or order numbers. Server code must:

- Validate allowed fields, types, lengths, quantities, fulfillment requirements, and add-on compatibility.
- Reject inactive, unavailable, or incompatible products and variants.
- Calculate money in integer centavos with currency `PHP`.
- Recheck current configuration and capacity when committing; form availability is advisory.
- Enforce maintenance, closures, lead times, and cutoff rules.
- Apply rate limits and App Check verification for public submissions; neither replaces business validation.
- Keep customer details out of logs and error responses.

Use an unguessable order document ID plus a transactional display number such as `MK-1042`. Display numbers are references, not authentication credentials. Do not offer public order lookup by sequential number.

### Duplicate and uncertain submissions

Generate a random idempotency key for each logical submission and reuse it for retries. Store a normalized payload hash alongside the key and resulting order reference. The same key and payload return the original safe receipt; a changed payload with the same key is rejected. A retry must not allocate a second number, reserve capacity again, or duplicate alerts.

If the response is lost after a successful commit, retry with the same key. Show success only after confirmed persistence. Do not return customer details or internal fields from receipt recovery. Retain the idempotency record for at least the order's lifetime; retain a minimal tombstone if customer details are subsequently removed.

## 4. Reservation, availability, and kitchen capacity

### Initial reservation policy

New requests temporarily reserve capacity until 8PM on the next calendar day in `Asia/Manila`, capped at the fulfillment slot start. Requests submitted outside kiosk hours follow the same next-day deadline. This is the initial operating policy and must be visible to staff and customers; change it only through an explicit policy update.

- `requested`: temporary reservation with `reservationExpiresAt`.
- `confirmed`, `preparing`, `ready`: committed reservation, regardless of payment method.
- `completed`: remains counted against the fulfilled day's capacity; completion must not reopen that day's production allowance.
- `cancelled` or `expired`: reservation released exactly once.

A scheduled server worker expires overdue requests. Before rejecting a submission as full, the server reconciles expired holds for the affected date/slot. Do not rely on eventual document deletion to release capacity. Late confirmation of an expired request must recheck availability and reacquire capacity atomically.

Cash upon pickup/delivery is supported. Confirmation commits capacity without requiring advance payment. Staff may cancel a confirmed order according to the bakery's agreed policy.

### Capacity units

Enforce both daily order count and daily item count. Slot order/item limits are optional. Count item quantities, not add-ons, toward the initial item limit. Product-specific production weights can be added later if real operations require them.

Store per-date and per-slot counters and reservation records. All creation, cancellation, expiration, reactivation, quantity changes, and rescheduling must update the order and affected counters in one transaction. Reject rescheduling if the new date/slot cannot accommodate the order; preserve the original reservation on failure. Use stable reservation IDs so retries cannot release capacity twice.

Do not lower configured capacity below current usage without showing the conflict. Existing reservations remain valid; further requests stay closed until capacity is available.

### Time rules

- Business timezone: `Asia/Manila`.
- Fulfillment dates: local `YYYY-MM-DD`; event timestamps: UTC Firestore timestamps.
- Lead days are calendar days in the business timezone, not rolling 24-hour periods.
- Initial daily order cutoff is 8PM. At or after cutoff, use the following local date as the lead-time calculation base.
- Required lead time is the maximum of the configured default, selected variants, and selected add-ons.
- Never permit a slot that has already started.
- Apply business blackout dates and each product's recurring weekdays/date exceptions to fulfillment dates.
- Store schedule windows as start-inclusive, end-exclusive instants. Convert date-only seasonal windows to local midnight boundaries explicitly.

## 5. Order and payment lifecycle

Track fulfillment progress separately from payment:

| Field | Values |
| --- | --- |
| `status` | `requested`, `confirmed`, `preparing`, `ready`, `completed`, `cancelled`, `expired` |
| `paymentStatus` | `unpaid`, `partially_paid`, `paid`, `refunded` |
| `quoteStatus` | `pending`, `finalized` |

Normal progress: requested → confirmed → preparing → ready → completed. Staff may skip intermediate preparation states when appropriate, with an audit event. Confirmation requires a finalized quote. Cancellation is allowed before completion. Expiration applies only to temporary requests. Reactivating cancelled/expired orders requires availability checks and a reason. Corrections to completed orders are owner-only and audited.

Record payment method, agreed total, amount received, and payment changes manually. Cancellation does not automatically mean a refund occurred. For a partial refund, preserve the actual net received amount and a refund event; `refunded` means fully refunded. Payment records are operational records, not payment processing.

Retain status and change history from the first release even if a dedicated history screen comes later.

## 6. Catalog model

### Products: `products/{id}`

Fields: `slug`, `name`, `description`, `category`, `image { url, alt }`, `allergens[]`, `publicNotes`, `active`, `sortOrder`, `availableWeekdays[]`, `unavailableDates[]`, `allowedAddonIds[]`, `createdAt`, `updatedAt`.

Recurring availability preserves existing behavior such as Buko being available Friday–Sunday. Empty restrictions mean unrestricted availability; do not silently interpret missing restrictions as “unavailable.” Business closures always apply.

### Variants: `products/{id}/variants/{variantId}`

Fields: `label` (size or “Standard”), `pricingMode: fixed | quote_required`, `priceCentavos` (required only for fixed pricing), `minLeadDays`, `active`, `sortOrder`, `updatedAt`.

Every orderable product has at least one variant. Prices belong to product variants, not a globally priced size collection. Shared size labels may be presentation constants, but cannot determine product prices.

### Add-ons: `addons/{id}`

Fields: `name`, `priceCentavos`, `image`, `minLeadDays`, `allergens[]`, `active`, `sortOrder`, `scope: per_item | per_order`, `customization { enabled, label, required, maxLength }`.

Preserve the current note card message. Per-item add-ons attach to a line and multiply by that line's quantity; per-order add-ons are charged once per order. Only allow compatible selections. If per-order compatibility is restricted, at least one selected product must allow the add-on. Store customization text in the order snapshot.

### Specials: `specials/{id}`

Fields: `title`, `description`, `image`, `productId`, `startAt`, `endAt`, `active`, `sortOrder`.

Specials promote catalog products; their price comes from variants. Do not create a second conflicting price source. Standalone marketing specials without a product link cannot be selected as order items.

### Quote-required products

Preserve “DM for price” as `quote_required`, never as a zero price. Show known item subtotal separately and clearly state that the final amount is pending. Unknown delivery fees also keep the total pending. Staff records and finalizes the agreed quote before confirming the order; later price changes require a reason and a revised quote communicated manually in chat.

## 7. Order data

`orders/{id}` contains:

- `orderNumber`, `status`, `paymentStatus`, `quoteStatus`, `currency: PHP`.
- `customerName`, `customerContact`, `preferredChatApp`.
- `fulfillmentType`, `fulfillmentDate`, `slotId`, slot label/time snapshot, and delivery address when required.
- `items[]`: product/variant IDs, name and size snapshots, quantity, pricing mode, unit price when known, add-on price/name/customization snapshots, and known line total.
- `orderAddons[]`: per-order add-on snapshots and customization.
- `knownSubtotalCentavos`, `deliveryFeeCentavos` (null if unknown), `finalTotalCentavos` (null until finalized), `amountReceivedCentavos`, `paymentMethod`.
- `customerNotes`, `adminNotes`.
- `reservationExpiresAt`, reservation reference, `createdAt`, `updatedAt`, and a version for concurrency checks.

Historical snapshots must survive catalog edits, deactivation, or archival. Distinguish the submitted request from subsequent audited amendments. Do not overwrite customer selections without retaining the change history.

Store append-only events in `orders/{id}/events/{eventId}`: event type, old/new values as appropriate, reason, actor UID or system identity, and server timestamp. Avoid duplicating unnecessary customer data in audit entries.

Allow staff to correct fulfillment details and selections through validated server operations; require a reason, recalculate affected quotes, and adjust capacity transactionally. Detect concurrent admin edits rather than silently overwriting them.

### Derived views

- Orders screen: fulfillment date, status, payment state, exact order number, and chat app filters; paginated results and operational counts. Overview links into these filtered results.
- Bake list: only confirmed, preparing, and ready orders for a fulfillment date. Aggregate by product, variant, and per-item add-on; show customization and relevant handling notes alongside orders. Show completed orders separately, excluded from remaining work.
- CSV: uses the same filters, role authorization, and explicit customer-data access policy. Escape spreadsheet formula-leading cells and log exports.

Declare required Firestore indexes with the implementation. These views are derived, not independent editable sources of truth.

### Overview — daily operations dashboard

Design `/admin` as the complete bakery dashboard, assuming the app is fully working and all order, quote, payment, fulfillment, kitchen, capacity, and historical sales data is available. This is the target product experience, independent of current implementation progress. It should answer: what needs attention, what are we baking, what is going out today, and how is the business doing? Default operational sections to today in `Asia/Manila`. Give today's orders and the attention list the most space; keep summary counts compact and actionable.

Show these areas in priority order:

| Area | Data and behavior |
| --- | --- |
| Today at a glance | Orders due today (`confirmed`, `preparing`, `ready`), item quantities still to prepare (`confirmed`, `preparing`), and orders ready for pickup/delivery (`ready`). Scope all three to today's fulfillment date. Link each count to its matching Orders or Kitchen view. |
| Needs attention | Open requests awaiting confirmation, active orders with quotes to finalize, requests with reservations nearing expiry, uncompleted orders past their fulfillment window, and outstanding balances on today's or past-due confirmed orders. Unpaid cash-on-pickup/delivery orders are labeled as collection due, not overdue before fulfillment. Show the actual expiry deadline and time remaining; initially treat holds expiring within two hours as nearing expiry. Include these across fulfillment dates, deduplicate orders with multiple reasons, and put overdue or nearest-deadline work first. Overdue requests must not appear as valid holds while expiry reconciliation is pending. |
| Today's orders | A short list of confirmed, preparing, and ready orders sorted by pickup/delivery time, with order number, customer, item summary, fulfillment type/time, fulfillment status, and separate payment status. Open order details from each row and provide a link to all orders for the date. Show completed orders separately from outstanding work. |
| Bake summary | Remaining quantities grouped by product and variant/size, using confirmed and preparing orders. Link to the full bake list for add-ons, customization, and handling notes. Ready orders remain visible in the full Kitchen view but do not count as still to prepare; requested, cancelled, expired, and completed orders never enter this summary. |
| Upcoming capacity | A seven-day view of committed order and item counts against configured limits, starting today, with tomorrow emphasized and valid temporary reservations shown separately. Show remaining capacity, full dates/slots, and scheduled closures. Keep completed orders counted in capacity usage according to section 4. Distinguish unavailable capacity configuration from zero usage. |
| Payments | Money received today, refunds recorded today, and outstanding balances with links to the underlying records. Show collection due at pickup/delivery separately from overdue balances; cancellation does not imply a refund. |
| Sales performance | A compact daily trend for the last 7 or 30 days, showing completed order value and completed order count with a comparison against the preceding equal-length period. Show average completed order value and bestsellers by completed item quantity, with product/size breakdowns. Keep this below the operational sections. |
| Recent activity | A short timestamped feed of new requests, confirmations, payment records, cancellations, and fulfillment updates, with the responsible staff member or system actor and links to order details. |

Layout: a compact top row for orders due, items still to prepare, ready orders, and money received; a main area for today's orders beside needs attention; then bake summary and capacity; followed by payments, sales performance, and recent activity. On mobile, preserve this priority in a single column. Keep full histories and detailed reports one click away instead of placing every record on Overview.

Use the same authoritative order, reservation, and availability logic as Orders and Kitchen so counts and destination filters agree. Label loading, empty, and failed states distinctly; unavailable data must not appear as a zero. Keep customer information subject to the same admin permissions as the underlying order views.

### Overview metric definitions

- Operational counts use fulfillment date, not request creation date. Today's orders due excludes completed orders; show completed-today progress separately. New requests in the attention list can be for any fulfillment date.
- Confirmed order value sums finalized totals for confirmed, preparing, ready, and completed orders by fulfillment date. Completed order value includes only completed orders by fulfillment date. Label these explicitly; submitted requests and pending quotes do not count as sales or zero-value sales.
- Money received and refunds use timestamped payment events within the selected period, independent of fulfillment date. Show receipts and refunds separately and label any net figure. Preserve amount deltas in payment/refund events so period totals can be reconstructed; a current order balance alone is insufficient.
- Outstanding balance is the positive difference between the finalized total and net amount received for confirmed, preparing, ready, or completed orders. Exclude cancelled/expired requests; expose any refund still needing action separately. Payment recording remains manual and payment processing remains outside the app.
- Average completed order value is completed order value divided by completed order count for the same period. Bestsellers use completed item quantities, excluding add-ons, with cancelled/expired/requested orders excluded. These are order-value metrics; refunds are reported separately.
- Compare equal-length local-date periods. For an in-progress period, compare against the same elapsed portion of the preceding period and label the comparison. Show an unavailable percentage when the comparison baseline is zero, rather than an invented growth rate.
- Operational sections default to today; sales charts have their own clearly labeled 7-day/30-day range. Display the last refresh time and refresh affected summaries after order, payment, or reservation changes.

The finished Overview includes all areas above. Do not replace it with a catalog setup screen or omit business insights because those services are not implemented yet. Development fixtures may represent the complete experience in local previews, but production figures must come from authoritative data. Catalog editing and completeness information belong in Catalog; surface an availability issue on Overview only when it affects current orders or capacity.

## 8. Settings and content overrides

### Override semantics

Each editable field supports explicit modes:

- `default`: use the approved coded default.
- `custom`: use the validated stored value.
- `hidden`: omit optional content or disable its feature.

Required content such as the business name cannot be hidden. An empty value is not a universal reset signal. The admin UI must offer separate “Reset to default” and “Hide/disable” actions where appropriate.

For optional external-order CTAs, render only an enabled, valid, nonempty resolved URL. Hiding Foodpanda must not restore its coded URL. Seasonal logos revert to the resolved default logo outside their window; retain a bundled fallback logo.

Missing content documents may use defaults. Database errors are a separate state. Approved cached/default marketing content may remain visible during an outage, but order creation must stop if current catalog, rules, or capacity cannot be verified. Missing operational configuration disables ordering until setup is complete.

Use one public content resolver across pages and metadata. Invalidate or refresh relevant caches after admin publication so storefront values and server validation do not silently diverge. If a price changed since the form loaded, return refreshed pricing for customer review before creating the request.

### Public settings

- `settings/brand`: business name, tagline, hero content/image, story, structured location/hours, timezone, social/chat links, delivery-platform links, phone, default and scheduled logos, SEO fields.
- `settings/banner`: enabled, message, optional link, style, start/end schedule.
- `settings/fulfillment`: pickup/delivery enabled, delivery service note, fixed fee or quote-required fee mode, active slots with local start/end times, default selection.
- `settings/ordersConfig`: ordering enabled, maintenance message, daily/slot order and item limits, maximum items per order, blackouts, default lead days, cutoff time, reservation policy, full-capacity message.
- `settings/payment`: enabled, approved payment instructions and methods. Public receipt says to wait for confirmation before paying; account details are shown only when explicitly enabled for public display.

Publish only storefront-safe configuration. Do not put private settings into otherwise public documents.

### Private settings and supporting content

- `privateSettings/alerts`: email recipients, enabled channels, notification events. Provider credentials stay in server secrets.
- `snippets/{id}`: title, body, active, sort order; placeholders include order number, customer name, and formatted total or “pending quote.” Manual copy only.

## 9. Admin access and security

Use Firebase Auth and `admins/{uid}` with `email`, `displayName`, `role: owner | staff`, and `active`.

- Owner: catalog/settings management, role management, order operations, export, and audited corrections.
- Staff: order dashboard, preparation list, validated order updates, payment recording, admin notes, and read/copy snippets. CSV requires an explicit export permission. Staff cannot edit snippets, catalog, brand, prices, or roles.
- Bootstrap the first owner through a trusted setup procedure. Users cannot assign themselves roles. Prevent removal of the final active owner.

Public clients may read explicitly published storefront data only. Deny direct public reads/writes of orders, events, reservations, counters, idempotency records, private settings, and admin records. Public order creation goes through the trusted endpoint.

Every admin server operation verifies identity, active membership, and permissions. Server SDKs bypass Firestore rules, so endpoint authorization is mandatory. Apply corresponding rules to any client-accessible admin reads/writes. Validate allowed fields and reject unexpected internal fields.

Storage: public read only for intended published assets; authorized image uploads with type and size checks. Keep unpublished/private uploads separate if supported. Never send service-account credentials to the browser.

Use secure session handling, appropriate CSRF/origin protection for cookie-authenticated mutations, login abuse protections, and owner account recovery procedures. Protect `/admin`, admin APIs, and alternate deployment URLs equally. A subdomain is not an authorization boundary.

## 10. Alerts and failure handling

A basic new-request alert is part of the first release. Start with one configured staff channel, such as email. Telegram staff alerts are optional and are not automated customer messages.

Write durable notification events with order creation. A worker delivers them with deduplication, bounded retries, and failure visibility. Alert failure does not undo an accepted order or tell the customer their submission failed. Show failed delivery in admin and designate an operator to monitor it. Alerts should link to the authenticated admin view and minimize customer data in message bodies.

Define an operational owner for dashboard monitoring during kiosk hours and a manual fallback for provider outages. Include reservation expiry in the staff view so requests are addressed before release.

## 11. Environments, hosting, and operations

- Development: isolated Firebase project, fake customers/orders, separate credentials. Never use real production orders as test data.
- Production: client-controlled Firebase and hosting accounts. Grant developers only required access; avoid routine broad Owner/Editor grants.
- Use local ignored environment files for development and managed hosting secrets for deployed environments. Document variable names without secret values.
- Configure business timezone explicitly and select compatible service regions before creating production resources.
- Route public and admin hostnames in one Next.js app; `/admin` is also valid locally. Verify host routing without weakening authentication.
- Read installed Next.js guides in `node_modules/next/dist/docs/` before implementation, as required by `AGENTS.md`.

Before launch, record named people for order monitoring, technical incidents, billing, account recovery, and backups. Set budget alerts and monitor failed submissions, scheduled expiry failures, and notification delivery failures without logging customer details.

Configure daily production backups with a documented retention period and perform a restore rehearsal in an isolated environment. Document restore steps, expected recovery time, and how order/capacity consistency is checked after restoration.

Document a client-approved customer-data retention period and deletion/anonymization procedure before collecting real orders. Include addresses, contacts, notes, exports, logs, audit records, and backup expiry in the policy. Keep minimal non-identifying operational records where needed. Do not treat downloadable CSV files as managed backups.

## 12. Build phases

### Release 1 — complete and reliable order workflow

- Owner authentication and protected admin operations.
- Minimal product, variant, and add-on editing, seeded from current content, preserving availability and note-card behavior.
- Public form connected to trusted creation, authoritative pricing, idempotency, and transactional reservations.
- Basic pickup/delivery, slots, lead times, cutoffs, blackouts, daily order/item capacity, and maintenance controls.
- Clear quote-required and payment-after-confirmation messaging.
- Complete Overview dashboard as specified in section 7, including operational work, payments, sales trends, bestsellers, capacity, and recent activity; order detail/editing, manual payment records, and bake list.
- Audit event capture, scheduled expiration, and one reliable new-order alert channel.
- Shared content resolution foundation; existing marketing defaults remain usable.
- Security checks, failure handling, backups, monitoring, and operating documentation.

### Release 2 — broader administration

- Full brand/story/banner editor, seasonal logos, and specials.
- Canned replies, CSV with export permission, and staff role UI.
- Additional alert channels and richer filtering where useful.

### Release 3 — evidence-led polish

- Dedicated audit-history UI, expanded allergen presentation, and SEO editing polish.
- Production capacity refinements based on actual kitchen use.
- Additional hosting/security infrastructure only for demonstrated requirements.

Security and correct data capture are never postponed simply because their management UI is in a later release.

## 13. Acceptance criteria

### Release 1

- [ ] Marketing pages render approved defaults without content documents; missing operational setup keeps ordering closed.
- [ ] Existing fixed-price and quote-required products, recurring availability, delivery options, and note-card messages are preserved.
- [ ] Server rejects invalid selections, altered prices, internal-field injection, and incompatible add-ons.
- [ ] Lead days, cutoffs, seasonal/date boundaries, blackouts, and slot validity use Asia/Manila consistently.
- [ ] Two simultaneous requests for the final capacity unit cannot both succeed.
- [ ] Retry after a lost response returns the original receipt without duplicate order, capacity, or alert.
- [ ] Temporary holds expire and release once; late confirmation must reacquire capacity.
- [ ] Cancellation, quantity edits, and rescheduling adjust all affected counters atomically; failed changes preserve the prior reservation.
- [ ] Cash payment can coexist with a confirmed reservation; cancellation does not imply refund.
- [ ] Unknown prices/fees never appear as a final total or zero-priced item.
- [ ] Confirmation requires a finalized quote, and historical snapshots survive catalog changes.
- [ ] Dashboard and bake list use the specified statuses; unconfirmed requests do not enter production totals.
- [ ] Overview uses Asia/Manila dates, prioritizes today's orders and attention items, and links counts to matching filtered views. Ready orders are excluded from items still to prepare; completed orders remain counted toward capacity.
- [ ] Overview distinguishes committed capacity from valid temporary holds, shows reservation deadlines, and separates loading/failure states from true zero counts.
- [ ] Overview includes payment summaries, sales trends, bestsellers, and recent activity. Financial figures follow section 7 definitions, historical payment totals use events, and period comparisons use matching local-date windows.
- [ ] Database or authoritative-config failure cannot produce a false success or fallback-price order.
- [ ] Alerts retry without recreating orders; delivery failures are visible to the operator.
- [ ] Public users cannot access customer orders/internal records; all server mutations enforce authorization.
- [ ] Concurrent admin edits produce a conflict rather than silent data loss.
- [ ] Audit events exist from initial creation onward.
- [ ] Appropriate transaction, authorization, expiry, and retry tests pass; lint/build pass.
- [ ] Backup restore rehearsal and client-approved retention/account-recovery procedures are documented.
- [ ] README covers setup, secrets, deployment, DNS-only Vercel routing, scheduled workers, indexes, monitoring, and operator responsibilities.

### Later releases

- [ ] Reset, custom, and hidden modes behave distinctly; hiding a link cannot restore its default.
- [ ] Seasonal logos and banners honor schedule boundaries and revert correctly.
- [ ] Admin publication refreshes public content and metadata predictably.
- [ ] Staff cannot edit restricted fields or elevate roles; revoked admins lose access.
- [ ] CSV respects filters and export permissions and neutralizes spreadsheet formulas.
- [ ] Snippets remain manually copied and handle pending quotes correctly.

## 14. Collection outline

```
settings/brand
settings/banner
settings/fulfillment
settings/ordersConfig
settings/payment
privateSettings/alerts
products/{id}
products/{id}/variants/{variantId}
addons/{id}
specials/{id}
orders/{id}
orders/{id}/events/{eventId}
reservations/{id}
capacityDays/{date}
capacityDays/{date}/slots/{slotId}
submissionKeys/{keyHash}
counters/orders
notificationEvents/{eventId}
snippets/{id}
admins/{uid}
```

Operational collections are private. Security rules and server validation must be designed together; the collection list is not permission to expose documents publicly.

## 15. Technical references

- Firestore transactions: https://firebase.google.com/docs/firestore/manage-data/transactions
- Firestore rules and server SDK authorization boundary: https://firebase.google.com/docs/firestore/security/rules-conditions
- Vercel reverse proxy guidance: https://vercel.com/docs/security/reverse-proxy

Implement Release 1 as a complete workflow before expanding the content-management surface.

## 16. Admin implementation slices

Build in the sequence below. Each slice should leave a working, reviewable result. This breakdown does not change the release requirements above; public ordering remains disabled until the complete Release 1 workflow is verified.

### Part 1 — Foundation, sign-in, and navigation

Deliver:
- Firebase development configuration, server/client initialization boundaries, environment template, and local emulator support.
- Shared validated types for catalog, orders, roles, money, and business dates.
- Owner bootstrap procedure, sign-in/sign-out, protected `/admin` layout, and server-side permission checks.
- Responsive admin navigation: Overview, Orders, Kitchen, Catalog, Availability, and Settings. Link only implemented destinations; clearly mark planned sections if displayed.
- Loading, empty, failure, and session-expiry behavior.

Done when: the owner can sign in and out; signed-out and inactive users cannot access protected data or mutations; development setup is reproducible with fake data. Do not require production domains to finish this slice.

### Part 2 — Catalog management

Deliver:
- Product list and edit screen with image, name, description, category, allergens, notes, visibility, and ordering.
- Product variants with fixed/quote-required pricing, sizes, and lead times.
- Add-ons with per-item/per-order scope, compatibility, and note-card customization.
- Recurring product availability and date exceptions.
- Repeatable seed from existing site content that does not overwrite subsequent admin edits.
- Published catalog reader integrated into the storefront, preserving default content behavior.
- Keep product visibility, date-based unavailability, and missing-photo information in Catalog; the Overview target remains the complete dashboard in section 7.

Done when: an owner can change a product/variant/add-on and see the correct public result; unavailable and quote-required products behave correctly. Archive/deactivate referenced catalog entries rather than damaging historical order snapshots.

### Part 3 — Availability and fulfillment settings

Deliver:
- Ordering open/closed and maintenance controls.
- Pickup/delivery configuration, slots, delivery fee mode, and business timezone handling.
- Daily order/item limits, optional slot limits, per-order limits, blackout dates, cutoff, and lead-time settings.
- A shared server availability calculation used by subsequent order creation and admin amendments.
- A clear explanation of reservation expiry and current capacity usage; never imply that editable limits erase existing reservations.

Done when: settings persist and availability can be verified against fake scenarios, including closures, expired slots, cutoff boundaries, and product restrictions. Ordering remains closed pending Part 4 and launch verification.

### Part 4 — Order intake and order management

Build this part in three internal checkpoints:

1. Trusted order service: server validation, authoritative pricing, idempotency, numbering, transactional reservations/counters, audit events, and scheduled expiration.
2. Public form integration: receipt, pending quote wording, reservation deadline, chat link and clipboard fallback, stale-price review, and safe retry behavior.
3. Admin Orders screen: paginated/filterable list, order detail, manual quote finalization, status/payment updates, notes, and validated amendments/cancellation/rescheduling with conflict detection.

Connect Overview to the same order services: today's order and ready counts, today's order list, deduplicated attention items with reservation deadlines, and seven-day capacity with committed usage and temporary holds separated. Include payment summaries, sales trends, bestsellers, and recent activity using section 7 metric definitions. Counts link to matching Orders filters; retain distinct empty, loading, and failure states. Implementation sequencing must not narrow the finished Overview to currently available features.

Persist notification events now even though delivery is completed in Part 6. Capture all audit events now even though a richer history screen can come later.

Done when: a fake customer request can move through confirmation and completion in admin; retry, last-slot concurrency, expiration, quote-required, cash-payment, and unauthorized-access checks pass. Capacity and order changes remain consistent after failures.

### Part 5 — Kitchen view

Deliver:
- Date-based bake list using confirmed, preparing, and ready orders.
- Product/variant/add-on quantity totals and per-order customization/handling notes.
- Clear remaining-work and completed sections.
- Direct links to order detail and authorized preparation-status actions.
- Overview items-still-to-prepare count and bake summary, using confirmed/preparing orders and linking to the full Kitchen view; ready orders do not count as remaining preparation.

Done when: kitchen quantities match the underlying orders after edits, cancellations, rescheduling, and completion; unconfirmed/expired requests do not enter production totals.

### Part 6 — Alerts and launch readiness

Deliver:
- One working staff notification channel with durable event processing, deduplication, retries, and visible delivery failures.
- Worker scheduling for expiry and notification delivery, with monitoring and an assigned operator.
- Production account setup, secrets, indexes/rules, hosting configuration, backups/restore rehearsal, retention policy, and account recovery documentation.
- Complete Release 1 acceptance checks, including authorization and failure cases.

Done when: an accepted request reaches the designated operator, notification failure does not lose the order, scheduled work is monitored, and Release 1 acceptance criteria pass. Enable real public orders only at this point.

### Part 7 — Content management

Deliver:
- Brand, story, images, links, banner, seasonal logos, and specials editors.
- Explicit default/custom/hidden controls and publication/cache refresh behavior.
- SEO content controls where appropriate.

Done when: public content updates consistently; hiding a CTA does not restore a default URL; seasonal content starts and ends in the business timezone.

### Part 8 — Staff tools and administrative polish

Deliver:
- Owner-managed staff access, role restrictions, revocation, and optional export permission.
- Manual-copy reply snippets, safe filtered CSV exports, and a dedicated history view.
- Additional alert channels and workflow refinements only where needed.

Done when: staff can perform assigned order work without gaining catalog/settings/role privileges; exports are authorized and audited; reply snippets never send automatically.

### Initial implementation target

Start with Part 1 only. Keep the existing public storefront functional while establishing development setup, owner access, and the protected admin shell. Proceed to Part 2 after Part 1 is verified. Parts 1–6 together form the first operational release; Parts 7–8 expand administration afterward.
