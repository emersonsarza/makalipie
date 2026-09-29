import { test } from "node:test";
import assert from "node:assert/strict";
import { receiptLine, receiptAddon } from "../src/lib/orders/receipt-line";

test("receipt uses saved unit price and quantity, preserving customization", () => {
  assert.deepEqual(receiptLine('3 × Keylime · Large (₱1,240.50 each)\n  + Card: “Happy birthday” (₱15 for 3)'), {
    title: 'Keylime', size: 'Large', quantity: 3, unitAmount: '₱1,240.50', amount: '₱3,721.50', extras: '+ Card: “Happy birthday” (₱15 for 3)',
  });
});
test("quoted and legacy lines never invent amounts", () => {
  assert.equal(receiptLine('2 × Pecan · Whole (Price to confirm)')?.amount, 'To confirm');
  assert.equal(receiptLine('Legacy custom order'), null);
});
test("order extras retain messages while separating their amounts", () => {
  assert.deepEqual(receiptAddon('Card: “Love (always)” (₱15)'), { title: 'Card: “Love (always)”', amount: '₱15' });
  assert.equal(receiptAddon('Unpriced extra'), null);
});
