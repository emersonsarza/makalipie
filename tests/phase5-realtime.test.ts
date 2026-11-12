import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { POST as signIn } from "../src/app/api/admin/session/route";
import { GET as tokenGet } from "../src/app/api/admin/realtime/token/route";
import { POST as publicOrders } from "../src/app/api/public/orders/route";
import { REFRESH_COOKIE } from "../src/lib/admin/session";
import { readSupabaseEnv } from "../src/lib/admin/env";
import { createServiceClient } from "../src/lib/admin/supabase";
import { manilaDate } from "../src/lib/catalog/rules";
import { applyOrderChange } from "../src/lib/orders/change";

const env = readSupabaseEnv();
const service = createServiceClient();
const ip = `phase5-${randomUUID()}`;

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function request(path: string, options: { method?: string; cookie?: string | null; origin?: string | null; body?: unknown } = {}) {
  const headers = new Headers();
  if (options.origin !== null) headers.set("origin", options.origin ?? "http://127.0.0.1:3000");
  headers.set("x-forwarded-for", ip);
  if (options.cookie) headers.set("cookie", `${REFRESH_COOKIE}=${encodeURIComponent(options.cookie)}`);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://127.0.0.1:3000${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

function refreshCookie(response: Response) {
  const match = (response.headers.get("set-cookie") ?? "").match(new RegExp(`${REFRESH_COOKIE}=([^;]*)`));
  return match && match[1] !== "" ? decodeURIComponent(match[1]) : null;
}

function cart(key: string, price = 24000) {
  return {
    idempotencyKey: key,
    channel: "regular",
    locationId: "cebu",
    fulfillmentDate: addDays(manilaDate(), 1),
    fulfillment: "pickup",
    slotId: "10:00",
    lines: [{ productId: "keylime", sizeId: "4-inch", quantity: 1, unitPriceCentavos: price }],
    customerName: "Phase5 Buyer",
    customerPhone: "09171234567",
    notes: "",
  };
}

function realtimeClient(accessToken?: string) {
  const client = createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (accessToken) client.realtime.setAuth(accessToken);
  return client;
}

async function listen(client: SupabaseClient) {
  const events: unknown[] = [];
  const channel = client.channel("orders", { config: { private: true } });
  channel.on("broadcast", { event: "order" }, (message) => {
    events.push(message.payload);
  });
  const status = await new Promise<string>((resolve) => {
    const timer = setTimeout(() => resolve("TIMED_OUT"), 5000);
    channel.subscribe((next) => {
      if (next === "SUBSCRIBED" || next === "CHANNEL_ERROR" || next === "TIMED_OUT" || next === "CLOSED") {
        clearTimeout(timer);
        resolve(next);
      }
    });
  });
  return { channel, events, status };
}

async function waitFor(check: () => boolean, label: string) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > 5000) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function close(client: SupabaseClient) {
  await client.removeAllChannels();
  client.realtime.disconnect();
}

test("private order events and the owner token", async () => {
  await service.from("orders").delete().like("customer_name", "Phase5%");
  const ownerEmail = `phase5-owner-${randomUUID()}@example.com`;
  const otherEmail = `phase5-other-${randomUUID()}@example.com`;
  const owner = await service.auth.admin.createUser({ email: ownerEmail, password: "correct-horse", email_confirm: true });
  const other = await service.auth.admin.createUser({ email: otherEmail, password: "correct-horse", email_confirm: true });
  const ownerId = owner.data.user?.id;
  const otherId = other.data.user?.id;
  assert.ok(ownerId && otherId);
  const clients: SupabaseClient[] = [];
  try {
    const anonymous = realtimeClient();
    clients.push(anonymous);
    const hidden = await listen(anonymous);
    assert.notEqual(hidden.status, "SUBSCRIBED");

    const strangerAuth = realtimeClient();
    clients.push(strangerAuth);
    const signedStranger = await strangerAuth.auth.signInWithPassword({ email: otherEmail, password: "correct-horse" });
    assert.equal(signedStranger.error, null);
    const strangerToken = signedStranger.data.session?.access_token;
    assert.ok(strangerToken);
    const stranger = realtimeClient(strangerToken);
    clients.push(stranger);
    const refused = await listen(stranger);
    assert.notEqual(refused.status, "SUBSCRIBED");
    const strangerSession = await signIn(request("/api/admin/session", { method: "POST", body: { email: otherEmail, password: "correct-horse" } }));
    assert.equal(strangerSession.status, 401);
    const missing = await tokenGet(request("/api/admin/realtime/token"));
    assert.equal(missing.status, 401);

    await service.from("admin_users").insert({ user_id: ownerId });
    const signedIn = await signIn(request("/api/admin/session", { method: "POST", body: { email: ownerEmail, password: "correct-horse" } }));
    assert.equal(signedIn.status, 200);
    const cookie = refreshCookie(signedIn);
    assert.ok(cookie);
    const tokenResponse = await tokenGet(request("/api/admin/realtime/token", { cookie }));
    const tokenBody = await tokenResponse.json();
    assert.equal(tokenResponse.status, 200, JSON.stringify(tokenBody));
    assert.deepEqual(Object.keys(tokenBody).sort(), ["accessToken", "expiresAt"]);
    assert.equal(typeof tokenBody.accessToken, "string");
    assert.equal(tokenBody.accessToken.split(".").length, 3);
    assert.notEqual(tokenBody.accessToken, cookie);
    assert.equal(JSON.stringify(tokenBody).includes(cookie), false);

    const ownerClient = realtimeClient(tokenBody.accessToken);
    clients.push(ownerClient);
    const live = await listen(ownerClient);
    assert.equal(live.status, "SUBSCRIBED", live.status);
    await hidden.channel.send({ type: "broadcast", event: "order", payload: { orderId: "phase5-forged", changeType: "created" } });
    await refused.channel.send({ type: "broadcast", event: "order", payload: { orderId: "phase5-forged", changeType: "created" } });
    await new Promise((resolve) => setTimeout(resolve, 800));
    assert.equal(live.events.some((event) => (event as { orderId?: string }).orderId === "phase5-forged"), false);

    const placedResponse = await publicOrders(request("/api/public/orders", { method: "POST", body: cart("phase5-created") }));
    const placed = await placedResponse.json();
    assert.equal(placedResponse.status, 200, JSON.stringify(placed));
    await waitFor(() => live.events.some((event) => (event as { orderId?: string }).orderId === placed.orderId), "created");
    const created = live.events.filter((event) => (event as { orderId?: string }).orderId === placed.orderId);
    assert.equal(created.length, 1);
    assert.deepEqual(created[0], { orderId: placed.orderId, changeType: "created" });

    const header = await service.from("orders").select("updated_at").eq("id", placed.orderId).single();
    const lines = await service.from("order_lines").select("id, product_id, size_id, quantity, unit_price_centavos").eq("order_id", placed.orderId);
    assert.equal(header.error, null);
    assert.equal(lines.error, null);
    const edited = await applyOrderChange("update_order", {
      orderId: placed.orderId,
      updatedAt: header.data.updated_at,
      fulfillmentDate: addDays(manilaDate(), 1),
      fulfillment: "pickup",
      slotId: "10:00",
      lines: lines.data.map((line) => ({
        lineId: line.id,
        productId: line.product_id,
        sizeId: line.size_id,
        quantity: line.quantity,
        unitPriceCentavos: line.unit_price_centavos,
      })),
      customerName: "Phase5 Buyer",
      customerPhone: "09171234567",
      notes: "Gate code 12",
    }, "admin");
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    await waitFor(() => live.events.some((event) => (event as { changeType?: string }).changeType === "updated"), "updated");
    const updated = live.events.filter((event) => (event as { orderId?: string }).orderId === placed.orderId && (event as { changeType?: string }).changeType === "updated");
    assert.equal(updated.length, 1);
    assert.deepEqual(Object.keys(updated[0] as object).sort(), ["changeType", "orderId"]);

    const beforeQuiet = live.events.length;
    const replayResponse = await publicOrders(request("/api/public/orders", { method: "POST", body: cart("phase5-created", 24000) }));
    const replay = await replayResponse.json();
    assert.equal(replay.replayed, true);
    const pricedResponse = await publicOrders(request("/api/public/orders", { method: "POST", body: cart("phase5-priced", 1) }));
    assert.equal(pricedResponse.status, 409);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    assert.equal(live.events.length, beforeQuiet);
    assert.equal(live.events.some((event) => JSON.stringify(event).includes("Phase5") || JSON.stringify(event).includes("0917")), false);
  } finally {
    await Promise.all(clients.map((client) => close(client)));
    await service.from("orders").delete().like("customer_name", "Phase5%");
    if (ownerId) await service.auth.admin.deleteUser(ownerId);
    if (otherId) await service.auth.admin.deleteUser(otherId);
  }
});
