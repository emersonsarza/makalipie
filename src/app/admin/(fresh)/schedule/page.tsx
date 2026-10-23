import { SchedulePage } from "@/components/admin/schedule/schedule-page";

export const metadata = { title: "Schedule · Makalipie" };

export default function ScheduleRoute() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return <SchedulePage today={today} />;
}
