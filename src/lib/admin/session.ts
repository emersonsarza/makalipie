import type { Session } from "@supabase/supabase-js";
import { originAllowed } from "../http/origin";
import { verifyAccessToken } from "./jwt";
import { createAuthClient, createServiceClient } from "./supabase";

export const REFRESH_COOKIE = "mp_refresh";
export const ACCESS_COOKIE = "mp_access";
const HOST_REFRESH_COOKIE = "__Host-mp_refresh";
const HOST_ACCESS_COOKIE = "__Host-mp_access";
const REFRESH_MAX_AGE = 60 * 60 * 24 * 400;
const ACCESS_SKEW_SECONDS = 60;
const ATTEMPT_LIMIT = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

type CookieSession = { refresh_token: string; access_token: string; expires_at: number };

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
  return readSession(request, true);
}

export async function readSession(request: Request, rotate = false): Promise<Response> {
  const owner = await resolveOwner(request, { rotate, confirmUser: rotate });
  if (owner.status !== 200) return json(request, owner.status, { error: owner.error }, owner.clear ? null : owner.cookies);
  return json(request, 200, {
    accessToken: owner.access.accessToken,
    expiresAt: owner.access.expiresAt,
    user: { id: owner.userId, email: owner.email },
  }, owner.cookies);
}

export async function signOut(request: Request): Promise<Response> {
  if (!originAllowed(request)) return json(request, 403, { error: "forbidden_origin" });
  const accessToken = readAccessCookie(request);
  const refreshToken = readRefreshCookie(request);
  let token = accessToken;
  if (!token && refreshToken) {
    const refreshed = await createAuthClient().auth.refreshSession({ refresh_token: refreshToken });
    token = refreshed.data.session?.access_token ?? null;
  }
  if (token) await createServiceClient().auth.admin.signOut(token, "local");
  return json(request, 200, { ok: true }, null);
}

export async function changePassword(request: Request): Promise<Response> {
  if (!originAllowed(request)) return json(request, 403, { error: "forbidden_origin" });
  const owner = await resolveOwner(request, { rotate: true, confirmUser: true });
  if (owner.status !== 200) return json(request, owner.status, { error: owner.error }, owner.clear ? null : owner.cookies);

  const body = await readJson(request);
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (!currentPassword || newPassword.length < 8 || newPassword.length > 72 || newPassword === currentPassword) {
    return json(request, 400, { error: "invalid_request" }, owner.cookies);
  }

  const verified = await createAuthClient().auth.signInWithPassword({
    email: owner.email,
    password: currentPassword,
  });
  if (verified.error || !verified.data.session) {
    return json(request, 401, { error: "invalid_credentials" }, owner.cookies);
  }

  const service = createServiceClient();
  const updated = await service.auth.admin.updateUserById(owner.userId, { password: newPassword });
  if (updated.error) return json(request, 503, { error: "temporary_failure" }, owner.cookies);
  const verificationToken = verified.data.session.access_token;
  if (verificationToken) await service.auth.admin.signOut(verificationToken, "global");

  const resigned = await createAuthClient().auth.signInWithPassword({
    email: owner.email,
    password: newPassword,
  });
  if (resigned.error || !resigned.data.session?.user.email) {
    return json(request, 503, { error: "temporary_failure" }, null);
  }
  return acceptSession(request, resigned.data.session);
}

async function acceptSession(request: Request, session: Session): Promise<Response> {
  const email = session.user.email;
  if (!email || !session.refresh_token || !session.access_token) return json(request, 503, { error: "temporary_failure" }, null);
  const allowed = await allowlisted(session.user.id);
  if (allowed === "error") {
    await createServiceClient().auth.admin.signOut(session.access_token, "local");
    return json(request, 503, { error: "temporary_failure" }, null);
  }
  if (!allowed) {
    await createServiceClient().auth.admin.signOut(session.access_token, "global");
    return json(request, 401, { error: "unauthorized" }, null);
  }
  const cookies = cookieSession(session);
  return json(request, 200, {
    accessToken: cookies.access_token,
    expiresAt: cookies.expires_at,
    user: { id: session.user.id, email },
  }, cookies);
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

function readAccessCookie(request: Request) {
  return readCookie(request, HOST_ACCESS_COOKIE) ?? readCookie(request, ACCESS_COOKIE);
}

function readRefreshCookie(request: Request) {
  return readCookie(request, HOST_REFRESH_COOKIE) ?? readCookie(request, REFRESH_COOKIE);
}

function cookieLine(name: string, value: string, maxAge: number, secure: boolean, hostPrefix: boolean) {
  const bits = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (secure || hostPrefix) bits.push("Secure");
  return bits.join("; ");
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
  const owner = await resolveOwner(request, { confirmUser: options?.mutation });
  if (owner.status !== 200) return json(request, owner.status, { error: owner.error }, owner.clear ? null : owner.cookies);
  try {
    const result = await action(owner.access);
    return json(request, result.status, result.body, owner.cookies);
  } catch {
    return json(request, 503, { error: "temporary_failure" }, owner.cookies);
  }
}

type OwnerOk = {
  status: 200;
  access: OwnerAccess;
  userId: string;
  email: string;
  cookies?: CookieSession;
  clear?: undefined;
  error?: undefined;
};
type OwnerFail = {
  status: 401 | 503;
  error: string;
  clear?: boolean;
  cookies?: CookieSession;
};
type OwnerResult = OwnerOk | OwnerFail;

function cookieSession(session: Session): CookieSession {
  return {
    refresh_token: session.refresh_token!,
    access_token: session.access_token!,
    expires_at: typeof session.expires_at === "number" ? session.expires_at : Math.floor(Date.now() / 1000) + 3600,
  };
}

function refreshRejected(error: { code?: string; message?: string } | null | undefined) {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return /invalid|not found|expired|revoked|missing/.test(text);
}

async function resolveOwner(request: Request, options: { rotate?: boolean; confirmUser?: boolean } = {}): Promise<OwnerResult> {
  const accessToken = readAccessCookie(request);
  const refreshToken = readRefreshCookie(request);
  const now = Math.floor(Date.now() / 1000);
  if (!options.rotate && accessToken) {
    const verified = await verifyAccessToken(accessToken);
    if (verified.ok && verified.claims.exp - now > ACCESS_SKEW_SECONDS) {
      if (options.confirmUser) {
        const user = await createAuthClient().auth.getUser(accessToken);
        if (!user.error && user.data.user?.id) {
          const allowed = await allowlisted(user.data.user.id);
          if (allowed === "error") return { status: 503, error: "temporary_failure" };
          if (!allowed) return { status: 401, error: "unauthorized", clear: true };
          return {
            status: 200,
            access: { accessToken, expiresAt: verified.claims.exp },
            userId: user.data.user.id,
            email: user.data.user.email ?? verified.claims.email,
          };
        }
        if (user.error && !refreshRejected(user.error) && refreshToken) {
          return { status: 503, error: "temporary_failure" };
        }
      } else {
        const allowed = await allowlisted(verified.claims.sub);
        if (allowed === "error") return { status: 503, error: "temporary_failure" };
        if (!allowed) return { status: 401, error: "unauthorized", clear: true };
        return {
          status: 200,
          access: { accessToken, expiresAt: verified.claims.exp },
          userId: verified.claims.sub,
          email: verified.claims.email,
        };
      }
    } else if (!verified.ok && verified.reason === "unavailable") {
      return { status: 503, error: "temporary_failure" };
    }
  }
  if (!refreshToken) return { status: 401, error: "unauthenticated", clear: Boolean(accessToken) };
  const refreshed = await createAuthClient().auth.refreshSession({ refresh_token: refreshToken });
  const session = refreshed.data.session;
  if (refreshed.error || !session?.user.email || !session.refresh_token || !session.access_token) {
    if (refreshRejected(refreshed.error)) return { status: 401, error: "unauthenticated", clear: true };
    return { status: 503, error: "temporary_failure" };
  }
  const cookies = cookieSession(session);
  const allowed = await allowlisted(session.user.id);
  if (allowed === "error") return { status: 503, error: "temporary_failure", cookies };
  if (!allowed) {
    await createServiceClient().auth.admin.signOut(session.access_token, "global");
    return { status: 401, error: "unauthorized", clear: true };
  }
  return {
    status: 200,
    access: { accessToken: cookies.access_token, expiresAt: cookies.expires_at },
    userId: session.user.id,
    email: session.user.email,
    cookies,
  };
}

function json(request: Request, status: number, body: unknown, cookies?: CookieSession | null): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  const hostPrefix = cookieIsSecure(request);
  const refreshName = hostPrefix ? HOST_REFRESH_COOKIE : REFRESH_COOKIE;
  const accessName = hostPrefix ? HOST_ACCESS_COOKIE : ACCESS_COOKIE;
  if (cookies === null) {
    headers.append("set-cookie", cookieLine(refreshName, "", 0, hostPrefix, hostPrefix));
    headers.append("set-cookie", cookieLine(accessName, "", 0, hostPrefix, hostPrefix));
    if (hostPrefix) {
      headers.append("set-cookie", cookieLine(REFRESH_COOKIE, "", 0, true, false));
      headers.append("set-cookie", cookieLine(ACCESS_COOKIE, "", 0, true, false));
    }
  } else if (cookies) {
    const accessMaxAge = Math.max(1, cookies.expires_at - Math.floor(Date.now() / 1000));
    headers.append("set-cookie", cookieLine(refreshName, encodeURIComponent(cookies.refresh_token), REFRESH_MAX_AGE, hostPrefix, hostPrefix));
    headers.append("set-cookie", cookieLine(accessName, encodeURIComponent(cookies.access_token), accessMaxAge, hostPrefix, hostPrefix));
    if (hostPrefix) {
      headers.append("set-cookie", cookieLine(REFRESH_COOKIE, "", 0, true, false));
      headers.append("set-cookie", cookieLine(ACCESS_COOKIE, "", 0, true, false));
    }
  }
  return Response.json(body, { status, headers });
}
