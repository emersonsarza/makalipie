import { revalidatePath } from "next/cache";
import { adminFailure, adminJson, authorizeMutation, readAdminJson } from "@/lib/admin/http";
import { shopSettingsSchema } from "@/lib/settings/schema";
import { getServerFirebase } from "@/lib/firebase/server";
import { forget, publicCacheKeys } from "@/lib/public-cache";
export async function POST(request: Request) {
  try {
    const owner = await authorizeMutation(request);
    const settings = shopSettingsSchema.parse(await readAdminJson(request));
    await getServerFirebase().db.doc("settings/shop").set({ ...settings, updatedBy: owner.uid, updatedAt: new Date().toISOString() }, { merge: true });
    forget(publicCacheKeys.shop);
    revalidatePath("/", "layout");
    return adminJson({ settings });
  } catch (error) { return adminFailure(error); }
}
