import assert from "node:assert/strict";
import test from "node:test";
import { AdminAccessError } from "../src/lib/admin/access";
import {
  ORDERS_CACHE_CONTROL,
  ORDERS_PAGE_SIZE,
  OrdersQueryError,
  buildOrderDetail,
  buildOrdersList,
  commandPayload,
  normalizeOrderView,
  orderCommandSchema,
  orderVersion,
  resolveOrdersScope,
  type OrderExtras,
} from "../src/lib/admin/orders-v2";
import type { InboxOrder } from "../src/lib/orders/schema";
import type { ScheduleSettings } from "../src/lib/scheduling/schema";

const now = new Date("2026-10-23T03:30:00.000Z");
const today = "2026-10-23";
const owner = { role: "owner" as const, branchIds: [] as string[], pages: { orders: true } };
const schedule: ScheduleSettings = {
  version: 1,
  bookingHorizonDays: 30,
  branches: {
    cebu: { enabled: true, startTime: "10:00", cutoffTime: "19:00", openWeekdays: [0, 1, 2, 3, 4, 5, 6], closedDates: [] },
  },
};
const extras: OrderExtras = {
  staffNotes: [{ text: "internal", at: "2026-10-23T03:00:00.000Z", actorUid: "staff" }],
  rider: null,
  anonymizedAt: null,
  allocationBlocked: false,
  pickupEnabled: true,
  branchName: "Cebu",
  mapUrl: "https://maps.example/cebu",
  instagram: "https://instagram.com/makalipie",
  messenger: null,
};

function order(overrides: Partial<InboxOrder> & { id: string }): InboxOrder {
  return {
    orderNumber: "MK-1000",
    branchId: "cebu",
    fulfillmentDate: today,
    slotId: "11:00",
    slotLabel: "11:00 AM–12:00 PM",
    requireFullPayment: false,
    customerEditable: false,
    submittedAfterHours: false,
    heldFlavors: [],
    anonymized: false,
    cancelReason: null,
    customerName: "Ana Cruz",
    contact: "09170000000",
    address: "123 Secret Street",
    delivery: "pickup",
    payment: "gcash",
    catalogMode: "regular",
    preparationDays: 0,
    notes: "leave at the door",
    lines: ["Buko pie"],
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

function list(overrides: Partial<Parameters<typeof buildOrdersList>[0]> = {}) {
  return buildOrdersList({
    now,
    branchIds: ["cebu"],
    orders: [],
    names: new Map([["cebu", "Cebu"]]),
    schedule,
    view: "needs-action",
    query: "",
    date: null,
    to: null,
    fulfillment: null,
    pay: null,
    cursor: null,
    selectedId: null,
    ...overrides,
  });
}

test("orders scope follows page access and assigned branches", () => {
  assert.equal(ORDERS_CACHE_CONTROL, "private, no-store");
  assert.throws(() => resolveOrdersScope({ admin: { role: "staff", branchIds: ["cebu"], pages: { orders: false } }, branch: "all", now, knownBranchIds: ["cebu"] }), AdminAccessError);
  assert.deepEqual(resolveOrdersScope({ admin: { role: "staff", branchIds: [], pages: { orders: true } }, branch: "all", now, knownBranchIds: ["cebu"] }).branchIds, []);
  assert.deepEqual(resolveOrdersScope({ admin: { role: "staff", branchIds: ["cebu"], pages: { orders: true } }, branch: "all", now, knownBranchIds: ["cebu", "manila"] }).branchIds, ["cebu"]);
  assert.throws(() => resolveOrdersScope({ admin: { role: "staff", branchIds: ["cebu"], pages: { orders: true } }, branch: "manila", now, knownBranchIds: ["cebu", "manila"] }), (error: unknown) => error instanceof AdminAccessError && error.status === 403);
  assert.throws(() => resolveOrdersScope({ admin: owner, branch: "davao", now, knownBranchIds: ["cebu"] }), (error: unknown) => error instanceof OrdersQueryError && error.status === 400);
  assert.equal(normalizeOrderView("scheduled"), "all");
  assert.equal(normalizeOrderView("requested"), "needs-action");
  assert.equal(normalizeOrderView("cancelled"), "closed");
});

test("counts ignore date and search filters, and overnight stays listed with pickup soon", () => {
  const overnight = order({
    id: "night",
    orderNumber: "MK-2001",
    submittedAfterHours: true,
    openingAt: "2026-10-23T02:00:00.000Z",
    slotId: "10:00",
    deadline: "2026-10-23T04:00:00.000Z",
    customerName: "Night Customer",
  });
  const later = order({ id: "later", orderNumber: "MK-2002", status: "confirmed", fulfillmentDate: "2026-10-24", customerName: "Later Customer" });
  const result = list({ orders: [overnight, later], date: "today", view: "overnight" });
  assert.equal(result.counts.all, 2);
  assert.equal(result.counts.overnight, 1);
  assert.equal(result.counts.today, 0);
  assert.equal(result.counts.upcoming, 1);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].pickupSoon, true);
  assert.equal(result.rows[0].customer, "Night Customer");
  assert.equal(JSON.stringify(result).includes("Later Customer"), false);
});

test("needs action sorts deadlines first and search can find another tab", () => {
  const soon = order({ id: "soon", orderNumber: "MK-3001", deadline: "2026-10-23T04:00:00.000Z", customerName: "Soon" });
  const later = order({ id: "later", orderNumber: "MK-3002", deadline: "2026-10-23T05:00:00.000Z", customerName: "Later" });
  const processing = order({ id: "work", orderNumber: "MK-3003", status: "processing", customerName: "Working" });
  const done = order({ id: "done", orderNumber: "MK-3004", status: "completed", customerName: "Finished Person", fulfillmentDate: "2026-10-20" });
  const sorted = list({ orders: [processing, later, soon], view: "needs-action" });
  assert.deepEqual(sorted.rows.map((row) => row.id), ["soon", "later", "work"]);
  const found = list({ orders: [soon, done], view: "needs-action", query: "finished" });
  assert.deepEqual(found.rows.map((row) => row.id), ["done"]);
  assert.equal(found.rows[0].sourceView, "completed");
  assert.equal(found.counts["needs-action"], 1);
  const exact = list({ orders: [soon, done], view: "needs-action", query: "mk3004", date: "today" });
  assert.equal(exact.exactMatchId, "done");
  assert.equal(exact.rows.length, 0);
  const hidden = list({
    orders: [order({ id: "other", orderNumber: "MK-9999", branchId: "manila", customerName: "Other Branch" })],
    query: "MK-9999",
    selectedId: "other",
  });
  assert.equal(hidden.exactMatchId, null);
  assert.equal(hidden.selected, null);
  assert.equal(JSON.stringify(hidden).includes("Other Branch"), false);
});

test("date windows, pagination, and selected orders outside the current filter", () => {
  assert.throws(() => list({ date: null, to: today }), OrdersQueryError);
  const week = list({
    date: "week",
    orders: [
      order({ id: "monday", fulfillmentDate: "2026-10-19", status: "confirmed" }),
      order({ id: "sunday", fulfillmentDate: "2026-10-25", status: "ready" }),
      order({ id: "next", fulfillmentDate: "2026-10-26", status: "confirmed" }),
    ],
    view: "all",
  });
  assert.deepEqual(week.rows.map((row) => row.id), ["monday", "sunday"]);
  const next3 = list({
    date: "next3",
    view: "all",
    orders: [
      order({ id: "today", fulfillmentDate: today, status: "confirmed" }),
      order({ id: "plus2", fulfillmentDate: "2026-10-25", status: "confirmed" }),
      order({ id: "plus3", fulfillmentDate: "2026-10-26", status: "confirmed" }),
    ],
  });
  assert.deepEqual(next3.rows.map((row) => row.id).sort(), ["plus2", "today"]);
  const many = Array.from({ length: 26 }, (_, index) => order({
    id: `page-${index}`,
    orderNumber: `MK-${4000 + index}`,
    submittedAt: new Date(Date.parse("2026-10-23T03:00:00.000Z") - index * 1000).toISOString(),
  }));
  const first = list({ orders: many, view: "all" });
  assert.equal(first.rows.length, ORDERS_PAGE_SIZE);
  assert.equal(first.counts.all, 26);
  assert.ok(first.nextCursor);
  const second = list({ orders: many, view: "all", cursor: first.nextCursor });
  assert.equal(second.rows.length, 1);
  assert.equal(second.counts.all, 26);
  const selected = list({
    orders: [order({ id: "keep", status: "completed", fulfillmentDate: "2026-10-20" })],
    view: "needs-action",
    selectedId: "keep",
  });
  assert.deepEqual(selected.selected, { id: "keep", matchesFilters: false });
});

test("detail guards, money, privacy, and command payloads", () => {
  const due = order({
    id: "due",
    status: "ready",
    finalTotalCentavos: 120000,
    netReceivedCentavos: 20000,
    payments: [{ at: "2026-10-23T03:10:00.000Z", actorUid: "staff", method: "gcash", amountCentavos: 20000 }],
  });
  const unpaid = buildOrderDetail(due, extras, schedule, now, owner);
  assert.equal(unpaid.order.collectionCentavos, 100000);
  assert.equal(unpaid.order.refundDueCentavos, 0);
  assert.equal(unpaid.order.boxing.provenance, "unavailable");
  assert.equal(unpaid.allowedActions.includes("complete"), false);
  assert.equal(unpaid.guardReasons.some((guard) => guard.action === "complete" && guard.code === "payment_required"), true);
  const paid = order({
    ...due,
    netReceivedCentavos: 120000,
    paymentStatus: "paid",
    payments: [{ at: "2026-10-23T03:10:00.000Z", actorUid: "staff", method: "cash", amountCentavos: 120000 }],
  });
  const settled = buildOrderDetail(paid, extras, schedule, now, owner);
  assert.equal(settled.allowedActions.includes("complete"), true);
  const staff = buildOrderDetail(paid, extras, schedule, now, { role: "staff", pages: { orders: true, orderActions: { complete: false } } });
  assert.equal(staff.allowedActions.includes("complete"), false);
  const ownerOverride = buildOrderDetail(paid, extras, schedule, now, { role: "owner", pages: { orderActions: { complete: false } } });
  assert.equal(ownerOverride.allowedActions.includes("complete"), true);

  const delivery = order({
    id: "out",
    status: "ready",
    delivery: "lalamove",
    deliveryEligibility: "eligible",
    deliveryFeePayment: "to_driver",
    deliveryFeeCentavos: 15000,
    address: "456 Mango Ave",
    netReceivedCentavos: 120000,
    paymentStatus: "paid",
    payments: [{ id: "pay-1", at: "2026-10-23T03:10:00.000Z", actorUid: "staff", method: "gcash", amountCentavos: 120000, reference: "GCash 123" }],
  });
  const out = buildOrderDetail(delivery, extras, schedule, now, owner);
  assert.equal(out.order.fulfillment, "delivery");
  assert.equal(out.order.feeDestination, "to_rider");
  assert.equal(out.order.status, "ready");
  assert.equal(out.allowedActions.includes("revise"), false);
  assert.equal(out.guardReasons.some((guard) => guard.code === "out_for_delivery"), true);
  assert.equal(out.guardReasons.some((guard) => guard.action === "ready" && guard.severity === "warning"), false);
  assert.ok(out.order.mapUrl?.startsWith("https://www.google.com/maps/search/"));
  assert.equal(out.order.mapUrl?.includes("456%20Mango%20Ave"), true);

  const preparing = buildOrderDetail(order({ id: "prep", status: "preparing", delivery: "lalamove", deliveryEligibility: "eligible" }), extras, schedule, now, owner);
  assert.equal(preparing.allowedActions.includes("ready"), true);
  assert.equal(preparing.guardReasons.some((guard) => guard.code === "rider_missing" && guard.severity === "warning"), true);

  const old = order({
    id: "old",
    status: "completed",
    fulfillmentDate: "2026-09-01",
    customerName: "Forgotten Name",
    notes: "private note",
    lines: ["Buko: “happy birthday”"],
    payments: [{ at: "2026-09-01T03:00:00.000Z", actorUid: "staff", method: "cash", amountCentavos: 120000, reference: "secret-ref", note: "secret-note" }],
    events: [{ at: "2026-09-01T04:00:00.000Z", actorUid: "staff", action: "complete", previousStatus: "ready", status: "completed", reason: "left with Ana" }],
  });
  const hidden = buildOrderDetail(old, { ...extras, staffNotes: [{ text: "do not show", at: "2026-09-01T04:00:00.000Z", actorUid: "staff" }] }, schedule, now, owner);
  assert.equal(hidden.order.anonymized, true);
  assert.equal(hidden.order.customer, null);
  assert.equal(hidden.order.notes, null);
  assert.equal(hidden.order.staffNotes.length, 0);
  assert.equal(hidden.order.payments[0].reference, null);
  assert.equal(hidden.order.history[0].reason, null);
  assert.equal(hidden.order.lines[0].includes("happy birthday"), false);
  assert.equal(hidden.allowedActions.length, 0);
  const byNumber = list({ orders: [old], view: "all", query: "forgotten" });
  assert.equal(byNumber.rows.length, 0);
  assert.equal(list({ orders: [old], view: "all", query: "1000" }).exactMatchId, "old");

  const voided = order({
    id: "voided",
    status: "confirmed",
    netReceivedCentavos: 120000,
    paymentStatus: "paid",
    payments: [
      { id: "keep", at: "2026-10-23T03:00:00.000Z", actorUid: "staff", method: "cash", amountCentavos: 120000 },
      { id: "gone", at: "2026-10-23T03:05:00.000Z", actorUid: "staff", method: "cash", amountCentavos: 5000, voidedAt: "2026-10-23T03:06:00.000Z" },
    ],
  });
  assert.equal(buildOrderDetail(voided, extras, schedule, now, owner).order.netReceivedCentavos, 120000);

  assert.notEqual(orderVersion(due), orderVersion({ ...due, status: "completed" }));
  assert.throws(() => commandPayload(orderCommandSchema.parse({
    orderId: "due",
    action: "payment",
    expectedVersion: 1,
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    payload: { amountCentavos: 100, method: "gcash", proof: "receipt.png" },
  })), (error: unknown) => error instanceof OrdersQueryError && error.message === "Payment proof upload is not available.");
  const fee = commandPayload(orderCommandSchema.parse({
    orderId: "due",
    action: "fee",
    expectedVersion: 1,
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    payload: { feeCentavos: 15000, destination: "to_rider" },
  }));
  assert.equal("destination" in fee && fee.destination, "to_rider");
});
