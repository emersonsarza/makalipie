import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PACKAGE_POLICY, PackageCommandError, defaultPackageSettings, packageCommandSchema, packagesAccess, packagesRevision, planPackageSave, presentPackages, variantBranchIds, type PackageDependencies, type PackageSettings } from "../src/lib/admin/packages-v2";

const key = "11111111-1111-4111-8111-111111111111";

function deps(active = true): PackageDependencies {
  return {
    branchVersion: 4,
    branches: [{ id: "cebu", name: "Cebu" }, { id: "manila", name: "Manila" }],
    variants: [{
      key: "buko:nine", productId: "buko", variantId: "nine", name: "Buko", size: "9 inch",
      active, branchIds: ["cebu"], category: "sweet", priceCentavos: 45000, minLeadDays: 0,
    }, {
      key: "chicken:nine", productId: "chicken", variantId: "nine", name: "Chicken", size: "9 inch",
      active, branchIds: ["cebu", "manila"], category: "savory", priceCentavos: 48000, minLeadDays: 0,
    }],
  };
}
function stored(): PackageSettings {
  return {
    version: 2,
    packages: [{
      id: "weekend", name: "Weekend pies", description: "Two favorites", active: false, branchIds: ["cebu", "retired-pop"],
      contents: [{ productId: "buko", variantId: "nine", quantity: 2 }], packingNotes: "Keep savory separate.",
      priceMode: "calculated", priceCentavos: null, maxPackagesPerOrder: null,
    }],
  };
}
function command(settings: PackageSettings, dependencies: PackageDependencies, patch: Record<string, unknown> = {}, isNew = false) {
  const snapshot = presentPackages(settings, dependencies, true);
  const current = snapshot.packages[0];
  return packageCommandSchema.parse({
    package: {
      id: current?.id ?? "weekend", name: current?.name ?? "Weekend pies", description: current?.description ?? "", active: current?.active ?? false,
      branchIds: current?.branchIds ?? [], contents: current?.contents ?? [], price: "", preparationDays: "", packingNotes: current?.packingNotes ?? "",
      ...patch,
    },
    isNew, expectedRevision: snapshot.revision, idempotencyKey: key,
  });
}

describe("packages v2", () => {
  it("keeps publication, price, and preparation unresolved", () => {
    assert.deepEqual(packagesAccess({ role: "owner" }), { allowed: true, canEdit: true });
    assert.equal(packagesAccess({ role: "staff" }).allowed, false);
    assert.equal(PACKAGE_POLICY.publicationReady, false);
    assert.equal(PACKAGE_POLICY.fixedPrice, true);
    assert.equal(PACKAGE_POLICY.preparationOverride, false);
    const snapshot = presentPackages(defaultPackageSettings(), { variants: [], branches: [], branchVersion: 0 }, true);
    assert.deepEqual(snapshot.packages, []);
    assert.equal(snapshot.policy.publicationReady, false);
    assert.equal(snapshot.policy.fixedPrice, true);
    assert.match(snapshot.policy.reason, /Customer ordering stays off/);
    assert.deepEqual(variantBranchIds("buko", "nine", [], new Set(["cebu"])), ["cebu"]);
    assert.deepEqual(variantBranchIds("buko", "nine", [], new Set(["manila"])), []);
    assert.deepEqual(variantBranchIds("buko", "nine", [{ productId: "buko", variantId: "nine", branchIds: [] }], new Set(["cebu"])), []);
  });

  it("saves an inactive draft and refuses publication policy", () => {
    const settings = stored();
    const dependencies = deps();
    const next = planPackageSave({
      command: command(settings, dependencies, { name: "Weekend box", contents: [{ variantKey: "buko:nine", quantity: "02" }, { variantKey: "chicken:nine", quantity: "1" }], packingNotes: "Savory stays in its own box." }),
      stored: settings, deps: dependencies, access: { canEdit: true },
    });
    assert.equal(next.version, 2);
    assert.equal(next.packages[0].name, "Weekend box");
    assert.deepEqual(next.packages[0].contents, [{ productId: "buko", variantId: "nine", quantity: 2 }, { productId: "chicken", variantId: "nine", quantity: 1 }]);
    assert.deepEqual(next.packages[0].branchIds, ["cebu", "retired-pop"]);
    assert.equal(presentPackages(next, dependencies, true).packages[0].price, "");
    assert.equal(presentPackages(next, dependencies, true).packages[0].preparationDays, "");
    const created = planPackageSave({
      command: command(settings, dependencies, { id: "empty-draft", name: "Notes only", description: "", branchIds: [], contents: [], packingNotes: "" }, true),
      stored: settings, deps: dependencies, access: { canEdit: true },
    });
    assert.deepEqual(created.packages.map((item) => item.id), ["weekend", "empty-draft"]);
    const turnedOff = planPackageSave({
      command: command({ ...settings, packages: [{ ...settings.packages[0], active: true }] }, dependencies, { active: false }),
      stored: { ...settings, packages: [{ ...settings.packages[0], active: true }] }, deps: dependencies, access: { canEdit: true },
    });
    assert.equal(turnedOff.packages[0].active, false);
    assert.throws(() => planPackageSave({ command: command(settings, dependencies, { active: true }), stored: settings, deps: dependencies, access: { canEdit: true } }), (error: PackageCommandError) => /Customer ordering stays off/.test(error.message));
    const override = planPackageSave({ command: command(settings, dependencies, { priceMode: "override", price: "450.50", maxPackagesPerOrder: "2" }), stored: settings, deps: dependencies, access: { canEdit: true } });
    assert.equal(override.packages[0].priceMode, "override");
    assert.equal(override.packages[0].priceCentavos, 45050);
    assert.equal(override.packages[0].maxPackagesPerOrder, 2);
    assert.throws(() => planPackageSave({ command: command(settings, dependencies, { price: "450" }), stored: settings, deps: dependencies, access: { canEdit: true } }), (error: PackageCommandError) => /price/i.test(error.message));
    assert.throws(() => planPackageSave({ command: command(settings, dependencies, { preparationDays: "2" }), stored: settings, deps: dependencies, access: { canEdit: true } }), (error: PackageCommandError) => /preparation/i.test(error.message));
    assert.throws(() => planPackageSave({ command: command(settings, dependencies, { contents: [{ variantKey: "buko:nine", quantity: "1" }, { variantKey: "buko:nine", quantity: "2" }] }), stored: settings, deps: dependencies, access: { canEdit: true } }), (error: PackageCommandError) => /once/i.test(error.message));
    assert.throws(() => planPackageSave({ command: command(settings, dependencies, { contents: [{ variantKey: "buko:nine", quantity: "0" }] }), stored: settings, deps: dependencies, access: { canEdit: true } }), (error: PackageCommandError) => /1 to 100/.test(error.message));
    assert.throws(() => planPackageSave({ command: command(settings, dependencies, { branchIds: ["cebu", "davao"] }), stored: settings, deps: dependencies, access: { canEdit: true } }), (error: PackageCommandError) => /branch/i.test(error.message));
    assert.throws(() => planPackageSave({ command: command(settings, dependencies, { id: "missing" }), stored: settings, deps: dependencies, access: { canEdit: true } }), (error: PackageCommandError) => error.message === "Choose a saved package.");
    const moved = deps(false);
    assert.notEqual(packagesRevision(settings, dependencies, true), packagesRevision(settings, moved, true));
    assert.throws(() => planPackageSave({ command: command(settings, dependencies), stored: settings, deps: moved, access: { canEdit: true } }), (error: PackageCommandError) => error.kind === "conflict");
    assert.throws(() => packageCommandSchema.parse({ ...command(settings, dependencies), idempotencyKey: "not-a-key" }));
  });
});
