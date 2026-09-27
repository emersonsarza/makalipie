import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/admin/session";
import { adminFailure, adminJson, authorizeMutation, readLimitedBody } from "@/lib/admin/http";
import { productIdSchema } from "@/lib/products/schema";
import { ProductError } from "@/lib/products/store";
import { productCatalogSchema, addonWriteSchema } from "@/lib/catalog/schema";
import { initializeCatalog, readCatalog, saveAddon, saveProductCatalog } from "@/lib/catalog/store";
const schema = z.discriminatedUnion("action", [z.object({ action: z.literal("initialize") }).strict(), z.object({ action: z.literal("product"), id: productIdSchema, fields: productCatalogSchema }).strict(), z.object({ action: z.literal("addon"), addon: addonWriteSchema }).strict()]);
export async function GET() { try { await requireOwner(); return adminJson(await readCatalog()); } catch(e) { return adminFailure(e); } }
export async function POST(request: Request) {
  try {
    const owner = await authorizeMutation(request);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ProductError(415, "Expected JSON.");
    let body; try { body = JSON.parse((await readLimitedBody(request, 60_000)).toString()); } catch(e) { if (e instanceof ProductError) throw e; throw new ProductError(400, "Invalid request."); }
    const input = schema.parse(body);
    if (input.action === "initialize") await initializeCatalog(owner.uid);
    if (input.action === "product") await saveProductCatalog(input.id, input.fields, owner.uid);
    if (input.action === "addon") await saveAddon(input.addon.id, input.addon.fields, input.addon.version);
    for (const path of ["/", "/menu", "/order", "/admin/catalog"]) revalidatePath(path);
    return adminJson(await readCatalog());
  } catch(e) { return adminFailure(e); }
}
