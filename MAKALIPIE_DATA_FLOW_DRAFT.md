# Makalipie — Data flow draft (for Privacy Policy)

Living document of **actual / planned** app behavior. Update when the build changes. Do not claim practices the app does not do.

**Last updated:** 2026-09-25  
**Status:** Draft from product plan (pre-production). Mark *planned* vs *live* as build progresses.

---

## 1. Systems involved

| System | Role |
| --- | --- |
| Public website (`makalipie.com`) | Marketing, menu, pre-order form |
| Admin (`admin.makalipie.com`) | Staff manage catalog, capacity, orders |
| Firebase Auth | Admin login only (not customer accounts) |
| Cloud Firestore | Menu, settings, **orders** |
| Firebase Storage | Product / hero / logo images |
| Hosting (Vercel or Firebase App Hosting) | Serves the Next.js app |
| Cloudflare | DNS / CDN / WAF in front of domains |
| Chat apps (Instagram, Telegram, etc.) | Customer confirms order # and pays — **outside** the website |
| GrabFood / Foodpanda | Optional deep links only; ordering on those platforms is separate |
| Email / Telegram alerts (planned) | Notify staff of new website orders |

**Not in scope (current plan):** in-site payment gateway, customer login, automatic chat bots.

---

## 2. Data collected on the website (planned order form)

| Data | Purpose | Stored where |
| --- | --- | --- |
| Customer name | Fulfill order, identify in chat | Firestore `orders` |
| Contact (phone and/or handle) | Reach customer for confirm / pay | Firestore `orders` |
| Preferred chat app | Guide customer where to message | Firestore `orders` |
| Fulfillment type (pickup / delivery) | Prep & logistics | Firestore `orders` |
| Fulfillment date + optional time slot | Capacity & bake planning | Firestore `orders` |
| Delivery address (if delivery) | Delivery | Firestore `orders` |
| Line items (product, size, toppers, qty) | Order content | Firestore `orders` |
| Customer notes | Special requests | Firestore `orders` |
| Order number (system-generated) | Reference in chat | Firestore `orders` |
| Timestamps / status | Ops workflow | Firestore `orders` |

**Not collected by the website (current plan):** card numbers, GCash credentials, government IDs. Payment details may appear in **chat** or as staff notes — treat carefully; prefer not to store full payment account numbers in Firestore.

---

## 3. Who can access order data

| Who | Access |
| --- | --- |
| Public / visitors | Cannot read other people’s orders |
| Customer | Sees their order number on thank-you screen; no customer account portal (planned) |
| Owner (admin) | Full admin |
| Staff (admin) | Orders dashboard / status / notes (not menu/price edits) |
| Couriers | Only what staff share for a delivery (address, name, phone) — not full Firebase access |
| Developer (Emerson) | Temporary access during build; production Firebase should be **client-owned** |

---

## 4. Data flow (happy path)

1. Customer fills form on public site → browser sends order to Firebase (client SDK or server route).  
2. Firestore stores order; capacity counters update.  
3. Site shows order number + payment instructions (display text from admin settings) + chat links.  
4. Optional: alert email/Telegram to staff.  
5. Customer messages bakery on IG/Telegram/etc. with order number.  
6. Staff confirm and take payment **in chat**.  
7. Staff update status in admin (`awaiting_confirm` → `confirmed` → `paid` → `done` / `cancelled`).  
8. Bake/prep list aggregates orders by date for kitchen.

---

## 5. Retention (owner must decide — see checklist I.28)

Until decided, draft Privacy Policy should say **TBD** or “kept as long as needed to fulfill orders and meet legal/accounting duties,” then lawyer refines.

---

## 6. Security controls (planned)

- Firestore security rules: public create order (validated); no public update/delete; admin-only catalog writes  
- Admin behind Auth + role check  
- Cloudflare in front of domains  
- Secrets in env, not in git  
- HTTPS on custom domains  

---

## 7. Third parties to name in Privacy Policy (when live)

- Google Firebase / Google Cloud  
- Hosting provider (Vercel and/or Firebase App Hosting)  
- Cloudflare  
- Messaging platforms the customer chooses to use (IG, Telegram, etc.) — bakery does not control those platforms’ policies  
- GrabFood / Foodpanda if customer leaves the site to order there  

---

## 8. Gaps to close before final Privacy Policy

- [ ] Confirm exact hosting vendor in production  
- [ ] Confirm whether order create is client-side or via Next.js API  
- [ ] Confirm analytics (none / GA / other) — **do not claim “we don’t track” if analytics exist**  
- [ ] Confirm alert channels and what they contain  
- [ ] Owner retention + deletion process (checklist)  
- [ ] Whether admin notes ever store payment references  

---

*Pair with `MAKALIPIE_LEGAL_OWNER_CHECKLIST.md` for the meeting. Drafts of Terms / Privacy / Refund come after checklist answers (with remaining TBDs marked).*
