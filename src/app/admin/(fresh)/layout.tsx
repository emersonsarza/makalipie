import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin/session";
import { readBranchSettings } from "@/lib/branches/store";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata: Metadata = { title: "Admin · Makalipie", robots: { index: false, follow: false }, alternates: { canonical: null } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  const settings = await readBranchSettings();
  const branches = settings.branches.filter((branch) => admin.role === "owner" || admin.branchIds.includes(branch.id)).map(({ id, name }) => ({ id, name }));
  return <AdminShell name={admin.displayName || admin.email} role={admin.role} branches={branches}>{children}</AdminShell>;
}
