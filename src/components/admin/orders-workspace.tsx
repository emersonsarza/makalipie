"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import dayjs from "@/lib/dayjs";
import { Button } from "@/components/ui/button";
import { CalendarDays, Check, ChevronLeft, ChevronRight, CircleCheck, CircleX, Clock, CreditCard, MapPin, Pencil, Search, ShoppingBag, SlidersHorizontal, Truck, UserRound, Wallet, X } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin/admin-select";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { AdminOrder, OrderQueue } from "@/lib/orders/query";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { adminOrderQueueStorageKey, useAdminOrderQueue, useAdminQuery, useAdminFetch, useAdminBlocked, useAdminAccount } from "./query-provider";
import { adminQuery, invalidateAdmin } from "./query-cache";
import { pesos, writeOrder } from "./orders-data";
import { useOrderNotifications } from "./order-notifications";
import { DeliveryFeeEditor } from "./delivery-fee-editor";
import { useOrderActions, OrderActionButtonContent } from "./order-actions";
import { useSharedOrderEditor } from "./shared-order-editor";

const emptyQueues: OrderQueue[] = [];
const views = [{ id: "attention", name: "Needs attention" }, { id: "today", name: "Today" }, { id: "all", name: "All orders" }];
const queueGroups = [
  { id: "regular", name: "Regular branches" },
  { id: "active", name: "Active drops" },
  { id: "past", name: "Past drops" },
];

const detailActionsClass = "grid grid-cols-2 gap-2 pt-1 [&>button]:min-h-14 [&>button]:min-w-0 [&>button]:whitespace-normal [&>button]:px-2 [&>button]:text-center";

function OrderItemsHeader() {
  return <TableHeader className="bg-accent"><TableRow>
      <TableHead scope="col">Item</TableHead><TableHead scope="col" className="text-right">Qty</TableHead><TableHead scope="col" className="text-right">Amount</TableHead>
    </TableRow></TableHeader>;
}

function OrderDetailSkeleton({ order }: { order?: AdminOrder }) {
  const labels = [[MapPin, "Order queue"], [CalendarDays, "Fulfillment"], [Clock, "Submitted"], [UserRound, "Customer"]] as const;
  return <div aria-busy="true" className="space-y-5">
    <span role="status" className="sr-only">Loading order details</span>
    <div className="flex flex-wrap items-start justify-between gap-2">
      {order ? <h2 className="text-2xl font-semibold tracking-tight">{order.orderNumber}</h2> : <Skeleton className="h-8 w-36" />}
      {order ? <QueueStatuses order={order} /> : <div className="flex gap-1" aria-hidden>
        <Skeleton className="h-5 w-16 rounded-full" /><Skeleton className="h-5 w-16 rounded-full" />
      </div>}
    </div>
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-b pb-4 text-sm">
      {labels.map(([Icon, label]) => <div key={label} className="contents">
        <dt className="flex items-start gap-2 text-muted-foreground"><Icon className="mt-0.5 size-4 shrink-0" aria-hidden />{label}</dt>
        <dd className="min-w-0 space-y-2 pt-0.5">
          <Skeleton className="h-4 w-40 max-w-full" />
          {label === "Customer" && <Skeleton className="h-4 w-28 max-w-full" />}
        </dd>
      </div>)}
    </dl>
    <Table aria-label="Order items">
      <OrderItemsHeader />
      <TableBody aria-hidden>{[0, 1].map(row => <TableRow key={row}>
        <TableCell><Skeleton className="h-4 w-28 max-w-full" /></TableCell>
        <TableCell><Skeleton className="ml-auto h-4 w-5" /></TableCell>
        <TableCell><Skeleton className="ml-auto h-4 w-16" /></TableCell>
      </TableRow>)}</TableBody>
    </Table>
    <div className="grid gap-3 border-t pt-4">
      {order?.deliveryFeeMode === "known" && <dl className="grid gap-1 text-sm text-muted-foreground">
        <div className="flex justify-between"><dt>Subtotal</dt><dd><Skeleton className="h-4 w-16" /></dd></div>
        <div className="flex justify-between"><dt>Delivery fee</dt><dd><Skeleton className="h-4 w-16" /></dd></div>
      </dl>}
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold">{order?.deliveryFeeMode === "unknown" ? "Subtotal" : "Total"}</span>
        <Skeleton className="h-7 w-24" />
      </div>
      {order?.fulfillment === "delivery" && order.payment === "unpaid"
        && (order.status === "pending" || order.status === "confirmed") && <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,6rem)_auto] items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm">
          <Switch disabled checked={order.deliveryFeeMode === "rider"} aria-label="Customer pays the driver instead" />
          Customer pays the driver instead
        </span>
        <Skeleton className="h-8 w-full" />
        <Button disabled>{order.deliveryFeeMode === "unknown" ? "Add" : "Save"}</Button>
      </div>}
    </div>
    <div className={detailActionsClass}>
      <Button disabled>{!order || order.status === "pending" ? "Confirm order" : "Complete order"}</Button>
      <Button variant="outline" disabled><Check aria-hidden />{order?.payment === "paid" ? "Mark refunded" : order?.payment === "refunded" ? "Refund recorded" : "Mark paid"}</Button>
      <Button variant="outline" disabled><Pencil aria-hidden /> Edit order</Button>
      <Button variant="destructive" disabled><X aria-hidden /> Cancel order</Button>
    </div>
  </div>;
}
const emptyFilters = { q: "", date: "", status: "", payment: "", fulfillment: "" };
type Results = { page: number; pageSize: number; total: number; orders: AdminOrder[] };

type QueueExit = {
  order: AdminOrder;
  index: number;
  key: string;
  status: "completed" | "cancelled";
};

function DeliveryFeeInfo({ mode }: { mode: "unknown" | "rider" }) {
  const pending = mode === "unknown";
  const Icon = pending ? Clock : Wallet;
  const title = pending ? "Delivery fee pending" : "Customer pays rider";
  const description = pending
    ? "Amount shown excludes the delivery fee."
    : "The customer pays the delivery fee directly to the rider.";
  const content = <>
    <p className="font-semibold">{title}</p>
    <p className="text-xs text-muted-foreground">{description}</p>
  </>;
  const tone = pending
    ? "bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900"
    : "bg-sky-50 text-sky-800 hover:bg-sky-100 hover:text-sky-900";
  const trigger = <Button type="button" variant="ghost" size="icon-xs" aria-label={`${title}. ${description}`} className={`pointer-events-auto ${tone}`}><Icon className="size-3.5" aria-hidden="true" /></Button>;

  return <>
    <span className="inline-flex [@media(hover:none)]:hidden">
      <HoverCard>
        <HoverCardTrigger render={trigger} />
        <HoverCardContent side="top" align="start" className="admin-theme motion-reduce:animate-none">{content}</HoverCardContent>
      </HoverCard>
    </span>
    <span className="hidden [@media(hover:none)]:inline-flex">
      <Popover>
        <PopoverTrigger render={trigger} />
        <PopoverContent side="top" align="start" className="admin-theme w-64 gap-1">{content}</PopoverContent>
      </Popover>
    </span>
  </>;
}

const neutralBadgeTone = "border-neutral-300 bg-[#F4F4F5] text-[#52525B]";
const orderBadgeTones: Record<string, string> = {
  pending: "border-[#E5D4B1] bg-[#FBF5E8] text-[#754B14]",
  confirmed: "border-[#CBD9E8] bg-[#EDF3F9] text-[#355375]",
  completed: "border-[#D4DAE0] bg-[#F2F4F6] text-[#414954]",
  cancelled: "border-[#EAC8CD] bg-[#FBEEEE] text-[#873A45]",
};
const paymentBadgeTones: Record<string, string> = {
  unpaid: neutralBadgeTone,
  paid: "border-[#C9DBCB] bg-[#ECF4EC] text-[#355A3C]",
  refunded: "border-[#DACDE6] bg-[#F3EFF7] text-[#62486F]",
};

function QueueStatuses({ order }: { order: AdminOrder }) {
  const StatusIcon = order.status === "pending" ? Clock : order.status === "cancelled" ? CircleX : CircleCheck;
  const badgeClass = "gap-1 px-1.5 text-[11px] font-medium normal-case tracking-normal";
  return <span className="flex flex-nowrap justify-end gap-1 whitespace-nowrap">
    <Badge className={`${badgeClass} ${orderBadgeTones[order.status] ?? neutralBadgeTone}`}><StatusIcon className="size-3" aria-hidden="true" /><span className="capitalize">{order.status}</span></Badge>
    <Badge className={`${badgeClass} ${paymentBadgeTones[order.payment] ?? neutralBadgeTone}`}>
      <CreditCard className="size-3" aria-hidden="true" /><span className="capitalize">{order.payment}</span>
    </Badge>
  </span>;
}

function OrderTotal({ order, detail = false }: { order: AdminOrder; detail?: boolean }) {
  return <span className={detail ? "block text-right" : "block"}>
    <span className={`block whitespace-nowrap font-semibold tabular-nums ${detail ? "text-xl" : "text-sm"}`}>{pesos(order.totalCentavos ?? order.subtotalCentavos)}</span>
    {order.deliveryFeeMode === "unknown" && <span className="block text-xs text-muted-foreground">Delivery fee pending</span>}
    {order.deliveryFeeMode === "rider" && <span className="block text-xs text-muted-foreground">Customer pays rider</span>}
  </span>;
}

function fulfillment(order: AdminOrder) {
  return [order.fulfillment === "delivery" ? "Delivery" : "Pickup", dayjs(order.fulfillmentDate).format("MMM D, YYYY"),
    order.windowStarts ? [order.windowStarts, order.windowEnds].filter(Boolean).join("–") : order.slotId].filter(Boolean).join(" · ");
}

export function OrdersWorkspace({ directOrderId }: { directOrderId?: string }) {
  const [view, setView] = useState("attention");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(emptyFilters);
  const account = useAdminAccount();
  const queryClient = useQueryClient();
  const fetchAdmin = useAdminFetch();
  const blocked = useAdminBlocked();
  const queuesQuery = useAdminQuery<OrderQueue[]>("/api/admin/orders/queues");
  const queues = queuesQuery.data ?? emptyQueues;
  const queueError = queuesQuery.isError ? "Could not load order queues." : "";
  const queueLabelId = useId();
  const { key: queue, setKey: setQueue } = useAdminOrderQueue();
  const queueKey = JSON.stringify([queue, view, page, filters]);
  const pendingExit = useRef<QueueExit | null>(null);
  const [exit, setExit] = useState<QueueExit>();
  const [selectedId, select] = useState("");
  const detailQuery = useAdminQuery<AdminOrder>("/api/admin/orders/" + encodeURIComponent(selectedId), !!selectedId);
  const detail = detailQuery.data;
  const [phoneDetail, setPhoneDetail] = useState(false);
  const { request, consumeRequest, editorOpen } = useOrderNotifications();
  const refresh = useCallback(() => { void invalidateAdmin(queryClient, "orders"); }, [queryClient]);
  const resultQueries = useQueries({ queries: views.map(option => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    params.set("queue", queue); params.set("view", option.id); params.set("page", option.id === view ? String(page) : "1");
    return { ...adminQuery<Results>(account, "/api/admin/orders?" + params), enabled: !!queue };
  }) });
  const result = resultQueries[views.findIndex(option => option.id === view)].data;
  const counts = Object.fromEntries(views.map((option, index) => [option.id, resultQueries[index].data?.total]));
  const error = resultQueries.some(query => query.isError) ? "Could not refresh orders. Displayed data may be outdated." : "";
  const [detailError, setDetailError] = useState("");
  const [actionError, setActionError] = useState("");
  const [working, setWorking] = useState(false);
  const editor = useSharedOrderEditor();
  const { queue: actionQueue, actions } = useOrderActions();
  const detailContainer = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = detailContainer.current;
    const cancelIfHidden = () => {
      if (document.hidden || !container?.getClientRects().length) actionQueue.undo(selectedId);
    };
    const observer = new ResizeObserver(cancelIfHidden);
    if (container) observer.observe(container);
    document.addEventListener("visibilitychange", cancelIfHidden);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", cancelIfHidden);
      actionQueue.undo(selectedId);
    };
  }, [actionQueue, selectedId]);
  const handledDirectOrder = useRef<string | undefined>(undefined);

  const openOrder = useCallback((id: string) => {
    select(id);
    setPhoneDetail(true);
    setActionError("");
    setDetailError("");
  }, []);

  const changeQueue = useCallback((key: string) => {
    setQueue(key);
    setPage(1);
    select("");
    setPhoneDetail(false);
    setActionError("");
    setDetailError("");
  }, []);

  useEffect(() => {
    if (!queues.length || queues.some(option => option.key === queue)) return;
    const frame = requestAnimationFrame(() => {
      let saved = "";
      try { saved = localStorage.getItem(adminOrderQueueStorageKey) ?? ""; } catch {}
      changeQueue(queues.some(option => option.key === saved) ? saved
        : queues.find(option => option.key === "regular:cebu")?.key ?? queues[0].key);
    });
    return () => cancelAnimationFrame(frame);
  }, [queues, queue, changeQueue]);

  useEffect(() => {
    if (!queues.some(option => option.key === queue)) return;
    try { localStorage.setItem(adminOrderQueueStorageKey, queue); } catch {}
  }, [queues, queue]);

  useEffect(() => {
    if (!directOrderId) handledDirectOrder.current = undefined;
    const linkedId = directOrderId !== handledDirectOrder.current ? directOrderId : undefined;
    const id = request?.id ?? linkedId;
    if (!id || !queue || editorOpen) return;
    const controller = new AbortController();
    void fetchAdmin<AdminOrder>("/api/admin/orders/" + encodeURIComponent(id)).then(order => {
      if (controller.signal.aborted) return;
      if (order.queueKey !== queue) changeQueue(order.queueKey);
      openOrder(order.id);
    }).catch(() => {
      if (controller.signal.aborted) return;
      openOrder(id);
      setDetailError("Could not open this order.");
    }).finally(() => {
      if (controller.signal.aborted) return;
      if (id === linkedId) handledDirectOrder.current = linkedId;
      if (request) consumeRequest();
    });
    return () => controller.abort();
  }, [request, directOrderId, queue, editorOpen, openOrder, changeQueue, consumeRequest, fetchAdmin]);

  useEffect(() => {
    if (!result) return;
    const frame = requestAnimationFrame(() => {
      const last = Math.max(1, Math.ceil(result.total / result.pageSize));
      const pending = pendingExit.current;
      if (pending && !result.orders.some(row => row.id === pending.order.id)) {
        pendingExit.current = null;
        if (pending.key === queueKey && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) setExit(pending);
        else if (page > last) setPage(last);
      } else if (!pending && page > last) setPage(last);
      select(previous => previous || result.orders[0]?.id || "");
    });
    return () => cancelAnimationFrame(frame);
  }, [result, page, queueKey]);

  async function transition(order: AdminOrder, status: string) {
    if (status === "paid" && order.status !== "confirmed") return;
    setWorking(true);
    setActionError("");
    try {
      await writeOrder("transition_order", { orderId: order.id, updatedAt: order.updatedAt, status });
    }
    catch (failure) { pendingExit.current = null; setActionError(failure instanceof Error ? failure.message : "Could not update the order."); }
    finally { setWorking(false); refresh(); }
  }

  useEffect(() => {
    const saving = actions.find(action => action.phase === "saving" && action.status !== "confirmed"
      && result?.orders.some(row => row.id === action.orderId));
    if (!saving) {
      if (actions.some(action => action.orderId === pendingExit.current?.order.id && action.phase === "error")) pendingExit.current = null;
      return;
    }
    const index = result!.orders.findIndex(row => row.id === saving.orderId);
    const source = result!.orders[index];
    const status = saving.status as "completed" | "cancelled";
    pendingExit.current = { order: { ...source, status, customerName: null, customerPhone: null, deliveryAddress: null, notes: null }, index, key: queueKey, status };
  }, [actions, result, queueKey]);

  const order = detail?.id === selectedId ? detail : undefined;
  const failedAction = actions.find(action => action.orderId === order?.id && action.phase === "error");
  const pendingAction = actions.find(action => action.orderId === order?.id && action.phase !== "error");
  const open = order?.status === "pending" || order?.status === "confirmed";
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const firstPage = Math.max(1, Math.min(page - 1, totalPages - 2));
  const pageNumbers = Array.from({ length: Math.min(3, totalPages) }, (_, index) => firstPage + index);

  const visibleRows = [...(result?.orders ?? [])];
  const visibleExit = exit?.key === queueKey && !visibleRows.some(row => row.id === exit.order.id) ? exit : undefined;
  if (visibleExit) visibleRows.splice(visibleExit.index, 0, visibleExit.order);

  const nextOrder = result?.orders[0];
  const firstRemainingId = nextOrder?.id ?? "";
  const selectedQueueOrder = result?.orders.find(row => row.id === selectedId);
  const detailLeaving = Boolean(order && visibleExit?.order.id === order.id);
  useLayoutEffect(() => {
    if (!order || editorOpen || detailLeaving) actionQueue.undo(selectedId);
  }, [actionQueue, selectedId, order, editorOpen, detailLeaving]);
  const detailPanelClass = "min-w-0 space-y-5 rounded-lg border bg-white p-4 shadow-sm sm:p-6";
  const finishExit = useCallback(() => {
    if (!visibleExit) return;
    setExit(undefined);
    select(previous => previous === visibleExit.order.id ? firstRemainingId : previous);
    if (page > totalPages) setPage(totalPages);
  }, [visibleExit, firstRemainingId, page, totalPages]);

  useEffect(() => {
    if (!visibleExit) return;
    const timeout = window.setTimeout(finishExit, 350);
    return () => window.clearTimeout(timeout);
  }, [visibleExit, finishExit]);

  const showPhoneDetail = phoneDetail && Boolean(selectedId);

  return <div className="space-y-4">
    {(queueError || error || actionError) && <Alert variant="destructive"><AlertDescription>{queueError || error || actionError} <Button variant="ghost" onClick={refresh}>Refresh</Button></AlertDescription></Alert>}
    <div className="grid items-start gap-5 xl:gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <section className={(showPhoneDetail ? "hidden lg:block " : "") + "min-w-0"} aria-label="Order list">
        <div className="mb-4 grid min-w-0 gap-1.5 text-sm font-medium sm:max-w-80">
          <span id={queueLabelId}>Order queue</span>
          <Select value={queue || null} disabled={!queues.length || editorOpen} onValueChange={value => { if (value) changeQueue(value); }}>
            <SelectTrigger aria-labelledby={queueLabelId} className="min-w-0 bg-background">
              <SelectValue placeholder={queueError ? "Queues unavailable" : "Loading queues…"}>
                {queues.find(option => option.key === queue)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} className="admin-theme motion-reduce:animate-none">
              {queueGroups.map(group => {
                const options = queues.filter(option => option.group === group.id);
                return options.length > 0 && <SelectGroup key={group.id}>
                  <SelectLabel>{group.name}</SelectLabel>
                  {options.map(option => <SelectItem key={option.key} value={option.key} label={option.label}>
                    <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">{option.label}</span>
                  </SelectItem>)}
                </SelectGroup>;
              })}
            </SelectContent>
          </Select>
        </div>
        <Tabs value={view} onValueChange={value => { setView(value); setPage(1); }} className="space-y-4">
          <TabsList aria-label="Order views">
            {views.map(option => <TabsTrigger className="max-[359px]:px-1.5 max-[359px]:text-xs" key={option.id} value={option.id}>{option.name}{counts[option.id] != null ? " (" + counts[option.id] + ")" : ""}</TabsTrigger>)}
          </TabsList>
          {views.map(option => <TabsContent key={option.id} value={option.id} className="admin-panel-enter space-y-4">
        <div className="flex items-center gap-2">
        <form className="relative min-w-0 flex-1" onSubmit={event => { event.preventDefault(); setFilters(current => ({ ...current, q: search.trim().toUpperCase() })); setPage(1); }}>
          <Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} aria-label="Exact order number" placeholder="Order number" />
          <Button type="submit" variant="ghost" size="icon" aria-label="Search orders" className="absolute inset-y-0 left-0"><Search aria-hidden="true" /></Button>
        </form>
        <Popover>
          <PopoverTrigger render={<Button type="button" variant="outline" aria-label="Order filters" />}>
            <SlidersHorizontal aria-hidden="true" /> <span className="hidden sm:inline">Filters</span>
          </PopoverTrigger>
          <PopoverContent align="end" aria-label="Order filters" className="admin-theme w-[min(22rem,calc(100vw-2rem))] bg-white p-4">
            <h2 className="font-semibold">Filters</h2>
            <div className="-m-1 grid max-h-[60vh] gap-3 overflow-y-auto p-1">
          <label>Fulfillment date<Input type="date" value={filters.date} onChange={event => { setFilters(current => ({ ...current, date: event.target.value })); setPage(1); }} /></label>
          {([{ field: "status", label: "Order status", values: ["pending", "confirmed", "completed", "cancelled"] }, { field: "payment", label: "Payment status", values: ["unpaid", "paid", "refunded"] }, { field: "fulfillment", label: "Fulfillment method", values: ["pickup", "delivery"] }] as const).map(({ field, label, values }) => <label key={field}>{label}<AdminSelect label={label} value={filters[field]} onValueChange={value => {
            setFilters(current => ({ ...current, [field]: value }));
            setPage(1);
          }} options={[{ value: "", label: "Any" }, ...values.map(value => ({ value, label: value }))]} /></label>)}
          <Button variant="outline" onClick={() => { setFilters(emptyFilters); setSearch(""); setPage(1); }}>Clear filters</Button>
            </div>
          </PopoverContent>
        </Popover>
        </div>
        {!result && !error ? <Skeleton className="h-52" /> : visibleRows.length ? (
          <div className="@container [--order-queue-columns:minmax(0,1fr)_minmax(0,0.85fr)_11.5rem]">
            <div aria-hidden="true" className="hidden grid-cols-(--order-queue-columns) gap-3 px-3 pb-2 text-xs font-medium text-muted-foreground @md:grid">
              <span>Order</span><span>Fulfillment</span><span className="text-right">Amount</span>
            </div>
            <ul className="divide-y border-y bg-white [overflow-x:clip]">
              {visibleRows.map(row => {
                const anonymized = row.status === "completed" || row.status === "cancelled";
                const customer = anonymized ? "Anonymized" : row.customerName ?? "No customer name";
                const delivery = row.fulfillment === "delivery";
                const FulfillmentIcon = delivery ? Truck : ShoppingBag;
                const window = row.windowStarts ? [row.windowStarts, row.windowEnds].filter(Boolean).join("–") : row.slotId;
                const leaving = visibleExit?.order.id === row.id ? visibleExit.status : undefined;
                return <li key={row.id} data-exit={leaving} aria-hidden={leaving ? true : undefined} inert={!!leaving}
                  className="admin-queue-row" onAnimationEnd={event => {
                    if (leaving && event.target === event.currentTarget) finishExit();
                  }}>
                  <div className="admin-queue-row-body relative isolate grid min-h-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-3 py-3 @md:grid-cols-(--order-queue-columns)">
                  <button
                    type="button"
                    aria-label={`Open order ${row.orderNumber}, ${customer}`}
                    aria-pressed={selectedId === row.id}
                    onClick={() => openOrder(row.id)}
                    className="absolute inset-0 -z-10 w-full transition-colors before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-transparent hover:bg-accent/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-pressed:bg-accent aria-pressed:before:bg-primary motion-reduce:transition-none"
                  />
                  <div className="pointer-events-none min-w-0 space-y-1">
                    <p className="break-words text-sm font-semibold">{row.orderNumber}</p>
                    <p className="break-words text-xs text-muted-foreground">{customer}</p>
                  </div>
                  <div className="pointer-events-none col-start-1 row-start-2 min-w-0 @md:col-start-2 @md:row-start-1">
                    <div className="flex min-h-6 items-center gap-1.5 text-sm font-medium">
                      <FulfillmentIcon className="size-4 shrink-0" aria-hidden="true" />
                      {delivery ? "Delivery" : "Pickup"}
                      {delivery && (row.deliveryFeeMode === "unknown" || row.deliveryFeeMode === "rider") && <DeliveryFeeInfo mode={row.deliveryFeeMode} />}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{dayjs(row.fulfillmentDate).format("MMM D")}{window && " · " + window}</p>
                  </div>
                  <div className="pointer-events-none col-start-2 row-span-2 row-start-1 min-w-0 space-y-1 text-right @md:col-start-3 @md:row-span-1">
                    <p className="whitespace-nowrap text-sm font-semibold tabular-nums">{pesos(row.totalCentavos ?? row.subtotalCentavos)}</p>
                    <QueueStatuses order={row} />
                  </div>
                  </div>
                </li>;
              })}
            </ul>
          </div>
        ) : !error && <p className="border-y py-5 text-sm text-muted-foreground">No matching orders.</p>}
        {result && <nav aria-label="Order pagination" className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="outline" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft aria-hidden="true" /></Button>
            {pageNumbers.map(number => <Button key={number} size="icon-sm" variant={page === number ? "secondary" : "ghost"} aria-label={`Page ${number}`} aria-current={page === number ? "page" : undefined} onClick={() => setPage(number)}>{number}</Button>)}
            <Button size="icon-sm" variant="outline" aria-label="Next page" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight aria-hidden="true" /></Button>
          </div>
        </nav>}
          </TabsContent>)}
        </Tabs>
      </section>
      <div ref={detailContainer} className={(!showPhoneDetail ? "hidden lg:block " : "") + "relative min-w-0 [overflow-x:clip]"}>
        {detailLeaving && <div className={`absolute inset-x-0 top-0 ${detailPanelClass}`} data-order-detail-enter aria-hidden>
          {firstRemainingId || page > totalPages ? <OrderDetailSkeleton order={nextOrder} /> : <p>Select an order to view details.</p>}
        </div>}
      <section className={`relative ${detailPanelClass}`} aria-label="Order details"
        data-order-detail-exit={detailLeaving ? "" : undefined} inert={detailLeaving} aria-hidden={detailLeaving || undefined}
        onAnimationEnd={event => {
          if (event.target !== event.currentTarget) return;
          if (detailLeaving) finishExit();
        }}>
        <Button variant="outline" className="lg:hidden" onClick={() => { actionQueue.undo(selectedId); setPhoneDetail(false); }}>Back to orders</Button>
        {(detailError || detailQuery.isError) && !order ? <Alert variant="destructive"><AlertDescription>{detailError || "Could not load the selected order."}</AlertDescription></Alert> : order ? <>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">{order.orderNumber}</h2>
            <QueueStatuses order={order} />
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-b pb-4 text-sm">
            <dt className="flex items-start gap-2 text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Order queue</dt>
            <dd className="break-words font-medium">{order.sourceLabel}</dd>
            <dt className="flex items-start gap-2 text-muted-foreground"><CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Fulfillment</dt>
            <dd>{fulfillment(order)}</dd>
            <dt className="flex items-start gap-2 text-muted-foreground"><Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Submitted</dt>
            <dd>{dayjs(order.createdAt).tz("Asia/Manila").format("MMM D, YYYY h:mm A")}{order.submittedAfterHours ? " · After hours" : ""}</dd>
            <dt className="flex items-start gap-2 text-muted-foreground"><UserRound className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Customer</dt>
            <dd className="space-y-1 break-words">
              {open ? <><p className="font-medium">{order.customerName ?? "No customer name"}</p>
                {order.customerPhone && <p className="text-muted-foreground">{order.customerPhone}</p>}
                {order.deliveryAddress && <p className="text-muted-foreground">{order.deliveryAddress}</p>}
                {order.notes && <p className="whitespace-pre-wrap"><span className="font-medium">Notes:</span> {order.notes}</p>}
              </> : <span className="text-muted-foreground">Anonymized</span>}
            </dd>
          </dl>
          <Table aria-label="Order items">
            <OrderItemsHeader />
            <TableBody>{[...order.lines, ...order.addons.map(addon => ({ ...addon, components: [] }))].map(item => (
              <TableRow key={item.id}>
                <TableCell className="whitespace-normal"><span className="font-medium">{item.name}</span>
                  {item.components.map((part, index) => <p key={index} className="text-xs text-muted-foreground">{part.quantity} × {part.name} per package</p>)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                <TableCell className="text-right tabular-nums">{pesos(item.quantity * item.unitPriceCentavos)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
          <div className="grid gap-3 border-t pt-4">
            {order.deliveryFeeMode === "known" && order.deliveryFeeCentavos !== null && <dl className="grid gap-1 text-sm text-muted-foreground">
              <div className="flex justify-between gap-2">
                <dt>Subtotal</dt><dd className="tabular-nums">{pesos(order.subtotalCentavos)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Delivery fee</dt><dd className="tabular-nums">{pesos(order.deliveryFeeCentavos)}</dd>
              </div>
            </dl>}
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold">{order.deliveryFeeMode === "unknown" ? "Subtotal" : "Total"}</span>
              <OrderTotal order={order} detail />
            </div>
            <div className="grid justify-items-start empty:hidden [&>form]:w-full">
              <DeliveryFeeEditor key={order.id} order={order} disabled={!!pendingAction || blocked || working || editorOpen || editor.busy}
                onWorkingChange={setWorking}
                onSaved={() => refresh()}
                onReload={() => refresh()} />
            </div>
          </div>
          <div className={detailActionsClass}>
            <Button
              data-order-undo={pendingAction?.status !== "cancelled" && pendingAction?.phase === "pending" ? "" : undefined}
              disabled={pendingAction?.status !== "cancelled" && pendingAction ? pendingAction.phase !== "pending" : !!pendingAction || blocked || working || editor.busy || editorOpen || !open || (order.status === "pending" ? order.deliveryFeeMode === "unknown" : order.payment !== "paid")}
              onClick={() => {
                if (pendingAction) actionQueue.undo(order.id);
                else actionQueue.schedule({ orderId: order.id, orderNumber: order.orderNumber, updatedAt: order.updatedAt, status: order.status === "pending" ? "confirmed" : "completed" });
              }}
            >
              {pendingAction && pendingAction.status !== "cancelled" ? <OrderActionButtonContent action={pendingAction} /> : order.status === "pending" ? "Confirm order" : "Complete order"}
            </Button>
            <Button
              variant="outline"
              disabled={!!pendingAction || blocked || working || (order.payment !== "paid" && (order.status !== "confirmed" || order.payment !== "unpaid"))}
              onClick={() => void transition(order, order.payment === "paid" ? "refunded" : "paid")}
            >
              <Check aria-hidden="true" />
              {order.payment === "paid" ? "Mark refunded" : order.payment === "refunded" ? "Refund recorded" : "Mark paid"}
            </Button>
            <Button variant="outline" disabled={!!pendingAction || blocked || working || !open || editor.busy} onClick={event => editor.open(order, event.currentTarget)}>
              <Pencil aria-hidden="true" /> Edit order
            </Button>
            <Button variant="destructive" data-order-undo={pendingAction?.status === "cancelled" && pendingAction.phase === "pending" ? "" : undefined} disabled={pendingAction?.status === "cancelled" ? pendingAction.phase !== "pending" : !!pendingAction || blocked || working || editor.busy || editorOpen || !open || order.payment === "paid"} onClick={() => {
              if (pendingAction) actionQueue.undo(order.id);
              else actionQueue.schedule({ orderId: order.id, orderNumber: order.orderNumber, updatedAt: order.updatedAt, status: "cancelled" });
            }}>
              {pendingAction?.status === "cancelled" ? <OrderActionButtonContent action={pendingAction} /> : <><X aria-hidden="true" /> Cancel order</>}
            </Button>
          </div>
          <span role="status" className="sr-only">{pendingAction?.phase === "pending" ? "Undo available for three seconds. Activate the same button to undo." : pendingAction?.phase === "saving" ? "Saving order." : ""}</span>
          {failedAction && <Alert variant="destructive"><AlertDescription>{failedAction.error} <Button variant="ghost" onClick={() => { refresh(); actionQueue.dismiss(order.id); }}>Refresh order</Button></AlertDescription></Alert>}
          {order.status === "pending" && order.deliveryFeeMode === "unknown" && <p className="text-sm">Set a delivery fee or select Customer pays rider before confirming.</p>}
          {order.status === "pending" && order.payment === "unpaid" && <p className="text-sm text-muted-foreground">Confirm the order before marking it paid.</p>}
          {open && order.payment === "paid" && <p className="text-sm">Record the refund before cancelling a paid order.</p>}
        </> : selectedId ? <OrderDetailSkeleton order={selectedQueueOrder} /> : <p>Select an order to view details.</p>}
      </section>
      </div>
    </div>


  </div>;
}
