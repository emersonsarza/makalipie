import { requireOwnerPage } from "@/lib/admin/session";
import { readScheduleSettings } from "@/lib/scheduling/store";
import { readBranchSettings } from "@/lib/branches/store";
import { ScheduleManager } from "@/components/admin/schedule-manager";
export default async function SchedulePage() {
  await requireOwnerPage();
  const [settings, branches] = await Promise.all([readScheduleSettings(), readBranchSettings()]);
  return <ScheduleManager initialSettings={settings} branches={branches} />;
}
