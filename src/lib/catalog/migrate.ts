import type { BranchId, CatalogMode } from "@/lib/branches/schema";
import { variantOrderMode, type OrderMode } from "./mode";
import type { Catalog } from "./schema";
import type { MenuSection } from "./sections";

type Assignment = { productId: string; variantId: string; branchIds: BranchId[]; mode: CatalogMode };

/**
 * In-memory view of the simplified catalogue. Product and variant IDs are kept.
 * Missing category days are copied when every product in that category agrees.
 * Saved variant modes stay untouched so older lead times still apply until a migration write.
 */
export function displayCategorySchedules<T extends { menuCategoryId?: string | null; availableWeekdays: number[] }>(sections: MenuSection[], products: T[]) {
  return sections.map((section) => {
    if (section.availableWeekdays !== undefined) return section;
    const days = sharedCategoryDays(products, section.id);
    return days !== undefined ? { ...section, availableWeekdays: days } : section;
  });
}

export function applyCatalogMigration<T extends Catalog>(catalog: T, extras?: { preorderLeadDays?: number; featuredProductIds?: string[] }): T {
  return {
    ...catalog,
    sections: displayCategorySchedules(catalog.sections, catalog.products),
    preorderLeadDays: extras?.preorderLeadDays ?? catalog.preorderLeadDays ?? 3,
    featuredProductIds: extras?.featuredProductIds ?? catalog.featuredProductIds ?? [],
  };
}

export function catalogMigrationPlan(catalog: Catalog, assignments: Assignment[] = []) {
  const next = applyCatalogMigration(catalog);
  return {
    sections: next.sections,
    variants: next.products.flatMap((product) => product.variants.map((variant) => {
      const orderMode = (variant.orderMode ?? variantOrderMode(variant)) as OrderMode;
      return {
        productId: product.id,
        variantId: variant.id,
        orderMode,
        minLeadDays: orderMode === "preorder" ? next.preorderLeadDays ?? 3 : 0,
      };
    })),
    assignments: assignments.map((assignment) => {
      const variant = next.products.find((product) => product.id === assignment.productId)?.variants.find((item) => item.id === assignment.variantId);
      return variant ? { ...assignment, mode: variantOrderMode(variant) } : assignment;
    }),
    preorderLeadDays: next.preorderLeadDays ?? 3,
    featuredProductIds: next.featuredProductIds ?? [],
  };
}

function sharedCategoryDays(products: { menuCategoryId?: string | null; availableWeekdays: number[] }[], sectionId: string) {
  const members = products.filter((product) => product.menuCategoryId === sectionId);
  const keys = [...new Set(members.map((product) => [...product.availableWeekdays].sort((a, b) => a - b).join(",")))];
  return keys.length === 1 ? [...members[0].availableWeekdays] : undefined;
}
