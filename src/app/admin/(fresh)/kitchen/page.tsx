import { Suspense } from "react";
import { KitchenPage } from "@/components/admin/kitchen/kitchen-page";
export const metadata = { title: "Kitchen · Makalipie" };
export default function KitchenRoute() {
 const today = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 return <Suspense fallback={<p role="status">Opening Kitchen…</p>}><KitchenPage today={today}/></Suspense>;
}
