import { withOwner } from "../../../../../lib/admin/session";
import { catalogForDrops, loadDrops } from "../../../../../lib/drops/load";
import { presentDrop } from "../../../../../lib/drops/present";
import { loadCatalog } from "../../../../../lib/storefront/load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) return Response.json({ error: "validation" }, { status: 400, headers: { "cache-control": "no-store" } });
  return withOwner(request, async () => {
    const [store, catalog] = await Promise.all([loadDrops(), loadCatalog()]);
    const drop = store.drops.find((item) => item.id === slug);
    if (!drop) return { status: 404, body: { error: "not_found" } };
    return { status: 200, body: presentDrop(drop, catalogForDrops(catalog), new Date(), { preview: true }) };
  });
}
