import { requireAdminPage } from "@/lib/admin/session";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { AdminQueryProvider } from "@/components/admin/query-provider";
import { WorkspaceChromeProvider, WorkspaceTopbar } from "@/components/admin/workspace-topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  return (
    <AdminQueryProvider>
      <WorkspaceChromeProvider>
        <TooltipProvider>
          <SidebarProvider className="admin-shell min-h-svh">
            <a className="admin-skip" href="#admin-main">
              Skip to content
            </a>
            <AppSidebar role={admin.role} />
            <SidebarInset className="admin-workspace">
              <WorkspaceTopbar ownerLabel={admin.displayName || admin.email} />
              <main id="admin-main" className="admin-main" tabIndex={-1}>
                {children}
              </main>
            </SidebarInset>
          </SidebarProvider>
        </TooltipProvider>
      </WorkspaceChromeProvider>
    </AdminQueryProvider>
  );
}
