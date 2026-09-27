import { revalidatePath } from "next/cache";
import { adminFailure, adminJson, authorizeMutation, readAdminJson } from "@/lib/admin/http";
import { productIdSchema, updateProductSchema } from "@/lib/products/schema";
import { ProductError, saveProduct } from "@/lib/products/store";

export const runtime = "nodejs";
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await authorizeMutation(request);
    const id = productIdSchema.parse((await params).id);
    const { version, ...fields } = updateProductSchema.parse(await readAdminJson(request));
    if (fields.slug !== id) throw new ProductError(400, "An existing product link cannot be changed.");
    const product = await saveProduct(fields, owner.uid, version);
    for (const path of ["/", "/menu", "/order", "/admin/catalog"]) revalidatePath(path);
    return adminJson({ product });
  } catch (error) { return adminFailure(error); }
}
