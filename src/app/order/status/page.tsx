"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Clock3, Copy, CircleAlert, Store, Truck } from "lucide-react";
import styles from "./status.module.css";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { SiteShell } from "@/components/site-shell";
import type { InboxOrder } from "@/lib/orders/schema";
import { site } from "@/lib/site";
import { receiptLine, receiptAddon } from "@/lib/orders/receipt-line";

type RecoveryReview = {
  clear: boolean;
  blockers: string[];
  priceChanges: { from: string; to: string }[];
  unavailableLines: { productId: string; variantId: string; label: string }[];
};

type Receipt = {
  orderNumber: string;
  status: InboxOrder["status"];
  statusLabel: string;
  branchName: string;
  delivery?: "pickup" | "lalamove";
  branchAddress?: string;
  fulfillmentDate: string;
  slotLabel: string;
  deadline: string;
  lines: string[];
  lineImages?: ({ src: string; alt: string } | null)[];
  addonLines: string[];
  totalLabel?: string;
  deliveryFeeCentavos?: number | null;
  preparationDays?: number;
  paymentLabel?: string;
  message: string;
};

function OrderPhoto({ image }: { image: { src: string; alt: string } }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <Image src={image.src} alt={image.alt} width={64} height={64} unoptimized className={styles.productImage} onError={() => setFailed(true)} />;
}

export default function OrderStatusPage() {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [review, setReview] = useState<RecoveryReview | null>(null);
  const [catalogMode, setCatalogMode] = useState<"regular" | "preorder">("regular");
  const [reopening, setReopening] = useState(false);
  const [actionError, setActionError] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  const reopenKey = useRef("");
  const numberField = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const scrollToTop = () => window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    scrollToTop();
    const frame = requestAnimationFrame(scrollToTop);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const accessToken = window.location.hash.replace(/^#/, "") || sessionStorage.getItem("makalipie-request-token") || "";
    let disposed = false;
    let timer = 0;
    if (!accessToken || accessToken.startsWith("reorder=")) {
      queueMicrotask(() => {
        if (!disposed) setError("Open the link from your request to see its status. An order number alone can't show these details.");
      });
      return () => { disposed = true; };
    }
    async function load() {
      try {
        const response = await fetch("/api/orders/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: accessToken }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "This link doesn't match a request.");
        if (disposed) return;
        setError("");
        setToken(accessToken);
        setReceipt(data.order);
        if (data.order.status === "expired" || data.order.status === "cancelled") {
          const recovery = await fetch("/api/orders/recovery", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: accessToken }),
          });
          const draft = await recovery.json();
          if (!disposed && recovery.ok) {
            setReview(draft.draft.review);
            setCatalogMode(draft.draft.catalogMode === "preorder" ? "preorder" : "regular");
          }
        } else if (!disposed) {
          setReview(null);
        }
      } catch (loadError) {
        if (!disposed && !receiptRef.current) setError(loadError instanceof Error ? loadError.message : "We couldn't open that request.");
      }
    }
    const receiptRef = { current: false };
    const trackedLoad = async () => {
      await load();
      receiptRef.current = true;
    };
    function schedule() {
      window.clearInterval(timer);
      if (document.visibilityState !== "visible") return;
      timer = window.setInterval(() => { void load(); }, 15000);
    }
    function onShow() {
      if (document.visibilityState === "visible") void load();
      schedule();
    }
    void trackedLoad();
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

  useEffect(() => {
    if (copyState === "manual") numberField.current?.select();
  }, [copyState]);

  async function copyOrderNumber() {
    if (!receipt) return;
    try {
      await navigator.clipboard.writeText(receipt.orderNumber);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    }
  }

  function openInstagram() {
    if (window.matchMedia("(pointer: coarse)").matches) {
      window.location.assign(site.instagramDmUrl);
      return;
    }
    window.open(site.instagramDmUrl, "_blank", "noopener,noreferrer");
  }

  async function reopen() {
    if (!token || reopening) return;
    if (!reopenKey.current) reopenKey.current = crypto.randomUUID();
    setReopening(true);
    setActionError("");
    try {
      const response = await fetch("/api/orders/reopen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reopenKey: reopenKey.current }),
      });
      const data = await response.json();
      if (data.order) {
        setReceipt(data.order);
        if (data.order.status !== "expired" && data.order.status !== "cancelled") setReview(null);
      }
      if (!response.ok) throw new Error(data.error || "We couldn't reopen that request.");
    } catch (reopenError) {
      setActionError(reopenError instanceof Error ? reopenError.message : "We couldn't reopen that request.");
    } finally {
      setReopening(false);
    }
  }

  const when = receipt ? new Date(`${receipt.fulfillmentDate}T12:00:00`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" }) : "";

  const recoverable = receipt?.status === "expired" || receipt?.status === "cancelled";

  return (
    <SiteShell>
      <section className={styles.page} aria-label="Your order">
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {receipt ? `Order status: ${receipt.statusLabel}. ${receipt.message}` : ""}
        </p>
        {error ? (
          <div className={styles.unavailable}>
            <CircleAlert size={32} aria-hidden />
            <p className={styles.eyebrow}>YOUR ORDER</p>
            <h1>Request not available</h1>
            <p role="alert">{error}</p>
            <Button className={styles.primary} onClick={openInstagram}>Get help on Instagram <ArrowUpRight aria-hidden /></Button>
          </div>
        ) : receipt ? (
          <>
            <div className={styles.layout}>
              <div className={styles.details}>
                <div className={styles.status}>
                  <OrderStatusBadge status={receipt.status} delivery={receipt.delivery ?? "pickup"} size="md" className={styles.statusBadge} />
                  <p className={styles.eyebrow}>MADE IN CEBU. MEANT TO BE SHARED.</p>
                  <h1>{recoverable ? "A little update on your order." : receipt.status === "completed" ? "Thank you for choosing Makalipie." : "Thank you for your order!"}</h1>
                  <p>{receipt.message}</p>
                </div>
                <section className={styles.next} aria-labelledby="next-heading">
                  <h2 id="next-heading">{recoverable || receipt.status === "completed" ? "Here if you need us." : "Let’s keep in touch."}</h2>
                  <p>Copy your order number and paste it into the Makalipie chat on Instagram.</p>
                  {receipt.status === "requested" ? (
                    <p className={styles.deadline}><Clock3 size={17} aria-hidden /><span>Hold until <strong>{new Date(receipt.deadline).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</strong> <span className={styles.timezone}>(Manila time)</span></span></p>
                  ) : null}
                  <Button type="button" className={styles.primary} onClick={openInstagram}>Open Instagram <ArrowUpRight aria-hidden /></Button>
                  <p className={styles.hint}>On a phone, this opens the Instagram app.</p>
                </section>
                <section className={styles.schedule} aria-labelledby="schedule-heading">
                  <h2 id="schedule-heading">Your schedule</h2>
                  <dl>
                    <div><dt>Branch</dt><dd>{receipt.branchName}{receipt.branchAddress ? <span className={styles.address}>{receipt.branchAddress}</span> : null}</dd></div>
                    <div><dt>Date</dt><dd>{when}</dd></div>
                    <div><dt>Time slot</dt><dd>{receipt.slotLabel}</dd></div>
                  </dl>
                  {receipt.preparationDays ? <p className={styles.note}>Needs {receipt.preparationDays} {receipt.preparationDays === 1 ? "day" : "days"} of preparation.</p> : null}
                  {receipt.status === "ready" ? <p className={styles.note}>Pick up at {receipt.branchName}{receipt.branchAddress ? `, ${receipt.branchAddress}` : ""} on {when}, {receipt.slotLabel}.</p> : null}
                </section>
                {review && recoverable ? (
                  <section className={styles.recovery} aria-labelledby="recovery-heading">
                    <h2 id="recovery-heading">Fancy another try?</h2>
                    {review.priceChanges.map((change, index) => <p key={index}>{change.from} is now {change.to}</p>)}
                    {review.unavailableLines.map((line) => <p key={`${line.productId}:${line.variantId}`}>{line.label} is no longer on the menu.</p>)}
                    {review.blockers.map((blocker, index) => <p key={index}>{blocker}</p>)}
                    {actionError ? <p role="alert">{actionError}</p> : null}
                    <div className={styles.actions}>
                      <a className={styles.reorder} href={`${catalogMode === "preorder" ? "/order/preorder" : "/order"}#reorder=${encodeURIComponent(token)}`}>Reorder <ArrowUpRight size={16} aria-hidden /></a>
                      <Button type="button" variant="outline" className={styles.copy} disabled={!review.clear || reopening} onClick={() => void reopen()}>{reopening ? "Reopening…" : "Reopen"}</Button>
                    </div>
                  </section>
                ) : null}
              </div>
              <aside className={styles.receipt} aria-labelledby="receipt-heading">
                <div className={styles.receiptHeading}>
                  <h2 id="receipt-heading">Order summary</h2>
                  {receipt.delivery ? <span className={styles.fulfillment}>
                    {receipt.delivery === "pickup" ? <Store size={16} aria-hidden /> : <Truck size={16} aria-hidden />}
                    {receipt.delivery === "pickup" ? "Pickup" : "Delivery"}
                  </span> : null}
                </div>
                <header className={styles.reference}>
                  <div><p className={styles.eyebrow}>ORDER NUMBER</p><p className={styles.orderNumber}>{receipt.orderNumber}</p></div>
                  <Button type="button" variant="outline" className={styles.copy} onClick={() => void copyOrderNumber()} aria-label="Copy order number">
                    {copyState === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
                    {copyState === "copied" ? "Copied" : "Copy number"}
                  </Button>
                  <span className="sr-only" role="status">{copyState === "copied" ? "Copied to clipboard" : ""}</span>
                </header>
                {copyState === "manual" ? (
                  <div className={styles.manual}>
                    <label htmlFor="order-number-copy">Select the order number and copy it.</label>
                    <input id="order-number-copy" ref={numberField} readOnly value={receipt.orderNumber} onFocus={(event) => event.currentTarget.select()} />
                  </div>
                ) : null}
                <div className={styles.receiptMeta}><div><span>Scheduled for</span><strong>{when}</strong></div><div><span>Time slot</span><strong>{receipt.slotLabel}</strong></div></div>
                <ul className={styles.lines}>{receipt.lines.map((line, index) => {
                  const item = receiptLine(line);
                  return <li key={index} className={styles.productLine}>
                    <div className={styles.photoSlot}>{receipt.lineImages?.[index] ? <OrderPhoto key={receipt.lineImages[index].src} image={receipt.lineImages[index]} /> : null}</div>
                    {item ? <div className={styles.itemDetails}>
                      <div className={styles.itemSize}><h3>{item.title}<span className={styles.variant}> · {item.size}</span></h3><strong>{item.amount}</strong></div>
                      <p className={styles.quantity}>{item.quantity} {item.quantity === 1 ? "pc" : "pcs"}{item.unitAmount ? ` · ${item.unitAmount} each` : ""}</p>
                      {item.extras ? <p className={styles.itemExtras}>{item.extras}</p> : null}
                    </div> : <span>{line}</span>}
                  </li>;
                })}</ul>
                {receipt.addonLines.length ? <div className={styles.extras}><h3>Something extra</h3><ul className={styles.lines}>{receipt.addonLines.map((line, index) => {
                  const addon = receiptAddon(line);
                  return <li key={index} className={styles.addonLine}>{addon ? <><span>{addon.title}</span><strong>{addon.amount}</strong></> : line}</li>;
                })}</ul></div> : null}
                <div className={styles.totals}>
                  {typeof receipt.deliveryFeeCentavos === "number" ? <div className={styles.fee}><span>Delivery fee</span><span>₱{(receipt.deliveryFeeCentavos / 100).toFixed(2)}</span></div> : null}
                  {receipt.totalLabel ? <div className={styles.total}><span>Total</span><strong>{receipt.totalLabel}</strong></div> : null}
                  {receipt.paymentLabel ? <p className={styles.payment}>{receipt.paymentLabel}</p> : null}
                </div>
                <p className={styles.receiptFoot}>Made in Cebu. Meant to be shared.</p>
              </aside>
            </div>
          </>
        ) : (
          <div aria-busy="true">
            <p className={styles.eyebrow} role="status">Opening your request…</p>
            <div className={styles.loading} aria-hidden="true"><div><div className={styles.skeletonTitle} /><div className={styles.skeletonLine} /><div className={styles.skeletonBlock} /></div><div className={styles.skeletonReceipt} /></div>
          </div>
        )}
      </section>
    </SiteShell>
  );
}
