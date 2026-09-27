import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { emulatorEnv } from "../scripts/emulator-env.mjs";

Object.assign(process.env, emulatorEnv);
const origin = "http://localhost:3001";
const endpoint = `${origin}/api/admin/session`;

test("owner sessions, access revocation, and mutation boundaries through the running app", async (t) => {
  const { getServerFirebase } = await import("../src/lib/firebase/server");
  const { auth, db } = getServerFirebase();
  const created: string[] = [];
  async function fixture(profile?: { role: string; active: boolean }) {
    const email = `test-${randomUUID()}@example.test`;
    const password = "Test-only-password-123!";
    const user = await auth.createUser({ email, password });
    created.push(user.uid);
    if (profile) await db.doc(`admins/${user.uid}`).set({ ...profile, email, displayName: "Test Owner" });
    const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    assert.equal(response.status, 200);
    const { idToken } = await response.json();
    return { uid: user.uid, idToken: idToken as string };
  }
  const post = (idToken: string, requestOrigin = origin) => fetch(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: requestOrigin }, body: JSON.stringify({ idToken }),
  });
  const read = (cookie?: string) => fetch(endpoint, { headers: cookie ? { Cookie: cookie } : {} });
  const getCookie = (response: Response) => response.headers.get("set-cookie")!.split(";")[0];
  try {
    await t.test("signed-out and invalid-session requests are denied", async () => {
      assert.equal((await read()).status, 401);
      assert.equal((await read("makalipie_demo_session=invalid")).status, 401);
      const page = await fetch(`${origin}/admin`, { redirect: "manual" });
      if (page.status === 307) {
        assert.match(page.headers.get("location")!, /\/admin\/login/);
      } else {
        // Next.js uses a meta redirect once the loading boundary has streamed.
        assert.equal(page.status, 200);
        const html = await page.text();
        assert.match(html, /http-equiv="refresh"[^>]*\/admin\/login/);
        assert.doesNotMatch(html, /Owner access ready/);
      }
    });
    await t.test("only the active owner receives an HttpOnly session", async () => {
      const owner = await fixture({ role: "owner", active: true });
      const response = await post(owner.idToken);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("set-cookie")!, /HttpOnly/i);
      assert.match(response.headers.get("set-cookie")!, /SameSite=strict/i);
      const cookie = getCookie(response);
      const allowed = await read(cookie);
      assert.equal(allowed.status, 200);
      assert.equal(allowed.headers.get("cache-control"), "no-store");
      assert.deepEqual(await allowed.json(), { user: { displayName: "Test Owner", role: "owner" } });
      assert.equal((await fetch(`${origin}/admin`, { headers: { Cookie: cookie } })).status, 200);
      await db.doc(`admins/${owner.uid}`).update({ active: false });
      assert.equal((await read(cookie)).status, 403);
      await db.doc(`admins/${owner.uid}`).update({ active: true });
      await auth.updateUser(owner.uid, { disabled: true });
      assert.equal((await read(cookie)).status, 401);
    });
    await t.test("nonmembers, inactive owners, and staff cannot create sessions", async () => {
      for (const profile of [undefined, { role: "owner", active: false }, { role: "staff", active: true }]) {
        const user = await fixture(profile);
        const response = await post(user.idToken);
        assert.equal(response.status, 403);
        assert.equal(response.headers.get("set-cookie"), null);
      }
    });
    await t.test("cross-origin login/logout, malformed and oversized payloads are rejected", async () => {
      assert.equal((await post("token", "https://evil.example")).status, 403);
      assert.equal((await fetch(endpoint, { method: "DELETE", headers: { Origin: "https://evil.example" } })).status, 403);
      assert.equal((await fetch(endpoint, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{" })).status, 400);
      assert.equal((await post("x".repeat(19000))).status, 413);
    });
    await t.test("expired sessions, revoked sessions, and old authentication cannot grant access", async () => {
      const owner = await fixture({ role: "owner", active: true });
      // Only the isolated Auth emulator accepts unsigned fixture tokens.
      const rewrite = (token: string, values: Record<string, number>) => {
        const [header, payload] = token.split(".");
        return `${header}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), ...values })).toString("base64url")}.`;
      };
      const now = Math.floor(Date.now() / 1000);
      assert.equal((await post(rewrite(owner.idToken, { auth_time: now - 301 }))).status, 401);
      const response = await post(owner.idToken);
      assert.equal(response.status, 200);
      const cookie = getCookie(response);
      const sessionValue = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1));
      assert.equal((await read(`makalipie_demo_session=${rewrite(sessionValue, { exp: now - 10 })}`)).status, 401);
      // Revocation timestamps have second precision; cross that boundary.
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await auth.revokeRefreshTokens(owner.uid);
      assert.equal((await read(cookie)).status, 401);
    });
    await t.test("sign-out clears even an expired or invalid session", async () => {
      const response = await fetch(endpoint, { method: "DELETE", headers: { Origin: origin, Cookie: "makalipie_demo_session=expired" } });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("set-cookie")!, /Max-Age=0/i);
    });
  } finally {
    for (const uid of created) {
      await db.doc(`admins/${uid}`).delete();
      await auth.deleteUser(uid);
    }
  }
});
