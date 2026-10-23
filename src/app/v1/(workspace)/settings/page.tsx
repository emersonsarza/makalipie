import { requireOwnerPage } from "@/lib/admin/session";
import { readShopSettings } from "@/lib/settings/store";
import { ShopSettingsForm } from "@/components/admin/shop-settings";
export default async function SettingsPage() {
  await requireOwnerPage();
  return <ShopSettingsForm initial={await readShopSettings()} />;
}
