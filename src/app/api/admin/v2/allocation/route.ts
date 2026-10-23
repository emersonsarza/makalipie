import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AdminAccessError } from "@/lib/admin/access";
import { ALLOCATION_CACHE_CONTROL, AllocationCommandError, AllocationQueryError, allocationCommandSchema } from "@/lib/admin/allocation-v2";
import { commitAdminAllocation, readAdminAllocation } from "@/lib/admin/allocation-v2-data";
import { adminFailure, readLimitedBody } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { ProductError } from "@/lib/products/store";

function allocationJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": ALLOCATION_CACHE_CONTROL } });
}

function readFailure(error: unknown) {
  if (error instanceof AllocationQueryError || error instanceof AdminAccessError || error instanceof AllocationCommandError) {
    return allocationJson({ error: error.message }, error.status);
  }
  const response = adminFailure(error);
  response.headers.set("Cache-Control", ALLOCATION_CACHE_CONTROL);
  return response;
}

function saveFailure(error: unknown) {
  if (error instanceof AllocationCommandError) {
    return allocationJson({ ok: false, kind: error.kind, message: error.message, ...(error.fields ? { fields: error.fields } : {}) }, error.status);
  }
  if (error instanceof AllocationQueryError) return allocationJson({ ok: false, kind: "validation", message: error.message }, 400);
  if (error instanceof AdminAccessError) {
    return error.status === 401
      ? allocationJson({ error: error.message }, 401)
      : allocationJson({ ok: false, kind: "permission", message: error.message }, error.status);
  }
  if (error instanceof ZodError) return allocationJson({ ok: false, kind: "validation", message: "Check the allocation change.", fields: Object.fromEntries(error.issues.map((issue) => [issue.path.join("."), issue.message])) }, 400);
  if (error instanceof ProductError) {
    const kind = error.status >= 500 ? "network" : error.status === 403 ? "permission" : "validation";
    return allocationJson({ ok: false, kind, message: error.message }, error.status);
  }
  const response = adminFailure(error);
  response.headers.set("Cache-Control", ALLOCATION_CACHE_CONTROL);
  return response;
}

async function readCommand(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ProductError(415, "Expected a JSON request.");
  const bytes = await readLimitedBody(request, 80_000);
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { throw new ProductError(400, "The request could not be read."); }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return allocationJson(await readAdminAllocation({ branch: url.searchParams.get("branch"), date: url.searchParams.get("date") }));
  } catch (error) {
    return readFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    return allocationJson(await commitAdminAllocation(request, allocationCommandSchema.parse(await readCommand(request))));
  } catch (error) {
    return saveFailure(error);
  }
}
