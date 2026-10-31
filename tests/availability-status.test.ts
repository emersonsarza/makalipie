import assert from "node:assert/strict";
import test from "node:test";
import { defaultCatalog } from "../src/lib/catalog/defaults";
import { availabilityReason, availabilityStatus, availabilityText } from "../src/lib/catalog/rules";

const product = { ...defaultCatalog().products[0], active: true, availableWeekdays: [5, 6, 0], unavailableDates: [] as string[] };
const regular = { ...product.variants[0], active: true, label: '4"', orderMode: "regular" as const, minLeadDays: 0, availableWeekdays: undefined };
const preorder = { ...regular, label: '10"', orderMode: "preorder" as const, minLeadDays: 9 };
const today = "2026-10-26";

test("weekday classification uses category override, including an empty daily schedule", () => {
  assert.equal(availabilityStatus(product, regular, today, 0, today).blockers[0]?.code, "weekday");
  assert.deepEqual(availabilityStatus(product, regular, today, 0, today, {categoryWeekdays: []}).blockers, []);
  assert.equal(availabilityStatus(product, regular, today, 0, today, {categoryWeekdays: [1]}).blockers.length, 0);
  assert.equal(availabilityText(product, regular, [5,6,0]), "Available Fri, Sat, Sun");
});
test("preorders ignore weekday schedules and use the configured shop lead time", () => {
  assert.deepEqual(availabilityStatus(product, preorder, "2026-10-29", 0, today, {categoryWeekdays: [5], preorderLeadDays: 3}).blockers, []);
  assert.equal(availabilityStatus(product, preorder, "2026-10-28", 0, today, {preorderLeadDays: 3}).blockers[0]?.code, "preparation");
});
test("secondary blockers are retained with legacy precedence and exact messages", () => {
  const blocked = {...product, unavailableDates: ["2026-10-27"]};
  const options = {preorderLeadDays: 3};
  assert.deepEqual(availabilityStatus(blocked, preorder, "2026-10-27", 0, today, options).blockers.map(b=>b.code), ["preparation", "date_exception"]);
  assert.equal(availabilityReason(blocked, preorder, "2026-10-27", 0, today, options), "Needs at least 3 days of preparation.");
  assert.deepEqual(availabilityStatus(blocked, regular, "2026-10-27", 0, today).blockers.map(b=>b.code), ["date_exception", "weekday"]);
  assert.equal(availabilityReason(blocked, regular, "2026-10-27", 0, today), "Not available on this date.");
});
test("inactive, invalid, past, and available results remain compatible", () => {
  assert.equal(availabilityStatus({...product,active:false}, regular, today, 0, today).blockers[0]?.code, "inactive");
  assert.equal(availabilityStatus(product, regular, "invalid", 0, today).blockers[0]?.code, "invalid_date");
  assert.equal(availabilityStatus(product, regular, "2026-10-25", 0, today).blockers[0]?.code, "past_date");
  assert.equal(availabilityReason(product, regular, "2026-10-30", 0, today), null);
});
