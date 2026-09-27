import { z } from "zod";
import dayjs from "@/lib/dayjs";
import { productIdSchema, productImageSchema } from "@/lib/products/schema";
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => dayjs(s, "YYYY-MM-DD", true).isValid(), "Use a valid date.");
const money = z.number().int().min(0).max(100_000_000);
export const variantSchema = z.object({ id: productIdSchema, label: z.string().trim().min(1).max(80), pricingMode: z.enum(["fixed", "quote_required"]), priceCentavos: money.nullable(), minLeadDays: z.number().int().min(0).max(365), active: z.boolean(), sortOrder: z.number().int().min(0).max(9999) }).strict().refine((v) => v.pricingMode === "fixed" ? v.priceCentavos !== null : v.priceCentavos === null, "Fixed prices need an amount; quote-required sizes must have no price.");
export const productCatalogSchema = z.object({ version: z.number().int().positive(), variants: z.array(variantSchema).min(1).max(30), availableWeekdays: z.array(z.number().int().min(0).max(6)).max(7), unavailableDates: z.array(dateSchema).max(366), allowedAddonIds: z.array(productIdSchema).max(100) }).strict().refine((v) => new Set(v.variants.map((x) => x.id)).size === v.variants.length, "Each size must have a different ID.");
export const addonFieldsSchema = z.object({ name: z.string().trim().min(1).max(100), priceCentavos: money, image: productImageSchema, minLeadDays: z.number().int().min(0).max(365), allergens: z.array(z.string().trim().min(1).max(40)).max(20), active: z.boolean(), sortOrder: z.number().int().min(0).max(9999), scope: z.enum(["per_item", "per_order"]), customization: z.object({ enabled: z.boolean(), label: z.string().trim().max(100), required: z.boolean(), maxLength: z.number().int().min(1).max(500) }).strict() }).strict().refine((v) => !v.customization.enabled || !!v.customization.label, "Add a label for the customization field.").refine((v) => v.customization.enabled || !v.customization.required, "Enable customization before requiring a message.");
export const addonWriteSchema = z.object({ id: productIdSchema, version: z.number().int().min(0), fields: addonFieldsSchema }).strict();
export type Variant = z.infer<typeof variantSchema>;
export type AddonFields = z.infer<typeof addonFieldsSchema>;
export type Addon = AddonFields & { id: string; version: number };
export type ProductCatalog = z.infer<typeof productCatalogSchema>;
export type CatalogProduct = import("@/lib/products/schema").Product & ProductCatalog;
export type Catalog = { initialized: boolean; products: CatalogProduct[]; addons: Addon[] };
export const selectionSchema = z.object({
  date: dateSchema,
  lines: z.array(z.object({ productId: productIdSchema, variantId: productIdSchema, quantity: z.number().int().min(1).max(100), addons: z.array(z.object({ id: productIdSchema, message: z.string().trim().max(500) }).strict()).max(100) }).strict()).min(1).max(100),
  addons: z.array(z.object({ id: productIdSchema, message: z.string().trim().max(500) }).strict()).max(100),
}).strict();
export type Selection = z.infer<typeof selectionSchema>;
export function pesosToCentavos(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return NaN;
  const [whole, decimal = ""] = value.trim().split(".");
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
}
