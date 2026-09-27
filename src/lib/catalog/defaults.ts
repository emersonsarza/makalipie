import { addons } from "@/lib/site";
import { defaultProducts } from "@/lib/products/defaults";
import type { Product } from "@/lib/products/schema";
import type { Addon, Catalog, Variant } from "./schema";
export function defaultVariant(product: Product): Variant { return { id: "standard", label: "Standard", pricingMode: product.legacyPriceCentavos === null ? "quote_required" : "fixed", priceCentavos: product.legacyPriceCentavos, minLeadDays: 0, active: true, sortOrder: 0 }; }
export function defaultAddons(): Addon[] { return addons.map((a, i) => ({ id: a.id, name: a.label, priceCentavos: a.price * 100, image: { url: "/brand/seal.png", alt: a.label }, minLeadDays: 0, allergens: [], active: true, sortOrder: i, scope: "per_order", customization: { enabled: a.id === "note-card", label: "Message for note card", required: false, maxLength: 300 }, version: 1 })); }
export function defaultCatalog(): Catalog { return { initialized: false, products: defaultProducts().map((p) => ({ ...p, variants: [defaultVariant(p)], availableWeekdays: p.id === "buko" ? [5, 6, 0] : [], unavailableDates: [], allowedAddonIds: addons.map((a) => a.id) })), addons: defaultAddons() }; }
