import assert from "node:assert/strict";
import test from "node:test";
import { AdminAccessError, pagePermissions } from "../src/lib/admin/access";
import {
  DASHBOARD_CACHE_CONTROL,
  DASHBOARD_PAGE_SIZE,
  DashboardQueryError,
  buildDashboard,
  resolveDashboardScope,
  type DashboardBranch,
  type DashboardProduct,
} from "../src/lib/admin/dashboard";
import type { AllocationDay, AllocationRecord } from "../src/lib/orders/allocation";
import type { InboxOrder } from "../src/lib/orders/schema";
import type { ScheduleSettings } from "../src/lib/scheduling/schema";

const now = new Date("2026-10-23T03:30:00.000Z");
const date = "2026-10-23";
const permissions = { dashboard: true, orders: true, schedule: true, allocation: true };
const branches: DashboardBranch[] = [
  { id: "cebu", name: "Cebu", hoursLabel: "" },
  { id: "manila", name: "Manila", hoursLabel: "Daily, 11am to 7pm" },
];
const schedule: ScheduleSettings = {
  version: 1,
  bookingHorizonDays: 30,
  branches: {
    cebu: { enabled: true, startTime: "10:00", cutoffTime: "19:00", openWeekdays: [0, 1, 2, 3, 4, 5, 6], closedDates: [] },
    manila: { enabled: false, startTime: "10:00", cutoffTime: "19:00", openWeekdays: [0, 1, 2, 3, 4, 5, 6], closedDates: [] },
  },
};
const products: DashboardProduct[] = [
  { id: "buko", name: "Buko pie", branchIds: ["cebu", "manila"] },
  { id: "pecan", name: "Pecan pie", branchIds: ["cebu"] },
];

function order(overrides: Partial<InboxOrder> & { id: string }): InboxOrder {
  return {
    orderNumber: "MK-1000",
    branchId: "cebu",
    fulfillmentDate: date,
    slotId: "11:00",
    slotLabel: "11:00 AM–12:00 PM",
    requireFullPayment: false,
    customerEditable: false,
    submittedAfterHours: false,
    heldFlavors: [],
    anonymized: false,
    cancelReason: null,
    customerName: "Ana",
    contact: "09170000000",
    address: "Secret address",
    delivery: "pickup",
    payment: "gcash",
    catalogMode: "regular",
    preparationDays: 0,
    notes: "secret note",
    lines: [],
    addonLines: [],
    knownSubtotalCentavos: 120000,
    quoteStatus: "finalized",
    finalTotalCentavos: 120000,
    paymentStatus: "unpaid",
    netReceivedCentavos: 0,
    payments: [],
    deadline: "2026-10-23T06:00:00.000Z",
    submittedAt: "2026-10-23T03:00:00.000Z",
    status: "requested",
    events: [],
    ...overrides,
  };
}

function build(overrides: Partial<Parameters<typeof buildDashboard>[0]> = {}) {
  return buildDashboard({
    now,
    branchIds: ["cebu"],
    date,
    permissions,
    orders: [],
    branches,
    schedule,
    allocations: [],
    pauses: [],
    products,
    attentionCursor: null,
    fulfillmentCursor: null,
    ...overrides,
  });
}

test("page access comes from the profile and owners keep every page", () => {
  const staff = { role: "staff" as const, branchIds: ["cebu"], pages: undefined };
  assert.deepEqual(pagePermissions(staff), { dashboard: false, orders: true, schedule: false, allocation: false });
  assert.equal(pagePermissions({ role: "staff", pages: { dashboard: true, orders: false } }).dashboard, true);
  assert.equal(pagePermissions({ role: "staff", pages: { dashboard: true, orders: false } }).orders, false);
  assert.deepEqual(pagePermissions({ role: "owner", pages: { dashboard: false } }), permissions);
});

test("dashboard scope rejects missing permission, bad dates, and branches outside the profile", () => {
  const staff = { role: "staff" as const, branchIds: ["cebu"], pages: { dashboard: true } };
  const owner = { role: "owner" as const, branchIds: [], pages: { dashboard: false } };
  assert.throws(() => resolveDashboardScope({ admin: { role: "staff", branchIds: ["cebu"] }, branch: "all", date, now, knownBranchIds: ["cebu"] }), AdminAccessError);
  assert.deepEqual(resolveDashboardScope({ admin: owner, branch: "all", date, now, knownBranchIds: ["manila", "cebu"] }).branchIds, ["cebu", "manila"]);
  assert.deepEqual(resolveDashboardScope({ admin: staff, branch: "all", date, now, knownBranchIds: ["cebu", "manila"] }).branchIds, ["cebu"]);
  assert.throws(() => resolveDashboardScope({ admin: staff, branch: "manila", date, now, knownBranchIds: ["cebu", "manila"] }), (error: unknown) => error instanceof AdminAccessError && error.status === 403);
  assert.throws(() => resolveDashboardScope({ admin: owner, branch: "davao", date, now, knownBranchIds: ["cebu"] }), DashboardQueryError);
  assert.throws(() => resolveDashboardScope({ admin: owner, branch: "All", date, now, knownBranchIds: ["cebu"] }), DashboardQueryError);
  assert.throws(() => resolveDashboardScope({ admin: owner, branch: "cebu", date: "2026-02-30", now, knownBranchIds: ["cebu"] }), DashboardQueryError);
  assert.throws(() => resolveDashboardScope({ admin: owner, branch: "cebu", date: "2020-01-01", now, knownBranchIds: ["cebu"] }), DashboardQueryError);
  const unassigned = resolveDashboardScope({ admin: { role: "staff", branchIds: [], pages: { dashboard: true } }, branch: "all", date, now, knownBranchIds: ["cebu", "manila"] });
  const hidden = build({ branchIds: unassigned.branchIds, orders: [order({ id: "hidden", branchId: "cebu", customerName: "Hidden" })] });
  assert.deepEqual(unassigned.branchIds, []);
  assert.equal(hidden.summary?.scheduledOrders, 0);
  assert.deepEqual(hidden.branches, []);
  assert.equal(JSON.stringify(hidden).includes("Hidden"), false);
  assert.equal(DASHBOARD_CACHE_CONTROL, "private, no-store");
});

test("summary uses fulfillment date and pie holds, and leaves delivery out of ready-for-pickup", () => {
  const result = build({
    orders: [
      order({ id: "held", heldFlavors: [{ productId: "buko", quantity: 4 }], selection: { date, lines: [{ productId: "buko", variantId: "standard", quantity: 1, addons: [] }], addons: [] } }),
      order({ id: "lines", status: "confirmed", heldFlavors: [], selection: { date, lines: [{ productId: "pecan", variantId: "standard", quantity: 2, addons: [] }], addons: [] } }),
      order({ id: "pickup", status: "ready", delivery: "pickup" }),
      order({ id: "rider", status: "ready", delivery: "lalamove", deliveryEligibility: "eligible", address: "Lahug" }),
      order({ id: "done", status: "completed", delivery: "lalamove", deliveryEligibility: "eligible" }),
      order({ id: "cancelled", status: "cancelled", heldFlavors: [{ productId: "buko", quantity: 9 }] }),
      order({ id: "tomorrow", fulfillmentDate: "2026-10-24", status: "confirmed" }),
      order({ id: "manila", branchId: "manila", status: "confirmed" }),
    ],
  });
  assert.deepEqual(result.summary, { scheduledOrders: 5, scheduledPies: 6, readyForPickup: 1, completedOrders: 1 });
  assert.equal(result.fulfillment?.total, 6);
  assert.equal(result.fulfillment?.items.find((item) => item.id === "rider")?.fulfillment, "delivery");
  assert.equal(result.fulfillment?.items.some((item) => item.id === "tomorrow" || item.id === "manila"), false);
  assert.equal(JSON.stringify(result).includes("09170000000"), false);
  assert.equal(JSON.stringify(result).includes("Secret address"), false);
  assert.equal(JSON.stringify(result).includes("centavos"), false);
});

test("attention is current, deduped, and ordered without treating every future request as overnight", () => {
  const result = build({
    orders: [
      order({ id: "soon", status: "requested", deadline: "2026-10-23T03:31:00.000Z", submittedAt: "2026-10-23T03:20:00.000Z" }),
      order({ id: "later", status: "requested", deadline: "2026-10-23T03:35:00.000Z", submittedAt: "2026-10-23T03:10:00.000Z" }),
      order({ id: "old-night", status: "requested", submittedAfterHours: true, openingAt: "2026-10-23T02:00:00.000Z", slotId: "10:00", submittedAt: "2026-10-22T14:00:00.000Z" }),
      order({ id: "new-night", status: "requested", submittedAfterHours: true, submittedAt: "2026-10-22T15:00:00.000Z", fulfillmentDate: "2026-10-24" }),
      order({ id: "processing", status: "processing", submittedAfterHours: true, deadline: "2026-10-23T03:31:00.000Z" }),
      order({ id: "future", status: "requested", fulfillmentDate: "2026-10-24" }),
      order({ id: "fee-rider", status: "ready", delivery: "lalamove", deliveryEligibility: "pending", submittedAt: "2026-10-23T01:00:00.000Z" }),
      order({ id: "rider", status: "ready", delivery: "lalamove", deliveryEligibility: "eligible", submittedAt: "2026-10-23T01:05:00.000Z" }),
      order({ id: "paid-flag", status: "confirmed", requireFullPayment: true, finalTotalCentavos: 1000, netReceivedCentavos: 0, submittedAt: "2026-10-23T01:10:00.000Z" }),
      order({ id: "unpaid", status: "confirmed", requireFullPayment: false, finalTotalCentavos: 1000, netReceivedCentavos: 0 }),
      order({ id: "quote", status: "confirmed", requireFullPayment: true, quoteStatus: "pending", finalTotalCentavos: null }),
      order({ id: "over", status: "preparing", heldFlavors: [{ productId: "buko", quantity: 1 }], submittedAt: "2026-10-23T01:20:00.000Z" }),
      order({ id: "full", status: "preparing", heldFlavors: [{ productId: "pecan", quantity: 1 }] }),
      order({ id: "closed", status: "cancelled" }),
    ],
    allocations: [
      allocation("buko", 4, 5),
      allocation("pecan", 4, 4),
    ],
  });
  assert.deepEqual(result.attention?.items.map((item) => item.id), ["soon", "later", "old-night", "new-night", "fee-rider", "paid-flag", "over", "rider"]);
  assert.equal(result.attention?.totalDistinctOrders, 8);
  assert.equal(result.attention?.overnightCount, 2);
  assert.deepEqual(result.attention?.items.find((item) => item.id === "fee-rider")?.reasons, ["fee", "rider"]);
  assert.equal(result.attention?.items.find((item) => item.id === "fee-rider")?.nextAction, "Confirm the delivery fee.");
  assert.equal(result.attention?.items.find((item) => item.id === "old-night")?.nextAction, "Waiting since last night. The first morning slot is still undecided.");
  assert.equal(result.attention?.items.find((item) => item.id === "new-night")?.fulfillmentDate, "2026-10-24");
  assert.equal(result.attention?.items.find((item) => item.id === "processing"), undefined);
  assert.equal(result.attention?.items.find((item) => item.id === "future"), undefined);
  assert.equal(result.attention?.items.find((item) => item.id === "unpaid"), undefined);
  assert.equal(result.attention?.items.find((item) => item.id === "full"), undefined);
});

test("branch intake stays separate from sold-out allocation and from a paused day", () => {
  const early = new Date("2026-10-23T00:30:00.000Z");
  const paused: AllocationDay[] = [{ branchId: "cebu", fulfillmentDate: date, paused: true, version: 1 }];
  const open = build({
    allocations: [allocation("buko", 2, 2), allocation("pecan", null, 0)],
    branchIds: ["cebu", "manila"],
  });
  assert.equal(open.branches?.find((branch) => branch.id === "cebu")?.intakeState, "online");
  assert.equal(open.branches?.find((branch) => branch.id === "manila")?.intakeState, "unconfigured");
  assert.equal(open.branches?.find((branch) => branch.id === "manila")?.hoursLabel, "Daily, 11am to 7pm");
  assert.deepEqual(open.availability?.map((row) => [row.branchId, row.productId, row.state, row.remaining]), [
    ["cebu", "buko", "sold_out", 0],
    ["cebu", "pecan", "unlimited", null],
    ["manila", "buko", "unconfigured", null],
  ]);
  const closed = build({ now: early });
  assert.equal(closed.branches?.find((branch) => branch.id === "cebu")?.intakeState, "outside_hours");
  assert.equal(closed.branches?.find((branch) => branch.id === "cebu")?.nextOpeningAt, "2026-10-23T02:00:00.000Z");
  const hold = build({
    now,
    pauses: paused,
    orders: [order({ id: "keep", status: "ready" })],
  });
  assert.equal(hold.branches?.find((branch) => branch.id === "cebu")?.intakeState, "paused");
  assert.equal(hold.fulfillment?.total, 1);
});

test("pagination does not change totals and a failed section does not become zero", () => {
  const orders = Array.from({ length: DASHBOARD_PAGE_SIZE + 5 }, (_, index) => order({
    id: `order-${String(index).padStart(2, "0")}`,
    orderNumber: `MK-${1000 + index}`,
    status: "confirmed",
  }));
  const first = build({ orders });
  const second = build({ orders, fulfillmentCursor: first.fulfillment?.nextCursor });
  assert.equal(first.fulfillment?.total, 30);
  assert.equal(first.fulfillment?.items.length, DASHBOARD_PAGE_SIZE);
  assert.equal(second.fulfillment?.items.length, 5);
  assert.equal(second.fulfillment?.nextCursor, null);
  assert.equal(second.summary?.scheduledOrders, 30);
  const failed = build({ orders: null, allocations: null });
  assert.equal(failed.summary, null);
  assert.equal(failed.sections.summary.state, "error");
  assert.equal(failed.sections.availability.state, "error");
  assert.equal(failed.availability, null);
  const hidden = build({ permissions: { ...permissions, allocation: false } });
  assert.equal(hidden.availability, null);
  assert.equal(hidden.sections.availability.state, "forbidden");
  assert.equal(JSON.stringify(hidden).includes("Buko"), false);
  assert.throws(() => build({ fulfillmentCursor: "not-a-cursor" }), DashboardQueryError);
});

test("closed orders past the retention window keep operational facts and drop the customer", () => {
  const result = build({
    date: "2026-09-01",
    orders: [order({
      id: "old",
      status: "completed",
      fulfillmentDate: "2026-09-01",
      customerName: "Ana",
      anonymized: false,
    })],
  });
  assert.equal(result.summary?.completedOrders, 1);
  assert.equal(result.fulfillment?.items[0]?.customer, null);
  assert.equal(result.fulfillment?.items[0]?.anonymized, true);
  assert.equal(result.fulfillment?.items[0]?.number, "MK-1000");
});

function allocation(productId: string, limit: number | null, held: number): AllocationRecord {
  return { branchId: "cebu", fulfillmentDate: date, productId, limit, held, version: 1 };
}
