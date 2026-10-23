# Makalipie: update plan from the 2026-10-21 meeting

**Based on:** `MAKALIPIE_MEETING_NOTES_2026-10-21.md` (all 25 answers) and a read-only check of the code at `b862028` on `main`.
**Code state:** nothing is newer than `b862028`. The working tree is clean except for the untracked `MAKALIPIE_DEMO_GUIDE.md` and `tests/pickup-intake.test.ts`. That test locks in pickup-only behavior, so it has to be rewritten once delivery comes back.
**Sizes:** S = under half a day · M = 1–2 days · L = 3+ days.

---

## What the code already has (so we don't rebuild it)

| Area | Already in code | Where |
|---|---|---|
| Delivery backend | `delivery: "pickup" \| "lalamove"`, the `deliverable` (staff record the fee) and `delivered` actions, `deliveryEligibility`, `deliveryFeeCentavos`, and a block on approval until the fee is confirmed | `src/lib/orders/store.ts`, `src/lib/orders/schema.ts` |
| Delivery in admin | Branches have a **Delivery on/off** toggle and **Delivery areas**. The order sheet has a fee form, "Address can be delivered", and "Mark delivered" | `src/components/admin/branch-manager.tsx` ~L265–295, `src/components/admin/order-inbox.tsx` ~L447–584 |
| Where delivery was turned off | Only the customer form (`order-form.tsx`) and the request schema (`delivery: z.literal("pickup")`). Commit `e2427a5` removed the radio and the address field | `git show e2427a5 -- src/components/order-form.tsx` |
| Sizes and prices | Each size (variant) has its own label, a fixed price or "DM for price", lead days, and an active flag. Each size is set to Regular or Pre-order per branch | `src/lib/catalog/schema.ts`, `src/lib/branches/schema.ts` (`assignments`) |
| Selling days | **Set per product, not per size** (`availableWeekdays`). This matters for Buko, see 1.8 | `src/lib/catalog/schema.ts`, `src/lib/catalog/rules.ts` |
| Hold | A flat 30 min from submit (`initialReservationDeadline`), with no awareness of business hours. Expiry runs lazily when pages are read (`expireDueHolds`) | `src/lib/orders/policy.ts`, `store.ts` L427, L974, L1068 |
| Payment gate | `paymentBeforePreparation: z.literal(true)`. The server refuses **Preparing** until the order is fully paid | `src/lib/orders/policy.ts` (`assertPaymentBeforePreparation`) |
| Revision | **Staff only** (`revise` action). Customers only get Reopen and Reorder | `schema.ts` `orderActionSchema`, `src/app/order/status/page.tsx` |
| Roles | `admins/{uid}` with `role: owner \| staff`, `branchIds`, `active`. Staff see only Orders. Every other page uses `requireOwnerPage()` | `src/lib/admin/schemas.ts`, `access.ts`, `session.ts`, `app-sidebar.tsx` |
| Firestore rules | Deny-all. All access goes through the server (Admin SDK), so **new features need no rules changes**. Just keep new collections server-only | `firestore.rules` |
| Hosting | Docker on a VPS (`deploy.sh`, `/srv/apps/makalipie`), not Firebase Hosting. Firebase is only used for Auth, Firestore, and Storage | `deploy.sh`, `docker-compose.yml` |

---

## Phase 1: Launch-ready (policy changes and quick fixes)

Goal: the site matches what Nika agreed to. These are small, low-risk changes.

### 1.1 Night orders: business-hours hold (Option A) · M
- **Now:** a night order expires 30 min after it's sent, while nobody is working (`policy.ts` `initialReservationDeadline`).
- **Change:**
  - New `holdDeadline(submittedAt, schedule, slotStart)` in `policy.ts`, used at submit (`store.ts` ~L1068) and reopen (~L974):
    - **During open hours** (between the branch's `startTime` and `cutoffTime` on an open day): submit time + 30 min.
    - **After hours:** next opening time + 30 min.
    - **Either way, cap it** at slot start − 60 min (Emerson's "up to 1 hour before pickup/delivery").
  - Keep `reservationMinutes` (30) and add `confirmBeforeSlotMinutes` (60) to the ordering policy so they can be changed later.
  - Pass the branch schedule into the deadline. It's already loaded in submit through `readOrderingAvailability`.
- **Customer UI:** status page "Hold until …" (`status/page.tsx` ~L212). For after-hours orders, show: "We're closed now. Staff will confirm when we open at 10:00 AM. Your slot is held until …".
- **Admin UI:** in Orders, add a **"Waiting since last night"** filter or chip for orders sent outside hours, sorted by **pickup time first** (`order-inbox.tsx`). Add the same count to the Overview "needs action" card.
- **Edge case:** an order sent after hours for the **first slot the next morning** would get a deadline before staff come in. See open question Q1.
- **Tests:** add cases to `tests/order-policy.test.ts`: daytime, after-hours, a closed day before the next open day, and the cap.
- **Depends on:** nothing.

### 1.2 Confirm on Instagram **and** Messenger · S
- **Now:** Instagram only (`site.instagramDmUrl`, status page L148–215, order page metadata, home sections, Terms, Privacy, Refund).
- **Change:** add `site.messengerUrl` (an `m.me/<page>` link) in `src/lib/site.ts`. On the status page, add an **Open Messenger** button next to **Open Instagram**, and change the copy to "Send your order number on Instagram or Messenger". Update the copy in `order/page.tsx` metadata ("for Cebu pickup", "send it on Instagram"), `how-to-order.tsx`, `menu-catalog.tsx`, and `order/opengraph-image.tsx`.
- **Needs:** the Facebook Page link (Q2).

### 1.3 Payment: full upfront only when staff require it · M
- **Now:** the server blocks **Preparing** until the order is fully paid, for every order (`policy.ts` `paymentBeforePreparation: literal(true)`, `assertPaymentBeforePreparation`).
- **Change:**
  - New order field `prepayRequired: boolean`, set by staff on the order sheet ("Require full payment before preparing"). Its default comes from a Settings value (Q3).
  - `preparing` checks payment only when `prepayRequired` is true. When it's off, staff can record payment at pickup or delivery (`pay` or `settle` from Preparing or Ready). **Complete** should still need full payment recorded, unless Q3 says otherwise.
  - Show "Paid / Pay on pickup" clearly on the order sheet and in Kitchen.
- **Customer copy:** the status page says "Pay after we confirm. For large orders we'll ask for full payment before baking."
- **Depends on:** Q3 (the default value).

### 1.4 Cancellation and customer revision (until Confirmed, when the admin enables it) · M
- **Now:** only staff can revise (`orderActionSchema` `revise`, `order-inbox.tsx`). Customers can't edit or cancel.
- **Change:**
  - New order field `customerEditable: boolean`. Staff turn it on with a toggle on the order sheet. The default comes from Settings (`settings/shop.customerRevisionDefault`, off until Q4 is answered).
  - New API route `POST /api/orders/revise`, authenticated by the guest token, the same way `/api/orders/reopen` is. It's allowed only while the status is `requested` or `processing` (before Approved/Confirmed) and `customerEditable` is true. Reuse the staff `revise` path so allocations are re-held or released in one transaction, and log the event as `actorUid: "customer"`.
  - **Customer UI:** the status page shows an **Edit order** button. It opens the order form in edit mode with the items, date, slot, and notes filled in (reuse the recovery draft loader, `readRecoveryDraft`). The status page already refreshes on its own, so the button appears after staff turn the option on.
  - There's no customer cancel button. Cancellation stays case by case through chat, and staff use **Reject** with a reason.
- **Depends on:** 1.1 (editing should not reset the hold. Recommend keeping the original deadline, Q4).

### 1.5 Delivery comes back, set per branch · M
This was planned as Phase 2, but most of it already exists in the code. Restoring it before launch keeps the site matching Cebu's real process. If time is short, it can wait, as long as the Terms say pickup only.
- **Data:** add `pickupEnabled: boolean` (default true) to `branchRecordSchema` and `coerceBranchSettings`. `deliveryEnabled` already exists. Require at least one of the two to be on. Pickup address = the branch `address` (already used by `PickupAddress`).
- **Request schema:** `delivery: z.enum(["pickup","lalamove"])`, required `address` (5–300 chars) when delivery is chosen, and new `deliveryFeePayment: "with_total" | "to_driver"` (Q5). Keep the stored value `"lalamove"` to avoid a data migration, and label it **"Delivery (we book the rider)"** in the UI.
- **Customer form** (`order-form.tsx`): bring back the fulfillment radio and address field from `e2427a5` (approximately a revert of that file's hunk). Show only the options the branch has turned on. Under the options, add: "Booking your own Grab or Lalamove? Choose Pickup." For delivery, add "We'll confirm the delivery fee in chat. Pay it with your total or directly to the rider", and the choice between the two.
- **Order summary and status page:** a delivery note: "Once a third-party courier picks up your order, we no longer have control over how it's handled or when it arrives." Show it for delivery, and also for pickup (since a customer-booked rider counts as pickup).
- **Admin:** `branch-manager.tsx` gets a Pickup toggle next to the existing Delivery toggle. `order-inbox.tsx` already handles the fee, approval, and delivered steps. Rename "Legacy delivery destination" to "Delivery address" and show the fee-payment choice. When the fee is paid to the driver, leave it out of `finalTotalCentavos`.
- **Tests:** rewrite the untracked `tests/pickup-intake.test.ts` and update the delivery cases in `tests/orders.integration.ts`.
- **Legal:** Privacy now collects an address and shares name, phone, and address with the rider (see 1.9).

### 1.6 Quick fixes from earlier findings · S each
| Fix | Where | What |
|---|---|---|
| Overview sales chart shows "Sep" for every month | `ops-overview.tsx` L278 | Use `dayjs(d.date).format("D MMM")` |
| Admin order-number search does nothing | `workspace-topbar.tsx` `findOrderByNumber()` always returns `null` | Clean up the input (trim, uppercase, add `MK-` if it's missing), then go to `/admin/orders?q=MK-1234`. The inbox already reads `?q`. Show "No order with that number" when the inbox finds nothing |
| Allocation: 0 looks the same as any other limit | `allocation-manager.tsx` ~L277 `data-capped={day?.limit ? …}` | Use `data-state="open|capped|closed"`, with 0 shown as **Closed** in muted red and a small "none" label |
| Customer header search by order number | `site-header.tsx` (no search there now) | **Recommendation:** don't add one. Looking orders up by number alone would show other people's orders. Customers already have their private order link, and staff search in admin. Mark the UX note item as "admin only" |
| Hardcoded top banner | `site-shell.tsx` L16–19 ("Buko pie, Friday to Sunday") | It's accurate today, so leave it for launch and make it editable in Settings (3.1) |

### 1.7 30-day retention, then remove personal details · M
- **Now:** nothing removes personal data. The Privacy page shows a "pending" note (`privacy/page.tsx` L54–55).
- **Change:** add `anonymizeOldOrders(now)` in `store.ts`. It finds orders with `fulfillmentDate` more than 30 days ago in a closed status (completed, cancelled, expired), then:
  - Clears `customerName`, `contact`, `address`, `notes`, and add-on messages.
  - Removes `accessTokenHash` so the guest link stops working.
  - Sets `anonymizedAt`.
  - Keeps the order number, items, totals, dates, and status for sales counts.
- **How it runs:** the site is on a VPS, so use a protected route `POST /api/internal/retention` (secret header) called by a daily cron on the VPS. As a backup, also run it lazily whenever an owner opens Overview, the same way `expireDueHolds` works.
- `retentionDays: 30` goes in the ordering policy or Settings. Add an index on `status + fulfillmentDate` if Firestore asks for one.

### 1.8 Catalog setup for sizes, 10-inch, and Buko · S (data) + S–M (one code gap)
- Mostly data entry in admin. Standard size = **4-inch**. Add a **10-inch** size to banoffee, pecan, s'mores, Oreo, Buko, and apple, with its price and `minLeadDays: 2`, set to **Pre-order** per branch. Butter chicken stays `category: savory`.
- **Code gap:** selling days are set **per product** (`availableWeekdays` in `productCatalogSchema`), so Buko can't be Fri–Sun for 4-inch while 10-inch is any day.
  - **Recommended:** add an optional `availableWeekdays` to `variantSchema` that overrides the product's days. Check it in `availabilityReason` (`catalog/rules.ts`), and add a day picker per size in `product-editor.tsx` or `catalog-manager.tsx`. Size S–M.
  - **Zero-code fallback:** make "Buko Pie (10-inch)" a separate product.
- Final 10-inch prices are still needed (Q6).

### 1.9 Legal pages (Terms, Privacy, Refund) · M (copy)
Files: `src/app/terms/page.tsx`, `privacy/page.tsx`, `refund/page.tsx`. Update `MAKALIPIE_LEGAL_PAGES_OUTLINE.md` too.
- **Terms**
  - How to order: confirm on Instagram **or Messenger**.
  - Hold: 30 min during open hours. After hours, the slot is held until staff confirm when they open, and confirmation must happen at least 1 hour before the slot.
  - Payment: GCash or bank. For some orders (usually large ones), full payment is required before preparation, and staff decide this per order.
  - Pickup and delivery: pickup at the branch address. A customer-booked courier counts as pickup. Delivery is available where the branch offers it: we book the rider and confirm the fee, and you pay it with your total or to the rider.
  - Courier: the bakery isn't responsible after a third-party courier picks up the order.
  - Cancellation: generally not allowed. Requests are handled case by case at the bakery's discretion. Changes can be requested instead, and may be made on the site before confirmation where enabled.
  - Photos: our photos show the actual products. Drop the "photos are a guide" line, or keep only a light "may vary slightly by batch" line.
  - Allergens: listed per product, and **made in a shared kitchen that handles nuts (including pecans) and gluten, so cross-contact is possible**.
  - Governing law: Philippines.
- **Privacy:** now collects the delivery address (delivery only). Shares name, phone, and address with the delivery rider. Messenger (Meta) is a channel. Retention: 30 days after the order date, then name, contact, address, and notes are removed and anonymous sales totals are kept.
- **Refund:** follows from no-cancel. Refunds apply when the bakery can't fulfill the order, for a bakery error (wrong or damaged before handover), or when the bakery changes the date (new date or refund). No refunds for courier issues after handover. Keep the no-show policy as it is now (still pending, Q8).
- Update the "last updated" dates. Remove the `LegalPending` blocks once each policy is final.

---

## Phase 2: New features (biggest pain point first)

### 2.1 Kitchen view (Nika's top request) · M–L
- **Now:** a disabled "Coming soon" item in `app-sidebar.tsx` L50.
- **Build:** `/admin/kitchen` (page in `src/app/admin/(workspace)/kitchen/`), with data from the orders collection. No new collection.
  - Default view: **today + the next 2 days** in columns or tabs, with buttons for earlier and later dates and a date picker for any day.
  - For each day: totals **grouped by pie and size** (for example "Pecan 4-inch × 12, Pecan 10-inch × 2"), add-ons and messages, then a per-order list (order number, pickup or delivery time, paid or unpaid, notes, and the box breakdown from 2.5).
  - Shows Approved, Preparing, and Ready orders as **firm**. Pending and Processing orders appear in a separate **"Not confirmed yet"** section, so staff can plan without double-counting (Q9).
  - Branch filter. Staff see only their branches (`ordersVisibleTo`).
  - **Print:** a `@media print` stylesheet and a Print button. One clean page per day.
  - Auto-refresh, the same way Overview does it (`overview-live.ts` pattern).
- **Access:** owner, plus staff given the Kitchen permission (3.2). Until 3.2 exists, use `requireAdminPage` (staff can view, Q12).
- **Depends on:** nothing. Gets better after 2.5 (boxes) and 2.2 (packages).

### 2.2 Packages per branch · L
- **Data:** new collection `packages/{id}`: `name`, `description`, `image`, `priceCentavos` (or "DM for price"), `contents: [{productId, variantId, quantity}]`, `branchIds`, `mode` (regular/pre-order), `minLeadDays`, `active`, `sortOrder`, `version`.
- **Branch settings:** add `orderStyle: { items: boolean, packages: boolean }` (default items on, packages off). When packages are on, add `addOnItemIds`: the per-item products customers can add next to a package (for example butter chicken).
- **Selection schema** (`catalog/schema.ts`): add `packages: [{packageId, quantity}]`. Allow `lines` to be empty when a package is chosen. In `quoteSelection`, price the package, and check lead days and selling days for every item inside it.
- **Allocation:** a package takes from each flavor's daily allocation for the pies inside it. Run the contents through `flavorQuantities` before `flavorHasRoom`.
- **Admin:** a **Packages** tab in Catalog (create a package, add items and quantities, set price, choose branches). In Branches, add the "Show packages / Show per item" toggles and choose the add-on items.
- **Customer:** on a branch with packages on, show package cards first, then "Add to your box" with the enabled items.
- **Order display:** package lines in the receipt, admin sheet, and Kitchen (expanded into pies).
- **Open:** Q10 (how many packages per order, price, which page they go on).

### 2.3 Per-customer order limit, per branch · M
- **Data:** in the branch record, add `customerLimit: { pies: number | null, boxes: number | null, per: "order" | "day" }` (Q7). Example: Manila 16 pies or 4 boxes.
- **Who counts as the same customer:** a cleaned-up `contact` (digits only for phone numbers, lowercase without "@" for handles), stored as `contactKey` on each order.
- **Server** (`submitOrder`, revise, reopen): when `per: "day"`, add up the pies on this customer's active orders (requested through ready) for the same branch and date in the transaction, and reject with "Limit is 16 pies per customer for this drop". When `per: "order"`, check the selection only. Packages count by the pies inside them.
- **Admin:** the limit field in Branches. Staff can still go over it with a staff revise (owner override).
- **Customer:** show the limit next to the stepper ("Max 16 pies per customer") and stop + at the limit.
- **Note:** a determined customer can use another phone number. This is a soft limit, and staff remain the backstop.

### 2.4 Delivery per branch: finishing touches (if 1.5 was the basic version) · S–M
- Delivery fee shown on the status page after staff confirm it (`deliveryFeeCentavos` is already returned for delivery orders, `store.ts` L1238).
- Delivery orders in Kitchen and Overview, with a "rider booked" checkbox for staff.
- Optional: limit delivery to `areas` (the field exists). For now it's for reference only.

### 2.5 "Arrange your boxes" (optional step) · M–L
- **Settings:** `piesPerBox` (default 4) in `settings/shop`. Applies to **4-inch** sizes only (Q11).
- **Selection:** add optional `boxes: [{ lines: [{productId, variantId, quantity}] }]`. The server checks that box totals add up to the selected lines and that each box is ≤ `piesPerBox`.
- **Customer UI:** after picking pies, an optional step with a Skip button. Number of boxes = ceil(pies ÷ 4). Boxes are filled by flavor by default. The customer adjusts boxes 1 to n−1, and the last box fills itself. If the last box isn't full, show "Add 2 more to fill your box" (Q11).
- **Show it on:** the order summary, the status page receipt, the admin order sheet, and Kitchen ("Box 1: 2 Pecan, 2 Oreo").
- **Staff revise:** if the pies change, reset the boxes to auto-fill.
- **Depends on:** packages (2.2) define their own contents, so packages skip this step.

---

## Phase 3: Nice to have

### 3.1 Settings page · M
- New `/admin/settings` (sidebar L51 is now "Coming soon") with a `settings/shop` doc:
  - **Theme:** Default / Christmas / Valentine's / more later. Nika turns them on and off. CSS variables and assets are swapped from `layout.tsx` based on the active theme.
  - **Banner text and link:** replaces the hardcoded text in `site-shell.tsx`.
  - `piesPerBox`, `customerRevisionDefault`, `prepayRequiredDefault`, the hold minutes, and the confirm-before-slot minutes.
- Owner only.

### 3.2 Admin users and page permissions · M–L
- **Now:** you add users with `scripts/bootstrap-owner.ts`. Only two roles exist. Staff can see only Orders.
- **Change:**
  - Add `permissions: ("overview"|"catalog"|"branches"|"popups"|"schedule"|"allocation"|"orders"|"kitchen"|"settings")[]` to the admin profile. Owner = everything.
  - Add a `requirePermission(page)` check to replace `requireOwnerPage` on each page and API route.
  - Show sidebar items based on permissions.
  - Add a **Users** section in Settings: invite by email, choose branches and pages, turn users on or off.
- Nika stays the sole Owner for now, so this can wait until she adds her IG replier.

### 3.3 Order status colors and other UX notes · S
- Give each status a distinct color (`order-status-badge.tsx`, `status-display.ts`), as described in `MAKALIPIE_PRODUCT_UX_NOTES.md` §3. The mobile lineup is already done (`d81b5a0`).

---

## Launch checklist (Emerson, after the build)
- [ ] Firebase **production** project on Nika's Google account, with Blaze billing on her card, Auth (email sign-in for admins), Firestore, and Storage. Deploy `firestore.rules`, `storage.rules`, and `firestore.indexes.json`.
- [ ] Production `.env` on the VPS (Firebase keys, `ORDER_INTAKE_ENABLED=true`, site origin `https://makalipie.com`). Run `npm run admin:bootstrap` for Nika as Owner.
- [ ] Domain **makalipie.com** (Nika pays). Point DNS to the VPS, set up HTTPS, and add the domain to Firebase Auth's authorized domains.
- [ ] Email at the domain (for example hello@makalipie.com) through her chosen provider. Then update the contact email in `site.ts` and the legal pages if it changes from makalipie@gmail.com.
- [ ] Catalog data: final photos from the Drive folder, 10-inch sizes and prices, Buko days, and branch addresses.
- [ ] Set up the schedules (hours and open days) and turn each branch **Online**.
- [ ] Cron for retention (1.7).
- [ ] Test orders end to end on prod: a pickup order, a delivery order, a night order, and revise, reopen, and reorder. Then clear the test data.
- [ ] Publish the legal pages with dates. The GrabFood and Foodpanda links are confirmed correct, so no change there.

---

## Suggested order
1. **Phase 1:** 1.6 quick fixes → 1.1 hold → 1.2 Messenger → 1.3 payment → 1.5 delivery → 1.4 revision → 1.7 retention → 1.8 catalog → 1.9 legal copy. That's about 1.5–2 weeks.
2. **Phase 2:** **2.1 Kitchen first** (biggest pain point), then 2.3 limits (needed for Manila drops), 2.2 packages, and 2.5 boxes.
3. **Phase 3** when Nika asks. A Christmas theme (3.1) might be worth pulling earlier if you're aiming for the Christmas season, but there's no launch pressure.

---

## Open questions (we don't decide these for Nika)
1. **Early-morning slots after hours:** for an order sent at night for the first slot the next morning (for example 10–11 AM, with staff in at 10), should the site (a) block that slot after hours, (b) allow it and let staff confirm when they arrive, or (c) require pre-orders by closing time the day before? Recommendation: (a), hide slots that start within 1 hour of opening for orders sent after hours.
2. **Messenger link:** what is the Facebook Page or Messenger username (for the `m.me/...` link)?
3. **Payment default:** should new orders start as "require full payment before preparing" (staff turn it off for small orders) or the reverse? And can an unpaid order be marked **Completed** (paid on pickup or delivery), or must payment be recorded first?
4. **Customer revision:** should it be off by default with staff turning it on per order, or on for every order? Does a customer edit keep the original hold time or start a new one? What can they change: pies, date and time, branch, notes?
5. **Delivery fee payment:** does the customer choose "with total" or "pay the rider" on the form, or is it agreed in chat and recorded by staff? Is delivery only for Cebu right now, or for any branch that turns it on?
6. **10-inch prices:** the exact price for each flavor (the meeting mentioned about ₱900).
7. **Per-customer limit:** is it per order, or per customer per day or drop? Is it counted in pies, boxes, or both?
8. **No-show with payment:** if a paid customer doesn't show up and the order goes to the waitlist, is the money refunded, kept, or moved to a new date? (This is still marked pending in Terms and Refund.)
9. **Kitchen:** should unconfirmed (Pending or Processing) orders appear in a separate "not confirmed yet" list, or be hidden?
10. **Packages:** one package per order or several? Fixed price per package? Are they regular, pre-order, or either? Can customers swap flavors inside a package?
11. **Box size:** does "4 per box" apply only to 4-inch pies? How do 10-inch pies and butter chicken get boxed? Should a partial last box be allowed, or should we ask the customer to fill it?
12. **Who can see Kitchen:** owner only until roles exist, or any staff account?
