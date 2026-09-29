import assert from "node:assert/strict";
import test from "node:test";
import { flavorCapacityKey } from "../src/lib/orders/allocation";
import {
  assertPaymentBeforePreparation,
  dailyCapacityKey,
  defaultOrderingPolicy,
  initialReservationDeadline,
  orderingPolicySchema,
} from "../src/lib/orders/policy";

test("all catalog/fulfillment combinations use one branch-day pool", () => {
  const keys = [];
  for (const catalog of ["regular", "preorder"]) {
    for (const method of ["pickup", "delivery"]) {
      const order = { catalog, method, branchId: "cebu", date: "2026-10-01" };
      keys.push(dailyCapacityKey(order.branchId, order.date));
    }
  }
  assert.equal(new Set(keys).size, 1);
  assert.notEqual(keys[0], dailyCapacityKey("manila", "2026-10-01"));
  assert.notEqual(keys[0], dailyCapacityKey("cebu", "2026-10-02"));
  assert.equal(dailyCapacityKey("popup", "2026-10-01"), "popup_2026-10-01");
  assert.equal(flavorCapacityKey("cebu", "2026-10-01", "keylime"), "cebu_2026-10-01_keylime");
  assert.notEqual(flavorCapacityKey("cebu", "2026-10-01", "keylime"), flavorCapacityKey("cebu", "2026-10-01", "pecan"));
  assert.throws(() => dailyCapacityKey("Not A Branch", "2026-10-01"));
  assert.throws(() => dailyCapacityKey("../cebu", "2026-10-01"));
  assert.throws(() => dailyCapacityKey("cebu", "2026-02-30"));
});

test("default hold lasts 30 minutes across Manila midnight", () => {
  const submitted = new Date("2026-09-27T15:50:00Z");
  assert.equal(initialReservationDeadline(submitted).toISOString(), "2026-09-27T16:20:00.000Z");
  assert.equal(submitted.toISOString(), "2026-09-27T15:50:00.000Z");
  assert.equal(initialReservationDeadline(submitted, { reservationMinutes: 15 }).toISOString(), "2026-09-27T16:05:00.000Z");
  assert.throws(() => initialReservationDeadline(new Date("invalid")));
  for (const reservationMinutes of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => initialReservationDeadline(submitted, { reservationMinutes }));
  }
});

test("configuration cannot restore separate pools or payment on collection", () => {
  assert.equal(defaultOrderingPolicy.reservationMinutes, 30);
  assert.equal(defaultOrderingPolicy.capacityPool, "per_flavor_daily");
  assert.equal(orderingPolicySchema.safeParse({ capacityPool: "per_slot" }).success, false);
  assert.equal(orderingPolicySchema.safeParse({ capacityPool: "shared_daily_orders" }).success, false);
  assert.equal(orderingPolicySchema.safeParse({ paymentBeforePreparation: false }).success, false);
});

test("preparation requires finalized, verified full payment including after edits", () => {
  const paid = { quoteStatus: "finalized", paymentStatus: "paid", finalTotalCentavos: 100_000, netReceivedCentavos: 100_000 };
  assert.doesNotThrow(() => assertPaymentBeforePreparation(paid));
  for (const change of [
    { paymentStatus: "unpaid" }, { paymentStatus: "partially_paid" },
    { paymentStatus: "refunded" }, { quoteStatus: "pending" },
    { finalTotalCentavos: null }, { netReceivedCentavos: 99_999 },
    { finalTotalCentavos: 110_000 }, { netReceivedCentavos: -1 },
    { netReceivedCentavos: 100_000.5 },
  ]) assert.throws(() => assertPaymentBeforePreparation({ ...paid, ...change }));
  // A price reduction keeps recorded money; refund settlement is separate.
  assert.doesNotThrow(() => assertPaymentBeforePreparation({ ...paid, finalTotalCentavos: 90_000 }));
  assert.throws(() => assertPaymentBeforePreparation({ ...paid, paymentStatus: "unpaid", finalTotalCentavos: 0 }));
});

test("booking defaults preserve future ordering after the same-day cutoff", () => {
  assert.equal(defaultOrderingPolicy.bookingHorizonDays, 30);
  assert.equal(defaultOrderingPolicy.cutoffScope, "same_day_only");
  assert.equal(orderingPolicySchema.parse({ bookingHorizonDays: 90 }).bookingHorizonDays, 90);
  for (const bookingHorizonDays of [0, -1, 2.5, Infinity]) {
    assert.equal(orderingPolicySchema.safeParse({ bookingHorizonDays }).success, false);
  }
  assert.equal(orderingPolicySchema.safeParse({ cutoffScope: "all_orders" }).success, false);
});
