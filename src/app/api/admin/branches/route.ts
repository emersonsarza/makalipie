import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/admin/session";
import { adminFailure, adminJson, authorizeMutation, readLimitedBody } from "@/lib/admin/http";
import { readCatalog } from "@/lib/catalog/store";
import { ProductError } from "@/lib/products/store";
import { parseBranchSettings } from "@/lib/branches/schema";
import { readBranchSettings, saveBranchSettings } from "@/lib/branches/store";

export async function GET() {
  try {
    await requireOwner();
    const [settings, catalog] = await Promise.all([readBranchSettings(), readCatalog()]);
    return adminJson({ settings, catalog });
  } catch (e) { return adminFailure(e); }
}
export async function POST(request: Request) {
  try {
    const owner = await authorizeMutation(request);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ProductError(415, "Expected JSON.");
    let body: unknown;
    try { body = JSON.parse((await readLimitedBody(request, 400_000)).toString()); }
    catch (e) { if (e instanceof ProductError) throw e; throw new ProductError(400, "Invalid request."); }
    await saveBranchSettings(parseBranchSettings(body), owner.uid);
    revalidatePath("/order"); revalidatePath("/admin/branches");
    return adminJson({ settings: await readBranchSettings() });
  } catch (e) { return adminFailure(e); }
}
