import { Suspense } from "react";
import { AllocationPage } from "@/components/admin/allocation/allocation-page";
export const metadata = { title: "Daily allocation · Makalipie" };
export default function DailyAllocationRoute(){
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <Suspense fallback={<p role="status">Opening Daily allocation…</p>}><AllocationPage today={today}/></Suspense>;
}
