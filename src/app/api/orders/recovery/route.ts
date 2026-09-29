import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { readLimitedBody } from "@/lib/admin/http";
import { recoveryDraftRequestSchema } from "@/lib/orders/schema";
import { readRecoveryDraft } from "@/lib/orders/store";
import { ProductError } from "@/lib/products/store";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Expected JSON." }, 415);
    const input = recoveryDraftRequestSchema.parse(JSON.parse((await readLimitedBody(request, 2_000)).toString("utf8")));
    const draft = await readRecoveryDraft(input.token);
    if (!draft) return json({ error: "This link doesn't match a request." }, 404);
    return json({ draft });
  } catch (error) {
    if (error instanceof ProductError) return json({ error: error.message }, error.status);
    if (error instanceof ZodError) return json({ error: "This link doesn't match a request." }, 404);
    return json({ error: "We couldn't open that request. Please try again." }, 503);
  }
}
