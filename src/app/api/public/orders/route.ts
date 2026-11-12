import { orderRateLimited, originAllowed } from "../../../../lib/orders/access";
import { applyOrderChange } from "../../../../lib/orders/change";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "cache-control": "no-store" };

export async function POST(request: Request) {
  if (!originAllowed(request)) return Response.json({ error: "forbidden_origin" }, { status: 403, headers });
  const limited = await orderRateLimited(request);
  if (limited === "error") return Response.json({ error: "temporary_failure" }, { status: 503, headers });
  if (limited) return Response.json({ error: "rate_limited" }, { status: 429, headers });
  const body: unknown = await request.json().catch(() => null);
  const result = await applyOrderChange("place_order", body, "public");
  return Response.json(result.body, { status: result.status, headers });
}
