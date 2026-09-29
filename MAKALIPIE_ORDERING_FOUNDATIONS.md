# Makalipie ordering foundations

## Decision authority

The current ordering specification and subsequent user answers supersede conflicting older repository plans. This file records confirmed business decisions separately from implementation defaults. None of these records enables live order submission.

## Confirmed business decisions

- The business has a list of main branches. Cebu is permanent and always public. Other branches can be added, removed, or hidden. A hidden branch stays editable in admin and is absent from the public site. When only one branch is public, the order form selects that branch and does not show a switcher. All online orders belong to one main branch.
- Daily capacity counts orders and is shared across regular/preorder and pickup/delivery. No per-slot or item-count allocation.
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

Phase 1 connects owner branch settings to the customer regular catalog and validates branch assignments in the existing quote-preview endpoint. Full ordering/scheduling remains later-phase work.
