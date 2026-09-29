import { NextRequest, NextResponse } from "next/server";
import { getServerFirebase } from "@/lib/firebase/server";
import { AdminAccessError, assertRecentSignIn, authorizeAdmin, isAllowedMutationOrigin } from "@/lib/admin/access";
import { sessionRequestSchema } from "@/lib/admin/schemas";
import { isInvalidCredential, readAdminSession, SESSION_COOKIE, SESSION_SECONDS, sessionCookieOptions } from "@/lib/admin/session";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function failure(error: unknown) {
  if (error instanceof AdminAccessError) return json({ error: error.message }, error.status);
  if (isInvalidCredential(error)) return json({ error: "Please sign in again to continue." }, 401);
  // No token, customer data, or service-account details in responses/logs.
  console.error("Admin authentication service unavailable.");
  return json({ error: "Sign-in is temporarily unavailable. Please try again shortly." }, 503);
}

export async function GET(request: NextRequest) {
  try {
    const admin = await readAdminSession(request.cookies.get(SESSION_COOKIE)?.value);
    return json({ user: { displayName: admin.displayName, role: admin.role } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  if (!isAllowedMutationOrigin(request, process.env.ADMIN_APP_ORIGIN ?? "")) {
    return json({ error: "This request is not allowed. Reload the sign-in page and try again." }, 403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return json({ error: "Expected a sign-in request." }, 415);
  }
  // Stream-limit the body as Content-Length cannot be trusted.
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "Missing sign-in request." }, 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  let body: unknown;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 18000) {
        await reader.cancel();
        return json({ error: "Sign-in request is too large." }, 413);
      }
      chunks.push(value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return json({ error: "Invalid sign-in request." }, 400);
  }
  const parsed = sessionRequestSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid sign-in request." }, 400);
  try {
    const { auth, db } = getServerFirebase();
    const token = await auth.verifyIdToken(parsed.data.idToken, true);
    assertRecentSignIn(token.auth_time);
    const profile = await db.doc(`admins/${token.uid}`).get();
    authorizeAdmin(token.uid, profile.data());
    const cookie = await auth.createSessionCookie(parsed.data.idToken, { expiresIn: SESSION_SECONDS * 1000 });
    const response = json({ ok: true });
    response.cookies.set(SESSION_COOKIE, cookie, { ...sessionCookieOptions, maxAge: SESSION_SECONDS });
    return response;
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAllowedMutationOrigin(request, process.env.ADMIN_APP_ORIGIN ?? "")) {
    return json({ error: "This request is not allowed." }, 403);
  }
  // Clearing an expired or revoked session must still work.
  const response = json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
