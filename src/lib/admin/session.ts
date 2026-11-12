import type { Session } from "@supabase/supabase-js";
import { createAuthClient, createServiceClient } from "./supabase";

export const REFRESH_COOKIE = "mp_refresh";
const REFRESH_MAX_AGE = 60 * 60 * 24 * 400;
const ATTEMPT_LIMIT = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

type Allowlist = true | false | "error";

export async function signIn(request: Request): Promise<Response> {
  if (!originAllowed(request)) return json(request, 403, { error: "forbidden_origin" });
  const limited = await rateLimited(clientAddress(request));
  if (limited === "error") return json(request, 503, { error: "temporary_failure" });
  if (limited) return json(request, 429, { error: "rate_limited" });

  const body = await readJson(request);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email.includes("@") || email.length > 320 || !password) {
    return json(request, 400, { error: "invalid_request" });
  }

  const signedIn = await createAuthClient().auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session?.user.email) {
    return json(request, 401, { error: "invalid_credentials" });
  }
  return acceptSession(request, signedIn.data.session);
}

export async function refresh(request: Request): Promise<Response> {
  if (!originAllowed(request)) return json(request, 403, { error: "forbidden_origin" });
  const current = readCookie(request, REFRESH_COOKIE);
  if (!current) return json(request, 401, { error: "unauthenticated" }, null);
  const refreshed = await createAuthClient().auth.refreshSession({ refresh_token: current });
  if (refreshed.error || !refreshed.data.session?.user.email) {
    return json(request, 401, { error: "unauthenticated" }, null);
  }
  return acceptSession(request, refreshed.data.session);
}

export async function readSession(request: Request): Promise<Response> {
  const current = readCookie(request, REFRESH_COOKIE);
  if (!current) return json(request, 401, { error: "unauthenticated" });
  const refreshed = await createAuthClient().auth.refreshSession({ refresh_token: current });
  if (refreshed.error || !refreshed.data.session?.user.email) {
    return json(request, 401, { error: "unauthenticated" }, null);
  }
  return acceptSession(request, refreshed.data.session);
}

export async function signOut(request: Request): Promise<Response> {
  if (!originAllowed(request)) return json(request, 403, { error: "forbidden_origin" });
  const current = readCookie(request, REFRESH_COOKIE);
  if (current) {
    const refreshed = await createAuthClient().auth.refreshSession({ refresh_token: current });
    const accessToken = refreshed.data.session?.access_token;
    if (accessToken) await createServiceClient().auth.admin.signOut(accessToken, "global");
  }
  return json(request, 200, { ok: true }, null);
}

export async function changePassword(request: Request): Promise<Response> {
  if (!originAllowed(request)) return json(request, 403, { error: "forbidden_origin" });
  const current = readCookie(request, REFRESH_COOKIE);
  if (!current) return json(request, 401, { error: "unauthenticated" }, null);
  const refreshed = await createAuthClient().auth.refreshSession({ refresh_token: current });
  const session = refreshed.data.session;
  if (refreshed.error || !session?.user.email) {
    return json(request, 401, { error: "unauthenticated" }, null);
  }
  const allowed = await allowlisted(session.user.id);
  if (allowed === "error") return json(request, 503, { error: "temporary_failure" });
  if (!allowed) {
    if (session.access_token) await createServiceClient().auth.admin.signOut(session.access_token, "global");
    return json(request, 401, { error: "unauthorized" }, null);
  }

  const body = await readJson(request);
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (!currentPassword || newPassword.length < 8 || newPassword.length > 72 || newPassword === currentPassword) {
    return json(request, 400, { error: "invalid_request" }, session.refresh_token);
  }

  const verified = await createAuthClient().auth.signInWithPassword({
    email: session.user.email,
    password: currentPassword,
  });
  if (verified.error || !verified.data.session) {
    return json(request, 401, { error: "invalid_credentials" }, session.refresh_token);
  }

  const service = createServiceClient();
  const updated = await service.auth.admin.updateUserById(session.user.id, { password: newPassword });
  if (updated.error) return json(request, 503, { error: "temporary_failure" }, session.refresh_token);
  const verificationToken = verified.data.session.access_token;
  if (verificationToken) await service.auth.admin.signOut(verificationToken, "global");

  const resigned = await createAuthClient().auth.signInWithPassword({
    email: session.user.email,
    password: newPassword,
  });
  if (resigned.error || !resigned.data.session?.user.email) {
    return json(request, 503, { error: "temporary_failure" }, null);
  }
  return acceptSession(request, resigned.data.session);
}

async function acceptSession(request: Request, session: Session): Promise<Response> {
  const email = session.user.email;
  if (!email || !session.refresh_token) return json(request, 503, { error: "temporary_failure" }, null);
  const allowed = await allowlisted(session.user.id);
  if (allowed === "error") {
    if (session.access_token) await createServiceClient().auth.admin.signOut(session.access_token, "global");
    return json(request, 503, { error: "temporary_failure" }, null);
  }
  if (!allowed) {
    if (session.access_token) await createServiceClient().auth.admin.signOut(session.access_token, "global");
    return json(request, 401, { error: "unauthorized" }, null);
  }
  return json(request, 200, {
    accessToken: session.access_token,
    expiresAt: typeof session.expires_at === "number" ? session.expires_at : Math.floor(Date.now() / 1000) + 3600,
    user: { id: session.user.id, email },
  }, session.refresh_token);
}

async function allowlisted(userId: string): Promise<Allowlist> {
  const { data, error } = await createServiceClient()
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return "error";
  return Boolean(data);
}

async function rateLimited(attemptKey: string): Promise<boolean | "error"> {
  const service = createServiceClient();
  const cutoff = new Date(Date.now() - ATTEMPT_WINDOW_MS).toISOString();
  await service.from("login_attempts").delete().lt("attempted_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const existing = await service
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("attempt_key", attemptKey)
    .gte("attempted_at", cutoff);
  if (existing.error) return "error";
  if ((existing.count ?? 0) >= ATTEMPT_LIMIT) return true;
  const inserted = await service.from("login_attempts").insert({ attempt_key: attemptKey });
  if (inserted.error) return "error";
  return false;
}

function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const source = new URL(origin);
    const target = new URL(request.url);
    return source.protocol === target.protocol && source.host === target.host;
  } catch {
    return false;
  }
}

function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || "unknown").slice(0, 80);
}

async function readJson(request: Request): Promise<{ email?: unknown; password?: unknown; currentPassword?: unknown; newPassword?: unknown } | null> {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
    return body as { email?: unknown; password?: unknown; currentPassword?: unknown; newPassword?: unknown };
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

function cookieIsSecure(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwarded) return forwarded === "https";
  return new URL(request.url).protocol === "https:";
}

export type OwnerAccess = {
  accessToken: string;
  expiresAt: number;
};

export async function withOwner(
  request: Request,
  action: (session: OwnerAccess) => Promise<{ status: number; body: unknown }>,
  options?: { mutation?: boolean },
): Promise<Response> {
  if (options?.mutation && !originAllowed(request)) return json(request, 403, { error: "forbidden_origin" });
  const current = readCookie(request, REFRESH_COOKIE);
  if (!current) return json(request, 401, { error: "unauthenticated" });
  const refreshed = await createAuthClient().auth.refreshSession({ refresh_token: current });
  const session = refreshed.data.session;
  if (refreshed.error || !session?.user.email || !session.refresh_token) {
    return json(request, 401, { error: "unauthenticated" }, null);
  }
  const allowed = await allowlisted(session.user.id);
  if (allowed === "error") return json(request, 503, { error: "temporary_failure" }, session.refresh_token);
  if (!allowed) {
    if (session.access_token) await createServiceClient().auth.admin.signOut(session.access_token, "global");
    return json(request, 401, { error: "unauthorized" }, null);
  }
  if (!session.access_token) return json(request, 503, { error: "temporary_failure" }, session.refresh_token);
  try {
    const result = await action({
      accessToken: session.access_token,
      expiresAt: typeof session.expires_at === "number" ? session.expires_at : Math.floor(Date.now() / 1000) + 3600,
    });
    return json(request, result.status, result.body, session.refresh_token);
  } catch {
    return json(request, 503, { error: "temporary_failure" }, session.refresh_token);
  }
}

function json(request: Request, status: number, body: unknown, refreshToken?: string | null): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  const secure = cookieIsSecure(request) ? "; Secure" : "";
  if (refreshToken === null) {
    headers.append("set-cookie", `${REFRESH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  } else if (typeof refreshToken === "string") {
    headers.append("set-cookie", `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${REFRESH_MAX_AGE}${secure}`);
  }
  return Response.json(body, { status, headers });
}
