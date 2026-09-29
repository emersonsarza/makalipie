import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/admin/session";
import { adminFailure, adminJson, authorizeMutation, readLimitedBody } from "@/lib/admin/http";
import { ProductError } from "@/lib/products/store";
import { parsePopupSettings } from "@/lib/popups/schema";
import { readPopupSettings, savePopupSettings } from "@/lib/popups/store";

export async function GET() {
  try {
    await requireOwner();
    return adminJson({ settings: await readPopupSettings() });
  } catch (e) { return adminFailure(e); }
}

export async function POST(request: Request) {
  try {
    const owner = await authorizeMutation(request);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ProductError(415, "Expected JSON.");
    let body: unknown;
    try { body = JSON.parse((await readLimitedBody(request, 200_000)).toString()); }
    catch (e) { if (e instanceof ProductError) throw e; throw new ProductError(400, "Invalid request."); }
    await savePopupSettings(parsePopupSettings(body), owner.uid);
    revalidatePath("/");
    revalidatePath("/admin/popups");
    return adminJson({ settings: await readPopupSettings() });
  } catch (e) { return adminFailure(e); }
}
