import { withOwner } from "../../../../lib/admin/session";
import { applyOrderChange } from "../../../../lib/orders/change";
import { listOrders } from "../../../../lib/orders/query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return withOwner(request, async () => ({ status: 200, body: await listOrders(new URL(request.url)) }));
}

export function POST(request: Request) {
  return withOwner(request, async () => {
    const body: unknown = await request.json().catch(() => null);
    const record = typeof body === "object" && body !== null ? body as { action?: unknown; payload?: unknown } : {};
    return applyOrderChange(record.action, record.payload, "admin");
  }, { mutation: true });
}
