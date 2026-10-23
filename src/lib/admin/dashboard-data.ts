import "server-only";

import { readBranchSettings } from "@/lib/branches/store";
import { readCatalog } from "@/lib/catalog/store";
import type { AdminIdentity } from "@/lib/admin/schemas";
import { readAllocationDayMap, readAllocationMap, expireDueHolds, readOrdersForDashboard } from "@/lib/orders/store";
import { ordersVisibleTo } from "@/lib/orders/schema";
import { ProductError } from "@/lib/products/store";
import { readScheduleSettings } from "@/lib/scheduling/store";
import { requireAdmin } from "./session";
import { buildDashboard, resolveDashboardScope, type DashboardProduct } from "./dashboard";

export async function readAdminDashboard(query: {
  branch: string | null;
  date: string | null;
  attentionCursor: string | null;
  fulfillmentCursor: string | null;
}) {
  const admin = await requireAdmin();
  const now = new Date();
  let branchSettings;
  try {
    branchSettings = await readBranchSettings();
  } catch {
    console.error("Dashboard branch directory could not be loaded.");
    throw new ProductError(503, "The dashboard couldn't be loaded. Please try again.");
  }
  const scope = resolveDashboardScope({
    admin,
    branch: query.branch,
    date: query.date,
    now,
    knownBranchIds: branchSettings.branches.map((branch) => branch.id),
  });
  const [orders, schedule, allocations, pauses, products] = await Promise.all([
    loadOrders(admin, scope.branchIds, now),
    loadOrNull(readScheduleSettings),
    loadOrNull(async () => [...(await readAllocationMap()).values()]),
    loadOrNull(async () => [...(await readAllocationDayMap()).values()]),
    loadOrNull(() => loadProducts(branchSettings)),
  ]);
  return buildDashboard({
    now,
    branchIds: scope.branchIds,
    date: scope.date,
    permissions: scope.permissions,
    orders,
    branches: branchSettings.branches.map((branch) => ({ id: branch.id, name: branch.name, hoursLabel: branch.hoursLabel })),
    schedule,
    allocations,
    pauses,
    products,
    attentionCursor: query.attentionCursor,
    fulfillmentCursor: query.fulfillmentCursor,
  });
}

async function loadOrders(admin: AdminIdentity, branchIds: string[], now: Date) {
  try {
    await expireDueHolds(now);
    const orders = await readOrdersForDashboard();
    return ordersVisibleTo(admin.role, admin.branchIds, orders).filter((order) => branchIds.includes(order.branchId));
  } catch {
    console.error("Dashboard orders could not be loaded.");
    return null;
  }
}

async function loadProducts(branchSettings: Awaited<ReturnType<typeof readBranchSettings>>): Promise<DashboardProduct[]> {
  const catalog = await readCatalog();
  const names = new Map(catalog.products.map((product) => [product.id, product.name]));
  const grouped = new Map<string, Set<string>>();
  for (const assignment of branchSettings.assignments) {
    const branches = grouped.get(assignment.productId) ?? new Set<string>();
    for (const id of assignment.branchIds) branches.add(id);
    grouped.set(assignment.productId, branches);
  }
  return [...grouped].map(([id, branchIds]) => ({ id, name: names.get(id) ?? id, branchIds: [...branchIds] }));
}

async function loadOrNull<T>(read: () => Promise<T>) {
  try {
    return await read();
  } catch {
    console.error("Dashboard section could not be loaded.");
    return null;
  }
}
