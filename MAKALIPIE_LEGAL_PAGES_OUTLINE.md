# Makalipie — Legal pages outline (what each page will contain)

Draft structure for when we write Terms, Privacy, and Refund. Based on Nika’s checklist answers + locked decisions. Items still waiting on her are marked **[PENDING]** and listed in `MAKALIPIE_LEGAL_PENDING_CONFIRMATIONS.md` — update those pages when that file is resolved.

**Business (locked)**  
Makalipie · makalipie@gmail.com · Unit C2, Cedar Place, 12 Dagohoy St, Barangay Apas, Cebu City · Governing law: **Philippines**

---

## 1. Terms and Conditions (`/terms`)

**Purpose:** How ordering works, customer and bakery responsibilities.

### Planned sections
1. **About Makalipie** — who we are, contact, address  
2. **How to order** — website form → order number → message on **Instagram** to confirm  
3. **When an order is confirmed** — staff confirm in IG only (not automatic); then pickup details apply  
4. **Order hold / capacity** — FCFS until cap; submitted order holds a slot for **[PENDING: hold minutes, default proposed 30]**; if no message in time, slot is released  
5. **Payment** — full payment **before the drop**; GCash or bank transfer; wrong amount/account is customer’s responsibility; official receipt only if requested  
6. **Pickup** — bakery **pickup address shown on the site** (order form + order confirmation page); customer books their **own courier**; no customer delivery address collected  
7. **Courier responsibility** — damage, delay, wrong handling by the customer’s courier are **out of bakery control**; advise insulated bag  
8. **Cancellation** — allowed before confirm, after confirm, and after payment, subject to **[PENDING: cancel cutoff]**  
9. **Rescheduling** — customer arranges courier booking on drop day; if bakery must change date (capacity/emergency/weather) → customer chooses **new date or refund**  
10. **No-shows / missed pickup** — bakery will try to reach out; if unreachable, order may go to **waitlist**  
11. **Products & photos** — **[PENDING: photos are a guide / may vary]**  
12. **Allergens** — listed **per product** in admin/on site; **[PENDING: shared-kitchen / cross-contact line if yes]**  
13. **Custom toppers** — none for drop orders (as stated)  
14. **Complaints** — via Instagram  
15. **Governing law** — Philippines  
16. **Changes** — we may update these Terms; dated version on the site  

---

## 2. Privacy Policy (`/privacy`)

**Purpose:** What data we collect and what we do with it — must match the app.

### Planned sections
1. **Who we are** — Makalipie, contact email, address  
2. **What we collect** (order form) — name, contact, preferred chat (IG-focused), order items, fulfillment/drop date, notes, order number, timestamps/status  
3. **What we do not collect** — no customer delivery address; no card/GCash passwords on the site; payment happens off-site (chat)  
4. **Why** — fulfill and manage orders, capacity, bake planning, refunds/complaints  
5. **Marketing** — **No** promo / “we miss you” messages (locked)  
6. **Who can see data** — owner and staff via admin; developers only as needed during build  
7. **Third parties** — Firebase/hosting/Cloudflare as infrastructure; Instagram when customer messages; customer’s own courier (not given address by us beyond public pickup location)  
8. **Retention** — **[PENDING: ~30 days after drop, then anonymize personal fields, keep sales counts]**  
9. **Your rights** — request deletion/anonymization via IG or makalipie@gmail.com  
10. **Security** — reasonable technical measures (Auth for admin, rules, HTTPS)  
11. **Governing law** — Philippines  
12. **Updates** — dated version on the site  

---

## 3. Refund Policy (`/refund`)

**Purpose:** When money comes back and how.

### Planned sections
1. **When refunds apply** — customer cancellation (subject to **[PENDING: cutoff]**); bakery cannot fulfill / must cancel; quality issues (wrong/damaged by bakery)  
2. **When refunds generally do not apply** — courier damage/delay/wrong handling after customer-arranged pickup; customer no-show after outreach (waitlist path — clarify if paid amount is refunded or transferred; **TBD with ops**)  
3. **Partial refunds** — allowed (e.g. one wrong item)  
4. **How refunds are paid** — same channel as payment (GCash / bank); **immediate** as stated by owner  
5. **Bakery-initiated date change** — new date **or** refund (customer chooses)  
6. **How to request** — Instagram (and/or email)  
7. **Updates** — dated version on the site  

---

## Implementation notes (later)
- Link all three near order submit + footer  
- Show “last updated” date  
- Align app behavior with these pages (30-min hold, no address field, pickup address display, per-product allergens)  
- After Nika answers pending items, revise the marked sections and bump the dates  

*Companion file: `MAKALIPIE_LEGAL_PENDING_CONFIRMATIONS.md`*
