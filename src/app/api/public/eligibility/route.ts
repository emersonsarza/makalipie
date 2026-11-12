import { cachedCatalog } from "../../../../lib/storefront/load";
import { presentEligibility } from "../../../../lib/storefront/present";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const locationId = new URL(request.url).searchParams.get("location");
  if (!locationId) return Response.json({ error: "validation" }, { status: 400, headers: { "cache-control": "no-store" } });
  try {
    const body = presentEligibility(await cachedCatalog(), locationId, new Date());
    if (!body) return Response.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } });
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "temporary_failure" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
