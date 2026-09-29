import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { emulatorEnv } from "../scripts/emulator-env.mjs";
Object.assign(process.env, emulatorEnv);

describe("orders emulator", { concurrency: false }, () => {
test("allocation hold, retry, and guest access", async (t) => {
  let reachable = false;
  try {
    const probe = await fetch("http://127.0.0.1:8080", { signal: AbortSignal.timeout(800) });
    reachable = probe.status > 0;
  } catch {
    reachable = false;
  }
  if (!reachable) {
    t.skip("Firestore emulator is not running");
    return;
  }
  const { getServerFirebase } = await import("../src/lib/firebase/server");
  const { db } = getServerFirebase();
  const { submitOrder, readGuestOrder, saveBranchAllocations } = await import("../src/lib/orders/store");
  const { readPublicMenu } = await import("../src/lib/products/public");
  const { addCalendarDays, slotsForDate } = await import("../src/lib/scheduling/rules");
  const { readScheduleSettings } = await import("../src/lib/scheduling/store");
  const { manilaDate } = await import("../src/lib/catalog/rules");
  const { flavorCapacityKey } = await import("../src/lib/orders/allocation");
  const menu = await readPublicMenu();
  const products = menu.catalog?.products.filter((item) => item.active && item.variants.some((variant) => variant.active && variant.minLeadDays === 0)) ?? [];
  const product = products[0];
  const other = products.find((item) => item.id !== product?.id);
  if (!product) {
    t.skip("Demo catalog is not initialized");
    return;
  }
  const variant = product.variants.find((item) => item.active && item.minLeadDays === 0)!;
  const otherVariant = other?.variants.find((item) => item.active && item.minLeadDays === 0);
  const date = addCalendarDays(manilaDate(), 3);
  const slot = slotsForDate(await readScheduleSettings(), "cebu", date, new Date())[0];
  if (!slot) {
    t.skip("Cebu has no open slot on the test date");
    return;
  }
  const key = flavorCapacityKey("cebu", date, product.id);
  const otherKey = other ? flavorCapacityKey("cebu", date, other.id) : "";
  const before = await db.doc(`allocations/${key}`).get();
  const otherBefore = otherKey ? await db.doc(`allocations/${otherKey}`).get() : null;
  const firstKey = crypto.randomUUID();
  const secondKey = crypto.randomUUID();
  const created: string[] = [];
  const body = (idempotencyKey: string, lines: { productId: string; variantId: string; quantity: number }[]) => ({
    idempotencyKey,
    branchId: "cebu",
    slotId: slot.id,
    name: "Capacity Test",
    contact: "09170000000",
    notes: "",
    delivery: "pickup" as const,
    address: "",
    payment: "bank" as const,
    selection: { date, lines: lines.map((line) => ({ ...line, addons: [] })), addons: [] },
  });
  try {
    if (other && otherVariant) {
      if (otherBefore?.exists) await db.doc(`allocations/${otherKey}`).delete();
      const openKey = crypto.randomUUID();
      await submitOrder(body(openKey, [{ productId: other.id, variantId: otherVariant.id, quantity: 2 }]));
      const openIdempotency = await db.doc(`orderIdempotency/${openKey}`).get();
      if (openIdempotency.exists) created.push(String(openIdempotency.data()?.orderId));
      const openDoc = await db.doc(`allocations/${otherKey}`).get();
      assert.equal(openDoc.data()?.limit ?? null, null);
      assert.equal(openDoc.data()?.held, 2);
      if (openIdempotency.exists) await openIdempotency.ref.delete();
      if (otherBefore?.exists) await db.doc(`allocations/${otherKey}`).set(otherBefore.data()!);
      else await db.doc(`allocations/${otherKey}`).delete();
    }
    await saveBranchAllocations({ branchId: "cebu", productId: product.id, days: [{ fulfillmentDate: date, limit: 1, version: before.data()?.version ?? 0 }] }, "orders-integration");
    const results = await Promise.allSettled([
      submitOrder(body(firstKey, [{ productId: product.id, variantId: variant.id, quantity: 1 }])),
      submitOrder(body(secondKey, [{ productId: product.id, variantId: variant.id, quantity: 1 }])),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    assert.equal(fulfilled.length, 1);
    const winner = fulfilled[0].status === "fulfilled" ? fulfilled[0].value : null;
    assert.ok(winner);
    const winnerKey = (await db.doc(`orderIdempotency/${firstKey}`).get()).exists ? firstKey : secondKey;
    const replay = await submitOrder(body(winnerKey, [{ productId: product.id, variantId: variant.id, quantity: 1 }]));
    assert.equal(replay.orderNumber, winner.orderNumber);
    assert.equal(replay.token, winner.token);
    assert.equal((await db.doc(`allocations/${key}`).get()).data()?.held, 1);
    const winnerOrderId = String((await db.doc(`orderIdempotency/${winnerKey}`).get()).data()?.orderId);
    assert.deepEqual((await db.doc(`orders/${winnerOrderId}`).get()).data()?.heldFlavors, [{ productId: product.id, quantity: 1 }]);
    assert.equal(await readGuestOrder("not-a-real-token-value-here"), null);
    assert.equal((await readGuestOrder(winner.token))?.orderNumber, winner.orderNumber);
    if (other && otherVariant) {
      const pecanKey = crypto.randomUUID();
      await saveBranchAllocations({ branchId: "cebu", productId: other.id, days: [{ fulfillmentDate: date, limit: 3, version: otherBefore?.data()?.version ?? 0 }] }, "orders-integration");
      await submitOrder(body(pecanKey, [{ productId: other.id, variantId: otherVariant.id, quantity: 1 }]));
      assert.equal((await db.doc(`allocations/${otherKey}`).get()).data()?.held, 1);
      await assert.rejects(
        () => submitOrder(body(crypto.randomUUID(), [
          { productId: product.id, variantId: variant.id, quantity: 1 },
          { productId: other.id, variantId: otherVariant.id, quantity: 1 },
        ])),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /online availability/);
          assert.doesNotMatch(error.message, /sold out|full/i);
          return true;
        },
      );
      assert.equal((await db.doc(`allocations/${key}`).get()).data()?.held, 1);
      assert.equal((await db.doc(`allocations/${otherKey}`).get()).data()?.held, 1);
      const pecanDoc = await db.doc(`orderIdempotency/${pecanKey}`).get();
      if (pecanDoc.exists) {
        created.push(String(pecanDoc.data()?.orderId));
        await pecanDoc.ref.delete();
      }
    }
    for (const idempotencyKey of [firstKey, secondKey]) {
      const idempotency = await db.doc(`orderIdempotency/${idempotencyKey}`).get();
      if (idempotency.exists) {
        created.push(String(idempotency.data()?.orderId));
        await idempotency.ref.delete();
      }
    }
    assert.equal(new Set(created.filter(Boolean)).size, other && otherVariant ? 3 : 1);
  } finally {
    for (const id of created) if (id) await db.doc(`orders/${id}`).delete();
    if (before.exists) await db.doc(`allocations/${key}`).set(before.data()!);
    else await db.doc(`allocations/${key}`).delete();
    if (otherBefore?.exists) await db.doc(`allocations/${otherKey}`).set(otherBefore.data()!);
    else if (otherKey) await db.doc(`allocations/${otherKey}`).delete();
  }
});

test("processing, approval, rejection, and one-time expiration", async (t) => {
  let reachable = false;
  try {
    const probe = await fetch("http://127.0.0.1:8080", { signal: AbortSignal.timeout(800) });
    reachable = probe.status > 0;
  } catch {
    reachable = false;
  }
  if (!reachable) {
    t.skip("Firestore emulator is not running");
    return;
  }
  const { getServerFirebase } = await import("../src/lib/firebase/server");
  const { db } = getServerFirebase();
  const { submitOrder, readGuestOrder, readHeldOrders, saveBranchAllocations, expireDueHolds, transitionOrder } = await import("../src/lib/orders/store");
  const { ProductError } = await import("../src/lib/products/store");
  const { readPublicMenu } = await import("../src/lib/products/public");
  const { addCalendarDays, slotsForDate } = await import("../src/lib/scheduling/rules");
  const { readScheduleSettings } = await import("../src/lib/scheduling/store");
  const { manilaDate } = await import("../src/lib/catalog/rules");
  const { flavorCapacityKey } = await import("../src/lib/orders/allocation");
  const menu = await readPublicMenu();
  const products = menu.catalog?.products.filter((item) => item.active && item.variants.some((variant) => variant.active && variant.minLeadDays === 0)) ?? [];
  const product = products[0];
  const other = products.find((item) => item.id !== product?.id);
  if (!product) {
    t.skip("Demo catalog is not initialized");
    return;
  }
  const variant = product.variants.find((item) => item.active && item.minLeadDays === 0)!;
  const otherVariant = other?.variants.find((item) => item.active && item.minLeadDays === 0);
  const date = addCalendarDays(manilaDate(), 9);
  const slot = slotsForDate(await readScheduleSettings(), "cebu", date, new Date())[0];
  if (!slot) {
    t.skip("Cebu has no open slot on the test date");
    return;
  }
  const owner = { uid: "phase4-owner", email: "owner@example.test", role: "owner" as const, active: true, branchIds: [] };
  const staff = { uid: "phase4-staff", email: "staff@example.test", role: "staff" as const, active: true, branchIds: ["manila"] };
  const key = flavorCapacityKey("cebu", date, product.id);
  const otherKey = other && otherVariant ? flavorCapacityKey("cebu", date, other.id) : "";
  const before = await db.doc(`allocations/${key}`).get();
  const otherBefore = otherKey ? await db.doc(`allocations/${otherKey}`).get() : null;
  const created: string[] = [];
  const idempotencyKeys: string[] = [];
  const heldOf = async (allocationKey: string) => (await db.doc(`allocations/${allocationKey}`).get()).data()?.held ?? 0;
  const body = (idempotencyKey: string, lines: { productId: string; variantId: string; quantity: number }[]) => ({
    idempotencyKey,
    branchId: "cebu" as const,
    slotId: slot.id,
    name: "Phase Four",
    contact: "09170000001",
    notes: "",
    delivery: "pickup" as const,
    address: "",
    payment: "bank" as const,
    selection: { date, lines: lines.map((line) => ({ ...line, addons: [] })), addons: [] },
  });
  async function place(lines: { productId: string; variantId: string; quantity: number }[]) {
    const idempotencyKey = crypto.randomUUID();
    idempotencyKeys.push(idempotencyKey);
    const saved = await submitOrder(body(idempotencyKey, lines));
    const orderId = String((await db.doc(`orderIdempotency/${idempotencyKey}`).get()).data()?.orderId);
    created.push(orderId);
    return { ...saved, orderId };
  }
  async function orderData(orderId: string) {
    return (await db.doc(`orders/${orderId}`).get()).data()!;
  }
  try {
    await saveBranchAllocations({ branchId: "cebu", productId: product.id, days: [{ fulfillmentDate: date, limit: (before.data()?.held ?? 0) + 30, version: before.data()?.version ?? 0 }] }, "phase4");
    if (other && otherVariant && otherKey) {
      await saveBranchAllocations({ branchId: "cebu", productId: other.id, days: [{ fulfillmentDate: date, limit: (otherBefore?.data()?.held ?? 0) + 30, version: otherBefore?.data()?.version ?? 0 }] }, "phase4");
    }
    const flavorLines = other && otherVariant
      ? [{ productId: product.id, variantId: variant.id, quantity: 1 }, { productId: other.id, variantId: otherVariant.id, quantity: 2 }]
      : [{ productId: product.id, variantId: variant.id, quantity: 2 }];
    const expiring = await place(flavorLines);
    const heldBeforeExpire = await heldOf(key);
    const otherHeldBeforeExpire = otherKey ? await heldOf(otherKey) : 0;
    await db.doc(`orders/${expiring.orderId}`).update({ deadline: new Date(Date.now() - 1000).toISOString() });
    const guestExpired = await readGuestOrder(expiring.token);
    assert.equal(guestExpired?.status, "expired");
    assert.equal(guestExpired?.statusLabel, "Expired");
    assert.equal(guestExpired?.message, "This hold ended.");
    assert.equal(Object.hasOwn(guestExpired ?? {}, "contact"), false);
    assert.equal(Object.hasOwn(guestExpired ?? {}, "address"), false);
    assert.equal(await heldOf(key), heldBeforeExpire - (other && otherVariant ? 1 : 2));
    if (otherKey) assert.equal(await heldOf(otherKey), otherHeldBeforeExpire - 2);
    const expiredDoc = await orderData(expiring.orderId);
    assert.equal(expiredDoc.capacityReleased, true);
    assert.equal(expiredDoc.events[0].actorUid, "system");
    assert.equal(expiredDoc.events[0].previousStatus, "requested");
    assert.equal(expiredDoc.events[0].status, "expired");
    await expireDueHolds();
    assert.equal(await heldOf(key), heldBeforeExpire - (other && otherVariant ? 1 : 2));
    if (otherKey) assert.equal(await heldOf(otherKey), otherHeldBeforeExpire - 2);

    const reviewing = await place([{ productId: product.id, variantId: variant.id, quantity: 1 }]);
    const heldBeforeReview = await heldOf(key);
    await assert.rejects(
      () => transitionOrder({ orderId: reviewing.orderId, action: "processing", expectedStatus: "requested" }, staff),
      (error: unknown) => error instanceof ProductError && error.status === 403,
    );
    const started = await transitionOrder({ orderId: reviewing.orderId, action: "processing", expectedStatus: "requested" }, owner);
    assert.equal(started.order.status, "processing");
    assert.equal(started.conflict, undefined);
    assert.ok(started.order.processingStartedAt);
    assert.equal(started.order.events[0].actorUid, owner.uid);
    assert.equal(started.order.events[0].previousStatus, "requested");
    assert.equal(started.order.events[0].status, "processing");
    assert.equal(await heldOf(key), heldBeforeReview);
    await db.doc(`orders/${reviewing.orderId}`).update({ deadline: new Date(Date.now() - 1000).toISOString() });
    await expireDueHolds();
    assert.equal((await orderData(reviewing.orderId)).status, "processing");
    assert.equal(await heldOf(key), heldBeforeReview);
    const guestReview = await readGuestOrder(reviewing.token);
    assert.equal(guestReview?.statusLabel, "Processing");
    assert.equal(guestReview?.message, "Staff are reviewing this request. The hold stays in place.");
    assert.equal(Object.hasOwn(guestReview ?? {}, "contact"), false);

    const racing = await place([{ productId: product.id, variantId: variant.id, quantity: 1 }]);
    const heldBeforeRace = await heldOf(key);
    const boundary = new Date();
    await db.doc(`orders/${racing.orderId}`).update({ deadline: boundary.toISOString() });
    await Promise.all([
      transitionOrder({ orderId: racing.orderId, action: "processing", expectedStatus: "requested" }, owner, boundary),
      expireDueHolds(boundary),
    ]);
    const raced = await orderData(racing.orderId);
    assert.ok(raced.status === "expired" || raced.status === "processing");
    const heldAfterRace = await heldOf(key);
    assert.equal(heldAfterRace, raced.status === "expired" ? heldBeforeRace - 1 : heldBeforeRace);
    assert.ok(heldAfterRace >= 0);
    await expireDueHolds(new Date(boundary.getTime() + 60_000));
    const racedAgain = await transitionOrder({ orderId: racing.orderId, action: "reject", expectedStatus: "requested", reason: "Again" }, owner);
    assert.ok(racedAgain.conflict);
    assert.equal(await heldOf(key), heldAfterRace);

    const approving = await place([{ productId: product.id, variantId: variant.id, quantity: 1 }]);
    const pendingGuest = await readGuestOrder(approving.token);
    assert.equal(pendingGuest?.statusLabel, "Pending validation");
    assert.equal(pendingGuest?.message, "Staff still need to confirm this request. Approval is not complete.");
    await transitionOrder({ orderId: approving.orderId, action: "processing", expectedStatus: "requested" }, owner);
    const heldBeforeApproval = await heldOf(key);
    const approved = await transitionOrder({ orderId: approving.orderId, action: "approve", expectedStatus: "processing" }, owner);
    assert.equal(approved.order.status, "confirmed");
    assert.equal(approved.order.events.at(-1)?.actorUid, owner.uid);
    assert.equal(approved.order.events.at(-1)?.previousStatus, "processing");
    assert.equal(approved.order.events.at(-1)?.status, "confirmed");
    assert.equal(await heldOf(key), heldBeforeApproval);
    assert.notEqual((await orderData(approving.orderId)).capacityReleased, true);
    const guestApproved = await readGuestOrder(approving.token);
    assert.equal(guestApproved?.statusLabel, "Approved");
    assert.equal(guestApproved?.message, "This request is approved. Payment is arranged separately.");
    assert.doesNotMatch(guestApproved?.message ?? "", /\bpaid\b/i);
    const inbox = await readHeldOrders(owner);
    assert.equal(inbox.find((order) => order.id === approving.orderId)?.status, "confirmed");
    assert.equal(inbox.some((order) => order.id === reviewing.orderId), true);

    const rejecting = await place([{ productId: product.id, variantId: variant.id, quantity: 1 }]);
    const heldBeforeReject = await heldOf(key);
    const rejected = await transitionOrder({ orderId: rejecting.orderId, action: "reject", expectedStatus: "requested", reason: "We can't make this date." }, owner);
    assert.equal(rejected.order.status, "cancelled");
    assert.equal(rejected.order.events[0].reason, "We can't make this date.");
    assert.equal(rejected.order.events[0].actorUid, owner.uid);
    assert.equal(rejected.order.events[0].previousStatus, "requested");
    assert.equal(rejected.order.events[0].status, "cancelled");
    assert.equal(await heldOf(key), heldBeforeReject - 1);
    const rejectedAgain = await transitionOrder({ orderId: rejecting.orderId, action: "reject", expectedStatus: "requested", reason: "Again" }, owner);
    assert.equal(rejectedAgain.conflict, "This request changed. Reload it and try again.");
    assert.equal(await heldOf(key), heldBeforeReject - 1);
    const guestCancelled = await readGuestOrder(rejecting.token);
    assert.equal(guestCancelled?.statusLabel, "Cancelled");
    assert.equal(guestCancelled?.message, "This request was not approved.");

    const stale = await place([{ productId: product.id, variantId: variant.id, quantity: 1 }]);
    await transitionOrder({ orderId: stale.orderId, action: "processing", expectedStatus: "requested" }, owner);
    const heldBeforeStale = await heldOf(key);
    const conflicted = await transitionOrder({ orderId: stale.orderId, action: "reject", expectedStatus: "requested", reason: "Stale page" }, owner);
    assert.equal(conflicted.conflict, "This request changed. Reload it and try again.");
    assert.equal(conflicted.order.status, "processing");
    assert.equal(await heldOf(key), heldBeforeStale);
    assert.equal(await readGuestOrder("not-a-real-token-value-here"), null);

    const floored = await place([{ productId: product.id, variantId: variant.id, quantity: 1 }]);
    await db.doc(`allocations/${key}`).update({ held: 0 });
    await db.doc(`orders/${floored.orderId}`).update({ deadline: new Date(Date.now() - 1000).toISOString() });
    await expireDueHolds();
    assert.equal((await orderData(floored.orderId)).status, "expired");
    assert.equal(await heldOf(key), 0);
  } finally {
    for (const idempotencyKey of idempotencyKeys) await db.doc(`orderIdempotency/${idempotencyKey}`).delete();
    for (const id of created) if (id) await db.doc(`orders/${id}`).delete();
    if (before.exists) await db.doc(`allocations/${key}`).set(before.data()!);
    else await db.doc(`allocations/${key}`).delete();
    if (otherBefore?.exists) await db.doc(`allocations/${otherKey}`).set(otherBefore.data()!);
    else if (otherKey) await db.doc(`allocations/${otherKey}`).delete();
  }
});

test("pickup payment, preparation, and completion", async (t) => {
  let reachable = false;
  try {
    const probe = await fetch("http://127.0.0.1:8080", { signal: AbortSignal.timeout(800) });
    reachable = probe.status > 0;
  } catch {
    reachable = false;
  }
  if (!reachable) {
    t.skip("Firestore emulator is not running");
    return;
  }
  const { getServerFirebase } = await import("../src/lib/firebase/server");
  const { db } = getServerFirebase();
  const { submitOrder, readGuestOrder, readHeldOrders, saveBranchAllocations, transitionOrder } = await import("../src/lib/orders/store");
  const { readPublicMenu } = await import("../src/lib/products/public");
  const { addCalendarDays, slotsForDate } = await import("../src/lib/scheduling/rules");
  const { readScheduleSettings } = await import("../src/lib/scheduling/store");
  const { manilaDate } = await import("../src/lib/catalog/rules");
  const { flavorCapacityKey } = await import("../src/lib/orders/allocation");
  const menu = await readPublicMenu();
  const product = menu.catalog?.products.find((item) => item.active && item.variants.some((variant) => variant.active && variant.minLeadDays === 0 && variant.pricingMode === "fixed"));
  if (!product) {
    t.skip("Demo catalog is not initialized");
    return;
  }
  const variant = product.variants.find((item) => item.active && item.minLeadDays === 0 && item.pricingMode === "fixed")!;
  const date = addCalendarDays(manilaDate(), 11);
  const slot = slotsForDate(await readScheduleSettings(), "cebu", date, new Date())[0];
  if (!slot) {
    t.skip("Cebu has no open slot on the test date");
    return;
  }
  const owner = { uid: "phase5-owner", email: "owner@example.test", role: "owner" as const, active: true, branchIds: [] };
  const key = flavorCapacityKey("cebu", date, product.id);
  const before = await db.doc(`allocations/${key}`).get();
  const created: string[] = [];
  const idempotencyKeys: string[] = [];
  const heldOf = async () => (await db.doc(`allocations/${key}`).get()).data()?.held ?? 0;
  async function place(delivery: "pickup" | "lalamove" = "pickup") {
    const idempotencyKey = crypto.randomUUID();
    idempotencyKeys.push(idempotencyKey);
    const saved = await submitOrder({
      idempotencyKey,
      branchId: "cebu",
      slotId: slot.id,
      name: "Phase Five",
      contact: "09170000003",
      notes: "",
      delivery,
      address: delivery === "lalamove" ? "Banilad, Cebu City" : "",
      payment: "gcash",
      selection: { date, lines: [{ productId: product!.id, variantId: variant.id, quantity: 1, addons: [] }], addons: [] },
    });
    const orderId = String((await db.doc(`orderIdempotency/${idempotencyKey}`).get()).data()?.orderId);
    created.push(orderId);
    return { ...saved, orderId };
  }
  async function stored(orderId: string) {
    return (await db.doc(`orders/${orderId}`).get()).data()!;
  }
  try {
    await saveBranchAllocations({ branchId: "cebu", productId: product.id, days: [{ fulfillmentDate: date, limit: (before.data()?.held ?? 0) + 8, version: before.data()?.version ?? 0 }] }, "phase5");
    const pickup = await place();
    const heldAtApproval = await heldOf();
    await transitionOrder({ orderId: pickup.orderId, action: "processing", expectedStatus: "requested" }, owner);
    const approved = await transitionOrder({ orderId: pickup.orderId, action: "approve", expectedStatus: "processing" }, owner);
    assert.equal(approved.order.status, "confirmed");
    assert.equal(approved.order.paymentStatus, "unpaid");
    assert.equal((await stored(pickup.orderId)).paymentStatus, "unpaid");
    assert.equal(await heldOf(), heldAtApproval);
    const early = await place();
    const heldBefore = await heldOf();
    const guestApproved = await readGuestOrder(pickup.token);
    assert.equal(guestApproved?.statusLabel, "Approved");
    assert.doesNotMatch(guestApproved?.message ?? "", /\bpaid\b/i);
    const earlyPay = await transitionOrder({ orderId: early.orderId, action: "pay", expectedStatus: "confirmed", method: "gcash" }, owner);
    assert.equal(earlyPay.conflict, "Record payment after the request is approved.");
    const short = await transitionOrder({ orderId: pickup.orderId, action: "pay", expectedStatus: "confirmed", method: "gcash", amountCentavos: 1 }, owner);
    assert.equal(short.conflict, "Record the full remaining total.");
    assert.equal(short.order.status, "confirmed");
    assert.equal(short.order.payments.length, 0);
    const unpaidPrepare = await transitionOrder({ orderId: pickup.orderId, action: "preparing", expectedStatus: "confirmed" }, owner);
    assert.match(unpaidPrepare.conflict ?? "", /payment/i);
    assert.equal(unpaidPrepare.order.status, "confirmed");
    assert.equal(await heldOf(), heldBefore);
    const paid = await transitionOrder({ orderId: pickup.orderId, action: "pay", expectedStatus: "confirmed", method: "bank" }, owner);
    assert.equal(paid.conflict, undefined);
    assert.equal(paid.order.status, "confirmed");
    assert.equal(paid.order.paymentStatus, "paid");
    assert.equal(paid.order.netReceivedCentavos, paid.order.finalTotalCentavos);
    assert.equal(paid.order.payments.length, 1);
    assert.equal(paid.order.payments[0].actorUid, owner.uid);
    assert.equal(paid.order.payments[0].method, "bank");
    const secondPay = await transitionOrder({ orderId: pickup.orderId, action: "pay", expectedStatus: "confirmed", method: "cash" }, owner);
    assert.equal(secondPay.conflict, "This request already has a payment recorded.");
    const preparing = await transitionOrder({ orderId: pickup.orderId, action: "preparing", expectedStatus: "confirmed" }, owner);
    assert.equal(preparing.order.status, "preparing");
    assert.equal(await heldOf(), heldBefore);
    const guestPreparing = await readGuestOrder(pickup.token);
    assert.equal(guestPreparing?.statusLabel, "Preparing");
    assert.equal(guestPreparing?.message, "The bakery is preparing this pickup.");
    const ready = await transitionOrder({ orderId: pickup.orderId, action: "ready", expectedStatus: "preparing" }, owner);
    assert.equal(ready.order.status, "ready");
    assert.equal(await heldOf(), heldBefore);
    const guestReady = await readGuestOrder(pickup.token);
    assert.equal(guestReady?.statusLabel, "Ready for pickup");
    assert.match(guestReady?.message ?? "", /ready for pickup/i);
    const stale = await transitionOrder({ orderId: pickup.orderId, action: "preparing", expectedStatus: "confirmed" }, owner);
    assert.equal(stale.conflict, "This request changed. Reload it and try again.");
    assert.equal(stale.order.status, "ready");
    assert.equal(await heldOf(), heldBefore);
    const completed = await transitionOrder({ orderId: pickup.orderId, action: "complete", expectedStatus: "ready" }, owner);
    assert.equal(completed.order.status, "completed");
    assert.equal(await heldOf(), heldBefore);
    const rejectedLate = await transitionOrder({ orderId: pickup.orderId, action: "reject", expectedStatus: "confirmed", reason: "Too late" }, owner);
    assert.equal(rejectedLate.conflict, "This request changed. Reload it and try again.");
    assert.equal(await heldOf(), heldBefore);
    const guestDone = await readGuestOrder(pickup.token);
    assert.equal(guestDone?.statusLabel, "Completed");
    assert.equal(guestDone?.message, "This pickup is complete.");
    const reopened = (await readHeldOrders(owner)).find((order) => order.id === pickup.orderId);
    assert.equal(reopened?.status, "completed");
    assert.equal(reopened?.paymentStatus, "paid");
    assert.equal(reopened?.finalTotalCentavos, paid.order.finalTotalCentavos);
    assert.equal(reopened?.payments[0].amountCentavos, paid.order.finalTotalCentavos);

    const quoted = await place();
    await transitionOrder({ orderId: quoted.orderId, action: "processing", expectedStatus: "requested" }, owner);
    await transitionOrder({ orderId: quoted.orderId, action: "approve", expectedStatus: "processing" }, owner);
    await db.doc(`orders/${quoted.orderId}`).update({ quoteStatus: "pending", finalTotalCentavos: null });
    const quotedPay = await transitionOrder({ orderId: quoted.orderId, action: "pay", expectedStatus: "confirmed", method: "gcash" }, owner);
    assert.equal(quotedPay.conflict, "Finalize the total and verify full payment before preparation.");
    const quotedPrepare = await transitionOrder({ orderId: quoted.orderId, action: "preparing", expectedStatus: "confirmed" }, owner);
    assert.match(quotedPrepare.conflict ?? "", /payment/i);

    await transitionOrder({ orderId: early.orderId, action: "processing", expectedStatus: "requested" }, owner);
    await transitionOrder({ orderId: early.orderId, action: "approve", expectedStatus: "processing" }, owner);
    const heldBeforeCancel = await heldOf();
    const cancelled = await transitionOrder({ orderId: early.orderId, action: "reject", expectedStatus: "confirmed", reason: "Customer changed plans." }, owner);
    assert.equal(cancelled.order.status, "cancelled");
    assert.equal(await heldOf(), heldBeforeCancel - 1);
    const cancelledAgain = await transitionOrder({ orderId: early.orderId, action: "reject", expectedStatus: "confirmed", reason: "Again" }, owner);
    assert.ok(cancelledAgain.conflict);
    assert.equal(await heldOf(), heldBeforeCancel - 1);

    const delivery = await place("lalamove");
    await transitionOrder({ orderId: delivery.orderId, action: "deliverable", expectedStatus: "requested", feeCentavos: 0 }, owner);
    await transitionOrder({ orderId: delivery.orderId, action: "processing", expectedStatus: "requested" }, owner);
    await transitionOrder({ orderId: delivery.orderId, action: "approve", expectedStatus: "processing" }, owner);
    await transitionOrder({ orderId: delivery.orderId, action: "pay", expectedStatus: "confirmed", method: "gcash" }, owner);
    await transitionOrder({ orderId: delivery.orderId, action: "preparing", expectedStatus: "confirmed" }, owner);
    const heldBeforeDeliveryReady = await heldOf();
    const deliveryReady = await transitionOrder({ orderId: delivery.orderId, action: "ready", expectedStatus: "preparing" }, owner);
    assert.equal(deliveryReady.conflict, "Pickup progress is for pickup requests.");
    assert.equal(deliveryReady.order.status, "preparing");
    assert.equal(await heldOf(), heldBeforeDeliveryReady);
  } finally {
    for (const idempotencyKey of idempotencyKeys) await db.doc(`orderIdempotency/${idempotencyKey}`).delete();
    for (const id of created) if (id) await db.doc(`orders/${id}`).delete();
    if (before.exists) await db.doc(`allocations/${key}`).set(before.data()!);
    else await db.doc(`allocations/${key}`).delete();
  }
});

test("revisions, settlement, and guest totals", async (t) => {
  let reachable = false;
  try {
    const probe = await fetch("http://127.0.0.1:8080", { signal: AbortSignal.timeout(800) });
    reachable = probe.status > 0;
  } catch {
    reachable = false;
  }
  if (!reachable) {
    t.skip("Firestore emulator is not running");
    return;
  }
  const { getServerFirebase } = await import("../src/lib/firebase/server");
  const { db } = getServerFirebase();
  const { submitOrder, readGuestOrder, saveBranchAllocations, transitionOrder } = await import("../src/lib/orders/store");
  const { ProductError } = await import("../src/lib/products/store");
  const { readPublicMenu } = await import("../src/lib/products/public");
  const { addCalendarDays, slotsForDate } = await import("../src/lib/scheduling/rules");
  const { readScheduleSettings } = await import("../src/lib/scheduling/store");
  const { manilaDate } = await import("../src/lib/catalog/rules");
  const { flavorCapacityKey } = await import("../src/lib/orders/allocation");
  const { ZodError } = await import("zod");
  const menu = await readPublicMenu();
  const product = menu.catalog?.products.find((item) => item.active && item.variants.some((variant) => variant.active && variant.minLeadDays === 0 && variant.pricingMode === "fixed"));
  if (!product) {
    t.skip("Demo catalog is not initialized");
    return;
  }
  const variant = product.variants.find((item) => item.active && item.minLeadDays === 0 && item.pricingMode === "fixed")!;
  const schedule = await readScheduleSettings();
  const date = addCalendarDays(manilaDate(), 15);
  const later = addCalendarDays(manilaDate(), 16);
  const blocked = addCalendarDays(manilaDate(), 17);
  const slot = slotsForDate(schedule, "cebu", date, new Date())[0];
  const laterSlot = slotsForDate(schedule, "cebu", later, new Date())[0];
  if (!slot || !laterSlot) {
    t.skip("Cebu has no open slot on the test date");
    return;
  }
  const owner = { uid: "phase6-owner", email: "owner@example.test", role: "owner" as const, active: true, branchIds: [] };
  const staff = { uid: "phase6-staff", email: "staff@example.test", role: "staff" as const, active: true, branchIds: ["cebu"] };
  const keys = [date, later, blocked].flatMap((day) => [
    flavorCapacityKey("cebu", day, product.id),
    flavorCapacityKey("manila", day, product.id),
  ]);
  const snapshots = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  for (const key of keys) snapshots.set(key, await db.doc(`allocations/${key}`).get());
  const settingsRef = db.doc("settings/branches");
  const scheduleRef = db.doc("settings/orderingSchedule");
  const settingsBefore = await settingsRef.get();
  const scheduleBefore = await scheduleRef.get();
  const created: string[] = [];
  const idempotencyKeys: string[] = [];
  const heldOf = async (day: string, branch = "cebu") => (await db.doc(`allocations/${flavorCapacityKey(branch, day, product.id)}`).get()).data()?.held ?? 0;
  async function place(day: string, quantity: number, slotId: string) {
    const idempotencyKey = crypto.randomUUID();
    idempotencyKeys.push(idempotencyKey);
    const saved = await submitOrder({
      idempotencyKey,
      branchId: "cebu",
      slotId,
      name: "Phase Six",
      contact: "09170000004",
      notes: "",
      delivery: "pickup",
      address: "",
      payment: "gcash",
      selection: { date: day, lines: [{ productId: product!.id, variantId: variant.id, quantity, addons: [] }], addons: [] },
    });
    const orderId = String((await db.doc(`orderIdempotency/${idempotencyKey}`).get()).data()?.orderId);
    created.push(orderId);
    return { ...saved, orderId };
  }
  function revise(orderId: string, day: string, quantity: number, slotId: string, branchId = "cebu", expectedStatus: "requested" | "confirmed" | "preparing" = "requested") {
    return transitionOrder({
      orderId,
      action: "revise",
      expectedStatus,
      branchId,
      slotId,
      selection: { date: day, lines: [{ productId: product!.id, variantId: variant.id, quantity, addons: [] }], addons: [] },
    }, owner);
  }
  try {
    const source = snapshots.get(flavorCapacityKey("cebu", date, product.id))!;
    const laterSnap = snapshots.get(flavorCapacityKey("cebu", later, product.id))!;
    const blockedSnap = snapshots.get(flavorCapacityKey("cebu", blocked, product.id))!;
    const blockedSlot = slotsForDate(schedule, "cebu", blocked, new Date())[0];
    assert.ok(blockedSlot, "Cebu has an open slot on the blocked date");
    await saveBranchAllocations({
      branchId: "cebu",
      productId: product.id,
      days: [
        { fulfillmentDate: date, limit: (source.data()?.held ?? 0) + 8, version: source.data()?.version ?? 0 },
        { fulfillmentDate: later, limit: (laterSnap.data()?.held ?? 0) + 4, version: laterSnap.data()?.version ?? 0 },
        { fulfillmentDate: blocked, limit: 0, version: blockedSnap.data()?.version ?? 0 },
      ],
    }, "phase6");
    const order = await place(date, 2, slot.id);
    const storedOrder = (await db.doc(`orders/${order.orderId}`).get()).data()!;
    assert.equal(storedOrder.selection.lines[0].quantity, 2);
    const originalTotal = storedOrder.finalTotalCentavos;
    const heldAtTwo = await heldOf(date);
    const lowered = await revise(order.orderId, date, 1, slot.id);
    assert.equal(lowered.conflict, undefined);
    assert.equal(lowered.order.status, "requested");
    assert.equal(await heldOf(date), heldAtTwo - 1);
    const guest = await readGuestOrder(order.token);
    assert.equal(guest?.totalCentavos, lowered.order.finalTotalCentavos);
    assert.match(guest?.totalLabel ?? "", /^₱/);
    assert.doesNotMatch(`${guest?.statusLabel} ${guest?.message} ${guest?.totalLabel}`, /\bpaid\b/i);
    assert.equal(lowered.order.finalTotalCentavos! * 2, originalTotal);
    const heldAtOne = await heldOf(date);
    await assert.rejects(
      () => transitionOrder({ orderId: order.orderId, action: "revise", expectedStatus: "requested", branchId: "cebu", slotId: slot.id, selection: { date, lines: [], addons: [] } }, owner),
      (error: unknown) => error instanceof ZodError,
    );
    assert.equal(await heldOf(date), heldAtOne);
    assert.equal((await db.doc(`orders/${order.orderId}`).get()).data()?.status, "requested");
    const raised = await revise(order.orderId, date, 2, slot.id);
    assert.equal(raised.conflict, undefined);
    assert.equal(raised.order.status, "requested");
    assert.equal(await heldOf(date), heldAtOne + 1);
    assert.equal(raised.order.payments.length, 0);
    assert.ok((raised.order.finalTotalCentavos ?? 0) > raised.order.netReceivedCentavos);
    assert.equal(raised.order.paymentStatus, "unpaid");
    await transitionOrder({ orderId: order.orderId, action: "processing", expectedStatus: "requested" }, owner);
    await transitionOrder({ orderId: order.orderId, action: "approve", expectedStatus: "processing" }, owner);
    const paid = await transitionOrder({ orderId: order.orderId, action: "pay", expectedStatus: "confirmed", method: "bank" }, owner);
    const paidAmount = paid.order.payments[0].amountCentavos;
    assert.equal(paidAmount, raised.order.finalTotalCentavos);
    const refunded = await revise(order.orderId, date, 1, slot.id, "cebu", "confirmed");
    assert.equal(refunded.order.status, "confirmed");
    assert.equal(refunded.order.payments.length, 1);
    assert.equal(refunded.order.payments[0].amountCentavos, paidAmount);
    assert.ok((refunded.order.finalTotalCentavos ?? 0) < refunded.order.netReceivedCentavos);
    const refund = refunded.order.netReceivedCentavos - (refunded.order.finalTotalCentavos ?? 0);
    const settled = await transitionOrder({ orderId: order.orderId, action: "settle", expectedStatus: "confirmed", kind: "refund", method: "bank", amountCentavos: refund }, owner);
    assert.equal(settled.conflict, undefined);
    assert.equal(settled.order.status, "confirmed");
    assert.equal(settled.order.payments.length, 2);
    assert.equal(settled.order.payments[0].amountCentavos, paidAmount);
    assert.equal(settled.order.payments[0].kind, undefined);
    assert.equal(settled.order.payments[1].kind, "refund");
    assert.equal(settled.order.payments[1].amountCentavos, refund);
    assert.equal(settled.order.netReceivedCentavos, settled.order.finalTotalCentavos);
    assert.equal(settled.order.paymentStatus, "paid");
    const secondPay = await transitionOrder({ orderId: order.orderId, action: "pay", expectedStatus: "confirmed", method: "cash" }, owner);
    assert.equal(secondPay.conflict, "This request already has a payment recorded.");
    const heldBeforeIncrease = await heldOf(date);
    const increased = await revise(order.orderId, date, 2, slot.id, "cebu", "confirmed");
    assert.equal(increased.conflict, undefined);
    assert.equal(increased.order.status, "confirmed");
    assert.equal(await heldOf(date), heldBeforeIncrease + 1);
    assert.equal(increased.order.payments.length, 2);
    assert.equal(increased.order.payments[0].amountCentavos, paidAmount);
    assert.equal(increased.order.paymentStatus, "partially_paid");
    assert.ok((increased.order.finalTotalCentavos ?? 0) > increased.order.netReceivedCentavos);

    const mover = await place(date, 1, slot.id);
    const sourceBeforeMove = await heldOf(date);
    const laterBefore = await heldOf(later);
    const moved = await revise(mover.orderId, later, 1, laterSlot.id);
    assert.equal(moved.conflict, undefined);
    assert.equal(moved.order.fulfillmentDate, later);
    assert.equal(moved.order.status, "requested");
    assert.equal(await heldOf(date), sourceBeforeMove - 1);
    assert.equal(await heldOf(later), laterBefore + 1);
    const heldBeforeBlocked = await heldOf(date);
    const blockedHeld = await heldOf(blocked);
    const blockedMove = await revise(mover.orderId, blocked, 1, blockedSlot.id);
    assert.match(blockedMove.conflict ?? "", /online availability|no longer available|not currently available/i);
    assert.doesNotMatch(blockedMove.conflict ?? "", /sold out|full/i);
    assert.equal(blockedMove.order.fulfillmentDate, later);
    assert.equal(await heldOf(later), laterBefore + 1);
    assert.equal(await heldOf(date), heldBeforeBlocked);
    assert.equal(await heldOf(blocked), blockedHeld);

    const manilaSnap = snapshots.get(flavorCapacityKey("manila", date, product.id))!;
    await saveBranchAllocations({ branchId: "manila", productId: product.id, days: [{ fulfillmentDate: date, limit: (manilaSnap.data()?.held ?? 0) + 4, version: manilaSnap.data()?.version ?? 0 }] }, "phase6");
    await scheduleRef.update({ "branches.manila.enabled": true });
    const transfer = await place(date, 1, slot.id);
    const cebuBeforeBranch = await heldOf(date);
    const manilaBefore = await heldOf(date, "manila");
    await assert.rejects(
      () => transitionOrder({
        orderId: transfer.orderId,
        action: "revise",
        expectedStatus: "requested",
        branchId: "manila",
        slotId: slot.id,
        selection: { date, lines: [{ productId: product.id, variantId: variant.id, quantity: 1, addons: [] }], addons: [] },
      }, staff),
      (error: unknown) => error instanceof ProductError && error.status === 403,
    );
    assert.equal(await heldOf(date), cebuBeforeBranch);
    assert.equal(await heldOf(date, "manila"), manilaBefore);
    const assignments = [...(settingsBefore.data()?.assignments ?? [])];
    const assignmentIndex = assignments.findIndex((assignment) => assignment.productId === product.id && assignment.variantId === variant.id);
    if (assignmentIndex >= 0) {
      const current = assignments[assignmentIndex];
      assignments[assignmentIndex] = { ...current, branchIds: current.branchIds.includes("manila") ? current.branchIds : [...current.branchIds, "manila"] };
    } else {
      assignments.push({ productId: product.id, variantId: variant.id, branchIds: ["cebu", "manila"], mode: "regular" });
    }
    await settingsRef.update({ assignments });
    const ownerMove = await transitionOrder({
      orderId: transfer.orderId,
      action: "revise",
      expectedStatus: "requested",
      branchId: "manila",
      slotId: slot.id,
      selection: { date, lines: [{ productId: product.id, variantId: variant.id, quantity: 1, addons: [] }], addons: [] },
    }, owner);
    assert.equal(ownerMove.conflict, undefined, ownerMove.conflict);
    assert.equal(ownerMove.order.branchId, "manila");
    assert.equal(ownerMove.order.status, "requested");
    assert.equal(await heldOf(date), cebuBeforeBranch - 1);
    assert.equal(await heldOf(date, "manila"), manilaBefore + 1);

    const preparingOrder = await place(date, 1, slot.id);
    await transitionOrder({ orderId: preparingOrder.orderId, action: "processing", expectedStatus: "requested" }, owner);
    await transitionOrder({ orderId: preparingOrder.orderId, action: "approve", expectedStatus: "processing" }, owner);
    await transitionOrder({ orderId: preparingOrder.orderId, action: "pay", expectedStatus: "confirmed", method: "cash" }, owner);
    const preparing = await transitionOrder({ orderId: preparingOrder.orderId, action: "preparing", expectedStatus: "confirmed" }, owner);
    assert.equal(preparing.order.status, "preparing");
    const stillPreparing = await revise(preparingOrder.orderId, later, 1, laterSlot.id, "cebu", "preparing");
    assert.equal(stillPreparing.conflict, undefined);
    assert.equal(stillPreparing.order.status, "preparing");
    assert.equal(stillPreparing.order.events.at(-1)?.action, "revise");
    assert.equal(stillPreparing.order.events.at(-1)?.status, "preparing");
  } finally {
    for (const idempotencyKey of idempotencyKeys) await db.doc(`orderIdempotency/${idempotencyKey}`).delete();
    for (const id of created) if (id) await db.doc(`orders/${id}`).delete();
    if (settingsBefore.exists) await settingsRef.set(settingsBefore.data()!);
    if (scheduleBefore.exists) await scheduleRef.set(scheduleBefore.data()!);
    for (const [key, snap] of snapshots) {
      if (snap.exists) await db.doc(`allocations/${key}`).set(snap.data()!);
      else await db.doc(`allocations/${key}`).delete();
    }
  }
});

test("delivery review, shared capacity, and delivered wording", async (t) => {
  let reachable = false;
  try {
    const probe = await fetch("http://127.0.0.1:8080", { signal: AbortSignal.timeout(800) });
    reachable = probe.status > 0;
  } catch {
    reachable = false;
  }
  if (!reachable) {
    t.skip("Firestore emulator is not running");
    return;
  }
  const { getServerFirebase } = await import("../src/lib/firebase/server");
  const { db } = getServerFirebase();
  const { submitOrder, readGuestOrder, saveBranchAllocations, transitionOrder } = await import("../src/lib/orders/store");
  const { ProductError } = await import("../src/lib/products/store");
  const { readPublicMenu } = await import("../src/lib/products/public");
  const { addCalendarDays, slotsForDate } = await import("../src/lib/scheduling/rules");
  const { readScheduleSettings } = await import("../src/lib/scheduling/store");
  const { manilaDate } = await import("../src/lib/catalog/rules");
  const { flavorCapacityKey } = await import("../src/lib/orders/allocation");
  const { ZodError } = await import("zod");
  const menu = await readPublicMenu();
  const product = menu.catalog?.products.find((item) => item.active && item.variants.some((variant) => variant.active && variant.minLeadDays === 0 && variant.pricingMode === "fixed"));
  if (!product) {
    t.skip("Demo catalog is not initialized");
    return;
  }
  const variant = product.variants.find((item) => item.active && item.minLeadDays === 0 && item.pricingMode === "fixed")!;
  const schedule = await readScheduleSettings();
  const date = addCalendarDays(manilaDate(), 19);
  const contested = addCalendarDays(manilaDate(), 21);
  const slot = slotsForDate(schedule, "cebu", date, new Date())[0];
  const contestedSlot = slotsForDate(schedule, "cebu", contested, new Date())[0];
  if (!slot || !contestedSlot) {
    t.skip("Cebu has no open slot on the test date");
    return;
  }
  const owner = { uid: "phase7-owner", email: "owner@example.test", role: "owner" as const, active: true, branchIds: [] };
  const keys = [date, contested].map((day) => flavorCapacityKey("cebu", day, product.id));
  const snapshots = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  for (const key of keys) snapshots.set(key, await db.doc(`allocations/${key}`).get());
  const settingsRef = db.doc("settings/branches");
  const settingsBefore = await settingsRef.get();
  const created: string[] = [];
  const idempotencyKeys: string[] = [];
  const heldOf = async (day: string) => (await db.doc(`allocations/${flavorCapacityKey("cebu", day, product.id)}`).get()).data()?.held ?? 0;
  async function place(day: string, slotId: string, delivery: "pickup" | "lalamove", address = "Banilad, Cebu City") {
    const idempotencyKey = crypto.randomUUID();
    idempotencyKeys.push(idempotencyKey);
    const saved = await submitOrder({
      idempotencyKey,
      branchId: "cebu",
      slotId,
      name: "Phase Seven",
      contact: "09170000007",
      notes: "",
      delivery,
      address: delivery === "lalamove" ? address : "",
      payment: "gcash",
      selection: { date: day, lines: [{ productId: product!.id, variantId: variant.id, quantity: 1, addons: [] }], addons: [] },
    });
    const orderId = String((await db.doc(`orderIdempotency/${idempotencyKey}`).get()).data()?.orderId);
    created.push(orderId);
    return { ...saved, orderId };
  }
  try {
    const source = snapshots.get(flavorCapacityKey("cebu", date, product.id))!;
    const contestedSnap = snapshots.get(flavorCapacityKey("cebu", contested, product.id))!;
    await saveBranchAllocations({
      branchId: "cebu",
      productId: product.id,
      days: [
        { fulfillmentDate: date, limit: (source.data()?.held ?? 0) + 3, version: source.data()?.version ?? 0 },
        { fulfillmentDate: contested, limit: (contestedSnap.data()?.held ?? 0) + 1, version: contestedSnap.data()?.version ?? 0 },
      ],
    }, "phase7");
    const beforeShared = await heldOf(date);
    const pickup = await place(date, slot.id, "pickup");
    const courier = await place(date, slot.id, "lalamove");
    assert.equal(await heldOf(date), beforeShared + 2);
    assert.equal((await db.doc(`orders/${courier.orderId}`).get()).data()?.finalTotalCentavos, null);
    const beforeLast = await heldOf(contested);
    const raced = await Promise.allSettled([
      place(contested, contestedSlot.id, "pickup"),
      place(contested, contestedSlot.id, "lalamove"),
    ]);
    assert.equal(raced.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(await heldOf(contested), beforeLast + 1);
    await assert.rejects(
      () => submitOrder({
        idempotencyKey: crypto.randomUUID(),
        branchId: "cebu",
        slotId: slot.id,
        name: "Phase Seven",
        contact: "09170000007",
        notes: "",
        delivery: "lalamove",
        address: "",
        payment: "gcash",
        selection: { date, lines: [{ productId: product.id, variantId: variant.id, quantity: 1, addons: [] }], addons: [] },
      }),
      (error: unknown) => error instanceof ZodError,
    );
    const branches = settingsBefore.data()?.branches ?? [];
    await settingsRef.update({ branches: branches.map((branch: { id: string }) => branch.id === "cebu" ? { ...branch, deliveryEnabled: false } : branch) });
    await assert.rejects(
      () => place(date, slot.id, "lalamove"),
      (error: unknown) => error instanceof ProductError && error.status === 409,
    );
    await settingsRef.set(settingsBefore.data()!);
    const earlyApprove = await transitionOrder({ orderId: courier.orderId, action: "processing", expectedStatus: "requested" }, owner);
    assert.equal(earlyApprove.order.status, "processing");
    const blockedApprove = await transitionOrder({ orderId: courier.orderId, action: "approve", expectedStatus: "processing" }, owner);
    assert.equal(blockedApprove.conflict, "Confirm the address and delivery fee before approval.");
    const pies = (await db.doc(`orders/${courier.orderId}`).get()).data()?.knownSubtotalCentavos;
    const reviewed = await transitionOrder({ orderId: courier.orderId, action: "deliverable", expectedStatus: "processing", feeCentavos: 15000 }, owner);
    assert.equal(reviewed.conflict, undefined);
    assert.equal(reviewed.order.status, "processing");
    assert.equal(reviewed.order.deliveryEligibility, "eligible");
    assert.equal(reviewed.order.finalTotalCentavos, pies + 15000);
    const approved = await transitionOrder({ orderId: courier.orderId, action: "approve", expectedStatus: "processing" }, owner);
    assert.equal(approved.conflict, undefined);
    assert.equal(approved.order.status, "confirmed");
    const partial = await transitionOrder({ orderId: courier.orderId, action: "pay", expectedStatus: "confirmed", method: "gcash", amountCentavos: pies }, owner);
    assert.equal(partial.conflict, "Record the full remaining total.");
    const blockedPrepare = await transitionOrder({ orderId: courier.orderId, action: "preparing", expectedStatus: "confirmed" }, owner);
    assert.match(blockedPrepare.conflict ?? "", /payment/i);
    const paid = await transitionOrder({ orderId: courier.orderId, action: "pay", expectedStatus: "confirmed", method: "gcash" }, owner);
    assert.equal(paid.order.paymentStatus, "paid");
    assert.equal(paid.order.netReceivedCentavos, pies + 15000);
    const preparing = await transitionOrder({ orderId: courier.orderId, action: "preparing", expectedStatus: "confirmed" }, owner);
    assert.equal(preparing.order.status, "preparing");
    const heldBeforeDelivered = await heldOf(date);
    const delivered = await transitionOrder({ orderId: courier.orderId, action: "delivered", expectedStatus: "preparing" }, owner);
    assert.equal(delivered.order.status, "completed");
    assert.equal(await heldOf(date), heldBeforeDelivered);
    const guest = await readGuestOrder(courier.token);
    assert.equal(guest?.statusLabel, "Delivered");
    assert.equal(guest?.message, "This delivery is complete.");
    assert.equal(guest?.deliveryFeeCentavos, 15000);
    assert.equal(guest?.totalCentavos, pies + 15000);
    assert.doesNotMatch(`${guest?.statusLabel} ${guest?.message}`, /pickup/i);

    const declined = await place(date, slot.id, "lalamove", "Far outside the area");
    const heldBeforeReject = await heldOf(date);
    const rejected = await transitionOrder({ orderId: declined.orderId, action: "reject", expectedStatus: "requested", reason: "Outside the delivery area." }, owner);
    assert.equal(rejected.order.status, "cancelled");
    assert.equal(await heldOf(date), heldBeforeReject - 1);
    const declinedGuest = await readGuestOrder(declined.token);
    assert.equal(declinedGuest?.message, "This delivery was not approved.");
    void pickup;
  } finally {
    for (const idempotencyKey of idempotencyKeys) await db.doc(`orderIdempotency/${idempotencyKey}`).delete();
    for (const id of created) if (id) await db.doc(`orders/${id}`).delete();
    if (settingsBefore.exists) await settingsRef.set(settingsBefore.data()!);
    for (const [key, snap] of snapshots) {
      if (snap.exists) await db.doc(`allocations/${key}`).set(snap.data()!);
      else await db.doc(`allocations/${key}`).delete();
    }
  }
});

test("preorder preparation, shared flavor count, and revision", async (t) => {
  let reachable = false;
  try {
    const probe = await fetch("http://127.0.0.1:8080", { signal: AbortSignal.timeout(800) });
    reachable = probe.status > 0;
  } catch {
    reachable = false;
  }
  if (!reachable) {
    t.skip("Firestore emulator is not running");
    return;
  }
  const { getServerFirebase } = await import("../src/lib/firebase/server");
  const { db } = getServerFirebase();
  const { submitOrder, readGuestOrder, saveBranchAllocations, transitionOrder } = await import("../src/lib/orders/store");
  const { readPublicMenu } = await import("../src/lib/products/public");
  const { addCalendarDays, slotsForDate } = await import("../src/lib/scheduling/rules");
  const { readScheduleSettings } = await import("../src/lib/scheduling/store");
  const { manilaDate } = await import("../src/lib/catalog/rules");
  const { flavorCapacityKey } = await import("../src/lib/orders/allocation");
  const menu = await readPublicMenu();
  const product = menu.catalog?.products.find((item) => item.active && item.availableWeekdays.length === 0 && item.unavailableDates.length === 0 && item.variants.some((variant) => variant.active && variant.minLeadDays === 0 && variant.pricingMode === "fixed"));
  if (!product) {
    t.skip("Demo catalog is not initialized");
    return;
  }
  const variant = product.variants.find((item) => item.active && item.minLeadDays === 0 && item.pricingMode === "fixed")!;
  const schedule = await readScheduleSettings();
  const today = manilaDate();
  const soon = addCalendarDays(today, 2);
  const ready = addCalendarDays(today, 23);
  const soonSlot = slotsForDate(schedule, "cebu", soon, new Date())[0];
  const readySlot = slotsForDate(schedule, "cebu", ready, new Date())[0];
  if (!soonSlot || !readySlot) {
    t.skip("Cebu has no open slot on the preorder dates");
    return;
  }
  const owner = { uid: "phase8-owner", email: "owner@example.test", role: "owner" as const, active: true, branchIds: [] };
  const key = flavorCapacityKey("cebu", ready, product.id);
  const before = await db.doc(`allocations/${key}`).get();
  const variantRef = db.doc(`products/${product.id}/variants/phase8`);
  const created: string[] = [];
  const idempotencyKeys: string[] = [];
  const heldOf = async () => (await db.doc(`allocations/${key}`).get()).data()?.held ?? 0;
  const request = (idempotencyKey: string, date: string, slotId: string, lines: { productId: string; variantId: string; quantity: number }[], catalogMode: "regular" | "preorder") => ({
    idempotencyKey,
    branchId: "cebu" as const,
    slotId,
    name: "Preorder Test",
    contact: "09170000000",
    notes: "",
    delivery: "pickup" as const,
    address: "",
    payment: "bank" as const,
    catalogMode,
    selection: { date, lines: lines.map((line) => ({ ...line, addons: [] })), addons: [] },
  });
  try {
    await variantRef.set({ label: "Phase 8", pricingMode: "fixed", priceCentavos: variant.priceCentavos, minLeadDays: 5, active: true, sortOrder: 8 });
    const startHeld = await heldOf();
    const startVersion = before.data()?.version ?? 0;
    await saveBranchAllocations({ branchId: "cebu", productId: product.id, days: [{ fulfillmentDate: ready, limit: 0, version: startVersion }] }, "phase8");
    await assert.rejects(
      () => submitOrder(request(crypto.randomUUID(), ready, readySlot.id, [{ productId: product.id, variantId: "phase8", quantity: 1 }], "preorder")),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /online availability/);
        assert.doesNotMatch(error.message, /sold out|full/i);
        return true;
      },
    );
    assert.equal(await heldOf(), startHeld);
    await saveBranchAllocations({ branchId: "cebu", productId: product.id, days: [{ fulfillmentDate: ready, limit: startHeld + 2, version: startVersion + 1 }] }, "phase8");
    const regularLine = { productId: product.id, variantId: variant.id, quantity: 1 };
    const preparedLine = { productId: product.id, variantId: "phase8", quantity: 1 };
    await assert.rejects(
      () => submitOrder(request(crypto.randomUUID(), ready, readySlot.id, [regularLine, preparedLine], "regular")),
      (error: unknown) => error instanceof Error && /separate requests/.test(error.message),
    );
    await assert.rejects(
      () => submitOrder(request(crypto.randomUUID(), ready, readySlot.id, [preparedLine], "regular")),
      (error: unknown) => error instanceof Error && /separate requests/.test(error.message),
    );
    await assert.rejects(
      () => submitOrder(request(crypto.randomUUID(), ready, readySlot.id, [regularLine], "preorder")),
      (error: unknown) => error instanceof Error && /separate requests/.test(error.message),
    );
    await assert.rejects(
      () => submitOrder(request(crypto.randomUUID(), soon, soonSlot.id, [preparedLine], "preorder")),
      (error: unknown) => error instanceof Error && /preparation/.test(error.message),
    );
    assert.equal(await heldOf(), startHeld);
    const preparedKey = crypto.randomUUID();
    idempotencyKeys.push(preparedKey);
    const prepared = await submitOrder(request(preparedKey, ready, readySlot.id, [preparedLine], "preorder"));
    const preparedId = String((await db.doc(`orderIdempotency/${preparedKey}`).get()).data()?.orderId);
    created.push(preparedId);
    const preparedDoc = (await db.doc(`orders/${preparedId}`).get()).data();
    assert.equal(preparedDoc?.catalogMode, "preorder");
    assert.equal(preparedDoc?.preparationDays, 5);
    assert.equal((await readGuestOrder(prepared.token))?.preparationDays, 5);
    const regularKey = crypto.randomUUID();
    idempotencyKeys.push(regularKey);
    await submitOrder(request(regularKey, ready, readySlot.id, [regularLine], "regular"));
    created.push(String((await db.doc(`orderIdempotency/${regularKey}`).get()).data()?.orderId));
    assert.equal(await heldOf(), startHeld + 2);
    await assert.rejects(
      () => submitOrder(request(crypto.randomUUID(), ready, readySlot.id, [regularLine], "regular")),
      (error: unknown) => error instanceof Error && /online availability/.test(error.message),
    );
    assert.equal(await heldOf(), startHeld + 2);
    const revised = await transitionOrder({
      orderId: preparedId,
      action: "revise",
      expectedStatus: "requested",
      branchId: "cebu",
      slotId: soonSlot.id,
      selection: { date: soon, lines: [{ ...preparedLine, addons: [] }], addons: [] },
    }, owner);
    assert.match(revised.conflict ?? "", /preparation/);
    assert.equal(revised.order.fulfillmentDate, ready);
    assert.equal(await heldOf(), startHeld + 2);
    assert.equal((await db.doc(`orders/${preparedId}`).get()).data()?.fulfillmentDate, ready);
  } finally {
    for (const idempotencyKey of idempotencyKeys) await db.doc(`orderIdempotency/${idempotencyKey}`).delete().catch(() => undefined);
    for (const id of created) if (id) await db.doc(`orders/${id}`).delete().catch(() => undefined);
    await variantRef.delete().catch(() => undefined);
    if (before.exists) await db.doc(`allocations/${key}`).set(before.data()!);
    else await db.doc(`allocations/${key}`).delete();
  }
});

test("reorder and reopen keep current rules", async (t) => {
  let reachable = false;
  try {
    const probe = await fetch("http://127.0.0.1:8080", { signal: AbortSignal.timeout(800) });
    reachable = probe.status > 0;
  } catch {
    reachable = false;
  }
  if (!reachable) {
    t.skip("Firestore emulator is not running");
    return;
  }
  const { getServerFirebase } = await import("../src/lib/firebase/server");
  const { db } = getServerFirebase();
  const { submitOrder, readGuestOrder, expireDueHolds, reopenOrder, transitionOrder, saveBranchAllocations } = await import("../src/lib/orders/store");
  const { readPublicMenu } = await import("../src/lib/products/public");
  const { addCalendarDays, slotsForDate } = await import("../src/lib/scheduling/rules");
  const { readScheduleSettings } = await import("../src/lib/scheduling/store");
  const { manilaDate } = await import("../src/lib/catalog/rules");
  const { flavorCapacityKey } = await import("../src/lib/orders/allocation");
  const menu = await readPublicMenu();
  const product = menu.catalog?.products.find((item) => item.active && item.variants.some((variant) => variant.active && variant.minLeadDays === 0 && variant.pricingMode === "fixed" && variant.priceCentavos));
  const variant = product?.variants.find((item) => item.active && item.minLeadDays === 0 && item.pricingMode === "fixed" && item.priceCentavos);
  if (!product || !variant?.priceCentavos) {
    t.skip("Demo catalog is not initialized");
    return;
  }
  const date = addCalendarDays(manilaDate(), 25);
  const slot = slotsForDate(await readScheduleSettings(), "cebu", date, new Date())[0];
  if (!slot) {
    t.skip("Cebu has no open slot on the test date");
    return;
  }
  const owner = { uid: "phase9-owner", email: "owner@example.test", role: "owner" as const, active: true, branchIds: [] };
  const key = flavorCapacityKey("cebu", date, product.id);
  const before = await db.doc(`allocations/${key}`).get();
  const variantRef = db.doc(`products/${product.id}/variants/${variant.id}`);
  const variantBefore = await variantRef.get();
  const idempotencyKeys: string[] = [];
  const created: string[] = [];
  const heldOf = async () => (await db.doc(`allocations/${key}`).get()).data()?.held ?? 0;
  const request = (idempotencyKey: string, when = date, slotId = slot.id, recoveryToken?: string) => ({
    idempotencyKey,
    branchId: "cebu" as const,
    slotId,
    name: "Recovery Test",
    contact: "09170000009",
    notes: "",
    delivery: "pickup" as const,
    address: "",
    payment: "bank" as const,
    catalogMode: "regular" as const,
    ...(recoveryToken ? { recoveryToken } : {}),
    selection: { date: when, lines: [{ productId: product.id, variantId: variant.id, quantity: 1, addons: [] }], addons: [] },
  });
  async function orderIdFor(idempotencyKey: string) {
    const idempotency = await db.doc(`orderIdempotency/${idempotencyKey}`).get();
    const id = String(idempotency.data()?.orderId ?? "");
    if (id) created.push(id);
    return id;
  }
  try {
    const baseline = await heldOf();
    const expiredKey = crypto.randomUUID();
    idempotencyKeys.push(expiredKey);
    const expiredSaved = await submitOrder(request(expiredKey));
    const expiredId = await orderIdFor(expiredKey);
    assert.equal(await heldOf(), baseline + 1);
    await db.doc(`orders/${expiredId}`).update({ deadline: new Date(Date.now() - 60_000).toISOString() });
    await expireDueHolds(new Date());
    assert.equal((await db.doc(`orders/${expiredId}`).get()).data()?.status, "expired");
    assert.equal(await heldOf(), baseline);
    const limitVersion = (await db.doc(`allocations/${key}`).get()).data()?.version ?? 0;
    await saveBranchAllocations({ branchId: "cebu", productId: product.id, days: [{ fulfillmentDate: date, limit: 0, version: limitVersion }] }, "phase9");
    const blocked = await reopenOrder({ orderId: expiredId, reopenKey: crypto.randomUUID(), actorUid: "customer" });
    assert.match(blocked.conflict ?? "", /online availability/);
    assert.doesNotMatch(blocked.conflict ?? "", /sold out|full/i);
    assert.equal((await db.doc(`orders/${expiredId}`).get()).data()?.status, "expired");
    assert.equal(await heldOf(), baseline);
    if (before.exists) await db.doc(`allocations/${key}`).set(before.data()!);
    else await db.doc(`allocations/${key}`).delete();
    const far = addCalendarDays(manilaDate(), 40);
    await db.doc(`orders/${expiredId}`).update({ fulfillmentDate: far, "selection.date": far });
    const tooSoon = await reopenOrder({ orderId: expiredId, reopenKey: crypto.randomUUID(), actorUid: "customer" });
    assert.match(tooSoon.conflict ?? "", /date|available/);
    assert.equal((await db.doc(`orders/${expiredId}`).get()).data()?.status, "expired");
    assert.equal(await heldOf(), before.data()?.held ?? 0);
    await db.doc(`orders/${expiredId}`).update({ fulfillmentDate: date, "selection.date": date });
    const reopenKey = crypto.randomUUID();
    const reopened = await reopenOrder({ orderId: expiredId, reopenKey, actorUid: "customer" });
    assert.equal(reopened.order?.orderNumber, expiredSaved.orderNumber);
    assert.equal(reopened.order?.status, "requested");
    assert.equal(await heldOf(), (before.data()?.held ?? 0) + 1);
    const repeated = await reopenOrder({ orderId: expiredId, reopenKey, actorUid: "customer" });
    assert.equal(repeated.order?.status, "requested");
    assert.equal(repeated.conflict, undefined);
    assert.equal(await heldOf(), (before.data()?.held ?? 0) + 1);
    const guest = await readGuestOrder(expiredSaved.token);
    assert.equal(guest?.status, "requested");
    assert.equal("contact" in (guest ?? {}), false);

    const cancelledKey = crypto.randomUUID();
    idempotencyKeys.push(cancelledKey);
    const cancelledSaved = await submitOrder(request(cancelledKey));
    const cancelledId = await orderIdFor(cancelledKey);
    await transitionOrder({ orderId: cancelledId, action: "reject", expectedStatus: "requested", reason: "Recovery test" }, owner);
    assert.equal((await db.doc(`orders/${cancelledId}`).get()).data()?.status, "cancelled");
    const cancelledHeld = await heldOf();
    const cancelledReopen = crypto.randomUUID();
    const cancelledOpened = await transitionOrder({ orderId: cancelledId, action: "reopen", expectedStatus: "cancelled", reopenKey: cancelledReopen }, owner);
    assert.equal(cancelledOpened.order.orderNumber, cancelledSaved.orderNumber);
    assert.equal(cancelledOpened.order.status, "requested");
    assert.equal(await heldOf(), cancelledHeld + 1);
    const cancelledRepeat = await transitionOrder({ orderId: cancelledId, action: "reopen", expectedStatus: "cancelled", reopenKey: cancelledReopen }, owner);
    assert.equal(cancelledRepeat.order.status, "requested");
    assert.equal(await heldOf(), cancelledHeld + 1);

    const reorderKey = crypto.randomUUID();
    idempotencyKeys.push(reorderKey);
    const reorderSaved = await submitOrder(request(reorderKey));
    const reorderId = await orderIdFor(reorderKey);
    await db.doc(`orders/${reorderId}`).update({ deadline: new Date(Date.now() - 60_000).toISOString() });
    await expireDueHolds(new Date());
    const previousSubtotal = (await db.doc(`orders/${reorderId}`).get()).data()?.knownSubtotalCentavos;
    await variantRef.update({ priceCentavos: variant.priceCentavos + 500 });
    const heldBeforeReorder = await heldOf();
    const recoveryKey = crypto.randomUUID();
    idempotencyKeys.push(recoveryKey);
    const reordered = await submitOrder(request(recoveryKey, date, slot.id, reorderSaved.token));
    const reorderedId = await orderIdFor(recoveryKey);
    const reorderedDoc = (await db.doc(`orders/${reorderedId}`).get()).data();
    assert.equal(reorderedDoc?.sourceOrderNumber, reorderSaved.orderNumber);
    assert.equal(reorderedDoc?.knownSubtotalCentavos, previousSubtotal + 500);
    assert.equal((await db.doc(`orders/${reorderId}`).get()).data()?.status, "expired");
    assert.equal(await heldOf(), heldBeforeReorder + 1);
    const replay = await submitOrder(request(recoveryKey, date, slot.id, reorderSaved.token));
    assert.equal(replay.orderNumber, reordered.orderNumber);
    assert.equal(await heldOf(), heldBeforeReorder + 1);
    const staleHeld = await heldOf();
    await assert.rejects(
      () => submitOrder(request(crypto.randomUUID(), addCalendarDays(manilaDate(), -1), slot.id, reorderSaved.token)),
      (error: unknown) => error instanceof Error && /available|date/.test(error.message),
    );
    assert.equal((await db.doc(`orders/${reorderId}`).get()).data()?.status, "expired");
    assert.equal(await heldOf(), staleHeld);
  } finally {
    if (variantBefore.exists) await variantRef.set(variantBefore.data()!);
    for (const idempotencyKey of idempotencyKeys) await db.doc(`orderIdempotency/${idempotencyKey}`).delete().catch(() => undefined);
    for (const id of created) if (id) await db.doc(`orders/${id}`).delete().catch(() => undefined);
    if (before.exists) await db.doc(`allocations/${key}`).set(before.data()!);
    else await db.doc(`allocations/${key}`).delete();
  }
});
});
