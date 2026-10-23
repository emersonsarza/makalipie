import { createHash } from "node:crypto";
import { z } from "zod";
import { CEBU_BRANCH_ID } from "../branches/schema";
import { pesosToCentavos } from "../catalog/schema";

/**
 * Packages v2 stores drafts on `settings/packages`.
 * One package is one fixed box of four 4-inch sweet pies. The default
 * price is the component sum and is not frozen here. An override is
 * stored separately. A blank package cap is no package-specific cap.
 * Customer checkout stays off until a package line is reserved with
 * the rest of the order. This save does not rewrite existing orders.
 */
export const PACKAGES_CACHE_CONTROL = "private, no-store";
export const PACKAGE_POLICY_VERSION = "q10-confirmed-checkout-off";
const PUBLICATION_REASON = "Package rules are confirmed. Customer ordering stays off until a package is reserved with the rest of the order.";
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PACKAGE_POLICY = {
  publicationReady: false,
  fixedPrice: true,
  preparationOverride: false,
  reason: PUBLICATION_REASON,
  summary: [
    "One package is four 4-inch sweet pies. Savory pies and large pies are not part of that box.",
    "The default price is each component price times its quantity. An override is stored separately and can be lower or higher.",
    "A blank package limit is no package-specific cap. Stock and the branch pie limit still apply. There are no flavor swaps.",
    "Every component must be available that day with no advance preparation. Customer checkout is not enabled yet.",
  ],
} as const;

const contentSchema = z.object({
  variantKey: z.string().trim().max(161),
  quantity: z.string().trim().max(12),
}).strict();

const draftSchema = z.object({
  id: z.string().trim().max(40),
  name: z.string().trim().max(100),
  description: z.string().trim().max(1000),
  active: z.boolean(),
  branchIds: z.array(z.string().trim().max(40)).max(24),
  contents: z.array(contentSchema).max(100),
  price: z.string().trim().max(40),
  preparationDays: z.string().trim().max(10),
  packingNotes: z.string().trim().max(1000),
  priceMode: z.enum(["calculated", "override"]).optional().default("calculated"),
  maxPackagesPerOrder: z.string().trim().max(8).optional().default(""),
}).strict();

export const packageCommandSchema = z.object({
  package: draftSchema,
  isNew: z.boolean(),
  expectedRevision: z.string().regex(/^[a-f0-9]{16}$/),
  idempotencyKey: z.uuid(),
}).strict();
export type PackageCommand = z.infer<typeof packageCommandSchema>;

export type PackageContent = { productId: string; variantId: string; quantity: number };
export type PackageRecord = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  branchIds: string[];
  contents: PackageContent[];
  packingNotes: string;
  priceMode: "calculated" | "override";
  priceCentavos: number | null;
  maxPackagesPerOrder: number | null;
};
export type PackageSettings = { version: number; packages: PackageRecord[] };

export type PackageVariantView = {
  key: string;
  productId: string;
  variantId: string;
  name: string;
  size: string;
  active: boolean;
  branchIds: string[];
  category: "sweet" | "savory";
  priceCentavos: number | null;
  minLeadDays: number;
};

export type PackageDependencies = {
  variants: PackageVariantView[];
  branches: { id: string; name: string }[];
  branchVersion: number;
};

export type PackageSnapshot = {
  revision: string;
  packages: Array<{
    id: string;
    name: string;
    description: string;
    active: boolean;
    branchIds: string[];
    contents: { variantKey: string; quantity: string }[];
    price: string;
    preparationDays: "";
    packingNotes: string;
    priceMode: "calculated" | "override";
    maxPackagesPerOrder: string;
  }>;
  variants: PackageVariantView[];
  branches: { id: string; name: string }[];
  canEdit: boolean;
  policy: typeof PACKAGE_POLICY;
};

export class PackageCommandError extends Error {
  constructor(readonly status: 400 | 403 | 409 | 503, readonly kind: "validation" | "permission" | "conflict" | "network", message: string) {
    super(message); this.name = "PackageCommandError";
  }
}

const storedContentSchema = z.object({
  productId: z.string().regex(idPattern).max(80),
  variantId: z.string().regex(idPattern).max(80),
  quantity: z.number().int().min(1).max(100),
}).strict();
const storedPackageSchema = z.object({
  id: z.string().regex(idPattern).max(40),
  name: z.string().min(1).max(100),
  description: z.string().max(1000),
  active: z.boolean(),
  branchIds: z.array(z.string().max(40)).max(24),
  contents: z.array(storedContentSchema).max(100),
  packingNotes: z.string().max(1000),
  priceMode: z.enum(["calculated", "override"]).default("calculated"),
  priceCentavos: z.number().int().min(0).max(100_000_000).nullable().default(null),
  maxPackagesPerOrder: z.number().int().min(1).max(100).nullable().default(null),
}).strict();
export const packageSettingsSchema = z.object({
  version: z.number().int().nonnegative(),
  packages: z.array(storedPackageSchema).max(100),
}).strict().superRefine((settings, ctx) => {
  const ids = settings.packages.map((item) => item.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Each package needs its own id.", path: ["packages"] });
});

export function defaultPackageSettings(): PackageSettings {
  return { version: 0, packages: [] };
}

export function packagesAccess(admin: { role: string }) {
  const allowed = admin.role === "owner";
  return { allowed, canEdit: allowed };
}

export function variantBranchIds(productId: string, variantId: string, assignments: { productId: string; variantId: string; branchIds: string[] }[], known: ReadonlySet<string>) {
  const assignment = assignments.find((item) => item.productId === productId && item.variantId === variantId);
  const ids = assignment ? assignment.branchIds : known.has(CEBU_BRANCH_ID) ? [CEBU_BRANCH_ID] : [];
  return [...new Set(ids.filter((id) => known.has(id)))].sort();
}

export function packagesRevision(settings: PackageSettings, deps: PackageDependencies, canEdit: boolean) {
  const body = {
    version: settings.version,
    packages: settings.packages,
    variants: deps.variants.map((variant) => ({
      key: variant.key, productId: variant.productId, variantId: variant.variantId, name: variant.name, size: variant.size,
      active: variant.active, branchIds: [...variant.branchIds].sort(), category: variant.category,
    })),
    branches: deps.branches.map((branch) => ({ id: branch.id, name: branch.name })),
    branchVersion: deps.branchVersion,
    policy: { publicationReady: PACKAGE_POLICY.publicationReady, fixedPrice: PACKAGE_POLICY.fixedPrice, preparationOverride: PACKAGE_POLICY.preparationOverride },
    canEdit,
  };
  return createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 16);
}

export function presentPackages(settings: PackageSettings, deps: PackageDependencies, canEdit: boolean): PackageSnapshot {
  return {
    revision: packagesRevision(settings, deps, canEdit),
    packages: settings.packages.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      active: item.active,
      branchIds: [...item.branchIds],
      contents: item.contents.map((line) => ({ variantKey: `${line.productId}:${line.variantId}`, quantity: String(line.quantity) })),
      price: item.priceMode === "override" && item.priceCentavos != null ? formatPackagePrice(item.priceCentavos) : "",
      preparationDays: "",
      packingNotes: item.packingNotes,
      priceMode: item.priceMode,
      maxPackagesPerOrder: item.maxPackagesPerOrder == null ? "" : String(item.maxPackagesPerOrder),
    })),
    variants: deps.variants,
    branches: deps.branches,
    canEdit,
    policy: PACKAGE_POLICY,
  };
}

export function planPackageSave(input: { command: PackageCommand; stored: PackageSettings; deps: PackageDependencies; access: { canEdit: boolean } }): PackageSettings {
  if (!input.access.canEdit) throw new PackageCommandError(403, "permission", "This account does not have active owner access.");
  if (packagesRevision(input.stored, input.deps, input.access.canEdit) !== input.command.expectedRevision) {
    throw new PackageCommandError(409, "conflict", "Packages or their dependencies changed in another editor. Reload before saving again.");
  }
  const draft = input.command.package;
  if (draft.preparationDays !== "") throw new PackageCommandError(400, "validation", "A package cannot change a component’s preparation time.");
  if (draft.priceMode === "calculated" && draft.price !== "") throw new PackageCommandError(400, "validation", "A calculated price is the sum of the component prices. Clear the price or save an override.");
  const priceCentavos = draft.priceMode === "override" && draft.price !== "" ? pesosToCentavos(draft.price) : null;
  if (draft.priceMode === "override" && draft.price !== "" && !Number.isSafeInteger(priceCentavos)) throw new PackageCommandError(400, "validation", "Enter a valid peso price with at most two decimal places.");
  let maxPackagesPerOrder: number | null = null;
  if (draft.maxPackagesPerOrder !== "") {
    const parsedLimit = Number(draft.maxPackagesPerOrder);
    if (!/^[1-9]\d*$/.test(draft.maxPackagesPerOrder) || !Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new PackageCommandError(400, "validation", "Enter a package limit from 1 to 100, or leave it blank.");
    }
    maxPackagesPerOrder = parsedLimit;
  }
  if (!idPattern.test(draft.id) || draft.id.length > 40) throw new PackageCommandError(400, "validation", "Use up to 40 lowercase letters, numbers, and hyphens.");
  if (!draft.name) throw new PackageCommandError(400, "validation", "Enter a package name.");
  const index = input.stored.packages.findIndex((item) => item.id === draft.id);
  if (input.command.isNew && index >= 0) throw new PackageCommandError(400, "validation", "This package ID already exists.");
  if (!input.command.isNew && index < 0) throw new PackageCommandError(400, "validation", "Choose a saved package.");
  if (input.command.isNew && input.stored.packages.length >= 100) throw new PackageCommandError(400, "validation", "You can save up to 100 packages.");
  const existing = index >= 0 ? input.stored.packages[index] : undefined;
  const known = new Set(input.deps.branches.map((branch) => branch.id));
  if (new Set(draft.branchIds).size !== draft.branchIds.length) throw new PackageCommandError(400, "validation", "Do not repeat a branch.");
  for (const id of draft.branchIds) {
    if (!known.has(id) && !existing?.branchIds.includes(id)) throw new PackageCommandError(400, "validation", "Choose a saved branch.");
  }
  const preserved = (existing?.branchIds ?? []).filter((id) => !known.has(id) && !draft.branchIds.includes(id));
  const branchIds = [...draft.branchIds.filter((id) => known.has(id) || existing?.branchIds.includes(id)), ...preserved];
  const contents = draft.contents.map(parseContent);
  const keys = contents.map((line) => `${line.productId}:${line.variantId}`);
  if (new Set(keys).size !== keys.length) throw new PackageCommandError(400, "validation", "Each size should appear only once.");
  if (draft.active) {
    if (!PACKAGE_POLICY.publicationReady) throw new PackageCommandError(400, "validation", PUBLICATION_REASON);
    if (!branchIds.length) throw new PackageCommandError(400, "validation", "Assign a branch before publishing.");
    if (!contents.length) throw new PackageCommandError(400, "validation", "Add package contents before publishing.");
    if (contents.some((line) => !eligible(line, branchIds, input.deps.variants))) throw new PackageCommandError(400, "validation", "Some contents are missing, inactive, or unavailable at an assigned branch.");
  }
  const record: PackageRecord = {
    id: draft.id,
    name: draft.name,
    description: draft.description,
    active: draft.active,
    branchIds,
    contents,
    packingNotes: draft.packingNotes,
    priceMode: draft.priceMode,
    priceCentavos,
    maxPackagesPerOrder,
  };
  const packages = input.stored.packages.map((item) => ({ ...item, branchIds: [...item.branchIds], contents: item.contents.map((line) => ({ ...line })) }));
  if (index >= 0) packages[index] = record;
  else packages.push(record);
  return { version: input.stored.version, packages };
}

function formatPackagePrice(centavos: number) {
  const pesos = Math.floor(centavos / 100);
  const cents = centavos % 100;
  return cents ? `${pesos}.${String(cents).padStart(2, "0")}` : String(pesos);
}

function parseContent(line: { variantKey: string; quantity: string }): PackageContent {
  const split = line.variantKey.indexOf(":");
  const productId = split > 0 ? line.variantKey.slice(0, split) : "";
  const variantId = split > 0 ? line.variantKey.slice(split + 1) : "";
  if (!idPattern.test(productId) || !idPattern.test(variantId)) throw new PackageCommandError(400, "validation", "Choose a catalog size.");
  if (!/^\d+$/.test(line.quantity)) throw new PackageCommandError(400, "validation", "Each selected size needs a positive whole-number quantity.");
  const quantity = Number(line.quantity);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) throw new PackageCommandError(400, "validation", "Enter a whole number of pies from 1 to 100.");
  return { productId, variantId, quantity };
}

function eligible(line: PackageContent, branchIds: string[], variants: PackageVariantView[]) {
  const variant = variants.find((item) => item.productId === line.productId && item.variantId === line.variantId);
  return !!variant?.active && branchIds.every((id) => variant.branchIds.includes(id));
}
