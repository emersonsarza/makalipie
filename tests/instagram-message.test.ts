import assert from "node:assert/strict";
import test from "node:test";
import { formatInstagramOrder } from "../src/lib/orders/instagram-message";

test("formats a pickup request without an order number", () => {
  const message = formatInstagramOrder({
    name: "Ada",
    phone: "09171234567",
    branch: "Cebu",
    when: "Sat, Nov 1 · 10:00 AM–11:00 AM",
    fulfillment: "pickup",
    pickupAddress: "2nd Floor, Streetscape, Banilad, Cebu City",
    payment: "GCash",
    pies: [{
      quantity: 2,
      name: "Keylime 4\"",
      price: "₱700",
      extras: [{ name: "Birthday Topper", price: "₱8", message: "Happy birthday" }],
    }],
    notes: "No nuts on the card",
    subtotal: "₱708",
  });
  assert.match(message, /^Makalipie order request/);
  assert.match(message, /Name: Ada/);
  assert.match(message, /Phone: 09171234567/);
  assert.match(message, /Branch: Cebu/);
  assert.match(message, /When: Sat, Nov 1 · 10:00 AM–11:00 AM \(Manila time\)/);
  assert.match(message, /Fulfillment: Pickup at 2nd Floor, Streetscape, Banilad, Cebu City/);
  assert.match(message, /Payment: GCash/);
  assert.match(message, /2 × Keylime 4" — ₱700/);
  assert.match(message, /Extra: Birthday Topper — ₱8/);
  assert.match(message, /Message: Happy birthday/);
  assert.match(message, /Notes\nNo nuts on the card/);
  assert.match(message, /Known subtotal: ₱708/);
  assert.match(message, /This is a request until Makalipie confirms it in this chat\.$/);
  assert.equal(message.includes("MK-"), false);
  assert.equal(message.includes("order number"), false);
});

test("formats delivery, packages, and an unpriced size", () => {
  const message = formatInstagramOrder({
    name: "Ben",
    phone: "09180000000",
    branch: "Cebu",
    when: "Sun, Nov 2 · 2:00 PM–3:00 PM",
    fulfillment: "delivery",
    deliveryAddress: "123 Example Street, Cebu City",
    deliveryFeePayment: "to_driver",
    payment: "Bank Transfer",
    pies: [{ quantity: 1, name: "Apple 10\"", price: "To confirm" }],
    packages: [{ quantity: 1, name: "Sunday box", price: "₱1,200" }],
    subtotal: "₱1,200",
    unpriced: true,
  });
  assert.match(message, /Fulfillment: Delivery/);
  assert.match(message, /Address: 123 Example Street, Cebu City/);
  assert.match(message, /Delivery fee: Pay the rider directly/);
  assert.match(message, /1 × Sunday box — ₱1,200/);
  assert.match(message, /Some prices will be confirmed in chat\./);
});
