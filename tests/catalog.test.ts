import assert from "node:assert/strict";
import test from "node:test";
import { defaultCatalog } from "../src/lib/catalog/defaults";
import { availabilityReason, manilaDate, quoteSelection } from "../src/lib/catalog/rules";
import { addonWriteSchema, dateSchema, pesosToCentavos, productCatalogSchema, selectionSchema, variantSchema, type Selection } from "../src/lib/catalog/schema";

test("centavo conversion and strict price/date boundaries", () => {
  assert.equal(pesosToCentavos("240.50"), 24050); assert.equal(pesosToCentavos("0.01"), 1);
  for (const value of ["", "1.001", "-1", "1e2"]) assert.ok(Number.isNaN(pesosToCentavos(value)));
  assert.equal(dateSchema.safeParse("2026-02-30").success, false); assert.equal(dateSchema.safeParse("2028-02-29").success, true);
  const variant = defaultCatalog().products[0].variants[0];
  assert.equal(variantSchema.safeParse({ ...variant, priceCentavos: 1.5 }).success, false);
  assert.equal(variantSchema.safeParse({ ...variant, pricingMode: "quote_required" }).success, false);
  assert.equal(productCatalogSchema.safeParse({ version: 1, variants: [variant, variant], availableWeekdays: [], unavailableDates: [], allowedAddonIds: [] }).success, false);
  const { id, version, ...fields } = defaultCatalog().addons[0];
  assert.equal(addonWriteSchema.safeParse({ id, version, fields: { ...fields, customization: { ...fields.customization, required: true } } }).success, false);
});

test("Manila date boundaries, recurring days, exceptions, lead times, and inactive sizes", () => {
  assert.equal(manilaDate(new Date("2026-09-23T15:59:59Z")), "2026-09-23");
  assert.equal(manilaDate(new Date("2026-09-23T16:00:00Z")), "2026-09-24");
  const p = defaultCatalog().products.find((p) => p.id === "buko")!; const v = p.variants[0];
  assert.equal(availabilityReason(p, v, "2026-09-25", 0, "2026-09-23"), null);
  assert.match(availabilityReason(p, v, "2026-09-24", 0, "2026-09-23")!, /weekday/);
  assert.match(availabilityReason({ ...p, unavailableDates: ["2026-09-25"] }, v, "2026-09-25", 0, "2026-09-23")!, /Not available/);
  assert.match(availabilityReason(p, { ...v, minLeadDays: 3 }, "2026-09-25", 0, "2026-09-23")!, /3 days/);
  assert.equal(availabilityReason({ ...p, availableWeekdays: [] }, v, "2026-09-24", 0, "2026-09-23"), null);
  assert.match(availabilityReason(p, { ...v, active: false }, "2026-09-25", 0, "2026-09-23")!, /unavailable/);
});

test("mixed quoted lines, per-item multiplication, per-order extras, customization and compatibility", () => {
  const c = defaultCatalog(); c.addons[0].scope = "per_item";
  const selection: Selection = { date: "2026-09-25", lines: [{ productId: "keylime", variantId: "standard", quantity: 3, addons: [{ id: "birthday-topper", message: "" }] }, { productId: "buko", variantId: "standard", quantity: 1, addons: [] }], addons: [{ id: "note-card", message: "Happy birthday" }] };
  const quote = quoteSelection(c, selection, "2026-09-23");
  assert.deepEqual(quote.errors, []); assert.equal(quote.knownSubtotalCentavos, 75900); assert.equal(quote.quoteRequired, true); assert.match(quote.addonLines[0], /Happy birthday/);
  c.products[0].allowedAddonIds = [];
  assert.match(quoteSelection(c, selection, "2026-09-23").errors.join(), /incompatible/);
  c.products[0].allowedAddonIds = ["birthday-topper", "note-card"]; c.addons[1].customization.required = true;
  assert.match(quoteSelection(c, { ...selection, addons: [{ id: "note-card", message: "" }] }, "2026-09-23").errors.join(), /message/);
  c.addons[0].minLeadDays = 3; assert.match(quoteSelection(c, selection, "2026-09-23").errors.join(), /3 days/);
  c.addons[1].minLeadDays = 3; assert.match(quoteSelection(c, selection, "2026-09-23").errors.join(), /add-ons need/);
  assert.equal(selectionSchema.safeParse({ ...selection, priceCentavos: 1 }).success, false);
  assert.equal(selectionSchema.safeParse({ ...selection, lines: [{ ...selection.lines[0], quantity: 0 }] }).success, false);
  assert.match(quoteSelection(c, { ...selection, lines: [selection.lines[0], selection.lines[0]] }, "2026-09-23").errors.join(), /twice/);
});
