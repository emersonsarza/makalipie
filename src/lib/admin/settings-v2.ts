import { createHash } from "node:crypto";
import { z } from "zod";
import { branchIdSchema } from "../branches/schema";

/**
 * Settings v2 reads the saved shop document and existing staff profiles.
 * A missing shop document stays blank: site defaults are not presented as
 * saved links, and absent hold or policy fields stay empty or null.
 * New orders require full payment and start with customer editing off.
 * Those defaults can be saved. Turning payment off, or turning customer
 * editing on for every new order, is rejected. Existing orders are not
 * rewritten. Appearance is not stored.
 * Hold edits apply to future requests only. Staff edits update existing
 * staff profiles; they do not create accounts, grant owner access, or
 * remove a saved profile. Settings and Branches stay owner-only.
 * Only Orders can be granted here. The sidebar still shows Orders alone
 * to staff, so other page grants stay visible but are not switched here.
 * Disabling a staff profile is enforced on the next request.
 */
export const SETTINGS_CACHE_CONTROL = "private, no-store";
export const SETTINGS_CAPABILITIES = { paymentDefault: true, customerEditDefault: true, appearance: false, staff: true } as const;
const LINK_KEYS = ["instagram", "instagramDm", "messenger", "grabFood", "foodpanda"] as const;
const SUPPORTED_PAGES = new Set(["orders"]);
const OWNER_PAGES = new Set(["settings", "branches"]);

export const STAFF_PAGES = [
  { id: "dashboard", name: "Dashboard", supported: false, note: "The dashboard API checks this grant, but the sidebar still shows only Orders to staff." },
  { id: "orders", name: "Orders", supported: true },
  { id: "kitchen", name: "Kitchen", supported: false, note: "Kitchen checks a separate grant, and the sidebar does not show it to staff yet." },
  { id: "catalog", name: "Catalog", supported: false, note: "Catalog checks a separate grant, and the sidebar does not show it to staff yet." },
  { id: "packages", name: "Packages", supported: false, note: "Packages have no staff permission yet." },
  { id: "allocation", name: "Daily allocation", supported: false, note: "Allocation checks this grant, but the sidebar still shows only Orders to staff." },
  { id: "schedule", name: "Schedule", supported: false, note: "Schedule checks this grant, but the sidebar still shows only Orders to staff." },
  { id: "popups", name: "Pop-ups", supported: false, note: "Pop-ups have no staff permission yet." },
] as const;

const linkValue = z.string().trim().max(2000).refine((value) => value === "" || (URL.canParse(value) && new URL(value).protocol === "https:"), "Use a complete HTTPS link or leave it blank.");
const staffSchema = z.object({
  uid: z.string().trim().min(1).max(128),
  name: z.string().trim().max(100),
  active: z.boolean(),
  branchIds: z.array(z.string().trim().min(1).max(40)).max(24),
  pages: z.array(z.string().trim().min(1).max(40)).max(20),
}).strict();
export const settingsCommandSchema = z.object({
  expectedRevision: z.string().regex(/^[a-f0-9]{16}$/),
  idempotencyKey: z.uuid(),
  values: z.object({
    links: z.object({ instagram: linkValue, instagramDm: linkValue, messenger: linkValue, grabFood: linkValue, foodpanda: linkValue }).strict(),
    holdMinutes: z.string().trim().max(8),
    confirmBeforeSlotMinutes: z.string().trim().max(8),
    requireFullPaymentDefault: z.boolean().nullable(),
    customerEditDefault: z.boolean().nullable(),
    themeId: z.string().trim().max(40).nullable(),
    bannerEnabled: z.boolean().nullable(),
    bannerText: z.string().max(300),
    bannerLink: z.string().trim().max(2000),
    staff: z.array(staffSchema).max(100),
  }).strict(),
}).strict();
export type SettingsCommand = z.infer<typeof settingsCommandSchema>;

export type StoredStaff = {
  uid: string;
  displayName: string;
  active: boolean;
  branchIds: string[];
  pages: Record<string, unknown>;
};

export type SettingsSnapshot = {
  revision: string;
  values: z.infer<typeof settingsCommandSchema>["values"];
  canEdit: boolean;
  branches: { id: string; name: string }[];
  capabilities: typeof SETTINGS_CAPABILITIES;
  themes: { id: string; name: string }[];
  staffPages: { id: string; name: string; supported: boolean; note?: string }[];
};

export class SettingsCommandError extends Error {
  constructor(readonly status: 400 | 401 | 403 | 409 | 503, readonly kind: "validation" | "conflict" | "permission" | "network" | "reauth", message: string) {
    super(message); this.name = "SettingsCommandError";
  }
}

export function settingsAccess(admin: { role: string }) {
  const allowed = admin.role === "owner";
  return { allowed, canEdit: allowed };
}

export function settingsRevision(input: { shop: Record<string, unknown> | null; staff: StoredStaff[]; branches: { id: string; name: string }[] }) {
  const shop = input.shop ? Object.fromEntries(Object.entries(input.shop).filter(([key]) => key !== "updatedAt" && key !== "updatedBy")) : null;
  const body = {
    shop,
    staff: input.staff.map((person) => ({ uid: person.uid, displayName: person.displayName, active: person.active, branchIds: [...person.branchIds].sort(), pages: person.pages })).sort((a, b) => a.uid.localeCompare(b.uid)),
    branches: input.branches.map((branch) => `${branch.id}:${branch.name}`).sort(),
  };
  return createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 16);
}

export function presentSettings(input: { shop: Record<string, unknown> | null; staff: StoredStaff[]; branches: { id: string; name: string }[]; canEdit: boolean }): SettingsSnapshot {
  const shop = input.shop ?? {};
  const links = objectRecord(shop.links);
  return {
    revision: settingsRevision(input),
    values: {
      links: {
        instagram: text(links.instagram), instagramDm: text(links.instagramDm), messenger: text(links.messenger),
        grabFood: text(links.grabFood), foodpanda: text(links.foodpanda),
      },
      holdMinutes: numberText(shop.holdMinutes),
      confirmBeforeSlotMinutes: numberText(shop.confirmBeforeSlotMinutes),
      requireFullPaymentDefault: typeof shop.requireFullPaymentDefault === "boolean" ? shop.requireFullPaymentDefault : null,
      customerEditDefault: typeof shop.customerEditDefault === "boolean" ? shop.customerEditDefault : null,
      themeId: null,
      bannerEnabled: null,
      bannerText: "",
      bannerLink: "",
      staff: [...input.staff].sort(byName).map(presentStaff),
    },
    canEdit: input.canEdit,
    branches: branchChoices(input.branches, input.staff),
    capabilities: SETTINGS_CAPABILITIES,
    themes: [],
    staffPages: STAFF_PAGES.map((page) => ({ ...page })),
  };
}

export function planSettingsSave(input: {
  command: SettingsCommand;
  shop: Record<string, unknown> | null;
  staff: StoredStaff[];
  branches: { id: string; name: string }[];
  identities: ReadonlyMap<string, { role: "owner" | "staff" }>;
  actorUid: string;
  access: { canEdit: boolean };
}) {
  if (!input.access.canEdit) throw new SettingsCommandError(403, "permission", "This account does not have active owner access.");
  const current = presentSettings({ shop: input.shop, staff: input.staff, branches: input.branches, canEdit: true });
  if (current.revision !== input.command.expectedRevision) throw new SettingsCommandError(409, "conflict", "Settings changed in another editor. Reload before saving again.");
  const draft = input.command.values;
  if (new Set(draft.staff.map((person) => person.uid)).size !== draft.staff.length) throw new SettingsCommandError(400, "validation", "Each staff account must have a unique account ID.");
  const shopWrites = shopChanges(input.shop, current.values, draft);
  const staffWrites = staffChanges(input, current.values.staff, draft.staff);
  return { shopWrites, staffWrites, reauth: staffWrites.length > 0 };
}

function shopChanges(shop: Record<string, unknown> | null, current: SettingsSnapshot["values"], draft: SettingsCommand["values"]) {
  const writes: Record<string, unknown> = {};
  const storedLinks = objectRecord(shop?.links);
  const nextLinks = { ...storedLinks };
  let linksChanged = false;
  for (const key of LINK_KEYS) {
    if (draft.links[key] === current.links[key]) continue;
    nextLinks[key] = draft.links[key];
    linksChanged = true;
  }
  if (linksChanged) writes.links = nextLinks;
  if (draft.holdMinutes !== current.holdMinutes) writes.holdMinutes = wholeMinutes(draft.holdMinutes, 1, "Hold length must be 1–1440 whole minutes.");
  if (draft.confirmBeforeSlotMinutes !== current.confirmBeforeSlotMinutes) writes.confirmBeforeSlotMinutes = wholeMinutes(draft.confirmBeforeSlotMinutes, 0, "Confirmation buffer must be 0–1440 whole minutes.");
  if (draft.requireFullPaymentDefault !== current.requireFullPaymentDefault) {
    if (draft.requireFullPaymentDefault !== true) throw new SettingsCommandError(400, "validation", "Full payment is required before preparation.");
    writes.requireFullPaymentDefault = true;
  }
  if (draft.customerEditDefault !== current.customerEditDefault) {
    if (draft.customerEditDefault !== false) throw new SettingsCommandError(400, "validation", "Customer editing stays off for new orders.");
    writes.customerEditDefault = false;
  }
  if (draft.themeId !== null || draft.bannerEnabled !== null || draft.bannerText !== "" || draft.bannerLink !== "") throw new SettingsCommandError(400, "validation", "Appearance settings are not available yet.");
  return writes;
}

function staffChanges(input: { staff: StoredStaff[]; branches: { id: string; name: string }[]; identities: ReadonlyMap<string, { role: "owner" | "staff" }>; actorUid: string }, current: SettingsSnapshot["values"]["staff"], draft: SettingsCommand["values"]["staff"]) {
  const storedIds = new Set(input.staff.map((person) => person.uid));
  for (const uid of storedIds) if (!draft.some((person) => person.uid === uid)) throw new SettingsCommandError(400, "validation", "Saved staff access cannot be removed here. Disable the account instead.");
  const allowedBranches = new Set(branchChoices(input.branches, input.staff).map((branch) => branch.id));
  const writes: { uid: string; displayName: string; active: boolean; branchIds: string[]; pages: Record<string, unknown> }[] = [];
  for (const person of draft) {
    if (person.uid === input.actorUid) throw new SettingsCommandError(400, "validation", "Owner access cannot be changed here.");
    const identity = input.identities.get(person.uid);
    if (!identity) throw new SettingsCommandError(400, "validation", "Choose an existing staff account.");
    if (identity.role !== "staff") throw new SettingsCommandError(400, "validation", "Owner access cannot be changed here.");
    const stored = input.staff.find((item) => item.uid === person.uid);
    if (!stored) throw new SettingsCommandError(400, "validation", "Choose an existing staff account.");
    const shown = current.find((item) => item.uid === person.uid);
    for (const page of person.pages) {
      if (OWNER_PAGES.has(page)) throw new SettingsCommandError(400, "validation", "Settings and Branches are owner-only.");
      if (!SUPPORTED_PAGES.has(page) && !shown?.pages.includes(page)) {
        const label = STAFF_PAGES.find((item) => item.id === page)?.name ?? "That page";
        throw new SettingsCommandError(400, "validation", `${label} is not available from this screen yet.`);
      }
    }
    const nextPages = effectivePages(stored.pages, person.pages);
    const same = shown
      && shown.name === person.name
      && shown.active === person.active
      && sameSet(shown.branchIds, person.branchIds)
      && sameSet(shown.pages, nextPages);
    if (same) continue;
    if (!person.name.trim()) throw new SettingsCommandError(400, "validation", "Each staff account needs an account ID and display name.");
    if (person.active && person.branchIds.length === 0) throw new SettingsCommandError(400, "validation", `${person.name}: assign at least one branch or disable access.`);
    for (const branchId of person.branchIds) {
      if (!allowedBranches.has(branchId) || !branchIdSchema.safeParse(branchId).success) throw new SettingsCommandError(400, "validation", "Choose a saved branch.");
    }
    const pages = { ...stored.pages, orders: person.pages.includes("orders") };
    writes.push({ uid: person.uid, displayName: person.name.trim(), active: person.active, branchIds: person.branchIds, pages });
  }
  return writes;
}

function effectivePages(stored: Record<string, unknown>, draft: string[]) {
  const presented = presentPages(stored);
  const next = new Set(presented.filter((page) => !SUPPORTED_PAGES.has(page)));
  if (draft.includes("orders")) next.add("orders");
  return [...next];
}

function presentStaff(person: StoredStaff) {
  return { uid: person.uid, name: person.displayName, active: person.active, branchIds: person.branchIds, pages: presentPages(person.pages) };
}

function presentPages(pages: Record<string, unknown>) {
  const selected: string[] = [];
  if (pages.dashboard === true) selected.push("dashboard");
  if (pages.orders !== false) selected.push("orders");
  if (pages.schedule === true) selected.push("schedule");
  if (pages.allocation === true) selected.push("allocation");
  if (pages.catalog === true) selected.push("catalog");
  return selected;
}

function branchChoices(branches: { id: string; name: string }[], staff: StoredStaff[]) {
  const choices = branches.map((branch) => ({ ...branch }));
  const known = new Set(choices.map((branch) => branch.id));
  for (const person of staff) for (const id of person.branchIds) if (!known.has(id)) { choices.push({ id, name: id }); known.add(id); }
  return choices;
}

function wholeMinutes(value: string, minimum: number, message: string) {
  if (!/^\d+$/.test(value) || Number(value) < minimum || Number(value) > 1440) throw new SettingsCommandError(400, "validation", message);
  return Number(value);
}

function objectRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function numberText(value: unknown) { return typeof value === "number" && Number.isInteger(value) ? String(value) : ""; }
function byName(a: StoredStaff, b: StoredStaff) { return a.displayName.localeCompare(b.displayName) || a.uid.localeCompare(b.uid); }
function sameSet(left: string[], right: string[]) {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}
