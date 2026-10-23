import assert from "node:assert/strict";
import test from "node:test";
import { orderRequestSchema, inboxOrderSchema } from "../src/lib/orders/schema";

const request = {
  idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
  branchId: "cebu", slotId: "11:00", name: "Customer", contact: "09170000000",
  delivery: "pickup", payment: "gcash",
  selection: { date: "2026-10-10", lines: [{ productId: "pecan", variantId: "standard", quantity: 1, addons: [] }], addons: [] },
};
for (const catalogMode of ["regular", "preorder"]) {
  test(`${catalogMode} requests need no customer address`, () => {
    const parsed = orderRequestSchema.parse({ ...request, catalogMode });
    assert.equal(parsed.delivery, "pickup");
    assert.equal("address" in parsed, false);
  });
}
test("stale delivery submissions are rejected with reload guidance", () => {
  const result = orderRequestSchema.safeParse({ ...request, delivery: "lalamove", address: "Customer destination" });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.error.issues.some(issue => issue.path[0] === "delivery" && issue.message.includes("reload")));
});
test("pickup cannot collect a destination; old empty fields remain compatible", () => {
  assert.equal(orderRequestSchema.safeParse({ ...request, address: "Customer destination" }).success, false);
  assert.equal(orderRequestSchema.safeParse({ ...request, address: "" }).success, true);
});
test("legacy delivery fields remain valid for reading historical orders", () => {
  assert.equal(inboxOrderSchema.shape.delivery.parse("lalamove"), "lalamove");
  assert.equal(inboxOrderSchema.shape.address.parse(""), "");
  assert.equal(inboxOrderSchema.shape.deliveryFeeCentavos.parse(15000), 15000);
});
