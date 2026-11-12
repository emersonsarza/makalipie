import { AdminWorkspace } from "@/components/admin/admin-workspace";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <AdminWorkspace>{children}</AdminWorkspace>;
}
