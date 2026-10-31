import assert from "node:assert/strict";
import test from "node:test";
import { featuredMenuSlugs } from "../src/lib/site";
import { seedProducts, seedShop } from "../src/lib/catalog/seed-data";
import { defaultShopSettings, shopSettingsSchema } from "../src/lib/settings/schema";

test("home and seed defaults share four unique available favourites in order", () => {
  const expected = ["buko", "smores", "pecan", "keylime"];
  assert.deepEqual(featuredMenuSlugs, expected);
  assert.deepEqual(defaultShopSettings.featuredProductIds, expected);
  assert.deepEqual(seedShop.featuredProductIds, expected);
  assert.equal(new Set(featuredMenuSlugs).size, 4);
  assert.ok(expected.every(id => seedProducts.some(product => product.id === id)));
});
test("saved favourites retain their own count and order", () => {
  for (const featuredProductIds of [["oreo"], ["keylime", "buko", "pecan"], []]) {
    assert.deepEqual(shopSettingsSchema.parse({ featuredProductIds }).featuredProductIds, featuredProductIds);
  }
});
