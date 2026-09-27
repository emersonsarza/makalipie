import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerFirebase } from "@/lib/firebase/server";
import { AdminAccessError, authorizeOwner } from "./access";

export const SESSION_COOKIE = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" ? "makalipie_demo_session" : "makalipie_admin_session";
export const SESSION_SECONDS = 60 * 60 * 12;
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};

export function isInvalidCredential(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : "";
  return typeof code === "string" && [
    "auth/argument-error", "auth/invalid-id-token", "auth/id-token-expired",
    "auth/id-token-revoked", "auth/session-cookie-expired", "auth/session-cookie-revoked",
    "auth/invalid-session-cookie", "auth/user-disabled", "auth/user-not-found",
  ].includes(code);
}

// Call from every protected page, route handler, and future server mutation.
// Deliberately not cached: membership and revocation are checked on each request.
export async function readOwnerSession(value: string | undefined) {
  if (!value) throw new AdminAccessError(401, "Please sign in to continue.");
  const { auth, db } = getServerFirebase();
  let token;
  try {
    token = await auth.verifySessionCookie(value, true);
  } catch (error) {
    if (isInvalidCredential(error)) throw new AdminAccessError(401, "Your session has ended. Please sign in again.");
    throw error;
  }
  const profile = await db.doc(`admins/${token.uid}`).get();
  return authorizeOwner(token.uid, profile.data());
}

export async function requireOwner() {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  return readOwnerSession(cookie);
}

export async function requireOwnerPage() {
  try {
    return await requireOwner();
  } catch (error) {
    if (error instanceof AdminAccessError) {
      redirect(`/admin/login?reason=${error.status === 403 ? "access" : "session"}`);
    }
    throw error;
  }
}
