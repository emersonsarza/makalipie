# Makalipie — Phase 2 Verification

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

# Makalipie — Phase 0 and Phase 1 Verification

## Result

**Phase 0 foundations recorded and tested. Phase 1 branch/catalog implementation passed its local checkpoint.**

The application was changed in `/Users/emerson/makalipie`. Changes are not committed or deployed by this task. No production database was modified.

## Phase 0 foundation

- Confirmed policies remain: shared daily branch capacity, 30-minute configurable hold, full payment before preparation, 30-day configurable booking horizon, and same-day-only cutoff.
- Added an explicit foundational decision record in the repository, distinguishing confirmed business rules from implementation defaults.
- Defined owner versus assigned-branch staff access. Tested the authorization primitive while keeping existing admin sessions owner-only until operational staff screens are implemented.
- Recorded timezone, calendar-day preparation, slot boundaries, guest status-access design, lifecycle/capacity behavior, and later-phase responsibilities.
- Verified local demo owner sign-in, protected settings routes, denied unauthenticated access, denied cross-origin mutation, and denied revoked-owner access.

This completes the foundation checkpoint, not implementation of later order/status/worker services. Those must enforce the recorded contracts when built.

## Phase 1 delivered

### Admin

- New Branches page at `/admin/branches`, linked from the workspace navigation.
- Editable Cebu/Manila main-branch names and pickup addresses.
- Admin-selected default branch.
- Each product size can be assigned to Cebu, Manila, both, or neither.
- Explicit Regular / Pre-order classification. A size requiring preparation days cannot be saved as Regular.
- Saved configuration is versioned; stale saves are rejected without overwriting newer changes.
- Settings changes record an audit event.

### Customer

- Ordering starts inside the selected branch with a visible selector.
- Valid `?branch=manila` or `?branch=cebu` takes priority over the admin default; invalid/missing values fall back to the default.
- Regular ordering displays only regular sizes available at the selected branch.
- Switching branches preserves matching selected items and flags unavailable ones for removal.
- Unresolved unavailable items block continuing the order.
- An empty branch catalog shows a useful message and leaves the selector available.
- Pickup wording and address follow the active branch.
- Cash-on-collection was removed from the form to match payment-before-preparation.
- The existing trusted quote-preview endpoint independently rejects selections outside the branch or regular catalog.

Existing request behavior still copies an order summary to chat; no durable order number or reservation is created yet. Preorder classification is configured now, but its dedicated checkout arrives in Phase 8.

## Automated verification

| Check | Result |
| --- | --- |
| Branch unit tests | 4 passed |
| Ordering policy unit tests | 5 passed |
| Admin access unit tests | 6 passed |
| Catalog unit tests | 3 passed |
| Branch integration suite | 5 tests passed, including the parent suite and four scenarios |
| TypeScript checking | Passed |
| Targeted lint | Passed |
| Diff whitespace check | Passed |
| Webpack production build | Passed |

The default Turbopack production build was blocked by a local worker port-binding restriction. The supported Webpack build completed successfully. Tests and the preview used the bundled Node 24 runtime because the shell's Node 22.8 is below the repository's declared requirement.

Integration scenarios cover authentication/origin checks, saved reloads, stale-save rejection, audit recording, branch-restricted quotes, preorder exclusion, and revoked-owner mutation denial. Integration settings are restored after the run; existing catalog records are preserved.

## Browser checkpoints

- [x] Sign into the demo owner workspace and open Branches.
- [x] Assign Keylime to both branches while keeping Pecan Cebu-only.
- [x] Set the default to Manila, save, and verify a fresh parameter-free customer visit starts in Manila.
- [x] Reload admin and verify the saved default persists.
- [x] Add Keylime and Pecan in Cebu, switch to Manila, and verify Keylime remains while Pecan is flagged.
- [x] Verify continuing is blocked until Pecan is removed, then becomes available again.
- [x] Classify Buko as preorder and verify it disappears from Cebu regular ordering while Keylime remains.
- [x] Verify an empty Manila catalog gives a message and prevents continuing.
- [x] Verify direct Cebu and Manila branch links.
- [x] Inspect narrow layouts: admin at 390px and customer at the browser's observed 483px viewport; no horizontal overflow in those checks. Also checked the admin layout at 1280px.
- [x] Restore the original demo default and assignments after the tests.

Temporary browser viewport overrides are reset at the end of verification. Demo-only activity remains separate from production.

## Next phase

**Phase 2 — Cart and scheduling:** add persisted admin schedule configuration, generate one-hour slots, enforce the configured 30-day horizon and same-day cutoff consistently, and connect those rules to customer pickup details. Order submission stays a later phase.
