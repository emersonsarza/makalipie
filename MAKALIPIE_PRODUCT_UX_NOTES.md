# Makalipie — Product / UX notes (locked direction)

**Source:** Emerson, 2026-09-30  
**Status:** Build when ready. Update legal outline / pending confirmations when hold rule is finalized with Nika.  
**Do not treat as live policy until implemented + confirmed.**

---

## 1. Order hold / reserved time — business hours only

### Problem (today)
- After submit, the slot is held for **~30 minutes**.
- If someone orders **at night**, that 30-minute window can end **before any staff is online**.
- Customer has no realistic chance to get IG confirmation; slot can open again unfairly.

### Direction (clearer rule)
**Hold time must live inside business / staff-active hours — not a blind clock from submit.**

**Suggested behavior:**
1. Customer submits at any time (including overnight).
2. Their slot stays **reserved** until staff can act.
3. If they submit **outside business hours**, the approval window starts on the **morning of the next available business day** (when staff is active), not at midnight + 30 minutes.
4. During open hours, keep a short hold (e.g. 30 minutes after submit, or after staff-open) — exact minutes still TBD with Nika.
5. If they don’t message / get confirmed within that **staff-hours** window, the slot can reopen.

### What to tell Nika (reframe of pending #1)
> Right now a night order only gets ~30 minutes, but nobody’s online then. We’re changing it so the reserved slot waits until the **next morning staff is active**, then they have X minutes/hours to confirm. Is that OK? What should X be during open hours?

### Affects
- App: hold expiry logic (timezone Asia/Manila; bakery hours e.g. 10AM–8PM unless admin overrides)
- Terms: “how long we hold your slot”
- `MAKALIPIE_LEGAL_PENDING_CONFIRMATIONS.md` item 1

---

## 2. Delivery step — remove customer address

### Problem
- Form still asks for a **delivery address** (or similar).

### Direction
- **Remove** the customer address field on Delivery / fulfillment.
- **Replace** with a short note that:
  - Pickup is at the **bakery / outlet address shown on the site** (order form + order page).
  - Customer **books their own courier** (Grab, Lalamove, etc.) if they want delivery.
  - Courier loss/delay/damage is **on the customer** (already locked for Terms).

### Copy direction (example)
> **Pickup:** We’ll bake for pickup at [address on site].  
> **Want it delivered?** Book your own courier to that address. We don’t take delivery addresses or courier fees on this form.

### Affects
- Pre-order / order UI
- Order confirmation / status page
- Terms / outline (already locked; UI must match)

---

## 3. Order status colors — make each status distinct

### Problem
- Status badges / chips look the **same or too similar** for every state. Hard to scan (admin + customer).

### Direction
- Give **each status its own clear color** (still on brand: cream / charcoal / crust gold / berry — not rainbow chaos).
- Suggested mapping (adjust in implementation, keep contrast for accessibility):

| Status (examples) | Color idea |
|-------------------|------------|
| Pending / awaiting confirm | Soft amber / crust gold tint |
| Confirmed / reserved | Clear green |
| Awaiting payment / unpaid | Soft coral / berry |
| Paid | Stronger green or teal |
| Baking / in progress | Soft blue-gray |
| Ready for pickup | Bright / bold accent |
| Completed / picked up | Charcoal muted / gray |
| Cancelled / expired / released | Muted red-gray |
| No-show / waitlisted | Distinct from cancelled (e.g. purple-gray) |

- Same palette tokens everywhere (public status page + admin orders).
- Don’t rely on color alone: keep label text.

---

## 4. Mobile — “Your little lineup” sticky feedback

### Problem
- On mobile, after adding pies, it’s hard to **see what you ordered** / that add-to-box worked.
- Lineup is easy to scroll away from.

### Direction
- On **mobile**, keep a **compact sticky strip** (top or bottom — pick what doesn’t fight the header; top sticky under nav is fine if tested).
- Always show at least:
  - **Pie count** — e.g. `3 pcs`
  - **Running total** — e.g. know total / ₱ amount
- Optional: short “Added” feedback when an item is added; tap strip to expand full lineup.
- Desktop can keep the fuller “Your little lineup” panel; sticky compact is mainly for small screens.

### Wireframe (idea only)
```
┌─────────────────────────────────────┐
│  3 pcs                    ₱1,250    │  ← sticky on mobile
└─────────────────────────────────────┘
   (tap to open full lineup)
```

Goal: customer **immediately knows** the pie is in their box.

---


## 5. Header search — order number not working

### Problem
- Search in the **header** for an **order number** does not work (lookup / navigate fails or no results).

### Direction
- Fix header order-number search so entering an order number (e.g. `MK-1042`) finds the order and takes the customer (or staff) to the right status / order view.
- Handle common formats: with/without `MK-`, spaces, case.
- Show a clear empty / not-found state when the number doesn’t exist.

### Affects
- Header search UI + orders status / recovery API

---
## Implementation checklist

- [ ] Hold expiry = business-hours aware (Asia/Manila); overnight → next staff morning
- [ ] Confirm minutes/hours with Nika; update pending #1 + Terms
- [ ] Remove delivery address field; add courier self-book note + show pickup address
- [ ] Distinct status colors (public + admin)
- [ ] Mobile sticky lineup summary (count + total)
- [ ] Fix header search by order number (MK-####)

---

*This file is the clear note for product/build. Legal pages stay TBD until Nika confirms the new hold rule.*
