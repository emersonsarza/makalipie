import { GET as publicDropGet } from "../src/app/api/public/drops/[slug]/route";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { POST as signIn } from "../src/app/api/admin/session/route";
import { GET as lineupGet } from "../src/app/api/admin/lineup/route";
import { GET as adminOrdersGet, POST as adminOrdersPost } from "../src/app/api/admin/orders/route";
import { GET as orderDetailGet } from "../src/app/api/admin/orders/[id]/route";
import { POST as publicOrders } from "../src/app/api/public/orders/route";
import { REFRESH_COOKIE } from "../src/lib/admin/session";
import { createServiceClient } from "../src/lib/admin/supabase";
import { manilaDate } from "../src/lib/catalog/rules";
import { applyDropChange } from "../src/lib/drops/change";
import { loadDrops } from "../src/lib/drops/load";
import { applyOrderChange } from "../src/lib/orders/change";
import { findOrder, listOrderQueues, listOrders } from "../src/lib/orders/query";
import { applyCatalogChange } from "../src/lib/storefront/change";
import { loadCatalog } from "../src/lib/storefront/load";

const service = createServiceClient();
const ip = `phase4-${randomUUID()}`;
const drops = ["phase4-last", "phase4-roll", "phase4-market"];

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

async function readJson(response: Response) {
  return { status: response.status, body: await response.json() };
}

function regularCart(key: string, patch: Record<string, unknown> = {}) {
  return {
    idempotencyKey: key,
    channel: "regular",
    locationId: "cebu",
    fulfillmentDate: addDays(manilaDate(), 1),
    fulfillment: "pickup",
    slotId: "10:00",
    lines: [{ productId: "keylime", sizeId: "4-inch", quantity: 1, unitPriceCentavos: 24000 }],
    customerName: "Phase4 Buyer",
    customerPhone: "09171234567",
    notes: "",
    ...patch,
  };
}

function dropCart(dropId: string, lines: { offeringId: string; quantity: number; unitPriceCentavos: number }[], key: string, patch: Record<string, unknown> = {}) {
  return {
    idempotencyKey: key,
    channel: "drop",
    locationId: "manila",
    dropId,
    fulfillmentDate: manilaDate(),
    fulfillment: "pickup",
    lines,
    customerName: "Phase4 Buyer",
    customerPhone: "09171234567",
    notes: "",
    ...patch,
  };
}

async function placePublic(body: unknown) {
  return readJson(await publicOrders(request("/api/public/orders", { method: "POST", body })));
}

async function committed(dropId: string, offeringId: string) {
  const row = await service.from("drop_offering_dates").select("committed").eq("drop_id", dropId).eq("offering_id", offeringId).eq("service_date", manilaDate()).single();
  assert.equal(row.error, null);
  return row.data.committed;
}

async function header(id: string) {
  const row = await service.from("orders").select("id, updated_at, status, payment, customer_name, customer_phone, delivery_address, notes, subtotal_centavos, total_centavos").eq("id", id).single();
  assert.equal(row.error, null);
  return row.data;
}

async function linesOf(id: string) {
  const rows = await service.from("order_lines").select("id, product_id, size_id, offering_id, quantity, unit_price_centavos").eq("order_id", id).order("line_no");
  assert.equal(rows.error, null);
  return rows.data;
}

async function transition(id: string, status: string) {
  const current = await header(id);
  return applyOrderChange("transition_order", { orderId: id, updatedAt: current.updated_at, status }, "admin");
}

function offering(id: string, allocated: number, date: string, sortOrder = 0) {
  return {
    id, kind: "size", name: "Keylime", priceCentavos: 24000, perOrderMax: 4,
    productId: "keylime", sizeId: "4-inch", sortOrder, components: [],
    dates: [{ date, included: true, allocated }],
  };
}

async function publishDrop(id: string, offerings: unknown[], delivery = false) {
  const date = manilaDate();
  let store = await loadDrops();
  const saved = await applyDropChange("save_drop", {
    revision: store.revision,
    id,
    locationId: "manila",
    name: "Phase 4 market",
    address: "Ayala Avenue, Makati",
    mapUrl: "",
    deliveryEnabled: delivery,
    dates: [{
      date,
      orderingOpens: "00:00",
      orderingCutoff: "23:59",
      pickupStarts: "00:00",
      pickupEnds: "23:59",
      dispatchStarts: delivery ? "00:00" : null,
      dispatchEnds: delivery ? "23:59" : null,
    }],
    offerings,
    addons: [{ addOnId: "birthday-topper", priceCentavos: 800, sortOrder: 0 }],
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  store = await loadDrops();
  const drop = store.drops.find((item) => item.id === id);
  const published = await applyDropChange("publish_drop", { revision: store.revision, id, updatedAt: drop?.updatedAt });
  assert.equal(published.status, 200, JSON.stringify(published.body));
}

function outsideTodayWindow() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date()));
  return hour < 12 ? { opens: "18:00", cutoff: "19:00" } : { opens: "00:00", cutoff: "01:00" };
}

async function cleanup() {
  await service.from("orders").delete().in("drop_id", drops);
  await service.from("orders").delete().like("customer_name", "Phase4%");
  await service.from("drops").delete().in("id", drops);
  await service.from("schedule_date_overrides").delete().eq("location_id", "cebu").eq("service_date", manilaDate());
}

test("reviewed prices, retries, numbering, stock, privacy, and the lineup", async () => {
  await cleanup();
  const email = `phase4-${randomUUID()}@example.com`;
  const created = await service.auth.admin.createUser({ email, password: "correct-horse", email_confirm: true });
  const userId = created.data.user?.id;
  assert.ok(userId);
  try {
    await service.from("admin_users").insert({ user_id: userId });
    const anonymous = await adminOrdersGet(request("/api/admin/orders"));
    assert.equal(anonymous.status, 401);
    const hiddenLineup = await lineupGet(request(`/api/admin/lineup?date=${manilaDate()}`));
    assert.equal(hiddenLineup.status, 401);
    const blocked = await readJson(await publicOrders(request("/api/public/orders", { method: "POST", origin: "https://evil.example", body: regularCart("phase4-blocked-origin") })));
    assert.equal(blocked.status, 403);

    const changed = await placePublic(regularCart("phase4-price-change", {
      lines: [{ productId: "keylime", sizeId: "4-inch", quantity: 1, unitPriceCentavos: 1 }],
    }));
    assert.equal(changed.status, 409);
    assert.equal(changed.body.error, "price_change");
    assert.equal(changed.body.lines[0].unitPriceCentavos, 24000);
    const unsaved = await service.from("order_idempotency").select("idempotency_key", { count: "exact", head: true }).eq("idempotency_key", "phase4-price-change");
    assert.equal(unsaved.count, 0);

    const placed = await placePublic(regularCart("phase4-replay"));
    assert.equal(placed.status, 200, JSON.stringify(placed.body));
    assert.equal(placed.body.replayed, false);
    assert.match(placed.body.orderNumber, /^MP-\d{4}\d{3,}$/);
    const replay = await placePublic(regularCart("phase4-replay", { customerPhone: "09170000000" }));
    assert.equal(replay.status, 200);
    assert.equal(replay.body.replayed, true);
    assert.equal(replay.body.orderNumber, placed.body.orderNumber);
    const mismatch = await placePublic(regularCart("phase4-replay", {
      lines: [{ productId: "keylime", sizeId: "4-inch", quantity: 2, unitPriceCentavos: 24000 }],
    }));
    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.body.error, "idempotency_mismatch");
    const copies = await service.from("orders").select("id", { count: "exact", head: true }).eq("order_number", placed.body.orderNumber);
    assert.equal(copies.count, 1);

    const today = manilaDate();
    const monthDay = today.slice(5, 7) + today.slice(8, 10);
    const current = await service.from("daily_order_sequences").select("last_value").eq("service_date", today).maybeSingle();
    assert.equal(current.error, null);
    if (!current.data) {
      const inserted = await service.from("daily_order_sequences").insert({ service_date: today, last_value: 999 });
      assert.equal(inserted.error, null);
    } else if (current.data.last_value < 999) {
      const raised = await service.from("daily_order_sequences").update({ last_value: 999 }).eq("service_date", today);
      assert.equal(raised.error, null);
    }
    const wide = await placePublic(regularCart("phase4-wide-number"));
    assert.equal(wide.status, 200, JSON.stringify(wide.body));
    const wideDigits = String(wide.body.orderNumber).slice(7);
    assert.equal(String(wide.body.orderNumber).slice(3, 7), monthDay);
    assert.ok(Number(wideDigits) >= 1000);
    assert.equal(wideDigits, String(Number(wideDigits)));

    const source = await service.from("orders").select("*").eq("id", wide.body.orderId).single();
    assert.equal(source.error, null);
    const priorYear = `${Number(String(source.data.sequence_date).slice(0, 4)) - 1}${String(source.data.sequence_date).slice(4, 10)}`;
    const earlier = await service.from("orders").insert({
      order_number: source.data.order_number,
      sequence_date: priorYear,
      sequence_no: source.data.sequence_no,
      channel: source.data.channel,
      location_id: source.data.location_id,
      fulfillment_date: source.data.fulfillment_date,
      fulfillment: source.data.fulfillment,
      slot_id: source.data.slot_id,
      window_starts: source.data.window_starts,
      window_ends: source.data.window_ends,
      status: "pending",
      payment: "unpaid",
      subtotal_centavos: source.data.subtotal_centavos,
      total_centavos: source.data.total_centavos,
      customer_name: "Phase4 Earlier",
      customer_phone: "09171234567",
      submitted_after_hours: false,
    }).select("id").single();
    assert.equal(earlier.error, null, earlier.error?.message);
    const signedIn = await signIn(request("/api/admin/session", { method: "POST", body: { email, password: "correct-horse" } }));
    assert.equal(signedIn.status, 200);
    const cookie = refreshCookie(signedIn);
    assert.ok(cookie);
    const foundResponse = await adminOrdersGet(request(`/api/admin/orders?q=${wide.body.orderNumber}`, { cookie }));
    const found = await readJson(foundResponse);
    const ownerCookie = refreshCookie(foundResponse) ?? cookie;
    assert.equal(found.status, 200, JSON.stringify(found.body));
    assert.equal(found.body.orders.length, 2);
    assert.ok(found.body.orders[0].sequenceDate > found.body.orders[1].sequenceDate);

    const date = manilaDate();
    await publishDrop("phase4-roll", [offering("pie-a", 5, date, 0), offering("pie-b", 0, date, 1), offering("pie-c", 1, date, 2)]);
    const rolled = await placePublic(dropCart("phase4-roll", [
      { offeringId: "pie-a", quantity: 1, unitPriceCentavos: 24000 },
      { offeringId: "pie-b", quantity: 1, unitPriceCentavos: 24000 },
      { offeringId: "pie-c", quantity: 2, unitPriceCentavos: 24000 },
    ], "phase4-rollback"));
    assert.equal(rolled.status, 409, JSON.stringify(rolled.body));
    assert.equal(rolled.body.error, "unavailable");
    assert.deepEqual(rolled.body.offerings, [{ id: "pie-b", remaining: 0 }, { id: "pie-c", remaining: 1 }]);
    assert.equal(await committed("phase4-roll", "pie-a"), 0);
    assert.equal(await committed("phase4-roll", "pie-b"), 0);
    assert.equal(await committed("phase4-roll", "pie-c"), 0);
    const adjusted = await placePublic(dropCart("phase4-roll", [
      { offeringId: "pie-a", quantity: 1, unitPriceCentavos: 24000 },
      { offeringId: "pie-c", quantity: 1, unitPriceCentavos: 24000 },
    ], "phase4-rollback-adjusted"));
    assert.equal(adjusted.status, 200, JSON.stringify(adjusted.body));
    assert.equal(await committed("phase4-roll", "pie-a"), 1);
    assert.equal(await committed("phase4-roll", "pie-c"), 1);

    await publishDrop("phase4-last", [offering("solo", 1, date)]);
    const publicStock = async () => {
      const response = await publicDropGet(new Request("http://localhost/api/public/drops/phase4-last"));
      assert.equal(response.status, 200);
      return (await response.json()).dates[0].offerings[0].remaining;
    };
    assert.equal(await publicStock(), 1);
    const [first, second] = await Promise.all([
      placePublic(dropCart("phase4-last", [{ offeringId: "solo", quantity: 1, unitPriceCentavos: 24000 }], "phase4-race-a")),
      placePublic(dropCart("phase4-last", [{ offeringId: "solo", quantity: 1, unitPriceCentavos: 24000 }], "phase4-race-b")),
    ]);
    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    const loser = first.status === 409 ? first : second;
    assert.equal(loser.body.error, "unavailable");
    assert.equal(loser.body.offerings[0].remaining, 0);
    assert.equal(await committed("phase4-last", "solo"), 1);
    assert.equal(await publicStock(), 0);

    await publishDrop("phase4-market", [
      offering("keylime-4", 8, date, 0),
      {
        id: "box", kind: "package", name: "Box of four", priceCentavos: 86000, perOrderMax: 2,
        productId: null, sizeId: null, sortOrder: 1,
        components: [
          { productId: "keylime", sizeId: "4-inch", quantity: 2 },
          { productId: "pecan", sizeId: "4-inch", quantity: 2 },
        ],
        dates: [{ date, included: true, allocated: 4 }],
      },
    ]);
    const bookingStore = await loadDrops();
    const bookedDrop = bookingStore.drops.find(item => item.id === "phase4-market");
    assert.ok(bookedDrop);
    const draft = { ...bookedDrop, revision: bookingStore.revision };
    const cancelling = await placePublic(dropCart("phase4-market", [{ offeringId: "keylime-4", quantity: 2, unitPriceCentavos: 24000 }], "phase4-cancel"));
    assert.equal(cancelling.status, 200, JSON.stringify(cancelling.body));
    assert.equal(await committed("phase4-market", "keylime-4"), 2);
    const removeBookedDate = await applyDropChange("save_drop", {
      ...draft, dates: [], offerings: draft.offerings.map(item => ({ ...item, dates: [] })),
    });
    assert.deepEqual(removeBookedDate, { status: 409, body: { error: "booked_date_locked" } });
    const shiftBookedWindow = await applyDropChange("save_drop", {
      ...draft, dates: draft.dates.map(item => ({ ...item, pickupStarts: "01:00" })),
    });
    assert.deepEqual(shiftBookedWindow, { status: 409, body: { error: "booked_date_locked" } });
    const removeCommitted = await applyDropChange("save_drop", {
      ...draft, offerings: draft.offerings.map(item => item.id === "keylime-4" ? { ...item, dates: [] } : item),
    });
    assert.deepEqual(removeCommitted, { status: 409, body: { error: "committed_allocation" } });
    const reduceCommitted = await applyDropChange("save_drop", {
      ...draft, offerings: draft.offerings.map(item => item.id === "keylime-4" ? {
        ...item, dates: item.dates.map(allocation => ({ ...allocation, allocated: 1 })),
      } : item),
    });
    assert.deepEqual(reduceCommitted, { status: 409, body: { error: "committed_allocation" } });
    const booked = await service.rpc("admin_booked_drop_dates");
    assert.ifError(booked.error);
    assert.ok(booked.data.some((item: { drop_id: string; date: string }) => item.drop_id === draft.id && item.date === date));
    const adjustOrderingHours = await applyDropChange("save_drop", {
      ...draft, dates: draft.dates.map(item => ({ ...item, orderingOpens: "00:01" })),
      offerings: draft.offerings.map(item => item.id === "keylime-4"
        ? { ...item, dates: item.dates.map(allocation => ({ ...allocation, included: false })) } : item),
    });
    assert.equal(adjustOrderingHours.status, 200, JSON.stringify(adjustOrderingHours.body));
    const cancelled = await transition(cancelling.body.orderId, "cancelled");
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.equal(await committed("phase4-market", "keylime-4"), 0);
    const wiped = await header(cancelling.body.orderId);
    assert.equal(wiped.customer_name, null);
    assert.equal(wiped.status, "cancelled");
    await service.from("orders").update({ status: "pending" }).eq("id", cancelling.body.orderId);
    const secondCancel = await transition(cancelling.body.orderId, "cancelled");
    assert.equal(secondCancel.status, 200, JSON.stringify(secondCancel.body));
    assert.equal(await committed("phase4-market", "keylime-4"), 0);

    const afterCancellation = await loadDrops();
    const reopen = afterCancellation.drops.find(item => item.id === draft.id);
    assert.ok(reopen);
    assert.equal((await applyDropChange("save_drop", {
      ...reopen, revision: afterCancellation.revision,
      offerings: reopen.offerings.map(item => ({ ...item, dates: item.dates.map(allocation => ({ ...allocation, included: true })) })),
    })).status, 200);

    const finishing = await placePublic(dropCart("phase4-market", [{ offeringId: "keylime-4", quantity: 1, unitPriceCentavos: 24000 }], "phase4-complete", { notes: "Call on arrival" }));
    assert.equal(finishing.status, 200, JSON.stringify(finishing.body));
    assert.equal((await transition(finishing.body.orderId, "confirmed")).status, 200);
    assert.equal((await transition(finishing.body.orderId, "paid")).status, 200);
    assert.equal((await transition(finishing.body.orderId, "completed")).status, 200);
    const finished = await header(finishing.body.orderId);
    assert.equal(finished.status, "completed");
    assert.equal(finished.customer_name, null);
    assert.equal(finished.customer_phone, null);
    assert.equal(finished.notes, null);
    assert.equal(await committed("phase4-market", "keylime-4"), 1);

    const packing = await placePublic(dropCart("phase4-market", [{ offeringId: "box", quantity: 1, unitPriceCentavos: 86000 }], "phase4-box", {
      addons: [{ id: "birthday-topper", quantity: 2, unitPriceCentavos: 800 }],
    }));
    assert.equal(packing.status, 200, JSON.stringify(packing.body));
    assert.equal((await transition(packing.body.orderId, "confirmed")).status, 200);
    const locked = await service.from("drop_offerings").select("contents_locked_at").eq("drop_id", "phase4-market").eq("id", "box").single();
    assert.ok(locked.data?.contents_locked_at);
    const waiting = await placePublic(dropCart("phase4-market", [{ offeringId: "keylime-4", quantity: 1, unitPriceCentavos: 24000 }], "phase4-pending"));
    assert.equal(waiting.status, 200, JSON.stringify(waiting.body));

    const queueUrl = (key: string, filters = "") => new URL(
      `http://127.0.0.1:3000/api/admin/orders?queue=${encodeURIComponent(key)}${filters}`,
    );
    const [regularQueue, marketQueue, lastQueue, marketAttention, excludedSearch, queueOptions] = await Promise.all([
      listOrders(queueUrl("regular:cebu", "&q=" + wide.body.orderNumber)),
      listOrders(queueUrl("drop:phase4-market")),
      listOrders(queueUrl("drop:phase4-last")),
      listOrders(queueUrl("drop:phase4-market", "&view=attention")),
      listOrders(queueUrl("regular:cebu", "&q=" + waiting.body.orderNumber)),
      listOrderQueues(),
    ]);
    assert.ok(regularQueue.total > 0);
    assert.ok(regularQueue.orders.every(order => order.channel === "regular" && order.locationId === "cebu"));
    assert.ok(marketQueue.orders.some(order => order.id === waiting.body.orderId));
    assert.ok(marketQueue.orders.every(order => order.dropId === "phase4-market" && order.sourceLabel === "Manila · Phase 4 market"));
    assert.equal(lastQueue.total, 1);
    assert.equal(lastQueue.orders[0].dropId, "phase4-last");
    assert.equal(marketAttention.total, 2);
    assert.equal(excludedSearch.total, 0);
    assert.ok(queueOptions.some(option => option.key === "regular:cebu" && option.group === "regular"));
    assert.ok(queueOptions.some(option => option.key === "drop:phase4-market" && option.group === "active"));
    const ended = await service.from("drops").update({ status: "ended" }).eq("id", "phase4-last");
    assert.equal(ended.error, null);
    assert.ok((await listOrderQueues()).some(option => option.key === "drop:phase4-last" && option.group === "past"));
    assert.equal((await findOrder(lastQueue.orders[0].id))?.queueKey, "drop:phase4-last");

    const lineupResponse = await lineupGet(request(`/api/admin/lineup?date=${date}`, { cookie: ownerCookie }));
    const lineup = await readJson(lineupResponse);
    const lineupCookie = refreshCookie(lineupResponse) ?? ownerCookie;
    assert.equal(lineup.status, 200, JSON.stringify(lineup.body));
    const group = lineup.body.groups.find((item: { dropId: string }) => item.dropId === "phase4-market");
    assert.ok(group);
    assert.deepEqual(group.packing.packages, [{ name: "Box of four", quantity: 1 }]);
    assert.deepEqual(group.packing.pies, [{ name: "Keylime", quantity: 1 }]);
    assert.deepEqual(group.packing.addons, [{ name: "Birthday Topper", quantity: 2 }]);
    assert.deepEqual(group.baking.map((item: { productId: string; quantity: number }) => [item.productId, item.quantity]), [["keylime", 3], ["pecan", 2]]);

    const quotedCart = regularCart("phase4-admin-delivery", {
      fulfillment: "delivery", deliveryAddress: "123 Mango Street, Cebu",
      deliveryFeeMode: "known", deliveryFeeCentavos: 0,
    });
    const adminDelivery = await applyOrderChange("place_order", quotedCart, "admin");
    assert.equal(adminDelivery.status, 200, JSON.stringify(adminDelivery.body));
    const detailResponse = await orderDetailGet(
      request(`/api/admin/orders/${adminDelivery.body.orderId}`, { cookie: lineupCookie }),
      { params: Promise.resolve({ id: adminDelivery.body.orderId }) },
    );
    const detail = await readJson(detailResponse);
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.ok(Number.isFinite(Date.parse(detail.body.createdAt)));
    assert.equal(detail.body.deliveryFeeMode, "known");
    assert.equal(detail.body.deliveryFeeCentavos, 0);
    assert.equal(detail.body.totalCentavos, detail.body.subtotalCentavos);
    assert.equal((await applyOrderChange("place_order", { ...quotedCart, deliveryFeeCentavos: 1000 }, "admin")).status, 409);

    const delivering = await placePublic(regularCart("phase4-delivery", {
      fulfillment: "delivery",
      deliveryAddress: "123 Mango Street, Cebu",
    }));
    assert.equal(delivering.status, 200, JSON.stringify(delivering.body));
    const openDelivery = await header(delivering.body.orderId);
    assert.equal(openDelivery.total_centavos, null);
    const blockedConfirm = await transition(delivering.body.orderId, "confirmed");
    assert.equal(blockedConfirm.status, 400);
    const deliveryLines = await linesOf(delivering.body.orderId);
    const quoted = await applyOrderChange("update_order", {
      orderId: delivering.body.orderId,
      updatedAt: openDelivery.updated_at,
      fulfillmentDate: addDays(manilaDate(), 1),
      fulfillment: "delivery",
      slotId: "10:00",
      deliveryFeeMode: "known",
      deliveryFeeCentavos: 0,
      lines: deliveryLines.map((line) => ({
        lineId: line.id,
        productId: line.product_id,
        sizeId: line.size_id,
        quantity: line.quantity,
        unitPriceCentavos: line.unit_price_centavos,
      })),
      customerName: "Phase4 Buyer",
      customerPhone: "09171234567",
      deliveryAddress: "123 Mango Street, Cebu",
      notes: "",
    }, "admin");
    assert.equal(quoted.status, 200, JSON.stringify(quoted.body));
    const quotedHeader = await header(delivering.body.orderId);
    assert.equal(quotedHeader.total_centavos, quotedHeader.subtotal_centavos);
    assert.equal((await transition(delivering.body.orderId, "confirmed")).status, 200);

    const prepaidDelivery = await placePublic(regularCart("phase4-paid-then-fee", {
      fulfillment: "delivery",
      deliveryAddress: "123 Mango Street, Cebu",
    }));
    assert.equal(prepaidDelivery.status, 200, JSON.stringify(prepaidDelivery.body));
    assert.equal((await transition(prepaidDelivery.body.orderId, "paid")).status, 200);
    const prepaidHeader = await header(prepaidDelivery.body.orderId);
    const prepaidLines = await linesOf(prepaidDelivery.body.orderId);
    const feeAfterPaid = await applyOrderChange("update_order", {
      orderId: prepaidDelivery.body.orderId,
      updatedAt: prepaidHeader.updated_at,
      fulfillmentDate: addDays(manilaDate(), 1),
      fulfillment: "delivery",
      slotId: "10:00",
      deliveryFeeMode: "known",
      deliveryFeeCentavos: 24000,
      lines: prepaidLines.map((line) => ({
        lineId: line.id,
        productId: line.product_id,
        sizeId: line.size_id,
        quantity: line.quantity,
        unitPriceCentavos: line.unit_price_centavos,
      })),
      customerName: "Phase4 Buyer",
      customerPhone: "09171234567",
      deliveryAddress: "123 Mango Street, Cebu",
      notes: "",
    }, "admin");
    assert.equal(feeAfterPaid.status, 200, JSON.stringify(feeAfterPaid.body));
    const prepaidSaved = await service.from("orders").select("payment, delivery_fee_mode, delivery_fee_centavos, subtotal_centavos, total_centavos").eq("id", prepaidDelivery.body.orderId).single();
    assert.equal(prepaidSaved.error, null);
    assert.equal(prepaidSaved.data.payment, "paid");
    assert.equal(prepaidSaved.data.delivery_fee_mode, "known");
    assert.equal(prepaidSaved.data.delivery_fee_centavos, 24000);
    assert.equal(prepaidSaved.data.total_centavos, prepaidSaved.data.subtotal_centavos + 24000);

    const riderOrder = await placePublic(regularCart("phase4-rider", {
      fulfillment: "delivery",
      deliveryAddress: "123 Mango Street, Cebu",
    }));
    assert.equal(riderOrder.status, 200, JSON.stringify(riderOrder.body));
    const riderHeader = await header(riderOrder.body.orderId);
    const riderLines = await linesOf(riderOrder.body.orderId);
    const riderUpdate = await applyOrderChange("update_order", {
      orderId: riderOrder.body.orderId,
      updatedAt: riderHeader.updated_at,
      fulfillmentDate: addDays(manilaDate(), 1),
      fulfillment: "delivery",
      slotId: "10:00",
      deliveryFeeMode: "rider",
      lines: riderLines.map((line) => ({
        lineId: line.id,
        productId: line.product_id,
        sizeId: line.size_id,
        quantity: line.quantity,
        unitPriceCentavos: line.unit_price_centavos,
      })),
      customerName: "Phase4 Buyer",
      customerPhone: "09171234567",
      deliveryAddress: "123 Mango Street, Cebu",
      notes: "",
    }, "admin");
    assert.equal(riderUpdate.status, 200, JSON.stringify(riderUpdate.body));
    const riderSaved = await service.from("orders").select("delivery_fee_mode, delivery_fee_centavos, subtotal_centavos, total_centavos").eq("id", riderOrder.body.orderId).single();
    assert.equal(riderSaved.error, null);
    assert.equal(riderSaved.data.delivery_fee_mode, "rider");
    assert.equal(riderSaved.data.delivery_fee_centavos, null);
    assert.equal(riderSaved.data.total_centavos, riderSaved.data.subtotal_centavos);
    assert.equal((await transition(riderOrder.body.orderId, "confirmed")).status, 200);

    const closedWindow = outsideTodayWindow();
    const catalog = await loadCatalog();
    const savedOverride = await applyCatalogChange("save_override", {
      revision: catalog.revision,
      locationId: "cebu",
      date: manilaDate(),
      closed: false,
      opens: closedWindow.opens,
      cutoff: closedWindow.cutoff,
    });
    assert.equal(savedOverride.status, 200, JSON.stringify(savedOverride.body));
    const afterHours = await placePublic(regularCart("phase4-after-hours"));
    assert.equal(afterHours.status, 200, JSON.stringify(afterHours.body));
    assert.equal(afterHours.body.submittedAfterHours, true);
    const storedFlag = await service.from("orders").select("submitted_after_hours").eq("id", afterHours.body.orderId).single();
    assert.equal(storedFlag.data?.submitted_after_hours, true);
    const override = (await loadCatalog()).overrides.find((item) => item.locationId === "cebu" && item.date === manilaDate());
    const removedOverride = await applyCatalogChange("delete_override", {
      revision: (await loadCatalog()).revision,
      locationId: "cebu",
      date: manilaDate(),
      updatedAt: override?.updatedAt,
    });
    assert.equal(removedOverride.status, 200, JSON.stringify(removedOverride.body));

    const editable = await header(placed.body.orderId);
    const editableLines = await linesOf(placed.body.orderId);
    const edit = {
      orderId: placed.body.orderId,
      updatedAt: editable.updated_at,
      fulfillmentDate: addDays(manilaDate(), 1),
      fulfillment: "pickup",
      slotId: "10:00",
      lines: editableLines.map((line) => ({
        lineId: line.id,
        productId: line.product_id,
        sizeId: line.size_id,
        quantity: line.quantity,
        unitPriceCentavos: line.unit_price_centavos,
      })),
      customerName: "Phase4 Buyer",
      customerPhone: "09171234567",
      notes: "Gate code 12",
    };
    const savedEdit = await adminOrdersPost(request("/api/admin/orders", {
      method: "POST",
      cookie: lineupCookie,
      body: { action: "update_order", payload: edit },
    }));
    assert.equal(savedEdit.status, 200, JSON.stringify(await savedEdit.clone().json()));
    const stale = await applyOrderChange("update_order", { ...edit, notes: "A later note" }, "admin");
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, "stale_save");
    assert.equal((await header(placed.body.orderId)).notes, "Gate code 12");
  } finally {
    await cleanup();
    if (userId) await service.auth.admin.deleteUser(userId);
  }
});
