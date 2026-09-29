import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { readLimitedBody } from "@/lib/admin/http";
import { guestStatusRequestSchema } from "@/lib/orders/schema";
import { readGuestOrder } from "@/lib/orders/store";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Expected JSON." }, 415);
    const input = guestStatusRequestSchema.parse(JSON.parse((await readLimitedBody(request, 2_000)).toString("utf8")));
    const order = await readGuestOrder(input.token);
    if (!order) return json({ error: "This link doesn't match a request." }, 404);
    return json({ order });
  } catch (error) {
    if (error instanceof ZodError) return json({ error: "This link doesn't match a request." }, 404);
    return json({ error: "We couldn't open that request. Please try again." }, 503);
  }
}
