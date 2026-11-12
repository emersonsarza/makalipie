import { cachedCatalog } from "../../../../lib/storefront/load";
import { presentShop } from "../../../../lib/storefront/present";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const body = presentShop(await cachedCatalog(), new Date());
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "temporary_failure" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
