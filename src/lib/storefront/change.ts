import { z } from "zod";
import { createServiceClient } from "../admin/supabase";
import { minutesOfDay } from "../scheduling/schema";
import { assetManifest } from "./images";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(60);
const webp = z.string().regex(/^\/images\/[A-Za-z0-9_./-]+\.webp$/);
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const https = z.string().refine((value) => value === "" || value.startsWith("https://"));
const weekdays = z.array(z.number().int().min(0).max(6)).min(1).max(7).refine((days) => new Set(days).size === days.length);
const revision = z.number().int().nonnegative();
const themeImage = z.object({
  theme: z.enum(["christmas", "original"]),
  path: webp,
  alt: z.string().trim().min(1).max(300),
});

const locationSchema = z.object({
  revision,
  id: slug,
  kind: z.enum(["regular", "drop"]),
  name: z.string().trim().min(1).max(100),
  address: z.string().max(300).default(""),
  mapUrl: https.default(""),
  hoursLabel: z.string().max(150).default(""),
  visible: z.boolean(),
  pickupEnabled: z.boolean(),
  deliveryEnabled: z.boolean(),
  acceptingOrders: z.boolean(),
  grabFoodUrl: https.default(""),
  foodpandaUrl: https.default(""),
  updatedAt: z.string().min(1).optional(),
}).refine((location) => location.id !== "cebu" || location.visible)
  .refine((location) => location.kind === "drop" || location.pickupEnabled || location.deliveryEnabled)
  .refine((location) => location.kind === "regular" || (location.grabFoodUrl === "" && location.foodpandaUrl === ""));

const sectionSchema = z.object({
  revision,
  id: slug,
  name: z.string().trim().min(1).max(80),
  note: z.string().max(200).default(""),
  sortOrder: z.number().int(),
  weekdays,
  updatedAt: z.string().min(1).optional(),
});

const sizeSchema = z.object({
  id: slug,
  label: z.string().trim().min(1).max(40),
  priceCentavos: z.number().int().nonnegative(),
  mode: z.enum(["regular", "preorder"]),
  enabled: z.boolean(),
  sortOrder: z.number().int(),
  imagePath: webp.nullable(),
  imageAlt: z.string().trim().min(1).max(300).nullable(),
  themeImages: z.array(themeImage).max(2),
  branchIds: z.array(slug).max(20),
}).refine((size) => (size.imagePath === null) === (size.imageAlt === null))
  .refine((size) => new Set(size.branchIds).size === size.branchIds.length)
  .refine((size) => new Set(size.themeImages.map((image) => image.theme)).size === size.themeImages.length);

const productSchema = z.object({
  revision,
  id: slug,
  updatedAt: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  shortDescription: z.string().max(400),
  description: z.string().max(2000),
  allergens: z.array(z.string().trim().min(1).max(80)).max(20),
  sectionId: slug,
  enabled: z.boolean(),
  sortOrder: z.number().int(),
  imagePath: webp,
  imageAlt: z.string().trim().min(1).max(300),
  seasonStart: day.nullable(),
  seasonEnd: day.nullable(),
  themeImages: z.array(themeImage).max(2),
  sizes: z.array(sizeSchema).min(1).max(8),
}).refine((product) => (product.seasonStart === null) === (product.seasonEnd === null))
  .refine((product) => product.seasonStart === null || product.seasonEnd === null || product.seasonStart <= product.seasonEnd)
  .refine((product) => new Set(product.sizes.map((size) => size.id)).size === product.sizes.length)
  .refine((product) => new Set(product.themeImages.map((image) => image.theme)).size === product.themeImages.length);

const addonSchema = z.object({
  revision,
  id: slug,
  updatedAt: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(80),
  priceCentavos: z.number().int().nonnegative(),
  icon: z.enum(["gift", "note", "default"]),
  enabled: z.boolean(),
  sortOrder: z.number().int(),
  locationIds: z.array(slug).max(20),
}).refine((addOn) => new Set(addOn.locationIds).size === addOn.locationIds.length);

const scheduleSchema = z.object({
  revision,
  locationId: slug,
  updatedAt: z.string().min(1),
  enabled: z.boolean(),
  opens: clock,
  cutoff: clock,
  weekdays,
}).refine((schedule) => minutesOfDay(schedule.cutoff) - minutesOfDay(schedule.opens) >= 60);

const overrideSchema = z.object({
  revision,
  locationId: slug,
  date: day,
  updatedAt: z.string().min(1).optional(),
  closed: z.boolean(),
  opens: clock.nullable(),
  cutoff: clock.nullable(),
}).refine((override) => (
  override.closed
    ? override.opens === null && override.cutoff === null
    : override.opens !== null && override.cutoff !== null && minutesOfDay(override.cutoff) - minutesOfDay(override.opens) >= 60
));

const settingsSchema = z.object({
  revision,
  updatedAt: z.string().min(1),
  theme: z.enum(["christmas", "original"]),
  bookingHorizonDays: z.number().int().min(1).max(60),
  preorderLeadDays: z.number().int().min(0).max(30),
  instagramUrl: https,
  instagramDmUrl: https,
  messengerUrl: https,
});

const featuredSchema = z.object({
  revision,
  productIds: z.array(slug).max(20),
}).refine((featured) => new Set(featured.productIds).size === featured.productIds.length);

const popupSchema = z.object({
  revision,
  id: slug,
  updatedAt: z.string().min(1).optional(),
  locationId: slug,
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(300),
  mapUrl: https.default(""),
  startDate: day,
  endDate: day,
  hours: z.string().trim().min(1).max(80),
  items: z.array(z.string().trim().min(1).max(120)).max(20),
}).refine((popup) => popup.startDate <= popup.endDate);

const reorderSchema = z.object({
  revision,
  sectionId: slug.optional(),
  items: z.array(z.object({ id: slug, updatedAt: z.string().min(1) })).min(1).max(100)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length),
});

function imagesKnown(paths: string[]) {
  const manifest = new Set(assetManifest());
  return paths.every((path) => manifest.has(path));
}

function productImages(product: z.infer<typeof productSchema>) {
  return [
    product.imagePath,
    ...product.themeImages.map((image) => image.path),
    ...product.sizes.flatMap((size) => [size.imagePath, ...size.themeImages.map((image) => image.path)].filter((path): path is string => Boolean(path))),
  ];
}

export function parseCatalogChange(action: unknown, payload: unknown): { action: string; payload: Record<string, unknown> } | null {
  if (typeof action !== "string") return null;
  const parsed = schemaFor(action)?.safeParse(payload);
  if (!parsed?.success) return null;
  if (action === "save_product" && !imagesKnown(productImages(parsed.data as z.infer<typeof productSchema>))) return null;
  return { action, payload: parsed.data };
}

function schemaFor(action: string) {
  switch (action) {
    case "save_location": return locationSchema;
    case "save_section": return sectionSchema;
    case "delete_section": return z.object({ revision, id: slug, updatedAt: z.string().min(1) });
    case "reorder_sections": return reorderSchema.omit({ sectionId: true });
    case "reorder_products": return reorderSchema.required({ sectionId: true });
    case "save_product": return productSchema;
    case "save_addon": return addonSchema;
    case "save_schedule": return scheduleSchema;
    case "save_override": return overrideSchema;
    case "delete_override": return z.object({ revision, locationId: slug, date: day, updatedAt: z.string().min(1) });
    case "save_settings": return settingsSchema;
    case "save_featured": return featuredSchema;
    case "save_popup": return popupSchema;
    default: return null;
  }
}

function mapCatalogError(error: { code?: string; message?: string }) {
  const message = error.message ?? "";
  if (message.includes("stale_save")) return { status: 409, body: { error: "stale_save" } };
  if (message.includes("section_in_use")) return { status: 409, body: { error: "section_in_use" } };
  if (message.includes("not_found")) return { status: 404, body: { error: "not_found" } };
  const validationCodes = new Set(["22023", "22P02", "23502", "23503", "23505", "23514", "42804"]);
  if (message.includes("validation") || message.includes("regular branch") || (error.code && (error.code === "P0001" || validationCodes.has(error.code)))) {
    return { status: 400, body: { error: "validation" } };
  }
  return { status: 503, body: { error: "temporary_failure" } };
}

export async function applyCatalogChange(action: unknown, payload: unknown) {
  const parsed = parseCatalogChange(action, payload);
  if (!parsed) return { status: 400, body: { error: "validation" } };
  const result = await createServiceClient().rpc("apply_catalog_change", { action: parsed.action, payload: parsed.payload });
  if (result.error) return mapCatalogError(result.error);
  return { status: 200, body: result.data ?? { affectedOrders: [] } };
}
