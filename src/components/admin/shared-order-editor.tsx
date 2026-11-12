"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AdminOrder } from "@/lib/orders/query";
import type { StoreCatalog } from "@/lib/storefront/types";
import type { DropStore } from "@/lib/drops/types";
import { OrderEditor } from "./order-editor";
import { useOrderNotifications } from "./order-notifications";
import { useAdminFetch, useAdminQuery, useAdminBlocked } from "./query-provider";

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
  const fetchAdmin = useAdminFetch();
  const blocked = useAdminBlocked();
  const { setEditorOpen, selectOrder } = useOrderNotifications();
  const [draft, setDraft] = useState<{ order: AdminOrder | null; catalog: StoreCatalog; drops: DropStore }>();
  const [visible, setVisible] = useState(false);
  const afterClose = useRef<(() => void) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const trigger = useRef<HTMLElement | null>(null);
  const locked = useRef(false);
  const orderId = draft?.order?.id;
  const updatedAt = draft?.order?.updatedAt;

  const currentOrder = useAdminQuery<AdminOrder>("/api/admin/orders/" + encodeURIComponent(orderId ?? ""), !!orderId);
  const currentCatalog = useAdminQuery<StoreCatalog>("/api/admin/catalog", !!draft);
  const currentDrops = useAdminQuery<DropStore>("/api/admin/drops", !!draft);
  const stale = blocked || !!draft && ((!!currentOrder.data && currentOrder.data.updatedAt !== updatedAt) || currentCatalog.data?.revision !== draft.catalog.revision || currentDrops.data?.revision !== draft.drops.revision);

  useEffect(() => {
    if (currentOrder.data?.status !== "completed" && currentOrder.data?.status !== "cancelled") return;
    // Terminal transitions remove personal information, including a draft held outside the cache.
    void Promise.resolve().then(() => {
      setDraft(undefined); setVisible(false); setEditorOpen(false); locked.current = false;
    });
  }, [currentOrder.data?.status, setEditorOpen]);

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
    if (locked.current || blocked) return;
    locked.current = true;
    trigger.current = button;
    setEditorOpen(true);
    setLoading(true);
    setError("");
    try {
      const [catalog, drops, latest] = await Promise.all([
        fetchAdmin<StoreCatalog>("/api/admin/catalog"),
        fetchAdmin<DropStore>("/api/admin/drops"),
        order ? fetchAdmin<AdminOrder>("/api/admin/orders/" + encodeURIComponent(order.id)) : Promise.resolve(null),
      ]);
      setDraft({ order: latest, catalog, drops });

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

  return <EditorContext.Provider value={{ busy: blocked || loading || !!draft, open: (order, button) => { void open(order, button); } }}>
    {error && <Alert variant="destructive" role="alert" className="m-4"><AlertDescription>{error}</AlertDescription></Alert>}
    {children}
    {draft && <OrderEditor order={draft.order} catalog={draft.catalog} drops={draft.drops} stale={stale}
      open={visible} onClosed={finishClose} close={() => close()}
      reload={() => { const id = draft.order?.id; close(id ? () => selectOrder(id) : undefined); }}
      saved={id => close(() => selectOrder(id))} />}
  </EditorContext.Provider>;
}
