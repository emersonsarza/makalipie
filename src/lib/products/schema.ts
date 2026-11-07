import { z } from "zod";
import type { MenuItem } from "@/lib/site";

export const productIdSchema = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens.").refine((value) => !["new", "images", "import"].includes(value), "Choose a different product link.");
export const productImageSchema = z.object({
  url: z.string().trim().max(2000).refine((value) => /^\/(images|brand)\/[a-zA-Z0-9/_-]+\.(webp|png|jpe?g)$/.test(value), "Choose a product photo."),
  alt: z.string().trim().min(1, "Describe the photo for customers using screen readers.").max(200),
}).strict();

export const productFieldsSchema = z.object({
  slug: productIdSchema,
  name: z.string().trim().min(1, "Enter a product name.").max(100),
  blurb: z.string().trim().min(1, "Add a short description.").max(180),
  description: z.string().trim().min(1, "Add a product description.").max(2000),
  category: z.enum(["sweet", "savory"]),
  image: productImageSchema,
  allergens: z.array(z.string().trim().min(1).max(40)).max(20),
  publicNotes: z.string().trim().max(300),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999),
}).strict();

export const updateProductSchema = productFieldsSchema.extend({ version: z.number().int().positive() }).strict();
export type ProductFields = z.infer<typeof productFieldsSchema>;
export type Product = ProductFields & {
  id: string;
  version: number;
  updatedAt: string | null;
  legacyPriceCentavos: number | null;
  /** Shop menu section. Absent on older records and on the v1 product editor. */
  menuCategoryId?: string | null;
};
export type ProductList = { initialized: boolean; products: Product[] };

export function slugify(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80).replace(/-$/, "");
}

export function toMenuItem(product: Product): MenuItem {
  return {
    slug: product.slug,
    name: product.name,
    kind: product.category,
    blurb: product.blurb,
    description: product.description,
    image: { src: product.image.url, alt: product.image.alt },
    note: product.publicNotes || undefined,
    allergens: product.allergens,
    ...(product.legacyPriceCentavos === null ? { priceLabel: "DM for price" } : { price: product.legacyPriceCentavos / 100 }),
  };
}
