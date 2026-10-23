import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AdminAccessError } from "@/lib/admin/access";
import { BRANCHES_CACHE_CONTROL, BranchCommandError, BranchQueryError, branchCommandSchema } from "@/lib/admin/branches-v2";
import { commitAdminBranches, readAdminBranches } from "@/lib/admin/branches-v2-data";
import { adminFailure, readLimitedBody } from "@/lib/admin/http";
import { requireOwner } from "@/lib/admin/session";
import { ProductError } from "@/lib/products/store";

function branchesJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": BRANCHES_CACHE_CONTROL } });
}

function readFailure(error: unknown) {
  if (error instanceof BranchQueryError || error instanceof BranchCommandError || error instanceof AdminAccessError) return branchesJson({ error: error.message }, error.status);
  const response = adminFailure(error);
  response.headers.set("Cache-Control", BRANCHES_CACHE_CONTROL);
  return response;
}

function saveFailure(error: unknown) {
  if (error instanceof BranchCommandError) return branchesJson({ ok: false, kind: error.kind, message: error.message }, error.status);
  if (error instanceof BranchQueryError) return branchesJson({ ok: false, kind: "conflict", message: error.message }, error.status);
  if (error instanceof AdminAccessError) {
    return error.status === 401
      ? branchesJson({ error: error.message }, 401)
      : branchesJson({ ok: false, kind: "permission", message: error.message }, error.status);
  }
  if (error instanceof ZodError) return branchesJson({ ok: false, kind: "validation", message: error.issues[0]?.message || "Check the branch." }, 400);
  if (error instanceof ProductError) {
    const kind = error.status >= 500 ? "network" : error.status === 403 ? "permission" : error.status === 409 ? "conflict" : "validation";
    return branchesJson({ ok: false, kind, message: error.message }, error.status);
  }
  const response = adminFailure(error);
  response.headers.set("Cache-Control", BRANCHES_CACHE_CONTROL);
  return response;
}

async function readCommand(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ProductError(415, "Expected a JSON request.");
  const bytes = await readLimitedBody(request, 80_000);
  return branchCommandSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
}

export async function GET() {
  try { return branchesJson(await readAdminBranches()); }
  catch (error) { return readFailure(error); }
}

export async function POST(request: Request) {
  try {
    await requireOwner();
    const result = await commitAdminBranches(request, await readCommand(request));
    revalidatePath("/order");
    revalidatePath("/v1/branches");
    return branchesJson(result);
  } catch (error) { return saveFailure(error); }
}
