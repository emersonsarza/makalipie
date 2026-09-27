# Makalipie ordering implementation — phase progress

## Authority and status

The current user-approved phased ordering plan supersedes conflicting policies in MAKALIPIE_ADMIN_DATA_AND_PLAN.md. Existing marketing/catalog functionality remains intact.

Phase 0 is in progress. This change adds tested shared policy primitives, not working order submission or a completed phase.

## Confirmed decisions

- Daily order-count capacity is shared across regular/preorder and pickup/delivery, separately for each main branch and fulfillment date.
- Initial booking horizon is 30 days ahead, configurable by admin.
- Online cutoff stops new same-day requests only; future-date requests remain available.
- Initial hold defaults to 30 minutes and remains admin-configurable in later settings work.
- Staff must verify full payment before preparation. Approval alone does not meet this requirement.
- Processing stops the initial reservation timer; its transaction and worker implementation belong to the later lifecycle phase.
- Completed orders stay counted; expiration releases an unattended hold exactly once.

The older next-day 8 PM reservation policy, per-item/per-slot capacity proposal, and payment-on-collection preparation policy are superseded.

## Implemented foundation

- Shared branch/date capacity key independent of catalog and fulfillment method.
- Validated policy defaults and reservation deadline calculation using supplied server time.
- Preparation payment guard requiring finalized totals, staff-verified paid state, and sufficient net received funds.
- Unit coverage for shared pools, cross-midnight holds, malformed settings, and unpaid/partially paid/repriced orders.

These primitives are not yet wired to an order endpoint; no such endpoint currently exists. The preparation guard must be called by the future trusted status mutation, never treated as a browser-only check. Payment inputs must come from saved staff-verified records.

## Remaining Phase 0 work

- Branch-switch cart handling is confirmed: retain matching items and flag unavailable items for removal before checkout. Implement it with the branch catalog in Phase 1. Exact slot/cutoff boundaries still need definition.
- Finalize guest status access, staff branch permissions, transition/release rules, and prolonged Processing handling.
- Prepare isolated fixtures and verify access/test sessions.
- Reuse Asia/Manila, integer centavos, and existing calendar-day catalog rules where compatible.

Do not mark Phase 0 passed or enable live requests until its remaining checkpoints are verified.

## Verification

The initial foundation passed 12 unit tests (4 policy, 5 access, 3 catalog), TypeScript checking, and targeted lint. An additional policy test now covers the booking-horizon default and same-day-only cutoff configuration. These checks do not exercise a live ordering endpoint.
