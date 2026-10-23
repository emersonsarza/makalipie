import { notFound, redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/admin/session";

const sections = new Set(["orders", "kitchen", "catalog", "packages", "allocation", "branches", "schedule", "popups", "settings"]);
export default async function AdminSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  const admin = await requireAdminPage();
  if (admin.role !== "owner" && section !== "orders") redirect("/admin/orders");
  return null;
}
