"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";

function pageCopy(pathname: string) {
  if (pathname.startsWith("/admin/schedule")) return { title: "Bakery schedule", description: "Online dates, one-hour slots, and branch closures. Times are Asia/Manila." };
  if (pathname.startsWith("/admin/allocation")) return { title: "Daily allocation", description: "Online pies per flavor, branch, and day. A blank day stays open." };
  if (pathname.startsWith("/admin/orders")) return { title: "Orders", description: "Requests, payment, and pickup." };
  if (pathname.startsWith("/admin/branches")) return { title: "Branches", description: "Main branches, default selection, and product availability." };
  if (pathname.startsWith("/admin/popups")) return { title: "Pop-ups", description: "Temporary visit listings. They stay off online ordering." };
  if (pathname.startsWith("/admin/catalog") || pathname.startsWith("/admin/products")) {
    return {
      title: "Catalog",
      description: "Products, sizes, prices, and the finishing touches—all in one place.",
    };
  }
  return {
    title: "Overview",
    description: "Your bakery workspace at a glance.",
  };
}

/** Phase 3 replaces this lookup. There is no saved order store yet. */
export function findOrderByNumber(orderNumber: string): { orderNumber: string } | null {
  const query = orderNumber.trim();
  if (!query) return null;
  return null;
}

export function WorkspaceChromeProvider({ children }: { children: ReactNode }) {
  return children;
}

export function WorkspaceTopbar({ ownerLabel }: { ownerLabel: string }) {
  const pathname = usePathname();
  const copy = pageCopy(pathname);
  const searchId = useId();
  const noticeId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || event.altKey || event.shiftKey) return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function searchOrders(event: FormEvent) {
    event.preventDefault();
    const orderNumber = query.trim();
    if (!orderNumber) {
      setNotice("");
      return;
    }
    const match = findOrderByNumber(orderNumber);
    setNotice(match ? match.orderNumber : "No order with that number.");
  }

  return (
    <header className="admin-topbar flex shrink-0 flex-col gap-3 border-b border-[var(--admin-line)] bg-cream px-4 py-3 sm:px-7 md:flex-row md:items-center md:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <div className="admin-topbar-copy min-w-0">
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
      </div>
      <div className="admin-topbar-actions flex min-w-0 flex-col gap-2 self-stretch sm:self-end md:self-center">
        <div className="flex min-w-0 items-center gap-3">
          <form className="relative min-w-0 flex-1 md:w-80 md:flex-none" onSubmit={searchOrders}>
            <label htmlFor={searchId} className="sr-only">
              Order number
            </label>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              ref={searchRef}
              id={searchId}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setNotice("");
              }}
              placeholder="Order number"
              autoComplete="off"
              spellCheck={false}
              aria-describedby={notice ? noticeId : undefined}
              className="h-9 rounded-lg border-[var(--admin-line)] bg-[#f7f9fc] pr-14 pl-9 text-[13px]"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-[var(--admin-line)] bg-cream px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              ⌘K
            </kbd>
          </form>
          <Badge variant="outline">Owner</Badge>
          <span className="admin-owner-name text-sm text-muted-foreground">{ownerLabel}</span>
        </div>
        {notice ? (
          <p id={noticeId} role="status" className="text-xs text-muted-foreground">
            {notice}
          </p>
        ) : null}
      </div>
    </header>
  );
}
