import "server-only";
import { firebaseSetupReady } from "@/lib/firebase/server";
import { readCatalog } from "@/lib/catalog/store";
import { defaultCatalog } from "@/lib/catalog/defaults";
import { toMenuItem } from "./schema";
import type { CatalogProduct } from "@/lib/catalog/schema";
import type { MenuItem } from "@/lib/site";
export function publicMenuItem(product: CatalogProduct): MenuItem {
  const variants = product.variants.filter((v) => v.active);
  const prices = variants.flatMap((v) => v.pricingMode === "fixed" ? [v.priceCentavos! / 100] : []);
  const allFixed = prices.length === variants.length;
  const price = variants.length === 1 && allFixed ? prices[0] : undefined;
  const priceLabel = !variants.length ? "Currently unavailable" : prices.length ? `From ₱${Math.min(...prices).toLocaleString("en-PH")}${allFixed ? "" : " · other sizes quoted"}` : "DM for price";
  return { ...toMenuItem(product), price, priceLabel, variants, availableWeekdays: product.availableWeekdays, unavailableDates: product.unavailableDates, allowedAddonIds: product.allowedAddonIds };
}
export async function readPublicMenu() {
  try {
    const catalog = firebaseSetupReady() ? await readCatalog() : defaultCatalog();
    return { items: catalog.products.filter((p) => p.active).map(publicMenuItem), addons: catalog.addons.filter((a) => a.active), unavailable: false, catalog };
  } catch {
    console.error("Public product catalog unavailable.");
    return { items: [], addons: [], unavailable: true, catalog: null };
  }
}
