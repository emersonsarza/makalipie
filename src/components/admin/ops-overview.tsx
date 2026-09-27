import Link from "next/link";
import { ArrowRight, ArrowUpRight, CircleAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatPesos,
  isOverviewEmpty,
  type OpsOverview,
  type OverviewOrder,
} from "@/lib/admin/overview-fixtures";
import "./ops-overview.css";

const EMPTY_METRICS = [
  "Orders due today",
  "Items still to prepare",
  "Ready for pickup/delivery",
  "Money received today",
] as const;

function OverviewEmptyShell({ snapshot }: { snapshot: OpsOverview }) {
  return (
    <div className="admin-overview ov-ops-grid ov-empty-shell">
      <aside className="ov-empty-cta" role="status">
        <div>
          <strong>Quiet day so far</strong>
          <p>
            There are no orders on Overview yet. Finish your catalog so the menu is ready—Orders and Kitchen arrive
            later.
          </p>
        </div>
        <div className="ov-empty-cta-actions">
          <Link href="/admin/catalog" className={cn(buttonVariants(), "ov-empty-btn")}>
            Open catalog
            <ArrowRight size={16} aria-hidden />
          </Link>
          <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "ov-empty-btn")}>
            Visit website
            <ArrowUpRight size={16} aria-hidden />
          </Link>
        </div>
      </aside>

      <header className="ov-heading ov-manager-heading">
        <div>
          <p className="ov-eyebrow">DAILY OPERATIONS</p>
          <h1>Today at the bakery</h1>
        </div>
        <div className="ov-meta-row">
          <span>{snapshot.dateLabel}</span>
          <span>
            {snapshot.timezone} · waiting for first order
          </span>
        </div>
      </header>

      <div className="ov-metrics ov-metrics-empty" aria-label="Today at a glance">
        {EMPTY_METRICS.map((label) => (
          <div className="ov-metric ov-metric-empty" key={label}>
            <span>{label}</span>
            <strong>No orders yet</strong>
          </div>
        ))}
      </div>

      <div className="ov-dual">
        <section className="ov-panel" aria-labelledby="today-h">
          <h2 id="today-h">Today’s orders</h2>
          <p className="ov-section-lead">Pickup and delivery schedule will appear here once orders are connected.</p>
          <div className="ov-empty-slot">Nothing scheduled for today.</div>
        </section>
        <section className="ov-panel" aria-labelledby="att-h">
          <h2 id="att-h">Needs attention</h2>
          <p className="ov-section-lead">Holds, quotes, and overdue handoffs will surface here.</p>
          <div className="ov-empty-slot">You’re all caught up—there’s nothing waiting.</div>
        </section>
      </div>

      <div className="ov-bake-grid ov-section">
        <section className="ov-panel" aria-labelledby="bake-h">
          <h2 id="bake-h">Bake summary</h2>
          <p className="ov-section-lead">Confirmed and preparing pies only—ready plates stay off this list.</p>
          <div className="ov-empty-slot">No bake list until the first confirmed order.</div>
        </section>
        <section className="ov-panel" aria-labelledby="cap-h">
          <h2 id="cap-h">Upcoming capacity</h2>
          <p className="ov-section-lead">Seven-day committed vs holds will chart here.</p>
          <div className="ov-empty-slot">Capacity opens when order intake is live.</div>
        </section>
      </div>
    </div>
  );
}

function statusBadge(status: OverviewOrder["status"]) {
  const cls = status === "ready" ? "ov-badge ov-badge-ready" : "ov-badge ov-badge-status";
  return <span className={cls}>{status}</span>;
}

function payBadge(order: OverviewOrder) {
  return <span className="ov-badge ov-badge-pay">{order.paymentStatus.replaceAll("_", " ")}</span>;
}

function MetricStrip({ snapshot }: { snapshot: OpsOverview }) {
  const g = snapshot.glance;
  return (
    <div className="ov-metrics" aria-label="Today at a glance">
      <Link href={snapshot.links.ordersToday} className="ov-metric">
        <span>Orders due today</span>
        <strong>{g.ordersDue}</strong>
      </Link>
      <Link href={snapshot.links.kitchenToday} className="ov-metric">
        <span>Items still to prepare</span>
        <strong>{g.itemsStillToPrepare}</strong>
      </Link>
      <Link href={snapshot.links.ordersReady} className="ov-metric">
        <span>Ready for pickup/delivery</span>
        <strong>{g.readyOrders}</strong>
      </Link>
      <Link href={snapshot.links.payments} className="ov-metric">
        <span>Money received today</span>
        <strong className="ov-metric-money">{formatPesos(g.moneyReceivedCentavos)}</strong>
      </Link>
    </div>
  );
}

function BakeAndCapacity({ snapshot }: { snapshot: OpsOverview }) {
  return (
    <div className="ov-bake-grid ov-section">
      <section className="ov-panel" aria-labelledby="bake-h">
        <div className="ov-panel-head">
          <h2 id="bake-h">Bake summary</h2>
          <Link href={snapshot.links.kitchenToday} className="ov-link">
            Full kitchen
          </Link>
        </div>
        <p className="ov-section-lead">Confirmed + preparing only. Ready pies are already plated.</p>
        <ul className="ov-bake-list">
          {snapshot.bakeSummary.map((line) => (
            <li key={`${line.productName}-${line.variantLabel}`}>
              <span>
                {line.productName} · {line.variantLabel}
              </span>
              <strong>×{line.quantity}</strong>
            </li>
          ))}
        </ul>
      </section>
      <section className="ov-panel" aria-labelledby="cap-h">
        <div className="ov-panel-head">
          <h2 id="cap-h">Upcoming capacity</h2>
          <span className="ov-cap-legend">7 days · charcoal = committed, gold = holds</span>
        </div>
        <div className="ov-capacity-bars">
          {snapshot.capacity.map((d) => {
            const orderPct = Math.min(100, (d.committedOrders / d.orderLimit) * 100);
            const holdPct = Math.min(100 - orderPct, (d.holdOrders / d.orderLimit) * 100);
            return (
              <div
                key={d.date}
                className={`ov-cap-day${d.isToday ? " is-today" : ""}${d.isTomorrow ? " is-tomorrow" : ""}`}
              >
                <strong>
                  {d.label}
                  {d.isTomorrow ? " · tm" : ""}
                </strong>
                {d.closed ? (
                  <span className="ov-cap-closed">Closed</span>
                ) : (
                  <div className="ov-cap-track" title={`${d.committedOrders} committed · ${d.holdOrders} holds`}>
                    <span className="ov-cap-committed" style={{ width: `${orderPct}%` }} />
                    <span className="ov-cap-hold" style={{ width: `${holdPct}%` }} />
                  </div>
                )}
                <span>
                  {d.closed
                    ? "—"
                    : `${d.committedOrders}/${d.orderLimit} ord · ${d.committedItems}/${d.itemLimit} pcs`}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Insights({ snapshot }: { snapshot: OpsOverview }) {
  const max = Math.max(...snapshot.sales.days.map((d) => d.completedOrderValueCentavos), 1);
  const delta = snapshot.sales.valueDeltaPct;
  return (
    <div className="ov-insights">
      <section className="ov-panel" aria-labelledby="pay-h">
        <h3 id="pay-h">Payments</h3>
        <p className="ov-section-lead">From payment events today · not fulfillment date.</p>
        <p className="ov-stat-line">
          Received <strong>{formatPesos(snapshot.payments.moneyReceivedTodayCentavos)}</strong>
        </p>
        <p className="ov-stat-line">
          Refunds <strong>{formatPesos(snapshot.payments.refundsTodayCentavos)}</strong>
        </p>
        <p className="ov-stat-line">
          Outstanding <strong>{formatPesos(snapshot.payments.outstandingBalancesCentavos)}</strong>
        </p>
        <p className="ov-stat-line ov-stat-line-last">
          Collection due <strong>{formatPesos(snapshot.payments.collectionDueCentavos)}</strong>
          <span className="ov-muted"> · cash at pickup/delivery</span>
        </p>
        <p className="ov-panel-link">
          <Link href={snapshot.links.payments} className="ov-link">
            Open balances
          </Link>
        </p>
      </section>

      <section className="ov-panel" aria-labelledby="sales-h">
        <h3 id="sales-h">Sales performance</h3>
        <p className="ov-section-lead">
          {snapshot.sales.rangeLabel} · completed order value · {snapshot.sales.comparisonLabel}
        </p>
        <div className="ov-sales-chart" aria-label="Daily completed order value">
          {snapshot.sales.days.map((d) => (
            <div className="ov-sales-day" key={d.date}>
              <span>{formatPesos(d.completedOrderValueCentavos)}</span>
              <div className="ov-sales-track">
                <i style={{ height: `${(d.completedOrderValueCentavos / max) * 100}%` }} />
              </div>
              <span>{d.label}</span>
              <small>
                {d.date.slice(8)} Sep{d.date === snapshot.date ? " · today" : ""}
              </small>
            </div>
          ))}
        </div>
        <p className="ov-stat-line">
          <strong>{formatPesos(snapshot.sales.completedOrderValueCentavos)}</strong> ·{" "}
          {snapshot.sales.completedOrderCount} completed
        </p>
        <p className="ov-stat-muted">
          Avg {formatPesos(snapshot.sales.averageOrderValueCentavos)}
          {" · "}
          {delta === null ? (
            <span className="ov-delta-na">comparison unavailable (baseline zero)</span>
          ) : (
            <span className={delta >= 0 ? "ov-delta-up" : "ov-delta-down"}>
              {delta >= 0 ? "+" : ""}
              {delta}% vs prior period
            </span>
          )}
        </p>
        <h4 className="ov-bestseller-heading">
          Bestsellers <span>Items sold</span>
        </h4>
        <ol className="ov-bestsellers">
          {snapshot.sales.bestsellers.map((b) => (
            <li key={`${b.productName}-${b.variantLabel}`}>
              <span>
                {b.productName} <small>{b.variantLabel}</small>
              </span>
              <strong>{b.quantity}</strong>
            </li>
          ))}
        </ol>
      </section>

      <section className="ov-panel" aria-labelledby="act-h">
        <h3 id="act-h">Recent activity</h3>
        {snapshot.recentActivity.map((a) => (
          <Link key={a.id} href={a.href} className="ov-row">
            <div className="ov-row-copy">
              <strong>{a.summary}</strong>
              <span>
                {a.atLabel} · {a.actor}
              </span>
            </div>
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        ))}
      </section>
    </div>
  );
}

/** Ops Grid Overview — daily bakery operations dashboard (§7). */
export function OpsOverview({
  snapshot,
  fixturePreview = false,
}: {
  snapshot: OpsOverview;
  fixturePreview?: boolean;
}) {
  if (isOverviewEmpty(snapshot) && !fixturePreview) {
    return <OverviewEmptyShell snapshot={snapshot} />;
  }

  const attention = snapshot.attention.filter((item) => item.reasons.some((reason) => reason !== "collection_due"));
  const collections = snapshot.attention.filter(
    (item) => item.reasons.length === 1 && item.reasons[0] === "collection_due",
  );

  return (
    <div className="admin-overview ov-ops-grid">
      {fixturePreview && (
        <aside className="ov-fixture-notice" role="status">
          <strong>Sample day preview.</strong> Order intake isn’t connected yet — figures below are fixtures so the
          finished Overview layout can be reviewed. Chat-based ordering remains in use.
        </aside>
      )}

      <header className="ov-heading ov-manager-heading">
        <div>
          <p className="ov-eyebrow">DAILY OPERATIONS</p>
          <h1>Today at the bakery</h1>
        </div>
        <div className="ov-meta-row">
          <span>{snapshot.dateLabel}</span>
          <span>
            {snapshot.lastRefresh} · {snapshot.timezone}
          </span>
        </div>
      </header>

      <MetricStrip snapshot={snapshot} />

      <div className="ov-dual">
        <section className="ov-panel" aria-labelledby="today-h">
          <div className="ov-panel-head">
            <h2 id="today-h">
              Today’s orders <span className="ov-count">{snapshot.todayOrders.length}</span>
            </h2>
            <Link href={snapshot.links.ordersToday} className="ov-link">
              All orders
            </Link>
          </div>
          <p className="ov-section-lead">Pickup and delivery schedule</p>
          <div className="ov-order-schedule">
            {snapshot.todayOrders.map((order) => (
              <Link key={order.id} href={`/admin/orders/${order.id}`} className="ov-scheduled-order">
                <div className="ov-order-time">
                  <strong>{order.slotLabel}</strong>
                  <span>{order.fulfillmentType}</span>
                </div>
                <div className="ov-order-description">
                  <strong>{order.customerName}</strong>
                  <span>{order.itemSummary}</span>
                  <small>{order.orderNumber}</small>
                </div>
                <div className="ov-order-state">
                  {statusBadge(order.status)}
                  {payBadge(order)}
                </div>
              </Link>
            ))}
          </div>
          <p className="ov-completed">
            {snapshot.completedToday.length} completed today{" "}
            {snapshot.completedToday.map((order) => (
              <Link key={order.id} href={`/admin/orders/${order.id}`} className="ov-link">
                {order.orderNumber}
              </Link>
            ))}
          </p>
          {collections.length > 0 && (
            <section className="ov-collections" aria-labelledby="collections-h">
              <h3 id="collections-h">Collect at handoff</h3>
              <p className="ov-section-lead">Cash payments to collect with the order.</p>
              {collections.map((item) => (
                <Link className="ov-collection" href={item.href} key={item.id}>
                  <span>
                    <strong>{item.customerName}</strong>
                    <span>{item.detail}</span>
                  </span>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              ))}
            </section>
          )}
        </section>

        <section className="ov-panel ov-attention-panel" aria-labelledby="att-h">
          <div className="ov-panel-head">
            <h2 id="att-h">
              Needs attention <span className="ov-count">{attention.length}</span>
            </h2>
            <Link href={snapshot.links.ordersAttention} className="ov-link">
              View all
            </Link>
          </div>
          {attention.map((item) => {
            const expired = item.reasons.includes("reservation_expiring");
            const late = item.reasons.includes("past_fulfillment_window");
            const quote = item.reasons.includes("quote_pending");
            const balance = item.reasons.includes("outstanding_balance");
            const label = expired
              ? `Expires in ${item.urgencyMinutes} min`
              : late
                ? "Fulfillment overdue"
                : quote
                  ? "Quote needed"
                  : item.primaryLabel;
            const action = late
              ? "Review fulfillment"
              : quote
                ? "Finalize quote"
                : balance
                  ? "Review payment"
                  : "Review request";
            return (
              <Link className="ov-attention-item" href={item.href} key={item.id}>
                <span className={`ov-attention-label${late || expired ? " is-urgent" : ""}`}>
                  {(late || expired) && <CircleAlert size={14} aria-hidden="true" />}
                  {label}
                </span>
                <strong>
                  {item.customerName} <small>{item.orderNumber}</small>
                </strong>
                <span className="ov-attention-detail">{item.detail}</span>
                <span className="ov-attention-action">
                  {action}
                  <ArrowUpRight size={14} aria-hidden="true" />
                </span>
              </Link>
            );
          })}
          {attention.length === 0 && <p className="ov-section-lead">You’re all caught up.</p>}
        </section>
      </div>

      <BakeAndCapacity snapshot={snapshot} />
      <Insights snapshot={snapshot} />
    </div>
  );
}
