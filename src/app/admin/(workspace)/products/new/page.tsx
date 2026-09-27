import { redirect } from "next/navigation";
import { requireOwnerPage } from "@/lib/admin/session";
export default async function Page() { await requireOwnerPage(); redirect("/admin/catalog?product=new&tab=details"); }
