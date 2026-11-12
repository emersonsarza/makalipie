import { withOwner } from "@/lib/admin/session";
import { findOrder } from "@/lib/orders/query";
import { z } from "zod";

export const dynamic = "force-dynamic";

export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return withOwner(request, async () => {
    const { id } = await context.params;
    const order = z.string().uuid().safeParse(id).success ? await findOrder(id) : null;
    return order
      ? { status: 200, body: order }
      : { status: 404, body: { error: "not_found" } };
  });
}
