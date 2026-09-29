import assert from "node:assert/strict";
import test from "node:test";
import { capacityOpen, displayedOrderDate, flavorAvailabilityMessage, flavorHasRoom, flavorQuantities, heldAfterFlavor } from "../src/lib/orders/allocation";
import { ordersVisibleTo, type InboxOrder } from "../src/lib/orders/schema";

const open = { limit: 2, held: 1 };
test("a blank flavor stays open and a saved number caps it", () => {
  assert.equal(capacityOpen(undefined, "2026-09-29", "2026-09-28"), true);
  assert.equal(capacityOpen(null, "2026-09-29", "2026-09-28"), true);
  assert.equal(capacityOpen({ limit: null, held: 4 }, "2026-09-29", "2026-09-28"), true);
  assert.equal(flavorHasRoom(undefined, 2, "2026-09-29", "2026-09-28"), true);
  assert.equal(flavorHasRoom({ limit: null, held: 4 }, 2, "2026-09-29", "2026-09-28"), true);
  assert.equal(capacityOpen(undefined, "2026-09-28", "2026-09-28", true), false);
  assert.equal(flavorHasRoom(undefined, 1, "2026-09-28", "2026-09-28", true), false);
  assert.equal(capacityOpen({ limit: 0, held: 0 }, "2026-09-29", "2026-09-28"), false);
  assert.equal(flavorHasRoom({ limit: 0, held: 0 }, 1, "2026-09-29", "2026-09-28"), false);
});
test("a paused today blocks new requests and a later date stays open", () => {
  assert.equal(capacityOpen(open, "2026-09-28", "2026-09-28", true), false);
  assert.equal(capacityOpen(open, "2026-09-29", "2026-09-28", true), true);
});
test("sizes of one flavor add together and add-ons are not part of the count", () => {
  assert.deepEqual(flavorQuantities([
    { productId: "keylime", quantity: 2 },
    { productId: "keylime", quantity: 1 },
    { productId: "pecan", quantity: 1 },
  ]), [
    { productId: "keylime", quantity: 3 },
    { productId: "pecan", quantity: 1 },
  ]);
  assert.equal(heldAfterFlavor(0, 4), 4);
  assert.equal(flavorHasRoom({ limit: 3, held: 0 }, 4, "2026-09-29", "2026-09-28"), false);
  assert.equal(flavorHasRoom({ limit: 4, held: heldAfterFlavor(0, 2) }, 2, "2026-09-29", "2026-09-28"), true);
});
test("one flavor can be closed while another still accepts pies", () => {
  assert.equal(capacityOpen({ limit: 1, held: 1 }, "2026-09-29", "2026-09-28"), false);
  assert.equal(capacityOpen({ limit: 2, held: 0 }, "2026-09-29", "2026-09-28"), true);
  const message = flavorAvailabilityMessage(["Keylime"]);
  assert.match(message, /Keylime doesn't have enough online availability/);
  assert.doesNotMatch(message, /sold out|full/i);
});
test("an explicit future date is not replaced when an earlier date opens", () => {
  assert.equal(displayedOrderDate("2026-10-02", ["2026-09-29", "2026-10-02"]), "2026-10-02");
  assert.equal(displayedOrderDate(undefined, ["2026-09-29", "2026-10-02"]), "2026-09-29");
  assert.equal(displayedOrderDate(undefined, []), "");
});
test("staff see only assigned branches", () => {
  const orders = [
    { branchId: "cebu", orderNumber: "MP-1001" },
    { branchId: "manila", orderNumber: "MP-1002" },
  ] as InboxOrder[];
  assert.deepEqual(ordersVisibleTo("staff", ["cebu"], orders).map((order) => order.orderNumber), ["MP-1001"]);
  assert.deepEqual(ordersVisibleTo("staff", [], orders), []);
  assert.equal(ordersVisibleTo("owner", [], orders).length, 2);
});
