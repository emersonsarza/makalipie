import { z } from "zod";
import { businessDateSchema } from "../admin/schemas";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const popupListingSchema = z.object({
  id: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens.").max(40),
  name: z.string().trim().min(1).max(80),
  address: z.string().trim().min(1).max(300),
  mapUrl: z.string().trim().max(500).refine((value) => value === "" || /^https:\/\/\S+$/.test(value), "Use an https map link."),
  startDate: businessDateSchema,
  endDate: businessDateSchema,
  hours: z.string().trim().min(1).max(80),
  items: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
}).strict().superRefine((listing, ctx) => {
  if (listing.id === "cebu" || listing.id === "manila") {
    ctx.addIssue({ code: "custom", message: "Pop-ups stay separate from the main branches.", path: ["id"] });
  }
  if (listing.endDate < listing.startDate) {
    ctx.addIssue({ code: "custom", message: "The last date comes on or after the first date.", path: ["endDate"] });
  }
  const items = listing.items.map((item) => item.toLowerCase());
  if (new Set(items).size !== items.length) {
    ctx.addIssue({ code: "custom", message: "Do not repeat an item.", path: ["items"] });
  }
});
export type PopupListing = z.infer<typeof popupListingSchema>;

export const popupSettingsSchema = z.object({
  version: z.number().int().nonnegative(),
  listings: z.array(popupListingSchema).max(40),
}).strict().superRefine((settings, ctx) => {
  const ids = settings.listings.map((listing) => listing.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Each pop-up needs its own id.", path: ["listings"] });
});
export type PopupSettings = z.infer<typeof popupSettingsSchema>;

export function defaultPopupSettings(): PopupSettings {
  return { version: 0, listings: [] };
}

export function parsePopupSettings(input: unknown): PopupSettings {
  return popupSettingsSchema.parse(input);
}

export function popupIsPast(listing: PopupListing, today: string) {
  return listing.endDate < today;
}

/** Current and upcoming listings: the last date is today or later in Asia/Manila. Soonest first. */
export function openPopups(listings: PopupListing[], today: string) {
  return listings
    .filter((listing) => listing.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name));
}

export function popupClaimsBranch(branchId: string, listings: PopupListing[]) {
  return listings.some((listing) => listing.id === branchId);
}

export function popupDateLabel(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

export function popupDateRange(start: string, end: string) {
  if (start === end) return popupDateLabel(start);
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  if (startYear === endYear && startMonth === endMonth) return `${MONTHS[startMonth - 1]} ${startDay}–${endDay}, ${startYear}`;
  if (startYear === endYear) return `${MONTHS[startMonth - 1]} ${startDay} – ${MONTHS[endMonth - 1]} ${endDay}, ${startYear}`;
  return `${popupDateLabel(start)} – ${popupDateLabel(end)}`;
}
