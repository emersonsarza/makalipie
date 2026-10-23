import { createHash } from "node:crypto";
import { z } from "zod";
import { popupListingSchema, type PopupListing, type PopupSettings } from "../popups/schema";

/**
 * Pop-ups v2 edits one informational listing on `settings/popups`.
 * A missing document is an empty collection, not a failed read.
 * There is no stored visibility flag, so every listing is presented
 * with `visible: null` and `manualVisibility: false`. Publication
 * stays date-based through `openPopups`. C10 stays unresolved: a
 * listing is not a branch, a pickup destination, or a stock record.
 * Ended listings are kept. Nothing here deletes a record to free a slot.
 */
export const POPUPS_CACHE_CONTROL = "private, no-store";
export const POPUPS_MANUAL_VISIBILITY = false;

const listingSchema = z.object({
  id: z.string().trim().max(40),
  name: z.string().trim().max(80),
  address: z.string().trim().max(300),
  mapUrl: z.string().trim().max(500),
  startDate: z.string().trim().max(40),
  endDate: z.string().trim().max(40),
  hours: z.string().trim().max(80),
  items: z.array(z.string().trim().max(80)).max(20),
  visible: z.boolean().nullable(),
}).strict();

export const popupCommandSchema = z.object({
  listing: listingSchema,
  isNew: z.boolean(),
  expectedRevision: z.string().regex(/^[a-f0-9]{16}$/),
  idempotencyKey: z.uuid(),
}).strict();
export type PopupCommand = z.infer<typeof popupCommandSchema>;

export type PopupSnapshot = {
  revision: string;
  listings: Array<PopupListing & { visible: null }>;
  canEdit: boolean;
  manualVisibility: false;
  reservedIds: string[];
};

export class PopupCommandError extends Error {
  constructor(readonly status: 400 | 403 | 409 | 503, readonly kind: "validation" | "permission" | "conflict" | "network", message: string) {
    super(message); this.name = "PopupCommandError";
  }
}

export function popupsAccess(admin: { role: string }) {
  const allowed = admin.role === "owner";
  return { allowed, canEdit: allowed };
}

export function popupsRevision(settings: PopupSettings) {
  return createHash("sha256").update(JSON.stringify({ version: settings.version, listings: settings.listings })).digest("hex").slice(0, 16);
}

export function presentPopups(settings: PopupSettings, reservedIds: string[], canEdit: boolean): PopupSnapshot {
  return {
    revision: popupsRevision(settings),
    listings: settings.listings.map((listing) => ({ ...listing, visible: null })),
    canEdit,
    manualVisibility: POPUPS_MANUAL_VISIBILITY,
    reservedIds: [...new Set(reservedIds)].sort(),
  };
}

export function planPopupSave(input: { command: PopupCommand; stored: PopupSettings; reservedIds: string[]; access: { canEdit: boolean } }): PopupSettings {
  if (!input.access.canEdit) throw new PopupCommandError(403, "permission", "This account does not have active owner access.");
  if (popupsRevision(input.stored) !== input.command.expectedRevision) throw new PopupCommandError(409, "conflict", "Pop-ups changed in another editor. Reload before saving again.");
  if (input.command.listing.visible !== null) throw new PopupCommandError(400, "validation", "Manual visibility is not stored yet.");
  const { visible: _visible, ...fields } = input.command.listing;
  void _visible;
  const parsed = popupListingSchema.safeParse(fields);
  if (!parsed.success) throw new PopupCommandError(400, "validation", parsed.error.issues[0]?.message || "Check the pop-up listing.");
  const listing = parsed.data;
  const reserved = new Set(input.reservedIds);
  if (reserved.has(listing.id)) throw new PopupCommandError(400, "validation", "A pop-up cannot use a branch ID.");
  const index = input.stored.listings.findIndex((item) => item.id === listing.id);
  if (input.command.isNew && index >= 0) throw new PopupCommandError(400, "validation", "This listing ID is already used.");
  if (!input.command.isNew && index < 0) throw new PopupCommandError(400, "validation", "Choose a saved listing.");
  if (input.command.isNew && input.stored.listings.length >= 40) throw new PopupCommandError(400, "validation", "The 40-listing limit has been reached.");
  const listings = input.stored.listings.map((item) => ({ ...item }));
  if (index >= 0) listings[index] = listing;
  else listings.push(listing);
  return { version: input.stored.version, listings };
}
