import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { generateIdentity } from "age-encryption";
import { Client } from "pg";
import { POST as signIn } from "../src/app/api/admin/session/route";
import { GET as backupsGet } from "../src/app/api/admin/backups/route";
import { POST as exportPost } from "../src/app/api/admin/backups/export/route";
import { POST as confirmPost } from "../src/app/api/admin/backups/key/confirm/route";
import { POST as keyPost } from "../src/app/api/admin/backups/key/route";
import { POST as publicOrders } from "../src/app/api/public/orders/route";
import { REFRESH_COOKIE } from "../src/lib/admin/session";
import { createAuthClient, createServiceClient } from "../src/lib/admin/supabase";
import { backupTables, decryptBackup, type BackupFile } from "../src/lib/backups/format";
import { manilaDate } from "../src/lib/catalog/rules";
import { applyDropChange } from "../src/lib/drops/change";
import { loadDrops } from "../src/lib/drops/load";
import { dropRecoveryDatabase, restoreBackup } from "../scripts/restore-backup";

const service = createServiceClient();
const ip = `phase6-${randomUUID()}`;
const recoveryUrl = "postgresql://postgres:postgres@127.0.0.1:54322/makalipie_recovery";

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function request(path: string, options: { method?: string; cookie?: string | null; body?: unknown } = {}) {
  const headers = new Headers();
  headers.set("origin", "http://127.0.0.1:3000");
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

async function publishDrop(date: string) {
  let store = await loadDrops();
  const saved = await applyDropChange("save_drop", {
    revision: store.revision,
    id: "phase6-market",
    locationId: "manila",
    name: "Phase 6 market",
    address: "Ayala Avenue, Makati",
    mapUrl: "",
    deliveryEnabled: false,
    dates: [{
      date,
      orderingOpens: "00:00",
      orderingCutoff: "23:59",
      pickupStarts: "00:00",
      pickupEnds: "23:59",
      dispatchStarts: null,
      dispatchEnds: null,
    }],
    offerings: [{
      id: "keylime-4",
      kind: "size",
      name: "Keylime",
      priceCentavos: 24000,
      perOrderMax: 4,
      productId: "keylime",
      sizeId: "4-inch",
      sortOrder: 0,
      components: [],
      dates: [{ date, included: true, allocated: 5 }],
    }],
    addons: [],
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  store = await loadDrops();
  const drop = store.drops.find((item) => item.id === "phase6-market");
  const published = await applyDropChange("publish_drop", { revision: store.revision, id: "phase6-market", updatedAt: drop?.updatedAt });
  assert.equal(published.status, 200, JSON.stringify(published.body));
}

test("encrypted export omits personal data and restores into a second database", async () => {
  const existingKeys = await service.from("backup_keys").select("id", { head: true, count: "exact" });
  assert.equal(existingKeys.error, null);
  assert.equal(existingKeys.count, 0, "Run this test against a local stack without an existing recovery key.");
  const denied = await createAuthClient().rpc("admin_backup_snapshot");
  assert.ok(denied.error, "Anonymous callers cannot read the database snapshot.");
  await dropRecoveryDatabase();
  await service.from("orders").delete().like("customer_name", "Phase6%");
  await service.from("drops").delete().eq("id", "phase6-market");
  const email = `phase6-${randomUUID()}@example.com`;
  const created = await service.auth.admin.createUser({ email, password: "correct-horse", email_confirm: true });
  const userId = created.data.user?.id;
  assert.ok(userId);
  let cookie = "";
  let keyId: string | undefined;
  try {
    const anonymous = await keyPost(request("/api/admin/backups/key", { method: "POST", body: {} }));
    assert.equal(anonymous.status, 401);
    await service.from("admin_users").insert({ user_id: userId });
    const signedIn = await signIn(request("/api/admin/session", { method: "POST", body: { email, password: "correct-horse" } }));
    assert.equal(signedIn.status, 200);
    cookie = refreshCookie(signedIn) ?? "";
    assert.ok(cookie);

    const createdKey = await keyPost(request("/api/admin/backups/key", { method: "POST", cookie, body: {} }));
    const createdBody = await createdKey.json();
    assert.equal(createdKey.status, 200, JSON.stringify(createdBody));
    keyId = createdBody.keyId;
    assert.match(createdBody.privateKey, /^AGE-SECRET-KEY-1/);
    const stored = await service.from("backup_keys").select("*").single();
    assert.equal(stored.error, null);
    assert.equal(JSON.stringify(stored.data).includes("AGE-SECRET-KEY"), false);
    assert.equal(stored.data.public_key, createdBody.publicKey);

    const again = await keyPost(request("/api/admin/backups/key", { method: "POST", cookie: refreshCookie(createdKey) ?? cookie, body: {} }));
    const againBody = await again.json();
    cookie = refreshCookie(again) ?? cookie;
    assert.equal(again.status, 409);
    assert.equal(againBody.error, "key_exists");
    assert.equal(JSON.stringify(againBody).includes("AGE-SECRET-KEY"), false);

    const statusResponse = await backupsGet(request("/api/admin/backups", { cookie }));
    const statusBody = await statusResponse.json();
    cookie = refreshCookie(statusResponse) ?? cookie;
    assert.equal(statusResponse.status, 200);
    assert.deepEqual(Object.keys(statusBody.key).sort(), ["confirmedAt", "createdAt", "keyId"]);
    assert.equal(statusBody.key.confirmedAt, null);
    const unconfirmed = await exportPost(request("/api/admin/backups/export", { method: "POST", cookie }));
    assert.equal(unconfirmed.status, 409);
    assert.equal((await unconfirmed.json()).error, "key_unconfirmed");
    cookie = refreshCookie(unconfirmed) ?? cookie;
    const confirmed = await confirmPost(request("/api/admin/backups/key/confirm", { method: "POST", cookie, body: {} }));
    const confirmedBody = await confirmed.json();
    cookie = refreshCookie(confirmed) ?? cookie;
    assert.equal(confirmed.status, 200, JSON.stringify(confirmedBody));
    assert.equal(typeof confirmedBody.confirmedAt, "string");

    const today = manilaDate();
    await publishDrop(today);
    const dropOrder = await publicOrders(request("/api/public/orders", {
      method: "POST",
      body: {
        idempotencyKey: "phase6-drop-order",
        channel: "drop",
        locationId: "manila",
        dropId: "phase6-market",
        fulfillmentDate: today,
        fulfillment: "pickup",
        lines: [{ offeringId: "keylime-4", quantity: 2, unitPriceCentavos: 24000 }],
        customerName: "Phase6 Buyer",
        customerPhone: "09175550000",
        notes: "Drop note",
      },
    }));
    const dropBody = await dropOrder.json();
    assert.equal(dropOrder.status, 200, JSON.stringify(dropBody));
    const deliveryOrder = await publicOrders(request("/api/public/orders", {
      method: "POST",
      body: {
        idempotencyKey: "phase6-delivery-order",
        channel: "regular",
        locationId: "cebu",
        fulfillmentDate: addDays(today, 1),
        fulfillment: "delivery",
        slotId: "10:00",
        lines: [{ productId: "keylime", sizeId: "4-inch", quantity: 1, unitPriceCentavos: 24000 }],
        customerName: "Phase6 Buyer",
        customerPhone: "09175551111",
        deliveryAddress: "123 Mango Street, Cebu",
        notes: "Call on arrival",
      },
    }));
    const deliveryBody = await deliveryOrder.json();
    assert.equal(deliveryOrder.status, 200, JSON.stringify(deliveryBody));
    const committed = await service.from("drop_offering_dates").select("committed").eq("drop_id", "phase6-market").eq("offering_id", "keylime-4").single();
    const sequence = await service.from("daily_order_sequences").select("last_value").eq("service_date", today).single();
    assert.equal(committed.data?.committed, 2);

    const exported = await exportPost(request("/api/admin/backups/export", { method: "POST", cookie, body: {} }));
    const file = await exported.json() as BackupFile;
    cookie = refreshCookie(exported) ?? cookie;
    assert.equal(exported.status, 200, JSON.stringify(file));
    assert.equal(file.environment, "local");
    assert.equal(file.format, 1);
    const plaintext = await decryptBackup(file, createdBody.privateKey);
    assert.deepEqual(Object.keys(plaintext.tables).sort(), backupTables.map(table => table.name).sort());
    const serialized = JSON.stringify(plaintext);
    assert.equal(serialized.includes("09175550000"), false);
    assert.equal(serialized.includes("09175551111"), false);
    assert.equal(serialized.includes("Mango Street"), false);
    assert.equal(serialized.includes("Call on arrival"), false);
    assert.equal(serialized.includes("AGE-SECRET-KEY"), false);
    assert.equal(plaintext.tables.orders.every((order) => order.customer_name === null && order.notes === null), true);
    assert.equal(plaintext.tables.drop_offering_dates.find((row) => row.drop_id === "phase6-market")?.committed, 2);
    assert.equal("login_attempts" in plaintext.tables, false);
    assert.equal("storefront_snapshot" in plaintext.tables, false);

    const replacement = file.ciphertext[40] === "A" ? "B" : "A";
    const tampered = { ...file, ciphertext: `${file.ciphertext.slice(0, 40)}${replacement}${file.ciphertext.slice(41)}` };
    await assert.rejects(() => decryptBackup(tampered, createdBody.privateKey), /decryption_failed/);
    const wrongKey = await generateIdentity();
    await assert.rejects(() => decryptBackup(file, wrongKey), /decryption_failed/);
    await assert.rejects(() => decryptBackup({ ...file, keyId: randomUUID() }, createdBody.privateKey), /header_mismatch/);

    await assert.rejects(() => restoreBackup(file, createdBody.privateKey, "postgres"), /refused_target/);
    const stillNamed = await service.from("orders").select("customer_name").eq("id", deliveryBody.orderId).single();
    assert.equal(stillNamed.data?.customer_name, "Phase6 Buyer");

    await restoreBackup(file, createdBody.privateKey);
    const recovery = new Client({ connectionString: recoveryUrl });
    await recovery.connect();
    try {
      const numbers = await recovery.query("select order_number, customer_name, customer_phone, delivery_address, notes from public.orders order by order_number");
      assert.deepEqual(numbers.rows.map((row) => row.order_number).sort(), plaintext.tables.orders.map(row => row.order_number).sort());
      assert.equal(numbers.rows.every((row) => row.customer_name === null && row.customer_phone === null && row.delivery_address === null && row.notes === null), true);
      const stock = await recovery.query("select committed from public.drop_offering_dates where drop_id = 'phase6-market' and offering_id = 'keylime-4'");
      assert.equal(stock.rows[0].committed, 2);
      const restoredSequence = await recovery.query("select last_value from public.daily_order_sequences where service_date = $1", [today]);
      assert.equal(Number(restoredSequence.rows[0].last_value), sequence.data?.last_value);
      await recovery.query("update public.orders set created_at = '2099-01-01T00:00:00Z', notes = 'keep-me' where order_number = $1", [dropBody.orderNumber]);
    } finally {
      await recovery.end();
    }
    const [snapshot, concurrentOrder] = await Promise.all([
      service.rpc("admin_backup_snapshot"),
      publicOrders(request("/api/public/orders", { method: "POST", body: {
        idempotencyKey: "phase6-concurrent-snapshot", channel: "drop", locationId: "manila", dropId: "phase6-market",
        fulfillmentDate: today, fulfillment: "pickup",
        lines: [{ offeringId: "keylime-4", quantity: 1, unitPriceCentavos: 24000 }],
        customerName: "Phase6 Buyer", customerPhone: "09175550000",
      } })),
    ]);
    assert.equal(snapshot.error, null);
    const concurrent = await concurrentOrder.json();
    assert.equal(concurrentOrder.status, 200, JSON.stringify(concurrent));
    const concurrentSnapshot = snapshot.data as typeof plaintext.tables;
    const included = concurrentSnapshot.orders.some(row => row.id === concurrent.orderId);
    assert.equal(concurrentSnapshot.drop_offering_dates.find(row => row.drop_id === "phase6-market")?.committed, included ? 3 : 2);
    assert.equal(concurrentSnapshot.order_lines.some(row => row.order_id === concurrent.orderId), included);
    assert.equal(concurrentSnapshot.order_idempotency.some(row => row.order_id === concurrent.orderId), included);
    await assert.rejects(() => restoreBackup(file, createdBody.privateKey), /newer_data/);
    const afterRefusal = new Client({ connectionString: recoveryUrl });
    await afterRefusal.connect();
    try {
      const kept = await afterRefusal.query("select notes from public.orders where order_number = $1", [dropBody.orderNumber]);
      assert.equal(kept.rows[0].notes, "keep-me");
    } finally {
      await afterRefusal.end();
    }
  } finally {
    await dropRecoveryDatabase();
    await service.from("orders").delete().eq("drop_id", "phase6-market");
    await service.from("orders").delete().like("customer_name", "Phase6%");
    await service.from("drops").delete().eq("id", "phase6-market");
    if (keyId) await service.from("backup_keys").delete().eq("id", keyId);
    if (userId) await service.auth.admin.deleteUser(userId);
  }
});
