import { publicDropsWithStock, catalogForDrops } from "../../../../../lib/drops/load";
import { presentDrop } from "../../../../../lib/drops/present";
import { cachedCatalog } from "../../../../../lib/storefront/load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "cache-control": "no-store" };

export async function GET(request: Request, context?: { params?: Promise<{ slug: string }> }) {
  const slug = context?.params ? (await context.params).slug : new URL(request.url).pathname.split("/").filter(Boolean).at(-1);
  if (!slug) return Response.json({ error: "not_found" }, { status: 404, headers });
  try {
    const [store, catalog] = await Promise.all([publicDropsWithStock(new Date(), slug), cachedCatalog()]);
    const drop = store.drops.find((item) => item.id === slug);
    const body = drop ? presentDrop(drop, catalogForDrops(catalog), new Date()) : null;
    if (!body) return Response.json({ error: "not_found" }, { status: 404, headers });
    return Response.json(body, { headers });
  } catch {
    return Response.json({ error: "temporary_failure" }, { status: 503, headers });
  }
}
