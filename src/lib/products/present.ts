import type { Catalog, CatalogProduct } from "@/lib/catalog/schema";
import { toMenuItem } from "@/lib/products/schema";
import type { MenuItem } from "@/lib/site";

export function publicMenuItem(product: CatalogProduct): MenuItem | null {
  const variants = product.variants.filter((v) => v.active && v.pricingMode === "fixed" && v.priceCentavos != null);
  if (!variants.length) return null;
  const prices = variants.map((v) => v.priceCentavos! / 100);
  const price = variants.length === 1 ? prices[0] : undefined;
  const priceLabel = `From ₱${Math.min(...prices).toLocaleString("en-PH")}`;
  return { ...toMenuItem(product), price, priceLabel, variants, availableWeekdays: product.availableWeekdays, unavailableDates: product.unavailableDates, allowedAddonIds: product.allowedAddonIds, menuCategoryId: product.menuCategoryId ?? null };
}

export function presentMenu(catalog: Catalog) {
  return {
    items: catalog.products.filter((p) => p.active).flatMap((product) => {
      const item = publicMenuItem(product);
      if (!item) return [];
      const days = catalog.sections.find((section) => section.id === product.menuCategoryId)?.availableWeekdays;
      return [days ? { ...item, availableWeekdays: days } : item];
    }),
    sections: catalog.sections,
    addons: catalog.addons.filter((a) => a.active),
    unavailable: false as const,
    catalog,
  };
}
