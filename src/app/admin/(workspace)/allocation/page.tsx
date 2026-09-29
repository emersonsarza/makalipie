import { requireOwnerPage } from "@/lib/admin/session";
import { AllocationManager } from "@/components/admin/allocation-manager";
import { branchCatalog } from "@/lib/branches/schema";
import { readBranchSettings } from "@/lib/branches/store";
import { manilaDate } from "@/lib/catalog/rules";
import { readAllocationDayMap, readAllocationMap } from "@/lib/orders/store";
import { readPublicMenu } from "@/lib/products/public";
import { readScheduleSettings } from "@/lib/scheduling/store";

export default async function AllocationPage() {
  await requireOwnerPage();
  const [branches, schedule, allocations, pauses, menu] = await Promise.all([readBranchSettings(), readScheduleSettings(), readAllocationMap(), readAllocationDayMap(), readPublicMenu()]);
  const seenFlavors = new Set<string>();
  const flavors = menu.catalog ? branches.branches.flatMap((branch) => (["regular", "preorder"] as const).flatMap((mode) => branchCatalog(menu.catalog!, branches, branch.id, mode).products.flatMap((product) => {
    const key = `${branch.id}:${product.id}`;
    if (seenFlavors.has(key)) return [];
    seenFlavors.add(key);
    return [{ branchId: branch.id, productId: product.id, name: product.name }];
  }))) : [];
  return (
    <AllocationManager
      branches={branches}
      flavors={flavors}
      today={manilaDate()}
      horizonDays={schedule.bookingHorizonDays}
      closedDates={Object.fromEntries(Object.entries(schedule.branches).map(([id, item]) => [id, item.closedDates]))}
      initialAllocations={[...allocations.values()]}
      initialPauses={[...pauses.values()]}
    />
  );
}
