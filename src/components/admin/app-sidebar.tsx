"use client";

import type { ComponentProps } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarDays,
  ClipboardList,
  CookingPot,
  LayoutDashboard,
  Layers,
  Settings2,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { SessionControls } from "@/components/admin/session-controls";
import { adminKeys, fetchAdminCatalog, fetchAdminProducts } from "@/lib/admin/query";

const workspaceNav = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/catalog", label: "Catalog", icon: Layers, prefetch: true },
] as const;

const plannedNav = [
  { label: "Orders", icon: ClipboardList },
  { label: "Kitchen", icon: CookingPot },
  { label: "Bakery schedule", icon: CalendarDays },
  { label: "Settings", icon: Settings2 },
] as const;

function isActivePath(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname.startsWith(href);
}

export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const queryClient = useQueryClient();

  function prefetch(enabled?: boolean) {
    if (!enabled) return;
    void queryClient.prefetchQuery({ queryKey: adminKeys.catalog(), queryFn: fetchAdminCatalog });
    void queryClient.prefetchQuery({ queryKey: adminKeys.products(), queryFn: fetchAdminProducts });
  }

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="makalipie" render={<Link href="/admin" />}>
              <Image
                src="/brand/seal.png"
                alt=""
                width={32}
                height={32}
                className="size-8 rounded-md"
              />
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold">makalipie</span>
                <span className="truncate text-xs text-muted-foreground">BAKERY WORKSPACE</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isActivePath(pathname, item.href)}
                    tooltip={item.label}
                    render={
                      <Link
                        href={item.href}
                        onMouseEnter={() => prefetch("prefetch" in item ? item.prefetch : false)}
                        onFocus={() => prefetch("prefetch" in item ? item.prefetch : false)}
                      />
                    }
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Coming soon</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {plannedNav.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton tooltip={`${item.label} — coming soon`} className="opacity-60">
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="overflow-hidden">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Visit website" render={<Link href="/" />}>
              <ArrowUpRight />
              <span>Visit website</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SessionControls appearance="sidebar" />
        </SidebarMenu>
        <p className="px-2 pb-2 text-[11px] leading-relaxed text-muted-foreground group-data-[collapsible=icon]:hidden">
          A little more organized.
          <br />
          Just as homemade.
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
