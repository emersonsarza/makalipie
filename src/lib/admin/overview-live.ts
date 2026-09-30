import dayjs from "@/lib/dayjs";
import { manilaDate } from "@/lib/catalog/rules";
import {
  TIMEZONE,
  type ActivityItem,
  type AttentionItem,
  type AttentionReason,
  type BakeLine,
  type Bestseller,
  type CapacityDay,
  type OpsOverview,
  type OverviewOrder,
  type SalesDay,
  formatPesos,
} from "@/lib/admin/overview-fixtures";
import type { AllocationDay, AllocationRecord } from "@/lib/orders/allocation";
import { dailyCapacityKey } from "@/lib/orders/policy";
import { receiptLine } from "@/lib/orders/receipt-line";
import type { InboxOrder } from "@/lib/orders/schema";
import type { ScheduleSettings } from "@/lib/scheduling/schema";

const HOLD_STATUSES = new Set(["requested", "processing"]);
const COMMITTED_STATUSES = new Set(["confirmed", "preparing", "ready", "completed"]);
const TODAY_SCHEDULE_STATUSES = new Set(["confirmed", "preparing", "ready"]);
const BAKE_STATUSES = new Set(["confirmed", "preparing"]);

const reasonPriority: Record<AttentionReason, number> = {
  past_fulfillment_window: 0,
  reservation_expiring: 1,
  awaiting_confirmation: 2,
  quote_pending: 3,
  outstanding_balance: 4,
  collection_due: 5,
};

const reasonLabels: Record<AttentionReason, string> = {
  awaiting_confirmation: "Awaiting confirmation",
  quote_pending: "Quote to finalize",
  reservation_expiring: "Reservation nearing expiry",
  past_fulfillment_window: "Past fulfillment window",
  outstanding_balance: "Outstanding balance",
  collection_due: "Collection due at pickup",
};

function orderHref(orderNumber: string) {
  return `/admin/orders?q=${encodeURIComponent(orderNumber)}`;
}

function slotSort(slotId: string) {
  const [hour, minute] = slotId.split(":").map(Number);
  return hour * 100 + minute;
}

function itemSummary(order: InboxOrder) {
  if (order.lines.length > 0) {
    const parts = order.lines.map((line) => {
      const parsed = receiptLine(line);
      return parsed ? `${parsed.quantity}× ${parsed.title}` : line.split("\n")[0];
    });
    return parts.join(" · ");
  }
  if (order.selection?.lines.length) {
    return order.selection.lines.map((line) => `${line.quantity}× ${line.productId}`).join(" · ");
  }
  return "Order items";
}

function pieQty(order: InboxOrder) {
  if (order.selection?.lines.length) {
    return order.selection.lines.reduce((sum, line) => sum + line.quantity, 0);
  }
  return order.lines.reduce((sum, line) => {
    const parsed = receiptLine(line);
    return sum + (parsed?.quantity ?? 1);
  }, 0) || 1;
}

function mapOrder(order: InboxOrder, now: Date): OverviewOrder {
  const mapped: OverviewOrder = {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    itemSummary: itemSummary(order),
    fulfillmentType: order.delivery === "lalamove" ? "delivery" : "pickup",
    slotLabel: order.slotLabel,
    slotSort: slotSort(order.slotId),
    fulfillmentDate: order.fulfillmentDate,
    status: order.status,
    paymentStatus: order.paymentStatus,
    quoteStatus: order.quoteStatus,
    paymentMethod: order.payment,
    finalTotalCentavos: order.finalTotalCentavos,
    amountReceivedCentavos: order.netReceivedCentavos,
  };

  if (HOLD_STATUSES.has(order.status)) {
    const expiresAt = Date.parse(order.deadline);
    if (Number.isFinite(expiresAt)) {
      mapped.minutesToExpiry = Math.max(0, Math.round((expiresAt - now.getTime()) / 60_000));
      mapped.reservationExpiresAtLabel = dayjs(expiresAt).tz(TIMEZONE).format("h:mm A");
      mapped.reservationExpiresAt = order.deadline;
    }
  }

  return mapped;
}

function buildAttention(orders: OverviewOrder[], today: string): AttentionItem[] {
  const map = new Map<string, AttentionItem>();

  function push(order: OverviewOrder, reason: AttentionReason, detail: string, urgencyMinutes: number) {
    const existing = map.get(order.id);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      existing.reasons.sort((a, b) => reasonPriority[a] - reasonPriority[b]);
      existing.primaryLabel = reasonLabels[existing.reasons[0]];
      if (urgencyMinutes <= existing.urgencyMinutes) {
        existing.urgencyMinutes = urgencyMinutes;
        existing.detail = detail;
      }
      if (order.reservationExpiresAt) existing.expiresAt = order.reservationExpiresAt;
      return;
    }
    map.set(order.id, {
      id: `att-${order.id}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      reasons: [reason],
      primaryLabel: reasonLabels[reason],
      detail,
      href: orderHref(order.orderNumber),
      urgencyMinutes,
      expiresAt: order.reservationExpiresAt,
    });
  }

  for (const o of orders) {
    if (o.status === "requested" || o.status === "processing") {
      push(o, "awaiting_confirmation", `Fulfillment ${o.fulfillmentDate}`, o.minutesToExpiry ?? 9999);
      if (o.quoteStatus === "pending") {
        push(o, "quote_pending", "Final amount still pending in chat", o.minutesToExpiry ?? 9999);
      }
      if (o.minutesToExpiry != null && o.minutesToExpiry <= 120) {
        push(
          o,
          "reservation_expiring",
          `Hold expires ${o.reservationExpiresAtLabel} · ${o.minutesToExpiry} min left`,
          o.minutesToExpiry,
        );
      }
    }

    if (o.fulfillmentDate < today && ["confirmed", "preparing", "ready"].includes(o.status)) {
      push(o, "past_fulfillment_window", `Was due ${o.fulfillmentDate} · still ${o.status}`, 0);
    }

    const balance = (o.finalTotalCentavos ?? 0) - o.amountReceivedCentavos;
    if (
      balance > 0 &&
      o.quoteStatus === "finalized" &&
      ["confirmed", "preparing", "ready", "completed"].includes(o.status)
    ) {
      if (o.paymentMethod === "cash" && o.fulfillmentDate >= today && o.status !== "completed") {
        push(o, "collection_due", `Collect ${formatPesos(balance)} at ${o.fulfillmentType}`, 400 + balance / 100);
      } else if (!(o.paymentMethod === "cash" && o.fulfillmentDate >= today)) {
        push(o, "outstanding_balance", `${formatPesos(balance)} still unpaid`, 200 + balance / 100);
      } else if (o.paymentMethod !== "cash") {
        push(o, "outstanding_balance", `${formatPesos(balance)} still unpaid`, 200 + balance / 100);
      }
    }
  }

  return [...map.values()].sort((a, b) => {
    const ra = reasonPriority[a.reasons[0]];
    const rb = reasonPriority[b.reasons[0]];
    if (ra !== rb) return ra - rb;
    return a.urgencyMinutes - b.urgencyMinutes;
  });
}

function buildBakeSummary(orders: InboxOrder[]): BakeLine[] {
  const map = new Map<string, BakeLine>();
  for (const order of orders) {
    if (!BAKE_STATUSES.has(order.status)) continue;
    for (const line of order.lines) {
      const parsed = receiptLine(line);
      if (!parsed) continue;
      const key = `${parsed.title}::${parsed.size}`;
      const existing = map.get(key);
      if (existing) existing.quantity += parsed.quantity;
      else map.set(key, { productName: parsed.title, variantLabel: parsed.size, quantity: parsed.quantity });
    }
  }
  return [...map.values()].sort((a, b) => b.quantity - a.quantity || a.productName.localeCompare(b.productName));
}

function weekdayUtc(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function dayClosed(
  date: string,
  schedule: ScheduleSettings,
  pauses: Map<string, AllocationDay>,
) {
  const enabled = Object.entries(schedule.branches).filter(([, branch]) => branch.enabled);
  if (enabled.length === 0) return false;
  return enabled.every(([branchId, branch]) => {
    if (branch.closedDates.includes(date)) return true;
    if (!branch.openWeekdays.includes(weekdayUtc(date))) return true;
    return pauses.get(dailyCapacityKey(branchId, date))?.paused === true;
  });
}

function itemLimitForDate(date: string, allocations: Map<string, AllocationRecord>) {
  let total = 0;
  let hasLimit = false;
  for (const entry of allocations.values()) {
    if (entry.fulfillmentDate !== date || entry.limit == null) continue;
    hasLimit = true;
    total += entry.limit;
  }
  return hasLimit ? total : 0;
}

function buildCapacity(
  today: string,
  orders: InboxOrder[],
  schedule: ScheduleSettings,
  allocations: Map<string, AllocationRecord>,
  pauses: Map<string, AllocationDay>,
): CapacityDay[] {
  const days: CapacityDay[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = dayjs.tz(`${today}T12:00:00`, TIMEZONE).add(offset, "day").format("YYYY-MM-DD");
    const label = dayjs.tz(`${date}T12:00:00`, TIMEZONE).format("ddd D");
    const closed = dayClosed(date, schedule, pauses);
    const dayOrders = orders.filter((order) => order.fulfillmentDate === date);
    let committedOrders = 0;
    let committedItems = 0;
    let holdOrders = 0;
    let holdItems = 0;
    for (const order of dayOrders) {
      const qty = pieQty(order);
      if (HOLD_STATUSES.has(order.status)) {
        holdOrders += 1;
        holdItems += qty;
      } else if (COMMITTED_STATUSES.has(order.status)) {
        committedOrders += 1;
        committedItems += qty;
      }
    }
    const itemLimit = itemLimitForDate(date, allocations);
    const orderLoad = committedOrders + holdOrders;
    days.push({
      date,
      label,
      isToday: offset === 0,
      isTomorrow: offset === 1,
      closed,
      orderLimit: Math.max(orderLoad, 1),
      itemLimit,
      committedOrders,
      committedItems,
      holdOrders,
      holdItems,
    });
  }
  return days;
}

function moneyMovementsToday(orders: InboxOrder[], today: string) {
  let received = 0;
  let refunds = 0;
  for (const order of orders) {
    for (const payment of order.payments) {
      if (manilaDate(new Date(payment.at)) !== today) continue;
      if (payment.kind === "refund") refunds += payment.amountCentavos;
      else received += payment.amountCentavos;
    }
  }
  return { received, refunds };
}

function paymentTotals(orders: OverviewOrder[], today: string) {
  let outstanding = 0;
  let collectionDue = 0;
  for (const order of orders) {
    const balance = (order.finalTotalCentavos ?? 0) - order.amountReceivedCentavos;
    if (
      balance <= 0 ||
      order.quoteStatus !== "finalized" ||
      !["confirmed", "preparing", "ready", "completed"].includes(order.status)
    ) {
      continue;
    }
    if (order.paymentMethod === "cash" && order.fulfillmentDate >= today && order.status !== "completed") {
      collectionDue += balance;
    } else {
      outstanding += balance;
    }
  }
  return { outstanding, collectionDue };
}

function addCalendarDays(date: string, days: number) {
  return dayjs.tz(`${date}T12:00:00`, TIMEZONE).add(days, "day").format("YYYY-MM-DD");
}

function buildSales(orders: InboxOrder[], today: string) {
  const days: SalesDay[] = [];
  let periodValue = 0;
  let periodCount = 0;
  const bestsellersMap = new Map<string, Bestseller>();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = addCalendarDays(today, -offset);
    const completed = orders.filter((order) => order.fulfillmentDate === date && order.status === "completed");
    const value = completed.reduce((sum, order) => sum + (order.finalTotalCentavos ?? order.knownSubtotalCentavos), 0);
    days.push({
      date,
      label: dayjs.tz(`${date}T12:00:00`, TIMEZONE).format("ddd"),
      completedOrderValueCentavos: value,
      completedOrderCount: completed.length,
    });
    periodValue += value;
    periodCount += completed.length;
    for (const order of completed) {
      for (const line of order.lines) {
        const parsed = receiptLine(line);
        if (!parsed) continue;
        const key = `${parsed.title}::${parsed.size}`;
        const existing = bestsellersMap.get(key);
        if (existing) existing.quantity += parsed.quantity;
        else bestsellersMap.set(key, { productName: parsed.title, variantLabel: parsed.size, quantity: parsed.quantity });
      }
    }
  }

  let priorPeriodValue = 0;
  for (let offset = 13; offset >= 7; offset -= 1) {
    const date = addCalendarDays(today, -offset);
    const completed = orders.filter((order) => order.fulfillmentDate === date && order.status === "completed");
    priorPeriodValue += completed.reduce((sum, order) => sum + (order.finalTotalCentavos ?? order.knownSubtotalCentavos), 0);
  }

  const valueDeltaPct =
    priorPeriodValue === 0 ? null : Math.round(((periodValue - priorPeriodValue) / priorPeriodValue) * 1000) / 10;

  return {
    rangeLabel: "Last 7 days",
    days,
    completedOrderValueCentavos: periodValue,
    completedOrderCount: periodCount,
    averageOrderValueCentavos: periodCount === 0 ? 0 : Math.round(periodValue / periodCount),
    comparisonLabel: "vs prior 7 days",
    valueDeltaPct,
    priorPeriodValueCentavos: priorPeriodValue,
    bestsellers: [...bestsellersMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5),
  };
}

function eventSummary(order: InboxOrder, action: InboxOrder["events"][number]["action"]) {
  switch (action) {
    case "processing":
      return `New request ${order.orderNumber}`;
    case "approve":
      return `${order.orderNumber} approved`;
    case "reject":
      return `${order.orderNumber} cancelled`;
    case "expire":
      return `${order.orderNumber} hold expired`;
    case "preparing":
      return `${order.orderNumber} preparing`;
    case "ready":
      return `${order.orderNumber} marked ready`;
    case "complete":
    case "delivered":
      return `${order.orderNumber} completed`;
    case "revise":
      return `${order.orderNumber} revised`;
    case "settle":
      return `Settlement recorded · ${order.orderNumber}`;
    case "deliverable":
      return `Delivery confirmed · ${order.orderNumber}`;
    case "reopen":
      return `${order.orderNumber} reopened`;
    case "reorder":
      return `Reorder created · ${order.orderNumber}`;
    default:
      return `${order.orderNumber} updated`;
  }
}

function actorLabel(actorUid: string) {
  if (actorUid === "system") return "System";
  if (actorUid === "customer") return "Customer";
  return "Staff";
}

function recentActivitySorted(orders: InboxOrder[]): ActivityItem[] {
  type Row = { at: number; item: ActivityItem };
  const rows: Row[] = [];
  for (const order of orders) {
    for (const event of order.events) {
      rows.push({
        at: Date.parse(event.at),
        item: {
          id: `${order.id}-${event.at}-${event.action}`,
          atLabel: dayjs(event.at).tz(TIMEZONE).format("h:mm A"),
          summary: eventSummary(order, event.action),
          actor: actorLabel(event.actorUid),
          href: orderHref(order.orderNumber),
        },
      });
    }
  }
  return rows.sort((a, b) => b.at - a.at).slice(0, 10).map((row) => row.item);
}

function groupBySlot(orders: OverviewOrder[]) {
  const groups = new Map<string, OverviewOrder[]>();
  for (const order of orders) {
    const list = groups.get(order.slotLabel) ?? [];
    list.push(order);
    groups.set(order.slotLabel, list);
  }
  return [...groups.entries()]
    .map(([slotLabel, list]) => ({
      slotLabel,
      slotSort: list[0]?.slotSort ?? 0,
      orders: list,
    }))
    .sort((a, b) => a.slotSort - b.slotSort);
}

export function buildOpsOverview(input: {
  orders: InboxOrder[];
  schedule: ScheduleSettings;
  allocations: Map<string, AllocationRecord>;
  pauses: Map<string, AllocationDay>;
  now?: Date;
}): OpsOverview {
  const now = input.now ?? new Date();
  const today = manilaDate(now);
  const dateLabel = dayjs(now).tz(TIMEZONE).format("dddd, D MMM YYYY");
  const lastRefresh = `Refreshed ${dayjs(now).tz(TIMEZONE).format("h:mm A")}`;

  const overviewOrders = input.orders.map((order) => mapOrder(order, now));
  const todayOutstanding = overviewOrders
    .filter((order) => order.fulfillmentDate === today && TODAY_SCHEDULE_STATUSES.has(order.status))
    .sort((a, b) => a.slotSort - b.slotSort);
  const completedToday = overviewOrders.filter((order) => order.fulfillmentDate === today && order.status === "completed");
  const todayInbox = input.orders.filter((order) => order.fulfillmentDate === today);

  const itemsStillToPrepare = todayInbox
    .filter((order) => order.status === "confirmed" || order.status === "preparing")
    .reduce((sum, order) => sum + pieQty(order), 0);

  const money = moneyMovementsToday(input.orders, today);
  const payments = paymentTotals(overviewOrders, today);
  const attention = buildAttention(overviewOrders, today);
  const bakeSummary = buildBakeSummary(todayInbox);
  const capacity = buildCapacity(today, input.orders, input.schedule, input.allocations, input.pauses);
  const sales = buildSales(input.orders, today);
  const recentActivity = recentActivitySorted(input.orders);

  return {
    date: today,
    dateLabel,
    timezone: TIMEZONE,
    lastRefresh,
    glance: {
      ordersDue: todayOutstanding.length,
      itemsStillToPrepare,
      readyOrders: todayOutstanding.filter((order) => order.status === "ready").length,
      moneyReceivedCentavos: money.received,
      completedTodayCount: completedToday.length,
    },
    attention,
    todayOrders: todayOutstanding,
    completedToday,
    bakeSummary,
    capacity,
    payments: {
      moneyReceivedTodayCentavos: money.received,
      refundsTodayCentavos: money.refunds,
      outstandingBalancesCentavos: payments.outstanding,
      collectionDueCentavos: payments.collectionDue,
    },
    sales,
    recentActivity,
    slots: groupBySlot(todayOutstanding),
    links: {
      ordersToday: "/admin/orders",
      kitchenToday: "/admin/orders",
      ordersReady: "/admin/orders",
      ordersAttention: "/admin/orders",
      payments: "/admin/orders",
    },
  };
}
