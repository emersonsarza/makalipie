import { NextResponse } from "next/server";
import { z } from "zod";
import { readLimitedBody } from "@/lib/admin/http";
import { guestStatusRequestSchema } from "@/lib/orders/schema";
import { selectionSchema } from "@/lib/catalog/schema";
import { clockTimeSchema } from "@/lib/scheduling/schema";
import { readGuestEdit, reviseGuestOrder } from "@/lib/orders/store";
import { ProductError } from "@/lib/products/store";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Expected JSON." }, 415);
    const input = (z.object({ token: z.string().min(20).max(200), revision: z.string().length(64), selection: selectionSchema, slotId: clockTimeSchema }).strict()).parse(JSON.parse((await readLimitedBody(request, 30000)).toString("utf8")));
    return json(await reviseGuestOrder(input.token, input.revision, input.selection, input.slotId));
  } catch (error) {
    if (error instanceof ProductError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return json({ error: "Check your selections and reopen the edit link if needed." }, 400);
    return json({ error: "We couldn't save or load this order. Please try again." }, 503);
  }
}
