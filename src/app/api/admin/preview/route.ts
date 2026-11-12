import { withOwner } from "../../../../lib/admin/session";
import { isTheme, loadCatalog } from "../../../../lib/storefront/load";
import { presentShop } from "../../../../lib/storefront/present";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const theme = new URL(request.url).searchParams.get("theme");
  if (!isTheme(theme)) {
    return Response.json({ error: "validation" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  return withOwner(request, async () => ({
    status: 200,
    body: presentShop(await loadCatalog(), new Date(), { theme, preview: true }),
  }));
}
