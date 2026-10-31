import { seedProducts } from "@/lib/catalog/seed-data";
import type { Product } from "./schema";

export function defaultProducts(): Product[] {
  return seedProducts.map((product) => ({
    id: product.id,
    slug: product.id,
    name: product.name,
    blurb: product.blurb,
    description: product.description,
    category: product.category,
    image: { ...product.image },
    allergens: [],
    publicNotes: product.publicNotes,
    active: true,
    sortOrder: product.sortOrder,
    menuCategoryId: product.menuCategoryId,
    legacyPriceCentavos: product.sizes.find((size) => size.id === "4-inch")?.priceCentavos ?? null,
    version: 1,
    updatedAt: null,
  }));
}
