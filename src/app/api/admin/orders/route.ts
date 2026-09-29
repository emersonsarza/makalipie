import { AdminAccessError, isAllowedMutationOrigin } from "@/lib/admin/access";
import { adminFailure, adminJson, readAdminJson } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { readClosedOrders, readHeldOrders, transitionOrder } from "@/lib/orders/store";

export async function GET() {
  try {
    const admin = await requireAdmin();
    const [orders, closed] = await Promise.all([readHeldOrders(admin), readClosedOrders(admin)]);
    return adminJson({ orders: [...orders, ...closed] });
  } catch (error) {
    return adminFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!isAllowedMutationOrigin(request, process.env.ADMIN_APP_ORIGIN ?? "")) {
      throw new AdminAccessError(403, "This request is not allowed. Reload the page and try again.");
    }
    const result = await transitionOrder(await readAdminJson(request), await requireAdmin());
    if (result.conflict) return adminJson({ error: result.conflict, order: result.order, review: result.review }, 409);
    return adminJson({ order: result.order, review: result.review });
  } catch (error) {
    return adminFailure(error);
  }
}
