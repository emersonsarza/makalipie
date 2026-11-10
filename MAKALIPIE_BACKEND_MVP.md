# Makalipie Backend MVP

Agreed MVP contract, updated November 9, 2026. This document specifies backend behavior and delivery order; it does not implement application code.

**Develop and verify the complete backend first. Build the frontend afterward using [MAKALIPIE_FRONTEND_MVP.md](MAKALIPIE_FRONTEND_MVP.md).** Backend work includes database migrations, server operations, authentication, authorization, validation, cache invalidation, Realtime authorization/events, encrypted export, and recovery tooling. It does not include customer or admin screens.

The shop continues confirming orders, arranging payment, and supporting customers in chat. The website records orders and gives customers an order number. Cebu uses regular ordering. Manila and future drop locations use event-specific offerings with daily allocation.

This contract supersedes conflicting rules in the older ordering/data-flow documents. In particular, regular daily capacity, cart reservations, and reservation timers remain deferred, but **drop allocation is included**. Update implementation notes in the older documents when implementation begins; do not recreate their old hold system. [README.md](README.md) must also identify the VPS as sandbox and Vercel as production when implementation begins.

## 1. Environments and delivery boundaries

| Environment | Application | Database and authentication |
| --- | --- | --- |
| Production | Vercel Production | Production Supabase Cloud project |
| Preview | Vercel Preview | Sandbox Supabase Cloud project |
| Sandbox | VPS, existing Docker Compose setup, port 3006 | Sandbox Supabase Cloud project |

Use two Supabase projects in Singapore unless they already exist. Keep databases, Auth users, secrets, caches, channels, and encryption configuration separate between production and sandbox. Never seed real customer data into sandbox. Free-tier quotas and inactivity pausing are operational constraints, not an availability guarantee; verify current limits during provisioning.

- Server-only configuration includes `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Never expose the secret key, commit credentials, or pass runtime secrets as Docker build arguments.
- The signed-in admin browser may receive the Supabase URL, publishable key, and short-lived owner access token for private Realtime only. This is the explicit exception to the original server-only Supabase design.
- Browser order reads and writes go through the website. Public visitors cannot read or mutate application tables directly through Supabase.
- Images ship from the repository's `public` folder with each deployment. No Supabase Storage or image upload service.
- Read the installed Next.js guides in `node_modules/next/dist/docs/` before implementing framework behavior. Do not assume historical cache or authentication APIs.

## 2. Shared domain contract

### Money, time, identity, and concurrency

- Store prices as integer centavos. All product sizes and drop offerings require a price; remove quote-required pricing from new ordering paths.
- Fulfillment dates, opening hours, cutoffs, seasons, backup-day checks, and daily numbering use **Asia/Manila**. Store event timestamps in UTC.
- Give orders stable internal identifiers separate from their display numbers.
- Number format: `MP-MMDDXXX`, initially zero-padded to three sequence digits, expanding beyond 999 without a daily cap. Example: `MP-1108001`; sequence 1000 becomes `MP-11081000`.
- Restart the sequence each Manila submission day. Store the full date and sequence with a database uniqueness constraint. Display numbers may repeat in another year; searches return newest matches first, not a single assumed-unique match.
- Mutable admin records use an optimistic concurrency token (`updated_at` or an equivalent database-managed version). A stale update fails without overwriting another save. Compare and write atomically, including child-record changes.
- Validate structured input, field lengths, integer quantities, known IDs, prices, dates, and fulfillment methods on the server. Never trust browser totals or public price overrides.

### Locations, regular branches, and drops

- A location is either a **regular branch** or a **drop location**. Cebu is a regular branch and always visible. Manila starts as a drop location with no published drop.
- Owners can create additional regular branches and drop locations. Creating a city/location alone does not make it publicly orderable.
- Regular branches have an address, map link, hours label, product/size and add-on assignments, pickup/delivery settings, visibility, and an accepting-orders switch.
- Drop locations have no regular weekly ordering. Published events determine their offerings, dates, fulfillment addresses, windows, and allocation.
- Pausing a branch blocks new customer orders for all dates while keeping its menu visible. Existing orders remain unchanged. Owner availability overrides remain explicit; stock limits can never be overridden.
- Pop-ups are informational only. They belong to a city and never become checkout locations or stock-bearing events.

### Products and images

- Product fields: required name; optional short description, full description, and allergens; one required menu section; enabled flag; display order; shared regular image; optional seasonal start/end dates including the year.
- Product seasons apply to every size, are inclusive, and constrain **fulfillment date**, not submission date. No annual recurrence or product-specific blocked dates.
- Without a seasonal range, an enabled product follows its other availability rules. Seasonal products appear publicly only when at least one eligible date exists inside the regular booking horizon for the relevant branch. Show the season clearly.
- Each size has a label, required price, regular/preorder mode, enabled flag, ordering position, regular image, theme-specific image mappings, and regular-branch assignments.
- A product can mix regular and preorder sizes. Preorder lead time is one shop-wide setting, initially **three days**. Regular sizes have no preparation delay.
- Regular sizes follow menu-section weekdays. Preorder sizes may use any open branch day, subject to preparation and season. Preserve the existing preparation-start semantics from the scheduling rules unless explicitly superseded here.
- Every product belongs to exactly one menu section. Sections have name, note, order, and weekdays. Reject deleting a section while products remain assigned.
- Reorder products within sections and sizes within products. Products and sizes are disable-only, not permanently deleted. Existing order snapshots survive all catalog changes.
- Accept image references only from a known deployed asset manifest under `public`; new images require deployment. New products may use the default image immediately.
- Size image fallback: published-theme size image → regular size image → shared regular product image → default product image. Apply consistently wherever that size is rendered. Expose image resolution for frontend reuse.

### Add-ons

- Add-ons belong to the **whole order**, are selected after pies, and have integer quantities with unit price multiplied by quantity.
- Fields: name, shared unit price across branches, icon, enabled flag, sort order, and location assignments. Use a curated icon identifier and a default icon; no uploaded photos or theme-specific images.
- No per-pie attachment, product compatibility lists, preparation days, or customization/message fields. Remove those legacy concepts from new schema, validation, and pricing paths.
- Disable-only. Preserve name, icon identifier, unit price, quantity, and total in order snapshots.
- Drop add-ons are **enabled by default**, initially using enabled add-ons assigned to the location. The owner may disable them or narrow the selection per drop. Add-ons do not consume pie/package allocation.

### Regular schedules

- One ordering window per regular branch, shared by pickup and delivery: enabled, opening time, cutoff, and weekdays.
- Generate complete one-hour slots within that window. A slot that has started cannot be selected. Same-day ordering stops at cutoff; later eligible dates remain available.
- Shop-wide booking horizon defaults to **seven days**, editable in Settings. It does not control drop dates.
- Date overrides can close a normally open date or open a normally closed date with replacement hours. Date overrides take priority over weekly hours/weekdays. Branch pause still blocks customer ordering.
- Closing/changing a date with existing orders returns affected-order information for an admin warning. Do not automatically move or cancel those orders.
- Reuse and update the existing catalog and scheduling rules as the shared source for customer and server validation. Explicitly add seasonal ranges and replacement windows; remove obsolete add-on and product-exception behavior.

## 3. Drops and daily allocation

### Event setup and lifecycle

- Each drop is its own event: name, stable public slug, location/city, pickup address/map, fulfillment dates, ordering hours per date, pickup window per date, optional dispatch window per date, offerings, prices, add-ons, and allocation.
- Pickup-only by default. Delivery may be enabled per drop; the shop arranges it. A customer-booked rider counts as pickup.
- Every date has an owner-set ordering opening and cutoff time. **Same-day ordering only**: no advance orders for future drop dates. Reject orders outside today's configured opening/cutoff even if the event is published.
- Drop customers do not choose hourly slots. They collect within that date's single pickup window or receive dispatch within its separately configured delivery window. Store the applicable window in the order snapshot.
- Lifecycle: **Draft → Published → Ended**. Drafts are absent from public discovery and ordering. Published drops may be previewed before opening. End automatically after the final pickup/dispatch window. Unpublishing removes public ordering without changing existing orders.
- Sold-out/closed dates remain visible during the event with ordering disabled. Ended drops leave public listings; direct old links show an ended state rather than silently switching to a different event.
- Duplicate creates a new draft with copied location, offerings, fixed prices, add-ons, and per-offering limits. Require new dates, ordering hours, fulfillment windows, and daily allocations before publishing. Do not copy sales, orders, or allocation usage.

### Offerings and packages

- A drop can offer fixed packages, individual pie sizes, or both. Customers may combine a package and individual offerings in one order for the same drop/date.
- A package is one box containing exactly four pies, with fixed component product sizes/quantities. No customer or staff substitutions. Customers choose box quantities, not contents.
- Initial package price is the sum of component size prices multiplied by their component quantities. Save it as an editable fixed offering price. Later catalog price changes do not automatically change it.
- Individual drop offerings also have a saved price, initially copied from the selected size. Existing drop/order prices must not silently follow later catalog edits.
- Lock package contents after the first order uses it, including pending orders. A changed combination requires a new offering; old orders retain their original composition.
- An explicitly offered size overrides normal section weekdays, season, branch assignment, and regular/preorder lead time. The drop's dates, opening/cutoff, and allocation govern it. Disabled source products/sizes remain blocked for new orders until re-enabled; existing orders do not change.
- All dates default to the same lineup. The owner can exclude an offering on individual dates. Offering prices and per-order limits are shared across the drop; allocation is separate per date.
- Package imagery is derived from its component sizes, using the same theme fallback. No separate package photo is required.

### Allocation and per-order limits

- Maintain allocation **per offering per fulfillment date**, not shared across dates or pie ingredients. Example: Package 1 has 20 boxes on one date and 15 on another; Chicken Butter has its own daily pie allocation.
- Selling a package consumes package boxes only. Do not also deduct component pie allocation. Baking summaries expand components for reporting only.
- Each offering has its own positive per-order maximum shared across the event's dates. No combined package cap, per-person cap, daily customer cap, or identity-based blocking. Customers may submit multiple intentional orders.
- Aggregate repeated references to an offering before validating limits. Availability shown in the browser is advisory; the database decides at save time.
- **Submission consumes allocation**, including pending/unpaid orders. Carts do not reserve stock; no hold timer or automatic pending expiry.
- Create the complete order, decrement every affected allocation, assign the daily number, save snapshots, and persist idempotency in one transaction. Lock/check affected allocation rows consistently or use equivalent conditional writes. Never oversell under concurrent submissions.
- If any offering lacks quantity, reject the entire order with current availability for affected offerings. Save no partial order and deduct nothing. Preserve customer input in the frontend.
- Apply the same transactional protection to admin-created orders, quantity changes, date moves, offering changes, and cancellation. Moving an order releases old allocation and consumes the destination atomically. Reject stale saves without leaking allocation.
- Cancellation releases committed quantities once. Completion and refunds alone do not return inventory. Retrying an already successful request never deducts again.
- Owners may increase allocation but cannot lower it below committed quantities. Display allocated, committed, and remaining values. Availability overrides do not override stock or per-order limits.

## 4. Orders, administration, and privacy

### Submission and snapshots

- Public submission selects one regular branch or one drop/date, fulfillment method, schedule, pie/package lines, order-level add-ons, customer name, phone, optional notes (maximum 500 characters), and delivery address when required.
- No customer account, email field, payment-method selection, or payment gateway. Remove the prior payment-choice contract.
- Regular and preorder sizes may share a regular order if all qualify for its date. Do not mix locations, drops, or dates in one order.
- Ignore browser prices. Validate against fresh database data, including branch pause, offering enablement, schedule, product rules or drop rules, quantities, and prices.
- If the submitted reviewed prices no longer match, return a price-change response for explicit customer review; do not silently save at the new amount.
- Require an idempotency key per intended submission. Same key and same normalized payload returns the original order number. Same key with a different payload is rejected. A changed cart uses a new key. Store a digest rather than retaining personal data in idempotency payload copies.
- A single transaction saves order, line/add-on/package-component snapshots, number, and any allocation commitments. Order numbers are returned only after commit.
- Snapshot product/size/package names, fixed package composition, prices, quantities, fulfillment location and windows, and add-ons. Historical financial and operational records must not depend on mutable catalog values.
- New orders start `pending` and `unpaid`. Pickup total is final immediately. Delivery fee is nullable until confirmed; zero is a confirmed fee. Expose subtotal and a pending-total state instead of presenting an unknown-fee subtotal as a final total.
- Delivery slots/windows mean **dispatch**, not promised arrival. The shop arranges riders. Payment, final confirmation, and customer changes/cancellations happen in chat using the order number.
- Success returns the number, not a public customer-data lookup. No unauthenticated order details endpoint keyed by a guessable number.

### Admin queries and changes

- Orders are the admin landing page. Database-backed, paginated search/filter queries; never assume a cached subset is complete.
- Views: Needs attention (pending first, then confirmed by fulfillment date), Today (today's pickups/dispatches), and All orders. Search by number; filter location, date, order status, payment status, and pickup/delivery.
- Owner can create orders using the same server contracts. They start pending/unpaid and use normal numbering, snapshots, and allocation protection.
- Owner can edit customer details, notes, fulfillment method/date/window, delivery fee, lines, quantities, and prices on pending/confirmed orders. Save all changes together. Return validation/availability warnings and require explicit owner confirmation to bypass regular availability rules.
- Never bypass stock, numeric validation, authorization, or per-order drop limits. No package substitutions. For drop orders, offerings remain scoped to the chosen event/date.
- Existing lines retain saved prices when quantities change. Additions use current applicable catalog/drop prices. Manual admin price overrides are explicit. Never automatically reprice the whole order. Server calculates all totals.
- Repricing and payment status are distinct: no automatic collection/refund. If a paid order's total changes, require explicit reconciliation of its payment status before save; do not silently claim an increased balance is paid.
- Status transitions are separate from general edits:
  - Confirm: pending → confirmed. Payment may remain unpaid. Delivery requires a known fee, including zero.
  - Complete: confirmed and paid → completed after fulfillment.
  - Cancel: pending/confirmed → cancelled. A paid order must first be recorded refunded; the website does not move money.
  - Completed/cancelled orders are read-only for content, prices, scheduling, and personal details. Completed orders may subsequently be marked refunded without reopening.
- Use a version check for every edit and transition. Financial changes and associated inventory adjustments are transactional.

### Immediate personal-data removal

- Completion and cancellation immediately remove customer name, phone, delivery address, and all customer free-text notes **in the same transaction** as the status transition.
- Warn before the irreversible transition. Do not restore personal fields if a record is revisited. Support uses the order number and existing chat.
- Retain number, items/component snapshots, quantities, prices, totals, statuses, fulfillment date/window, and other necessary non-contact transaction data.
- This is the agreed removal of direct personal fields, not a claim that detailed transaction history is mathematically anonymous.
- Do not retain deleted personal data in audit payloads, logs, Realtime events, idempotency records, backup exports, or error reporting. Do not log submission bodies or tokens.

### Daily lineup

- Group by fulfillment date and location/drop. Include confirmed **and completed** orders; exclude pending and cancelled orders.
- Packing summary: package boxes, individually ordered pies, and add-on quantities.
- Baking summary: expand package components and combine with individually ordered pies by product and size. Do not double-count a package as additional pie inventory consumption.

## 5. Authentication, authorization, and Realtime

### Owner authentication

- Supabase Auth manages passwords, JWT access tokens, refresh-token rotation, and session renewal. One owner account, initially created through the Supabase dashboard and allowlisted in `admin_users`. No application password column, public registration, or customer accounts.
- Password-only MVP. Authenticator-app MFA is deferred, not replaced with custom authentication.
- Stay signed in until logout, revocation, or unrecoverable refresh failure. Do not impose the previously discussed seven-day login limit; seven days refers to the regular booking horizon only.
- Use short-lived access tokens (one-hour target). Server-managed integration stores the refresh credential in a Secure, httpOnly, appropriate SameSite cookie. Standard browser-readable SSR token storage is not an acceptable substitute without revisiting this contract.
- Server owns refresh/rotation; handle concurrent requests/tabs without destroying a valid session. Admin browser obtains only the short-lived JWT needed for Realtime, held in memory. Never return the refresh token in HTML, JSON, logs, or browser storage.
- Validate the session and current allowlist membership for **every** admin read, write, preview, export, and token endpoint. A decoded JWT or hidden UI alone does not authorize access.
- Separate privileged application-data access from user-session Auth clients. Do not let a shared client accidentally inherit another request's user session.
- Protect state-changing endpoints against forged requests. Rate-limit login, token/refresh misuse, and public submission while allowing normal retries. Public order submission remains unauthenticated but validated and constrained.
- Change password requires the current password. Revoke other sessions after change, retaining/re-establishing the current one. Forgotten passwords use developer-assisted reset for MVP. Logout clears cookies, in-memory tokens, and channel subscriptions and revokes the refresh session.
- Previously issued JWTs/private channels may survive until token expiry or disconnect; do not promise immediate global WebSocket revocation. Website admin endpoints continue checking authorization.

### Data permissions and live events

- Enable RLS on every application table; revoke public/unauthorized application-table access. The privileged server key bypasses RLS, so website authorization remains mandatory.
- Use Supabase **private Broadcast** channels with explicit owner/allowlist authorization and no client publishing permission. Apply policies to Realtime authorization separately from application tables. Publish only committed order changes.
- The admin browser connects directly to Supabase Realtime. No website WebSocket relay, VPS production relay, server-cached order list, or polling.
- Event payloads contain only internal order ID and change type, no customer/contact details, prices, or notes. The browser refetches current authorized order data from the website. Events are hints, never authorization or authoritative totals.
- Support new orders and updates, including status/allocation effects where relevant. Reconcile active database-backed filters on changes; deduplicate events and notifications by order identity.
- Fetch current rows when opening Orders and after a subscription reconnects, including recovery from an event/query race. Show disconnected/reconnecting states rather than implying a live connection.
- New orders trigger visible in-admin notifications; clicking opens the order. Sound is optional, **off by default**, remembered per device, and enabled only after browser interaction permits it. No notifications when the site is closed.

## 6. Public content, caching, and links

- Load public catalog/content through server operations. Cache menu, schedules, themes, pop-ups, links, and ranked featured configuration. Group reads rather than fetching individual records repeatedly.
- Single server configuration: **`STOREFRONT_CACHE_TTL_SECONDS`**, default **86400** (24 hours). Not an admin-editable secret or a five-minute refresh loop.
- Successful owner saves invalidate the relevant public data immediately for subsequent fresh requests. Use shared host-supported caching/invalidation across running instances; do not use process memory as the consistency mechanism. Production and sandbox remain separate.
- Time expiry is a fallback triggered by access, not periodic polling. Already-open pages are not pushed to update; content refreshes on navigation/refresh. Account for client router caching when testing this behavior.
- Date/time eligibility must be evaluated against current Manila time from cached configuration. Seasons, pop-up expiry, drop opening/cutoff/end, and booking-horizon movement must not wait 24 hours. Do not cache computed visibility past its next time boundary.
- Drop allocation display is a fresh, small server read for the selected date when loading/revisiting ordering. Never treat a cached remaining count as an entitlement. Submission always checks current stock and prices transactionally.
- Admin order data and all checkout validation bypass storefront caches. Cache failure must not change financial or inventory correctness.
- Themes must already ship in code before selection. Only **Save changes** publishes a theme. Ignore public `?theme=` overrides.
- Authenticated theme preview uses a protected, uncached owner-only context; does not modify global settings or accept orders. Do not let preview cookies or cache keys leak the preview to visitors.
- Featured products are an owner-ranked list of any length. Show the first four distinct eligible Cebu products. Skip disabled/out-of-season/non-bookable products without changing the saved ranking. Fill gaps from other eligible Cebu products in menu order; show fewer only if fewer than four exist.
- Pop-ups: city, name, address/map, start/end dates, hours, and descriptive item list. Informational only. Hide after the Manila end date; retain admin records for reuse.
- Social/DM/Messenger links are shared shop-wide. GrabFood/Foodpanda links belong to regular branches; drops do not show delivery-app buttons. Hide buttons for empty links.

## 7. Data model and operation contracts

Use migrations and explicit constraints; names below describe responsibilities, not permission to copy obsolete field shapes.

| Entity/group | Responsibility |
| --- | --- |
| Locations/cities | Regular/drop mode, visibility, address/contact links, fulfillment settings, pause state |
| Products, sizes, images, assignments | Catalog copy, prices, modes, seasonal dates, section membership, deployed image/theme mappings, location availability |
| Add-ons and assignments | Order-level priced icons, quantities in snapshots, location availability |
| Menu sections | Sorting, notes, weekday rules |
| Regular schedules and overrides | Weekly windows, pause, closed/open replacement dates |
| Drops and drop dates | Lifecycle, location, ordering times, fulfillment windows, per-date settings |
| Drop offerings and package components | Fixed contents, fixed prices, per-order limits, date inclusion |
| Drop daily allocations | Offering/date allocation, committed quantities, concurrency protection |
| Orders, item/component snapshots, add-on snapshots | Financial/fulfillment history, nullable personal fields, statuses, optimistic version |
| Daily sequences and submission keys | Atomic daily numbering and duplicate-submission protection |
| Site settings and featured ranking | Theme, seven-day horizon, three-day preparation, shared links, ranked products |
| Pop-ups | City-based informational events |
| Admin allowlist | Supabase Auth owner IDs |
| Backup configuration | Public encryption key, format/key identifiers; never private recovery key or sessions |

Provide typed server interfaces for public discovery/catalog/eligibility, order submission, owner order queries/edits/transitions, lineup aggregation, catalog/content CRUD, drop lifecycle/allocation, Auth, Realtime tokens, preview authorization, and export. Use structured errors for validation, stale save, price change, unavailable stock, closed ordering, unauthorized access, and temporary failure. Return only necessary fields.

## 8. Encrypted local backup and recovery

- Backups live in **Admin Settings → Backups**. A server-side export operation and restore procedure are backend work; browser folder setup/save/delete/status is frontend work.
- Owner performs one-time encryption-key setup, downloads the private recovery key, and confirms it is saved before enabling automatic backups. Store only the public key centrally. No daily passphrase and no unencrypted fallback.
- Use a maintained authenticated hybrid-encryption implementation suitable for large exports (random symmetric key per backup, wrapped by the public key). Include format/schema version, environment, key identifier, and export timestamp. Do not invent cryptography or encrypt the entire export directly with asymmetric encryption.
- Keep private recovery keys out of database settings, server logs, and backup archives. The owner retains a separate safe copy. Loss makes the corresponding backups unrecoverable; changing keys does not decrypt older files.
- Export application configuration, catalog, drops, allocation commitments, orders/snapshots, and recovery metadata needed to avoid numbering/idempotency collisions. Exclude customer names, phones, delivery addresses, all free-text order notes **even for pending orders**, login sessions, Auth secrets, and private keys.
- Preserve an internally consistent export. Restore allocation usage consistently with restored order statuses; verify integrity rather than independently replaying deductions.
- Code, public images, migrations, Supabase Auth accounts, credentials, and external project configuration are recovered separately. This is an application-data backup, not a full Supabase project clone. Recreate/reconcile the owner allowlist with the recovery environment.
- Automatic local save runs on the first authenticated admin visit each Manila day, per configured device/folder. Existing persistent login does not prevent it. If the admin remains open across midnight, perform the day check on next return/navigation rather than requiring another login.
- **No visit means no backup that day.** No scheduler runs with the browser closed; no catch-up historical snapshots. This limitation is accepted.
- Target desktop Chrome with an explicitly granted dedicated folder. Permission may require renewal. On unsupported devices offer manual download; automatic local cleanup is unavailable there.
- Only after a new encrypted file has been saved successfully, remove this app/environment's recognized backup files in that folder older than 14 days. Never touch unrelated files or recovery keys; never delete old backups after a failed new save.
- Manual **Back up now**, last successful local-save time, permission errors, and recovery-key information are visible. Do not mark success merely because a download was initiated. Prevent concurrent tabs from performing duplicate/conflicting folder maintenance.
- Restore is developer-assisted, tested first in an isolated recovery database, with explicit selection of backup/environment and safe handling of newer live data. No admin Restore button in MVP.
- Pending order contact/delivery details cannot be restored; recover them from customer chat. Completion/cancellation privacy rules remain true after restore.

## 9. Backend-first implementation and acceptance gate

**Do not start the new frontend implementation until all backend stages below pass.** Existing frontend code may be inspected to understand compatibility, but it is not proof the new contracts are implemented.

1. **Schema, environments, and Auth:** migrations, constraints, RLS/grants, separate projects, owner allowlist, server-managed sessions, change-password/logout/reset procedure, initial seed.
2. **Catalog/content and regular eligibility:** product/size/add-on contracts, asset manifest and fallback, sections, seasonal eligibility, schedules/overrides, location discovery, themes/preview authorization, featured selection, links/pop-ups, cache invalidation.
3. **Drops:** draft/publish/end/duplicate, explicit dates and windows, fixed package snapshots, daily allocations, limits, and complete validation.
4. **Orders and privacy:** atomic public/admin creation, idempotency/numbering, fresh-price review, editing/allocation moves, status/payment transitions, immediate personal-data removal, search/filter/pagination, lineup aggregation.
5. **Realtime and resilience:** private owner-only channel permissions, committed minimal events, token handling, reconnect reconciliation contracts, clear failure responses.
6. **Export and recovery:** encrypted versioned exports without personal fields, one-time public/recovery-key flow, documented restore and successful isolated restore exercise.
7. **Handoff gate:** document typed operation inputs/results and setup/configuration, run contract/integration tests, verify sandbox behavior, and record results. Frontend begins only after this gate passes; no reliance on mock-only business behavior.

Seed Cebu, hidden/unpublished Manila drop location, current pies/sizes, compatible simplified add-ons, menu sections, ranked featured pies, links, Sunday Market pop-up, Christmas theme, Cebu 10:00–19:00, seven-day horizon, and three-day preorder lead time. Migrate legacy image/rule data deliberately. Do not seed fabricated published drops, stock, or customer orders into production.

### Required backend verification

- Anonymous and non-owner users cannot access admin tables, operations, exports, preview, or private channels. Publishable key alone grants no application data. Events contain no personal information; browser never receives refresh or secret credentials.
- Refresh rotation across tabs, expiry/revocation, logout, current-password verification, and other-session revocation after password change.
- Manila midnight, inclusive seasons, seven-day boundary, preparation across closed dates, full one-hour slots, elapsed slots, date override opening a closed weekday, pause behavior, and drop same-day opening/cutoff/window/end boundaries.
- Disabled products/sizes, drop override rules, shared/add-on pricing, quantity validation, fixed package composition lock, and date-specific offering enablement.
- Real concurrent database submissions competing for the last allocation: only the valid winner commits; loser saves nothing. Cover multiple offerings, distinct daily stock, aggregate per-order limits, cancellation, admin edits/date moves, stale writes, and idempotent retries.
- Concurrent daily numbering, sequence beyond 999, cross-year number search, idempotency payload mismatch, transaction rollback, and updated-price review.
- Delivery fee unknown versus zero, paid/confirmed completion gate, paid cancellation requiring refund, terminal read-only behavior, later completed-order refund, immediate personal-field deletion, and non-PII logs/exports.
- Filtered/paginated completeness, out-of-order/duplicate live events, reconnect recovery, and package packing/baking totals including completed orders without double counting.
- Cross-instance cache invalidation, fallback TTL, date-boundary eligibility, protected theme preview isolation, ranked four-item fallback, and images resolving across both themes.
- Encrypted export tamper detection, successful restore with recovery key, failure without/wrong key, consistent allocations and numbering after recovery, and absent personal fields/sessions/secrets.

## 10. Still outside MVP

- Regular Cebu daily capacity; shared ingredient/component inventory; cart reservations/timers; automatic expiry of pending orders.
- Online payment, automatic money movement, delivery fee calculation, delivery-area validation.
- Customer accounts, public order-status lookup, customer live updates, email/chat/push notifications, background alerts while admin is closed.
- Analytics dashboards, multiple staff roles, branch-level permission roles, authenticator-app MFA, self-service password-reset email.
- Image uploads/Supabase Storage, automatic server/cloud backups, guaranteed daily backups without an admin visit, browser-based restore.
- Product-specific blocked dates, add-on customization/preparation/product compatibility, package substitutions, and permanent product/size/add-on deletion.

## Done when

The backend acceptance gate passes in sandbox with real database concurrency and recovery checks, production/sandbox isolation is verified, and every agreed frontend operation has a documented authorized server contract. Then implement the frontend plan. The complete MVP is done only when both documents' acceptance criteria pass.
