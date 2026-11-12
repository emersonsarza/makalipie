import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { GET as catalogGet, POST as catalogPost } from "../src/app/api/admin/catalog/route";
import { GET, POST } from "../src/app/api/admin/session/route";
import { POST as logoutRoute } from "../src/app/api/admin/session/logout/route";
import { POST as passwordRoute } from "../src/app/api/admin/session/password/route";
import { POST as refreshRoute } from "../src/app/api/admin/session/refresh/route";
import { readSupabaseEnv } from "../src/lib/admin/env";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../src/lib/admin/session";
import { createServiceClient } from "../src/lib/admin/supabase";

const env = readSupabaseEnv();
const service = createServiceClient();
const password = "correct-horse";
const replacement = "new-password-2";

function sessionRequest(path: string, options: { method?: string; cookie?: string | null; origin?: string | null; ip?: string; body?: unknown } = {}) {
  const headers = new Headers();
  if (options.origin !== null) headers.set("origin", options.origin ?? "http://127.0.0.1:3000");
  headers.set("x-forwarded-for", options.ip ?? "203.0.113.10");
  if (options.cookie) headers.set("cookie", `${REFRESH_COOKIE}=${encodeURIComponent(options.cookie)}`);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://127.0.0.1:3000${path}`, {
    method: options.method ?? "POST",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

function refreshCookie(response: Response): string | null {
  const header = setCookieHeader(response);
  const match = header.match(new RegExp(`${REFRESH_COOKIE}=([^;]*)`));
  if (!match || match[1] === "") return null;
  return decodeURIComponent(match[1]);
}

function setCookieHeader(response: Response) {
  return ("getSetCookie" in response.headers ? response.headers.getSetCookie() : [response.headers.get("set-cookie") ?? ""]).join("\n");
}

function cookieValue(response: Response, name: string) {
  const match = setCookieHeader(response).match(new RegExp(`${name}=([^;]*)`));
  if (!match || match[1] === "") return null;
  return decodeURIComponent(match[1]);
}

function pairCookie(response: Response) {
  const refresh = cookieValue(response, REFRESH_COOKIE);
  const access = cookieValue(response, ACCESS_COOKIE);
  assert.ok(refresh);
  assert.ok(access);
  return `${REFRESH_COOKIE}=${encodeURIComponent(refresh)}; ${ACCESS_COOKIE}=${encodeURIComponent(access)}`;
}

function pairRequest(path: string, cookie: string, ip: string) {
  return new Request(`http://127.0.0.1:3000${path}`, {
    method: "GET",
    headers: { origin: "http://127.0.0.1:3000", cookie, "x-forwarded-for": ip },
  });
}

async function createUser(email: string) {
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(created.error, null);
  const userId = created.data.user?.id;
  assert.ok(userId);
  return userId;
}

async function removeUser(userId: string) {
  await service.from("admin_users").delete().eq("user_id", userId);
  await service.from("login_attempts").delete().eq("attempt_key", "203.0.113.77");
  await service.auth.admin.deleteUser(userId);
}

test("a signed-in user who is not allowlisted is refused", async () => {
  const email = `phase1-stranger-${randomUUID()}@example.com`;
  const userId = await createUser(email);
  try {
    const response = await POST(sessionRequest("/api/admin/session", {
      ip: "203.0.113.20",
      body: { email, password },
    }));
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error, "unauthorized");
    assert.equal(refreshCookie(response), null);
    assert.equal(JSON.stringify(body).includes("refresh"), false);
  } finally {
    await removeUser(userId);
  }
});

test("owner session refreshes, rejects a bad password, and revokes other sessions on change", async () => {
  const email = `phase1-owner-${randomUUID()}@example.com`;
  const userId = await createUser(email);
  const otherIp = "203.0.113.31";
  const currentIp = "203.0.113.32";
  try {
    await service.from("admin_users").insert({ user_id: userId });

    const first = await POST(sessionRequest("/api/admin/session", { ip: otherIp, body: { email, password } }));
    assert.equal(first.status, 200);
    const firstCookie = refreshCookie(first);
    const firstBody = await first.json();
    assert.ok(firstCookie);
    assert.equal(first.headers.get("set-cookie")?.includes("HttpOnly"), true);
    assert.equal(first.headers.get("set-cookie")?.includes("SameSite=Lax"), true);
    assert.equal(firstBody.user.email, email);
    assert.equal(typeof firstBody.accessToken, "string");
    assert.equal(JSON.stringify(firstBody).includes(firstCookie), false);
    assert.ok(firstBody.expiresAt > Math.floor(Date.now() / 1000));

    const signedInClient = createClient(env.url, env.publishableKey, {
      global: { headers: { Authorization: `Bearer ${firstBody.accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const tableRead = await signedInClient.from("products").select("id").limit(1);
    assert.ok(tableRead.error);

    const current = await GET(sessionRequest("/api/admin/session", { method: "GET", cookie: firstCookie }));
    assert.equal(current.status, 200);
    const rotated = refreshCookie(current);
    assert.ok(rotated);

    const second = await POST(sessionRequest("/api/admin/session", { ip: currentIp, body: { email, password } }));
    const secondCookie = refreshCookie(second);
    assert.ok(secondCookie);

    const refreshed = await refreshRoute(sessionRequest("/api/admin/session/refresh", { cookie: rotated, ip: otherIp }));
    assert.equal(refreshed.status, 200);
    const refreshedCookie = refreshCookie(refreshed) ?? rotated;

    const wrong = await passwordRoute(sessionRequest("/api/admin/session/password", {
      cookie: secondCookie,
      ip: currentIp,
      body: { currentPassword: "wrong-password", newPassword: replacement },
    }));
    assert.equal(wrong.status, 401);
    assert.equal((await wrong.json()).error, "invalid_credentials");
    const stillValid = await refreshRoute(sessionRequest("/api/admin/session/refresh", { cookie: refreshedCookie, ip: otherIp }));
    assert.equal(stillValid.status, 200);

    const changed = await passwordRoute(sessionRequest("/api/admin/session/password", {
      cookie: secondCookie,
      ip: currentIp,
      body: { currentPassword: password, newPassword: replacement },
    }));
    assert.equal(changed.status, 200);
    const changedCookie = refreshCookie(changed);
    assert.ok(changedCookie);
    const otherSession = await refreshRoute(sessionRequest("/api/admin/session/refresh", { cookie: refreshedCookie, ip: otherIp }));
    assert.equal(otherSession.status, 401);
    const currentSession = await GET(sessionRequest("/api/admin/session", { method: "GET", cookie: changedCookie }));
    assert.equal(currentSession.status, 200);

    const loggedOut = await logoutRoute(sessionRequest("/api/admin/session/logout", { cookie: changedCookie, ip: currentIp }));
    assert.equal(loggedOut.status, 200);
    assert.equal(refreshCookie(loggedOut), null);
    const afterLogout = await refreshRoute(sessionRequest("/api/admin/session/refresh", { cookie: changedCookie, ip: currentIp }));
    assert.equal(afterLogout.status, 401);
  } finally {
    await removeUser(userId);
  }
});

test("two devices keep independent sessions and catalog reads do not rotate refresh", async () => {
  const email = `phase1-devices-${randomUUID()}@example.com`;
  const userId = await createUser(email);
  try {
    await service.from("admin_users").insert({ user_id: userId });
    const laptop = await POST(sessionRequest("/api/admin/session", { ip: "203.0.113.51", body: { email, password } }));
    const phone = await POST(sessionRequest("/api/admin/session", { ip: "203.0.113.52", body: { email, password } }));
    assert.equal(laptop.status, 200);
    assert.equal(phone.status, 200);
    const laptopPair = pairCookie(laptop);
    const phonePair = pairCookie(phone);
    const laptopRefresh = cookieValue(laptop, REFRESH_COOKIE);

    const burst = await Promise.all([
      catalogGet(pairRequest("/api/admin/catalog", laptopPair, "203.0.113.51")),
      catalogGet(pairRequest("/api/admin/catalog", laptopPair, "203.0.113.51")),
      catalogGet(pairRequest("/api/admin/catalog", phonePair, "203.0.113.52")),
      catalogGet(pairRequest("/api/admin/catalog", phonePair, "203.0.113.52")),
      GET(pairRequest("/api/admin/session", laptopPair, "203.0.113.51")),
      GET(pairRequest("/api/admin/session", phonePair, "203.0.113.52")),
    ]);
    for (const response of burst) {
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal(cookieValue(response, REFRESH_COOKIE), null);
    }

    const laterLaptop = await catalogGet(pairRequest("/api/admin/catalog", laptopPair, "203.0.113.51"));
    const laterPhone = await catalogGet(pairRequest("/api/admin/catalog", phonePair, "203.0.113.52"));
    assert.equal(laterLaptop.status, 200);
    assert.equal(laterPhone.status, 200);

    const loggedOutPhone = await logoutRoute(new Request("http://127.0.0.1:3000/api/admin/session/logout", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3000", cookie: phonePair, "x-forwarded-for": "203.0.113.52" },
    }));
    assert.equal(loggedOutPhone.status, 200);
    assert.equal(cookieValue(loggedOutPhone, REFRESH_COOKIE), null);
    const signedOutBrowser = await catalogGet(pairRequest("/api/admin/catalog", "", "203.0.113.52"));
    assert.equal(signedOutBrowser.status, 401);
    const leftoverWrite = await catalogPost(new Request("http://127.0.0.1:3000/api/admin/catalog", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3000", cookie: phonePair, "content-type": "application/json", "x-forwarded-for": "203.0.113.52" },
      body: JSON.stringify({ action: "save_settings", payload: {} }),
    }));
    assert.equal(leftoverWrite.status, 401);
    const leftoverRead = await catalogGet(pairRequest("/api/admin/catalog", phonePair, "203.0.113.52"));
    assert.equal(leftoverRead.status, 200);
    const laptopAfterPhoneLogout = await catalogGet(pairRequest("/api/admin/catalog", laptopPair, "203.0.113.51"));
    assert.equal(laptopAfterPhoneLogout.status, 200);
    assert.equal(cookieValue(laptopAfterPhoneLogout, REFRESH_COOKIE), null);
    assert.equal(laptopRefresh, cookieValue(laptop, REFRESH_COOKIE));
  } finally {
    await removeUser(userId);
  }
});

test("https sessions set host-prefixed cookies", async () => {
  const email = `phase1-https-${randomUUID()}@example.com`;
  const userId = await createUser(email);
  try {
    await service.from("admin_users").insert({ user_id: userId });
    const headers = new Headers({
      origin: "https://127.0.0.1:3000",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "127.0.0.1:3000",
      "x-forwarded-for": "203.0.113.61",
      "content-type": "application/json",
    });
    const response = await POST(new Request("https://127.0.0.1:3000/api/admin/session", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password }),
    }));
    assert.equal(response.status, 200, await response.clone().text());
    const header = setCookieHeader(response);
    assert.match(header, /__Host-mp_refresh=/);
    assert.match(header, /__Host-mp_access=/);
    assert.match(header, /Secure/);
    assert.doesNotMatch(header, /__Host-mp_refresh=[^;]*;.*Domain=/);
  } finally {
    await removeUser(userId);
  }
});

test("sign-in requires the site origin and slows repeated attempts", async () => {
  const missing = await POST(sessionRequest("/api/admin/session", { origin: null, ip: "203.0.113.40", body: { email: "a@b.co", password } }));
  assert.equal(missing.status, 403);
  const foreign = await POST(sessionRequest("/api/admin/session", { origin: "https://evil.example", ip: "203.0.113.41", body: { email: "a@b.co", password } }));
  assert.equal(foreign.status, 403);

  const attemptKey = "203.0.113.77";
  await service.from("login_attempts").delete().eq("attempt_key", attemptKey);
  const rows = Array.from({ length: 10 }, () => ({ attempt_key: attemptKey }));
  const inserted = await service.from("login_attempts").insert(rows);
  assert.equal(inserted.error, null);
  const limited = await POST(sessionRequest("/api/admin/session", { ip: attemptKey, body: { email: "a@b.co", password } }));
  assert.equal(limited.status, 429);
  await service.from("login_attempts").delete().eq("attempt_key", attemptKey);
});
