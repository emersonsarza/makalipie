"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownWideNarrow, ArrowLeft, CalendarDays, Clock3, MapPin, MessageSquareText, Search, ShoppingBag, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { receiptLine, receiptAddon } from "@/lib/orders/receipt-line";
import { pesosToCentavos } from "@/lib/catalog/schema";
import { manilaDate } from "@/lib/catalog/rules";
import type { BranchSettings } from "@/lib/branches/schema";
import type { InboxOrder } from "@/lib/orders/schema";
import { orderStatusLabel } from "@/lib/orders/status-display";
import { addCalendarDays, slotsForDate } from "@/lib/scheduling/rules";
import type { ScheduleSettings } from "@/lib/scheduling/schema";

const STEPS = [
  { status: "requested", label: "Pending validation" },
  { status: "processing", label: "Processing" },
  { status: "confirmed", label: "Approved" },
  { status: "preparing", label: "Preparing" },
  { status: "ready", label: "Ready" },
  { status: "completed", label: "Completed" },
] as const;
const FILTERS = [
  { value: "all", label: "All fulfillment" },
  { value: "pickup", label: "Pickup" },
  { value: "lalamove", label: "Delivery" },
] as const;
const PAYMENT_OPTIONS = [
  { value: "bank", label: "Bank" },
  { value: "gcash", label: "GCash" },
  { value: "cash", label: "Cash" },
] as const;

function ChoiceSelect({ label, value, onChange, options, className }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  className?: string;
}) {
  const items = Object.fromEntries(options.map((option) => [option.value, option.label]));
  return (
    <Select value={value} items={items} onValueChange={(next) => { if (next != null) onChange(String(next)); }}>
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
const STAGES = [
  { value: "all", label: "All" },
  { value: "awaiting", label: "Awaiting" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "closed", label: "Closed" },
] as const;
type Stage = (typeof STAGES)[number]["value"];
type SheetAction = "processing" | "approve" | "reject" | "pay" | "preparing" | "ready" | "complete" | "deliverable" | "delivered" | "reopen" | "reorder";
type RecoveryReview = {
  clear: boolean;
  blockers: string[];
  priceChanges: { from: string; to: string }[];
  unavailableLines: { productId: string; variantId: string; label: string }[];
};
type ActExtras = { reason?: string; method?: InboxOrder["payment"]; amountCentavos?: number; kind?: "payment" | "refund"; branchId?: string; slotId?: string; selection?: InboxOrder["selection"]; feeCentavos?: number; idempotencyKey?: string; reopenKey?: string };
type DraftLine = NonNullable<InboxOrder["selection"]>["lines"][number] & { name: string; size: string };

function revisable(status: InboxOrder["status"]) {
  return status === "requested" || status === "processing" || status === "confirmed" || status === "preparing" || status === "ready";
}

function balanceOf(order: InboxOrder) {
  if (order.finalTotalCentavos === null) return null;
  return order.finalTotalCentavos - order.netReceivedCentavos;
}

function draftLines(order: InboxOrder): DraftLine[] {
  return (order.selection?.lines ?? []).map((line, index) => {
    const item = lineParts(order.lines[index] ?? "");
    return { ...line, name: item.name, size: item.size };
  });
}

function historyText(event: InboxOrder["events"][number], delivery: InboxOrder["delivery"] = "pickup") {
  if (event.action === "revise") {
    const detail = event.changes?.map((change) => `${change.field} ${change.from} to ${change.to}`).join(" · ");
    return `Revised${detail ? ` · ${detail}` : ""}`;
  }
  if (event.action === "settle") return `Settlement recorded${event.reason ? ` · ${event.reason}` : ""}`;
  if (event.action === "deliverable") {
    const detail = event.changes?.map((change) => `${change.field} ${change.from} to ${change.to}`).join(" · ");
    return `Address can be delivered${detail ? ` · ${detail}` : ""}`;
  }
  if (event.action === "delivered") return "Marked delivered";
  if (event.action === "reopen") return "Reopened";
  if (event.action === "reorder") {
    const detail = event.changes?.map((change) => `${change.field} ${change.from} to ${change.to}`).join(" · ");
    return `Reordered${detail ? ` · ${detail}` : ""}`;
  }
  return `${orderStatusLabel(event.previousStatus, delivery)} to ${orderStatusLabel(event.status, delivery)}`;
}

function stageFor(status: InboxOrder["status"]): Stage | null {
  if (status === "requested" || status === "processing") return "awaiting";
  if (status === "confirmed" || status === "preparing" || status === "ready") return "active";
  if (status === "completed") return "completed";
  if (status === "expired" || status === "cancelled") return "closed";
  return null;
}

function pesos(centavos: number) {
  return `₱${(centavos / 100).toFixed(2)}`;
}
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateParts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return {
    day: `${MONTHS[month - 1]} ${day}`,
    weekday: WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()],
  };
}

function deadlineLabel(iso: string) {
  const shifted = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
  if (Number.isNaN(shifted.getTime())) return iso;
  const hours = shifted.getUTCHours();
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  const minute = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[shifted.getUTCMonth()]} ${shifted.getUTCDate()}, ${hour12}:${minute} ${suffix}`;
}

function lineParts(line: string) {
  const head = line.split("\n")[0];
  const stored = head.match(/^(\d+)\s×\s(.+?)\s·\s([^()]+?)(?:\s*\(|$)/);
  if (stored) return { quantity: Number(stored[1]), name: stored[2].trim(), size: stored[3].trim() };
  const shaped = head.match(/^(.+?),\s(.+?)\s×\s(\d+)$/);
  if (shaped) return { quantity: Number(shaped[3]), name: shaped[1].trim(), size: shaped[2].trim() };
  return { quantity: 1, name: head, size: "" };
}

function branchName(branches: BranchSettings, branchId: string) {
  return branches.branches.find((branch) => branch.id === branchId)?.name ?? branchId;
}

function bySchedule(a: InboxOrder, b: InboxOrder) {
  return a.fulfillmentDate.localeCompare(b.fulfillmentDate) || a.slotId.localeCompare(b.slotId) || a.orderNumber.localeCompare(b.orderNumber);
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableValue(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function mergeOrders(current: InboxOrder[], next: InboxOrder[]) {
  const previous = new Map(current.map((order) => [order.id, order]));
  let changed = current.length !== next.length;
  const merged = next.map((order) => {
    const existing = previous.get(order.id);
    if (existing && stableValue(existing) === stableValue(order)) return existing;
    changed = true;
    return order;
  });
  if (!changed && merged.every((order, index) => order === current[index])) return current;
  return merged;
}

export function OrderInbox({ initialOrders, branches, schedule, role }: { initialOrders: InboxOrder[]; branches: BranchSettings; schedule: ScheduleSettings; role: "owner" | "staff" }) {
  const [orders, setOrders] = useState(initialOrders);
  const [selectedId, setSelectedId] = useState(initialOrders[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [stage, setStage] = useState<Stage>("awaiting");
  const [listMode, setListMode] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const statusBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".admin-topbar");
    if (!header) return;
    const measure = () => pageRef.current?.style.setProperty("--orders-header-height", `${header.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const bar = statusBarRef.current;
    const active = bar?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!bar || !active) return;
    const left = active.offsetLeft - bar.offsetLeft;
    if (left < bar.scrollLeft) bar.scrollLeft = left;
    else if (left + active.offsetWidth > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = left + active.offsetWidth - bar.clientWidth;
  }, [stage]);
  const ordered = useMemo(() => [...orders].sort(bySchedule), [orders]);
  const staged = ordered.filter((order) => stage === "all" || stageFor(order.status) === stage);

  function applyOrders(next: InboxOrder[]) {
    setOrders((current) => mergeOrders(current, next));
    setSelectedId((current) => next.some((order) => order.id === current) ? current : next[0]?.id ?? "");
  }

  async function fetchOrders() {
    const response = await fetch("/api/admin/orders", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load requests.");
    return data.orders as InboxOrder[];
  }

  async function reload() {
    setBusy(true);
    setError("");
    try {
      applyOrders(await fetchOrders());
    } catch (reloadError) {
      setError(reloadError instanceof Error ? reloadError.message : "Could not load requests.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let disposed = false;
    let timer = 0;
    async function poll() {
      try {
        const next = await fetchOrders();
        if (!disposed) applyOrders(next);
      } catch {
        // A later poll can fail without clearing the list already on screen.
      }
    }
    function schedule() {
      window.clearInterval(timer);
      if (document.visibilityState !== "visible") return;
      timer = window.setInterval(() => { void poll(); }, 15000);
    }
    function onShow() {
      if (document.visibilityState === "visible") void poll();
      schedule();
    }
    schedule();
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, []);

  function select(id: string) {
    setSelectedId(id);
    setListMode(false);
  }

  function applyOrder(updated: InboxOrder) {
    const nextStage = stageFor(updated.status);
    setOrders((current) => [updated, ...current.filter((order) => order.id !== updated.id)].filter((order) => stageFor(order.status)));
    if (nextStage) setStage((current) => current === "all" ? "all" : nextStage);
    setSelectedId(updated.id);
  }

  async function act(action: SheetAction | "revise" | "settle", extras?: ActExtras) {
    if (!selected) return false;
    setActing(true);
    setError("");
    try {
      const response = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: selected.id, action, expectedStatus: selected.status, ...extras }),
      });
      const data = await response.json();
      if (data.order) applyOrder(data.order as InboxOrder);
      if (!response.ok) {
        if (!data.order) await reload();
        setError(data.error || "Could not update this request.");
        return false;
      }
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not update this request.");
      return false;
    } finally {
      setActing(false);
    }
  }

  const searched = staged.filter((order) => {
    const shop = branchName(branches, order.branchId);
    return `${order.orderNumber} ${order.customerName} ${shop}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  const visible = searched.filter((order) => (filter === "all" || order.delivery === filter) && (branchFilter === "all" || order.branchId === branchFilter));
  const selected = visible.find((order) => order.id === selectedId) ?? visible[0];
  const groups = new Map<string, InboxOrder[]>();
  for (const order of visible) {
    const list = groups.get(order.fulfillmentDate) ?? [];
    list.push(order);
    groups.set(order.fulfillmentDate, list);
  }
  const branchOptions = [
    { value: "all", label: "All branches" },
    ...branches.branches.filter((branch) => branch.visible).map((branch) => ({ value: branch.id, label: branch.name.replace(/^Makalipie /, "") })),
  ];

  return (
    <div className="orders-overview-page" ref={pageRef}>
      <div className="orders-status-toolbar">
        <div className="orders-status-tabs" role="group" aria-label="Filter by progress" ref={statusBarRef}>
          {STAGES.map(({ value, label }) => <Button key={value} type="button" variant="ghost" aria-pressed={stage === value} onClick={() => { setStage(value); setListMode(true); }}>
            {label}<span>{value === "all" ? ordered.length : ordered.filter((order) => stageFor(order.status) === value).length}</span>
          </Button>)}
        </div>
        <div className="orders-status-tools">
          <Button type="button" variant="outline" className="overview-finder-refresh" disabled={busy} onClick={() => void reload()}>{busy ? "Refreshing…" : "Refresh"}</Button>
          <ChoiceSelect label="Branch" value={branchFilter} options={branchOptions} className="orders-branch-filter" onChange={setBranchFilter} />
        </div>
      </div>
      {error ? <p className="orders-overview-error" role="alert">{error}</p> : null}
      <div className="catalog-workspace orders-overview-workspace" data-detail={listMode ? "false" : "true"}>
        <aside className="catalog-finder-list" aria-label="Requests">
          <div className="overview-finder-tools">
            <div className="overview-finder-search">
              <Search size={16} aria-hidden="true" />
              <Input aria-label="Search requests" placeholder="Search name, order, or branch…" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <div className="orders-fulfillment-filter">
              <span>Fulfillment</span>
              <div className="min-w-0 flex-1">
                <ChoiceSelect label="Fulfillment" value={filter} options={FILTERS} onChange={(value) => setFilter(value as (typeof FILTERS)[number]["value"])} />
              </div>
            </div>
          </div>
          <div className="overview-finder-sort">
            <span><ArrowDownWideNarrow size={14} aria-hidden="true" />Fulfillment date</span>
            <span aria-live="polite">{visible.length} {visible.length === 1 ? "request" : "requests"}</span>
          </div>
          <nav className="overview-finder-groups" aria-label="Choose a request">
            {[...groups.entries()].map(([day, dayOrders]) => {
              const date = dateParts(day);
              return (
                <section key={day} aria-label={`${date.weekday}, ${date.day}`}>
                  <h3 className="overview-finder-day"><span>{date.weekday}, {date.day}</span><span>{dayOrders.length}</span></h3>
                  {dayOrders.map((order) => {
                    const DeliveryIcon = order.delivery === "pickup" ? ShoppingBag : Truck;
                    const quantity = order.lines.reduce((total, line) => total + lineParts(line).quantity, 0);
                    return (
                      <Button key={order.id} type="button" variant="ghost" className="overview-finder-order" aria-current={order.id === selected?.id ? "true" : undefined} onClick={() => select(order.id)}>
                        <span className="overview-finder-order-top"><span>{order.orderNumber}</span><OrderStatusBadge status={order.status} delivery={order.delivery} size="sm" /></span>
                        <span className="overview-finder-name"><span>{order.customerName || "No name"}</span><span>{order.slotLabel}</span></span>
                        <span className="overview-finder-order-bottom"><span><DeliveryIcon size={13} aria-hidden="true" />{order.delivery === "pickup" ? "Pickup" : "Delivery"} · {quantity} {quantity === 1 ? "pie" : "pies"}</span></span>
                      </Button>
                    );
                  })}
                </section>
              );
            })}
            {visible.length === 0 ? (
              <div className="overview-finder-empty">
                <Search size={22} aria-hidden="true" />
                <h3>{staged.length === 0 ? (stage === "all" ? "No orders" : stage === "active" ? "No active orders" : stage === "completed" ? "No completed orders" : stage === "closed" ? "No closed orders" : "No awaiting orders") : "No matching requests"}</h3>
                <p>{staged.length === 0 ? (stage === "awaiting" ? "New online requests will show up here." : "Requests appear here after they move to this step.") : "Try another name, order, or branch."}</p>
                {staged.length > 0 ? <Button type="button" variant="outline" onClick={() => { setQuery(""); setFilter("all"); setBranchFilter("all"); }}>Clear filters</Button> : null}
              </div>
            ) : null}
          </nav>
          <div className="overview-finder-footer">All times in Manila time</div>
        </aside>
        <div className="catalog-finder-detail orders-overview-detail" tabIndex={-1}>
          <Button type="button" className="catalog-mobile-back" variant="ghost" onClick={() => setListMode(true)}>
            <ArrowLeft aria-hidden />Back to requests
          </Button>
          {selected ? <OrderSheet order={selected} shop={branchName(branches, selected.branchId)} branches={branches} schedule={schedule} role={role} acting={acting} onAct={act} /> : (
            <p className="schedule-help">No order matches the current filters. Choose another status or adjust your search and fulfillment filter.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function OrderSheet({ order, shop, branches, schedule, role, acting, onAct }: {
  order: InboxOrder;
  shop: string;
  branches: BranchSettings;
  schedule: ScheduleSettings;
  role: "owner" | "staff";
  acting: boolean;
  onAct: (action: SheetAction | "revise" | "settle", extras?: ActExtras) => Promise<boolean>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState(order.payment);
  const [fee, setFee] = useState("");
  useEffect(() => {
    setRejecting(false);
    setReason("");
    setMethod(order.payment);
    setFee("");
  }, [order.id, order.status, order.payment, order.deliveryEligibility]);
  const steps = order.delivery === "lalamove"
    ? [...STEPS.filter((step) => step.status !== "ready" && step.status !== "completed"), { status: "completed" as const, label: "Delivered" }]
    : [...STEPS];
  const statusLabel = orderStatusLabel(order.status, order.delivery);
  const date = dateParts(order.fulfillmentDate);
  const DeliveryIcon = order.delivery === "pickup" ? ShoppingBag : Truck;
  const initials = order.customerName.split(" ").filter(Boolean).map((name) => name[0]).slice(0, 2).join("");
  const phone = order.contact.replaceAll(" ", "");
  const closed = order.status === "cancelled" || order.status === "expired";
  const current = steps.findIndex((step) => step.status === order.status);
  const due = balanceOf(order);
  const recorded = order.payments.find((payment) => payment.kind !== "refund");
  const areas = branches.branches.find((item) => item.id === order.branchId)?.areas ?? [];
  const feeCentavos = pesosToCentavos(fee);
  const awaitingFee = order.delivery === "lalamove" && order.deliveryEligibility !== "eligible";

  return (
    <article className="orders-overview" aria-labelledby="overview-number">
      <header className="orders-overview-header">
        <div>
          <p className="orders-overview-eyebrow">Order request</p>
          <h1 id="overview-number">{order.orderNumber}</h1>
          {order.sourceOrderNumber ? <p className="orders-overview-subtitle">Reordered from {order.sourceOrderNumber}</p> : null}
          <p className="orders-overview-subtitle">{order.customerName || "No name"} <span>·</span> {shop}</p>
        </div>
        <OrderStatusBadge status={order.status} delivery={order.delivery} size="md" className="orders-overview-badge" />
      </header>
      {closed || current < 0 ? (
        <p className="orders-overview-closed">{statusLabel}</p>
      ) : (
        <nav className="orders-overview-progress" aria-label="Request status">
          <ol>
            {steps.map((step, index) => (
              <li key={step.status} aria-current={index === current ? "step" : undefined}>
                <span className="orders-overview-step" aria-hidden="true">{index + 1}</span>
                <span>{step.label}</span>
              </li>
            ))}
          </ol>
        </nav>
      )}
      {(order.status === "expired" || order.status === "cancelled") && order.selection ? (
        <details className="orders-recovery-disclosure"><summary>Reopen or reorder this request</summary>
          <OrderRecovery order={order} branches={branches} schedule={schedule} role={role} acting={acting} onAct={onAct} />
        </details>
      ) : null}
      {order.status === "processing" && order.processingStartedAt ? (
        <p className="orders-overview-review">In review since {deadlineLabel(order.processingStartedAt)} Manila</p>
      ) : null}
      {recorded ? (
        <p className="orders-overview-review">Payment recorded · {pesos(recorded.amountCentavos)} · {recorded.method === "gcash" ? "GCash" : recorded.method === "bank" ? "Bank" : "Cash"}</p>
      ) : order.status === "confirmed" ? (
        <p className="orders-overview-review">Payment is not recorded yet.</p>
      ) : null}
      <div className="orders-payment-summary" aria-label="Payment summary">
        <div><span>Order total</span><strong>{order.finalTotalCentavos === null ? "To confirm" : pesos(order.finalTotalCentavos)}</strong></div>
        <div><span>Net received</span><strong>{pesos(order.netReceivedCentavos)}</strong></div>
        <div><span>{due !== null && due < 0 ? "Refund due" : "Amount due"}</span><strong>{due === null ? "To confirm" : pesos(Math.abs(due))}</strong></div>
        <div><span>Payment method</span><strong>{order.payment === "gcash" ? "GCash" : order.payment === "bank" ? "Bank transfer" : "Cash"}</strong></div>
      </div>
      {recorded && due !== null && due !== 0 && revisable(order.status) ? (
        <div className="orders-overview-actions">
          <div className="orders-overview-pay">
            <ChoiceSelect label="Settlement method" value={method} options={PAYMENT_OPTIONS} className="w-40" onChange={(value) => setMethod(value as InboxOrder["payment"])} />
            <Button type="button" disabled={acting} onClick={() => void onAct("settle", { kind: due > 0 ? "payment" : "refund", method, amountCentavos: Math.abs(due) })}>Record settlement {pesos(Math.abs(due))}</Button>
          </div>
        </div>
      ) : null}
      {order.status === "requested" || order.status === "processing" || order.status === "confirmed" || order.status === "preparing" || (order.delivery === "pickup" && order.status === "ready") ? (
        <div className="orders-overview-actions">
          {order.status === "requested" ? (
            <Button type="button" disabled={acting} onClick={() => void onAct("processing")}>Start processing</Button>
          ) : null}
          {order.status === "processing" && !awaitingFee ? (
            <Button type="button" disabled={acting} onClick={() => void onAct("approve")}>Approve</Button>
          ) : null}
          {awaitingFee && (order.status === "requested" || order.status === "processing" || order.status === "confirmed") ? (
            <form className="orders-overview-pay" onSubmit={(event) => {
              event.preventDefault();
              if (!Number.isInteger(feeCentavos) || feeCentavos < 0) return;
              void onAct("deliverable", { feeCentavos });
            }}>
              <Input aria-label="Delivery fee in pesos" inputMode="decimal" placeholder="0.00" value={fee} onChange={(event) => setFee(event.target.value)} className="w-28" />
              <Button type="submit" disabled={acting || !Number.isInteger(feeCentavos) || feeCentavos < 0}>Address can be delivered</Button>
            </form>
          ) : null}
          {order.status === "confirmed" && order.paymentStatus !== "paid" && order.payments.length === 0 ? (
            <div className="orders-overview-pay">
              <ChoiceSelect label="Payment method" value={method} options={PAYMENT_OPTIONS} className="w-40" onChange={(value) => setMethod(value as InboxOrder["payment"])} />
              <Button type="button" disabled={acting || order.finalTotalCentavos === null} onClick={() => void onAct("pay", { method })}>Record payment{order.finalTotalCentavos === null ? "" : ` ${pesos(order.finalTotalCentavos)}`}</Button>
            </div>
          ) : null}
          {order.status === "confirmed" && order.paymentStatus === "paid" ? (
            <Button type="button" disabled={acting} onClick={() => void onAct("preparing")}>Start preparing</Button>
          ) : null}
          {order.delivery === "pickup" && order.status === "preparing" ? (
            <Button type="button" disabled={acting} onClick={() => void onAct("ready")}>Ready for pickup</Button>
          ) : null}
          {order.delivery === "pickup" && order.status === "ready" ? (
            <Button type="button" disabled={acting} onClick={() => void onAct("complete")}>Complete pickup</Button>
          ) : null}
          {order.delivery === "lalamove" && order.status === "preparing" ? (
            <Button type="button" disabled={acting} onClick={() => void onAct("delivered")}>Mark delivered</Button>
          ) : null}
          {order.status === "requested" || order.status === "processing" || order.status === "confirmed" ? (
            rejecting ? (
              <form className="orders-overview-reject" onSubmit={(event) => {
                event.preventDefault();
                if (!reason.trim()) return;
                void onAct("reject", { reason: reason.trim() }).then((ok) => { if (ok) { setRejecting(false); setReason(""); } });
              }}>
                <Textarea aria-label="Reason for rejecting this request" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} required placeholder="Why is this request being rejected?" />
                <Button type="submit" variant="outline" disabled={acting || !reason.trim()}>Reject request</Button>
                <Button type="button" variant="ghost" disabled={acting} onClick={() => { setRejecting(false); setReason(""); }}>Keep request</Button>
              </form>
            ) : (
              <Button type="button" variant="outline" disabled={acting} onClick={() => setRejecting(true)}>Reject</Button>
            )
          ) : null}
        </div>
      ) : null}
      <div className="orders-overview-body">
        <section className="orders-overview-fulfillment" aria-labelledby="overview-fulfillment">
          <div className="orders-overview-section-heading">
            <h2 id="overview-fulfillment">Fulfillment</h2>
            <span><DeliveryIcon size={14} aria-hidden="true" />{order.delivery === "pickup" ? "Pickup" : "Delivery"}</span>
          </div>
          <div className="orders-overview-schedule">
            <div className="orders-overview-calendar" aria-hidden="true"><span>{date.day.split(" ")[0]}</span><strong>{date.day.split(" ")[1]}</strong></div>
            <div><h3>{date.weekday}, {date.day}</h3><p>{order.slotLabel} <span>· Manila time</span></p>{order.preparationDays > 0 ? <p>Needs {order.preparationDays} {order.preparationDays === 1 ? "day" : "days"} of preparation.</p> : null}</div>
          </div>
          <div className="orders-overview-location">
            <MapPin size={16} aria-hidden="true" />
            <div>
              <strong>{order.delivery === "pickup" ? shop : order.address || shop}</strong>
              <p>{order.delivery === "pickup" ? "Customer picks up at the branch" : `Dispatch from ${shop}`}</p>
              {order.delivery === "lalamove" && order.deliveryFeeCentavos !== null && order.deliveryFeeCentavos !== undefined ? <p>Delivery fee · {pesos(order.deliveryFeeCentavos)}</p> : null}
              {order.delivery === "lalamove" && areas.length ? <p>Areas for reference: {areas.join(", ")}</p> : null}
            </div>
          </div>
        </section>
        <section className="orders-overview-items" aria-labelledby="overview-items">
          <div className="orders-overview-section-heading">
            <h2 id="overview-items">Order items</h2>
            <span>{order.lines.length} {order.lines.length === 1 ? "line item" : "line items"}</span>
          </div>
          {order.lines.length ? (
            <ul>
              {order.lines.map((line, index) => {
                const item = receiptLine(line);
                return (
                  <li key={`${line}-${index}`}>
                    <div className="orders-item-description">
                      {item ? <><strong>{item.title} <span>· {item.size}</span></strong><small>{item.quantity} {item.quantity === 1 ? "pc" : "pcs"}{item.unitAmount ? ` · ${item.unitAmount} each` : ""}</small>{item.extras ? <p>{item.extras}</p> : null}</> : <strong>{line}</strong>}
                    </div>
                    {item ? <strong className="orders-item-amount">{item.amount}</strong> : null}
                  </li>
                );
              })}
            </ul>
          ) : <p className="orders-overview-missing">No items recorded.</p>}
          {order.addonLines.length > 0 ? <div className="orders-overview-addons"><span>Add-ons</span><ul>{order.addonLines.map((line, index) => {
            const addon = receiptAddon(line);
            return <li key={index}><span>{addon?.title ?? line}</span>{addon ? <strong className="orders-item-amount">{addon.amount}</strong> : null}</li>;
          })}</ul></div> : null}
          <div className="orders-items-total"><span>Order total</span><strong>{order.finalTotalCentavos === null ? "To confirm" : pesos(order.finalTotalCentavos)}</strong></div>
          {order.selection && revisable(order.status) ? (
            <details className="orders-revision-disclosure"><summary>Revise request</summary>
              <OrderRevision order={order} branches={branches} schedule={schedule} role={role} acting={acting} onRevise={(selection, nextBranch, nextSlot) => onAct("revise", { selection, branchId: nextBranch, slotId: nextSlot })} />
            </details>
          ) : null}
        </section>
        <section className="orders-overview-customer" aria-labelledby="overview-customer">
          <h2 id="overview-customer">Customer</h2>
          <div className="orders-overview-person">
            <span className="orders-overview-avatar" aria-hidden="true">{initials || "?"}</span>
            <div>
              <strong>{order.customerName || "No name"}</strong>
              {phone ? <a href={`tel:${phone}`}>{order.contact}</a> : <p>No contact recorded.</p>}
            </div>
          </div>
        </section>
        <section className="orders-overview-notes" aria-labelledby="overview-notes">
          <h2 id="overview-notes"><MessageSquareText size={15} aria-hidden="true" />Customer note</h2>
          <p>{order.notes || "No special instructions."}</p>
        </section>
      </div>
      {order.events.length ? (
        <section className="orders-overview-history" aria-labelledby="overview-history">
          <h2 id="overview-history">History</h2>
          <ol>
            {[...order.events].reverse().map((event, index) => (
              <li key={`${event.at}-${event.action}-${index}`}>
                <span>{deadlineLabel(event.at)}</span>
                {historyText(event, order.delivery)}
                {event.actorUid === "system" ? " · Automatic" : event.actorUid === "customer" ? " · Customer" : " · Staff"}
                {event.action === "revise" || event.action === "settle" || event.action === "deliverable" || event.action === "delivered" ? "" : event.reason ? ` · ${event.reason}` : ""}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <footer className="orders-overview-deadline">
        <Clock3 size={16} aria-hidden="true" />
        <p><strong>Hold deadline</strong><span>{deadlineLabel(order.deadline)} · Manila time</span></p>
        <CalendarDays size={16} aria-hidden="true" />
      </footer>
    </article>
  );
}

function OrderRecovery({ order, branches, schedule, role, acting, onAct }: {
  order: InboxOrder;
  branches: BranchSettings;
  schedule: ScheduleSettings;
  role: "owner" | "staff";
  acting: boolean;
  onAct: (action: "reopen" | "reorder", extras?: ActExtras) => Promise<boolean>;
}) {
  const [original, setOriginal] = useState<RecoveryReview | null>(null);
  const [proposed, setProposed] = useState<RecoveryReview | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [branchId, setBranchId] = useState(order.branchId);
  const [date, setDate] = useState(order.fulfillmentDate);
  const [slotId, setSlotId] = useState(order.slotId);
  const [lines, setLines] = useState(() => draftLines(order));
  const idempotencyKey = useRef("");
  const reopenKey = useRef("");
  useEffect(() => {
    setBranchId(order.branchId);
    setDate(order.fulfillmentDate);
    setSlotId(order.slotId);
    setLines(draftLines(order));
    idempotencyKey.current = crypto.randomUUID();
    reopenKey.current = crypto.randomUUID();
    setOriginal(null);
    setProposed(null);
  }, [order]);
  const slots = slotsForDate(schedule, branchId, date);
  const slotValue = slots.some((slot) => slot.id === slotId) ? slotId : slots[0]?.id ?? "";
  const today = manilaDate();
  const shops = branches.branches.filter((branch) => branch.visible);
  const selection = order.selection ? {
    date,
    lines: lines.map(({ productId, variantId, quantity, addons }) => ({ productId, variantId, quantity, addons })),
    addons: order.selection.addons,
  } : null;
  const lineKey = lines.map((line) => `${line.productId}:${line.variantId}:${line.quantity}`).join("|");
  useEffect(() => {
    if (!order.selection) return;
    let disposed = false;
    const proposal = {
      branchId,
      slotId: slotValue,
      selection: {
        date,
        lines: lines.map(({ productId, variantId, quantity, addons }) => ({ productId, variantId, quantity, addons })),
        addons: order.selection.addons,
      },
    };
    async function load(next?: typeof proposal) {
      const response = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, action: "review", expectedStatus: order.status, ...next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not review this request.");
      return data.review as RecoveryReview;
    }
    void load().then((review) => { if (!disposed) setOriginal(review); }).catch((error: unknown) => { if (!disposed) setReviewError(error instanceof Error ? error.message : "Could not review this request."); });
    if (slotValue) {
      void load(proposal).then((review) => { if (!disposed) setProposed(review); }).catch(() => { if (!disposed) setProposed(null); });
    }
    return () => { disposed = true; };
  }, [order.id, order.status, order.selection, branchId, date, slotValue, lineKey, lines]);
  if (!order.selection || !selection) return null;
  const shown = proposed ?? original;

  return (
    <div className="orders-overview-actions">
      {reviewError ? <p className="orders-overview-error" role="alert">{reviewError}</p> : null}
      {shown?.priceChanges.map((change) => <p key={change.from} className="orders-overview-review">{change.from} is now {change.to}</p>)}
      {shown?.unavailableLines.map((line) => <p key={`${line.productId}:${line.variantId}`} className="orders-overview-review">{line.label} is no longer on the menu.</p>)}
      {original?.blockers.map((blocker) => <p key={blocker} className="orders-overview-review">{blocker}</p>)}
      <Button type="button" disabled={acting || !original?.clear} onClick={() => void onAct("reopen", { reopenKey: reopenKey.current })}>Reopen</Button>
      <form className="orders-overview-edit" onSubmit={(event) => {
        event.preventDefault();
        if (!slotValue || lines.length < 1 || lines.some((line) => line.quantity < 1)) return;
        void onAct("reorder", { selection, branchId, slotId: slotValue, idempotencyKey: idempotencyKey.current });
      }}>
        <h3>Reorder</h3>
        {proposed && !proposed.clear && (date !== order.fulfillmentDate || branchId !== order.branchId || slotValue !== order.slotId) ? proposed.blockers.map((blocker) => <p key={blocker}>{blocker}</p>) : null}
        {lines.map((line, index) => (
          <div className="orders-overview-edit-line" key={`${line.productId}-${line.variantId}`}>
            <span><strong>{line.name}</strong>{line.size ? <small>{line.size}</small> : null}</span>
            <Input aria-label={`Quantity for ${line.name}`} type="number" min={1} max={100} value={line.quantity} onChange={(event) => {
              const quantity = Number(event.target.value);
              setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number.isInteger(quantity) ? quantity : item.quantity } : item));
            }} className="w-20" />
            <Button type="button" variant="ghost" disabled={acting || lines.length === 1} onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
          </div>
        ))}
        <div className="orders-overview-edit-when">
          {role === "owner" ? (
            <ChoiceSelect label="Branch" value={branchId} options={shops.map((branch) => ({ value: branch.id, label: branch.name }))} onChange={setBranchId} />
          ) : null}
          <div className="orders-overview-edit-slot">
            <Input aria-label="Fulfillment date" type="date" min={today} max={addCalendarDays(today, schedule.bookingHorizonDays)} value={date} onChange={(event) => setDate(event.target.value)} />
            {slots.length > 0 ? <ChoiceSelect label="Time slot" value={slotValue} options={slots.map((slot) => ({ value: slot.id, label: slot.label }))} onChange={setSlotId} /> : null}
          </div>
        </div>
        {slots.length === 0 ? <p>That date has no open time.</p> : null}
        <Button type="submit" variant="outline" disabled={acting || slots.length === 0 || lines.some((line) => line.quantity < 1) || proposed?.clear === false}>Confirm reorder</Button>
      </form>
    </div>
  );
}

function OrderRevision({ order, branches, schedule, role, acting, onRevise }: {
  order: InboxOrder;
  branches: BranchSettings;
  schedule: ScheduleSettings;
  role: "owner" | "staff";
  acting: boolean;
  onRevise: (selection: NonNullable<InboxOrder["selection"]>, branchId: string, slotId: string) => Promise<boolean>;
}) {
  const [branchId, setBranchId] = useState(order.branchId);
  const [date, setDate] = useState(order.fulfillmentDate);
  const [slotId, setSlotId] = useState(order.slotId);
  const [lines, setLines] = useState(() => draftLines(order));
  useEffect(() => {
    setBranchId(order.branchId);
    setDate(order.fulfillmentDate);
    setSlotId(order.slotId);
    setLines(draftLines(order));
  }, [order]);
  const slots = slotsForDate(schedule, branchId, date);
  const slotValue = slots.some((slot) => slot.id === slotId) ? slotId : slots[0]?.id ?? "";
  const today = manilaDate();
  const shops = branches.branches.filter((branch) => branch.visible);
  if (!order.selection) return null;

  return (
    <form className="orders-overview-edit" onSubmit={(event) => {
      event.preventDefault();
      if (!slotValue || lines.length < 1) return;
      void onRevise({
        date,
        lines: lines.map(({ productId, variantId, quantity, addons }) => ({ productId, variantId, quantity, addons })),
        addons: order.selection?.addons ?? [],
      }, branchId, slotValue);
    }}>
      <h3>Revise request</h3>
      {lines.map((line, index) => (
        <div className="orders-overview-edit-line" key={`${line.productId}-${line.variantId}`}>
          <span><strong>{line.name}</strong>{line.size ? <small>{line.size}</small> : null}</span>
          <Input aria-label={`Quantity for ${line.name}`} type="number" min={1} max={100} value={line.quantity} onChange={(event) => {
            const quantity = Number(event.target.value);
            setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number.isInteger(quantity) ? quantity : item.quantity } : item));
          }} className="w-20" />
          <Button type="button" variant="ghost" disabled={acting || lines.length === 1} onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
        </div>
      ))}
      <div className="orders-overview-edit-when">
        {role === "owner" ? (
          <ChoiceSelect label="Branch" value={branchId} options={shops.map((branch) => ({ value: branch.id, label: branch.name }))} onChange={setBranchId} />
        ) : null}
        <div className="orders-overview-edit-slot">
          <Input aria-label="Fulfillment date" type="date" min={today} max={addCalendarDays(today, schedule.bookingHorizonDays)} value={date} onChange={(event) => setDate(event.target.value)} />
          {slots.length > 0 ? <ChoiceSelect label="Time slot" value={slotValue} options={slots.map((slot) => ({ value: slot.id, label: slot.label }))} onChange={setSlotId} /> : null}
        </div>
      </div>
      {slots.length === 0 ? <p>That date has no open time.</p> : null}
      <Button type="submit" variant="outline" disabled={acting || slots.length === 0 || lines.some((line) => line.quantity < 1)}>Save changes</Button>
    </form>
  );
}
