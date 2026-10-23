import { NextResponse } from "next/server";
import { AdminAccessError } from "@/lib/admin/access";
import { adminFailure } from "@/lib/admin/http";
import { ORDERS_CACHE_CONTROL, OrdersQueryError } from "@/lib/admin/orders-v2";
import { readAdminOrderDetail } from "@/lib/admin/orders-v2-data";

function ordersJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": ORDERS_CACHE_CONTROL } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return ordersJson(await readAdminOrderDetail(id));
  } catch (error) {
    if (error instanceof OrdersQueryError || error instanceof AdminAccessError) {
      return ordersJson({ error: error.message, code: error instanceof OrdersQueryError ? error.code : "access" }, error.status);
    }
    const response = adminFailure(error);
    response.headers.set("Cache-Control", ORDERS_CACHE_CONTROL);
    return response;
  }
}
