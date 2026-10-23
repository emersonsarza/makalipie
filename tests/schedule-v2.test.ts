import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultBranchSettings } from "../src/lib/branches/schema";
import { AdminAccessError } from "../src/lib/admin/access";
import {
  mergeScheduleSave, planScheduleSave, presentSchedule, resolveScheduleBranch, savedBranchSchedule, scheduleAccess, scheduleCommandSchema, windowSlots,
  ScheduleCommandError, ScheduleQueryError,
} from "../src/lib/admin/schedule-v2";
import { defaultScheduleSettings, type BranchSchedule } from "../src/lib/scheduling/schema";

const owner = { role: "owner" as const, branchIds: ["cebu", "manila"], pages: {} };
const editor = { role: "staff" as const, branchIds: ["cebu"], pages: { schedule: true, scheduleActions: { edit: true } } };
const viewer = { role: "staff" as const, branchIds: ["cebu"], pages: { schedule: true } };
const key = "11111111-1111-4111-8111-111111111111";

function settings() {
  const value = defaultBranchSettings();
  value.branches[0].hoursLabel = "Nine to six";
  return value;
}
function stored() {
  const value = defaultScheduleSettings();
  value.version = 4;
  value.branches.cebu = { enabled: true, startTime: "09:00", cutoffTime: "18:00", openWeekdays: [1, 2, 3, 4, 5], closedDates: ["2026-12-25"] };
  return value;
}
function schedule(patch: Partial<BranchSchedule> = {}): BranchSchedule {
  return { enabled: true, startTime: "09:00", cutoffTime: "18:00", openWeekdays: [1, 2, 3, 4, 5], closedDates: ["2026-12-25"], ...patch };
}

describe("schedule v2", () => {
  it("keeps schedule access explicit for staff", () => {
    assert.deepEqual(scheduleAccess(owner), { allowed: true, canEdit: true, canEditBookingWindow: true });
    assert.deepEqual(scheduleAccess(editor), { allowed: true, canEdit: true, canEditBookingWindow: false });
    assert.deepEqual(scheduleAccess(viewer), { allowed: true, canEdit: false, canEditBookingWindow: false });
    assert.equal(scheduleAccess({ role: "staff", branchIds: [], pages: {} }).allowed, false);
    assert.equal(resolveScheduleBranch("cebu", editor, settings()), "cebu");
    assert.throws(() => resolveScheduleBranch("all", owner, settings()), (error: ScheduleQueryError) => error.message === "Choose one branch.");
    assert.throws(() => resolveScheduleBranch("manila", editor, settings()), AdminAccessError);
    assert.throws(() => resolveScheduleBranch("cebu", { role: "staff", branchIds: ["cebu"], pages: {} }, settings()), AdminAccessError);
  });

  it("reads a saved branch without substituting default hours", () => {
    assert.throws(() => savedBranchSchedule(null, "cebu"), (error: ScheduleQueryError) => error.status === 404);
    assert.throws(() => savedBranchSchedule(stored(), "davao"), ScheduleQueryError);
    const snapshot = presentSchedule({ branchId: "cebu", stored: stored(), settings: settings(), updatedAt: "2026-10-23T01:00:00.000Z", pause: null, access: scheduleAccess(editor) });
    assert.equal(snapshot.values.startTime, "09:00");
    assert.equal(snapshot.values.cutoffTime, "18:00");
    assert.equal(snapshot.values.bookingHorizonDays, "30");
    assert.deepEqual(snapshot.values.closedDates, ["2026-12-25"]);
    assert.equal(snapshot.hoursLabel, "Nine to six");
    assert.equal(snapshot.canEdit, true);
    assert.equal(snapshot.canEditBookingWindow, false);
    assert.equal(snapshot.updatedAt, "2026-10-23T01:00:00.000Z");
    const blank = settings();
    blank.branches[0].hoursLabel = "  ";
    assert.equal(presentSchedule({ branchId: "cebu", stored: stored(), settings: blank, updatedAt: "", pause: null, access: scheduleAccess(owner) }).hoursLabel, null);
  });

  it("keeps the cutoff as the end of the last complete slot", () => {
    const slots = windowSlots(schedule({ startTime: "17:00", cutoffTime: "19:00" }), "2026-10-23").map((slot) => slot.id);
    assert.deepEqual(slots, ["17:00", "18:00"]);
  });

  it("saves one branch and leaves the shop window alone without that permission", () => {
    const current = stored();
    const snapshot = presentSchedule({ branchId: "cebu", stored: current, settings: settings(), updatedAt: "", pause: { paused: false, version: 2 }, access: scheduleAccess(editor) });
    const saved = planScheduleSave({
      command: { branchId: "cebu", expectedRevision: snapshot.revision, schedule: schedule({ enabled: false, closedDates: [] }), idempotencyKey: key },
      stored: current, settings: settings(), pause: { paused: false, version: 2 }, access: scheduleAccess(editor),
    });
    assert.equal(saved.branches.cebu.enabled, false);
    assert.deepEqual(saved.branches.cebu.closedDates, []);
    assert.equal(saved.branches.manila.startTime, "10:00");
    assert.equal(saved.bookingHorizonDays, 30);
    assert.throws(() => planScheduleSave({
      command: { branchId: "cebu", expectedRevision: snapshot.revision, schedule: schedule(), bookingHorizonDays: 14, idempotencyKey: key },
      stored: current, settings: settings(), pause: { paused: false, version: 2 }, access: scheduleAccess(editor),
    }), (error: ScheduleCommandError) => error.kind === "permission");
    const ownerView = presentSchedule({ branchId: "cebu", stored: current, settings: settings(), updatedAt: "", pause: { paused: false, version: 2 }, access: scheduleAccess(owner) });
    const widened = planScheduleSave({
      command: { branchId: "cebu", expectedRevision: ownerView.revision, schedule: schedule(), bookingHorizonDays: 14, idempotencyKey: key },
      stored: current, settings: settings(), pause: { paused: false, version: 2 }, access: scheduleAccess(owner),
    });
    assert.equal(widened.bookingHorizonDays, 14);
    assert.equal(widened.branches.manila.cutoffTime, "19:00");
  });

  it("conflicts when the schedule, branch settings, or today pause moved", () => {
    const current = stored();
    const seen = presentSchedule({ branchId: "cebu", stored: current, settings: settings(), updatedAt: "", pause: null, access: scheduleAccess(owner) });
    const paused = presentSchedule({ branchId: "cebu", stored: current, settings: settings(), updatedAt: "", pause: { paused: true, version: 1 }, access: scheduleAccess(owner) });
    assert.notEqual(seen.revision, paused.revision);
    assert.throws(() => planScheduleSave({
      command: { branchId: "cebu", expectedRevision: seen.revision, schedule: schedule(), idempotencyKey: key },
      stored: current, settings: settings(), pause: { paused: true, version: 1 }, access: scheduleAccess(owner),
    }), (error: ScheduleCommandError) => error.kind === "conflict");
    assert.throws(() => planScheduleSave({
      command: { branchId: "cebu", expectedRevision: seen.revision, schedule: schedule(), idempotencyKey: key },
      stored: current, settings: settings(), pause: null, access: scheduleAccess(viewer),
    }), (error: ScheduleCommandError) => error.kind === "permission");
    assert.throws(() => schedule({ cutoffTime: "09:30" }) && planScheduleSave({
      command: { branchId: "cebu", expectedRevision: seen.revision, schedule: schedule({ cutoffTime: "09:30" }), idempotencyKey: key },
      stored: current, settings: settings(), pause: null, access: scheduleAccess(owner),
    }));
    assert.throws(() => scheduleCommandSchema.parse({ branchId: "cebu", expectedRevision: seen.revision, schedule: schedule({ closedDates: ["2026-12-25", "2026-12-25"] }), idempotencyKey: key }));
    assert.throws(() => scheduleCommandSchema.parse({ branchId: "cebu", expectedRevision: seen.revision, schedule: schedule(), idempotencyKey: "nope" }));
    assert.equal(mergeScheduleSave(current, "cebu", schedule({ openWeekdays: [] }), 30).branches.manila.enabled, false);
  });
});
