import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BRANCH_CAPABILITIES, BranchCommandError, BranchQueryError, branchCommandSchema, branchesAccess, planBranchSave, presentBranches } from "../src/lib/admin/branches-v2";
import { defaultBranchSettings, type BranchSettings } from "../src/lib/branches/schema";

const owner = { role: "owner" };
const key = "11111111-1111-4111-8111-111111111111";

function stored(): BranchSettings {
  const settings = defaultBranchSettings();
  settings.version = 3;
  settings.branches[0].address = "123 Colon";
  settings.branches[0].hoursLabel = "Nine to six";
  settings.assignments = [{ productId: "buko", variantId: "nine", branchIds: ["cebu"], mode: "regular" }];
  return settings;
}
function draft(settings: BranchSettings, id: string) {
  const item = presentBranches(settings, true).branches.find((branch) => branch.id === id)!;
  const { visibilityLocked, lockReason, ...branch } = item;
  void visibilityLocked; void lockReason;
  return branch;
}

describe("branches v2", () => {
  it("is owner-only and does not invent offering or limit policies", () => {
    assert.deepEqual(branchesAccess(owner), { allowed: true, canEdit: true });
    assert.equal(branchesAccess({ role: "staff" }).allowed, false);
    assert.deepEqual(BRANCH_CAPABILITIES, { offerings: false, customerLimits: true, dailyLimits: false, boxLimits: false });
    const settings = stored();
    settings.branches[1].customerLimit = { quantity: null, unit: "boxes", per: "day" };
    const snapshot = presentBranches(settings, true);
    const cebu = snapshot.branches[0];
    const manila = snapshot.branches[1];
    assert.equal(cebu.address, "123 Colon");
    assert.equal(cebu.hoursLabel, "Nine to six");
    assert.equal(cebu.showSingleItems, null);
    assert.equal(cebu.showPackages, null);
    assert.equal(cebu.visibilityLocked, true);
    assert.equal(cebu.lockReason, "Cebu stays available on the site.");
    assert.equal(manila.visibilityLocked, false);
    assert.equal(manila.limitQuantity, "");
    assert.equal(manila.limitUnit, "boxes");
    assert.equal(manila.limitPeriod, "day");
    assert.equal(snapshot.defaultBranchId, "cebu");
    assert.throws(() => planBranchSave({ command: command(settings, draft(settings, "cebu")), stored: null, access: { canEdit: true } }), BranchQueryError);
  });

  it("saves one branch and leaves assignments, the other branch, and unsupported limits in place", () => {
    const settings = stored();
    settings.branches[1].customerLimit = { quantity: 2, unit: "boxes", per: "day" };
    settings.branches[1].areas = ["Lahug"];
    const snapshot = presentBranches(settings, true);
    const manila = draft(settings, "manila");
    const saved = planBranchSave({
      command: command(settings, { ...manila, name: "Makalipie Manila", deliveryEnabled: false }),
      stored: settings,
      access: { canEdit: true },
    });
    assert.equal(saved.branches[1].name, "Makalipie Manila");
    assert.equal(saved.branches[1].deliveryEnabled, false);
    assert.deepEqual(saved.branches[1].areas, ["Lahug"]);
    assert.deepEqual(saved.branches[1].customerLimit, { quantity: 2, unit: "boxes", per: "day" });
    assert.equal(saved.branches[0].address, "123 Colon");
    assert.deepEqual(saved.assignments, settings.assignments);
    assert.equal(saved.defaultBranch, "cebu");
    assert.equal("schedule" in saved, false);
  });

  it("adds a branch without granting products or replacing the default", () => {
    const settings = stored();
    const saved = planBranchSave({
      command: command(settings, { ...draft(settings, "cebu"), id: "mandaue", name: "Mandaue", visible: true, address: "", hoursLabel: "", areas: [] }, true),
      stored: settings,
      access: { canEdit: true },
    });
    assert.deepEqual(saved.branches.map((branch) => branch.id), ["cebu", "manila", "mandaue"]);
    assert.equal(saved.defaultBranch, "cebu");
    assert.deepEqual(saved.assignments[0].branchIds, ["cebu"]);
    assert.equal(saved.branches[2].address, "");
    assert.equal(saved.branches[2].customerLimit, null);
    const started = planBranchSave({
      command: { ...command(settings, { ...draft(settings, "manila"), visible: true }), makeDefault: true },
      stored: settings,
      access: { canEdit: true },
    });
    assert.equal(started.defaultBranch, "manila");
    assert.equal(started.branches[0].visible, true);
  });

  it("rejects locked visibility, unsupported policies, and stale revisions", () => {
    const settings = stored();
    const snapshot = presentBranches(settings, true);
    assert.throws(() => planBranchSave({
      command: command(settings, { ...draft(settings, "cebu"), visible: false }),
      stored: settings, access: { canEdit: true },
    }), (error: BranchCommandError) => error.message === "Cebu stays available on the site.");
    assert.throws(() => planBranchSave({
      command: command(settings, { ...draft(settings, "cebu"), limitEnabled: true, limitQuantity: "", limitUnit: "pies", limitPeriod: "order" }),
      stored: settings, access: { canEdit: true },
    }), (error: BranchCommandError) => error.message === "Enter a positive whole-number limit.");
    assert.throws(() => planBranchSave({
      command: command(settings, { ...draft(settings, "cebu"), limitEnabled: true, limitQuantity: "4", limitUnit: "boxes", limitPeriod: "order" }),
      stored: settings, access: { canEdit: true },
    }), (error: BranchCommandError) => error.message === "Box limits are not available yet.");
    assert.throws(() => planBranchSave({
      command: command(settings, { ...draft(settings, "cebu"), limitEnabled: true, limitQuantity: "4", limitUnit: "pies", limitPeriod: "day" }),
      stored: settings, access: { canEdit: true },
    }), (error: BranchCommandError) => error.message === "Daily limits are not available yet.");
    assert.throws(() => planBranchSave({
      command: command(settings, { ...draft(settings, "cebu"), showPackages: false }),
      stored: settings, access: { canEdit: true },
    }), (error: BranchCommandError) => error.message === "Offering controls are not stored yet.");
    assert.throws(() => planBranchSave({
      command: command(settings, draft(settings, "cebu")),
      stored: { ...settings, version: settings.version + 1 }, access: { canEdit: true },
    }), (error: BranchCommandError) => error.kind === "conflict");
    assert.throws(() => planBranchSave({
      command: command(settings, draft(settings, "cebu")),
      stored: settings, access: { canEdit: false },
    }), (error: BranchCommandError) => error.kind === "permission");
    assert.throws(() => branchCommandSchema.parse({ ...command(settings, draft(settings, "cebu")), branch: { ...draft(settings, "cebu"), mapUrl: "http://maps.example.com" } }));
    assert.throws(() => branchCommandSchema.parse({ ...command(settings, { ...draft(settings, "cebu"), areas: ["Lahug", "lahug"] }) }));
    assert.equal(snapshot.revision, presentBranches(settings, false).revision);
    const limited = planBranchSave({
      command: command(settings, { ...draft(settings, "manila"), limitEnabled: true, limitQuantity: "6", limitUnit: "pies", limitPeriod: "order" }),
      stored: settings, access: { canEdit: true },
    });
    assert.deepEqual(limited.branches[1].customerLimit, { quantity: 6, unit: "pies", per: "order" });
  });
});

function command(settings: BranchSettings, branch: ReturnType<typeof draft>, isNew = false) {
  return branchCommandSchema.parse({
    branch, isNew, makeDefault: false, expectedRevision: presentBranches(settings, true).revision, idempotencyKey: key,
  });
}
