import { z } from "zod";
import type { Catalog } from "../catalog/schema";

export type CatalogMode = "regular" | "preorder";
export const MIXED_CATALOG_MESSAGE = "Regular pies and pre-order pies need separate requests.";

export const CEBU_BRANCH_ID = "cebu";
export const branchIdSchema = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens.").max(40);
export type BranchId = z.infer<typeof branchIdSchema>;

export const branchRecordSchema = z.object({
  id: branchIdSchema,
  name: z.string().trim().min(1).max(100),
  address: z.string().trim().max(300),
  visible: z.boolean(),
  deliveryEnabled: z.boolean(),
  areas: z.array(z.string().trim().min(1).max(80)).max(30).refine((areas) => new Set(areas.map((area) => area.toLowerCase())).size === areas.length, "Do not repeat an area."),
}).strict();
export type BranchRecord = z.infer<typeof branchRecordSchema>;

const assignmentSchema = z.object({
  productId: z.string().min(1).max(80),
  variantId: z.string().min(1).max(80),
  branchIds: z.array(branchIdSchema).max(24).refine((ids) => new Set(ids).size === ids.length, "Do not repeat a branch."),
  mode: z.enum(["regular", "preorder"]),
}).strict();

export const branchSettingsSchema = z.object({
  version: z.number().int().nonnegative(),
  defaultBranch: branchIdSchema,
  branches: z.array(branchRecordSchema).min(1).max(24),
  assignments: z.array(assignmentSchema).max(3000),
}).strict().superRefine((settings, ctx) => {
  const ids = settings.branches.map((branch) => branch.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Each branch needs its own id.", path: ["branches"] });
  if (!ids.includes(CEBU_BRANCH_ID)) ctx.addIssue({ code: "custom", message: "Cebu is a permanent branch.", path: ["branches"] });
  const cebu = settings.branches.find((branch) => branch.id === CEBU_BRANCH_ID);
  if (cebu && !cebu.visible) ctx.addIssue({ code: "custom", message: "Cebu stays available on the site.", path: ["branches"] });
  const visible = new Set(settings.branches.filter((branch) => branch.visible).map((branch) => branch.id));
  if (!visible.has(settings.defaultBranch)) ctx.addIssue({ code: "custom", message: "The starting branch must be shown on the site.", path: ["defaultBranch"] });
  const known = new Set(ids);
  settings.assignments.forEach((assignment, index) => {
    for (const id of assignment.branchIds) {
      if (!known.has(id)) ctx.addIssue({ code: "custom", message: "Choose a saved branch.", path: ["assignments", index, "branchIds"] });
    }
  });
  if (new Set(settings.assignments.map((assignment) => `${assignment.productId}:${assignment.variantId}`)).size !== settings.assignments.length) {
    ctx.addIssue({ code: "custom", message: "Each product size can appear only once.", path: ["assignments"] });
  }
});
export type BranchSettings = z.infer<typeof branchSettingsSchema>;

export function defaultBranchSettings(): BranchSettings {
  return {
    version: 0,
    defaultBranch: CEBU_BRANCH_ID,
    branches: [
      { id: CEBU_BRANCH_ID, name: "Makalipie Cebu Main", address: "", visible: true, deliveryEnabled: true, areas: [] },
      { id: "manila", name: "Makalipie Manila Main", address: "", visible: true, deliveryEnabled: true, areas: [] },
    ],
    assignments: [],
  };
}

export function branchById(settings: BranchSettings, id: string) {
  return settings.branches.find((branch) => branch.id === id) ?? settings.branches.find((branch) => branch.id === CEBU_BRANCH_ID)!;
}

export function visibleBranches(settings: BranchSettings) {
  return settings.branches.filter((branch) => branch.visible);
}

export function slugifyBranchName(name: string, existing: string[]) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "branch";
  const taken = new Set(existing);
  let id = base;
  let count = 2;
  while (taken.has(id)) {
    const suffix = `-${count++}`;
    id = `${base.slice(0, 40 - suffix.length)}${suffix}`;
  }
  return id;
}

/** Older saves stored `{ cebu, manila }` objects. New saves store a list. */
export function coerceBranchSettings(input: unknown) {
  if (!input || typeof input !== "object") return input;
  const value = { ...(input as Record<string, unknown>) };
  const branches = value.branches;
  if (!branches || typeof branches !== "object" || Array.isArray(branches)) return value;
  const record = branches as Record<string, { name?: string; address?: string }>;
  const list = Object.entries(record).map(([id, branch]) => ({
    id,
    name: typeof branch?.name === "string" && branch.name.trim() ? branch.name : id,
    address: typeof branch?.address === "string" ? branch.address : "",
    visible: true,
    deliveryEnabled: true,
    areas: [] as string[],
  }));
  if (!list.some((branch) => branch.id === CEBU_BRANCH_ID)) {
    list.unshift({ id: CEBU_BRANCH_ID, name: "Makalipie Cebu Main", address: "", visible: true, deliveryEnabled: true, areas: [] });
  }
  value.branches = list;
  return value;
}

export function parseBranchSettings(input: unknown): BranchSettings {
  const coerced = coerceBranchSettings(input);
  if (coerced && typeof coerced === "object" && Array.isArray((coerced as { branches?: unknown }).branches)) {
    const draft = coerced as { branches: BranchRecord[]; defaultBranch?: string };
    draft.branches = draft.branches.map((branch) => ({
      ...branch,
      visible: branch?.id === CEBU_BRANCH_ID ? true : Boolean(branch?.visible),
      deliveryEnabled: branch?.deliveryEnabled !== false,
      areas: Array.isArray(branch?.areas) ? branch.areas.map((area) => String(area).trim()).filter(Boolean) : [],
    }));
    const visible = new Set(draft.branches.filter((branch) => branch?.visible).map((branch) => branch.id));
    if (!draft.defaultBranch || !visible.has(draft.defaultBranch)) draft.defaultBranch = CEBU_BRANCH_ID;
  }
  return branchSettingsSchema.parse(coerced);
}

export function resolveBranch(value: unknown, settings: BranchSettings): BranchId {
  const parsed = branchIdSchema.safeParse(value);
  const visible = visibleBranches(settings);
  if (parsed.success && visible.some((branch) => branch.id === parsed.data)) return parsed.data;
  if (visible.some((branch) => branch.id === settings.defaultBranch)) return settings.defaultBranch;
  return CEBU_BRANCH_ID;
}

export function variantAssignment(settings: BranchSettings, productId: string, variantId: string, minLeadDays: number) {
  return settings.assignments.find((assignment) => assignment.productId === productId && assignment.variantId === variantId)
    ?? { productId, variantId, branchIds: [CEBU_BRANCH_ID] as BranchId[], mode: minLeadDays > 0 ? "preorder" as const : "regular" as const };
}

export function variantAvailable(settings: BranchSettings, branch: BranchId, productId: string, variantId: string, minLeadDays: number, mode: CatalogMode) {
  const assignment = variantAssignment(settings, productId, variantId, minLeadDays);
  return assignment.mode === mode && assignment.branchIds.includes(branch) && (mode === "preorder" || minLeadDays === 0);
}

export function regularVariantAvailable(settings: BranchSettings, branch: BranchId, productId: string, variantId: string, minLeadDays: number) {
  return variantAvailable(settings, branch, productId, variantId, minLeadDays, "regular");
}

export function branchCatalog(catalog: Catalog, settings: BranchSettings, branch: BranchId, mode: CatalogMode): Catalog {
  return {
    ...catalog,
    products: catalog.products.filter((product) => product.active).map((product) => ({
      ...product,
      variants: product.variants.filter((variant) => variant.active && variantAvailable(settings, branch, product.id, variant.id, variant.minLeadDays, mode)),
    })).filter((product) => product.variants.length > 0),
  };
}

export function regularBranchCatalog(catalog: Catalog, settings: BranchSettings, branch: BranchId): Catalog {
  return branchCatalog(catalog, settings, branch, "regular");
}

export function selectionCatalogMode(settings: BranchSettings, catalog: Catalog, lines: { productId: string; variantId: string }[]): CatalogMode | "mixed" {
  const modes = new Set<CatalogMode>();
  for (const line of lines) {
    const product = catalog.products.find((item) => item.id === line.productId);
    const variant = product?.variants.find((item) => item.id === line.variantId);
    if (!product || !variant) continue;
    modes.add(variantAssignment(settings, product.id, variant.id, variant.minLeadDays).mode);
  }
  if (modes.size > 1) return "mixed";
  return modes.has("preorder") ? "preorder" : "regular";
}

export function catalogForSelection(catalog: Catalog, settings: BranchSettings, branch: BranchId, lines: { productId: string; variantId: string }[], requested?: CatalogMode): { error: string } | { mode: CatalogMode; catalog: Catalog } {
  const mode = selectionCatalogMode(settings, catalog, lines);
  if (mode === "mixed" || (requested && requested !== mode)) return { error: MIXED_CATALOG_MESSAGE };
  return { mode, catalog: branchCatalog(catalog, settings, branch, mode) };
}

export function currentAssignments(catalog: Catalog, settings: BranchSettings) {
  return catalog.products.flatMap((product) => product.variants.map((variant) => variantAssignment(settings, product.id, variant.id, variant.minLeadDays)));
}
