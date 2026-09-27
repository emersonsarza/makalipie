import { menuItems } from "@/lib/site";
import type { Product } from "./schema";

export function defaultProducts(): Product[] {
  return menuItems.map((item, index) => ({
    id: item.slug, slug: item.slug, name: item.name, blurb: item.blurb,
    description: item.description, category: item.kind,
    image: { url: item.image.src, alt: item.image.alt },
    allergens: [], publicNotes: item.note ?? "", active: true, sortOrder: index,
    legacyPriceCentavos: item.price === undefined ? null : Math.round(item.price * 100),
    version: 1, updatedAt: null,
  }));
}
