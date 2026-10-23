import { Suspense } from "react";
import { requireOwnerPage } from "@/lib/admin/session";
import { CatalogWorkspace } from "@/components/admin/catalog-workspace";
export default async function CatalogPage() { await requireOwnerPage(); return <Suspense fallback={<p>Loading catalog…</p>}><CatalogWorkspace /></Suspense>; }
