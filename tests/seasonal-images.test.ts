import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { seasonalImages, seasonalPhoto } from "../src/lib/seasonal-images";

test("seasonal overrides are limited to explicitly matched small-pie images", () => {
  assert.equal(seasonalPhoto("/images/brand/buko.webp")?.src, "/images/christmas/buko.webp");
  assert.equal(seasonalPhoto("/images/brand/gift.webp", true, "menu-hero")?.src, "/images/christmas/menu-hero.webp");
  for (const src of ["/images/brand/buko-10.webp", "/images/brand/pecan-10.webp", "https://example.com/buko.webp", "/images/brand/new-product.webp"]) assert.equal(seasonalPhoto(src), undefined);
  assert.equal(seasonalPhoto("/images/brand/buko.webp", false), undefined);
});

test("every seasonal mapping has an available local asset and useful crop and description", () => {
  for (const entry of Object.values(seasonalImages)) {
    assert.ok(existsSync(`public${entry.src}`), `Missing ${entry.src}`);
    assert.ok(entry.alt.length > 20);
    for (const crop of [entry.position, entry.mobilePosition]) assert.match(crop, /^\d+% \d+%$/);
  }
});
