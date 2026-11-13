"use client";

import { BackupProvider } from "./backups/backup-provider";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AdminQueryProvider, AdminFreshness, AdminClock, endAdminSession, useAdminOrderQueue, useAdminQuery } from "./query-provider";
import { adminRequest, OrderRequestError } from "./orders-data";
import { OrderNotificationBell, OrderNotificationsProvider, useOrderNotifications } from "./order-notifications";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AdminConfirmProvider } from "./admin-confirm";
import { OrderActionsProvider } from "./order-actions";
import { SharedOrderEditor, useSharedOrderEditor } from "./shared-order-editor";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { AlertCircle, CalendarDays, ChevronDown, ListChecks, Cookie, LayoutDashboard, LogOut, Package, Plus, Settings, ShoppingBag, Store } from "lucide-react";

const pages = [
  { label: "Orders", href: "/admin/orders", icon: ShoppingBag },
  { label: "Daily Lineup", href: "/admin/lineup", icon: ListChecks },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Add-ons", href: "/admin/addons", icon: Cookie },
  { label: "Schedules", href: "/admin/schedules", icon: CalendarDays },
  { label: "Drops", href: "/admin/drops", icon: LayoutDashboard },
  { label: "Storefront", href: "/admin/storefront", icon: Store },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

function AdminNavigation({ pathname }: { pathname: string }) {
  const { setOpenMobile } = useSidebar();
  const { key: queue } = useAdminOrderQueue();
  const attentionQuery = useAdminQuery<{ count: number }>(
    "/api/admin/orders/attention-count?queue=" + encodeURIComponent(queue), !!queue,
  );
  const attentionCount = attentionQuery.data?.count ?? 0;

  return (
    <SidebarMenu className="admin-nav-menu relative isolate gap-1" style={{
      "--admin-active-row": pages.findIndex(page => page.href === pathname),
    } as React.CSSProperties}>
      {pages.map(({ label, href, icon: Icon }) => {
        const showAttention = label === "Orders" && attentionCount > 0;
        const countLabel = `${attentionCount} ${attentionCount === 1 ? "order needs" : "orders need"} attention`;
        return (
          <SidebarMenuItem key={href}>
            <SidebarMenuButton
              render={<Link href={href} onNavigate={() => setOpenMobile(false)} />}
              data-order-link={label === "Orders" || undefined}
              isActive={pathname === href}
              aria-current={pathname === href ? "page" : undefined}
              aria-label={showAttention ? `${label}, ${countLabel}` : label}
              tooltip={showAttention ? `${label} · ${countLabel}` : label}
              className="relative group-data-[collapsible=icon]:size-12! group-data-[collapsible=icon]:overflow-visible! group-data-[collapsible=icon]:p-0!"
            >
              <Icon aria-hidden="true" />
              <span className="admin-nav-label">
                <span className="admin-nav-label-text">{label}</span>
                {showAttention && <span aria-hidden="true" className="admin-order-count inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[10px] font-semibold leading-none tabular-nums group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:right-0 group-data-[collapsible=icon]:top-0 group-data-[collapsible=icon]:z-10 group-data-[collapsible=icon]:h-4 group-data-[collapsible=icon]:min-w-4 group-data-[collapsible=icon]:translate-x-1/4 group-data-[collapsible=icon]:-translate-y-1/4 group-data-[collapsible=icon]:px-0">{attentionCount > 99 ? "99+" : attentionCount}</span>}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function OrdersLiveStatus() {
  const { connected } = useOrderNotifications();
  return <Badge role="status" className={`shrink-0 gap-1 whitespace-nowrap px-1.5 text-[11px] font-medium normal-case tracking-normal ${connected ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-600"}`}>
    <span aria-hidden="true" className={`size-1.5 rounded-full ${connected ? "bg-green-600" : "bg-neutral-400"}`} />
    {connected ? "Live" : "Reconnecting"}
  </Badge>;
}

function NewOrderButton() {
  const editor = useSharedOrderEditor();
  return <Tooltip>
    <TooltipTrigger render={<Button variant="outline" className="h-11 w-11 px-0 text-sm md:h-9 md:w-auto md:px-3" aria-label="New order"
      aria-disabled={editor.busy} onClick={event => editor.open(null, event.currentTarget)} />}>
      <Plus className="size-4" aria-hidden="true" />
      <span className="hidden md:inline">New order</span>
    </TooltipTrigger>
    <TooltipContent className="admin-theme md:hidden">New order</TooltipContent>
  </Tooltip>;
}

function AccountMenu({ email, signOut }: { email: string; signOut: () => Promise<void> }) {
  const initials = email.split("@")[0].replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "A";
  const { isMobile } = useSidebar();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  return <Popover>
    <PopoverTrigger render={<Button variant="ghost" aria-label={`Account: ${email}`}
      className="h-12 w-full min-w-0 justify-start gap-2 px-2 group-data-[collapsible=icon]:size-12 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0" />}>
      <Avatar className="size-7" aria-hidden="true"><AvatarFallback>{initials}</AvatarFallback></Avatar>
      <span className="admin-brand-copy min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
        <span className="block text-sm font-medium">Account</span>
        <span className="block truncate text-xs text-muted-foreground">{email}</span>
      </span>
      <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
    </PopoverTrigger>
    <PopoverContent side={isMobile ? "top" : "right"} align="end" sideOffset={8} className="admin-theme bg-white text-neutral-900" aria-label="Account">
      <p className="break-all px-2 pt-1 text-sm font-medium">{email}</p>
      {failed && <p role="alert" className="px-2 text-sm text-red-700">Could not sign out. Try again.</p>}
      <Button variant="ghost" className="min-h-11 justify-start" disabled={pending} onClick={async () => {
        setPending(true);
        setFailed(false);
        try { await signOut(); } catch { setFailed(true); setPending(false); }
      }}><LogOut className="size-5" aria-hidden="true" />{pending ? "Signing out…" : "Sign out"}</Button>
    </PopoverContent>
  </Popover>;
}

export function AdminWorkspace({ children, preview = false }: { children: ReactNode; preview?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [account, setAccount] = useState<{ id: string; email: string }>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(window.matchMedia("(min-width: 1024px)").matches);
  }, []);

  const checkSession = useCallback(async (signal?: AbortSignal) => {
    try {
      const { user } = await adminRequest<{ user: { id: string; email: string } }>("/api/admin/session", { signal });
      setAccount(user);
      setState("ready");
    } catch (error) {
      if (signal?.aborted || error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof OrderRequestError && error.status === 401) { router.replace("/admin/login"); return; }
      setState("error");
    }
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => checkSession(controller.signal));
    return () => controller.abort();
  }, [checkSession]);

  async function signOut() {
    await adminRequest("/api/admin/session/logout", { method: "POST" });
    endAdminSession();
    router.replace("/admin/login");
    router.refresh();
  }

  if (state === "loading") return <main className="admin-theme min-h-svh p-6"><div className="mx-auto max-w-5xl space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-[70vh] w-full" /></div></main>;
  if (state === "error" || !account) return <main className="admin-theme grid min-h-svh place-items-center p-6"><div className="w-full max-w-md space-y-4"><Alert variant="destructive"><AlertCircle /><AlertTitle>Admin is temporarily unavailable</AlertTitle><AlertDescription>We couldn’t verify your session. Your account is unchanged.</AlertDescription></Alert><Button onClick={() => { setState("loading"); void checkSession(); }}>Try again</Button></div></main>;

  return (
    <AdminQueryProvider key={account.id} accountId={account.id}><AdminClock /><div className={preview ? "min-h-svh" : "admin-theme min-h-svh"}>
      <BackupProvider key={account.id} accountId={account.id}>
      <OrderNotificationsProvider key={account.id} accountId={account.id}>
      <TooltipProvider>
      <AdminConfirmProvider>
      <OrderActionsProvider><SharedOrderEditor>
        {preview ? <><div className="admin-theme"><AdminFreshness /></div>{children}</> : <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen} style={{ "--sidebar-width-icon": "4rem" } as React.CSSProperties}>
          <Sidebar collapsible="icon" mobileClassName="admin-theme admin-mobile-sidebar">
            <SidebarHeader className="admin-sidebar-header h-[72px] justify-center px-3">
              <Link href="/admin/orders" className="admin-wordmark" aria-label="Makalipie Admin">
                <Image src="/brand/seal.png" alt="" width={40} height={40} className="size-10 shrink-0" />
                <span className="admin-brand-copy">Makalipie <span className="text-muted-foreground">Admin</span></span>
              </Link>
            </SidebarHeader>
            <SidebarContent className="overflow-y-auto">
              <SidebarGroup className="px-2 py-3">
                <SidebarGroupContent>
                  <nav aria-label="Admin navigation">
                    <AdminNavigation pathname={pathname} />
                  </nav>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="shrink-0 border-t p-2">
              <AccountMenu email={account.email} signOut={signOut} />
            </SidebarFooter>
          </Sidebar>
          <SidebarInset className="min-w-0">
            <header className="admin-topbar sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-2 sm:px-4">
              <SidebarTrigger className="size-11 md:size-9" />
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <h1 className="truncate text-base font-semibold tracking-tight">
                  {pages.find((page) => page.href === pathname)?.label ?? "Admin"}
                </h1>
                <OrdersLiveStatus />
                <AdminFreshness />
              </div>
              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                <NewOrderButton />
                <OrderNotificationBell />
              </div>
            </header>
            <div className="min-w-0 flex-1 p-4 sm:p-6"><div key={pathname} className="admin-page-enter">{children}</div></div>
          </SidebarInset>
        </SidebarProvider>}
      </SharedOrderEditor></OrderActionsProvider>
      </AdminConfirmProvider>
      </TooltipProvider>
      </OrderNotificationsProvider>
      </BackupProvider>
    </div></AdminQueryProvider>
  );
}
