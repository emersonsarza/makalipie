import { withOwner } from "@/lib/admin/session";
import { createServiceClient } from "@/lib/admin/supabase";
import { orderSourceLabel } from "@/lib/orders/query";
import { z } from "zod";

const orderIds = z.array(z.string().uuid()).min(1).max(10);

export function GET(request: Request) {
  return withOwner(request, async () => {
    const ids = orderIds.safeParse(new URL(request.url).searchParams.get("ids")?.split(","));
    if (!ids.success) return { status: 400, body: { error: "validation" } };

    const { data, error } = await createServiceClient()
      .from("orders")
      .select("id,order_number,fulfillment,total_centavos,subtotal_centavos,delivery_fee_mode,location:locations(name),drop:drops(name)")
      .in("id", ids.data);
    if (error) throw error;

    const summaries = Object.fromEntries(data.map(order => [order.id, {
      number: order.order_number,
      fulfillment: order.fulfillment,
      amountCentavos: order.total_centavos ?? order.subtotal_centavos,
      deliveryFeeMode: order.delivery_fee_mode,
      sourceLabel: orderSourceLabel(order),
    }]));

    return { status: 200, body: summaries };
  });
}
