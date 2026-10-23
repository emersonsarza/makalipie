import { PopupsPage } from "@/components/admin/popups/popups-page";
export const metadata = { title: "Pop-ups · Makalipie" };
export default function PopupsRoute() {
 const today = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 return <PopupsPage today={today}/>;
}
