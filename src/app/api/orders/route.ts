import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { readLimitedBody } from "@/lib/admin/http";
import { ProductError } from "@/lib/products/store";
import { orderIntakeEnabled, orderRequestSchema } from "@/lib/orders/schema";
import { OrderAvailabilityError, submitOrder } from "@/lib/orders/store";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  try {
    if (!orderIntakeEnabled()) return json({ error: "Online requests are not open yet." }, 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Expected JSON." }, 415);
    const input = orderRequestSchema.parse(JSON.parse((await readLimitedBody(request, 30_000)).toString("utf8")));
    return json(await submitOrder(input));
  } catch (error) {
    if (error instanceof OrderAvailabilityError) {
      return json({ error: error.message, schedule: error.schedule, openDates: error.openDates, openProducts: error.openProducts, serverNow: error.serverNow }, 409);
    }
    if (error instanceof ProductError) return json({ error: error.message }, error.status);
    if (error instanceof ZodError) return json({ error: "Please check your name, contact, and selections." }, 400);
    return json({ error: "Could not submit your request. Please try again." }, 503);
  }
}
