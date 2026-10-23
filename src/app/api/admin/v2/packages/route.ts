import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AdminAccessError } from "@/lib/admin/access";
import { adminFailure, readLimitedBody } from "@/lib/admin/http";
import { PACKAGES_CACHE_CONTROL, PackageCommandError, packageCommandSchema } from "@/lib/admin/packages-v2";
import { commitAdminPackages, readAdminPackages } from "@/lib/admin/packages-v2-data";
import { requireOwner } from "@/lib/admin/session";
import { ProductError } from "@/lib/products/store";

function packagesJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": PACKAGES_CACHE_CONTROL } });
}

function readFailure(error: unknown) {
  if (error instanceof PackageCommandError || error instanceof AdminAccessError) return packagesJson({ error: error.message }, error.status);
  const response = adminFailure(error);
  response.headers.set("Cache-Control", PACKAGES_CACHE_CONTROL);
  return response;
}

function saveFailure(error: unknown) {
  if (error instanceof PackageCommandError) return packagesJson({ ok: false, kind: error.kind, message: error.message }, error.status);
  if (error instanceof AdminAccessError) {
    return error.status === 401
      ? packagesJson({ error: error.message }, 401)
      : packagesJson({ ok: false, kind: "permission", message: error.message }, error.status);
  }
  if (error instanceof ZodError) return packagesJson({ ok: false, kind: "validation", message: error.issues[0]?.message || "Check the package." }, 400);
  if (error instanceof ProductError) {
    const kind = error.status >= 500 ? "network" : error.status === 403 ? "permission" : error.status === 409 ? "conflict" : "validation";
    return packagesJson({ ok: false, kind, message: error.message }, error.status);
  }
  const response = adminFailure(error);
  response.headers.set("Cache-Control", PACKAGES_CACHE_CONTROL);
  return response;
}

async function readCommand(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ProductError(415, "Expected a JSON request.");
  const bytes = await readLimitedBody(request, 100_000);
  return packageCommandSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
}

export async function GET() {
  try { return packagesJson(await readAdminPackages()); }
  catch (error) { return readFailure(error); }
}

export async function POST(request: Request) {
  try {
    await requireOwner();
    return packagesJson(await commitAdminPackages(request, await readCommand(request)));
  } catch (error) { return saveFailure(error); }
}
