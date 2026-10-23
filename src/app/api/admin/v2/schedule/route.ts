import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AdminAccessError } from "@/lib/admin/access";
import { adminFailure, readLimitedBody } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { SCHEDULE_CACHE_CONTROL, ScheduleCommandError, ScheduleQueryError, scheduleCommandSchema } from "@/lib/admin/schedule-v2";
import { commitAdminSchedule, readAdminSchedule } from "@/lib/admin/schedule-v2-data";
import { ProductError } from "@/lib/products/store";

function scheduleJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": SCHEDULE_CACHE_CONTROL } });
}

function readFailure(error: unknown) {
  if (error instanceof ScheduleQueryError || error instanceof ScheduleCommandError || error instanceof AdminAccessError) return scheduleJson({ error: error.message }, error.status);
  const response = adminFailure(error);
  response.headers.set("Cache-Control", SCHEDULE_CACHE_CONTROL);
  return response;
}

function saveFailure(error: unknown) {
  if (error instanceof ScheduleCommandError) return scheduleJson({ ok: false, kind: error.kind, message: error.message }, error.status);
  if (error instanceof ScheduleQueryError) {
    const kind = error.status === 404 ? "conflict" : "validation";
    return scheduleJson({ ok: false, kind, message: error.message }, error.status);
  }
  if (error instanceof AdminAccessError) {
    return error.status === 401
      ? scheduleJson({ error: error.message }, 401)
      : scheduleJson({ ok: false, kind: "permission", message: error.message }, error.status);
  }
  if (error instanceof ZodError) return scheduleJson({ ok: false, kind: "validation", message: error.issues[0]?.message || "Check the schedule." }, 400);
  if (error instanceof ProductError) {
    const kind = error.status >= 500 ? "network" : error.status === 403 ? "permission" : error.status === 409 ? "conflict" : "validation";
    return scheduleJson({ ok: false, kind, message: error.message }, error.status);
  }
  const response = adminFailure(error);
  response.headers.set("Cache-Control", SCHEDULE_CACHE_CONTROL);
  return response;
}

async function readCommand(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ProductError(415, "Expected a JSON request.");
  const bytes = await readLimitedBody(request, 80_000);
  return scheduleCommandSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
}

export async function GET(request: Request) {
  try {
    const branch = new URL(request.url).searchParams.get("branch");
    return scheduleJson(await readAdminSchedule(branch));
  } catch (error) { return readFailure(error); }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const result = await commitAdminSchedule(request, await readCommand(request));
    revalidatePath("/order");
    revalidatePath("/v1/schedule");
    return scheduleJson(result);
  } catch (error) { return saveFailure(error); }
}
