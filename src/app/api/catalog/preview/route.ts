import { NextResponse } from "next/server";
import { selectionSchema } from "@/lib/catalog/schema";
import { quoteSelection } from "@/lib/catalog/rules";
import { readPublicMenu } from "@/lib/products/public";
import { readLimitedBody } from "@/lib/admin/http";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Expected JSON." }, 415);
    const input = selectionSchema.safeParse(JSON.parse((await readLimitedBody(request, 30_000)).toString()));
    if (!input.success) return json({ error: "Please check your product selections and date." }, 400);
    const { catalog } = await readPublicMenu();
    if (!catalog) return json({ error: "The menu is temporarily unavailable. Please try again." }, 503);
    const quote = quoteSelection(catalog, input.data);
    return quote.errors.length ? json({ error: quote.errors.join(" ") }, 400) : json(quote);
  } catch { return json({ error: "Could not check your selections. Please try again." }, 400); }
}
