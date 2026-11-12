import { cache } from "react";
import { connection } from "next/server";
import { cachedCatalog } from "@/lib/storefront/load";
import { publicDropsWithStock, catalogForDrops } from "@/lib/drops/load";
import { presentDropDiscovery } from "@/lib/drops/present";
import { presentShop } from "@/lib/storefront/present";

export const storefrontRenderTime = cache(() => new Date());
const readCatalogForRender = cache(() => cachedCatalog(storefrontRenderTime()));

export const readPublishedShop = cache(async () => {
  await connection();
  try {
    const now = storefrontRenderTime();
    return presentShop(await readCatalogForRender(), now);
  } catch {
    return undefined;
  }
});

export const readUpcomingDrops = cache(async () => {
  try {
    const now = storefrontRenderTime();
    const [catalog, drops] = await Promise.all([readCatalogForRender(), publicDropsWithStock(now)]);
    return presentDropDiscovery(drops, catalog.locations, catalogForDrops(catalog), now);
  } catch {
    return undefined;
  }
});
