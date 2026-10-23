import assert from "node:assert/strict";
import test from "node:test";
import { AdminAccessError } from "../src/lib/admin/access";
import {
  ALLOCATION_CACHE_CONTROL,
  ALLOCATION_MAX_QUANTITY,
  AllocationQueryError,
  allocationCommandSchema,
  allocationPermissions,
  assessAllocationSave,
  buildAllocationSnapshot,
  resolveAllocationScope,
  type AllocationEntry,
  type AllocationFlavor,
} from "../src/lib/admin/allocation-v2";
import { capacityOpen } from "../src/lib/orders/allocation";
import type { BranchSchedule } from "../src/lib/scheduling/schema";

const now = new Date("2026-10-23T03:30:00.000Z");
const today = "2026-10-23";
const owner = { role: "owner" as const, branchIds: [] as string[], pages: { allocation: true } };
const schedule: BranchSchedule = { enabled: true, startTime: "10:00", cutoffTime: "19:00", openWeekdays: [0, 1, 2, 3, 4, 5, 6], closedDates: ["2026-10-25"] };
const key = "11111111-1111-4111-8111-111111111111";

function flavor(overrides: Partial<AllocationFlavor> = {}): AllocationFlavor {
  return {
    id: "buko",
    name: "Buko",
    active: true,
    availableWeekdays: [],
    unavailableDates: [],
    variants: [{ id: "six-inch", label: "6 inch", active: true, minLeadDays: 0, assigned: true }],
    ...overrides,
  };
}

function entry(overrides: Partial<AllocationEntry> = {}): AllocationEntry {
  return { exists: true, readable: true, limit: 4, held: 1, version: 2, updatedAt: "2026-10-23T01:00:00.000Z", updatedBy: "owner", ...overrides };
}

function snapshot(overrides: Partial<Parameters<typeof buildAllocationSnapshot>[0]> = {}) {
  return buildAllocationSnapshot({
    now,
    branchId: "cebu",
    date: today,
    permissions: allocationPermissions(owner),
    schedule,
    horizonDays: 30,
    paused: false,
    dayVersion: 3,
    flavors: [flavor()],
    entries: new Map(),
    ...overrides,
  });
}

function command(overrides: Record<string, unknown> = {}) {
  return allocationCommandSchema.parse({
    branchId: "cebu",
    date: today,
    expectedDayVersion: 3,
    changes: [],
    acknowledgeBelowHeld: false,
    idempotencyKey: key,
    ...overrides,
  });
}

test("allocation access is a page grant, and action flags are explicit for staff", () => {
  assert.equal(ALLOCATION_CACHE_CONTROL, "private, no-store");
  assert.equal(ALLOCATION_MAX_QUANTITY, 500);
  assert.throws(() => resolveAllocationScope({ admin: { role: "staff", branchIds: ["cebu"], pages: {} }, branch: "cebu", date: today, now, knownBranchIds: ["cebu"] }), AdminAccessError);
  assert.throws(() => resolveAllocationScope({ admin: owner, branch: "all", date: today, now, knownBranchIds: ["cebu"] }), AllocationQueryError);
  assert.throws(() => resolveAllocationScope({ admin: { role: "staff", branchIds: ["cebu"], pages: { allocation: true } }, branch: "manila", date: today, now, knownBranchIds: ["cebu", "manila"] }), AdminAccessError);
  assert.deepEqual(allocationPermissions({ role: "staff", pages: { allocation: true } }), { edit: false, pause: false, unlimited: false, lowerBelowHeld: false });
  assert.equal(allocationPermissions({ role: "staff", pages: { allocation: true, allocationActions: { edit: true } } }).edit, true);
  assert.equal(allocationPermissions({ role: "owner", pages: { allocationActions: { edit: false } } }).edit, true);
  assert.equal(capacityOpen(undefined, today, today), true);
  assert.equal(capacityOpen({ limit: null, held: 2 }, today, today), true);
});

test("missing rows stay unconfigured, saved null is unlimited, and unknown holds are not zero", () => {
  const body = snapshot({
    flavors: [flavor(), flavor({ id: "ube", name: "Ube" }), flavor({ id: "pecan", name: "Pecan" })],
    entries: new Map([
      ["ube", entry({ limit: null, held: 2, version: 1 })],
      ["pecan", entry({ readable: false, limit: null, held: null, version: 0 })],
    ]),
  });
  const byId = Object.fromEntries(body.rows.map((row) => [row.productId, row]));
  assert.deepEqual(body.rows.map((row) => row.productId), ["buko", "pecan", "ube"]);
  assert.deepEqual(byId.buko.limit, { mode: "unconfigured", quantity: null });
  assert.equal(byId.buko.held, 0);
  assert.equal(byId.buko.editable, true);
  assert.deepEqual(byId.ube.limit, { mode: "unlimited", quantity: null });
  assert.equal(byId.ube.held, 2);
  assert.equal(byId.pecan.held, null);
  assert.equal(byId.pecan.editable, false);
  assert.equal(body.rows.length, 3);
  assert.equal(body.maximumQuantity, 500);
  const empty = snapshot({ flavors: [], entries: new Map() });
  assert.deepEqual(empty.rows, []);
});

test("ineligible flavors stay visible and editable without becoming orderable", () => {
  const lead = snapshot({
    date: "2026-10-24",
    flavors: [flavor({ variants: [{ id: "six-inch", label: "6 inch", active: true, minLeadDays: 2, assigned: true }] })],
  });
  assert.equal(lead.rows[0].eligibility, "lead-time");
  assert.match(lead.rows[0].eligibilityNote ?? "", /preparation/);
  assert.equal(lead.rows[0].editable, true);
  const sundayOnly = snapshot({
    flavors: [flavor({ availableWeekdays: [0] })],
  });
  assert.equal(sundayOnly.rows[0].eligibility, "not-sold");
  const inactive = snapshot({ flavors: [flavor({ active: false })] });
  assert.equal(inactive.rows[0].eligibility, "inactive");
  assert.equal(inactive.rows[0].editable, true);
  const past = snapshot({ date: "2026-10-20" });
  assert.equal(past.rows[0].editable, false);
  assert.equal(past.permissions.edit, true);
  assert.equal(past.intake, "closed");
});

test("intake keeps pause on today and does not treat a closed date as online", () => {
  assert.equal(snapshot().intake, "online");
  assert.equal(snapshot({ paused: true }).intake, "paused");
  assert.equal(snapshot({ schedule: { ...schedule, enabled: false } }).intake, "unconfigured");
  assert.equal(snapshot({ date: "2026-10-25" }).intake, "closed");
  assert.equal(snapshot({ date: "2026-10-24" }).intake, "online");
  const view = snapshot({ permissions: allocationPermissions({ role: "staff", pages: { allocation: true } }) });
  assert.equal(view.permissions.edit, false);
  assert.equal(view.rows[0].editable, false);
});

test("saves are atomic decisions: versions, reservations, permissions, and pause", () => {
  const entries = new Map([["buko", entry()]]);
  const base = { now, permissions: allocationPermissions(owner), scheduleEnabled: true, dayVersion: 3, paused: false, entries, knownProductIds: new Set(["buko"]) };
  const saved = assessAllocationSave({
    ...base,
    command: command({ changes: [{ productId: "buko", expectedVersion: 2, expectedHeld: 1, limit: { mode: "limited", quantity: 6 } }] }),
  });
  assert.equal(saved.ok, true);
  if (saved.ok) assert.deepEqual(saved.writes, [{ kind: "limit", productId: "buko", limit: 6, held: 1, version: 3 }]);
  const stale = assessAllocationSave({
    ...base,
    command: command({ changes: [{ productId: "buko", expectedVersion: 2, expectedHeld: 0, limit: { mode: "limited", quantity: 6 } }] }),
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.error.kind, "conflict");
  const below = assessAllocationSave({
    ...base,
    command: command({ changes: [{ productId: "buko", expectedVersion: 2, expectedHeld: 1, limit: { mode: "limited", quantity: 0 } }] }),
  });
  assert.equal(below.ok, false);
  if (!below.ok) assert.equal(below.error.fields?.buko?.includes("existing orders"), true);
  const acknowledged = assessAllocationSave({
    ...base,
    permissions: allocationPermissions({ role: "staff", pages: { allocation: true, allocationActions: { edit: true, lowerBelowHeld: true } } }),
    command: command({ acknowledgeBelowHeld: true, changes: [{ productId: "buko", expectedVersion: 2, expectedHeld: 1, limit: { mode: "limited", quantity: 0 } }] }),
  });
  assert.equal(acknowledged.ok, true);
  const cleared = assessAllocationSave({
    ...base,
    entries: new Map([["buko", entry({ held: 0 })]]),
    command: command({ changes: [{ productId: "buko", expectedVersion: 2, expectedHeld: 0, limit: { mode: "unconfigured", quantity: null } }] }),
  });
  assert.equal(cleared.ok, true);
  if (cleared.ok) assert.equal(cleared.writes[0].kind, "delete");
  const heldClear = assessAllocationSave({
    ...base,
    command: command({ changes: [{ productId: "buko", expectedVersion: 2, expectedHeld: 1, limit: { mode: "unconfigured", quantity: null } }] }),
  });
  assert.equal(heldClear.ok, false);
  const unlimited = assessAllocationSave({
    ...base,
    permissions: allocationPermissions({ role: "staff", pages: { allocation: true, allocationActions: { edit: true } } }),
    command: command({ changes: [{ productId: "buko", expectedVersion: 2, expectedHeld: 1, limit: { mode: "unlimited", quantity: null } }] }),
  });
  assert.equal(unlimited.ok, false);
  if (!unlimited.ok) assert.equal(unlimited.error.kind, "permission");
  const pause = assessAllocationSave({ ...base, command: command({ paused: true }) });
  assert.equal(pause.ok, true);
  if (pause.ok) assert.deepEqual(pause.writes, [{ kind: "pause", paused: true, version: 4 }]);
  const futurePause = assessAllocationSave({ ...base, command: command({ date: "2026-10-24", paused: true }) });
  assert.equal(futurePause.ok, false);
  if (!futurePause.ok) assert.match(futurePause.error.message, /today/);
  const past = assessAllocationSave({ ...base, command: command({ date: "2026-10-20", changes: [{ productId: "buko", expectedVersion: 0, expectedHeld: 0, limit: { mode: "limited", quantity: 1 } }] }) });
  assert.equal(past.ok, false);
  if (!past.ok) assert.equal(past.error.status, 400);
  assert.throws(() => allocationCommandSchema.parse({ ...command(), idempotencyKey: "not-a-key" }));
});
