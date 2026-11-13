"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createOrderActionQueue } from "./order-action-queue";
import { writeOrder } from "./orders-data";
import { useOrderNotifications } from "./order-notifications";

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
  return <Context.Provider value={queue}>{children}<OrderActionFeedback /></Context.Provider>;
}

function OrderActionFeedback() {
  const { queue, actions } = useOrderActions();
  const { selectOrder } = useOrderNotifications();
  return <aside aria-label="Order actions" className="admin-theme fixed bottom-4 right-4 z-40 grid max-h-[50svh] w-[min(25rem,calc(100vw-2rem))] gap-2 overflow-y-auto">
    {actions.map(action => <Alert key={action.orderId} variant={action.phase === "error" ? "destructive" : "default"} className="relative overflow-hidden bg-background shadow-lg">
      <AlertDescription className="block">
        <div className="flex items-center justify-between gap-3">
          <p role="status">{action.phase === "saving" && <LoaderCircle aria-hidden className="mr-2 inline size-4 animate-spin motion-reduce:animate-none" />}
            {action.orderNumber} · {action.phase === "error" ? "Update not confirmed" : `${orderActionLabels[action.status]}…`}
          </p>
          {action.phase === "pending" && <Button variant="outline" onClick={() => queue.undo(action.orderId)} aria-label={`Undo action for ${action.orderNumber}`}>Undo</Button>}
        </div>
        {action.phase === "pending" && <p className="mt-1 text-xs">Saving in 3 seconds.{action.status !== "confirmed" && " Customer details will be removed."}</p>}
        {action.phase === "error" && <><p className="mt-1 text-sm">{action.error}</p><Button variant="outline" className="mt-2" onClick={() => { selectOrder(action.orderId); queue.dismiss(action.orderId); }}>Review order</Button></>}
      </AlertDescription>
      {action.phase === "pending" && <span aria-hidden className="admin-order-undo-progress absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
    </Alert>)}
  </aside>;
}
