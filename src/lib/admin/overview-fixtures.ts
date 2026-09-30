/** Development fixtures for the Overview dashboard until order services exist. */
import dayjs from "@/lib/dayjs";

export const BUSINESS_DATE = "2026-09-24";
export const BUSINESS_DATE_LABEL = "Thursday, 24 Sep 2026";
export const TIMEZONE = "Asia/Manila";
export const LAST_REFRESH_LABEL = "Refreshed 4:12 PM";

export type FulfillmentStatus =
  | "requested"
  | "processing"
  | "confirmed"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled"
  | "expired";
export type PaymentStatus = "unpaid" | "partially_paid" | "paid" | "refunded";
export type QuoteStatus = "pending" | "finalized";
export type FulfillmentType = "pickup" | "delivery";
export type PaymentMethod = "gcash" | "bank" | "cash";

export type AttentionReason =
  | "awaiting_confirmation"
  | "quote_pending"
  | "reservation_expiring"
  | "past_fulfillment_window"
  | "outstanding_balance"
  | "collection_due";

export type OverviewOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  itemSummary: string;
  fulfillmentType: FulfillmentType;
  slotLabel: string;
  slotSort: number;
  fulfillmentDate: string;
  status: FulfillmentStatus;
  paymentStatus: PaymentStatus;
  quoteStatus: QuoteStatus;
  paymentMethod: PaymentMethod;
  finalTotalCentavos: number | null;
  amountReceivedCentavos: number;
  reservationExpiresAtLabel?: string;
  minutesToExpiry?: number;
  /** ISO deadline for live countdown on Overview. */
  reservationExpiresAt?: string;
};

export type AttentionItem = {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  reasons: AttentionReason[];
  primaryLabel: string;
  detail: string;
  href: string;
  urgencyMinutes: number;
  /** ISO hold deadline when the item is hold-related. */
  expiresAt?: string;
};

export type BakeLine = {
  productName: string;
  variantLabel: string;
  quantity: number;
};

export type CapacityDay = {
  date: string;
  label: string;
  isToday: boolean;
  isTomorrow: boolean;
  closed: boolean;
  orderLimit: number;
  itemLimit: number;
  committedOrders: number;
  committedItems: number;
  holdOrders: number;
  holdItems: number;
};

export type SalesDay = {
  date: string;
  label: string;
  completedOrderValueCentavos: number;
  completedOrderCount: number;
};

export type Bestseller = {
  productName: string;
  variantLabel: string;
  quantity: number;
};

export type ActivityItem = {
  id: string;
  atLabel: string;
  summary: string;
  actor: string;
  href: string;
};

function pesos(centavos: number) {
  return `₱${(centavos / 100).toLocaleString("en-PH")}`;
}

export function formatPesos(centavos: number) {
  return pesos(centavos);
}

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

export function attentionReasonLabel(reason: AttentionReason) {
  return reasonLabels[reason];
}

/** Shared ops snapshot for all Overview variants. */
export function deriveOpsOverview() {
  const orders: OverviewOrder[] = [
    {
      id: "o-1048",
      orderNumber: "MK-1048",
      customerName: "Ana R.",
      itemSummary: "2× Buko · Standard",
      fulfillmentType: "pickup",
      slotLabel: "11:00 AM",
      slotSort: 1100,
      fulfillmentDate: BUSINESS_DATE,
      status: "preparing",
      paymentStatus: "paid",
      quoteStatus: "finalized",
      paymentMethod: "gcash",
      finalTotalCentavos: 98000,
      amountReceivedCentavos: 98000,
    },
    {
      id: "o-1049",
      orderNumber: "MK-1049",
      customerName: "Miguel T.",
      itemSummary: "1× Keylime · 1× Pecan",
      fulfillmentType: "delivery",
      slotLabel: "1:00 PM",
      slotSort: 1300,
      fulfillmentDate: BUSINESS_DATE,
      status: "confirmed",
      paymentStatus: "unpaid",
      quoteStatus: "finalized",
      paymentMethod: "cash",
      finalTotalCentavos: 56000,
      amountReceivedCentavos: 0,
    },
    {
      id: "o-1050",
      orderNumber: "MK-1050",
      customerName: "Liza C.",
      itemSummary: "3× S’mores · Birthday topper",
      fulfillmentType: "pickup",
      slotLabel: "3:00 PM",
      slotSort: 1500,
      fulfillmentDate: BUSINESS_DATE,
      status: "ready",
      paymentStatus: "paid",
      quoteStatus: "finalized",
      paymentMethod: "bank",
      finalTotalCentavos: 64200,
      amountReceivedCentavos: 64200,
    },
    {
      id: "o-1051",
      orderNumber: "MK-1051",
      customerName: "Jon P.",
      itemSummary: "1× Butter Chicken Curry pie",
      fulfillmentType: "pickup",
      slotLabel: "5:00 PM",
      slotSort: 1700,
      fulfillmentDate: BUSINESS_DATE,
      status: "confirmed",
      paymentStatus: "partially_paid",
      quoteStatus: "finalized",
      paymentMethod: "gcash",
      finalTotalCentavos: 45000,
      amountReceivedCentavos: 20000,
    },
    {
      id: "o-1042",
      orderNumber: "MK-1042",
      customerName: "Sofia M.",
      itemSummary: "1× Banoffee · Note card",
      fulfillmentType: "pickup",
      slotLabel: "12:00 PM",
      slotSort: 1200,
      fulfillmentDate: BUSINESS_DATE,
      status: "completed",
      paymentStatus: "paid",
      quoteStatus: "finalized",
      paymentMethod: "gcash",
      finalTotalCentavos: 25500,
      amountReceivedCentavos: 25500,
    },
    {
      id: "o-1038",
      orderNumber: "MK-1038",
      customerName: "Carlo D.",
      itemSummary: "2× Oreo",
      fulfillmentType: "pickup",
      slotLabel: "2:00 PM",
      slotSort: 1400,
      fulfillmentDate: "2026-09-23",
      status: "preparing",
      paymentStatus: "paid",
      quoteStatus: "finalized",
      paymentMethod: "bank",
      finalTotalCentavos: 38000,
      amountReceivedCentavos: 38000,
    },
    {
      id: "o-1052",
      orderNumber: "MK-1052",
      customerName: "Bea S.",
      itemSummary: "1× Buko · DM quote",
      fulfillmentType: "pickup",
      slotLabel: "Sat 11:00 AM",
      slotSort: 1100,
      fulfillmentDate: "2026-09-26",
      status: "requested",
      paymentStatus: "unpaid",
      quoteStatus: "pending",
      paymentMethod: "gcash",
      finalTotalCentavos: null,
      amountReceivedCentavos: 0,
      reservationExpiresAtLabel: "Today 6:40 PM",
      minutesToExpiry: 148,
    },
    {
      id: "o-1053",
      orderNumber: "MK-1053",
      customerName: "Nina V.",
      itemSummary: "4× Keylime",
      fulfillmentType: "delivery",
      slotLabel: "Fri 4:00 PM",
      slotSort: 1600,
      fulfillmentDate: "2026-09-25",
      status: "requested",
      paymentStatus: "unpaid",
      quoteStatus: "finalized",
      paymentMethod: "bank",
      finalTotalCentavos: 96000,
      amountReceivedCentavos: 0,
      reservationExpiresAtLabel: "Today 5:05 PM",
      minutesToExpiry: 53,
    },
  ];

  const todayOutstanding = orders
    .filter((o) => o.fulfillmentDate === BUSINESS_DATE && ["confirmed", "preparing", "ready"].includes(o.status))
    .sort((a, b) => a.slotSort - b.slotSort);

  const completedToday = orders.filter((o) => o.fulfillmentDate === BUSINESS_DATE && o.status === "completed");

  const itemsStillToPrepare = todayOutstanding
    .filter((o) => o.status === "confirmed" || o.status === "preparing")
    .reduce((sum, o) => sum + parseItemQty(o.itemSummary), 0);

  const readyToday = todayOutstanding.filter((o) => o.status === "ready").length;

  const attention = buildAttention(orders);

  const bakeSummary: BakeLine[] = [
    { productName: "Buko", variantLabel: "Standard", quantity: 2 },
    { productName: "Keylime", variantLabel: "Standard", quantity: 1 },
    { productName: "Pecan", variantLabel: "Standard", quantity: 1 },
    { productName: "Butter Chicken Curry pie", variantLabel: "Standard", quantity: 1 },
  ];

  const capacity: CapacityDay[] = [
    day("2026-09-24", "Thu 24", true, false, false, 12, 40, 5, 9, 1, 4),
    day("2026-09-25", "Fri 25", false, true, false, 12, 40, 4, 11, 2, 6),
    day("2026-09-26", "Sat 26", false, false, false, 14, 48, 6, 18, 1, 2),
    day("2026-09-27", "Sun 27", false, false, false, 14, 48, 3, 8, 0, 0),
    day("2026-09-28", "Mon 28", false, false, true, 12, 40, 0, 0, 0, 0),
    day("2026-09-29", "Tue 29", false, false, false, 12, 40, 2, 5, 1, 3),
    day("2026-09-30", "Wed 30", false, false, false, 12, 40, 1, 2, 0, 0),
  ];

  const moneyReceivedTodayCentavos = 187700;
  const refundsTodayCentavos = 0;
  const outstandingBalancesCentavos = 45000 - 20000; // MK-1051
  const collectionDueCentavos = 56000; // MK-1049 cash

  const salesDays: SalesDay[] = [
    { date: "2026-09-18", label: "Fri", completedOrderValueCentavos: 182000, completedOrderCount: 4 },
    { date: "2026-09-19", label: "Sat", completedOrderValueCentavos: 246000, completedOrderCount: 6 },
    { date: "2026-09-20", label: "Sun", completedOrderValueCentavos: 198000, completedOrderCount: 5 },
    { date: "2026-09-21", label: "Mon", completedOrderValueCentavos: 94000, completedOrderCount: 2 },
    { date: "2026-09-22", label: "Tue", completedOrderValueCentavos: 121000, completedOrderCount: 3 },
    { date: "2026-09-23", label: "Wed", completedOrderValueCentavos: 156000, completedOrderCount: 4 },
    { date: "2026-09-24", label: "Thu", completedOrderValueCentavos: 25500, completedOrderCount: 1 },
  ];

  const priorPeriodValueCentavos = 168000 + 210000 + 175000 + 88000 + 110000 + 142000 + 98000;
  const periodValueCentavos = salesDays.reduce((s, d) => s + d.completedOrderValueCentavos, 0);
  const periodCount = salesDays.reduce((s, d) => s + d.completedOrderCount, 0);
  const priorPeriodCount = 4 + 5 + 4 + 2 + 3 + 3 + 2;
  const elapsedDays = 7;
  const comparisonLabel = `vs prior ${elapsedDays} days`;
  const valueDeltaPct =
    priorPeriodValueCentavos === 0
      ? null
      : Math.round(((periodValueCentavos - priorPeriodValueCentavos) / priorPeriodValueCentavos) * 1000) / 10;

  const bestsellers: Bestseller[] = [
    { productName: "Buko", variantLabel: "Standard", quantity: 18 },
    { productName: "Keylime", variantLabel: "Standard", quantity: 14 },
    { productName: "S’mores", variantLabel: "Standard", quantity: 11 },
    { productName: "Pecan", variantLabel: "Standard", quantity: 9 },
  ];

  const recentActivity: ActivityItem[] = [
    {
      id: "a1",
      atLabel: "4:08 PM",
      summary: "MK-1050 marked ready for pickup",
      actor: "Owner",
      href: "/admin/orders/o-1050",
    },
    {
      id: "a2",
      atLabel: "3:41 PM",
      summary: "Payment recorded · MK-1048 · GCash ₱980",
      actor: "Owner",
      href: "/admin/orders/o-1048",
    },
    {
      id: "a3",
      atLabel: "2:55 PM",
      summary: "New request MK-1053 · holds until 5:05 PM",
      actor: "System",
      href: "/admin/orders/o-1053",
    },
    {
      id: "a4",
      atLabel: "1:20 PM",
      summary: "MK-1042 completed",
      actor: "Owner",
      href: "/admin/orders/o-1042",
    },
    {
      id: "a5",
      atLabel: "12:02 PM",
      summary: "Quote finalized · MK-1049",
      actor: "Owner",
      href: "/admin/orders/o-1049",
    },
  ];

  const slots = groupBySlot(todayOutstanding);

  return {
    date: BUSINESS_DATE,
    dateLabel: BUSINESS_DATE_LABEL,
    timezone: TIMEZONE,
    lastRefresh: LAST_REFRESH_LABEL,
    glance: {
      ordersDue: todayOutstanding.length,
      itemsStillToPrepare,
      readyOrders: readyToday,
      moneyReceivedCentavos: moneyReceivedTodayCentavos,
      completedTodayCount: completedToday.length,
    },
    attention,
    todayOrders: todayOutstanding,
    completedToday,
    bakeSummary,
    capacity,
    payments: {
      moneyReceivedTodayCentavos,
      refundsTodayCentavos,
      outstandingBalancesCentavos,
      collectionDueCentavos,
    },
    sales: {
      rangeLabel: "Last 7 days",
      days: salesDays,
      completedOrderValueCentavos: periodValueCentavos,
      completedOrderCount: periodCount,
      averageOrderValueCentavos: Math.round(periodValueCentavos / periodCount),
      comparisonLabel,
      valueDeltaPct,
      priorPeriodValueCentavos,
      bestsellers,
    },
    recentActivity,
    slots,
    links: {
      ordersToday: `/admin/orders?date=${BUSINESS_DATE}`,
      kitchenToday: `/admin/kitchen?date=${BUSINESS_DATE}`,
      ordersReady: `/admin/orders?date=${BUSINESS_DATE}&status=ready`,
      ordersAttention: `/admin/orders?attention=1`,
      payments: `/admin/orders?payment=outstanding`,
    },
  };
}

export type OpsOverview = ReturnType<typeof deriveOpsOverview>;

/** True when Overview has no operational work to show (new / quiet account). Distinct from true zeros on a busy day. */
export function isOverviewEmpty(snapshot: OpsOverview) {
  return (
    snapshot.todayOrders.length === 0 &&
    snapshot.completedToday.length === 0 &&
    snapshot.attention.length === 0 &&
    snapshot.bakeSummary.length === 0 &&
    snapshot.recentActivity.length === 0 &&
    snapshot.glance.ordersDue === 0 &&
    snapshot.glance.itemsStillToPrepare === 0 &&
    snapshot.glance.readyOrders === 0
  );
}

/** Empty snapshot for first-run Overview until order services feed real data. */
export function deriveEmptyOpsOverview(now = dayjs().tz(TIMEZONE)): OpsOverview {
  const date = now.format("YYYY-MM-DD");
  const dateLabel = now.format("dddd, D MMM YYYY");
  return {
    date,
    dateLabel,
    timezone: TIMEZONE,
    lastRefresh: "Waiting for first order",
    glance: {
      ordersDue: 0,
      itemsStillToPrepare: 0,
      readyOrders: 0,
      moneyReceivedCentavos: 0,
      completedTodayCount: 0,
    },
    attention: [],
    todayOrders: [],
    completedToday: [],
    bakeSummary: [],
    capacity: [],
    payments: {
      moneyReceivedTodayCentavos: 0,
      refundsTodayCentavos: 0,
      outstandingBalancesCentavos: 0,
      collectionDueCentavos: 0,
    },
    sales: {
      rangeLabel: "Last 7 days",
      days: [],
      completedOrderValueCentavos: 0,
      completedOrderCount: 0,
      averageOrderValueCentavos: 0,
      comparisonLabel: "vs prior 7 days",
      valueDeltaPct: null,
      priorPeriodValueCentavos: 0,
      bestsellers: [],
    },
    recentActivity: [],
    slots: [],
    links: {
      ordersToday: `/admin/orders?date=${date}`,
      kitchenToday: `/admin/kitchen?date=${date}`,
      ordersReady: `/admin/orders?date=${date}&status=ready`,
      ordersAttention: `/admin/orders?attention=1`,
      payments: `/admin/orders?payment=outstanding`,
    },
  };
}

export const emptyOpsOverview = deriveEmptyOpsOverview();

function parseItemQty(summary: string) {
  const matches = summary.matchAll(/(\d+)×/g);
  let total = 0;
  for (const m of matches) total += Number(m[1]);
  return total || 1;
}

function day(
  date: string,
  label: string,
  isToday: boolean,
  isTomorrow: boolean,
  closed: boolean,
  orderLimit: number,
  itemLimit: number,
  committedOrders: number,
  committedItems: number,
  holdOrders: number,
  holdItems: number,
): CapacityDay {
  return {
    date,
    label,
    isToday,
    isTomorrow,
    closed,
    orderLimit,
    itemLimit,
    committedOrders,
    committedItems,
    holdOrders,
    holdItems,
  };
}

function buildAttention(orders: OverviewOrder[]): AttentionItem[] {
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
      href: `/admin/orders/${order.id}`,
      urgencyMinutes,
    });
  }

  for (const o of orders) {
    if (o.status === "requested") {
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

    if (o.fulfillmentDate < BUSINESS_DATE && ["confirmed", "preparing", "ready"].includes(o.status)) {
      push(o, "past_fulfillment_window", `Was due ${o.fulfillmentDate} · still ${o.status}`, 0);
    }

    const balance = (o.finalTotalCentavos ?? 0) - o.amountReceivedCentavos;
    if (
      balance > 0 &&
      o.quoteStatus === "finalized" &&
      ["confirmed", "preparing", "ready", "completed"].includes(o.status)
    ) {
      if (o.paymentMethod === "cash" && o.fulfillmentDate >= BUSINESS_DATE && o.status !== "completed") {
        push(o, "collection_due", `Collect ${pesos(balance)} at ${o.fulfillmentType}`, 400 + balance / 100);
      } else if (!(o.paymentMethod === "cash" && o.fulfillmentDate >= BUSINESS_DATE)) {
        push(o, "outstanding_balance", `${pesos(balance)} still unpaid`, 200 + balance / 100);
      } else if (o.paymentMethod !== "cash") {
        push(o, "outstanding_balance", `${pesos(balance)} still unpaid`, 200 + balance / 100);
      }
    }
  }

  // Ensure MK-1049 cash shows collection due
  const cash = orders.find((o) => o.id === "o-1049");
  if (cash) {
    push(cash, "collection_due", "Collect ₱560 at delivery · cash on delivery", 450);
  }
  // MK-1051 partial
  const partial = orders.find((o) => o.id === "o-1051");
  if (partial) {
    push(partial, "outstanding_balance", "₱250 still unpaid after partial GCash", 250);
  }

  return [...map.values()].sort((a, b) => {
    const ra = reasonPriority[a.reasons[0]];
    const rb = reasonPriority[b.reasons[0]];
    if (ra !== rb) return ra - rb;
    return a.urgencyMinutes - b.urgencyMinutes;
  });
}

function groupBySlot(orders: OverviewOrder[]) {
  const groups = new Map<string, OverviewOrder[]>();
  for (const o of orders) {
    const list = groups.get(o.slotLabel) ?? [];
    list.push(o);
    groups.set(o.slotLabel, list);
  }
  return [...groups.entries()]
    .map(([slotLabel, list]) => ({
      slotLabel,
      slotSort: list[0]?.slotSort ?? 0,
      orders: list,
    }))
    .sort((a, b) => a.slotSort - b.slotSort);
}

export const opsOverview = deriveOpsOverview();
