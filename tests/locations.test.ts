import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanLocationBranches, publicLocations, locationAnchor } from "../src/lib/popups/locations";
import { seedPopups, seedBranchSettings } from "../src/lib/catalog/seed-data";
import { defaultBranchSettings } from "../src/lib/branches/schema";

test("Cebu stays public and Manila stays stored but hidden", () => {
  const settings = defaultBranchSettings();
  settings.branches[0].name = "Makalipie Cebu Main";
  settings.branches[1].name = "Makalipie Manila Main";
  settings.branches[1].visible = true;
  const result = cleanLocationBranches(settings.branches);
  assert.equal(result[0].name, "Cebu");
  assert.equal(result[1].name, "Manila");
  assert.equal(result[1].visible, false);
  assert.equal(result.length, 2);
  assert.deepEqual(cleanLocationBranches(result), result);
  assert.equal(result[0].address, settings.branches[0].address);
});
test("popup groups respect Manila calendar-date boundaries and 30-day recent window", () => {
  const examples = seedPopups.listings;
  assert.equal(publicLocations(examples, "2026-10-25").upcoming.length, 2);
  assert.equal(publicLocations(examples, "2026-10-26").recent.length, 2);
  assert.equal(publicLocations(examples, "2026-11-24").recent.length, 2);
  assert.equal(publicLocations(examples, "2026-11-25").recent.length, 0);
  assert.equal(publicLocations(examples, "2026-10-29").upcoming.length, 0);
});
test("sample locations have unique anchors, clean labels and specific direction destinations", () => {
  assert.equal(seedBranchSettings.branches[0].name, "Cebu");
  assert.equal(new Set(seedPopups.listings.map(p => locationAnchor(p.id))).size, 2);
  for (const popup of seedPopups.listings) {
    const url = new URL(popup.mapUrl);
    assert.equal(url.searchParams.get("api"), "1");
    assert.ok(url.searchParams.get("destination")?.includes("Cebu"));
  }
});
