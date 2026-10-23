import { requireOwnerPage } from "@/lib/admin/session";
import { opsOverview } from "@/lib/admin/overview-fixtures";
import { buildOpsOverview } from "@/lib/admin/overview-live";
import { OpsOverview } from "@/components/admin/ops-overview";
import { readAllocationDayMap, readAllocationMap, readClosedOrders, readHeldOrders } from "@/lib/orders/store";
import { readScheduleSettings } from "@/lib/scheduling/store";

export default async function AdminOverview({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const admin = await requireOwnerPage();
  const { preview } = await searchParams;
  if (preview === "fixtures") {
    return <OpsOverview snapshot={opsOverview} fixturePreview />;
  }

  const [held, closed, schedule, allocations, pauses] = await Promise.all([
    readHeldOrders(admin),
    readClosedOrders(admin),
    readScheduleSettings(),
    readAllocationMap(),
    readAllocationDayMap(),
  ]);

  const snapshot = buildOpsOverview({
    orders: [...held, ...closed],
    schedule,
    allocations,
    pauses,
  });

  return <OpsOverview snapshot={snapshot} />;
}
