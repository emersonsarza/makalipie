import type { BranchRecord } from "../branches/schema";
import { openPopups, type PopupListing } from "./schema";

export type PublicLocations = { upcoming: PopupListing[]; recent: PopupListing[] };
export const locationAnchor = (id: string) => `location-${id}`;

const hiddenPopupIds = new Set(["mont-christmas-bazaar"]);

/** The Sunday on or after `today`. `today` is an Asia/Manila calendar date. */
export function nextSunday(today: string) {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + (7 - date.getUTCDay()) % 7);
  return date.toISOString().slice(0, 10);
}

export function publicLocations(listings: PopupListing[], today: string): PublicLocations {
  const sunday = nextSunday(today);
  const visible = listings
    .filter((listing) => !hiddenPopupIds.has(listing.id))
    .map((listing) => listing.id === "sunday-market" ? { ...listing, startDate: sunday, endDate: sunday } : listing);
  const cutoff = new Date(`${today}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const earliest = cutoff.toISOString().slice(0, 10);
  return {
    upcoming: openPopups(visible, today),
    recent: visible.filter(p => p.endDate < today && p.endDate >= earliest)
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
