import { withOwner } from "../../../../lib/admin/session";
import { lineup } from "../../../../lib/orders/query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "validation" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  return withOwner(request, async () => ({ status: 200, body: await lineup(date) }));
}
