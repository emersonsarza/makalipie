import assert from "node:assert/strict";
import test from "node:test";
import { staticBranchSettings, staticPopups, staticPublicMenu, staticPublicShop, staticSchedule } from "../src/lib/public/static-shop";

test("the public site reads the seed shop without Firebase", () => {
  const branches = staticBranchSettings();
  const schedule = staticSchedule();
  const shop = staticPublicShop();
  const menu = staticPublicMenu();
  assert.equal(branches.defaultBranch, "cebu");
  assert.equal(branches.branches.find((branch) => branch.id === "cebu")?.visible, true);
  assert.equal(schedule.branches.cebu.enabled, true);
  assert.equal(shop.branchName, "Cebu");
  assert.ok(shop.links.instagramDm.startsWith("https://"));
  assert.ok(menu.items.length >= 9);
  assert.equal(menu.unavailable, false);
  assert.equal(staticPopups().listings.length, 2);
});
