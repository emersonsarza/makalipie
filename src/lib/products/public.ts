import "server-only";
import { firebaseSetupReady } from "@/lib/firebase/server";
import { readCatalog } from "@/lib/catalog/store";
import { defaultCatalog } from "@/lib/catalog/defaults";
import { publicCacheKeys, remember } from "@/lib/public-cache";
import { presentMenu } from "./present";

export { publicMenuItem } from "./present";

export async function readPublicMenu() {
  try {
    if (!firebaseSetupReady()) return presentMenu(defaultCatalog());
    return await remember(publicCacheKeys.menu, async () => presentMenu(await readCatalog()));
  } catch {
    console.error("Public product catalog unavailable.");
    return { items: [], sections: [], addons: [], unavailable: true as const, catalog: null };
  }
}
