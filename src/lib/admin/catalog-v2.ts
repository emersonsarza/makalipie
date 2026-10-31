import { createHash } from "node:crypto";
import { z } from "zod";
import type { AdminIdentity } from "./schemas";
import { branchIdSchema, CEBU_BRANCH_ID } from "../branches/schema";
import { addonFieldsSchema, dateSchema, productCatalogSchema, variantSchema, type AddonFields, type Variant } from "../catalog/schema";
import { pesosToCentavos } from "../catalog/schema";
import { type MenuSection } from "../catalog/sections";
import { displayCategorySchedules } from "../catalog/migrate";
import { variantOrderMode } from "../catalog/mode";
import { storedSizeLabel } from "../catalog/size";
import { productFieldsSchema, productIdSchema, productImageSchema, slugify } from "../products/schema";

/**
 * Shop-wide catalog read and save plan.
 *
 * Products, sizes, and add-ons stay in their current collections. Branch
 * availability stays on branch settings assignments, one row per size.
 * A size with no assignment still means Cebu, which is the existing default.
 * An explicit empty branch list means the size is offered nowhere.
 *
 * The screen's branch list is product-wide. A save updates only branches the
 * editor was shown (`managedBranchIds`). Other branches on each size stay.
 * Omitted branches are not deletions.
 *
 * Add-on descriptions are not stored. Product compatibility lists are left
 * untouched, so this does not restore or clear allowedAddonIds. Saved sizes
 * are deactivated instead of deleted. Nothing here reprices past orders.
 *
 * A new product keeps the description as its short blurb and starts as sweet.
 * Later saves keep the stored blurb, category, and public notes.
 */

export const CATALOG_CACHE_CONTROL = "private, no-store";

export class CatalogCommandError extends Error {
  constructor(
    public readonly status: 400 | 403 | 409 | 503,
    public readonly kind: "validation" | "permission" | "conflict" | "network",
    message: string,
  ) {
    super(message);
    this.name = "CatalogCommandError";
  }
}

const sizeSchema = z.object({
  key: z.string().max(80),
  name: z.string().max(80),
  active: z.boolean(),
  price: z.string().max(40),
  pricing: z.enum(["fixed", "quote_required"]),
  leadDays: z.string().max(10),
  weekdays: z.array(z.number()).nullable(),
  preorder: z.boolean().optional(),
  imageUrl: z.string().max(2000).optional(),
  imageAlt: z.string().max(200).optional(),
}).strict();

const entrySchema = z.object({
  id: z.string().max(80),
  version: z.number().int().nonnegative(),
  kind: z.enum(["product", "addon"]),
  name: z.string().max(200),
  description: z.string().max(4000),
  active: z.boolean(),
  sortOrder: z.string().max(10),
  imageUrl: z.string().max(2000),
  imageAlt: z.string().max(200),
  allergens: z.string().max(1000),
  weekdays: z.array(z.number()).max(7),
  blockedDates: z.array(z.string()).max(366),
  branchIds: z.array(z.string()).max(24),
  menuCategoryId: z.string().max(80).optional(),
  category: z.enum(["sweet", "savory"]).optional(),
  featured: z.boolean().optional(),
  sizes: z.array(sizeSchema).max(30),
  price: z.string().max(40),
  leadDays: z.string().max(10),
  scope: z.enum(["per_order", "per_item"]),
  messageEnabled: z.boolean(),
  messageRequired: z.boolean(),
  messageLabel: z.string().max(100),
  messageMax: z.string().max(10),
}).strict();

const entryCommandSchema = z.object({
  entry: entrySchema,
  expectedRevision: z.string().regex(/^[a-f0-9]{16}$/),
  idempotencyKey: z.string().uuid(),
  managedBranchIds: z.array(branchIdSchema).max(24),
}).strict();
const sectionInputSchema = z.object({
  id: z.string().max(80),
  name: z.string().max(80),
  note: z.string().max(200),
  sortOrder: z.number().int().min(0).max(9999),
  availableWeekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
}).strict();
const sectionsCommandSchema = z.object({
  sections: z.array(sectionInputSchema).max(24),
  expectedRevision: z.string().regex(/^[a-f0-9]{16}$/),
  idempotencyKey: z.string().uuid(),
}).strict();
export const catalogCommandSchema = z.union([entryCommandSchema, sectionsCommandSchema]);
export type CatalogCommand = z.infer<typeof catalogCommandSchema>;
export type CatalogEntry = z.infer<typeof entrySchema>;

export type CatalogSnapshot = { revision: string; entries: CatalogEntry[]; sections: MenuSection[]; canEdit: boolean };

export type StoredVariant = Variant;
export type StoredProduct = {
  id: string;
  version: number;
  name: string;
  blurb: string;
  description: string;
  category: "sweet" | "savory";
  image: { url: string; alt: string };
  allergens: string[];
  publicNotes: string;
  active: boolean;
  sortOrder: number;
  legacyPriceCentavos: number | null;
  menuCategoryId: string | null;
  availableWeekdays: number[];
  unavailableDates: string[];
  allowedAddonIds: string[];
  variants: StoredVariant[];
};
export type StoredAddon = AddonFields & { id: string; version: number };
export type StoredAssignment = { productId: string; variantId: string; branchIds: string[]; mode: "regular" | "preorder" };

export function catalogAccess(admin: Pick<AdminIdentity, "role" | "pages">) {
  const allowed = admin.role === "owner" || admin.pages?.catalog === true;
  const canEdit = admin.role === "owner" || (allowed && admin.pages?.catalogActions?.edit === true);
  return { allowed, canEdit };
}

export function catalogRevision(input: {
  products: { id: string; version: number }[];
  addons: { id: string; version: number }[];
  branchVersion: number;
  assignments: StoredAssignment[];
  sections?: MenuSection[];
}) {
  const body = JSON.stringify({
    products: [...input.products].sort((a, b) => a.id.localeCompare(b.id)),
    addons: [...input.addons].sort((a, b) => a.id.localeCompare(b.id)),
    branchVersion: input.branchVersion,
    sections: [...(input.sections ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
    assignments: [...input.assignments]
      .map((assignment) => ({ ...assignment, branchIds: [...assignment.branchIds].sort() }))
      .sort((a, b) => `${a.productId}:${a.variantId}`.localeCompare(`${b.productId}:${b.variantId}`)),
  });
  return createHash("sha256").update(body).digest("hex").slice(0, 16);
}

export function presentCatalog(input: {
  products: StoredProduct[];
  addons: StoredAddon[];
  assignments: StoredAssignment[];
  knownBranchIds: readonly string[];
  branchVersion: number;
  sections?: MenuSection[];
  canEdit: boolean;
  featuredProductIds?: readonly string[];
}): CatalogSnapshot {
  const known = new Set(input.knownBranchIds);
  const sections = displayCategorySchedules([...(input.sections ?? [])], input.products).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const entries = [
    ...input.products.map((product) => productEntry(product, input.assignments, known, input.featuredProductIds)),
    ...input.addons.map(addonEntry),
  ].sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const snapshot = {
    revision: catalogRevision({ products: input.products, addons: input.addons, branchVersion: input.branchVersion, assignments: input.assignments, sections }),
    entries,
    sections,
    canEdit: input.canEdit,
  };
  return snapshot;
}

export type ProductWrite = {
  id: string;
  create: boolean;
  data: Record<string, unknown>;
  variants: { id: string; data: Record<string, unknown> }[];
};
export type AddonWrite = { id: string; create: boolean; data: Record<string, unknown> };
export type AssignmentWrite = StoredAssignment;

export function planCatalogSave(input: {
  command: CatalogCommand;
  products: StoredProduct[];
  addons: StoredAddon[];
  assignments: StoredAssignment[];
  knownBranchIds: readonly string[];
  branchVersion: number;
  canEdit: boolean;
  sections?: MenuSection[];
  manageableBranchIds: readonly string[];
}): { ok: true; product?: ProductWrite; addon?: AddonWrite; assignments: AssignmentWrite[]; sections?: MenuSection[]; categoryClears?: { id: string; version: number }[]; featured?: { productId: string; featured: boolean } } | { ok: false; error: CatalogCommandError } {
  if (!input.canEdit) return { ok: false, error: new CatalogCommandError(403, "permission", "You have view-only access to Catalog.") };
  if ("sections" in input.command) return planSections(input);
  const managed = [...new Set(input.command.managedBranchIds)];
  if (managed.length !== input.command.managedBranchIds.length) return fail("Each branch can be listed once.");
  const known = new Set(input.knownBranchIds);
  if (managed.some((id) => !known.has(id))) return fail("Choose a saved branch.");
  const allowed = new Set(input.manageableBranchIds);
  if (managed.some((id) => !allowed.has(id))) return { ok: false, error: new CatalogCommandError(403, "permission", "You cannot change availability for that branch.") };
  const revision = catalogRevision(input);
  if (revision !== input.command.expectedRevision) return { ok: false, error: new CatalogCommandError(409, "conflict", "The catalog changed. Refresh before saving.") };
  return input.command.entry.kind === "product" ? planProduct(input, new Set(managed), known) : planAddon(input);
}

function planProduct(input: Parameters<typeof planCatalogSave>[0], managed: Set<string>, known: Set<string>) {
  if (!("entry" in input.command)) return fail("Choose a product.");
  const entry = input.command.entry;
  if (entry.branchIds.some((id) => !managed.has(id))) return fail("Choose a branch from the branches you can edit.");
  if (!entry.sizes.length) return fail("Add at least one size.");
  const existing = entry.id ? input.products.find((product) => product.id === entry.id) : undefined;
  if (entry.version === 0 && existing) return { ok: false as const, error: new CatalogCommandError(409, "conflict", "That product link is already in use. Refresh before saving.") };
  if (entry.version > 0 && (!existing || existing.version !== entry.version)) return { ok: false as const, error: new CatalogCommandError(409, "conflict", "This product changed. Refresh before saving.") };
  const id = existing?.id ?? createId(entry.id, entry.name, new Set(input.products.map((product) => product.id)));
  if (!id) return fail("Enter a product name.");
  const image = productImageSchema.safeParse({ url: entry.imageUrl.trim(), alt: entry.imageAlt.trim() });
  if (!image.success) return fail(image.error.issues[0]?.message ?? "Choose a product photo and describe it.");
  const fallbackDays = dayList(entry.weekdays);
  if (!fallbackDays) return fail("Choose valid selling days.");
  const blocked = dateList(entry.blockedDates);
  if (!blocked) return fail("Choose valid blocked dates without repeats.");
  const allergens = allergenList(entry.allergens);
  if (!allergens) return fail("Check the allergen list.");
  const sortOrder = whole(entry.sortOrder, 9999);
  if (sortOrder === null) return fail("Display order must be a whole number from 0 to 9999.");
  const used = new Set<string>();
  const variants: Variant[] = [];
  for (const [index, size] of entry.sizes.entries()) {
    const label = storedSizeLabel(size.name);
    const sizeId = existingId(size.key, existing) ?? createId(size.key, label ?? size.name, used);
    if (!sizeId || !label) return fail(`Size ${index + 1}: enter the size in inches.`);
    used.add(sizeId);
    const leadDays = whole(size.leadDays, 365);
    if (leadDays === null) return fail(`Size ${index + 1}: preparation must be 0–365 whole days.`);
    const preorder = size.preorder ?? leadDays > 0;
    const days = preorder || size.weekdays === null ? null : dayList(size.weekdays);
    if (!preorder && size.weekdays !== null && !days) return fail(`Size ${index + 1}: choose valid selling days.`);
    if (!preorder && size.active && days && days.length === 0) return fail(`Size ${index + 1}: choose selling days or make the size inactive.`);
    const priceCentavos = size.pricing === "quote_required" ? null : pesosToCentavos(size.price);
    if (size.pricing === "fixed" && !Number.isSafeInteger(priceCentavos)) return fail(`Size ${index + 1}: enter a valid peso price, including zero if intentional.`);
    const imageUrl = size.imageUrl?.trim() ?? "";
    const imageAlt = size.imageAlt?.trim() ?? "";
    const sizeImage = imageUrl || imageAlt ? productImageSchema.safeParse({ url: imageUrl, alt: imageAlt }) : null;
    if (sizeImage && !sizeImage.success) return fail(`Size ${index + 1}: ${sizeImage.error.issues[0]?.message ?? "Choose a size photo and describe it."}`);
    variants.push({
      id: sizeId,
      label,
      pricingMode: size.pricing,
      priceCentavos,
      minLeadDays: preorder ? leadDays : 0,
      orderMode: preorder ? "preorder" : "regular",
      ...(days ? { availableWeekdays: days } : {}),
      ...(sizeImage?.success ? { image: sizeImage.data } : {}),
      active: size.active,
      sortOrder: index,
    });
  }
  if (entry.active && !variants.some((variant) => variant.active)) return fail("An active product needs an active size.");
  const kept = (existing?.variants ?? []).filter((variant) => !used.has(variant.id)).map((variant, index) => ({ ...variant, active: false, sortOrder: variants.length + index }));
  const nextVariants = [...variants, ...kept];
  if (nextVariants.length > 30) return fail("A product can keep up to 30 sizes.");
  for (const variant of nextVariants) {
    const parsed = variantSchema.safeParse(variant);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the sizes.");
  }
  const menuCategoryId = (entry.menuCategoryId ?? "").trim();
  if (menuCategoryId && !(input.sections ?? []).some((section) => section.id === menuCategoryId)) return fail("Choose a category that still exists.");
  if (menuCategoryId && !productIdSchema.safeParse(menuCategoryId).success) return fail("Choose a category that still exists.");
  const sectionDays = (input.sections ?? []).find((section) => section.id === menuCategoryId)?.availableWeekdays;
  const categoryDays = sectionDays && sectionDays.length && sectionDays.length < 7 ? [...sectionDays].sort((a, b) => a - b) : null;
  const fields = {
    slug: id,
    name: entry.name.trim(),
    blurb: existing?.blurb || entry.description.trim().slice(0, 180),
    description: entry.description.trim(),
    category: entry.category ?? existing?.category ?? "sweet" as const,
    image: image.data,
    allergens: allergens,
    publicNotes: existing?.publicNotes ?? "",
    active: entry.active,
    sortOrder,
  };
  const parsedFields = productFieldsSchema.safeParse(fields);
  if (!parsedFields.success) return fail(parsedFields.error.issues[0]?.message ?? "Check the product.");
  const catalog = productCatalogSchema.safeParse({
    version: (existing?.version ?? 0) + 1,
    variants: nextVariants,
    availableWeekdays: categoryDays ?? fallbackDays,
    unavailableDates: blocked,
    allowedAddonIds: existing?.allowedAddonIds ?? [],
  });
  if (!catalog.success) return fail(catalog.error.issues[0]?.message ?? "Check the product.");
  const assignments = nextVariants.flatMap((variant) => {
    const current = input.assignments.find((assignment) => assignment.productId === id && assignment.variantId === variant.id);
    return assignmentWrite(id, variant, current, managed, known, new Set(entry.branchIds));
  });
  const { variants: rows, version: _version, ...catalogFields } = catalog.data;
  void _version;
  return {
    ok: true as const,
    product: {
      id,
      create: !existing,
      data: { ...parsedFields.data, ...catalogFields, menuCategoryId: menuCategoryId || null, legacyPriceCentavos: existing?.legacyPriceCentavos ?? null, version: catalog.data.version },
      variants: rows.map(({ id: variantId, ...data }) => ({ id: variantId, data })),
    },
    assignments,
    ...(typeof entry.featured === "boolean" ? { featured: { productId: id, featured: entry.featured } } : {}),
  };
}

function planAddon(input: Parameters<typeof planCatalogSave>[0]) {
  if (!("entry" in input.command)) return fail("Choose an add-on.");
  const entry = input.command.entry;
  if (entry.description.trim()) return fail("Add-on descriptions are not stored.");
  if (entry.sizes.length) return fail("Add-ons do not have sizes.");
  const existing = entry.id ? input.addons.find((addon) => addon.id === entry.id) : undefined;
  if (entry.version === 0 && existing) return { ok: false as const, error: new CatalogCommandError(409, "conflict", "That add-on link is already in use. Refresh before saving.") };
  if (entry.version > 0 && (!existing || existing.version !== entry.version)) return { ok: false as const, error: new CatalogCommandError(409, "conflict", "This add-on changed. Refresh before saving.") };
  const id = existing?.id ?? createId(entry.id, entry.name, new Set(input.addons.map((addon) => addon.id)));
  if (!id) return fail("Enter an add-on name.");
  const image = productImageSchema.safeParse({ url: entry.imageUrl.trim(), alt: entry.imageAlt.trim() });
  if (!image.success) return fail(image.error.issues[0]?.message ?? "Choose an add-on photo and describe it.");
  const priceCentavos = pesosToCentavos(entry.price);
  if (!Number.isSafeInteger(priceCentavos)) return fail("Enter a valid add-on price.");
  const leadDays = whole(entry.leadDays, 365);
  if (leadDays === null) return fail("Preparation must be 0–365 whole days.");
  const sortOrder = whole(entry.sortOrder, 9999);
  if (sortOrder === null) return fail("Display order must be a whole number from 0 to 9999.");
  const allergens = allergenList(entry.allergens);
  if (!allergens) return fail("Check the allergen list.");
  const maxLength = entry.messageEnabled ? whole(entry.messageMax, 500) : 100;
  if (entry.messageEnabled && (maxLength === null || maxLength < 1 || !entry.messageLabel.trim())) return fail("Give the message field a label and a limit from 1 to 500 characters.");
  const fields = addonFieldsSchema.safeParse({
    name: entry.name.trim(),
    priceCentavos,
    image: image.data,
    minLeadDays: leadDays,
    allergens,
    active: entry.active,
    sortOrder,
    scope: entry.scope,
    customization: { enabled: entry.messageEnabled, label: entry.messageEnabled ? entry.messageLabel.trim() : "", required: entry.messageEnabled && entry.messageRequired, maxLength: maxLength ?? 100 },
  });
  if (!fields.success) return fail(fields.error.issues[0]?.message ?? "Check the add-on.");
  return { ok: true as const, addon: { id, create: !existing, data: { ...fields.data, version: (existing?.version ?? 0) + 1 } }, assignments: [] as AssignmentWrite[] };
}

function assignmentWrite(productId: string, variant: Variant, current: StoredAssignment | undefined, managed: Set<string>, known: Set<string>, desired: Set<string>): AssignmentWrite[] {
  const base = current ? current.branchIds : [CEBU_BRANCH_ID];
  const next = [...new Set([...base.filter((id) => known.has(id) && !managed.has(id)), ...desired])].sort();
  const mode: StoredAssignment["mode"] = variant.orderMode ?? (variant.minLeadDays > 0 ? "preorder" : current?.mode ?? "regular");
  const sameBranches = next.join("\0") === [...base].filter((id) => known.has(id)).sort().join("\0");
  const sameMode = (current?.mode ?? mode) === mode;
  if (sameBranches && sameMode && !current) return [];
  if (sameBranches && sameMode && current) return [];
  return [{ productId, variantId: variant.id, branchIds: next, mode }];
}

function productEntry(product: StoredProduct, assignments: StoredAssignment[], known: Set<string>, featuredProductIds?: readonly string[]): CatalogEntry {
  const branches = new Set<string>();
  for (const variant of product.variants) {
    const assignment = assignments.find((item) => item.productId === product.id && item.variantId === variant.id);
    for (const id of assignment ? assignment.branchIds : [CEBU_BRANCH_ID]) if (known.has(id)) branches.add(id);
  }
  return {
    id: product.id,
    version: product.version,
    kind: "product",
    name: product.name,
    description: product.description,
    active: product.active,
    sortOrder: String(product.sortOrder),
    imageUrl: product.image.url,
    imageAlt: product.image.alt,
    allergens: product.allergens.join(", "),
    weekdays: [...product.availableWeekdays].sort((a, b) => a - b),
    blockedDates: [...product.unavailableDates].sort(),
    branchIds: [...branches].sort(),
    menuCategoryId: product.menuCategoryId ?? "",
    category: product.category,
    ...(featuredProductIds ? { featured: featuredProductIds.includes(product.id) } : {}),
    sizes: [...product.variants].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)).map((variant) => ({
      key: variant.id,
      name: variant.label,
      active: variant.active,
      price: variant.pricingMode === "quote_required" || variant.priceCentavos === null ? "" : formatPesos(variant.priceCentavos),
      pricing: variant.pricingMode,
      leadDays: String(variant.minLeadDays),
      preorder: variantOrderMode(variant) === "preorder",
      weekdays: variant.availableWeekdays ? [...variant.availableWeekdays].sort((a, b) => a - b) : null,
      imageUrl: variant.image?.url ?? "",
      imageAlt: variant.image?.alt ?? "",
    })),
    price: "",
    leadDays: "0",
    scope: "per_order",
    messageEnabled: false,
    messageRequired: false,
    messageLabel: "",
    messageMax: "100",
  };
}

function addonEntry(addon: StoredAddon): CatalogEntry {
  return {
    id: addon.id,
    version: addon.version,
    kind: "addon",
    name: addon.name,
    description: "",
    active: addon.active,
    sortOrder: String(addon.sortOrder),
    imageUrl: addon.image.url,
    imageAlt: addon.image.alt,
    allergens: addon.allergens.join(", "),
    weekdays: [],
    blockedDates: [],
    branchIds: [],
    sizes: [],
    price: formatPesos(addon.priceCentavos),
    leadDays: String(addon.minLeadDays),
    scope: addon.scope,
    messageEnabled: addon.customization.enabled,
    messageRequired: addon.customization.required,
    messageLabel: addon.customization.label,
    messageMax: String(addon.customization.maxLength),
  };
}

export function formatPesos(cents: number) {
  const whole = Math.trunc(cents / 100);
  const fraction = Math.abs(cents) % 100;
  return fraction ? `${whole}.${String(fraction).padStart(2, "0")}` : String(whole);
}

function planSections(input: Parameters<typeof planCatalogSave>[0]) {
  if (!("sections" in input.command)) return fail("Choose menu sections.");
  const revision = catalogRevision({ ...input, sections: input.sections ?? [] });
  if (revision !== input.command.expectedRevision) return { ok: false as const, error: new CatalogCommandError(409, "conflict", "The catalog changed. Refresh before saving.") };
  const keptIds = input.command.sections.map((section) => section.id.trim()).filter((id) => (input.sections ?? []).some((section) => section.id === id));
  const used = new Set(keptIds);
  const names = new Set<string>();
  const sections: MenuSection[] = [];
  for (const [index, section] of input.command.sections.entries()) {
    const name = section.name.trim();
    if (!name || name.length > 60) return fail(`Section ${index + 1}: enter a name.`);
    const key = name.toLowerCase();
    if (names.has(key)) return fail("Each menu section needs a different name.");
    names.add(key);
    const note = section.note.trim();
    if (note.length > 160) return fail(`Section ${index + 1}: keep the note to 160 characters.`);
    const existing = (input.sections ?? []).find((item) => item.id === section.id.trim());
    const id = existing?.id ?? createId("", name, used);
    if (!id) return fail(`Section ${index + 1}: enter a name.`);
    if (sections.some((item) => item.id === id)) return fail("Each category can be saved once.");
    const supplied = section.availableWeekdays;
    const stored = supplied ?? existing?.availableWeekdays;
    const days = stored ? dayList(stored) : [];
    if (!days) return fail(`Category ${index + 1}: choose valid selling days.`);
    sections.push({ id, name, note, sortOrder: section.sortOrder, ...(stored ? { availableWeekdays: days } : {}) });
  }
  const kept = new Set(sections.map((section) => section.id));
  const referenced = input.products.filter((product) => product.menuCategoryId && !kept.has(product.menuCategoryId));
  if (referenced.length) return fail(`Move ${referenced.map((product) => product.name).slice(0, 3).join(", ")} to another category before removing this one.`);
  return { ok: true as const, assignments: [] as AssignmentWrite[], sections, categoryClears: [] as { id: string; version: number }[] };
}

function fail(message: string) {
  return { ok: false as const, error: new CatalogCommandError(400, "validation", message) };
}

function whole(value: string, max: number) {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) return null;
  return Number(value);
}

function dayList(values: number[]) {
  if (values.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return null;
  const unique = [...new Set(values)].sort((a, b) => a - b);
  return unique.length === values.length ? unique : null;
}

function dateList(values: string[]) {
  if (values.some((date) => !dateSchema.safeParse(date).success)) return null;
  const unique = [...new Set(values)].sort();
  return unique.length === values.length ? unique : null;
}

function allergenList(value: string) {
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (items.length > 20 || items.some((item) => item.length > 40)) return null;
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.toLowerCase())) return null;
    seen.add(item.toLowerCase());
  }
  return items;
}

function existingId(key: string, product: StoredProduct | undefined) {
  const id = key.trim().toLowerCase();
  return product?.variants.some((variant) => variant.id === id) ? id : null;
}

function createId(preferred: string, name: string, used: Set<string>) {
  const candidate = preferred.trim().toLowerCase();
  if (productIdSchema.safeParse(candidate).success && !used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  let base = slugify(name).slice(0, 70);
  if (!base || !productIdSchema.safeParse(base).success) base = "item";
  let id = base;
  let count = 2;
  while (used.has(id) || !productIdSchema.safeParse(id).success) id = `${base}-${count++}`;
  used.add(id);
  return id;
}
