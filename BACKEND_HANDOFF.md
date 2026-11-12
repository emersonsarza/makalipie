# Backend handoff

What the server already does, for the frontend that comes after the sandbox check. Behavior and rules stay in [MAKALIPIE_BACKEND_MVP.md](MAKALIPIE_BACKEND_MVP.md). This file lists the calls.

Public pages still read the static catalog in `src/lib/catalog/seed-data.ts`. These routes are ready; the pages do not call them yet.

Money is integer centavos. Dates are `YYYY-MM-DD` in Asia/Manila. Clocks are `HH:MM`. Slugs are lowercase letters, numbers, and hyphens. Every response sends `cache-control: no-store`.

## Calling rules

Owner calls send the `mp_refresh` cookie. The server rotates that cookie on each owner call. Keep the latest `Set-Cookie` value. The refresh token is httpOnly and is never in the JSON body.

`POST` and other owner writes also send `Origin` equal to the request host. A mismatch is `403 forbidden_origin`. Owner `GET` does not require `Origin`.

A signed-in user who is not on the allowlist gets `401 unauthorized` and the cookie is cleared. A missing or dead session is `401 unauthenticated`.

The access token in a session or realtime response is for memory only. Use it for the private Realtime channel. Do not store it beside the refresh cookie, and do not send the secret key to the browser.

## Setup

Local checks use Docker and the Supabase CLI.

```bash
npm run supabase:start
npm run supabase:env
npm run allowlist-owner
npm run test:handoff
```

`npm run supabase:env` writes `.env.local`. `npm run allowlist-owner` allowlists `nika@makalipie.com`. `OWNER_PASSWORD` in `.env.local` can create that user locally. The password stays in Supabase. There is no reset email.

| Name | Purpose |
| --- | --- |
| `SUPABASE_URL` | Local or hosted Supabase URL |
| `SUPABASE_PUBLISHABLE_KEY` | Browser key for private Realtime. It cannot read application tables |
| `SUPABASE_SECRET_KEY` | Server only. Never `NEXT_PUBLIC_*` and never a Docker build argument |
| `OWNER_PASSWORD` | Optional. Local user creation only |
| `STOREFRONT_CACHE_TTL_SECONDS` | How long a public catalog snapshot may be reused. Default 86400. Eligibility is still calculated per request |
| `BACKUP_ENVIRONMENT` | Stamp on an encrypted export. Local uses `local` |

Hosted Singapore Supabase and the VPS were not part of this handoff. When that sandbox exists, run the same six phase files with `--env-file=.env.sandbox` instead of `.env.local`. Do not seed real customer orders into it.

## Session

| Call | Who | Input | Result |
| --- | --- | --- | --- |
| `POST /api/admin/session` | Public, with Origin | `{ email, password }` | `200 { accessToken, expiresAt, user: { id, email } }` and the refresh cookie |
| `GET /api/admin/session` | Cookie | None | Same session body. Rotates the cookie |
| `POST /api/admin/session/refresh` | Cookie, with Origin | None | Same session body |
| `POST /api/admin/session/logout` | Cookie, with Origin | None | `200 { ok: true }` and the cookie is cleared |
| `POST /api/admin/session/password` | Owner, with Origin | `{ currentPassword, newPassword }` | New session body. Other sessions are revoked |

Sign-in allows 10 attempts per IP per 15 minutes, then `429 rate_limited`. A bad password is `401 invalid_credentials`. A missing field, or a new password shorter than 8, longer than 72, or equal to the current password, is `400 invalid_request`.

## Catalog

`GET /api/admin/catalog` is owner-only. It returns the editor catalog: `revision`, `settings`, `locations`, `sections`, `products`, `addOns`, `schedules`, `overrides`, `featuredIds`, and `popups`, including hidden rows and `updatedAt`. The admin response also includes `imagePaths` for the deployed image picker.

`POST /api/admin/catalog` is owner-only, with Origin. Body is `{ action, payload }`. A save returns `{ revision, affectedOrders }`. `affectedOrders` is empty until a later change reports orders. Send the `revision` from the last read. A stale revision is `409 stale_save`.

| Action | Payload |
| --- | --- |
| `save_location` | `id`, `kind` `regular` or `drop`, `name`, `address`, `mapUrl`, `hoursLabel`, `visible`, `pickupEnabled`, `deliveryEnabled`, `acceptingOrders`, `grabFoodUrl`, `foodpandaUrl`, optional `updatedAt`. Cebu stays visible. A drop location has no Grab or foodpanda link |
| `save_section` | `id`, `name`, `note`, `sortOrder`, `weekdays` (0 Sunday through 6 Saturday), optional `updatedAt` |
| `delete_section` | `id`, `updatedAt`. `409 section_in_use` when a product still belongs to it |
| `reorder_sections` | `items: [{ id, updatedAt }]` |
| `reorder_products` | `sectionId`, `items: [{ id, updatedAt }]` |
| `save_product` | `id`, `name`, descriptions, `allergens`, `sectionId`, `enabled`, `sortOrder`, `imagePath`, `imageAlt`, `seasonStart`, `seasonEnd`, `themeImages`, `sizes`. Image paths are existing `/images/...webp` files. A size has `priceCentavos`, `mode` `regular` or `preorder`, `branchIds` |
| `save_addon` | `id`, `name`, `priceCentavos`, `icon` `gift`, `note`, or `default`, `enabled`, `sortOrder`, `locationIds` |
| `save_schedule` | `locationId`, `updatedAt`, `enabled`, `opens`, `cutoff`, `weekdays`. The window is at least one hour |
| `save_override` | `locationId`, `date`, `closed`, `opens`, `cutoff`. A closed date has null hours. An open date replaces that day's window |
| `delete_override` | `locationId`, `date`, `updatedAt` |
| `save_settings` | `updatedAt`, `theme` `christmas` or `original`, `bookingHorizonDays`, `preorderLeadDays`, `instagramUrl`, `instagramDmUrl`, `messengerUrl` |
| `save_featured` | `productIds` in rank order, unique |
| `save_popup` | `id`, `locationId`, `name`, `address`, `mapUrl`, `startDate`, `endDate`, `hours`, `items` |

Unknown images and a hidden Cebu are `400 validation`.

The Schedules editor calls `POST /api/admin/catalog/override-preview` with the same `save_override` or `delete_override` payload before applying a date change. It returns pending and confirmed order numbers and slots that fall outside the proposed hours. This review leaves existing bookings intact.

## Public shop reads

No session.

`GET /api/public/shop` returns the customer catalog for the saved theme: `preview`, `theme`, `revision`, `today`, `settings` (horizon, lead, and the three links), visible `locations`, `menu`, `addOns`, four-or-fewer `featured` products, and pop-ups whose end date is still today or later. Drop locations with `visible: false` stay out of this list. A published drop still appears through the drop routes.

`GET /api/public/eligibility?location=` returns `{ locationId, today, acceptingOrders, dates, products }`. Each date includes the slots that can still be booked. Each product lists the sizes and the dates those sizes can be ordered. An unknown or hidden location is `404 not_found`. A missing `location` is `400 validation`.

`GET /api/admin/preview?theme=christmas` or `theme=original` is owner-only. It returns the same shop shape with `preview: true` and `acceptingOrders: false` on every location. Any other theme is `400 validation`.

## Drops

`GET /api/admin/drops` is owner-only. It returns `{ revision, drops, bookedDates }`, including drafts, dates, offerings, package components, per-date `allocated` and `committed`, and add-ons. `bookedDates` maps drop IDs to dates with existing orders.

`POST /api/admin/drops` is owner-only, with Origin. Body is `{ action, payload }`. Success returns `{ revision }`.

| Action | Payload |
| --- | --- |
| `save_drop` | `id`, `locationId`, `name`, `address`, `mapUrl`, `deliveryEnabled`, `dates`, `offerings`, `addons`, optional `updatedAt`. A date has ordering open and cutoff, a pickup window, and a dispatch window or nulls. A size offering points at one product and size. A package's component quantities sum to 4. Each offering date says `included` and `allocated` |
| `publish_drop`, `unpublish_drop`, `end_drop` | `id`, `updatedAt` |
| `duplicate_drop` | `id`, `updatedAt`, `newId`. The copy keeps the city, offerings, prices, add-ons, and per-order limits. It does not keep dates, windows, or allocations |

A save that removes a booked date or changes its pickup or dispatch window returns `409 booked_date_locked`. Removing committed allocations or setting them below committed stock returns `409 committed_allocation`. Publishing with a disabled source pie or size returns `409 disabled_drop_source`.

`GET /api/admin/drops/preview?slug=` is owner-only and can show a draft. A missing slug is `400 validation`. An unknown slug is `404 not_found`.

`GET /api/public/drops?location=` needs no session. It lists published events for that drop city: `id`, `name`, `address`, `mapUrl`, `deliveryEnabled`, `status`, and `dates`. A missing location is `400 validation`. An unknown city is `404 not_found`. Ended events are left out.

`GET /api/public/drops/[slug]` needs no session. It returns one event with dates, ordering-open flags, offerings, remaining stock, images, and add-ons. A draft is `404 not_found`. A direct link to an ended event still returns it with `status: "ended"`.

## Orders

`POST /api/public/orders` needs no session and needs Origin. The body is the order itself, not wrapped in `action`. Thirty attempts per IP per 15 minutes, then `429 rate_limited`.

```json
{
  "idempotencyKey": "at least 8 characters",
  "channel": "regular",
  "locationId": "cebu",
  "fulfillmentDate": "2026-11-12",
  "fulfillment": "pickup",
  "slotId": "10:00",
  "lines": [{ "productId": "keylime", "sizeId": "4-inch", "quantity": 1, "unitPriceCentavos": 24000 }],
  "addons": [],
  "customerName": "Name",
  "customerPhone": "09171234567",
  "deliveryAddress": "",
  "notes": ""
}
```

A drop order sets `channel` to `drop`, sends `dropId`, omits `slotId`, and sends `offeringId` on each line instead of `productId` and `sizeId`. Delivery requires `deliveryAddress`.

Success is `{ orderId, orderNumber, submittedAfterHours, replayed }`. The number looks like `MP-1112001`. Past 999 the tail grows, as in `MP-11121000`. The same key and the same commercial cart returns the original number with `replayed: true` and does not take stock again. The same key with a different cart is `409 idempotency_mismatch`.

A regular order placed outside that branch's window for today is still saved. `submittedAfterHours` is then `true`. A drop outside that date's opening and cutoff is `409 closed_ordering`.

Reviewed prices that no longer match are `409 price_change` with `lines` and `addons`, each carrying the current `unitPriceCentavos`. Nothing is saved. Not enough drop stock is `409 unavailable` with `offerings: [{ id, remaining }]`. Nothing is saved.

`GET /api/admin/orders` is owner-only. Query: `page` (10 per page), `q` (exact order number, newest year first), `location`, `date`, `status`, `payment`, `fulfillment`, and `view`. `view=attention` is pending then confirmed. `view=today` is today's Manila fulfillment date, excluding cancelled. The body is `{ page, pageSize, total, orders }`. Each order includes `createdAt`, lines, package components, add-ons, fee fields, contact fields, `submittedAfterHours`, and `updatedAt`. Completed and cancelled orders have null name, phone, address, and notes.

`GET /api/admin/orders/[id]` is owner-only and returns the same order shape, or 404.

`POST /api/admin/orders` is owner-only, with Origin. Body is `{ action, payload }`.

| Action | Payload | Result |
| --- | --- | --- |
| `place_order` | Same fields as the public order, plus optional delivery fee mode and amount saved atomically. `allowUnavailable: true` lets the owner bypass regular availability only | `{ orderId, orderNumber, submittedAfterHours, replayed }` |
| `update_order` | `orderId`, `updatedAt`, fulfillment fields, `lines` (existing lines keep `lineId` and their saved price; new lines use the current price; retained add-ons keep their saved price), `addons`, contact fields. Delivery may set `deliveryFeeMode` to `unknown`, `known` (with `deliveryFeeCentavos`, and zero is allowed), or `rider` | `{ orderId }` |
| `transition_order` | `orderId`, `updatedAt`, `status` of `confirmed`, `paid`, `completed`, `cancelled`, or `refunded` | `{ orderId }` |

Confirm accepts pending only. A delivery confirms only when the fee is `known` or `rider`. Pay accepts unpaid while pending or confirmed. Complete accepts confirmed and paid, then clears the contact fields and does not return stock. Cancel accepts pending or confirmed, clears the contact fields, and releases a drop allocation once. Cancelling a paid order is `409 refund_required` until the payment is refunded. Refund marks a paid order refunded and does not clear contact fields or reopen it. A stale `updatedAt` is `409 stale_save`. Completed and cancelled orders cannot be edited.

`GET /api/admin/lineup?date=YYYY-MM-DD` is owner-only. It counts confirmed and completed orders for that fulfillment date. Each group has `locationId`, `dropId`, `packing` (`packages`, `pies`, `addons`), and `baking`. Baking expands a package into its pies. A package is not also counted as one extra pie. A bad date is `400 validation`.

## Realtime

`GET /api/admin/realtime/token` is owner-only. It returns `{ accessToken, expiresAt }`.

Subscribe to the private channel `orders` and listen for the event `order`. The payload is only `{ orderId, changeType }`, and `changeType` is `created` or `updated`. It carries no name, phone, address, or notes. On open, and again after reconnect, refetch `GET /api/admin/orders`. Treat a missed, duplicate, or out-of-order event as a hint. Do not subscribe to `postgres_changes` on orders.

## Backups

All four calls are owner-only. The writes need Origin.

| Call | Result |
| --- | --- |
| `POST /api/admin/backups/key` | First call: `{ keyId, publicKey, privateKey, createdAt }`. The private key is not stored. A later call is `409 key_exists` and includes no private key |
| `POST /api/admin/backups/key/confirm` | `{ keyId, createdAt, confirmedAt }`. No key yet is `404 not_found` |
| `GET /api/admin/backups` | `{ key: null }` or `{ key: { keyId, createdAt, confirmedAt } }` |
| `POST /api/admin/backups/export` | `{ format, environment, keyId, exportedAt, ciphertext }`. No saved key is `409 key_missing` |

`format` is `1`. The same four facts are inside the decrypted JSON. A changed ciphertext fails decryption. A header that does not match the inside fails with a header mismatch. Order names, phones, addresses, and notes are null in the file. Sessions, Auth secrets, rate-limit rows, cache snapshots, and the private key are absent.

Restore is a developer command, not an admin button. The steps are at the top of [scripts/restore-backup.ts](scripts/restore-backup.ts):

```bash
node --env-file=.env.local --import tsx scripts/restore-backup.ts --file backup.json --identity recovery.key --target makalipie_recovery
```

The target must be `makalipie_recovery`. The live `postgres` database is refused. If that recovery database already has an order newer than the export, the script stops and changes nothing. Keep the private key outside the database and outside the archive. Reconcile the owner allowlist in the recovery environment. Pending contact details are gone after a restore.

## Errors

| Status | `error` | When |
| --- | --- | --- |
| 400 | `validation` | The body or query does not match the contract |
| 400 | `invalid_request` | Sign-in or password fields are missing or the new password is not acceptable |
| 401 | `invalid_credentials` | The password does not match |
| 401 | `unauthenticated` | No live owner session |
| 401 | `unauthorized` | The user is signed in and is not on the allowlist |
| 403 | `forbidden_origin` | `Origin` does not match the request host |
| 404 | `not_found` | The location, drop, order, or backup key is absent |
| 409 | `stale_save` | `revision` or `updatedAt` lost a race |
| 409 | `section_in_use` | The menu section still has products |
| 409 | `price_change` | Reviewed prices differ. The body includes the current prices |
| 409 | `unavailable` | Drop stock cannot cover the cart. The body includes remaining quantities |
| 409 | `closed_ordering` | The drop window is shut, or the branch is not accepting |
| 409 | `idempotency_mismatch` | The same submission key was reused for a different cart |
| 409 | `refund_required` | A paid order was cancelled before the payment was refunded |
| 409 | `key_exists` | A recovery key is already saved |
| 409 | `key_missing` | Export was asked for before a key exists |
| 429 | `rate_limited` | Too many sign-in or public-order attempts from one IP |
| 503 | `temporary_failure` | The database or Auth call failed. Safe to retry |

## Local verification

Recorded on 2026-11-11 after `npx tsc --noEmit`, `npx eslint`, and `npm run test:handoff` (`test:phase1` through `test:phase6`).

| Check | Result |
| --- | --- |
| Typecheck | Pass |
| Lint on the phase 4 test | Pass. `npm run lint` still reports existing issues in `explainers/supabase-makalipie/build` |
| Phase 1 database and auth | Pass |
| Phase 2 eligibility and catalog | Pass |
| Phase 3 drops | Pass |
| Phase 4 orders, including `submittedAfterHours` and paid-to-rider confirmation | Pass |
| Phase 5 private realtime | Pass |
| Phase 6 encrypted export and isolated restore | Pass |

The section 9 checklist maps onto those files: auth and the publishable key in phase 1, Manila dates, seasons, slots, overrides, and cache behavior in phase 2, drop windows and allocation rules in phase 3, numbering, stock races, fees, privacy, and lineup totals in phase 4, owner-only events in phase 5, and tamper, wrong-key, and recovery checks in phase 6.

Hosted Supabase in Singapore was not created. The VPS on port 3006 was not deployed and was not part of this run.
