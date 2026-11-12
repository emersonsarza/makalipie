import { AdminWorkspace } from "@/components/admin/admin-workspace";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StorefrontPreview } from "@/components/admin/storefront/preview";

export const metadata: Metadata = { title: "Storefront theme preview", robots: { index: false, follow: false } };

export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ theme?: string; section?: string; view?: string }> }) {
  const params = await searchParams;
  const theme = params.theme === "original" ? "original" : "christmas";
  if (params.section === "locations") redirect(`/admin/storefront/preview?theme=${theme}&section=home#visit`);
  return <AdminWorkspace preview><StorefrontPreview theme={theme}
    section={params.section === "menu" ? "menu" : "home"}
    preorder={params.view === "preorders"} /></AdminWorkspace>;
}
