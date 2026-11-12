import { withOwner } from "@/lib/admin/session";
import { countOrdersNeedingAttention } from "@/lib/orders/query";

export function GET(request: Request) {
  const queue = new URL(request.url).searchParams.get("queue") ?? undefined;
  return withOwner(request, async () => ({
    status: 200,
    body: { count: await countOrdersNeedingAttention(queue) },
  }));
}
