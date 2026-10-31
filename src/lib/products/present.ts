import type { Catalog, CatalogProduct } from "@/lib/catalog/schema";
import { toMenuItem } from "@/lib/products/schema";
import type { MenuItem } from "@/lib/site";

export function publicMenuItem(product: CatalogProduct): MenuItem {
  const variants = product.variants.filter((v) => v.active);
  const prices = variants.flatMap((v) => v.pricingMode === "fixed" ? [v.priceCentavos! / 100] : []);
  const allFixed = prices.length === variants.length;
  const price = variants.length === 1 && allFixed ? prices[0] : undefined;
  const priceLabel = !variants.length ? "Currently unavailable" : prices.length ? `From ₱${Math.min(...prices).toLocaleString("en-PH")}${allFixed ? "" : " · other sizes quoted"}` : "DM for price";
  return { ...toMenuItem(product), price, priceLabel, variants, availableWeekdays: product.availableWeekdays, unavailableDates: product.unavailableDates, allowedAddonIds: product.allowedAddonIds, menuCategoryId: product.menuCategoryId ?? null };
}

export function presentMenu(catalog: Catalog) {
  return {
    items: catalog.products.filter((p) => p.active).map((product) => {
      const item = publicMenuItem(product);
      const days = catalog.sections.find((section) => section.id === product.menuCategoryId)?.availableWeekdays;
      return days ? { ...item, availableWeekdays: days } : item;
    }),
    sections: catalog.sections,
    addons: catalog.addons.filter((a) => a.active),
    unavailable: false as const,
    catalog,
  };
}
