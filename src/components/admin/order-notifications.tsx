"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Monitor, ShoppingBag, Truck, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { adminRequest, pesos } from "./orders-data";

type Entry = { id: string; receivedAt: number; read: boolean };
type OrderSummary = { number: string; fulfillment: string; amountCentavos: number; deliveryFeeMode: string | null; sourceLabel: string };
type Token = { url: string; publishableKey: string; accessToken: string; expiresAt: number };

function readEntries(key: string): Entry[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(stored) ? stored.filter(item =>
      item && typeof item.id === "string" && Number.isFinite(item.receivedAt) && typeof item.read === "boolean",
    ).map(({ id, receivedAt, read }) => ({ id, receivedAt, read })).slice(0, 100) : [];
  } catch {
    return [];
  }
}

function playSound() {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    volume.gain.value = 0.12;
    oscillator.frequency.value = 660;
    oscillator.connect(volume).connect(context.destination);
    oscillator.onended = () => { void context.close(); };
    oscillator.start();
    oscillator.stop(context.currentTime + 0.16);
  } catch {}
}

const desktopPreference = "makalipie-order-desktop-notifications";

function desktopPermission(): NotificationPermission | "unsupported" {
  return window.isSecureContext && "Notification" in window ? Notification.permission : "unsupported";
}

function desktopEnabled() {
  try { return localStorage.getItem(desktopPreference) === "on"; } catch { return false; }
}

function showDesktopNotification(body: string, tag: string) {
  const notification = new Notification("Makalipie Admin", { body, tag, silent: true });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
  return notification;
}

const Notifications = createContext<{
  entries: Entry[];
  connected: boolean;
  revision: number;
  sound: boolean;
  setSound: (enabled: boolean) => void;
  desktop: { enabled: boolean; permission: NotificationPermission | "unsupported" } | null;
  requestingDesktop: boolean;
  desktopMessage: string;
  setDesktop: (enabled: boolean) => Promise<void>;
  testDesktop: () => void;
  request: { id: string } | null;
  consumeRequest: () => void;
  editorOpen: boolean;
  setEditorOpen: (open: boolean) => void;
  openOrder: (id: string) => void;
  selectOrder: (id: string) => void;
} | null>(null);

export function useOrderNotifications() {
  const context = useContext(Notifications);
  if (!context) throw new Error("Order notifications require the admin provider.");
  return context;
}

export function OrderNotificationsProvider({ accountId, children }: { accountId: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [connected, setConnected] = useState(false);
  const [revision, setRevision] = useState(0);
  const [sound, setSoundState] = useState(false);
  const [desktop, setDesktopState] = useState<{ enabled: boolean; permission: NotificationPermission | "unsupported" } | null>(null);
  const [requestingDesktop, setRequestingDesktop] = useState(false);
  const [desktopMessage, setDesktopMessage] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [request, setRequest] = useState<{ id: string } | null>(null);
  const storageKey = useRef("");
  const current = useRef<Entry[]>([]);
  const soundEnabled = useRef(false);

  const syncDesktop = useCallback(() => {
    const permission = desktopPermission();
    setDesktopState({ permission, enabled: permission === "granted" && desktopEnabled() });
  }, []);

  useEffect(() => {
    let active = true;
    let permissionStatus: PermissionStatus | undefined;
    void Promise.resolve().then(() => { if (active) syncDesktop(); });
    if (desktopPermission() !== "unsupported") {
      void navigator.permissions?.query({ name: "notifications" }).then(status => {
        if (!active) return;
        permissionStatus = status;
        status.addEventListener("change", syncDesktop);
        syncDesktop();
      }).catch(() => {});
    }
    function syncPreference(event: StorageEvent) {
      if (event.key === desktopPreference || event.key === null) syncDesktop();
    }
    window.addEventListener("focus", syncDesktop);
    window.addEventListener("storage", syncPreference);
    return () => {
      active = false;
      permissionStatus?.removeEventListener("change", syncDesktop);
      window.removeEventListener("focus", syncDesktop);
      window.removeEventListener("storage", syncPreference);
    };
  }, [syncDesktop]);

  async function setDesktop(enabled: boolean) {
    setDesktopMessage("");
    setRequestingDesktop(true);
    try {
      const permission = desktopPermission();
      if (enabled && permission === "unsupported") return;
      const result = enabled && permission === "default" ? await Notification.requestPermission() : permission;
      if (enabled && result !== "granted") {
        if (result === "default") setDesktopMessage("Allow notifications in your browser to turn these on.");
        return;
      }
      localStorage.setItem(desktopPreference, enabled ? "on" : "off");
    } catch {
      setDesktopMessage("Couldn’t update desktop notifications in this browser.");
    } finally {
      syncDesktop();
      setRequestingDesktop(false);
    }
  }

  function testDesktop() {
    syncDesktop();
    if (desktopPermission() !== "granted" || !desktopEnabled()) return;
    try {
      const notification = showDesktopNotification("Desktop notifications are ready for new orders.", "makalipie-admin-test");
      setDesktopMessage("Test requested. Check your system notifications.");
      notification.onerror = () => setDesktopMessage("The test notification couldn’t be displayed. Check your browser and system settings.");
    } catch {
      setDesktopMessage("This browser couldn’t display the test notification.");
    }
  }

  function save(next: Entry[]) {
    current.current = next;
    setEntries(next);
    try { if (storageKey.current) localStorage.setItem(storageKey.current, JSON.stringify(next)); } catch {}
  }

  useEffect(() => {
    let disposed = false;
    let client: SupabaseClient | undefined;
    let timer: ReturnType<typeof setTimeout>;

    async function connect() {
      try {
        const token = await adminRequest<Token>("/api/admin/realtime/token?connection=1");
        if (disposed) return;
        const key = "makalipie-order-notifications:" + token.url + ":" + accountId;
        if (storageKey.current !== key) {
          storageKey.current = key;
          current.current = readEntries(key);
          setEntries(current.current);
          try { soundEnabled.current = localStorage.getItem("makalipie-order-sound") === "on"; } catch {}
          setSoundState(soundEnabled.current);
        }
        if (client) {
          setConnected(false);
          await client.removeAllChannels();
          client.realtime.disconnect();
          if (disposed) return;
        }
        client = createClient(token.url, token.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
        await client.realtime.setAuth(token.accessToken);
        if (disposed) return;
        client.channel("orders", { config: { private: true } }).on("broadcast", { event: "order" }, ({ payload }) => {
          if (disposed || typeof payload.orderId !== "string") return;
          setRevision(value => value + 1);
          if (payload.changeType === "created" && !current.current.some(entry => entry.id === payload.orderId)) {
            const alreadyReceived = readEntries(key).some(entry => entry.id === payload.orderId);
            save([{ id: payload.orderId, receivedAt: Date.now(), read: false }, ...current.current].slice(0, 100));
            if (soundEnabled.current) playSound();
            if (!alreadyReceived && desktopEnabled() && desktopPermission() === "granted") {
              try { showDesktopNotification("A new order is ready to review.", key + ":" + payload.orderId); } catch {}
            }
          }
        }).subscribe(status => {
          if (disposed) return;
          setConnected(status === "SUBSCRIBED");
          if (status === "SUBSCRIBED") setRevision(value => value + 1);
        });
        timer = setTimeout(() => { void connect(); }, Math.max(1000, token.expiresAt * 1000 - Date.now() - 30_000));
      } catch {
        if (!disposed) {
          setConnected(false);
          timer = setTimeout(() => { void connect(); }, 5000);
        }
      }
    }

    function sync(event: StorageEvent) {
      if (event.key && event.key === storageKey.current) {
        current.current = readEntries(event.key);
        setEntries(current.current);
      }
    }

    window.addEventListener("storage", sync);
    void connect();
    return () => {
      disposed = true;
      window.removeEventListener("storage", sync);
      clearTimeout(timer);
      if (client) { void client.removeAllChannels(); client.realtime.disconnect(); }
    };
  }, [accountId]);

  const consumeRequest = useCallback(() => setRequest(null), []);

  function selectOrder(id: string) {
    setRequest({ id });
    setRevision(value => value + 1);
    if (pathname !== "/admin/orders") router.push("/admin/orders");
  }

  return <Notifications.Provider value={{
    entries, connected, revision, sound, desktop, requestingDesktop, desktopMessage, setDesktop, testDesktop, request, consumeRequest, editorOpen, setEditorOpen, selectOrder,
    setSound(enabled) {
      setSoundState(enabled);
      soundEnabled.current = enabled;
      try { localStorage.setItem("makalipie-order-sound", enabled ? "on" : "off"); } catch {}
      if (enabled) playSound();
    },
    openOrder(id) {
      if (editorOpen) return;
      save(current.current.map(entry => entry.id === id ? { ...entry, read: true } : entry));
      selectOrder(id);
    },
  }}>{children}</Notifications.Provider>;
}

export function OrderNotificationBell() {
  const { entries, editorOpen, openOrder, sound, setSound, desktop, requestingDesktop, desktopMessage, setDesktop, testDesktop } = useOrderNotifications();
  const [open, setOpen] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, OrderSummary>>({});
  const soundId = useId();
  const desktopId = useId();
  const desktopDescription = desktop?.permission === "denied"
    ? "Blocked in your browser. Allow notifications in this site’s settings."
    : desktop?.permission === "unsupported" ? "Desktop notifications are unavailable in this browser."
    : "Show new orders in system notifications while Admin is open.";
  const unread = entries.filter(entry => !entry.read).length;
  const ids = entries.map(entry => entry.id).join(",");

  useEffect(() => {
    if (!open || !ids) return;
    const controller = new AbortController();
    void adminRequest<Record<string, OrderSummary>>("/api/admin/orders/numbers?ids=" + ids, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setSummaries(result); })
      .catch(() => {});
    return () => controller.abort();
  }, [ids, open]);

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={<Button variant="ghost" className="relative size-11 md:size-9" aria-label={`Notifications, ${unread} unread`} />}>
      <Bell className="size-4" aria-hidden="true" />
      {unread > 0 && <span aria-hidden="true" className="absolute top-0 right-0 min-w-5 rounded-full bg-primary px-1 text-center text-xs font-semibold text-primary-foreground">{unread}</span>}
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} className="admin-theme max-h-[var(--available-height)] w-[min(24rem,calc(100vw-2rem))] gap-0 overflow-y-auto bg-white p-0 text-neutral-900">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <PopoverTitle className="text-base font-semibold tracking-tight">Notifications</PopoverTitle>
        <Badge className="bg-accent px-2 text-xs font-medium normal-case tracking-normal text-accent-foreground">{unread} unread</Badge>
      </div>
      {editorOpen && <p className="px-4 pt-3 text-xs text-muted-foreground">Close the order editor to open a notification.</p>}
      {entries.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">No order notifications yet.</p> :
        <ul className="max-h-[min(56dvh,21rem)] divide-y overflow-y-auto overscroll-contain px-2 py-1">
          {entries.map(entry => {
            const summary = summaries[entry.id];
            const delivery = summary?.fulfillment === "delivery";
            const Icon = delivery ? Truck : ShoppingBag;
            const feeNote = summary?.deliveryFeeMode === "unknown" ? "Fee pending"
              : summary?.deliveryFeeMode === "rider" ? "Customer pays rider" : null;
            return <li key={entry.id}>
            <Button
              variant="ghost"
              disabled={editorOpen}
              className="h-auto min-h-12 w-full justify-start gap-3 whitespace-normal px-2 py-2 text-left"
              onClick={() => { openOrder(entry.id); setOpen(false); }}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block break-words text-sm ${entry.read ? "font-medium" : "font-semibold"}`}>{summary?.number ?? "Order notification"}</span>
                {summary?.sourceLabel && <span className="block break-words text-xs text-muted-foreground">{summary.sourceLabel}</span>}
                {summary && <span className="block text-xs text-muted-foreground">
                  {delivery ? "Delivery" : "Pickup"}{feeNote ? " · " + feeNote : ""}
                </span>}
              </span>
              {summary && <span className="shrink-0 text-right tabular-nums">
                <span className="block text-sm font-medium">{pesos(summary.amountCentavos)}</span>
                {summary.deliveryFeeMode === "unknown" && <span className="block text-xs text-muted-foreground">Subtotal</span>}
              </span>}
              {entry.read ? <span className="size-1.5 shrink-0" aria-hidden="true" /> : <>
                <span className="sr-only">Unread</span>
                <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              </>}
            </Button>
          </li>;
          })}
        </ul>}
      <div className="flex items-center gap-3 border-t px-4 py-3">
        <Volume2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <label htmlFor={soundId} className="cursor-pointer text-sm font-medium">Notification sound</label>
          <p id={soundId + "-description"} className="text-xs text-muted-foreground">Play a sound for new orders</p>
        </div>
        <Switch id={soundId} aria-describedby={soundId + "-description"} checked={sound} onCheckedChange={setSound} />
      </div>
      <div className="grid gap-2 border-t px-4 py-3">
        <div className="flex items-center gap-3">
          <Monitor className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <label htmlFor={desktopId} className="text-sm font-medium">Desktop notifications</label>
            <p id={desktopId + "-description"} className="text-xs text-muted-foreground">{desktopDescription}</p>
          </div>
          <Switch id={desktopId} aria-describedby={desktopId + "-description"} checked={desktop?.enabled ?? false}
            disabled={!desktop || requestingDesktop || desktop.permission === "denied" || desktop.permission === "unsupported"}
            onCheckedChange={enabled => { void setDesktop(enabled); }} />
        </div>
        {desktop?.enabled && <Button type="button" variant="outline" size="sm" className="ml-7 justify-self-start" onClick={testDesktop}>Send test notification</Button>}
        {desktopMessage && <p role="status" className="ml-7 text-xs text-muted-foreground">{desktopMessage}</p>}
      </div>
    </PopoverContent>
  </Popover>;
}
