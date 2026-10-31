import type { BranchRecord } from "../branches/schema";
import { openPopups, type PopupListing } from "./schema";

export type PublicLocations = { upcoming: PopupListing[]; recent: PopupListing[] };
export const locationAnchor = (id: string) => `location-${id}`;

export function publicLocations(listings: PopupListing[], today: string): PublicLocations {
  const cutoff = new Date(`${today}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const earliest = cutoff.toISOString().slice(0, 10);
  return {
    upcoming: openPopups(listings, today),
    recent: listings.filter(p => p.endDate < today && p.endDate >= earliest)
      .sort((a, b) => b.endDate.localeCompare(a.endDate) || a.name.localeCompare(b.name)),
  };
}

/** Preserve branch IDs, addresses, assignments and historical references. */
export function cleanLocationBranches(branches: BranchRecord[]) {
  return branches.map(branch => ({ ...branch,
    name: branch.id === "cebu" ? "Cebu" : branch.name.replace(/\b(?:Makalipie|Main)\b/gi, "").replace(/\s+/g, " ").trim() || branch.id,
    visible: branch.id === "cebu" ? true : branch.id === "manila" ? false : branch.visible,
  }));
}
