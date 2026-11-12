import { bookableProduct } from "./eligibility";
import type { StoreCatalog } from "./types";

export function bySort<T extends { sortOrder: number; id: string }>(left: T, right: T) {
  return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
}

export function selectFeatured(catalog: StoreCatalog, now = new Date()) {
  const eligible = new Set(
    catalog.products.filter((product) => bookableProduct(catalog, product, "cebu", now)).map((product) => product.id),
  );
  const menuOrder = [...catalog.sections].sort(bySort).flatMap((section) => (
    catalog.products.filter((product) => product.sectionId === section.id).sort(bySort).map((product) => product.id)
  ));
  const chosen: string[] = [];
  for (const id of [...catalog.featuredIds, ...menuOrder]) {
    if (!eligible.has(id) || chosen.includes(id)) continue;
    chosen.push(id);
    if (chosen.length === 4) break;
  }
  return chosen;
}

