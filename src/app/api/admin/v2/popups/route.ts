import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AdminAccessError } from "@/lib/admin/access";
import { adminFailure, readLimitedBody } from "@/lib/admin/http";
import { POPUPS_CACHE_CONTROL, PopupCommandError, popupCommandSchema } from "@/lib/admin/popups-v2";
import { commitAdminPopups, readAdminPopups } from "@/lib/admin/popups-v2-data";
import { requireOwner } from "@/lib/admin/session";
import { ProductError } from "@/lib/products/store";

function popupsJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": POPUPS_CACHE_CONTROL } });
}

function readFailure(error: unknown) {
  if (error instanceof PopupCommandError || error instanceof AdminAccessError) return popupsJson({ error: error.message }, error.status);
  const response = adminFailure(error);
  response.headers.set("Cache-Control", POPUPS_CACHE_CONTROL);
  return response;
}

function saveFailure(error: unknown) {
  if (error instanceof PopupCommandError) return popupsJson({ ok: false, kind: error.kind, message: error.message }, error.status);
  if (error instanceof AdminAccessError) {
    return error.status === 401
      ? popupsJson({ error: error.message }, 401)
      : popupsJson({ ok: false, kind: "permission", message: error.message }, error.status);
  }
  if (error instanceof ZodError) return popupsJson({ ok: false, kind: "validation", message: error.issues[0]?.message || "Check the pop-up listing." }, 400);
  if (error instanceof ProductError) {
    const kind = error.status >= 500 ? "network" : error.status === 403 ? "permission" : error.status === 409 ? "conflict" : "validation";
    return popupsJson({ ok: false, kind, message: error.message }, error.status);
  }
  const response = adminFailure(error);
  response.headers.set("Cache-Control", POPUPS_CACHE_CONTROL);
  return response;
}

async function readCommand(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ProductError(415, "Expected a JSON request.");
  const bytes = await readLimitedBody(request, 40_000);
  return popupCommandSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
}

export async function GET() {
  try { return popupsJson(await readAdminPopups()); }
  catch (error) { return readFailure(error); }
}

export async function POST(request: Request) {
  try {
    await requireOwner();
    const result = await commitAdminPopups(request, await readCommand(request));
    revalidatePath("/");
    revalidatePath("/v1/popups");
    return popupsJson(result);
  } catch (error) { return saveFailure(error); }
}
