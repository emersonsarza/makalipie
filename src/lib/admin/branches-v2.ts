import { createHash } from "node:crypto";
import { z } from "zod";
import { CEBU_BRANCH_ID, branchIdSchema, branchSettingsSchema, type BranchRecord, type BranchSettings } from "../branches/schema";

/**
 * Branches v2 edits one saved branch on `settings/branches`.
 * A missing settings document is not filled with the Cebu and Manila defaults.
 * Offering toggles are not stored. Per-order pie limits are the only limit
 * the checkout enforces; day and box limits stay visible but cannot be
 * introduced. Delivery area names are a staff reference list: checkout
 * enforces `deliveryEnabled`, and an empty list is not worldwide delivery.
 * Creating a branch does not write schedule hours, allocation rows, staff
 * grants, or catalog assignments. Hiding a branch hides it from new
 * customer selection and does not rewrite existing orders.
 */
export const BRANCHES_CACHE_CONTROL = "private, no-store";
export const BRANCH_CAPABILITIES = { offerings: false, customerLimits: true, dailyLimits: false, boxLimits: false } as const;
const CEBU_LOCK = "Cebu stays available on the site.";

const draftSchema = z.object({
  id: branchIdSchema,
  name: z.string().trim().min(1, "Enter a branch name.").max(100),
  address: z.string().trim().max(300),
  hoursLabel: z.string().trim().max(150),
  mapUrl: z.string().trim().max(2000).refine((value) => value === "" || (URL.canParse(value) && new URL(value).protocol === "https:"), "Enter a complete HTTPS map link."),
  visible: z.boolean(),
  pickupEnabled: z.boolean(),
  deliveryEnabled: z.boolean(),
  areas: z.array(z.string().trim().min(1, "Enter an area name up to 80 characters.").max(80)).max(30).refine((areas) => new Set(areas.map((area) => area.toLowerCase())).size === areas.length, "Do not repeat an area."),
  showSingleItems: z.boolean().nullable(),
  showPackages: z.boolean().nullable(),
  limitEnabled: z.boolean(),
  limitQuantity: z.string().trim().max(12),
  limitUnit: z.enum(["pies", "boxes"]),
  limitPeriod: z.enum(["order", "day"]),
}).strict();

export const branchCommandSchema = z.object({
  branch: draftSchema,
  isNew: z.boolean(),
  makeDefault: z.boolean(),
  expectedRevision: z.string().regex(/^[a-f0-9]{16}$/),
  idempotencyKey: z.uuid(),
}).strict();
export type BranchCommand = z.infer<typeof branchCommandSchema>;
type Draft = z.infer<typeof draftSchema>;

export type BranchSnapshot = {
  revision: string;
  branches: Array<Draft & { visibilityLocked: boolean; lockReason?: string }>;
  defaultBranchId: string | null;
  canEdit: boolean;
  capabilities: typeof BRANCH_CAPABILITIES;
};

export class BranchQueryError extends Error {
  constructor(readonly status: 404, message: string) { super(message); this.name = "BranchQueryError"; }
}
export class BranchCommandError extends Error {
  constructor(readonly status: 400 | 403 | 409 | 503, readonly kind: "validation" | "permission" | "conflict" | "network", message: string) {
    super(message); this.name = "BranchCommandError";
  }
}

export function branchesAccess(admin: { role: string }) {
  const allowed = admin.role === "owner";
  return { allowed, canEdit: allowed };
}

export function branchesRevision(settings: BranchSettings) {
  const body = {
    version: settings.version,
    defaultBranch: settings.defaultBranch,
    branches: settings.branches.map((branch) => ({
      id: branch.id, name: branch.name, address: branch.address, hoursLabel: branch.hoursLabel, mapUrl: branch.mapUrl,
      visible: branch.visible, pickupEnabled: branch.pickupEnabled, deliveryEnabled: branch.deliveryEnabled,
      areas: branch.areas, customerLimit: branch.customerLimit ?? null,
    })),
    assignments: settings.assignments.map((assignment) => `${assignment.productId}:${assignment.variantId}:${assignment.mode}:${[...assignment.branchIds].sort().join(",")}`).sort(),
  };
  return createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 16);
}

export function presentBranches(settings: BranchSettings, canEdit: boolean): BranchSnapshot {
  return {
    revision: branchesRevision(settings),
    branches: settings.branches.map(presentBranch),
    defaultBranchId: settings.defaultBranch,
    canEdit,
    capabilities: BRANCH_CAPABILITIES,
  };
}

export function planBranchSave(input: { command: BranchCommand; stored: BranchSettings | null; access: { canEdit: boolean } }) {
  if (!input.access.canEdit) throw new BranchCommandError(403, "permission", "This account does not have active owner access.");
  if (!input.stored) throw new BranchQueryError(404, "Branch settings have not been saved yet.");
  const stored = input.stored;
  if (branchesRevision(stored) !== input.command.expectedRevision) throw new BranchCommandError(409, "conflict", "Branch settings changed in another editor. Reload before saving again.");
  const draft = input.command.branch;
  if (draft.showSingleItems !== null || draft.showPackages !== null) throw new BranchCommandError(400, "validation", "Offering controls are not stored yet.");
  if (!draft.pickupEnabled && !draft.deliveryEnabled) throw new BranchCommandError(400, "validation", "Enable pickup or delivery.");
  if (draft.id === CEBU_BRANCH_ID && !draft.visible) throw new BranchCommandError(400, "validation", CEBU_LOCK);
  const existingIndex = stored.branches.findIndex((branch) => branch.id === draft.id);
  if (input.command.isNew && existingIndex >= 0) throw new BranchCommandError(400, "validation", "This branch ID is already in use.");
  if (!input.command.isNew && existingIndex < 0) throw new BranchCommandError(400, "validation", "Choose a saved branch.");
  if (input.command.isNew && stored.branches.length >= 24) throw new BranchCommandError(400, "validation", "You can save up to 24 branches.");
  const current = existingIndex >= 0 ? stored.branches[existingIndex] : undefined;
  const willBeDefault = input.command.makeDefault || stored.defaultBranch === draft.id;
  if (willBeDefault && !draft.visible) throw new BranchCommandError(400, "validation", "The starting branch must be shown on the site.");
  const record: BranchRecord = {
    id: draft.id,
    name: draft.name,
    address: draft.address,
    visible: draft.visible,
    deliveryEnabled: draft.deliveryEnabled,
    pickupEnabled: draft.pickupEnabled,
    mapUrl: draft.mapUrl,
    hoursLabel: draft.hoursLabel,
    customerLimit: nextLimit(draft, current?.customerLimit ?? null),
    areas: draft.areas,
  };
  const branches = stored.branches.slice();
  if (existingIndex >= 0) branches[existingIndex] = record;
  else branches.push(record);
  return branchSettingsSchema.parse({
    version: stored.version,
    defaultBranch: input.command.makeDefault ? draft.id : stored.defaultBranch,
    branches,
    assignments: stored.assignments,
  });
}

function presentBranch(branch: BranchRecord) {
  const locked = branch.id === CEBU_BRANCH_ID;
  return {
    id: branch.id,
    name: branch.name,
    address: branch.address,
    hoursLabel: branch.hoursLabel,
    mapUrl: branch.mapUrl,
    visible: branch.visible,
    pickupEnabled: branch.pickupEnabled,
    deliveryEnabled: branch.deliveryEnabled,
    areas: branch.areas,
    showSingleItems: null,
    showPackages: null,
    ...presentLimit(branch.customerLimit),
    visibilityLocked: locked,
    ...(locked ? { lockReason: CEBU_LOCK } : {}),
  };
}

function presentLimit(limit: BranchRecord["customerLimit"]) {
  if (!limit) return { limitEnabled: false, limitQuantity: "", limitUnit: "pies" as const, limitPeriod: "order" as const };
  return { limitEnabled: true, limitQuantity: limit.quantity == null ? "" : String(limit.quantity), limitUnit: limit.unit, limitPeriod: limit.per };
}

function nextLimit(draft: Draft, stored: BranchRecord["customerLimit"]) {
  const shown = presentLimit(stored);
  const unchanged = shown.limitEnabled === draft.limitEnabled && shown.limitQuantity === draft.limitQuantity && shown.limitUnit === draft.limitUnit && shown.limitPeriod === draft.limitPeriod;
  if (unchanged) return stored ?? null;
  if (!draft.limitEnabled) return null;
  if (!/^\d+$/.test(draft.limitQuantity) || !Number.isSafeInteger(Number(draft.limitQuantity)) || Number(draft.limitQuantity) < 1) {
    throw new BranchCommandError(400, "validation", "Enter a positive whole-number limit.");
  }
  if (draft.limitUnit === "boxes") throw new BranchCommandError(400, "validation", "Box limits are not available yet.");
  if (draft.limitPeriod === "day") throw new BranchCommandError(400, "validation", "Daily limits are not available yet.");
  return { quantity: Number(draft.limitQuantity), unit: "pies" as const, per: "order" as const };
}
