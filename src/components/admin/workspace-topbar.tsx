"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";

function pageCopy(pathname: string) {
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

export function WorkspaceChromeProvider({ children }: { children: ReactNode }) {
  return children;
}

export function WorkspaceTopbar({ ownerLabel }: { ownerLabel: string }) {
  const pathname = usePathname();
  const copy = pageCopy(pathname);

  return (
    <header className="admin-topbar flex shrink-0 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <SidebarTrigger className="mt-1 -ml-1" />
        <div className="admin-topbar-copy min-w-0">
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
      </div>
      <div className="admin-topbar-actions flex shrink-0 items-center gap-2 self-end sm:self-center">
        <Badge variant="outline">Owner</Badge>
        <span className="admin-owner-name text-sm text-muted-foreground">{ownerLabel}</span>
      </div>
    </header>
  );
}
