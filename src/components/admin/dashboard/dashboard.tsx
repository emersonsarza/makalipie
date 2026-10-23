"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Check, CheckCheck, CircleAlert, Clock3, ClipboardList, Package, RefreshCw, ShieldCheck, Store, Truck, WifiOff } from "lucide-react";
import { useAdminBranch, useAdminWorkspace } from "@/components/admin/admin-shell";
import { dashboardStates, issueLabels, sampleOrders, statusLabels, type DashboardState, type DashboardOrder } from "./model";
import styles from "./dashboard.module.css";

const SAMPLE_DATE = "2026-10-23";
function displayDate(value: string) { return new Date(`${value}T12:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric" }); }
function timeLabel(value: string) { const hour = Number(value.slice(0, 2)); return `${hour % 12 || 12}:00 ${hour >= 12 ? "PM" : "AM"}`; }
function label(order: DashboardOrder) { return order.status === "ready" && order.fulfillment === "delivery" ? "Out for delivery" : statusLabels[order.status]; }

export function Dashboard() {
  const branch = useAdminBranch();
  const { role, branches } = useAdminWorkspace();
  // These controls exercise the presentation only and make no API calls.
  const [state, setState] = useState<DashboardState>("ready");
  const [date, setDate] = useState(SAMPLE_DATE);
  const [tab, setTab] = useState<"active" | "all" | "pickup" | "delivery">("active");
  const [notice, setNotice] = useState("");
  const scope = branches.filter((item) => branch === "all" || item.id === branch);
  const restricted = role !== "owner" || state === "restricted";
  const unassigned = !scope.length || state === "unassigned";
  const empty = state === "empty" || state === "setup";
  const orders = empty ? [] : sampleOrders(branches).filter((order) => branch === "all" || order.branchId === branch).map((order) => state === "clear" ? { ...order, issue: undefined, status: "completed" as const } : order);
  const active = orders.filter((order) => !["completed", "cancelled", "expired"].includes(order.status));
  const due = orders.filter((order) => !["cancelled", "expired"].includes(order.status));
  const attention = active.filter((order) => order.issue);
  const filtered = orders.filter((order) => tab === "all" || (tab === "active" ? active.includes(order) : order.fulfillment === tab));
  const href = (page: string, filter?: string) => `/admin/${page}?${new URLSearchParams({ branch, date, ...(filter ? { view: filter } : {}) })}`;
  const retry = () => { setState("ready"); setNotice("Example data restored. No server request was made."); };
  const metrics = [
    { label: "Orders scheduled", value: due.length, help: "Excludes cancelled & expired", icon: ClipboardList, view: "scheduled" },
    { label: "Pies scheduled", value: due.reduce((sum, order) => sum + order.quantity, 0), help: "Individual pies, not boxes", icon: Package, view: "scheduled" },
    { label: "Ready for pickup", value: orders.filter((order) => order.status === "ready" && order.fulfillment === "pickup").length, help: "Waiting to be collected", icon: Store, view: "ready" },
    { label: "Completed", value: orders.filter((order) => order.status === "completed").length, help: "Collected or delivered", icon: CheckCheck, view: "completed" },
  ];

  return <div className={styles.dashboard}>
    <div className={styles.example}><span><strong>UI example</strong> Fictional orders · no live data or order changes</span><label>Display state<select value={state} onChange={(event) => { setState(event.target.value as DashboardState); setNotice(""); }}>{dashboardStates.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
    <div className={styles.heading}><div><p className={styles.eyebrow}>YOUR DAY AT A GLANCE</p><h2>A little clarity for a busy day.</h2><p>See what needs you, then keep the pies moving.</p></div><div className={styles.dateControl}><label htmlFor="dashboard-date"><CalendarDays size={16} aria-hidden />Fulfillment date</label><input id="dashboard-date" type="date" value={date} onChange={(event) => { if (event.target.value) { setDate(event.target.value); setNotice("The date changed. This UI example reuses the same fictional orders."); } }} /></div></div>
    <div className={styles.dayline}><span>{displayDate(date)} <span className={styles.muted}>· Manila time</span></span><span className={styles.muted}>Example snapshot · 9:30 AM</span></div>
    <p className="sr-only" role="status" aria-live="polite">{notice}</p>

    {restricted ? <div className={styles.fullState}><ShieldCheck size={32} aria-hidden /><h3>Dashboard access is restricted</h3><p>Ask the owner to enable dashboard access for your account. You can still work on the orders available to you.</p><Link href={href("orders")}>Go to Orders <ArrowRight size={16} aria-hidden /></Link></div>
    : unassigned ? <div className={styles.fullState}><Store size={32} aria-hidden /><h3>No branch is available</h3><p>A branch must be assigned before its orders and capacity can appear here.</p><Link href={href("branches")}>Manage branches <ArrowRight size={16} aria-hidden /></Link></div>
    : state === "loading" ? <div aria-busy="true" aria-label="Loading dashboard"><p role="status">Getting your day ready…</p><div className={styles.metrics}>{metrics.map((item) => <div key={item.label} className={styles.skeleton} />)}</div><div className={styles.skeletonLarge} /></div>
    : state === "error" ? <div className={styles.fullState} role="alert"><CircleAlert size={32} aria-hidden /><h3>We couldn’t load the dashboard</h3><p>Your orders haven’t changed. Try again, or open Orders directly.</p><div className={styles.actions}><button onClick={retry}>Try again</button><Link href={href("orders")}>Open Orders <ArrowRight size={16} aria-hidden /></Link></div></div>
    : <>
      {["stale", "offline", "refreshing"].includes(state) && <div className={styles.banner} role="status">{state === "offline" ? <WifiOff size={19} aria-hidden /> : <RefreshCw size={19} aria-hidden />}<div><strong>{state === "offline" ? "You’re offline. This is the last saved snapshot." : state === "refreshing" ? "Refreshing the dashboard…" : "The latest update is taking longer than usual."}</strong><p>Existing figures stay visible. They may have changed since 9:30 AM.</p></div>{state !== "refreshing" && <button onClick={retry}>Try again</button>}</div>}
      {["paused", "closed", "sold-out", "setup"].includes(state) && <div className={styles.banner} role="status"><CircleAlert size={19} aria-hidden /><div><strong>{state === "paused" ? "Online ordering is paused for this scope." : state === "closed" ? "The bakery is outside its ordering hours." : state === "sold-out" ? "Today’s allocated pies are sold out." : "Finish setting up online ordering."}</strong><p>{state === "paused" ? "Existing orders still need fulfillment. Pausing intake does not cancel them." : state === "closed" ? "After-hours requests may be waiting for the next opening. Their individual deadlines still apply." : state === "sold-out" ? "Existing orders are unchanged. Check allocation before offering more pies." : "Add a schedule and allocation before accepting new orders."}</p></div><Link href={href(state === "sold-out" ? "allocation" : "schedule")}>{state === "sold-out" ? "View allocation" : "View schedule"}<ArrowRight size={16} aria-hidden /></Link></div>}
      <section className={styles.metrics} aria-label="Daily summary">{metrics.map((metric) => <Link key={metric.label} href={href("orders", metric.view)} className={styles.metric}><span>{metric.label}<metric.icon size={18} aria-hidden /></span><strong>{metric.value}</strong><small>{metric.help}</small></Link>)}</section>
      <div className={styles.columns}>
        <div className={styles.primary}>
          <section className={styles.panel} aria-labelledby="attention-title"><div className={styles.panelHeading}><div><p className={styles.eyebrow}>FIRST THINGS FIRST</p><h3 id="attention-title">Needs your attention <span className={styles.count}>{attention.length}</span></h3></div><Link href={href("orders", "needs-action")}>View orders <ArrowRight size={15} aria-hidden /></Link></div>
            <p className={styles.sectionHelp}>Each order appears once, with its most useful next step. Example queue includes overnight holds.</p>
            {attention.length ? <ul className={styles.attention}>{attention.map((order) => <li key={order.id}><span className={order.issue === "urgent" ? styles.urgentIcon : styles.issueIcon}><Clock3 size={17} aria-hidden /></span><div><strong>{issueLabels[order.issue!]}</strong><p>{order.number} · {order.customer}{branch === "all" ? ` · ${order.branchName}` : ""}</p></div><Link href={href("orders", order.issue === "overnight" ? "overnight" : "needs-action")} aria-label={`Open orders for ${issueLabels[order.issue!]}`}>View <ArrowRight size={14} aria-hidden /></Link></li>)}</ul> : <div className={styles.empty}><Check size={25} aria-hidden /><h4>{empty ? "No requests to check yet" : "You’re all caught up"}</h4><p>{empty ? "New requests and overnight holds will appear here." : "There are no outstanding actions in this example."}</p></div>}
          </section>
          <section className={styles.panel} aria-labelledby="fulfillment-title"><div className={styles.panelHeading}><div><p className={styles.eyebrow}>ON THE COUNTER & ON THE WAY</p><h3 id="fulfillment-title">Fulfillment schedule</h3></div><span className={styles.muted}>{filtered.length} orders</span></div>
            <div className={styles.filters} role="group" aria-label="Filter fulfillment">{(["active", "all", "pickup", "delivery"] as const).map((value) => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{value === "all" ? "All statuses" : value === "active" ? "Active" : value === "pickup" ? "Pickup" : "Delivery"}</button>)}</div>
            {filtered.length ? <ol className={styles.schedule}>{filtered.map((order) => <li key={order.id}><time>{timeLabel(order.time)}</time><details><summary><span className={styles.orderName}><strong>{order.number} <span>{order.customer}</span></strong><small>{order.quantity} pies · {order.fulfillment === "pickup" ? "Pickup" : "Delivery"}{branch === "all" ? ` · ${order.branchName}` : ""}</small></span><span className={styles.status} data-status={order.status}>{label(order)}</span></summary><div className={styles.orderDetails}><p>{order.issue ? issueLabels[order.issue] : "No additional action flagged in this example."}</p><p>Fictional order. Open Orders to continue the workflow once that page is connected.</p><Link href={href("orders", order.status)}>View matching orders <ArrowRight size={14} aria-hidden /></Link></div></details></li>)}</ol> : <div className={styles.empty}><CalendarDays size={26} aria-hidden /><h4>{orders.length ? "Nothing in this view" : "A clear schedule"}</h4><p>{orders.length ? "Try all statuses to see the rest of this day." : "Orders scheduled for this date will appear here. A quiet day isn’t an error."}</p>{orders.length > 0 && <button onClick={() => setTab("all")}>Show all statuses</button>}</div>}
          </section>
        </div>
        <aside className={styles.secondary} aria-label="Branch operations">
          <section className={styles.panel}><div className={styles.panelHeading}><h3>Branch pulse</h3><Store size={18} aria-hidden /></div>{scope.map((item) => <div className={styles.branchRow} key={item.id}><div><strong>{item.name}</strong><span className={styles.branchStatus}>{state === "paused" ? "Paused" : state === "closed" ? "Closed now" : state === "setup" ? "Not configured" : "Online"}</span></div><p>{state === "paused" ? "New requests are paused. Continue existing orders." : state === "closed" ? "Next example opening: 10:00 AM." : state === "setup" ? "Opening hours are not set." : "Example hours: 10:00 AM–8:00 PM"}</p></div>)}<Link className={styles.panelLink} href={href("schedule")}>Manage schedule <ArrowRight size={15} aria-hidden /></Link></section>
          <section className={styles.panel}><div className={styles.panelHeading}><h3>Pie availability</h3><Package size={18} aria-hidden /></div><p className={styles.sectionHelp}>Illustrative allocation · individual pies</p>{state === "partial" ? <div className={styles.empty} role="status"><CircleAlert size={24} aria-hidden /><h4>Capacity couldn’t be loaded</h4><p>Order figures are available. Missing capacity does not mean zero.</p><button onClick={retry}>Retry capacity</button></div> : state === "setup" ? <div className={styles.empty}><h4>No allocation configured</h4><p>Set quantities before offering pies for this day.</p></div> : <div className={styles.capacity}>{[{ name: "Buko pie", remaining: 2, total: 24 }, { name: "Chocolate tart", remaining: 12, total: 20 }, { name: "Butter chicken pie", remaining: 0, total: 12 }].map((item) => { const remaining = state === "sold-out" ? 0 : item.remaining; return <div key={item.name}><div><strong>{item.name}</strong><span>{remaining === 0 ? "Sold out" : `${remaining} left`}</span></div><meter min={0} max={item.total} value={remaining} aria-label={`${item.name}: ${remaining} of ${item.total} pies remaining`} /><small>{remaining} available of {item.total} allocated</small></div>; })}</div>}<Link className={styles.panelLink} href={href("allocation")}>View allocation <ArrowRight size={15} aria-hidden /></Link></section>
          <div className={styles.note}><Truck size={19} aria-hidden /><div><strong>Keep fulfillment moving</strong><p>Check delivery fees before approval. Missing rider details are a warning, not a payment or dispatch rule.</p></div></div>
        </aside>
      </div>
      <p className={styles.footnote}>Illustrative dashboard · counts follow the selected branch · amounts and sales reporting are not included.</p>
    </>}
  </div>;
}
