import assert from "node:assert/strict";
import test from "node:test";
import { defaultCatalog } from "../src/lib/catalog/defaults";
import { MIXED_CATALOG_MESSAGE, branchCatalog, branchSettingsSchema, catalogForSelection, defaultBranchSettings, parseBranchSettings, regularBranchCatalog, resolveBranch, selectionCatalogMode, visibleBranches, currentAssignments } from "../src/lib/branches/schema";

test("URL branch wins; missing, invalid and repeated parameters use admin default", () => {
  const settings = { ...defaultBranchSettings(), defaultBranch: "manila" as const };
  assert.equal(resolveBranch("cebu", settings), "cebu");
  for (const value of [undefined, "popup", "", ["cebu", "manila"]]) assert.equal(resolveBranch(value, settings), "manila");
});
test("legacy catalog starts only in Cebu and preorder sizes stay out of normal ordering", () => {
  const catalog = defaultCatalog();
  const settings = defaultBranchSettings();
  assert.equal(regularBranchCatalog(catalog, settings, "manila").products.length, 0);
  const cebu = regularBranchCatalog(catalog, settings, "cebu");
  assert.ok(cebu.products.length > 0);
  assert.ok(cebu.products.every((p) => p.variants.every((v) => v.minLeadDays === 0)));
});
test("explicit assignment shares matching sizes and removes incompatible sizes from branch quote input", () => {
  const catalog = defaultCatalog(); const settings = defaultBranchSettings();
  settings.assignments = currentAssignments(catalog, settings);
  const first = settings.assignments.find((a) => a.mode === "regular")!;
  first.branchIds = ["cebu", "manila"];
  const scoped = regularBranchCatalog(catalog, settings, "manila");
  assert.equal(scoped.products.length, 1);
  assert.equal(scoped.products[0].id, first.productId);
  first.mode = "preorder";
  assert.equal(regularBranchCatalog(catalog, settings, "manila").products.length, 0);
  assert.equal(branchCatalog(catalog, settings, "manila", "preorder").products[0]?.id, first.productId);
});
test("a cart keeps one catalog, and the other catalog refuses those sizes", () => {
  const catalog = defaultCatalog();
  const settings = defaultBranchSettings();
  const regular = catalog.products.find((product) => product.variants.some((variant) => variant.minLeadDays === 0))!;
  const prepared = catalog.products.find((product) => product.id !== regular.id)!;
  prepared.variants[0].minLeadDays = 4;
  const regularLine = { productId: regular.id, variantId: regular.variants[0].id };
  const preparedLine = { productId: prepared.id, variantId: prepared.variants[0].id };
  assert.equal(selectionCatalogMode(settings, catalog, [regularLine, preparedLine]), "mixed");
  const mixed = catalogForSelection(catalog, settings, "cebu", [regularLine, preparedLine]);
  const regularRequest = catalogForSelection(catalog, settings, "cebu", [preparedLine], "regular");
  const preorderRequest = catalogForSelection(catalog, settings, "cebu", [regularLine], "preorder");
  assert.equal("error" in mixed ? mixed.error : "", MIXED_CATALOG_MESSAGE);
  assert.equal("error" in regularRequest ? regularRequest.error : "", MIXED_CATALOG_MESSAGE);
  assert.equal("error" in preorderRequest ? preorderRequest.error : "", MIXED_CATALOG_MESSAGE);
  const accepted = catalogForSelection(catalog, settings, "cebu", [preparedLine], "preorder");
  assert.equal("catalog" in accepted ? accepted.catalog.products.some((product) => product.id === prepared.id) : false, true);
});
test("branch settings reject duplicate assignments, duplicate branches, unknown destinations and invalid defaults", () => {
  const settings = defaultBranchSettings();
  const assignment = { productId: "keylime", variantId: "standard", branchIds: ["cebu"], mode: "regular" };
  for (const assignments of [[assignment, assignment], [{ ...assignment, branchIds: ["cebu", "cebu"] }], [{ ...assignment, branchIds: ["popup"] }]]) {
    assert.equal(branchSettingsSchema.safeParse({ ...settings, assignments }).success, false);
  }
  assert.equal(branchSettingsSchema.safeParse({ ...settings, defaultBranch: "popup" }).success, false);
});
test("Cebu stays public and cannot be removed, and older cebu/manila documents still load", () => {
  const hidden = defaultBranchSettings();
  hidden.branches = hidden.branches.map((branch) => branch.id === "cebu" ? { ...branch, visible: false } : branch);
  assert.equal(branchSettingsSchema.safeParse(hidden).success, false);
  assert.equal(parseBranchSettings(hidden).branches.find((branch) => branch.id === "cebu")!.visible, true);
  const removed = { ...defaultBranchSettings(), branches: defaultBranchSettings().branches.filter((branch) => branch.id !== "cebu") };
  assert.equal(branchSettingsSchema.safeParse(removed).success, false);
  assert.throws(() => parseBranchSettings(removed));
  const legacy = parseBranchSettings({
    version: 3,
    defaultBranch: "manila",
    branches: { cebu: { name: "Makalipie Cebu Main", address: "Banilad" }, manila: { name: "Makalipie Manila Main", address: "" } },
    assignments: [],
  });
  assert.deepEqual(legacy.branches.map((branch) => branch.id), ["cebu", "manila"]);
  assert.equal(legacy.branches[0].address, "Banilad");
  assert.equal(legacy.branches.every((branch) => branch.visible), true);
  assert.equal(legacy.defaultBranch, "manila");
});
test("a hidden or unknown branch falls back, and one public branch is the only choice", () => {
  const settings = defaultBranchSettings();
  settings.branches = settings.branches.map((branch) => branch.id === "manila" ? { ...branch, visible: false } : branch);
  settings.defaultBranch = "cebu";
  const parsed = parseBranchSettings(settings);
  assert.deepEqual(visibleBranches(parsed).map((branch) => branch.id), ["cebu"]);
  assert.equal(resolveBranch("manila", parsed), "cebu");
  assert.equal(resolveBranch("popup", parsed), "cebu");
  assert.equal(resolveBranch(undefined, parsed), "cebu");
  const hiddenDefault = parseBranchSettings({ ...settings, defaultBranch: "manila" });
  assert.equal(hiddenDefault.defaultBranch, "cebu");
});
