import { NextResponse } from "next/server";
import { AdminAccessError } from "@/lib/admin/access";
import { adminFailure, readAdminJson } from "@/lib/admin/http";
import { ORDERS_CACHE_CONTROL, OrdersQueryError, orderCommandSchema } from "@/lib/admin/orders-v2";
import { commitAdminOrderCommand, readAdminOrdersList } from "@/lib/admin/orders-v2-data";
import { requireAdmin } from "@/lib/admin/session";

function ordersJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": ORDERS_CACHE_CONTROL } });
}

function failure(error: unknown) {
  if (error instanceof OrdersQueryError || error instanceof AdminAccessError) return ordersJson({ error: error.message, code: error instanceof OrdersQueryError ? error.code : "access" }, error.status);
  const response = adminFailure(error);
  response.headers.set("Cache-Control", ORDERS_CACHE_CONTROL);
  return response;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return ordersJson(await readAdminOrdersList({
      branch: url.searchParams.get("branch"),
      view: url.searchParams.get("view"),
      q: url.searchParams.get("q"),
      date: url.searchParams.get("date"),
      to: url.searchParams.get("to"),
      fulfillment: url.searchParams.get("fulfillment"),
      pay: url.searchParams.get("pay"),
      cursor: url.searchParams.get("cursor"),
      order: url.searchParams.get("order"),
    }));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    return ordersJson(await commitAdminOrderCommand(request, orderCommandSchema.parse(await readAdminJson(request))));
  } catch (error) {
    return failure(error);
  }
}
