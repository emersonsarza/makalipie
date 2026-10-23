import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AdminAccessError } from "@/lib/admin/access";
import { adminFailure, readLimitedBody } from "@/lib/admin/http";
import { requireOwner } from "@/lib/admin/session";
import { SETTINGS_CACHE_CONTROL, SettingsCommandError, settingsCommandSchema } from "@/lib/admin/settings-v2";
import { commitAdminSettings, readAdminSettings } from "@/lib/admin/settings-v2-data";
import { ProductError } from "@/lib/products/store";

function settingsJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": SETTINGS_CACHE_CONTROL } });
}

function readFailure(error: unknown) {
  if (error instanceof SettingsCommandError || error instanceof AdminAccessError) return settingsJson({ error: error.message }, error.status);
  const response = adminFailure(error);
  response.headers.set("Cache-Control", SETTINGS_CACHE_CONTROL);
  return response;
}

function saveFailure(error: unknown) {
  if (error instanceof SettingsCommandError) return settingsJson({ ok: false, kind: error.kind, message: error.message }, error.status);
  if (error instanceof AdminAccessError) {
    return error.status === 401
      ? settingsJson({ error: error.message }, 401)
      : settingsJson({ ok: false, kind: "permission", message: error.message }, error.status);
  }
  if (error instanceof ZodError) return settingsJson({ ok: false, kind: "validation", message: error.issues[0]?.message || "Check the settings." }, 400);
  if (error instanceof ProductError) {
    const kind = error.status >= 500 ? "network" : error.status === 403 ? "permission" : error.status === 409 ? "conflict" : "validation";
    return settingsJson({ ok: false, kind, message: error.message }, error.status);
  }
  const response = adminFailure(error);
  response.headers.set("Cache-Control", SETTINGS_CACHE_CONTROL);
  return response;
}

async function readCommand(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ProductError(415, "Expected a JSON request.");
  const bytes = await readLimitedBody(request, 200_000);
  return settingsCommandSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
}

export async function GET() {
  try { return settingsJson(await readAdminSettings()); }
  catch (error) { return readFailure(error); }
}

export async function POST(request: Request) {
  try {
    await requireOwner();
    const result = await commitAdminSettings(request, await readCommand(request));
    revalidatePath("/", "layout");
    return settingsJson(result);
  } catch (error) { return saveFailure(error); }
}
