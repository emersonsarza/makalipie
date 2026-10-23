import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PopupCommandError, popupCommandSchema, planPopupSave, popupsAccess, presentPopups } from "../src/lib/admin/popups-v2";
import { defaultPopupSettings, type PopupListing, type PopupSettings } from "../src/lib/popups/schema";

const key = "11111111-1111-4111-8111-111111111111";

function listing(overrides: Partial<PopupListing> = {}): PopupListing {
  return {
    id: "sunday-market", name: "Sunday Market", address: "Ayala Center Cebu", mapUrl: "https://maps.example.test/sunday",
    startDate: "2026-10-04", endDate: "2026-10-04", hours: "10:00 AM – 4:00 PM", items: ["Keylime", "Buko"], ...overrides,
  };
}
function stored(): PopupSettings {
  return { version: 2, listings: [listing(), listing({ id: "ended", name: "Night market", startDate: "2026-09-01", endDate: "2026-09-02", items: ["Buko"] })] };
}
function command(settings: PopupSettings, patch: Partial<PopupListing> = {}, isNew = false, visible: boolean | null = null) {
  const snapshot = presentPopups(settings, ["cebu", "mandaue"], true);
  return popupCommandSchema.parse({
    listing: { ...listing(patch), visible },
    isNew,
    expectedRevision: snapshot.revision,
    idempotencyKey: key,
  });
}

describe("popups v2", () => {
  it("keeps pop-ups owner-only and date-published", () => {
    assert.deepEqual(popupsAccess({ role: "owner" }), { allowed: true, canEdit: true });
    assert.equal(popupsAccess({ role: "staff" }).allowed, false);
    const empty = presentPopups(defaultPopupSettings(), [], true);
    assert.equal(empty.manualVisibility, false);
    assert.deepEqual(empty.listings, []);
    assert.equal(empty.canEdit, true);
    const snapshot = presentPopups(stored(), ["mandaue", "cebu", "cebu"], true);
    assert.deepEqual(snapshot.reservedIds, ["cebu", "mandaue"]);
    assert.equal(snapshot.listings.length, 2);
    assert.equal(snapshot.listings[1].id, "ended");
    assert.equal(snapshot.listings[0].visible, null);
  });

  it("saves one listing and leaves the others in place", () => {
    const settings = stored();
    const next = planPopupSave({ command: command(settings, { name: "Sunday market stall", items: [" Keylime ", "Buko"] }), stored: settings, reservedIds: ["cebu", "mandaue"], access: { canEdit: true } });
    assert.equal(next.version, 2);
    assert.equal(next.listings[0].name, "Sunday market stall");
    assert.deepEqual(next.listings[0].items, ["Keylime", "Buko"]);
    assert.equal(next.listings[1].id, "ended");
    const created = planPopupSave({
      command: command(settings, { id: "harbor-day", name: "Harbor day", startDate: "2026-11-01", endDate: "2026-11-02" }, true),
      stored: settings, reservedIds: ["cebu"], access: { canEdit: true },
    });
    assert.deepEqual(created.listings.map((item) => item.id), ["sunday-market", "ended", "harbor-day"]);
    assert.throws(() => planPopupSave({ command: command(settings, { visible: true } as Partial<PopupListing>, false, true), stored: settings, reservedIds: [], access: { canEdit: true } }), (error: PopupCommandError) => error.message === "Manual visibility is not stored yet.");
    assert.throws(() => planPopupSave({ command: command(settings, { id: "cebu" }), stored: settings, reservedIds: ["cebu"], access: { canEdit: true } }), (error: PopupCommandError) => /branch|separate/i.test(error.message));
    assert.throws(() => planPopupSave({ command: command(settings, { id: "mandaue" }), stored: settings, reservedIds: ["mandaue"], access: { canEdit: true } }), (error: PopupCommandError) => error.message === "A pop-up cannot use a branch ID.");
    assert.throws(() => planPopupSave({ command: command(settings, { endDate: "2026-10-03" }), stored: settings, reservedIds: [], access: { canEdit: true } }), (error: PopupCommandError) => /last date/i.test(error.message));
    assert.throws(() => planPopupSave({ command: command(settings, { items: ["Buko", "buko"] }), stored: settings, reservedIds: [], access: { canEdit: true } }), (error: PopupCommandError) => /repeat/i.test(error.message));
    assert.throws(() => planPopupSave({ command: command(settings, { id: "fresh" }, false), stored: settings, reservedIds: [], access: { canEdit: true } }), (error: PopupCommandError) => error.message === "Choose a saved listing.");
    assert.throws(() => planPopupSave({ command: command(settings, {}, true), stored: settings, reservedIds: [], access: { canEdit: true } }), (error: PopupCommandError) => error.message === "This listing ID is already used.");
    const full = { version: 1, listings: Array.from({ length: 40 }, (_, index) => listing({ id: `stop-${index}`, name: `Stop ${index}` })) };
    assert.throws(() => planPopupSave({ command: command(full, { id: "one-more", name: "One more" }, true), stored: full, reservedIds: [], access: { canEdit: true } }), (error: PopupCommandError) => /40/.test(error.message));
    const updated = planPopupSave({ command: command(full, { id: "stop-0", name: "First stop" }), stored: full, reservedIds: [], access: { canEdit: true } });
    assert.equal(updated.listings.length, 40);
    assert.equal(updated.listings[0].name, "First stop");
    assert.throws(() => planPopupSave({ command: command(defaultPopupSettings(), { name: "Changed" }), stored: settings, reservedIds: [], access: { canEdit: true } }), (error: PopupCommandError) => error.kind === "conflict");
    assert.throws(() => popupCommandSchema.parse({ ...command(settings), idempotencyKey: "not-a-key" }));
  });
});
