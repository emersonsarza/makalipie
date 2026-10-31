"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, Check, CheckCheck, CircleAlert, Clock3, ClipboardList, Package, RefreshCw, ShieldCheck, Store, WifiOff } from "lucide-react";
import { AdminHeaderTools, useAdminBranch, useAdminWorkspace } from "@/components/admin/admin-shell";
import { useAdminResource } from "@/components/admin/live";
import { issueLabels, statusLabels, type DashboardOrder } from "./model";
import styles from "./dashboard.module.css";

type Reason = keyof typeof issueLabels;
type Attention = DashboardOrder & { reasons: Reason[]; nextAction: string; deadline: string | null };
type Pulse = { id: string; name: string; intakeState: "online" | "paused" | "outside_hours" | "unconfigured"; hoursLabel: string | null; nextOpeningAt: string | null };
type Stock = { productId: string; name: string; allocated: number | null; remaining: number | null; state: "available" | "sold_out" | "unconfigured" | "unlimited" };
type DashboardPayload = {
  generatedAt: string;
  summary: { scheduledOrders: number; scheduledPies: number; readyForPickup: number; completedOrders: number } | null;
  attention: { totalDistinctOrders: number; overnightCount: number; items: Attention[]; nextCursor: string | null } | null;
  fulfillment: { total: number; items: (DashboardOrder & { slotStartsAt: string })[]; nextCursor: string | null } | null;
  branches: Pulse[] | null;
  availability: Stock[] | null;
  sections: Record<string, { state: "ready" | "error" | "forbidden" }>;
};

function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function displayDate(value: string) { return new Date(`${value}T12:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric" }); }
function clock(value: string) { return new Date(value).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }); }
function slotTime(value: string) { return new Date(value).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }); }
function label(order: { status: DashboardOrder["status"]; fulfillment: DashboardOrder["fulfillment"] }) { return order.status === "ready" && order.fulfillment === "delivery" ? "Out for delivery" : statusLabels[order.status]; }
const intakeCopy: Record<Pulse["intakeState"], string> = {
  online: "Open for new orders.",
  paused: "New requests are paused. Continue existing orders.",
  outside_hours: "Outside ordering hours. Existing orders still need fulfillment.",
  unconfigured: "Opening hours are not set.",
};

export function Dashboard() {
  const branch = useAdminBranch();
  const { branches } = useAdminWorkspace();
  const router = useRouter();
  const [date, setDate] = useState(manilaToday);
  const [tab, setTab] = useState<"active" | "all" | "pickup" | "delivery">("active");
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("date");
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) setDate(value);
  }, []);
  const url = branch ? `/api/admin/dashboard?${new URLSearchParams({ branch, date })}` : null;
  const { resource, refresh } = useAdminResource<DashboardPayload>(url);
  const data = resource.status === "ready" ? resource.snapshot : null;
  const stale = resource.status === "ready" && resource.freshness !== "current";
  const orders = (data?.fulfillment?.items ?? []).map((order) => ({ ...order, time: order.slotStartsAt }));
  const filtered = orders.filter((order) => tab === "all" || (tab === "active" ? !["completed", "cancelled", "expired"].includes(order.status) : order.fulfillment === tab));
  const href = (page: string, filter?: string) => `/admin/${page}?${new URLSearchParams({ branch, date, ...(filter ? { view: filter } : {}) })}`;
  const chooseDate = (value: string) => {
    setDate(value);
    const params = new URLSearchParams(window.location.search);
    params.set("branch", branch);
    params.set("date", value);
    router.replace(`/admin?${params}`, { scroll: false });
  };
  const summary = data?.summary;
  const metrics = [
    { label: "Orders scheduled", value: summary?.scheduledOrders ?? 0, help: "Excludes cancelled & expired", icon: ClipboardList, view: "scheduled" },
    { label: "Pies scheduled", value: summary?.scheduledPies ?? 0, help: "Individual pies, not boxes", icon: Package, view: "scheduled" },
    { label: "Ready for pickup", value: summary?.readyForPickup ?? 0, help: "Waiting to be collected", icon: Store, view: "ready" },
    { label: "Completed", value: summary?.completedOrders ?? 0, help: "Collected or delivered", icon: CheckCheck, view: "completed" },
  ];
  const attention = data?.attention?.items ?? [];
  const pulse = data?.branches ?? [];
  const paused = pulse.some((item) => item.intakeState === "paused");
  const closed = pulse.length > 0 && pulse.every((item) => item.intakeState === "outside_hours");
  const setup = pulse.length > 0 && pulse.every((item) => item.intakeState === "unconfigured");
  const soldOut = (data?.availability ?? []).some((item) => item.state === "sold_out") && (data?.availability ?? []).every((item) => item.state === "sold_out" || item.state === "unconfigured");

  return <div className={styles.dashboard}>
    <AdminHeaderTools><label htmlFor="dashboard-date">Fulfillment date<input id="dashboard-date" type="date" value={date} onChange={(event) => { if (event.target.value) chooseDate(event.target.value); }} /></label></AdminHeaderTools>
    <div className={styles.dayline}><span>{displayDate(date)} <span className={styles.muted}>· Manila time</span></span>{data && <span className={styles.muted}>Updated {clock(data.generatedAt)}</span>}</div>

    {resource.status === "forbidden" ? <div className={styles.fullState}><ShieldCheck size={32} aria-hidden /><h3>Dashboard access is restricted</h3><p>{resource.message || "Ask the owner to enable dashboard access for your account. You can still work on the orders available to you."}</p><Link href={href("orders")}>Go to Orders <ArrowRight size={16} aria-hidden /></Link></div>
    : !branches.length ? <div className={styles.fullState}><Store size={32} aria-hidden /><h3>No branch is available</h3><p>A branch must be assigned before its orders and capacity can appear here.</p></div>
    : resource.status === "loading" ? <div aria-busy="true" aria-label="Loading dashboard"><p role="status">Getting your day ready…</p><div className={styles.metrics}>{metrics.map((item) => <div key={item.label} className={styles.skeleton} />)}</div><div className={styles.skeletonLarge} /></div>
    : resource.status === "error" ? <div className={styles.fullState} role="alert"><CircleAlert size={32} aria-hidden /><h3>We couldn’t load the dashboard</h3><p>{resource.message || "Your orders haven’t changed. Try again, or open Orders directly."}</p><div className={styles.actions}><button onClick={refresh}>Try again</button><Link href={href("orders")}>Open Orders <ArrowRight size={16} aria-hidden /></Link></div></div>
    : <>
      {stale && <div className={styles.banner} role="status">{resource.freshness === "offline" ? <WifiOff size={19} aria-hidden /> : <RefreshCw size={19} aria-hidden />}<div><strong>{resource.freshness === "offline" ? "You’re offline. This is the last loaded snapshot." : resource.freshness === "refreshing" ? "Refreshing the dashboard…" : "The latest update could not be loaded."}</strong><p>Existing figures stay visible until the next successful refresh.</p></div>{resource.freshness !== "refreshing" && <button onClick={refresh}>Try again</button>}</div>}
      {(paused || closed || soldOut || setup) && <div className={styles.banner} role="status"><CircleAlert size={19} aria-hidden /><div><strong>{paused ? "Online ordering is paused for this scope." : closed ? "The bakery is outside its ordering hours." : soldOut ? "Today’s allocated pies are sold out." : "Finish setting up online ordering."}</strong><p>{paused ? "Existing orders still need fulfillment. Pausing intake does not cancel them." : closed ? "Existing orders still need fulfillment." : soldOut ? "Existing orders are unchanged. Check allocation before offering more pies." : "Add a schedule and allocation before accepting new orders."}</p></div><Link href={href(soldOut ? "allocation" : "schedule")}>{soldOut ? "View allocation" : "View schedule"}<ArrowRight size={16} aria-hidden /></Link></div>}
      {data?.sections.summary?.state === "error" || !summary ? <div className={styles.fullState} role="alert"><CircleAlert size={32} aria-hidden /><h3>The day’s counts could not be loaded</h3><p>Missing counts are not zero. Try again, or open Orders.</p><button onClick={refresh}>Try again</button></div> : <section className={styles.metrics} aria-label="Daily summary">{metrics.map((metric) => <Link key={metric.label} href={href("orders", metric.view)} className={styles.metric}><span>{metric.label}<metric.icon size={18} aria-hidden /></span><strong>{metric.value}</strong><small>{metric.help}</small></Link>)}</section>}
      <div className={styles.columns}>
        <div className={styles.primary}>
          <section className={styles.panel} aria-labelledby="attention-title"><div className={styles.panelHeading}><h3 id="attention-title">Needs your attention <span className={styles.count}>{data?.attention?.totalDistinctOrders ?? "—"}</span></h3><Link href={href("orders", "needs-action")}>View orders <ArrowRight size={15} aria-hidden /></Link></div>
            {data?.attention?.overnightCount ? <p className={styles.sectionHelp}>{data.attention.overnightCount} came in while the shop was closed.</p> : null}
            {data?.sections.attention?.state === "error" ? <div className={styles.empty} role="status"><CircleAlert size={24} aria-hidden /><h4>Attention couldn’t be loaded</h4><p>The order counts above stay available. This is not an empty queue.</p><button onClick={refresh}>Try again</button></div>
            : attention.length ? <ul className={styles.attention}>{attention.map((order) => <li key={order.id}><span className={order.reasons.includes("urgent") ? styles.urgentIcon : styles.issueIcon}><Clock3 size={17} aria-hidden /></span><div><strong>{order.nextAction}</strong><p>{order.number} · {order.customer || "Customer"}{branch === "all" ? ` · ${order.branchName}` : ""} · {issueLabels[order.reasons[0]]}</p></div><Link href={`/admin/orders?${new URLSearchParams({ branch, date, order: order.id, view: order.reasons.includes("overnight") ? "overnight" : "needs-action" })}`} aria-label={`Open ${order.number}`}>View <ArrowRight size={14} aria-hidden /></Link></li>)}</ul>
            : <div className={styles.empty}><Check size={25} aria-hidden /><h4>You’re all caught up</h4><p>There are no outstanding actions for this branch and date.</p></div>}
            {data?.attention?.nextCursor && <p className={styles.sectionHelp}>More orders need attention. Open Orders for the full queue.</p>}
          </section>
          <section className={styles.panel} aria-labelledby="fulfillment-title"><div className={styles.panelHeading}><h3 id="fulfillment-title">Fulfillment schedule</h3><span className={styles.muted}>{data?.fulfillment?.total ?? "—"} orders</span></div>
            <div className={styles.filters} role="group" aria-label="Filter fulfillment">{(["active", "all", "pickup", "delivery"] as const).map((value) => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{value === "all" ? "All statuses" : value === "active" ? "Active" : value === "pickup" ? "Pickup" : "Delivery"}</button>)}</div>
            {data?.sections.fulfillment?.state === "error" ? <div className={styles.empty} role="status"><CircleAlert size={24} aria-hidden /><h4>The schedule couldn’t be loaded</h4><button onClick={refresh}>Try again</button></div>
            : filtered.length ? <ol className={styles.schedule}>{filtered.map((order) => <li key={order.id}><time>{slotTime(order.time)}</time><details><summary><span className={styles.orderName}><strong>{order.number} <span>{order.customer || "Customer"}</span></strong><small>{order.quantity} pies · {order.fulfillment === "pickup" ? "Pickup" : "Delivery"}{branch === "all" ? ` · ${order.branchName}` : ""}</small></span><span className={styles.status} data-status={order.status}>{label(order)}</span></summary><div className={styles.orderDetails}><Link href={`/admin/orders?${new URLSearchParams({ branch, date, order: order.id, view: order.status })}`}>Open order <ArrowRight size={14} aria-hidden /></Link></div></details></li>)}</ol>
            : <div className={styles.empty}><CalendarDays size={26} aria-hidden /><h4>{orders.length ? "Nothing in this view" : "A clear schedule"}</h4><p>{orders.length ? "Try all statuses to see the rest of the loaded orders." : "Orders scheduled for this date will appear here."}</p>{orders.length > 0 && <button onClick={() => setTab("all")}>Show all statuses</button>}</div>}
            {data?.fulfillment?.nextCursor && <p className={styles.sectionHelp}>This list shows the first page. The count above includes the rest of the day.</p>}
          </section>
        </div>
        <aside className={styles.secondary} aria-label="Branch operations">
          <section className={styles.panel}><div className={styles.panelHeading}><h3>Branch pulse</h3><Store size={18} aria-hidden /></div>
            {data?.sections.branches?.state === "error" || data?.branches == null ? <div className={styles.empty} role="status"><h4>Branch status couldn’t be loaded</h4><button onClick={refresh}>Try again</button></div> : pulse.map((item) => <div className={styles.branchRow} key={item.id}><div><strong>{item.name}</strong><span className={styles.branchStatus}>{item.intakeState === "paused" ? "Paused" : item.intakeState === "outside_hours" ? "Closed now" : item.intakeState === "unconfigured" ? "Not configured" : "Online"}</span></div><p>{item.hoursLabel || intakeCopy[item.intakeState]}{item.nextOpeningAt ? ` Next opening ${clock(item.nextOpeningAt)}.` : ""}</p></div>)}
            <Link className={styles.panelLink} href={href("schedule")}>Manage schedule <ArrowRight size={15} aria-hidden /></Link>
          </section>
          <section className={styles.panel}><div className={styles.panelHeading}><h3>Pie availability</h3><Package size={18} aria-hidden /></div><p className={styles.sectionHelp}>Individual pies for this date</p>
            {data?.sections.availability?.state === "error" || data?.availability == null ? <div className={styles.empty} role="status"><CircleAlert size={24} aria-hidden /><h4>Capacity couldn’t be loaded</h4><p>Order figures stay available. Missing capacity does not mean zero.</p><button onClick={refresh}>Retry capacity</button></div>
            : !data.availability.length ? <div className={styles.empty}><h4>No allocation configured</h4><p>Set quantities before offering pies for this day.</p></div>
            : <div className={styles.capacity}>{data.availability.map((item) => <div key={`${item.productId}`}><div><strong>{item.name}</strong><span>{item.state === "unlimited" ? "Unlimited" : item.state === "unconfigured" ? "Not configured" : item.state === "sold_out" ? "Sold out" : `${item.remaining ?? 0} left`}</span></div>{item.allocated != null && item.remaining != null ? <meter min={0} max={Math.max(item.allocated, 1)} value={item.remaining} aria-label={`${item.name}: ${item.remaining} of ${item.allocated} pies remaining`} /> : null}<small>{item.state === "unlimited" ? "No pie cap is saved." : item.state === "unconfigured" ? "No quantity is saved for this flavor." : item.allocated == null ? "Saved quantity is unreadable." : `${item.remaining ?? 0} available of ${item.allocated} allocated`}</small></div>)}</div>}
            <Link className={styles.panelLink} href={href("allocation")}>View allocation <ArrowRight size={15} aria-hidden /></Link>
          </section>
        </aside>
      </div>
    </>}
  </div>;
}
