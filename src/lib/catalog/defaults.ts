import { defaultProducts } from "@/lib/products/defaults";
import type { Product } from "@/lib/products/schema";
import { seedAddons, seedProducts, seedSections, seedShop, seedVariantRecord } from "./seed-data";
import type { Addon, Catalog, Variant } from "./schema";

export function defaultVariant(product: Product): Variant { return { id: "standard", label: "Standard", pricingMode: product.legacyPriceCentavos === null ? "quote_required" : "fixed", priceCentavos: product.legacyPriceCentavos, minLeadDays: 0, active: true, sortOrder: 0 }; }

export function defaultAddons(): Addon[] {
  return seedAddons.map((addon) => ({ ...addon, allergens: [...addon.allergens], image: { ...addon.image }, customization: { ...addon.customization } }));
}

/** Unsaved shops show the same pies, sizes, photos, and sections as `pnpm seed admin`. */
export function defaultCatalog(): Catalog {
  const products = defaultProducts();
  return {
    initialized: false,
    preorderLeadDays: seedShop.defaultPreorderLeadDays,
    featuredProductIds: [...seedShop.featuredProductIds],
    sections: seedSections.map((section) => ({ ...section, availableWeekdays: [...section.availableWeekdays] })),
    products: products.map((product) => {
      const seed = seedProducts.find((item) => item.id === product.id)!;
      return {
        ...product,
        variants: seed.sizes.map((size) => {
          const variant = seedVariantRecord(size);
          return variant.image ? { ...variant, image: { ...variant.image } } : variant;
        }),
        availableWeekdays: [...seed.availableWeekdays],
        unavailableDates: [],
        allowedAddonIds: seedAddons.map((addon) => addon.id),
      };
    }),
    addons: defaultAddons(),
  };
}
