import "server-only";
import { cache } from "react";
import { firebaseSetupReady, getServerFirebase } from "@/lib/firebase/server";
import { readBranchSettings } from "@/lib/branches/store";
import { defaultPublicShop, defaultShopSettings, shopSettingsSchema, type PublicShop } from "./schema";
export const readShopSettings = cache(async () => {
  if (!firebaseSetupReady()) return defaultShopSettings;
  const snapshot = await getServerFirebase().db.doc("settings/shop").get();
  return shopSettingsSchema.parse(snapshot.exists ? snapshot.data() : {});
});
export const readPublicShop = cache(async (): Promise<PublicShop> => {
  const [settings, branches] = await Promise.all([readShopSettings().catch(() => defaultShopSettings), readBranchSettings().catch(() => null)]);
  const branch = branches?.branches.find((item) => item.id === branches.defaultBranch);
  return { links: settings.links, branchName: branch?.name || defaultPublicShop.branchName, address: branch?.address || defaultPublicShop.address, hoursLabel: branch?.hoursLabel || defaultPublicShop.hoursLabel, mapUrl: branch?.mapUrl || defaultPublicShop.mapUrl, deliveryAvailable: branches ? branches.branches.some((b) => b.visible && b.deliveryEnabled) : true };
});
