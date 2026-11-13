"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { LoaderCircle } from "lucide-react";
import { createOrderActionQueue, ORDER_UNDO_MS, type PendingOrderAction } from "./order-action-queue";
import { writeOrder } from "./orders-data";

const Context = createContext<ReturnType<typeof createOrderActionQueue> | null>(null);
export const orderActionLabels = { confirmed: "Confirming", completed: "Completing", cancelled: "Cancelling" };

export function useOrderActions() {
  const queue = useContext(Context);
  if (!queue) throw new Error("Order actions require the admin shell.");
  const actions = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  return { queue, actions };
}

export function OrderActionsProvider({ children }: { children: ReactNode }) {
  const [queue] = useState(() => createOrderActionQueue((action, signal) => writeOrder("transition_order", {
    orderId: action.orderId, updatedAt: action.updatedAt, status: action.status,
  }, signal)));
  useEffect(() => {
    window.addEventListener("pagehide", queue.clear);
    return () => { window.removeEventListener("pagehide", queue.clear); queue.clear(); };
  }, [queue]);
  return <Context.Provider value={queue}>{children}</Context.Provider>;
}

/** The deadline keeps the ring aligned with the existing timer across rerenders. */
function OrderActionButtonContent({ action }: { action?: PendingOrderAction }) {
  const ring = useRef<SVGCircleElement>(null);
  useLayoutEffect(() => {
    if (action?.phase !== "pending" || !ring.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | undefined;
    const update = () => {
      animation?.cancel();
      if (!reduced.matches) animation = ring.current?.animate(
        [{ strokeDashoffset: 0 }, { strokeDashoffset: 100 }],
        { duration: ORDER_UNDO_MS, delay: -Math.max(0, Date.now() - action.deadline + ORDER_UNDO_MS), easing: "linear", fill: "forwards" },
      );
    };
    update();
    reduced.addEventListener("change", update);
    return () => { animation?.cancel(); reduced.removeEventListener("change", update); };
  }, [action?.deadline, action?.phase]);
  if (!action || action.phase === "pending") return <>
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 -rotate-90" fill="none">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" opacity="0.2" />
      <circle ref={ring} cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" pathLength="100" strokeDasharray="100" />
    </svg>
    <span>Undo</span>
  </>;
  return <><LoaderCircle aria-hidden="true" className="shrink-0 animate-spin motion-reduce:animate-none" /><span>{orderActionLabels[action.status]}…</span></>;
}

/** Persistent faces let CSS reverse an interrupted transition without remounting the button. */
export function SlidingOrderActionButton({ action, label, children, variant = "default", className = "", ...props }: ComponentProps<typeof Button> & {
  action?: PendingOrderAction;
  label: string;
}) {
  const active = action?.phase === "pending" || action?.phase === "saving";
  const accessibleLabel = action?.phase === "pending" ? "Undo" : action?.phase === "saving" ? `${orderActionLabels[action.status]}…` : label;
  return <Button {...props} variant={variant} className={`admin-order-action ${className}`}
    aria-label={accessibleLabel} data-action-active={active ? "" : undefined}
    data-action-saving={action?.phase === "saving" ? "" : undefined} data-action-tone={variant}>
    <span aria-hidden="true" className="invisible inline-flex items-center justify-center gap-1.5">{children ?? label}</span>
    <span aria-hidden="true" className="admin-order-action-background" />
    <span aria-hidden="true" className="admin-order-action-face admin-order-action-original">{children ?? label}</span>
    <span aria-hidden="true" className="admin-order-action-face admin-order-action-undo"><OrderActionButtonContent action={active ? action : undefined} /></span>
  </Button>;
}
