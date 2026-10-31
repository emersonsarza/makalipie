import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanLocationBranches, nextSunday, publicLocations, locationAnchor } from "../src/lib/popups/locations";
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
  const examples = [
    { id: "ended", name: "Ended", address: "Cebu", mapUrl: "", startDate: "2026-10-20", endDate: "2026-10-25", hours: "10am–6pm", items: ["Pie"] },
    { id: "older", name: "Older", address: "Cebu", mapUrl: "", startDate: "2026-09-20", endDate: "2026-09-25", hours: "10am–6pm", items: ["Pie"] },
  ];
  assert.equal(publicLocations(examples, "2026-10-25").upcoming.length, 1);
  assert.equal(publicLocations(examples, "2026-10-26").recent.map(p => p.id).join(), "ended");
  assert.equal(publicLocations(examples, "2026-11-24").recent.map(p => p.id).join(), "ended");
  assert.equal(publicLocations(examples, "2026-11-25").recent.length, 0);
});
test("Mont Christmas stays hidden and Sunday Market rolls to the next Sunday", () => {
  const withMont = [
    ...seedPopups.listings,
    { id: "mont-christmas-bazaar", name: "MONT Christmas Bazaar", address: "Guadalupe, Cebu City", mapUrl: "", startDate: "2026-10-24", endDate: "2026-10-25", hours: "10am–6pm", items: ["Keylime"] },
  ];
  assert.equal(nextSunday("2026-10-31"), "2026-11-01");
  assert.equal(nextSunday("2026-11-01"), "2026-11-01");
  assert.equal(nextSunday("2026-11-02"), "2026-11-08");
  const saturday = publicLocations(withMont, "2026-10-31");
  assert.deepEqual(saturday.upcoming.map(p => [p.id, p.startDate, p.endDate]), [["sunday-market", "2026-11-01", "2026-11-01"]]);
  assert.equal(saturday.recent.length, 0);
  assert.equal(publicLocations(withMont, "2026-11-02").upcoming[0]?.startDate, "2026-11-08");
  assert.equal(JSON.stringify(saturday).includes("MONT Christmas"), false);
});
test("sample locations have unique anchors, clean labels and specific direction destinations", () => {
  assert.equal(seedBranchSettings.branches[0].name, "Cebu");
  assert.equal(seedPopups.listings.some(p => p.id === "mont-christmas-bazaar"), false);
  assert.equal(new Set(seedPopups.listings.map(p => locationAnchor(p.id))).size, seedPopups.listings.length);
  for (const popup of seedPopups.listings) {
    const url = new URL(popup.mapUrl);
    assert.equal(url.searchParams.get("api"), "1");
    assert.ok(url.searchParams.get("destination")?.includes("Cebu"));
  }
});
