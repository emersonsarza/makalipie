import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AdminAccessError } from "@/lib/admin/access";
import { adminFailure, readLimitedBody } from "@/lib/admin/http";
import { KITCHEN_CACHE_CONTROL, KitchenCommandError, KitchenQueryError, kitchenCommandSchema } from "@/lib/admin/kitchen-v2";
import { commitAdminKitchen, readAdminKitchen } from "@/lib/admin/kitchen-v2-data";
import { requireAdmin } from "@/lib/admin/session";
import { ProductError } from "@/lib/products/store";

function kitchenJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": KITCHEN_CACHE_CONTROL } });
}

function readFailure(error: unknown) {
  if (error instanceof KitchenQueryError || error instanceof KitchenCommandError || error instanceof AdminAccessError) return kitchenJson({ error: error.message }, error.status);
  const response = adminFailure(error);
  response.headers.set("Cache-Control", KITCHEN_CACHE_CONTROL);
  return response;
}

function saveFailure(error: unknown) {
  if (error instanceof KitchenCommandError) return kitchenJson({ ok: false, kind: error.kind, message: error.message }, error.status);
  if (error instanceof KitchenQueryError) return kitchenJson({ ok: false, kind: "validation", message: error.message }, error.status);
  if (error instanceof AdminAccessError) {
    return error.status === 401
      ? kitchenJson({ error: error.message }, 401)
      : kitchenJson({ ok: false, kind: "permission", message: error.message }, error.status);
  }
  if (error instanceof ZodError) return kitchenJson({ ok: false, kind: "validation", message: error.issues[0]?.message || "Check the kitchen update." }, 400);
  if (error instanceof ProductError) {
    const kind = error.status >= 500 ? "network" : error.status === 403 ? "permission" : error.status === 409 ? "conflict" : "validation";
    return kitchenJson({ ok: false, kind, message: error.message }, error.status);
  }
  const response = adminFailure(error);
  response.headers.set("Cache-Control", KITCHEN_CACHE_CONTROL);
  return response;
}

async function readCommand(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ProductError(415, "Expected a JSON request.");
  const bytes = await readLimitedBody(request, 20_000);
  return kitchenCommandSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return kitchenJson(await readAdminKitchen(url.searchParams.get("branch"), url.searchParams.get("date")));
  } catch (error) { return readFailure(error); }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const result = await commitAdminKitchen(request, await readCommand(request));
    revalidatePath("/order");
    return kitchenJson(result);
  } catch (error) { return saveFailure(error); }
}
