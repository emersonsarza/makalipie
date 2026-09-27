import { revalidatePath } from "next/cache";
import { adminFailure, adminJson, authorizeMutation } from "@/lib/admin/http";
import { importProducts, listProducts } from "@/lib/products/store";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const owner = await authorizeMutation(request);
    await importProducts(owner.uid);
    for (const path of ["/", "/menu", "/order", "/admin/catalog"]) revalidatePath(path);
    return adminJson(await listProducts());
  } catch (error) { return adminFailure(error); }
}
