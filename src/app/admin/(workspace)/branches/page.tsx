import { requireOwnerPage } from "@/lib/admin/session";
import { readCatalog } from "@/lib/catalog/store";
import { readBranchSettings } from "@/lib/branches/store";
import { BranchManager } from "@/components/admin/branch-manager";
export default async function BranchesPage() {
  await requireOwnerPage();
  const [settings, catalog] = await Promise.all([readBranchSettings(), readCatalog()]);
  return <BranchManager initialSettings={settings} initialCatalog={catalog} />;
}
