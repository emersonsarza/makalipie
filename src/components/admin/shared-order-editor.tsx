"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AdminOrder } from "@/lib/orders/query";
import type { StoreCatalog } from "@/lib/storefront/types";
import type { DropStore } from "@/lib/drops/types";
import { OrderEditor } from "./order-editor";
import { useOrderNotifications } from "./order-notifications";
import { adminRequest } from "./orders-data";

const EditorContext = createContext<{
  busy: boolean;
  open: (order: AdminOrder | null, trigger: HTMLElement) => void;
} | null>(null);

export function useSharedOrderEditor() {
  const context = useContext(EditorContext);
  if (!context) throw new Error("The shared order editor requires the admin shell.");
  return context;
}

export function SharedOrderEditor({ children }: { children: ReactNode }) {
  const { revision, setEditorOpen, selectOrder } = useOrderNotifications();
  const [draft, setDraft] = useState<{ order: AdminOrder | null; catalog: StoreCatalog; drops: DropStore }>();
  const [visible, setVisible] = useState(false);
  const afterClose = useRef<(() => void) | null>(null);
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const trigger = useRef<HTMLElement | null>(null);
  const locked = useRef(false);
  const orderId = draft?.order?.id;
  const updatedAt = draft?.order?.updatedAt;

  useEffect(() => {
    if (!orderId) return;
    const controller = new AbortController();
    void adminRequest<AdminOrder>("/api/admin/orders/" + encodeURIComponent(orderId), { signal: controller.signal })
      .then(order => {
        if (!controller.signal.aborted && order.updatedAt !== updatedAt) setStale(true);
      }).catch(() => {});
    return () => controller.abort();
  }, [orderId, updatedAt, revision]);

  useEffect(() => {
    if (!draft) return;
    // Commit the closed Sheet before starting its enter transition.
    let nextFrame = 0;
    const frame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(nextFrame);
    };
  }, [draft]);

  async function open(order: AdminOrder | null, button: HTMLElement) {
    if (locked.current) return;
    locked.current = true;
    trigger.current = button;
    setEditorOpen(true);
    setLoading(true);
    setError("");
    setStale(false);
    try {
      const [catalog, drops] = await Promise.all([
        adminRequest<StoreCatalog>("/api/admin/catalog"),
        adminRequest<DropStore>("/api/admin/drops"),
      ]);
      setDraft({ order, catalog, drops });

    } catch {
      setError("Could not load the order editor. Try again.");
      setEditorOpen(false);
      locked.current = false;
    } finally { setLoading(false); }
  }

  function close(next?: () => void) {
    afterClose.current = next ?? null;
    setVisible(false);
  }

  function finishClose() {
    setDraft(undefined);
    setEditorOpen(false);
    locked.current = false;
    const next = afterClose.current;
    afterClose.current = null;
    requestAnimationFrame(() => {
      if (trigger.current?.isConnected) trigger.current.focus();
      next?.();
    });
  }

  return <EditorContext.Provider value={{ busy: loading || !!draft, open: (order, button) => { void open(order, button); } }}>
    {error && <Alert variant="destructive" role="alert" className="m-4"><AlertDescription>{error}</AlertDescription></Alert>}
    {children}
    {draft && <OrderEditor order={draft.order} catalog={draft.catalog} drops={draft.drops} stale={stale}
      open={visible} onClosed={finishClose} close={() => close()}
      reload={() => { const id = draft.order?.id; close(id ? () => selectOrder(id) : undefined); }}
      saved={id => close(() => selectOrder(id))} />}
  </EditorContext.Provider>;
}
