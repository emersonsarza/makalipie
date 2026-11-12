import { withOwner } from "@/lib/admin/session";
import { listOrderQueues } from "@/lib/orders/query";

export function GET(request: Request) {
  return withOwner(request, async () => ({ status: 200, body: await listOrderQueues() }));
}
