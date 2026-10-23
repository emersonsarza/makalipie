import { Suspense } from "react";
import { OrdersPage } from "@/components/admin/orders/orders-page";
export const metadata = { title: "Orders · Makalipie" };
export default function OrdersRoute(){return <Suspense fallback={<p role="status">Opening Orders…</p>}><OrdersPage /></Suspense>;}
