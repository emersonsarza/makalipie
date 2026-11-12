import type { presentDrop, presentDropDiscovery } from "@/lib/drops/present";
import type { presentEligibility } from "@/lib/storefront/present";

export type PublicDrop = NonNullable<ReturnType<typeof presentDrop>>;
export type DropSummary = ReturnType<typeof presentDropDiscovery>[number];
export type BranchEligibility = NonNullable<ReturnType<typeof presentEligibility>>;
export const dropStateLabels = {
  upcoming: "Coming soon", open: "Ordering open", sold_out: "Sold out", closed: "Ordering closed",
};

export function checkoutHref(locationId: string, dropId?: string) {
  const query = new URLSearchParams();
  if (locationId !== "cebu" || dropId) query.set("loc", locationId);
  if (dropId) query.set("drop", dropId);
  return query.size ? `/order?${query}` : "/order";
}
