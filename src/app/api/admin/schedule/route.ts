import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/admin/session";
import { adminFailure, adminJson, authorizeMutation, readAdminJson } from "@/lib/admin/http";
import { scheduleSettingsSchema } from "@/lib/scheduling/schema";
import { readScheduleSettings, saveScheduleSettings } from "@/lib/scheduling/store";
export async function GET() {
  try { await requireOwner(); return adminJson({ settings: await readScheduleSettings() }); }
  catch (e) { return adminFailure(e); }
}
export async function POST(request: Request) {
  try {
    const owner = await authorizeMutation(request);
    await saveScheduleSettings(scheduleSettingsSchema.parse(await readAdminJson(request)), owner.uid);
    revalidatePath("/order"); revalidatePath("/admin/schedule");
    return adminJson({ settings: await readScheduleSettings() });
  } catch (e) { return adminFailure(e); }
}
