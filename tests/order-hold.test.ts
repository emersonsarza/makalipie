import assert from "node:assert/strict";
import test from "node:test";
import { orderHold } from "../src/lib/orders/hold";
import { defaultBranchSchedule } from "../src/lib/scheduling/schema";
import { defaultShopSettings } from "../src/lib/settings/schema";

const schedule = { ...defaultBranchSchedule(), enabled: true, startTime: "10:00", cutoffTime: "19:00" };
const settings = { ...defaultShopSettings, holdMinutes: 30, confirmBeforeSlotMinutes: 60 };

test("an overnight first morning slot waits until staff arrive", () => {
  const now = new Date("2026-10-22T16:00:00.000Z");
  const first = orderHold(now, schedule, "2026-10-23", "10:00", settings);
  assert.equal(first.submittedAfterHours, true);
  assert.equal(first.openingAt, "2026-10-23T02:00:00.000Z");
  assert.equal(first.deadline.toISOString(), "2026-10-23T02:30:00.000Z");
  const later = orderHold(now, schedule, "2026-10-23", "11:00", settings);
  assert.equal(later.deadline.toISOString(), "2026-10-23T02:00:00.000Z");
});

test("an in-hours hold still uses the slot confirmation cap", () => {
  const now = new Date("2026-10-23T02:15:00.000Z");
  const held = orderHold(now, schedule, "2026-10-23", "14:00", settings);
  assert.equal(held.submittedAfterHours, false);
  assert.equal(held.deadline.toISOString(), "2026-10-23T02:45:00.000Z");
});
