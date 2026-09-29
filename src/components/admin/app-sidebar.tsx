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
  MapPin,
  Settings2,
  SlidersHorizontal,
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

const ownerNav = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/catalog", label: "Catalog", icon: Layers, prefetch: true },
  { href: "/admin/branches", label: "Branches", icon: Settings2 },
  { href: "/admin/popups", label: "Pop-ups", icon: MapPin },
  { href: "/admin/schedule", label: "Bakery schedule", icon: CalendarDays },
  { href: "/admin/allocation", label: "Daily allocation", icon: SlidersHorizontal },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList },
] as const;

const staffNav = [
  { href: "/admin/orders", label: "Orders", icon: ClipboardList },
] as const;

const plannedNav = [
  { label: "Kitchen", icon: CookingPot },
  { label: "Settings", icon: Settings2 },
] as const;

function isActivePath(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname.startsWith(href);
}

export function AppSidebar({ role = "owner", ...props }: ComponentProps<typeof Sidebar> & { role?: "owner" | "staff" }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const workspaceNav = role === "staff" ? staffNav : ownerNav;

  function prefetch(enabled?: boolean) {
    if (!enabled) return;
    void queryClient.prefetchQuery({ queryKey: adminKeys.catalog(), queryFn: fetchAdminCatalog });
    void queryClient.prefetchQuery({ queryKey: adminKeys.products(), queryFn: fetchAdminProducts });
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="border-b border-white/10 px-3.5 pt-5 pb-4 group-data-[collapsible=icon]:p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="makalipie"
              className="group-data-[collapsible=icon]:overflow-visible!"
              render={<Link href="/admin" />}
            >
              <Image
                src="/brand/seal.png"
                alt=""
                width={32}
                height={32}
                className="size-8 shrink-0"
              />
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold text-cream">makalipie</span>
                <span className="truncate text-[10px] tracking-[0.14em] text-cream/45">BAKERY WORKSPACE</span>
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
        {role === "owner" ? <SidebarGroup>
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
        </SidebarGroup> : null}
      </SidebarContent>
      <SidebarFooter className="overflow-hidden border-t border-white/10">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Visit website" render={<Link href="/" />}>
              <ArrowUpRight />
              <span>Visit website</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SessionControls appearance="sidebar" />
        </SidebarMenu>
        <p className="px-2 pb-2 text-[11px] leading-relaxed text-cream/40 group-data-[collapsible=icon]:hidden">
          A little more organized.
          <br />
          Just as homemade.
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
