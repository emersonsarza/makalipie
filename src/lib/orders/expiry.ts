/** Bounds for the hold-expiry query: requested orders whose deadline is already due. */
export function dueHoldConstraints(now: Date) {
  return { status: "requested" as const, deadlineMax: now.toISOString() };
}
