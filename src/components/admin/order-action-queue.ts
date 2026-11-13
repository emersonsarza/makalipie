export type OrderAction = {
  orderId: string;
  orderNumber: string;
  updatedAt: string;
  status: "confirmed" | "completed" | "cancelled";
};
export type PendingOrderAction = OrderAction & { phase: "pending" | "saving" | "error"; deadline: number; error?: string };
export const ORDER_UNDO_MS = 3000;

/** Stores identifiers and revisions only; never retains customer details. */
export function createOrderActionQueue(send: (action: OrderAction, signal: AbortSignal) => Promise<unknown>) {
  let snapshot: PendingOrderAction[] = [];
  const listeners = new Set<() => void>();
  const jobs = new Map<string, { timer: ReturnType<typeof setTimeout>; controller: AbortController }>();
  const publish = (next: PendingOrderAction[]) => { snapshot = next; listeners.forEach(notify => notify()); };
  const remove = (id: string) => publish(snapshot.filter(action => action.orderId !== id));
  return {
    subscribe: (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; },
    getSnapshot: () => snapshot,
    schedule(action: OrderAction) {
      if (snapshot.some(item => item.orderId === action.orderId && item.phase !== "error")) return;
      const deadline = Date.now() + ORDER_UNDO_MS;
      const controller = new AbortController();
      const timer = setTimeout(async () => {
        publish(snapshot.map(item => item.orderId === action.orderId ? { ...action, deadline, phase: "saving" } : item));
        try {
          await send(action, controller.signal);
          if (!controller.signal.aborted) remove(action.orderId);
        } catch (error) {
          if (!controller.signal.aborted) publish(snapshot.map(item => item.orderId === action.orderId
            ? { ...action, deadline, phase: "error", error: error instanceof Error ? error.message : "Could not update the order. Refresh before trying again." } : item));
        } finally {
          if (jobs.get(action.orderId)?.controller === controller) jobs.delete(action.orderId);
        }
      }, ORDER_UNDO_MS);
      jobs.set(action.orderId, { timer, controller });
      publish([...snapshot.filter(item => item.orderId !== action.orderId), { ...action, deadline, phase: "pending" }]);
    },
    undo(id: string) {
      if (!snapshot.some(item => item.orderId === id && item.phase === "pending")) return;
      const job = jobs.get(id);
      clearTimeout(job?.timer);
      job?.controller.abort();
      jobs.delete(id);
      remove(id);
    },
    dismiss(id: string) { if (snapshot.some(item => item.orderId === id && item.phase === "error")) remove(id); },
    clear() {
      jobs.forEach(job => { clearTimeout(job.timer); job.controller.abort(); });
      jobs.clear();
      publish([]);
    },
  };
}
