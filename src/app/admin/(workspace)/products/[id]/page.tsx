import { notFound, redirect } from "next/navigation";
import { requireOwnerPage } from "@/lib/admin/session";
import { findProduct } from "@/lib/products/store";
import { productIdSchema } from "@/lib/products/schema";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwnerPage();
  const id = productIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const product = await findProduct(id.data);
  if (!product) notFound();
  redirect(`/admin/catalog?product=${encodeURIComponent(product.id)}&tab=details`);
}
