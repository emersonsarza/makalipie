import assert from "node:assert/strict";
import test from "node:test";
import { defaultBranchSettings, branchCatalog } from "../src/lib/branches/schema";
import { defaultCatalog } from "../src/lib/catalog/defaults";
import { applyCatalogMigration, catalogMigrationPlan } from "../src/lib/catalog/migrate";
import { variantOrderMode } from "../src/lib/catalog/mode";
import { availabilityReason } from "../src/lib/catalog/rules";
import { menuSizes } from "../src/lib/catalog/menu-view";
import { shopSettingsSchema } from "../src/lib/settings/schema";
import type { MenuItem } from "../src/lib/site";

test("category days limit regular sizes, and pre-orders use the shop preparation time on any day", () => {
  const catalog = defaultCatalog();
  const product = catalog.products[0];
  product.menuCategoryId = "weekend";
  product.availableWeekdays = [5, 6, 0];
  const base = product.variants[0];
  product.variants = [
    { ...base, id: "4-inch", label: '4"', minLeadDays: 1, orderMode: undefined },
    { ...base, id: "10-inch", label: '10"', minLeadDays: 5, sortOrder: 1, orderMode: undefined },
  ];
  catalog.sections = [{ id: "weekend", name: "Weekend", note: "", sortOrder: 0 }];
  const next = applyCatalogMigration(catalog, { preorderLeadDays: 3 });
  const saved = next.products[0];
  const [regular, preorder] = saved.variants;
  assert.deepEqual([saved.id, regular.id, preorder.id], [product.id, "4-inch", "10-inch"]);
  assert.equal(variantOrderMode(regular), "regular");
  assert.equal(variantOrderMode(preorder), "preorder");
  assert.equal(regular.orderMode, undefined);
  assert.deepEqual(next.sections[0].availableWeekdays, [5, 6, 0]);
  const options = { categoryWeekdays: next.sections[0].availableWeekdays, preorderLeadDays: 3 };
  assert.match(availabilityReason(saved, regular, "2026-09-24", 0, "2026-09-23", options) ?? "", /weekday/);
  assert.equal(availabilityReason(saved, regular, "2026-09-25", 0, "2026-09-23", options), null);
  assert.match(availabilityReason(saved, preorder, "2026-09-26", 0, "2026-09-23", options) ?? "", /5 days/);
  assert.equal(availabilityReason(saved, preorder, "2026-09-28", 0, "2026-09-23", options), null);
  assert.match(availabilityReason(saved, { ...preorder, orderMode: "preorder" }, "2026-09-25", 0, "2026-09-23", options) ?? "", /3 days/);
  assert.equal(availabilityReason(saved, { ...preorder, orderMode: "preorder" }, "2026-09-26", 0, "2026-09-23", options), null);
  const plan = catalogMigrationPlan(next, [{ productId: saved.id, variantId: regular.id, branchIds: ["cebu"], mode: "preorder" }]);
  assert.equal(plan.variants.find((variant) => variant.variantId === "4-inch")?.minLeadDays, 0);
  assert.equal(plan.variants.find((variant) => variant.variantId === "10-inch")?.minLeadDays, 3);
  assert.equal(plan.assignments[0].mode, "regular");
  assert.deepEqual(plan.assignments[0].branchIds, ["cebu"]);
});

test("an explicit pre-order flag overrides size and a stale branch mode", () => {
  const item: MenuItem = {
    slug: "apple", name: "Apple", kind: "sweet", blurb: "Apple", description: "Apple",
    image: { src: "/images/brand/apple.webp", alt: "Apple" },
    variants: [{ id: "4-inch", label: '4"', pricingMode: "fixed", priceCentavos: 28000, minLeadDays: 0, orderMode: "preorder", active: true, sortOrder: 0 }],
  };
  assert.deepEqual(menuSizes([item], true)[0]?.variants?.map((variant) => variant.id), ["4-inch"]);
  assert.deepEqual(menuSizes([item], false), []);
  const catalog = defaultCatalog();
  const product = catalog.products[0];
  product.variants[0] = { ...product.variants[0], ...item.variants![0] };
  const settings = defaultBranchSettings();
  settings.assignments = [{ productId: product.id, variantId: "4-inch", branchIds: ["cebu"], mode: "regular" }];
  assert.equal(branchCatalog(catalog, settings, "cebu", "regular").products.some((entry) => entry.id === product.id), false);
  assert.equal(branchCatalog(catalog, settings, "cebu", "preorder").products.some((entry) => entry.id === product.id), true);
});

test("shop settings own the pre-order lead time and home featuring", () => {
  const settings = shopSettingsSchema.parse({});
  assert.equal(settings.defaultPreorderLeadDays, 3);
  assert.deepEqual(settings.featuredProductIds, ["buko", "smores", "pecan"]);
});
