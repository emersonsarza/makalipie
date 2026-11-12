import { assetManifest } from "@/lib/storefront/images";
import { withOwner } from "../../../../lib/admin/session";
import { applyCatalogChange } from "../../../../lib/storefront/change";
import { loadCatalog } from "../../../../lib/storefront/load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return withOwner(request, async () => ({ status: 200, body: { ...await loadCatalog(), imagePaths: assetManifest() } }));
}

export function POST(request: Request) {
  return withOwner(request, async () => {
    const body: unknown = await request.json().catch(() => null);
    const record = typeof body === "object" && body !== null ? body as { action?: unknown; payload?: unknown } : {};
    return applyCatalogChange(record.action, record.payload);
  }, { mutation: true });
}
