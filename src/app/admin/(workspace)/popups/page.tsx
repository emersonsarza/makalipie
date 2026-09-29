import { requireOwnerPage } from "@/lib/admin/session";
import { readPopupSettings } from "@/lib/popups/store";
import { PopupManager } from "@/components/admin/popup-manager";

export default async function PopupsPage() {
  await requireOwnerPage();
  const settings = await readPopupSettings();
  return <PopupManager initialSettings={settings} />;
}
