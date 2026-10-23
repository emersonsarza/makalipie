import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AdminAccessError } from "@/lib/admin/access";
import { CATALOG_CACHE_CONTROL, CatalogCommandError, catalogCommandSchema } from "@/lib/admin/catalog-v2";
import { commitAdminCatalog, readAdminCatalog } from "@/lib/admin/catalog-v2-data";
import { adminFailure, readLimitedBody } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { ProductError } from "@/lib/products/store";

function catalogJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": CATALOG_CACHE_CONTROL } });
}

function readFailure(error: unknown) {
  if (error instanceof CatalogCommandError || error instanceof AdminAccessError) return catalogJson({ error: error.message }, error.status);
  const response = adminFailure(error);
  response.headers.set("Cache-Control", CATALOG_CACHE_CONTROL);
  return response;
}

function saveFailure(error: unknown) {
  if (error instanceof CatalogCommandError) return catalogJson({ ok: false, kind: error.kind, message: error.message }, error.status);
  if (error instanceof AdminAccessError) {
    return error.status === 401
      ? catalogJson({ error: error.message }, 401)
      : catalogJson({ ok: false, kind: "permission", message: error.message }, error.status);
  }
  if (error instanceof ZodError) return catalogJson({ ok: false, kind: "validation", message: "Check the catalog item." }, 400);
  if (error instanceof ProductError) {
    const kind = error.status >= 500 ? "network" : error.status === 403 ? "permission" : error.status === 409 ? "conflict" : "validation";
    return catalogJson({ ok: false, kind, message: error.message }, error.status);
  }
  const response = adminFailure(error);
  response.headers.set("Cache-Control", CATALOG_CACHE_CONTROL);
  return response;
}

async function readCommand(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ProductError(415, "Expected a JSON request.");
  const bytes = await readLimitedBody(request, 80_000);
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { throw new ProductError(400, "The request could not be read."); }
}

export async function GET() {
  try {
    return catalogJson(await readAdminCatalog());
  } catch (error) {
    return readFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    return catalogJson(await commitAdminCatalog(request, catalogCommandSchema.parse(await readCommand(request))));
  } catch (error) {
    return saveFailure(error);
  }
}
