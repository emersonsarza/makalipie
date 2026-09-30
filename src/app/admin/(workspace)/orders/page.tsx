import { Suspense } from "react";
import { requireAdminPage } from "@/lib/admin/session";
import { OrderInbox } from "@/components/admin/order-inbox";
import { readBranchSettings } from "@/lib/branches/store";
import { readClosedOrders, readHeldOrders } from "@/lib/orders/store";
import { readScheduleSettings } from "@/lib/scheduling/store";

export default async function OrdersPage() {
  const admin = await requireAdminPage();
  const [orders, closed, branches, schedule] = await Promise.all([readHeldOrders(admin), readClosedOrders(admin), readBranchSettings(), readScheduleSettings()]);
  return (
    <Suspense fallback={<p className="schedule-help">Loading orders…</p>}>
      <OrderInbox initialOrders={[...orders, ...closed]} branches={branches} schedule={schedule} role={admin.role} />
    </Suspense>
  );
}
