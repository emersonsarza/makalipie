import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/admin/session";
import { adminFailure, adminJson, authorizeMutation, readAdminJson } from "@/lib/admin/http";
import { productFieldsSchema } from "@/lib/products/schema";
import { listProducts, saveProduct } from "@/lib/products/store";

export const runtime = "nodejs";
export async function GET() {
  try { await requireOwner(); return adminJson(await listProducts()); }
  catch (error) { return adminFailure(error); }
}
export async function POST(request: Request) {
  try {
    const owner = await authorizeMutation(request);
    const product = await saveProduct(productFieldsSchema.parse(await readAdminJson(request)), owner.uid);
    for (const path of ["/", "/menu", "/order", "/admin/catalog"]) revalidatePath(path);
    return adminJson({ product }, 201);
  } catch (error) { return adminFailure(error); }
}
