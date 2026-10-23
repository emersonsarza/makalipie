import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { site } from "../src/lib/site";
import { SETTINGS_CAPABILITIES, SettingsCommandError, planSettingsSave, presentSettings, settingsAccess, settingsCommandSchema, type SettingsCommand, type StoredStaff } from "../src/lib/admin/settings-v2";

const key = "11111111-1111-4111-8111-111111111111";
const actor = "owner-1";
const staff: StoredStaff = {
  uid: "staff-1", displayName: "Amina", active: true, branchIds: ["cebu"],
  pages: { dashboard: true, orderActions: { cancel: false } },
};

function identities(people: StoredStaff[] = [staff]) {
  return new Map(people.map((person) => [person.uid, { role: "staff" as const }]));
}
function command(snapshot: ReturnType<typeof presentSettings>, values: SettingsCommand["values"] = snapshot.values): SettingsCommand {
  return settingsCommandSchema.parse({ expectedRevision: snapshot.revision, idempotencyKey: key, values });
}

describe("settings v2", () => {
  it("shows saved fields and leaves application defaults unset", () => {
    assert.deepEqual(settingsAccess({ role: "owner" }), { allowed: true, canEdit: true });
    assert.equal(settingsAccess({ role: "staff" }).allowed, false);
    assert.equal(SETTINGS_CAPABILITIES.paymentDefault, true);
    assert.equal(SETTINGS_CAPABILITIES.customerEditDefault, true);
    assert.equal(SETTINGS_CAPABILITIES.appearance, false);
    assert.equal(SETTINGS_CAPABILITIES.staff, true);
    const empty = presentSettings({ shop: null, staff: [], branches: [], canEdit: true });
    assert.equal(empty.values.links.instagram, "");
    assert.notEqual(empty.values.links.instagram, site.instagramUrl);
    assert.equal(empty.values.holdMinutes, "");
    assert.equal(empty.values.confirmBeforeSlotMinutes, "");
    assert.equal(empty.values.requireFullPaymentDefault, null);
    assert.equal(empty.values.customerEditDefault, null);
    assert.equal(empty.values.themeId, null);
    assert.deepEqual(empty.themes, []);
    assert.deepEqual(empty.values.staff, []);
    assert.equal(empty.staffPages.find((page) => page.id === "orders")?.supported, true);
    assert.equal(empty.staffPages.find((page) => page.id === "kitchen")?.supported, false);
    const saved = presentSettings({
      shop: { links: { messenger: "" }, holdMinutes: 30, requireFullPaymentDefault: false },
      staff: [staff], branches: [{ id: "cebu", name: "Cebu" }], canEdit: true,
    });
    assert.equal(saved.values.links.messenger, "");
    assert.equal(saved.values.links.instagram, "");
    assert.equal(saved.values.holdMinutes, "30");
    assert.equal(saved.values.requireFullPaymentDefault, false);
    assert.equal(saved.values.customerEditDefault, null);
    assert.deepEqual(saved.values.staff[0].pages, ["dashboard", "orders"]);
    assert.deepEqual(saved.branches, [{ id: "cebu", name: "Cebu" }]);
  });

  it("writes changed links and future hold values without resetting stored policy", () => {
    const shop = { links: { instagram: "https://example.com/ig" }, holdMinutes: 30, requireFullPaymentDefault: false };
    const snapshot = presentSettings({ shop, staff: [], branches: [], canEdit: true });
    const saved = planSettingsSave({
      command: command(snapshot, { ...snapshot.values, links: { ...snapshot.values.links, messenger: "https://m.me/makalipie" }, holdMinutes: "45" }),
      shop, staff: [], branches: [], identities: identities([]), actorUid: actor, access: { canEdit: true },
    });
    assert.deepEqual(saved.shopWrites.links, { instagram: "https://example.com/ig", messenger: "https://m.me/makalipie" });
    assert.equal(saved.shopWrites.holdMinutes, 45);
    assert.equal("requireFullPaymentDefault" in saved.shopWrites, false);
    assert.equal(saved.reauth, false);
    assert.equal("orders" in saved, false);
    const payment = planSettingsSave({
      command: command(snapshot, { ...snapshot.values, requireFullPaymentDefault: true, customerEditDefault: false }),
      shop, staff: [], branches: [], identities: identities([]), actorUid: actor, access: { canEdit: true },
    });
    assert.equal(payment.shopWrites.requireFullPaymentDefault, true);
    assert.equal(payment.shopWrites.customerEditDefault, false);
    assert.throws(() => planSettingsSave({
      command: command(snapshot, { ...snapshot.values, customerEditDefault: true }),
      shop, staff: [], branches: [], identities: identities([]), actorUid: actor, access: { canEdit: true },
    }), (error: SettingsCommandError) => error.message === "Customer editing stays off for new orders.");
    assert.throws(() => planSettingsSave({
      command: command(snapshot, { ...snapshot.values, themeId: "warm" }),
      shop, staff: [], branches: [], identities: identities([]), actorUid: actor, access: { canEdit: true },
    }), (error: SettingsCommandError) => error.message === "Appearance settings are not available yet.");
    assert.throws(() => settingsCommandSchema.parse({ ...command(snapshot), values: { ...snapshot.values, links: { ...snapshot.values.links, grabFood: "http://example.com" } } }));
  });

  it("updates an existing staff profile and preserves grants this screen cannot switch", () => {
    const shop = null;
    const branches = [{ id: "cebu", name: "Cebu" }];
    const snapshot = presentSettings({ shop, staff: [{ ...staff, branchIds: ["cebu", "legacy"] }], branches, canEdit: true });
    assert.deepEqual(snapshot.branches.map((branch) => branch.id), ["cebu", "legacy"]);
    const renamed = planSettingsSave({
      command: command(snapshot, { ...snapshot.values, staff: [{ ...snapshot.values.staff[0], name: "Amina Cruz", pages: ["orders"] }] }),
      shop, staff: [{ ...staff, branchIds: ["cebu", "legacy"] }], branches, identities: identities([{ ...staff, branchIds: ["cebu", "legacy"] }]), actorUid: actor, access: { canEdit: true },
    });
    assert.equal(renamed.reauth, true);
    assert.equal(renamed.staffWrites[0].displayName, "Amina Cruz");
    assert.equal(renamed.staffWrites[0].pages.dashboard, true);
    assert.deepEqual(renamed.staffWrites[0].pages.orderActions, { cancel: false });
    assert.equal(renamed.staffWrites[0].pages.orders, true);
    const kept = planSettingsSave({
      command: command(snapshot),
      shop, staff: [{ ...staff, branchIds: ["cebu", "legacy"] }], branches, identities: identities([{ ...staff, branchIds: ["cebu", "legacy"] }]), actorUid: actor, access: { canEdit: true },
    });
    assert.deepEqual(kept.staffWrites, []);
    assert.equal(kept.reauth, false);
    const base = { shop, staff: [staff], branches, identities: identities(), actorUid: actor, access: { canEdit: true } };
    const view = presentSettings({ shop, staff: [staff], branches, canEdit: true });
    assert.throws(() => planSettingsSave({ ...base, command: command(view, { ...view.values, staff: [] }) }), (error: SettingsCommandError) => error.message.includes("cannot be removed"));
    assert.throws(() => planSettingsSave({ ...base, command: command(view, { ...view.values, staff: [{ ...view.values.staff[0], pages: ["orders", "kitchen"] }] }) }), (error: SettingsCommandError) => error.message.includes("Kitchen"));
    assert.throws(() => planSettingsSave({ ...base, command: command(view, { ...view.values, staff: [{ ...view.values.staff[0], pages: ["orders", "settings"] }] }) }), (error: SettingsCommandError) => error.message.includes("owner-only"));
    assert.throws(() => planSettingsSave({ ...base, identities: new Map([[staff.uid, { role: "owner" }]]), command: command(view) }), (error: SettingsCommandError) => error.message.includes("Owner access"));
    assert.throws(() => planSettingsSave({ ...base, command: command(view, { ...view.values, staff: [{ ...view.values.staff[0], active: true, branchIds: [] }] }) }), (error: SettingsCommandError) => error.message.includes("assign at least one branch"));
    const idle = presentSettings({ shop, staff: [{ ...staff, active: false, branchIds: [] }], branches, canEdit: true });
    const untouched = planSettingsSave({
      command: command(idle), shop, staff: [{ ...staff, active: false, branchIds: [] }], branches,
      identities: identities([{ ...staff, active: false, branchIds: [] }]), actorUid: actor, access: { canEdit: true },
    });
    assert.deepEqual(untouched.staffWrites, []);
  });

  it("conflicts when staff access changed and refuses a staff editor", () => {
    const snapshot = presentSettings({ shop: null, staff: [staff], branches: [], canEdit: true });
    assert.throws(() => planSettingsSave({
      command: command(snapshot), shop: null, staff: [{ ...staff, active: false }], branches: [], identities: identities(), actorUid: actor, access: { canEdit: true },
    }), (error: SettingsCommandError) => error.kind === "conflict");
    assert.throws(() => planSettingsSave({
      command: command(snapshot), shop: null, staff: [staff], branches: [], identities: identities(), actorUid: actor, access: { canEdit: false },
    }), (error: SettingsCommandError) => error.kind === "permission");
  });
});
