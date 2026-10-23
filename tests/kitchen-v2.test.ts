import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultBranchSettings } from "../src/lib/branches/schema";
import { AdminAccessError } from "../src/lib/admin/access";
import {
  KitchenCommandError, kitchenAccess, kitchenCommandSchema, planKitchenAdvance, presentKitchen, resolveKitchenScope, type KitchenCatalog, type KitchenOrderInput,
} from "../src/lib/admin/kitchen-v2";

const now = new Date("2026-10-23T04:00:00.000Z");
const owner = { role: "owner" as const, branchIds: ["cebu"], pages: {} };
const cook = { role: "staff" as const, branchIds: ["cebu"], pages: { kitchen: true, kitchenActions: { advance: true } } };
const key = "11111111-1111-4111-8111-111111111111";
const catalog: KitchenCatalog = {
  products: new Map([["buko", { name: "Buko", category: "sweet", allergens: ["coconut"], variants: new Map([["nine", "9-inch"]]) }]]),
  addons: new Map([["card", "Note card"]]),
};

function order(patch: Partial<KitchenOrderInput> = {}): KitchenOrderInput {
  return {
    id: "order-1", orderNumber: "MK-1001", branchId: "cebu", fulfillmentDate: "2026-10-23", slotId: "10:00", slotLabel: "10:00 AM–11:00 AM",
    status: "confirmed", delivery: "pickup", requireFullPayment: true, quoteStatus: "finalized", finalTotalCentavos: 10000, netReceivedCentavos: 10000,
    paymentStatus: "paid", notes: "Leave at the counter", selection: { date: "2026-10-23", lines: [{ productId: "buko", variantId: "nine", quantity: 2, addons: [{ id: "card", message: "Happy day" }] }], addons: [{ id: "card", message: "" }] },
    riderRecorded: false, version: "10", ...patch,
  };
}

describe("kitchen v2", () => {
  it("keeps kitchen access explicit and one branch at a time", () => {
    assert.deepEqual(kitchenAccess(owner), { allowed: true, canAdvance: true });
    assert.deepEqual(kitchenAccess(cook), { allowed: true, canAdvance: true });
    assert.equal(kitchenAccess({ role: "staff", pages: { kitchen: true } }).canAdvance, false);
    assert.equal(kitchenAccess({ role: "staff", pages: {} }).allowed, false);
    const settings = defaultBranchSettings();
    assert.deepEqual(resolveKitchenScope("cebu", "2026-10-23", owner, settings), { branchId: "cebu", date: "2026-10-23" });
    assert.throws(() => resolveKitchenScope("all", "2026-10-23", owner, settings), (error: KitchenCommandError) => error.message === "Choose one branch.");
    assert.throws(() => resolveKitchenScope("manila", "2026-10-23", cook, settings), AdminAccessError);
    assert.throws(() => resolveKitchenScope("cebu", "2026-10-23", { role: "staff", branchIds: ["cebu"], pages: {} }, settings), AdminAccessError);
  });

  it("shows confirmed pies only and does not invent packing", () => {
    const snapshot = presentKitchen({
      branchId: "cebu", date: "2026-10-23", now, access: { canAdvance: true }, catalog,
      orders: [order(), order({ id: "order-2", orderNumber: "MK-1002", status: "requested", slotId: "09:00", version: "2" }), order({ id: "order-3", orderNumber: "MK-0999", status: "ready", delivery: "lalamove", slotId: "11:00", version: "3", riderRecorded: true }), order({ id: "order-4", orderNumber: "MK-2000", branchId: "manila" })],
    });
    assert.equal(snapshot.unconfirmedPolicy, "separate");
    assert.deepEqual(snapshot.orders.map((item) => item.number), ["MK-1002", "MK-1001", "MK-0999"]);
    assert.equal(snapshot.orders[0].status, "pending");
    assert.equal(snapshot.orders[0].canAdvance, false);
    assert.match(snapshot.orders[0].blockReason ?? "", /preparation totals/);
    assert.equal(snapshot.orders[1].status, "approved");
    assert.equal(snapshot.orders[2].status, "out_delivery");
    assert.equal(snapshot.orders[1].lines[0].quantity, 2);
    assert.equal(snapshot.orders[1].lines[0].category, "sweet");
    assert.deepEqual(snapshot.orders[1].lines[0].allergens, ["coconut"]);
    assert.deepEqual(snapshot.orders[1].lines[0].extras, ["Note card: Happy day"]);
    assert.deepEqual(snapshot.orders[1].extras, ["Note card"]);
    assert.deepEqual(snapshot.orders[1].notes, ["Leave at the counter"]);
    assert.equal(snapshot.orders[1].boxes, null);
    assert.match(snapshot.orders[1].boxingNote ?? "", /staff confirmation/);
    assert.equal(snapshot.orders[1].contentsComplete, true);
    assert.equal(snapshot.orders[1].fullyPaid, true);
    assert.equal("contact" in snapshot.orders[1], false);
    assert.equal("address" in snapshot.orders[1], false);
    const four = presentKitchen({
      branchId: "cebu", date: "2026-10-23", now, access: { canAdvance: true },
      catalog: { products: new Map([["buko", { name: "Buko", category: "sweet", allergens: [], variants: new Map([["four", "4-inch"], ["ten", "10-inch"]]) }]]), addons: new Map() },
      orders: [order({ selection: { date: "2026-10-23", lines: [{ productId: "buko", variantId: "four", quantity: 6, addons: [] }, { productId: "buko", variantId: "ten", quantity: 1, addons: [] }], addons: [] } })],
    });
    assert.deepEqual(four.orders[0].boxes, [
      { label: "1 four-pie box", contents: "4 4-inch sweet pies" },
      { label: "2 individual containers", contents: "2 remaining 4-inch sweet pies" },
      { label: "1 custom box", contents: "1 large pie" },
    ]);
    const unpaid = presentKitchen({ branchId: "cebu", date: "2026-10-23", now, access: { canAdvance: true }, catalog, orders: [order({ paymentStatus: "unpaid", netReceivedCentavos: 0, requireFullPayment: false })] });
    assert.equal(unpaid.orders[0].canAdvance, false);
    assert.match(unpaid.orders[0].blockReason ?? "", /Full payment/);
    const unknown = presentKitchen({ branchId: "cebu", date: "2026-10-23", now, access: { canAdvance: true }, catalog, orders: [order({ quoteStatus: "pending", finalTotalCentavos: null })] });
    assert.equal(unknown.orders[0].fullyPaid, null);
    const missing = presentKitchen({ branchId: "cebu", date: "2026-10-23", now, access: { canAdvance: true }, catalog: { products: new Map(), addons: new Map() }, orders: [order()] });
    assert.equal(missing.orders[0].contentsComplete, false);
    assert.equal(missing.orders[0].lines.length, 0);
    const past = presentKitchen({ branchId: "cebu", date: "2026-10-22", now, access: { canAdvance: true }, catalog, orders: [order({ fulfillmentDate: "2026-10-22" })] });
    assert.equal(past.canAdvance, false);
    assert.match(past.orders[0].blockReason ?? "", /read-only/);
    const viewOnly = presentKitchen({ branchId: "cebu", date: "2026-10-23", now, access: { canAdvance: false }, catalog, orders: [order()] });
    assert.equal(viewOnly.canAdvance, false);
    assert.match(viewOnly.orders[0].blockReason ?? "", /view-only/);
  });

  it("advances one confirmed step and keeps a missing rider as an acknowledgment", () => {
    const snapshot = presentKitchen({ branchId: "cebu", date: "2026-10-23", now, access: { canAdvance: true }, catalog, orders: [order()] });
    const preparing = planKitchenAdvance({
      command: kitchenCommandSchema.parse({ branchId: "cebu", date: "2026-10-23", orderId: "order-1", expectedVersion: "10", expectedRevision: snapshot.revision, target: "preparing", acknowledgeMissingRider: false, idempotencyKey: key }),
      snapshot, access: { canAdvance: true }, now,
    });
    assert.deepEqual(preparing, { action: "preparing", expectedStatus: "confirmed" });
    const delivery = presentKitchen({
      branchId: "cebu", date: "2026-10-23", now, access: { canAdvance: true }, catalog,
      orders: [order({ status: "preparing", delivery: "lalamove", requireFullPayment: false })],
    });
    assert.throws(() => planKitchenAdvance({
      command: kitchenCommandSchema.parse({ branchId: "cebu", date: "2026-10-23", orderId: "order-1", expectedVersion: "10", expectedRevision: delivery.revision, target: "out_delivery", acknowledgeMissingRider: false, idempotencyKey: key }),
      snapshot: delivery, access: { canAdvance: true }, now,
    }), (error: KitchenCommandError) => error.kind === "validation");
    const handed = planKitchenAdvance({
      command: kitchenCommandSchema.parse({ branchId: "cebu", date: "2026-10-23", orderId: "order-1", expectedVersion: "10", expectedRevision: delivery.revision, target: "out_delivery", acknowledgeMissingRider: true, idempotencyKey: key }),
      snapshot: delivery, access: { canAdvance: true }, now,
    });
    assert.deepEqual(handed, { action: "ready", expectedStatus: "preparing" });
    assert.throws(() => planKitchenAdvance({
      command: kitchenCommandSchema.parse({ branchId: "cebu", date: "2026-10-23", orderId: "order-1", expectedVersion: "9", expectedRevision: snapshot.revision, target: "preparing", acknowledgeMissingRider: false, idempotencyKey: key }),
      snapshot, access: { canAdvance: true }, now,
    }), (error: KitchenCommandError) => error.kind === "conflict");
    assert.throws(() => planKitchenAdvance({
      command: kitchenCommandSchema.parse({ branchId: "cebu", date: "2026-10-22", orderId: "order-1", expectedVersion: "10", expectedRevision: snapshot.revision, target: "preparing", acknowledgeMissingRider: false, idempotencyKey: key }),
      snapshot: presentKitchen({ branchId: "cebu", date: "2026-10-22", now, access: { canAdvance: true }, catalog, orders: [order({ fulfillmentDate: "2026-10-22" })] }),
      access: { canAdvance: true }, now,
    }), (error: KitchenCommandError) => error.message.includes("read-only"));
    assert.throws(() => kitchenCommandSchema.parse({ branchId: "cebu", date: "2026-10-23", orderId: "order-1", expectedVersion: "10", expectedRevision: snapshot.revision, target: "preparing", acknowledgeMissingRider: false, idempotencyKey: "not-a-key" }));
  });
});
