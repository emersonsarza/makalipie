import { publicDropsWithStock, catalogForDrops, dropLocation } from "../../../../lib/drops/load";
import { cachedCatalog } from "@/lib/storefront/load";
import { presentDropDiscovery, presentDropList } from "../../../../lib/drops/present";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "cache-control": "no-store" };

export async function GET(request: Request) {
  const locationId = new URL(request.url).searchParams.get("location");
  try {
    if (locationId === null) {
      const [store, catalog] = await Promise.all([publicDropsWithStock(), cachedCatalog()]);
      return Response.json({ drops: presentDropDiscovery(store, catalog.locations, catalogForDrops(catalog)) }, { headers });
    }
    if (!locationId) return Response.json({ error: "validation" }, { status: 400, headers });
    const location = await dropLocation(locationId);
    if (!location) return Response.json({ error: "not_found" }, { status: 404, headers });
    return Response.json(presentDropList(await publicDropsWithStock(), location, new Date()), { headers });
  } catch {
    return Response.json({ error: "temporary_failure" }, { status: 503, headers });
  }
}
