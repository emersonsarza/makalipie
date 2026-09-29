# Makalipie — Complete Build Plan and Agent Handoff

Updated: September 28, 2026 (Asia/Manila).

## Start here

This is the standalone continuation document for the Makalipie ordering project. It contains the current implementation checkpoint, confirmed decisions, code map, local testing instructions, every phase's build sequence and acceptance checklist, and the latest verification evidence. A new agent does not need the original chat to resume.

**Next work: Phase 4 — processing, expiration, and approval.** Phases 0–2 passed their local checkpoints. Phase 3 is implemented and its automated checks passed; the manual checkpoint is ready to walk through. Durable intake stays off unless `ORDER_INTAKE_ENABLED=true` or the Firebase emulators are on. Phases 4–11 are not implemented. Implement one phase at a time.

The real application is `/Users/emerson/makalipie`. The Documents/Codex directory holds planning artifacts; it is not the application repository. Keep the repository copy of this file current as implementation progresses.

### Current phase ledger

| Phase | Status at handoff | Remaining boundary |
| --- | --- | --- |
| 0 — Foundations | Local checkpoint passed | Operational enforcement belongs to later phases; staff order sessions and guest access are not implemented |
| 1 — Branches/catalogs | Local checkpoint passed | Dedicated preorder ordering remains Phase 8 |
| 2 — Cart/scheduling | Local checkpoint passed | Submission and capacity continued in Phase 3 |
| 3 — Submission/capacity | Automated checks passed; ready for manual test | Expiration worker is Phase 4; live intake stays gated |
| 4 — Processing/expiration | Not started | Required before unattended real reservations |
| 5 — Basic pickup | Not started | Finish straightforward paid pickup before advanced edits |
| 6 — Advanced edits | Not started | Atomic transfers, financial adjustments, preserved fulfillment |
| 7 — Delivery | Not started | Existing Lalamove preference is only legacy chat-summary UI |
| 8 — Preorders | Not started | Shared pool, separate cart, preparation validation |
| 9 — Reorder/reopen | Not started | Both customer and admin recovery |
| 10 — Visit-only pop-ups | Not started | Can run after Phase 1 independently of order lifecycle |
| 11 — Verification/release | Not started | Eight complete journeys, exceptions, staff rehearsal, recovery |

“Passed” means the documented local scope passed; it does not mean the production ordering system is complete. Historical checkboxes in the detailed plan are acceptance criteria, not a live completion ledger. Use this ledger and the recorded evidence for current status.

### Before editing

1. Open the application repository, read `AGENTS.md`, and inspect its current branch, recent commits, and working tree. Read the relevant installed Next.js documentation before framework changes.
2. Preserve the current uncommitted work. At this handoff, Phase 1 and Phase 2 files include modified and untracked files; do not reset, clean, overwrite, or assume a fresh checkout. The user previously reported committing earlier changes, but this agent has not committed or deployed Phases 1–2. Verify actual Git state on arrival.
3. Read the decision register and code map below, then inspect the actual code before designing storage or endpoints. Reuse application conventions and shared rules.
4. Check which local services are already running. Do not stop unrelated services or reuse a port blindly.
5. Complete the next phase and record its evidence here before claiming it passed. Do not skip correctness checks until Phase 11.

## Confirmed product scope

- Products first, with regular products on normal ordering and a separate preorder page/cart later. Customers can browse without submitting an order.
- Cebu and Manila each have one main fulfillment branch. Catalog availability may differ by branch.
- Valid `?branch=manila` or `?branch=cebu` overrides the admin-selected default, usually Cebu. Show the selected branch and allow switching.
- Switching branches retains matching cart items and flags unavailable items for removal; unresolved unavailable items block continuing.
- Pickup: selected main branch → date → one-hour slot. Delivery: selected main branch → address → date → slot. Address eligibility and delivery fees are reviewed manually by staff.
- One daily online capacity count per main branch, fulfillment date, and flavor, shared across regular/preorder and pickup/delivery. Sizes of the same flavor add together. Add-ons do not count. A blank or missing flavor limit stays open, subject to the schedule and that product’s own availability. A saved number caps that flavor, and zero accepts no online requests. Other flavors stay on their own limits. Show online allocation only.
- Admin can increase allocation and disable today's new online requests. Existing held/accepted orders are not cancelled by that control. Avoid labeling the whole branch “full” or implying walk-in stock is exhausted.
- Select the next available valid date when today is unavailable. If none exists within the booking horizon, preserve the cart, explain the situation, and prevent submission. Newly available earlier dates must not silently replace an explicit future selection.
- Initial future booking horizon: 30 days ahead, admin configurable. Same-day cutoff does not stop future-date ordering.
- Initial reservation: 30 minutes, admin configurable. Processing stops the initial expiration timer.
- Full verified payment is required before preparation. Approval, payment, and fulfillment are separate concepts.
- Admin edits require no customer acceptance. Preserve payments, expose extra/refund amounts due, preserve fulfillment progress, and record changes.
- Multiple preorder products use the longest preparation requirement. Preorders support both main branches and pickup/delivery. Do not mix regular and preorder items in a submitted order.
- Both customer and admin must eventually support reorder and eligible reopen, with current-rule validation.
- Pop-ups are temporary visit-only listings, never online pickup/delivery destinations.

The next section explicitly distinguishes adopted implementation defaults from direct user answers. Later unresolved choices are listed in the detailed plan; do not silently promote them to confirmed business rules.

## Current application map

Paths below are relative to `/Users/emerson/makalipie`.

| Capability | Files / saved data | Current behavior |
| --- | --- | --- |
| Framework | `package.json`, `next.config.ts`, `AGENTS.md` | Next.js 16.3.4, React 19, TypeScript, Firebase Admin, Tailwind; inspect installed docs |
| Ordering policy | `src/lib/orders/policy.ts` | Shared-pool contract, 30-minute deadline, 30-day default, full-payment guard |
| Owner authentication | `src/lib/admin/session.ts`, `http.ts`, `access.ts`, `schemas.ts` | Protected sessions and origin checks; branch authorization primitive exists, current admin sessions remain owner-only |
| Branches | `src/lib/branches/schema.ts`, `store.ts`; `/api/admin/branches`; `/admin/branches`; `src/components/admin/branch-manager.tsx` | Default branch, names/address, per-variant branch/mode assignments, versioned saves |
| Branch storage | `settings/branches`, `branchSettingsEvents` | Trusted server saves and audit events |
| Catalog | `src/lib/catalog/schema.ts`, `rules.ts`, `defaults.ts`; `src/lib/products/public.ts`; existing `/admin/catalog` | Variants, prices, lead days, weekdays/blackouts, add-ons and quote validation |
| Catalog storage | `products` with variants, `addons`, `privateSettings/catalogV2` | Existing migration and management conventions; inspect before changing |
| Scheduling | `src/lib/scheduling/schema.ts`, `rules.ts`, `store.ts`; `/admin/schedule`; `/api/admin/schedule`; `src/components/admin/schedule-manager.tsx` | Branch hours, closures/weekdays, horizon, full-hour slots |
| Daily allocation | `src/lib/orders/allocation.ts`, `store.ts`; `/admin/allocation`; `/api/admin/allocation` | Per branch, date, and flavor pie limit, plus a today-only pause. A blank day stays open; a saved number caps that flavor |
| Orders | `src/lib/orders/schema.ts`, `store.ts`; `/api/orders`; `/admin/orders`; `/order/status` | One held request, idempotent retry, guest token, branch inbox |
| Schedule storage | `settings/orderingSchedule`, `scheduleSettingsEvents` | Versioned owner settings; unconfigured schedules disabled |
| Public availability | `/api/ordering/schedule`; `src/hooks/use-order-schedule.ts` | No-store response with server time; refresh on focus, each minute, or customer action |
| Customer cart | `src/app/order/page.tsx`, `src/components/order-form.tsx` | Branch-aware regular catalog, cart, name/contact, date/slot, existing chat summary |
| Trusted preview | `src/app/api/catalog/preview/route.ts` | Validates branch catalog, date and `slotId`; returns updated schedule on stale-date rejection; does not reserve or submit |
| Firestore rules | Repository rules files | Browser direct access denied; use trusted server and existing authentication conventions |
| Existing records | `MAKALIPIE_ORDERING_FOUNDATIONS.md`, `MAKALIPIE_ORDERING_PHASE_PROGRESS.md`, `README.md` | Decisions, verification history, setup notes |

### Important implementation limits

- When intake is enabled, submission creates one held order, reserves each chosen flavor's pie count, and still copies a summary that opens Instagram. No expiration worker has been delivered. With intake off, Continue keeps the earlier copy-and-open path and does not create a hold.
- Phase 2 preserves cart/details while the page remains open. Cart persistence across a full browser reload has not been implemented.
- When intake is on, offered dates combine the schedule with each flavor's saved allocation. A blank or missing flavor limit stays open. A saved number caps that flavor. Pausing today blocks new requests for every flavor.
- Staff can sign in and open the branch inbox. Owner-only settings stay owner-only. There is no staff-directory screen; demo staff profiles are Firestore `admins/{uid}` records.
- Current payment preference is not proof of payment or a ledger. Financial records and transitions arrive in Phases 5–6.
- Current demo hours are testing fixtures, not approved live operating settings.

## Next agent: Phase 3 execution order

1. Inspect policy, catalog, schedule, branch-access, session, and mutation helpers. Confirm chat handoff details before making them part of a saved-order flow; Instagram is the existing channel, not authorization to send messages automatically.
2. Define order and branch/date allocation schemas, server-only access, idempotency behavior, token-based guest access, and migration/default behavior. Do not invent capacity for dates with missing allocation.
3. Build admin daily allocation and today's disable controls first. Save shared branch/date rules without modifying existing orders.
4. Extend shared availability to combine schedule, catalog/preparation restrictions, booking horizon, and allocation. Preserve chosen valid future dates.
5. Implement atomic order creation plus one reservation. Calculate prices, branch routing, deadline, and capacity on the server. Retry/double-click must return the original logical result without another hold.
6. Connect customer submission, receipt, secure status access, and clear pending-validation wording. Explain changed availability and require a corrected resubmission rather than silently moving an order.
7. Implement branch-scoped staff inbox and owner visibility. Verify wrong-branch staff and unauthorized guests cannot read or change order information.
8. Run final-allocation concurrency, duplicate/retry, missing allocation, routing/access, no-dates, disable-today, and selected-future-date checks. Demonstrate the complete connected checkpoint manually.
9. Update this document's ledger, files, tests, remaining decisions, and next-step record. Keep live intake disabled until expiration and later operational requirements are ready.

## Local development and test handoff

- Use Node satisfying `package.json`: `^22.13.0 || >=24.0.0`. The host's default Node 22.8 was too old. This installation passed with `/Users/emerson/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node` (Node 24.19); rediscover the runtime on another machine.
- Demo project: `demo-makalipie`. Local emulator environment is defined in `scripts/emulator-env.mjs`; Auth 9099, Firestore 8080, Storage 9199 if required. Do not run fixture tests against production.
- Last verified preview was `http://localhost:3002` with matching `ADMIN_APP_ORIGIN`. It may no longer be running. Port 3001 was occupied by another app during verification.
- `scripts/dev-emulators.mjs` starts port 3001 and sets the matching origin. If using it, configure integration test origin overrides accordingly. For port 3002, use the same launcher pattern with port and origin both changed; preserve its emulator environment.
- The configured emulator build directory is `.next-emulator`; normal builds use `.next`. Do not assume old documentation about output directories is accurate without checking `next.config.ts`.
- Use the existing demo-owner bootstrap/seed script and README for local sign-in. Do not copy real credentials into handoff files.
- Test with owner and, once implemented, branch staff accounts plus independent customer sessions. Use separate browser profiles or isolated sessions for actual access testing; two tabs sharing a cookie are not independent authentication sessions.

### Commands and checks

Run from the repository with a compatible Node runtime on PATH:

```sh
npm run test:admin
npm run test:catalog
npm run test:order-policy
npm run test:branches
npm run test:scheduling
npx tsc --noEmit --incremental false
```

With initialized local demo catalog and Auth/Firestore emulators running, run the following **sequentially** because both temporarily modify the same settings:

```sh
npm run test:branches:integration
npm run test:scheduling:integration
```

Both suites default to port 3002. Set `BRANCH_TEST_ORIGIN` and `SCHEDULE_TEST_ORIGIN` if needed; they must match the preview's origin. These suites restore their own writes and preserve catalog data.

Run lint for changed files and the relevant focused tests each phase. A production build passed with `node node_modules/next/dist/bin/next build --webpack`; Turbopack encountered a host worker/port restriction. This is a local build fallback, not an application dependency change.

The older `test:catalog:integration` and product fixture suites reset demo catalog data. Read them before running; use a disposable demo fixture environment. The catalog integration test was adapted for the new scheduling contract but not rerun during Phase 2.

### Known local verification caveats

- A malformed generated `.next/dev/types/validator.ts` blocked type checking once; removing only that generated file resolved it. Do not change application code to compensate for corrupted generated output.
- Phase 2 UI checks used a 483-pixel viewport. Full mobile/desktop, keyboard, independent-session, and operational coverage remains part of later checkpoints and Phase 11.
- Demo schedule at handoff: Cebu enabled daily 10:00 AM–7:00 PM; no closed dates; horizon 30; Manila disabled. Recheck saved data before relying on this snapshot.
- The work is not deployed; no production database changes or automatic customer messages were made by these phases.

## How to keep this handoff current

After each phase, update the ledger and next-action section above, then append a dated record using the template at the end of the detailed plan. Record exact checks/results, remaining limitations, schema/configuration changes, and whether changes were committed or deployed. Preserve the distinction between business decisions, implementation defaults, proposed additions, and verified behavior.

If this document conflicts with a newer explicit user instruction, follow the user and update the record. If code differs from this snapshot, inspect Git/history and record the actual state before proceeding. Do not assume completion from a file or route name alone.

---

## Decision register (current foundation record)


## Decision authority

The current ordering specification and subsequent user answers supersede conflicting older repository plans. This file records confirmed business decisions separately from implementation defaults. None of these records enables live order submission.

## Confirmed business decisions

- The business has a list of main branches. Cebu is permanent and always public. Other branches can be added, removed, or hidden. A hidden branch stays editable in admin and is absent from the public site. When only one branch is public, the order form selects that branch and does not show a switcher. All online orders belong to one main branch.
- Daily capacity counts pies of each flavor and is shared across regular/preorder and pickup/delivery. Sizes of one flavor share a limit. No per-slot allocation, and add-ons do not consume a flavor limit.
- Default reservation is 30 minutes, configurable by admin. Processing stops the initial timer.
- Full staff-verified payment is required before preparation, separately from approval.
- Initial future booking horizon is 30 days, configurable. Cutoff closes new same-day requests only.
- Branch changes preserve matching cart items and flag unavailable items for removal.
- Admin edits require no customer acceptance and must preserve financial records and fulfillment progress.

## Implementation defaults adopted for a consistent build

These fill the remaining implementation details; they are not claimed as earlier customer answers.

### Branch context and catalog migration

- A visible branch in the URL takes precedence. A hidden, unknown, absent, or repeated branch parameter uses the default among visible branches, otherwise Cebu.
- Branch changes update the current URL. There is no cross-visit remembered preference overriding the admin default.
- Existing/new unassigned variants default to Cebu only. A positive preparation requirement defaults them to preorder; zero defaults to regular. Owners can explicitly classify a zero-day variant as preorder.
- Per-variant branch assignment is separate from shared product names/prices and preparation rules. Branch-specific price overrides are outside this phase.
- When more than one branch is public, an unavailable selection keeps a visible selector and an empty-state message; it does not erase the cart. When only one branch is public, that branch is already selected and the selector is not shown.

### Access boundaries

- Owner can manage catalog/branch settings and access both branches.
- Staff can access operational orders only for explicitly assigned branch IDs; empty/missing assignment grants no branch access. Inactive accounts have no access.
- Cross-branch order moves require owner authorization; branch staff cannot transfer an order into another branch.
- Guest ordering remains supported without customer accounts. Future status pages use an unguessable per-order access token whose hash is stored server-side. Sequential order numbers are references only and cannot reveal customer information.
- Existing admin sessions remain owner-only until staff operational screens are implemented; the branch authorization primitive does not expand current sessions.

### Scheduling boundaries for Phase 2

- Asia/Manila dates; UTC event timestamps; calendar preparation days.
- Today is day zero. The latest selectable date is today plus the configured horizon, inclusive.
- Preparation lead days are added to today's local date. The same-day cutoff does not shift the base date for future orders.
- Generate only complete one-hour slots inside the configured online start/cutoff window. No partial final slot.
- A slot that has started cannot accept a new request. A slot starting exactly now is treated as started.
- At the cutoff instant, close new same-day requests but continue accepting valid future dates.
- Business closures and product weekday/date restrictions are respected. Missing operational schedule/allocation keeps request submission closed rather than inventing availability.
- If no valid date exists inside the horizon, keep the cart and show no available online dates.

### Lifecycle and capacity contract for Phases 3–6

- Initial request: Held/Pending validation (`requested`) with a deadline based on trusted server time.
- Staff action: Processing retains the reservation without automatic expiration. Staff resolves it explicitly; show elapsed review time so stale work remains visible.
- Staff approval: Approved (`confirmed`) commits the reservation. Approval does not imply payment.
- Preparing requires a finalized quote and verified net payment covering the current total. Then Ready and Completed follow.
- Only `requested` expires automatically. Processing and later states do not use the initial timer.
- Before preparation, staff may cancel/reject with a recorded reason; capacity is released once. Cancelled/expired orders do not imply a refund occurred.
- After preparation starts, ordinary cancellation is disabled until an owner resolves the prepared-stock/payment exception; do not silently return prepared production to the pool. The owner exception UI is specified before its implementation in Phase 6.
- Completed orders remain counted for that fulfillment day. Normal status changes cannot reopen them.
- Reservation creation/release/transfer and order updates must be atomic; concurrent actions must not double-count or double-release.
- Reopen/reorder is a separate later flow that rechecks dates, catalog and capacity. It cannot be implemented by setting an old status back to active.
- Every state/payment/edit action records actor, timestamp, old/new values and reason where relevant. Payments/refunds remain separate recorded events.

## Phase boundaries

Phase 0 delivers decisions, policy primitives, access boundaries and an isolated demo testing setup. It does not require the later order, worker or guest-status endpoints to exist.

Phase 1 connects owner branch settings to the customer regular catalog and validates branch assignments in the existing quote-preview endpoint. Scheduling is implemented in Phase 2; durable ordering remains Phase 3 onward.


---

## Detailed phase-by-phase plan (Phases 0–11)

## 1. Purpose and working method

Build the complete ordering experience in small, connected phases. Each phase joins the admin controls, customer experience, and shared ordering rules needed to test a real workflow manually.

This section retains the complete build sequence and acceptance criteria. The current application has been inspected and Phases 0–2 have passed their local checkpoints; use the ledger above for actual completion. Reuse existing behavior and implement only missing or incorrect parts. The confirmed scope and decision register in this file make this plan usable without the original conversation.

**Do not finish the entire admin application before starting the customer application, or vice versa.** Follow the build order within each phase, switching sides whenever that unlocks the next meaningful test. Shared rules must be enforced by the system that saves orders, not just by either screen.

For every phase:

1. Resolve foundational decisions in Phase 0, then any remaining phase-specific decisions before their dependent work.
2. Build the smallest connected admin/customer workflow described below.
3. Test with separate admin and customer sessions using the same saved data.
4. Refresh both sessions to confirm the result persists.
5. Record pass/fail results and fix blocking defects before moving on.

Intermediate phases are development or staging milestones. They are not invitations to enable an incomplete flow for live customers.

The history and payment-adjustment requirements in this revision are implementation additions; the original specification remains the source for confirmed business decisions. Unanswered business questions remain explicitly open until resolved in the relevant checkpoint.

### Shared interfaces and saved rules

Inspect the existing application's conventions before choosing API paths or storage structures. Customer and admin screens must use the same saved rules for availability, capacity, preparation dates, and transitions. Required shared capabilities are availability lookup, safe request submission, reservation processing/expiration, validated editing, financial adjustment tracking, action history, and recovery. Screens must not maintain conflicting versions of these rules.

## 2. Phase overview

| Phase | Working sequence | Manually demonstrable result |
| --- | --- | --- |
| 0 | Review existing system → shared decisions → test setup | Clear rules, branch access, and repeatable test data |
| 1 | Admin branches/catalog → customer catalog → admin adjustments | Correct products appear for the selected branch |
| 2 | Customer cart → admin schedule → customer pickup details | A valid regular pickup order can be reviewed before submission |
| 3 | Admin allocation → submission/hold → admin inbox → customer receipt | A real request reserves capacity and reaches the correct branch |
| 4 | Admin Processing/approval → customer status → expiration checks | Staff can take ownership; unattended holds expire correctly |
| 5 | Staff payment validation → pickup fulfillment → customer tracking | A basic regular pickup order reaches Completed |
| 6 | Admin edits → capacity transfers → payment reconciliation → customer updates | Advanced edits preserve reservations, payments, and progress |
| 7 | Admin delivery setup → customer delivery → staff validation | Delivery works with manual eligibility and shared capacity |
| 8 | Admin preorder rules → customer preorder → staff fulfillment | Separate preorder ordering respects preparation days |
| 9 | Customer reorder → admin reopen → both recovery paths | Expired orders can be recovered without bypassing current rules |
| 10 | Admin pop-up listings → customer discovery | Temporary locations are visible but cannot accept online orders |
| 11 | Cross-flow testing → operational setup → release verification | The complete agreed scope is ready for live use |

## 3. Shared manual-testing setup

Keep one admin session and at least two independent customer sessions available. Use branch-specific staff accounts once access rules are implemented. Test on desktop and a narrow mobile screen.

Create reusable test fixtures, clearly marked as test data:

- Cebu and Manila main branches, with Cebu initially set as the default.
- One regular product shared by both branches, one Cebu-only product, and one Manila-only product.
- A standard regular variant and larger preorder variants with different preparation requirements, such as three and five days.
- Small daily allocations, such as two or three orders, to make exhaustion easy to test.
- One-hour slots, plus test dates with available allocation, no allocation, and online ordering disabled.
- One address staff can approve and one staff must reject for delivery.
- One temporary pop-up with dates, hours, address, and available items.

Use a shortened hold duration or controllable clock only in the test environment. Confirm actual configured durations before release. Use the adopted Asia/Manila operating timezone for Cebu and Manila.

For each test, record the branch, order number, selected date/slot, before-and-after capacity, customer-visible status, and staff-visible status. A failure should identify the phase and the steps needed to reproduce it.

## 4. Phase 0 — Confirm foundations and unresolved rules

**Outcome:** Development can proceed without accidentally treating old suggestions as confirmed requirements.

### Build and review order

1. Inventory existing customer screens, admin screens, order storage, capacity handling, and status behavior.
2. Map what already works to the phases below and identify changes to existing data that may be needed.
3. Agree on the shared definitions of branch, product/variant, regular versus preorder, order, fulfillment date/slot, hold, and capacity consumption.
4. Establish admin access and branch routing. Ordinary branch staff must only see and act on the orders permitted by the chosen access model.
5. Establish the test fixtures and separate customer/admin sessions.

### Foundational decisions — required to pass Phase 0

| Decision | Why it must be recorded in Phase 0 |
| --- | --- |
| Whether regular and preorder share one capacity pool | Determines reservation storage and accounting before Phase 3 |
| Which statuses hold/consume capacity and which actions release it | Prevents inconsistent expiration, completion, cancellation, and rejection behavior |
| Allowed approval, payment, and fulfillment transitions | Prevents edits from resetting progress or implying payment |
| Customer access, guest/account approach, and staff branch permissions | Determines safe order lookup and branch routing |
| Timezone, cutoff meaning, elapsed/partial slots, closed dates, booking horizon | Establishes consistent date availability |
| Calendar/business preparation days and time-of-day boundaries | Prevents later changes to scheduling foundations |
| Hold duration, configurable bounds, and prolonged Processing policy | Establishes predictable reservation behavior |
| Branch-switch cart behavior, invalid URL fallback, remembered branch precedence | Establishes customer entry and cart behavior |
| Ownership of branch-wide settings | Allows Phase 1 administration to be tested |

Record the selected business rules; this plan does not convert unanswered questions into confirmed requirements. Phase 0 cannot pass until the foundational decisions above are resolved. Follow-up decisions now confirm one branch/day pool for regular/preorder and pickup/delivery, a 30-minute configurable initial hold, and verified full payment before preparation. All foundational details are now recorded in the decision register above, which labels implementation defaults separately from direct user answers. Operational enforcement remains the responsibility of the dependent phases.

### Later decisions — resolve before the named phase

| Decision | Required before |
| --- | --- |
| Supported chat channels and handoff details | Phase 3 — adopted: after a hold, copy a summary that includes the order number and open the existing Instagram DM. No message is sent automatically. |
| Financial adjustment recording and settlement workflow | Phase 6 |
| Unsupported delivery resolution and delivery-specific progress states | Phase 7 |
| Reopen versus reorder identity, eligible source statuses, new hold, current prices | Phase 9 |
| Pop-up listing ownership and past-event handling | Phase 10 |

These later details need not block unrelated earlier work.

**Manual checkpoint:** Sign in as each branch's staff member, verify allowed branch access, load the test environment as a customer, and confirm that all fixtures can be reset without affecting live orders.

**Exit condition:** Existing behavior is mapped, test setup works, and every foundational decision above is recorded before order storage and capacity implementation begin.

## 5. Phase 1 — Branch-aware regular catalog

**Outcome:** Admin configuration immediately produces the correct customer menu.

### Build order

1. **Admin:** Configure Cebu and Manila main branches and the default branch.
2. **Admin:** Manage regular products, variants, prices, and branch availability using existing controls where possible.
3. **Customer:** Open directly on the regular catalog with a visible active branch and branch switcher.
4. **Customer:** Apply the URL branch parameter before the admin default; filter products to the selected branch.
5. **Admin → Customer:** Adjust a product or default branch and verify the updated public result.

### Manual checkpoint

- [ ] Open the order page without a parameter; it selects the configured default.
- [ ] Open `/order?branch=manila`; it shows Manila and its products.
- [ ] Change the admin default to Manila; a fresh parameter-free visit follows it.
- [ ] Switch branches; branch-specific products change correctly.
- [ ] Preorder-only products do not appear in the regular catalog.
- [ ] Invalid parameters follow the recorded fallback rule.
- [ ] A branch with no regular products shows a useful empty state.

**Exit condition:** Customers can browse the correct regular menu without a blocking branch-selection screen.

## 6. Phase 2 — Cart, pickup details, dates, and slots

**Outcome:** Customers can prepare a valid regular pickup request before submission is enabled.

### Build order

1. **Customer:** Add/remove products, change quantities, and review item totals.
2. **Admin:** Configure online start time, cutoff, and the date-availability rules agreed in Phase 0. Keep store closing time distinct.
3. **Shared rules:** Generate one-hour slots and validate selected dates and times consistently.
4. **Customer:** Build Pickup → Main branch → Date → Time slot, then required name/phone and optional social details.
5. **Customer → Admin:** Verify that the selected schedule matches configured hours. Implement the agreed branch-switch cart behavior.

### Manual checkpoint

- [ ] Add one item, several products, and a larger quantity; totals and edits remain correct.
- [ ] Name and phone are required; social-media details are optional.
- [ ] Regular orders can use valid future dates.
- [ ] Slots match admin configuration and cannot be chosen outside the allowed window.
- [ ] Test the exact cutoff boundary and an already elapsed slot using the recorded rules.
- [ ] Change branch with a nonempty cart; the agreed handling is clear and no incompatible product survives unnoticed.
- [ ] Returning to the cart preserves valid entries.

**Exit condition:** A customer can reach a complete, valid pickup review screen. Live submission remains unavailable until capacity and routing are connected in Phase 3.

## 7. Phase 3 — Daily allocation, submission, and branch inbox

**Outcome:** One submitted request creates one order, reserves each chosen flavor's pie count, and reaches the correct branch.

### Build order

1. **Admin:** Set numeric daily online allocation, increase it, and disable online ordering for today.
2. **Shared rules:** Save the order and reserve capacity together. Recheck date, slot, products, and capacity when submitting.
3. **Customer:** Enable submission, generate an order number, show pending confirmation, and provide the agreed chat handoff.
4. **Admin:** Show new held requests in the appropriate main-branch inbox, including date/time, items, contact details, and hold deadline.
5. **Customer:** Add the initial secure order-status view and next-available-date behavior.
6. **Shared availability:** If no valid future date exists within the agreed horizon, preserve the cart, show an unavailable-dates message, and prevent submission. Disabling today stops new requests without cancelling existing holds or accepted orders. Increasing allocation must not silently change a selected valid future date. Recheck on submission and explain necessary date changes before resubmission.

### Manual checkpoint

- [ ] Submit a Cebu request; Cebu staff sees it and Manila staff does not.
- [ ] Submit a Manila request and verify the reverse.
- [ ] Two sizes of one flavor consume that flavor's limit by pie count. A second flavor keeps its own limit. Add-ons do not consume a flavor limit.
- [ ] Use different slots on the same date; they draw from the same daily pool.
- [ ] Exhaust today's allocation; the customer moves to the next available date without a Full/Sold out branch label.
- [ ] Disable today while a customer has checkout open; submission cannot bypass the new restriction.
- [ ] Make tomorrow unavailable too; select the next valid available date.
- [ ] Increase allocation and verify newly available dates update without silently replacing a customer's valid selected future date.
- [ ] No date is available within the booking horizon; show “No online dates are currently available,” preserve the cart, and prevent submission.
- [ ] Disable today with existing held/accepted orders; those orders remain intact while new requests are blocked.
- [ ] Availability changes at submission; explain the required date change before the customer resubmits.
- [ ] Two customer sessions compete for the final allocation; only one succeeds.
- [ ] Double-click Submit or retry after a delayed response; no duplicate order or hold is created.
- [ ] Order receipt and status page clearly show that staff approval is still required.

**Automated checks in this phase:** Competing final-allocation requests; duplicate/retried submission; branch routing and order access.

**Exit condition:** Request creation, branch routing, customer receipt, and capacity accounting agree across both sides. Complete Phase 4 before allowing real unattended reservations.

## 8. Phase 4 — Processing, expiration, and approval

**Outcome:** Staff can safely hold an active request while unprocessed requests expire.

### Build order

1. **Admin:** Add Processing and display enough information to validate the request.
2. **Shared rules:** Stop the initial reservation timer when Processing succeeds; expire unattended holds and release capacity once.
3. **Admin:** Add approval and the agreed rejection/cancellation handling needed to close unsuccessful requests.
4. **Customer:** Reflect Held/Pending validation, Processing, Approved, Expired, and other agreed terminal states.
5. **Shared history:** Record staff/system actor, timestamp, changed fields, and previous/new values for processing, approval, expiration, and other state changes.
6. **Both:** Check refreshes and conflicting actions around the hold deadline.

### Manual checkpoint

- [ ] Leave a request untouched; it expires at the configured deadline and returns each held flavor quantity.
- [ ] Mark another request Processing before expiry; it remains held beyond the initial deadline.
- [ ] Attempt Processing at the expiration boundary; only one valid outcome is saved, without double-release or an unreserved active order.
- [ ] Approve a processed request; the customer sees Approved after refreshing/reopening.
- [ ] Apply the agreed reject/cancel action; customer status and capacity follow the selected rule.
- [ ] An unauthorized customer cannot read another customer's contact/address information using an order number alone.
- [ ] A stale browser page cannot repeat an invalid transition.
- [ ] Staff and automatic actions appear in the order history with the correct actor and before/after values.

**Automated checks in this phase:** Expiration versus Processing; one-time release; invalid transitions; customer/branch access; persisted action history.

**Exit condition:** Holds, expiration, ownership, and approval work together. No order waits for customer acceptance of an admin revision.

## 9. Phase 5 — Complete basic pickup

**Outcome:** A straightforward regular pickup request reaches Completed before advanced editing is introduced.

### Build order

1. **Admin:** Validate payment arranged in chat and record the payment separately from approval and fulfillment progress.
2. **Admin:** Advance the approved order through Preparing, Ready for pickup, and Completed using the Phase 0 transition rules.
3. **Customer:** Display the corresponding status, current details, and clear pickup instructions.
4. **Both:** Reopen the status/detail screens and verify persisted results.

### Manual checkpoint

- [ ] Complete a regular pickup from catalog entry through submission, Processing, approval, payment, preparation, collection, and completion.
- [ ] Recording approval alone does not mark payment received.
- [ ] Ready for pickup is explicit on the customer status page.
- [ ] Completing the order does not return consumed daily capacity as if the order had expired.
- [ ] Refresh and reopen the completed order's detail screen; payment, details, and status persist.

**Automated checks in this phase:** Valid and invalid payment/fulfillment transitions; completion retains consumed allocation.

**Exit condition:** Complete the basic pickup journey without data repair or developer intervention. Advanced edits are tested separately in Phase 6.

## 10. Phase 6 — Advanced admin edits and payment reconciliation

**Outcome:** Staff can revise an order without corrupting its reservation, recorded payments, or fulfillment progress.

### Build order

1. **Admin:** Allow quantity reduction, item removal, date/time changes, and authorized main-branch changes.
2. **Shared rules:** Validate revised products/dates and recalculate totals. Transfer branch/date allocation as one operation; a failed transfer preserves the original valid order and reservation.
3. **Customer:** Show saved revisions without a customer acceptance step. Admin revisions do not automatically mark an order Paid or move Preparing/Ready progress backward.
4. **Admin:** Preserve original payment records; display additional amount due or refund due after a total changes. Record additional payment or refund settlement arranged in chat as a separate financial entry.
5. **Both:** Show consistent current order details. Extend the Phase 4 history to include revisions, allocation transfers, and financial adjustments.

### Manual checkpoint

- [ ] Reduce quantity/remove an unavailable item; the revised total appears on both sides.
- [ ] No customer acceptance button or revision-acceptance timeout appears.
- [ ] Editing an unpaid order does not mark it Paid.
- [ ] Reduce a paid order's total; original payment remains and the refund due is correct.
- [ ] Make a permitted change that increases the total; the additional amount due is correct.
- [ ] Record settlement in chat; the remaining adjustment updates without erasing the original payment or resetting fulfillment.
- [ ] Move to another date with capacity; allocation transfers exactly once.
- [ ] Attempt a move to an unavailable date; the original reservation remains intact.
- [ ] Transfer branches with authorized access; products, routing, and capacity remain valid.
- [ ] Edit a Preparing or Ready order; the edit does not automatically regress its progress.
- [ ] History records actor, timestamp, changed fields, and previous/new values.
- [ ] Customer and admin still see the same saved result after refreshing.

**Automated checks in this phase:** Successful/failed allocation transfers; preservation of payments and progress; amount-due/refund calculations and settlements; change history.

**Exit condition:** All supported edits work with accurate capacity, financial records, status, and history. No customer reacceptance is required.

## 11. Phase 7 — Delivery with staff validation

**Outcome:** Delivery uses the working order lifecycle and shares pickup's daily allocation.

### Build order

1. **Admin:** Configure which main branches support delivery and make existing named areas available for staff reference.
2. **Customer:** Add Delivery → Main branch → Address → Date → Time slot and the manual eligibility/fee message.
3. **Shared rules:** Use the same daily pickup/delivery pool, not a separate delivery-area allocation.
4. **Admin:** Review the address, record eligibility and agreed fee information, and arrange delivery manually through a non-Grab service.
5. **Customer:** Display the resulting details and the delivery progress states decided for this phase.

### Manual checkpoint

- [ ] Switch a regular cart from Pickup to Delivery; products remain and address is requested.
- [ ] Missing address blocks submission; optional social information remains optional.
- [ ] Delivery is not promised before staff review.
- [ ] Staff approves an eligible address and confirms the customer-paid fee in chat.
- [ ] Staff handles an ineligible address through the agreed resolution path; it does not remain misleadingly confirmed.
- [ ] One pickup plus one delivery consumes two units of the same daily pool.
- [ ] Pickup and delivery compete for the last allocation without overselling.
- [ ] Complete a delivery request with correct customer-facing wording rather than pickup-only instructions.

**Exit condition:** Complete one eligible delivery and resolve one ineligible delivery, with accurate statuses, fees, and capacity.

## 12. Phase 8 — Separate preorder catalog and preparation dates

**Outcome:** Preorders reuse proven fulfillment and lifecycle behavior while enforcing their own preparation requirements.

### Build order

1. **Admin:** Configure preorder products/variants and preparation days. Keep the same variant's preparation requirement consistent across branches.
2. **Shared rules:** Reuse the calendar/business-day interpretation and regular/preorder capacity relationship recorded in Phase 0; implement preorder date validation on those foundations.
3. **Customer:** Create the separate preorder catalog and cart; show preparation requirements beside products.
4. **Customer:** Determine the earliest date from the longest preparation requirement, then support the existing pickup/delivery checkout.
5. **Admin:** Receive and process preorder requests with visible items, required preparation, and fulfillment date.

### Manual checkpoint

- [ ] A standard regular variant appears in normal ordering; a preorder-only variant appears in the preorder section.
- [ ] Products needing three and five days use the five-day earliest date under the chosen day-counting rules.
- [ ] Adding/removing the longest-preparation product recalculates valid dates and flags a now-invalid selection.
- [ ] Changing quantity or variant does not leave an invalid preparation date undetected.
- [ ] A date allowed by preparation rules but unavailable by capacity is still blocked.
- [ ] Regular and preorder items cannot be combined into one submitted order.
- [ ] Branch catalogs differ where configured, but the same variant's preparation days do not change by branch.
- [ ] Complete both a preorder pickup and a preorder delivery through staff approval and fulfillment.
- [ ] Admin date/item edits are checked against preorder rules too.

**Automated checks in this phase:** Longest preparation requirement; variant changes; preparation/date boundaries and capacity constraints.

**Exit condition:** Both preorder fulfillment methods work end to end, and no path bypasses preparation or capacity checks.

## 13. Phase 9 — Customer and admin reorder/reopen

**Outcome:** Expired requests are recoverable using current ordering rules.

### Build order

1. **Shared decisions:** Define Reorder versus Reopen, whether the order number changes, permitted source statuses, and handling of current prices/availability.
2. **Customer:** Implement Reorder with existing items populated for review, using the agreed behavior for changed or unavailable products.
3. **Admin:** Implement the corresponding reorder and reopen controls.
4. **Customer:** Implement reopening of an eligible expired order.
5. **Shared rules:** Revalidate branch, catalog, dates, preparation, and capacity; create a new hold only when the recovery action succeeds.

### Manual checkpoint

- [ ] Customer reorders an expired order and completes the resulting valid request.
- [ ] Customer reopens an eligible expired order using the chosen identity/number rules.
- [ ] Admin can perform both supported actions.
- [ ] Changed prices, removed products, elapsed slots, and new preparation constraints are visible before resubmission.
- [ ] An unavailable original date cannot be silently reused.
- [ ] Repeated recovery clicks do not create duplicate holds or orders.
- [ ] Failed recovery does not consume allocation or corrupt the original order.

**Automated checks in this phase:** Repeated recovery actions; current prices/availability/date validation; successful new holds and failed recovery without capacity consumption.

**Exit condition:** Both roles can use both agreed recovery actions without bypassing validation or losing the original order history.

## 14. Phase 10 — Visit-only pop-ups

**Outcome:** Customers can discover temporary locations without confusing them with online fulfillment branches.

### Build order

1. **Admin:** Create/edit temporary listings with address, dates, hours, and available items, using the agreed management permissions.
2. **Customer:** Add a Visit us here / Find Makalipie section that clearly identifies temporary locations.
3. **Both:** Verify updates and the agreed handling of past events.

### Manual checkpoint

- [ ] Create a listing in admin; correct visit information appears publicly.
- [ ] Update hours/items; the public listing reflects the saved changes.
- [ ] Pop-ups have no Order button.
- [ ] Pop-ups cannot be selected as pickup or delivery fulfillment branches.
- [ ] Existing online carts and orders continue to route only to main branches.

**Exit condition:** Visit discovery is complete and isolated from online order allocation and routing.

This phase can move earlier after Phase 1 if useful, because it does not depend on order lifecycle work. Keep its manual checkpoint intact.

## 15. Phase 11 — Complete-system verification and release

**Outcome:** All agreed flows work together with realistic settings and data.

### Final manual test matrix

Run each row from catalog entry through final fulfillment, alternating customer and staff actions as a real order would require.

| Branch | Catalog | Fulfillment | Include |
| --- | --- | --- | --- |
| Cebu | Regular | Pickup | Default link, staff edit, Ready for pickup |
| Cebu | Regular | Delivery | Address review, fee confirmation, shared capacity |
| Manila | Regular | Pickup | URL parameter, branch-specific products |
| Manila | Regular | Delivery | Correct inbox and delivery handling |
| Cebu | Preorder | Pickup | Mixed preparation requirements |
| Cebu | Preorder | Delivery | Preparation plus address validation |
| Manila | Preorder | Pickup | Variant rules and future dates |
| Manila | Preorder | Delivery | Complete combined flow |

Repeat targeted exception tests for:

- Today's allocation exhausted; today disabled; tomorrow also unavailable; no available date within the booking horizon.
- Disabling today with existing held/accepted orders and increasing allocation while a future date is selected.
- Paid-order reductions, additional amounts due/refunds settled in chat, and editing Preparing/Ready orders without resetting progress.
- Expiration, Processing at the deadline, and release of a failed request.
- Admin edits that transfer branch/date capacity and edits that cannot be saved.
- Customer/admin reorder and reopen after catalog or schedule changes.
- The last available allocation with competing sessions and repeated submission.
- Unsupported delivery addresses and failed/unfinished payment handling under the chosen rules.
- Mobile layout, keyboard operation, form error messages, empty states, and slow or interrupted requests.
- Customer order-access protection and branch staff access restrictions.

### Focused automated checks

Manual testing is the main phase checkpoint. Implement and run focused automated checks in the phase introducing the behavior, as specified above. Phase 11 reruns them as integration/regression verification; correctness testing must not wait until release. Avoid duplicating every visual check as an automated test.

### Release preparation

1. Replace fixtures with approved branch catalogs, prices, hours, capacity, chat destinations, and preparation rules.
2. Verify real reservation timing and remove test-only clock shortcuts.
3. Check any migration of existing orders/settings and retain a recovery path before enabling live ordering.
4. Walk staff through Processing, payment validation, edits, fulfillment, failed requests, and reopening.
5. Verify the next-available-date behavior and today's disable control with realistic settings.
6. Enable the completed flows in the agreed release environment and run a controlled real-setting smoke test.

### Definition of completely built

- [ ] Every phase checkpoint is passed or an explicit scope change is recorded.
- [ ] All eight branch/catalog/fulfillment combinations work.
- [ ] Customer and admin views agree on items, amounts, branch, dates, and status.
- [ ] Shared daily capacity stays correct across submissions, expiration, edits, and recovery.
- [ ] All open decisions needed by implemented behavior are resolved and documented.
- [ ] Pop-ups remain visit-only, and confirmation/payment remain in chat.
- [ ] No required customer action depends on an unfinished admin screen, and no required admin action has an unfinished customer result.
- [ ] Staff can run a full order cycle without developer intervention.
- [ ] Release verification passes with actual operational settings.

## 16. Handoff record for each phase

Use this short record before switching to the next phase:

```text
Phase:
Status: Not started / In progress / Ready for manual test / Passed
Admin work completed:
Customer work completed:
Shared rules completed:
Decisions resolved:
Manual tests and results:
Known defects or remaining work:
Next phase / next side to work on:
```

Switching between admin and customer work is expected throughout the plan. A phase is complete when its connected workflow passes, not merely when one side's screens look finished.

## Confirmed scheduling and branch-switch follow-up

- Initial future booking horizon: **30 days ahead**, configurable by admin.
- Online cutoff applies only to new same-day orders; future-date ordering remains open.
- Changing branches preserves matching cart items and flags unavailable items for removal; checkout cannot submit unresolved unavailable items.
- These answers resolve the earlier open questions on booking horizon, cutoff scope, and branch-switch cart handling. Detailed slot boundaries and other remaining decisions are separate.


---

## Latest verification evidence — Phase 2

## Result

Phase 2 (cart and scheduling) passed its local checkpoint on September 28, 2026. Implementation is in the existing Makalipie application. Changes are uncommitted and not deployed.

## Delivered

- Owner-only **Bakery schedule** page, connected to customer ordering.
- Independent Cebu and Manila start times, online cutoffs, open weekdays, and closed dates.
- Configurable future booking horizon, initially 30 days, inclusive of today plus 30 days.
- Complete one-hour slots in Manila time. Started slots disappear; same-day cutoff does not close future ordering.
- Shared customer/server rules combine branch hours with product and add-on availability.
- Earliest valid date is selected automatically before the customer chooses a date or slot.
- Explicit selections stay in place when settings change. Invalid dates or slots receive an explanation and block continuing until corrected.
- No available dates preserves the current page's cart and customer details and blocks continuing.
- Availability refreshes every minute, on focus, and through **Refresh available dates**.
- Final server validation checks the current schedule and catalog before producing the existing chat summary.
- Settings persist across reopening, reject stale edits, and record staff audit events.

## Verification

| Check | Result |
| --- | --- |
| Scheduling unit checks | 9 passed |
| Existing branch, policy, admin access, and catalog unit checks | 18 passed |
| Scheduling emulator integration | 5 scenarios plus parent test passed |
| Branch emulator regression | 4 scenarios plus parent test passed |
| Type checking | Passed |
| Lint on changed scheduling/customer code and tests | Passed |
| Production build using Node 24 and Webpack | Passed |
| Diff whitespace checks | Passed |

Automated checks include Manila midnight, month/leap-year boundaries, the inclusive horizon, partial-hour exclusion, cutoff, closed dates/weekdays, add-on preparation, invalid configuration, forged slots, saved reloads, stale edits, unauthorized requests, revoked access, and refreshed rules on rejected requests.

The older catalog integration test was updated for the scheduling contract but was not rerun because it resets the demo catalog. Existing catalog unit tests and the non-destructive branch/schedule integrations passed.

## Manual admin/customer checks

1. Enabled Cebu hours, saved, and reopened the admin page: settings persisted.
2. Added a pie, name, contact number, date, and slot in the customer tab: continuing became available.
3. Closed the chosen date in admin and refreshed customer availability: items and details remained; invalid-date/slot warnings appeared and continuing was disabled.
4. Chose tomorrow and a valid slot: the request became valid again.
5. Disabled all Cebu online dates: the no-dates message appeared, cart remained, and continuing stayed disabled.
6. Re-enabled the schedule: the selected future date remained unchanged.
7. Inspected both interfaces at a 483-pixel viewport: no horizontal overflow; date controls, warnings, and admin save controls remained readable.

No Instagram message was sent. Integration fixtures restored their own settings changes. For further local testing, the demo schedule is left with Cebu enabled daily from 10:00 AM to 7:00 PM, no closed dates, a 30-day horizon, and Manila disabled. These are demo settings, not a production operating-hours decision.

## Scope and next checkpoint

Cart preservation applies while the page remains open; persistent carts across a full browser reload are not implemented. Existing chat-summary ordering remains in place. Durable order creation, capacity allocation, duplicate protection, reservation holds, branch inboxes, and customer receipts are Phase 3. The existing delivery preference is not the completed Phase 7 delivery workflow.

Next: **Phase 3 — submission and capacity**, using the confirmed shared daily pool and 30-minute hold.

---

## Latest verification evidence — Phase 3

## Result

Phase 3 (daily allocation, submission, and branch inbox) is implemented in the existing Makalipie application. Daily limits are per flavor: sizes of one flavor add together, add-ons do not count, and a second flavor keeps its own limit. Automated checks passed on September 28, 2026. The emulator integration covers a competing last pie, an idempotent retry, a guest token, and a mixed cart that does not take a partial hold. Older order-level allocation documents are ignored. Changes are uncommitted and not deployed. Unattended hold expiration remains Phase 4, so live intake stays closed unless `ORDER_INTAKE_ENABLED=true` or `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`.

## Delivered

- Owner **Daily allocation** page: a limit per branch, date, and flavor. A blank day leaves that flavor open, subject to the schedule and the product’s own availability. A saved number caps that flavor. Today's pause is branch-wide and does not change existing holds. Older order-level allocation documents are ignored.
- Shared availability: when intake is on, an empty cart can use a date that has any open flavor. A cart can use a date only when every chosen flavor is open. An explicit future date is not replaced. The exact pie count is rechecked on submit.
- Atomic submission: one order reserves every chosen flavor's pie count, or none of them. Idempotency key replay, guest token hash, and a 30-minute deadline are stored. The order records `heldFlavors` so Phase 4 can return those quantities. No expiration worker runs in this phase.
- Customer receipt at `/order/status#token`. Instagram handoff copies the summary, including the order number, and opens the existing DM link.
- Orders inbox for owners and assigned staff. Owner settings stay owner-only. Staff sign-in does not grant catalog, branch, schedule, or allocation access.

## Verification

| Check | Result |
| --- | --- |
| Allocation unit checks (`test:orders`) | 6 passed |
| Admin access unit checks, including staff sign-in without owner access | 7 passed |
| Order policy unit checks | 5 passed |
| Scheduling unit checks | 9 passed |
| Order emulator integration: unset flavor still accepts a request, competing last pie, idempotent retry, guest token, second flavor still open, mixed cart without a partial hold | 1 passed |
| Type checking | Passed |
| Lint on Phase 3 files | Passed |

## Scope and next checkpoint

A blank or missing flavor limit stays open, subject to the schedule and that product’s own availability. A saved number caps the flavor. Pausing today blocks new requests for every flavor. Order number lookup cannot load a guest receipt. Phase 4 must expire untouched holds and return each held flavor quantity before unattended reservations are safe to leave running.

Next: **Phase 4 — processing, expiration, and approval.**
