# Makalipie Frontend MVP

Agreed MVP contract, updated November 11, 2026. Implement **after the backend acceptance gate** in [MAKALIPIE_BACKEND_MVP.md](MAKALIPIE_BACKEND_MVP.md) passes. This document specifies screens and interactions, not application code.

These two documents are the only source of truth. Older documents, including `docs/v2` and legacy specs, are retired and must not be used. The backend document defines money, schedules, permissions, allocation, transaction safety, status transitions, privacy, and recovery. The frontend consumes those verified contracts and must not recreate competing business rules or treat browser validation as authoritative.

## 1. Design and delivery requirements

- Use **shadcn/ui throughout all admin screens, including login**: navigation, buttons, forms, tables, tabs, Sheet, dialogs, badges, notifications, pickers, and other suitable primitives. Reuse existing project components where compatible rather than building parallel component systems.
- Primary visual inspiration is the client's POS photograph, supplied as `IMG_1255.HEIC`: light surfaces, subtle borders, rounded corners, compact left navigation, dark primary actions, clear imagery, and touch-friendly controls. It informs appearance; it does not add unrelated POS/payment features.
- Use split layouts wherever useful, especially Orders, Products, Add-ons, Schedules, and Drops. Avoid forcing split panels onto login or simple settings forms.
- Desktop/tablet: list or navigation on the left, selected record/editor on the right. Phone: list first, then full-screen details with Back; use tabs for dense editor sections.
- Accessible labels, keyboard operation, visible focus, sufficient contrast, touch targets, and reduced-motion behavior. State changes must not rely on color or sound alone.
- Explicit **Save changes** for forms, with discard protection. Do not silently autosave financial/catalog settings. Show saving, success, validation, stale-save, and connection failures clearly.
- New/edited screens use real backend contracts. Build loading, empty, disabled, sold-out, expired, unauthorized, and offline/error states alongside normal states.

## 2. Public discovery and location routing

### Home and Menu

- Home remains focused on the main Cebu shop. Menu always shows the regular Cebu catalog. No global/header location dropdown or geolocation prompt.
- Featured pies use an owner-ranked list but display only four distinct eligible products. The backend skips unavailable products and fills gaps from eligible Cebu menu order. Do not render empty placeholder slots if fewer than four exist.
- Seasonal expiry automatically changes the displayed four without deleting the saved ranking. Display product/size photos with the published-theme fallback defined in the backend plan.
- The header has normal navigation and an Order link. Location is chosen on the Order page; unrelated pages do not carry ordering-location query parameters.
- Use contextual links to view Manila or other drop offerings on Order; do not imply the regular Menu becomes a drop menu.

### Find us

Order the content as:

1. **Our home in Cebu:** always visible, including address, map, hours, and Order in Cebu. Hours come from admin-managed branch data; replace leftover hardcoded "10am to 8pm" copy.
2. **Pop-ups:** informational events, grouped/labeled by city, with dates, hours, map, and descriptive offerings. Hide after the end date in Manila time (Asia/Manila). Expired pop-ups remain in admin.
3. **Upcoming drops:** published upcoming/current drops across **all cities**, ordered by next fulfillment date.

Drop cards show city/event name, dates, pickup location, pickup-only or pickup/delivery, and Coming soon / Ordering open / Sold out / Ordering closed status. Use **View drop** before opening and **Order this drop** while orderable. Both lead to that specific event's Order page. Ended events leave listings; old direct links show an ended state with upcoming-drop and Cebu links.

### Order URL and location selection

- `/order` means Cebu. No geolocation or permission request. A previously used Manila cart must not change a plain link's location.
- `/order?loc=manila` selects Manila. `/order?loc=manila&drop=<stable-drop-slug>` selects the advertised event directly. Use the same pattern for other drop locations.
- At the top of Order, show **Where are you ordering?** when multiple locations are available. Hide the redundant selector when Cebu is the only choice.
- Cebu is always available. A drop location appears when it has published upcoming/current events. One event opens automatically; multiple events show a picker unless the URL selects one.
- Changing the selector updates the Order URL. A malformed/unknown/unavailable location falls back to Cebu with a notice. A known ended drop shows its ended state instead of silently choosing a new drop; a draft/unpublished event does not expose its private setup.
- Preview future drop dates and lineups without enabling advance ordering. Date-specific same-day opening/cutoff and daily allocation control purchase eligibility.
- Keep carts separate for regular locations and, for drop locations, for each event. Never merge items from separate cities/events into one order. Revalidate a saved cart's date when restored.

## 3. Customer ordering process

### Step 1: When and how

**Regular Cebu/branches:** choose fulfillment date, pickup/delivery, and a complete one-hour time slot. Location is already selected at the top of Order, not repeated in the details form. Only enabled fulfillment methods appear. Enter delivery address later.

**Drops:** show selected event and date, same-day ordering status, and pickup/delivery choices supported by that drop. Show the single pickup or dispatch window; do not ask for hourly slots. Future dates are preview-only. Pickup is the default; delivery is optional per drop.

Label delivery times **Delivery dispatch window**, explaining that arrival depends on rider availability/travel. The shop arranges delivery. Customer-booked riders count as pickup.

### Step 2: Pies, packages, and extras

- Regular ordering: available pies first. At the bottom, an **Unavailable for this date** section is collapsed by default; expanded entries are disabled, explain why, and offer Change date. Globally disabled products and seasonal products with no eligible dates remain hidden.
- Reuse existing availability presentation/rules where compatible, updated for the backend contract. A mixed regular/preorder cart is allowed if all sizes qualify for the chosen date.
- Changing date keeps selections and flags incompatible items. Require removing them or choosing another date before continuing; never silently discard them.
- Drop ordering: show its explicit package/individual offerings. Package cards show component pie photos, names, sizes, and fixed contents, with no substitution controls. Customers can combine packages and individually offered pies.
- Drop quantities respect the offering's per-order limit and current daily remaining stock. Clearly distinguish a per-order maximum from sold out. Displayed stock may change before submission; do not promise a reservation.
- Show **Optional extras below the pies/offerings**, within the same step. Use icons and quantity controls. Add-ons belong to the whole order and can be skipped. No pie assignment, text message, or preparation-time UI.

### Step 3: Details, review, and submit

- Require customer name and mobile number. Delivery additionally requires address. No email, account creation, or payment-method selector. Payment status is unpaid, paid, or refunded. There is no require-full-payment switch; big-order full payment is handled in chat.
- Optional order notes, maximum 500 characters. No add-on customization fields.
- Show an editable complete summary at the bottom of this step: lines, package contents, add-ons, quantities, unit prices, subtotal, fulfillment date/window/method, customer details, and delivery fee state.
- Pickup shows the final total. Delivery shows **Delivery fee: to be confirmed in chat** and **Final total pending delivery fee** until the owner sets a known fee or marks it **paid to rider**. Zero is a valid confirmed fee. **Paid to rider** means the customer pays the rider directly; no amount is recorded and the fee is excluded from the order total.
- Edit links return to the relevant section while preserving entered work.
- Include a short privacy notice beside Submit, linked to the full policy: contact details are used for fulfillment and removed immediately when completed/cancelled. No extra checkbox solely for this notice. The public Privacy and Terms pages must state this immediate removal, not a 30-day retention period, and must also describe retained transaction records consistently.
- On submit, disable duplicate clicks and display progress, but rely on backend idempotency for correctness.
- A price-change response shows updated prices/total and requires review and a new submission attempt. Do not accept the new price silently.
- Stock/eligibility errors keep cart/details and identify offerings needing adjustment. A last-stock race must never show success for a rejected order.

### Success, chat, and recovery

- Only show success after the database confirms the order committed. Show its number and **Order received—awaiting confirmation in chat**. When the backend reports `submittedAfterHours`, also show that the shop will reply in chat the next morning.
- **Copy number & open Instagram** and **Copy number & open Messenger** each copy only the number and open the shared shop link. Hide a button if its link is empty. Provide a separate Copy number control and the same clipboard fallback if copying or opening a link fails. Customers paste and send the number themselves.
- Explain that staff confirm fulfillment, arrange payment, and settle delivery fees in Instagram or Messenger. The delivery fee may be paid directly to the rider. No online payment, public status lookup, customer order-status page, or customer-visible cancel reason; cancellations are explained in chat.
- Customers request changes or cancellation in Instagram or Messenger, quoting the number. Staff update the order in admin. Customers cannot edit their own order.
- Persist pies/packages, add-ons, quantities, location/event, and schedule on that browser; revalidate on return. Do **not** persist name, phone, delivery address, or notes in local/session storage. In-memory details survive ordinary validation/request errors.
- After successful submission, clear that cart and remember only the latest success number needed to recover the success display after refresh. Do not provide unauthenticated customer/order details by number. The internal idempotency metadata needed to recover an ambiguous request must not retain personal payloads in browser storage.
- A connection failure says the order could not be confirmed and allows retry with the **same** intended submission key. Never imply definite failure if the save may already have committed. Changed order content uses a new key only after resolving an ambiguous prior attempt.
- During database outages, retain cached browsing where possible and preserve checkout input. Never fabricate an order number or successful save.

## 4. Admin navigation and pages

Admin pages: **Orders, Products, Add-ons, Schedules, Drops, Storefront, Settings**. Orders is the post-login landing page. No separate analytics dashboard or Kitchen page; Daily lineup, on Orders, is the per-date packing and baking summary.

### Admin UI conventions

- Admin server data uses the shared TanStack Query cache and private realtime invalidation. Follow [Admin query cache](ADMIN_QUERY.md) for freshness, draft protection, session cleanup, and deployment order.

- Before building an admin control, check the existing shadcn components and registry for a suitable primitive. Reuse it when available. Use base-nova control sizing throughout admin, with the sidebar as the sizing exception. Ask before choosing a custom replacement if the fit is unclear. Use a Badge for connection status and a Popover for the Orders filter button.

- Keep the compact shared header, Geist Sans, shadcn Neutral palette, near-white canvas, white panels, base-nova radius, and opaque mobile drawer. Preserve the sidebar logo and fixed icon positions. On Orders, show the connection state beside the title and place the list directly on the page beside a bordered detail panel.
- Use the shared shadcn Sidebar, Tabs, Collapsible, and Sheet for navigation, view switches, disclosures, and editors. Keep the global New order and notification controls in the header and the account menu in the sidebar footer.
- Keep shell chrome stable on route changes. Fade incoming content briefly, slide the full active navigation highlight, and fade sidebar labels during collapse. Use short, interruptible transitions and honor reduced motion.
- Let Sheets finish their exit before unmounting. Keep draft confirmation and return focus to the opener. Preserve semantic tabs, accessible names, current-page state, and visible keyboard focus.

### Login and shared account behavior

- shadcn email/password login, clear inline errors, pending state, and password visibility control where useful. No signup/customer accounts or MFA setup in MVP.
- Stay signed in until logout/revocation/refresh failure. Use the backend session flow; no browser-stored refresh token.
- Forgotten password provides developer-assisted recovery guidance rather than pretending self-service email exists.
- Show signed-out/expired access cleanly and return to login. Do not display previously loaded personal details after logout.

### Orders

**Main split view:** list on left, selected order on right. List shows number/submission time, customer name until anonymized, pickup/delivery, fulfillment date/window, order/payment status, and total, delivery-fee-pending subtotal, or paid-to-rider total.

- Choose an **Order queue** above the tabs. Separate regular branches, active drops, and past drops. Each drop has its own queue labeled with its city and event name. Remember the device's last queue and default to Cebu regular orders when that choice is unavailable.
- Default **Needs attention**, plus **Today** and **All orders** views with counts. Scope server counts, exact order number search, date, order/payment status, fulfillment filters, and pagination to the chosen queue.
- Show the branch or drop in order details and notifications. Opening a notification or a direct order link selects the order's queue and opens the order even when current filters exclude it. Preserve open drafts.
- Private Realtime updates, no polling. Fetch on entry/reconnect, show Reconnecting when disconnected, and reconcile current results on events. Do not overwrite unsaved form edits with background updates; surface a stale-record warning.
- New-order notifications appear in the shared header bell with an unread count and open the relevant order when clicked. Received notifications and read status stay on the current browser, scoped to the admin account and environment. Sound is off by default, optional, and remembered per device. No closed-site background alerts.
- Separate **Confirm order**, **Complete order**, and **Cancel order** actions with backend prerequisites. Confirming a delivery order requires a known fee or **customer pays rider**. Complete/cancel dialogs explicitly warn that personal details are permanently removed. Paid cancellations require recording the refund first.
- Completed/cancelled content is read-only and displays an anonymized state. Mark refunded remains available for completed orders.

**POS-style new/edit Sheet:** shadcn Sheet slides in from the right; desktop width 80vw capped at **1440px**, full width on phones.

- Left: searchable/category-organized allowed pies/packages and add-ons, size selection, and quantity controls.
- Right: order summary, quantities, read-only item prices, delivery fee (a known amount including zero, or **customer pays rider**), subtotal/final total. Keep Save changes/Create order and Discard controls visible.
- Collapsible **Order details** contains customer fields, pickup/delivery, date/window, and notes. All changes save together.
- Existing lines preserve snapshot prices; additions use current applicable prices. Display live provisional totals; backend recalculates on save.
- Availability overrides require warning/confirmation. Never offer stock-limit bypass or package substitutions. Preserve fixed package contents and source drop identity.
- Unsaved closing prompts to discard or keep editing. Stale saves show a reload/review path rather than overwriting newer data.
- On phones use Items/Summary tabs; ensure details and totals remain reachable.

**Daily Lineup sidebar destination:** select fulfillment date and location/drop. Show packing totals and baking totals, including confirmed/completed orders only. Expand package components into baking totals without duplicating inventory use; include add-ons separately for packing.

### Products

- Split searchable list/editor. List includes image, name, enabled status, and seasonal dates. Enabled/Disabled filters retain disabled records for reuse.
- Editor: one panel with product details above the sizes and one Save changes action. Include name, short/full descriptions, allergens, section, enabled flag, optional product-wide dated season, shared regular image, and sorting. New products start disabled.
- Sizes table: label, price, regular/preorder, enabled status, regular-branch assignments, order, regular image, and theme-specific images. Lead time comes from the shared preorder setting, not a per-size field.
- Visual picker for known deployed images; show resolved fallback previews. New products may use the default image. No upload control or arbitrary external image URL.
- Drag-and-drop and Move up/down for products within sections and for sizes. Explicit saving and discard protection.
- Disable-only products and sizes; existing orders remain unchanged. Do not expose product-specific blocked dates or add-on compatibility settings.

### Add-ons

- Split searchable list/editor: name, unit price, curated icon picker/default icon, enabled status, location assignments, and display order.
- One shared price, quantity-based customer selection, disable-only, explicit Save changes.
- No images/theme photos, per-pie scope, custom text fields, or lead-time controls.

### Schedules

- Regular branch selection on left; weekly ordering window/weekdays and pause switch on right. Explain shared pickup/delivery schedule and generated one-hour slots.
- Date overrides open or close dates with replacement hours. Show affected orders before changing dates; never silently cancel/reschedule them.
- **Accepting orders** toggle can pause all new orders for that branch. Display its public paused message.
- Link to Settings for shared seven-day horizon/three-day preorder preparation. Link drop locations to Drops rather than exposing a misleading weekly schedule.

### Drops

- Split searchable list/editor, grouped Draft, Published, Ended.
- Event editor sections: location/name; pickup address/map; pickup/delivery; dated ordering hours and pickup/dispatch windows; offerings; daily allocations; add-ons; preview/lifecycle actions.
- Same-day ordering is clearly explained; drop stock is planned and baked ahead. Each date has its own opening/cutoff and allocation. Default the lineup across dates, with per-date exclusions. New dates copy the previous date’s hours and start with zero stock. Booked dates and their pickup and dispatch windows are locked.
- Package editor selects exact sizes/quantities and shows component imagery. Price initially sums components but is editable/fixed afterward. Show contents locked once ordered; create another offering for another combination.
- Individual offerings have fixed prices; per-order maximums are separate for every offering. Explain that customers can place additional orders and that limits are not per person.
- Daily allocation grid shows allocated, committed, remaining. Reject lowering below committed stock and handle stale updates. Explain pending orders already consume allocation.
- Add-ons on by default from the location's enabled set; permit narrowing/disabling.
- Draft preview, explicit Publish/unpublish, ended state, and Duplicate drop. Duplicates require new dates/hours/allocations before publishing.
- Source products/sizes must be enabled; explain that the drop replaces normal weekday/season/preparation/branch restrictions.

### Storefront

Use clear sections/tabs for **Theme, Featured pies, Menu sections, Pop-ups, Links**.

- **Theme:** choose an installed theme, then Save changes to publish. Preview opens a protected new tab with a **Previewing [theme]—not published** banner. Preview supports browsing but disables all order submissions and never changes visitors' published theme.
- **Featured pies:** ranked list can exceed four; reorder with drag/drop and up/down. Explain the first-four-eligible rule and fallback filling; preview the current resolved four without changing the ranking.
- **Menu sections:** name, optional note, sorting, weekdays. Explain weekdays apply to regular sizes; block deletion until products are reassigned.
- **Pop-ups:** city, name, address/map, dates, hours, descriptive items. Informational only. Hide after the end date in Manila time (Asia/Manila). Expired records remain editable.
- **Links:** shared Instagram/DM/Messenger. Regular-branch GrabFood/Foodpanda links live with branch settings; empty buttons are hidden. Validate URLs.
- Every mutation explicitly saves and invalidates the relevant public cache. Visitors already browsing see changes on refresh/navigation, not a forced page replacement.

### Settings

- **Branches and cities:** create regular/drop locations; edit address/map, hours label, visibility, fulfillment options, and regular-branch delivery-app links. Cebu cannot be hidden. A city without a published drop is not an ordering option merely because it exists.
- **Ordering rules:** shared regular booking horizon initially **7 days**, shared preorder preparation initially **3 days**. Explain drops use their own dates/hours. The 24-hour storefront cache TTL is server configuration, not a confusing product setting.
- **Account:** change password with current-password confirmation; other sessions are revoked. Logout. MFA and email-based recovery remain deferred.
- **Backups:** one-time recovery-key setup/download and safe-storage acknowledgement; choose a dedicated local folder; enable daily-on-visit encrypted backups; Back up now; last successful local save and permission/error state.
- Backups target desktop Chrome. Explain no admin visit means no backup, no closed-browser scheduler, no historical catch-up, no customer contact/notes in exports, and recovery is developer-assisted.
- Re-request folder permission when necessary; manual download on unsupported browsers/devices. No silent unencrypted backup. No daily passphrase prompt.
- After successful new folder save, remove only recognized app/environment backup files older than 14 days. Do not touch unrelated files/recovery keys or delete old copies after failure. Ordinary manual downloads cannot be cleaned up automatically.
- Expose no one-click Restore button. Recovery keys and successful filesystem writes must not be confused with merely initiated downloads.

## 5. Frontend implementation sequence

Begin only after the backend gate passes:

1. **Admin foundation:** shadcn theme/navigation, login/session integration, responsive split layouts, shared forms/feedback, protected routes.
2. **Orders:** list/detail, real queries, Realtime/reconnect, notification/sound preference, POS new/edit Sheet, transitions, anonymized states, daily lineup.
3. **Catalog and regular operations:** Products, Add-ons, Schedules, shared Settings and location management.
4. **Drops:** complete event/offerings/allocation workflow, publish/unpublish/duplicate, administrative validation states.
5. **Storefront and backup controls:** content management, theme preview, featured ranking, pop-ups/links, encrypted export integration and local folder lifecycle.
6. **Customer integration:** Find us/discovery, Order routing/location/drop picker, regular/drop checkout, success/chat, cart restoration and failure handling.
7. **End-to-end acceptance:** desktop/tablet/phone and supported-browser checks against sandbox backend; production configuration smoke check before launch.

## 6. Frontend acceptance scenarios

- shadcn consistency across login and all admin pages; POS-reference direction; keyboard/touch/reduced-motion accessibility; working narrow-screen alternatives to split panels.
- Direct Instagram links, plain Cebu links, multiple-drop picker, ended/unpublished links, selector URL changes, per-event cart isolation, and no location-query leakage through unrelated navigation.
- Cebu always visible in Find us; all-city upcoming drops, informational-only pop-ups, automatic event expiry, homepage remaining Cebu-focused, and first-four featured fallback.
- Regular date/method/slot selection, unavailable collapsed section, seasonal hiding, mixed regular/preorder cart, date-change preservation, drop same-day preview/open/closed/sold-out states, package limits and immutable contents.
- Order-level add-on quantities/icons; required details; no persistent personal browser data; editable final summary; delivery fee unknown versus known amount versus paid-to-rider; no payment-method selection.
- Price-change review, stock-race rejection, ambiguous network failure/idempotent retry, no duplicate order on repeated click, successful cart clearing, and success-number recovery without public personal-data access.
- Clipboard or open-Instagram/Messenger failure fallback, hidden empty chat buttons, pending-confirmation wording, after-hours next-morning reply, dispatch versus arrival wording, and change/cancellation guidance in Instagram or Messenger.
- Real admin filtering/pagination, current selection across live changes, reconnect reconciliation, no polling, sound off by default, click-to-open notifications, and no overwritten unsaved work.
- POS create/edit atomic save, quantity changes and saved item prices, delivery fee or customer-pays-rider control, stale-save handling, cancel/discard prompts, status/payment prerequisites including delivery confirm requiring a known fee or paid-to-rider, irreversible anonymization warning, terminal read-only state, and completed-order refund.
- Drop publish prerequisites, duplicate resets, daily allocation/per-order limit distinction, sold-out competition, no substitution, and separate baking/packing summaries.
- Protected theme preview isolation/no checkout; Save changes required; image fallback for each size/theme; no public theme-query override.
- Recovery-key setup, real encrypted file save, first-visit-per-day behavior, denied/expired permissions, concurrent tabs, 14-day cleanup after success only, unsupported-browser/manual fallback, and no raw personal fields in decrypted test exports.

## Done when

Every agreed customer and owner operation works through the verified backend without manual database edits for routine shop operations. Production and sandbox stay isolated, owner permissions and privacy are enforced server-side, and the end-to-end acceptance scenarios pass. Provisioning, new image deployment, forgotten-password recovery, and disaster restoration remain the documented developer-assisted exceptions.
