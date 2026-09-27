import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AdminAccessError, isAllowedMutationOrigin } from "./access";
import { requireOwner, isInvalidCredential } from "./session";
import { ProductError } from "@/lib/products/store";

export function adminJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
export async function authorizeMutation(request: Request) {
  if (!isAllowedMutationOrigin(request, process.env.ADMIN_APP_ORIGIN ?? "")) throw new AdminAccessError(403, "This request is not allowed. Reload the page and try again.");
  return requireOwner();
}
export async function readLimitedBody(request: Request, maxBytes: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new ProductError(400, "The request is empty.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new ProductError(413, "The file or request is too large."); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function readAdminJson(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ProductError(415, "Expected a JSON request.");
  const bytes = await readLimitedBody(request, 20_000);
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { throw new ProductError(400, "The request could not be read."); }
}
export function adminFailure(error: unknown) {
  if (error instanceof AdminAccessError || error instanceof ProductError) return adminJson({ error: error.message }, error.status);
  if (isInvalidCredential(error)) return adminJson({ error: "Your session ended. Please sign in again." }, 401);
  if (error instanceof ZodError) return adminJson({ error: "Please check the highlighted fields.", fields: Object.fromEntries(error.issues.map((issue) => [issue.path.join("."), issue.message])) }, 400);
  console.error("Admin product operation failed.");
  return adminJson({ error: "We couldn’t complete that change. Your edits are still here. Please try again." }, 503);
}
