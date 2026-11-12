"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { QueryClientProvider, useIsFetching, useQuery, useQueryClient, onlineManager } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminKey, adminQuery, createAdminQueryClient, invalidateAdmin, resourceFor, redactOrder } from "./query-cache";
import { adminRequest, configureAdminTransport, retireAdminSession } from "./orders-data";
import { nextAdminBoundary } from "./query-clock";
import { manilaToday } from "./orders-data";
import { LoaderCircle, RotateCw } from "lucide-react";

const Account = createContext("");
const OrderQueue = createContext<{ key: string; setKey: (key: string) => void } | null>(null);
const logoutKey = "makalipie-admin-signout";
export const adminOrderQueueStorageKey = "makalipie-admin-order-queue";
export function endAdminSession() {
  retireAdminSession();
  window.dispatchEvent(new Event(logoutKey));
  try { localStorage.setItem(logoutKey, crypto.randomUUID()); } catch {}
}
export function AdminQueryProvider({ accountId, children }: { accountId: string; children: ReactNode }) {
  const [client] = useState(createAdminQueryClient);
  const [ended, setEnded] = useState(false);
  const [orderQueue, setOrderQueue] = useState("");
  const router = useRouter();
  useEffect(() => {
    let saved = "";
    try { saved = localStorage.getItem(adminOrderQueueStorageKey) ?? ""; } catch {}
    setOrderQueue(saved || "regular:cebu");
  }, []);
  useLayoutEffect(() => {
    function clear() {
      retireAdminSession();
      void client.cancelQueries();
      client.clear();
      setEnded(true);
      router.replace("/admin/login");
    }
    function storage(event: StorageEvent) { if (event.key === logoutKey) clear(); }
    configureAdminTransport({ unauthorized: endAdminSession, async mutate<T>(url: string, init: RequestInit, run: () => Promise<T>) {
      const resource = resourceFor(url);
      const business = /^\/api\/admin\/(orders|catalog|drops)$/.test(url);
      if (!navigator.onLine) throw new Error("You’re offline. Reconnect before saving.");
      if (business && client.getQueryCache().findAll().some(q => q.isActive() && q.state.status === "error")) {
        throw new Error("Refresh the latest data before saving.");
      }
      let result!: T;
      // Never retain request variables, passwords, export files or private keys in mutation state.
      const mutation = client.getMutationCache().build(client, { mutationFn: async () => { result = await run(); } });
      try { await mutation.execute(undefined); }
      finally { client.getMutationCache().remove(mutation); }
      if (url === "/api/admin/orders" && typeof init.body === "string") {
        const body = JSON.parse(init.body);
        if (["completed", "cancelled"].includes(body.payload?.status)) redactOrder(client, body.payload.orderId);
      }
      if (business || url.startsWith("/api/admin/backups/key")) {
        await invalidateAdmin(client, resource);
      }
      return result;
    } });
    window.addEventListener(logoutKey, clear);
    window.addEventListener("storage", storage);
    return () => {
      configureAdminTransport(); retireAdminSession();
      void client.cancelQueries(); client.clear();
      window.removeEventListener(logoutKey, clear); window.removeEventListener("storage", storage);
    };
  }, [client, router]);
  return <QueryClientProvider client={client}><Account.Provider value={accountId}><OrderQueue.Provider value={{ key: orderQueue, setKey: setOrderQueue }}>{!ended && children}</OrderQueue.Provider></Account.Provider></QueryClientProvider>;
}
export function useAdminAccount() { return useContext(Account); }
export function useAdminOrderQueue() {
  const context = useContext(OrderQueue);
  if (!context) throw new Error("useAdminOrderQueue must be used within AdminQueryProvider.");
  return context;
}
export function useAdminQuery<T>(url: string, enabled = true) {
  const account = useContext(Account);
  return useQuery({ ...adminQuery<T>(account, url), enabled: enabled && !!account });
}
export function useAdminFetch() {
  const client = useQueryClient();
  const account = useContext(Account);
  return useCallback(<T,>(url: string, previewBody?: object) => {
    const options = adminQuery<T>(account, url);
    if (!previewBody) return client.fetchQuery(options);
    return client.fetchQuery<T>({
      queryKey: [...adminKey(account, url), previewBody],
      queryFn: ({ signal }) => adminRequest<T>(url, { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(previewBody) }),
    });
  }, [client, account]);
}
export function useAdminBlocked() {
  const client = useQueryClient();
  const subscribe = useCallback((notify: () => void) => {
    const a = client.getQueryCache().subscribe(notify);
    const b = onlineManager.subscribe(notify);
    return () => { a(); b(); };
  }, [client]);
  return useSyncExternalStore(subscribe, () => !onlineManager.isOnline() || client.getQueryCache().findAll().some(q => q.isActive() && q.state.status === "error"), () => false);
}
export function AdminFreshness() {
  const client = useQueryClient();
  const fetching = useIsFetching();
  const blocked = useAdminBlocked();
  const [showRefreshing, setShowRefreshing] = useState(false);
  useEffect(() => {
    if (!fetching) {
      setShowRefreshing(false);
      return;
    }
    const timer = setTimeout(() => setShowRefreshing(true), 450);
    return () => clearTimeout(timer);
  }, [fetching > 0]);

  return <div role="status" aria-live="polite" className="flex h-8 w-24 shrink-0 items-center justify-end gap-1 text-xs text-muted-foreground">
    {blocked ? <>
      <span className="hidden sm:inline">Outdated</span>
      <Button size="icon-sm" variant="ghost" aria-label="Retry refreshing admin data" title="Retry" onClick={() => void invalidateAdmin(client)}>
        <RotateCw aria-hidden="true" />
      </Button>
    </> : showRefreshing ? <><LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /><span className="hidden sm:inline">Refreshing</span><span className="sr-only">Refreshing admin data</span></> : null}
  </div>;
}
export function AdminClock() {
  const client = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      clearTimeout(timer);
      const next = nextAdminBoundary(client.getQueryCache().getAll().map(query => query.state.data));
      timer = setTimeout(() => {
        window.dispatchEvent(new Event("makalipie-admin-day"));
        void invalidateAdmin(client); schedule();
      }, Math.max(1, next - Date.now() + 50));
    }
    schedule();
    const unsubscribe = client.getQueryCache().subscribe(event => { if (event.type === "updated" && event.action.type === "success") schedule(); });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [client]);
  return null;
}

function subscribeDay(notify: () => void) {
  window.addEventListener("makalipie-admin-day", notify);
  window.addEventListener("focus", notify);
  document.addEventListener("visibilitychange", notify);
  return () => {
    window.removeEventListener("makalipie-admin-day", notify);
    window.removeEventListener("focus", notify);
    document.removeEventListener("visibilitychange", notify);
  };
}
export function useAdminToday() { return useSyncExternalStore(subscribeDay, manilaToday, manilaToday); }
