// Presentation contract only. No database, network, or business mutations.
export type DashboardState = "ready" | "loading" | "refreshing" | "empty" | "clear" | "error" | "partial" | "stale" | "offline" | "paused" | "closed" | "sold-out" | "setup" | "restricted" | "unassigned";
export const dashboardStates: { value: DashboardState; label: string }[] = [
  { value: "ready", label: "Busy day" }, { value: "loading", label: "First load" }, { value: "refreshing", label: "Refreshing" },
  { value: "empty", label: "No orders" }, { value: "clear", label: "All caught up" }, { value: "error", label: "Could not load" },
  { value: "partial", label: "Capacity unavailable" }, { value: "stale", label: "Update delayed" }, { value: "offline", label: "Offline, saved data" },
  { value: "paused", label: "Ordering paused" }, { value: "closed", label: "Outside opening hours" }, { value: "sold-out", label: "Sold out" },
  { value: "setup", label: "Setup incomplete" }, { value: "restricted", label: "Access restricted" }, { value: "unassigned", label: "No branch assigned" },
];
export type DashboardOrder = {
  id: string; number: string; customer: string; branchId: string; branchName: string;
  time: string; quantity: number; fulfillment: "pickup" | "delivery";
  status: "requested" | "processing" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled" | "expired";
  issue?: "overnight" | "urgent" | "fee" | "payment" | "allocation" | "rider";
};
export const statusLabels: Record<DashboardOrder["status"], string> = { requested: "Pending validation", processing: "Processing", confirmed: "Approved", preparing: "Preparing", ready: "Ready for pickup", completed: "Completed", cancelled: "Cancelled", expired: "Expired" };
export const issueLabels = { overnight: "Waiting since last night", urgent: "Hold ends in 8 min", fee: "Delivery fee unconfirmed", payment: "Payment required before baking", allocation: "Allocation needs attention", rider: "Rider details missing" };
export function sampleOrders(branches: { id: string; name: string }[]): DashboardOrder[] {
  if (!branches.length) return [];
  const rows: Omit<DashboardOrder, "branchId" | "branchName">[] = [
    { id: "sample-1", number: "MK-1042", customer: "Alex R.", time: "10:00", quantity: 4, fulfillment: "pickup", status: "requested", issue: "urgent" },
    { id: "sample-2", number: "MK-1043", customer: "Jamie L.", time: "11:00", quantity: 6, fulfillment: "pickup", status: "requested", issue: "overnight" },
    { id: "sample-3", number: "MK-1044", customer: "Sam C.", time: "11:00", quantity: 2, fulfillment: "delivery", status: "processing", issue: "fee" },
    { id: "sample-4", number: "MK-1045", customer: "Riley T.", time: "12:00", quantity: 8, fulfillment: "pickup", status: "confirmed", issue: "payment" },
    { id: "sample-5", number: "MK-1046", customer: "Morgan D.", time: "13:00", quantity: 3, fulfillment: "delivery", status: "confirmed", issue: "allocation" },
    { id: "sample-6", number: "MK-1047", customer: "Casey P.", time: "14:00", quantity: 4, fulfillment: "pickup", status: "preparing" },
    { id: "sample-7", number: "MK-1048", customer: "Taylor M.", time: "14:00", quantity: 2, fulfillment: "pickup", status: "ready" },
    { id: "sample-8", number: "MK-1049", customer: "Jordan S.", time: "15:00", quantity: 6, fulfillment: "delivery", status: "ready", issue: "rider" },
    { id: "sample-9", number: "MK-1050", customer: "Drew B.", time: "16:00", quantity: 4, fulfillment: "pickup", status: "completed" },
    { id: "sample-10", number: "MK-1051", customer: "Avery N.", time: "17:00", quantity: 2, fulfillment: "pickup", status: "cancelled" },
    { id: "sample-11", number: "MK-1052", customer: "Robin K.", time: "18:00", quantity: 4, fulfillment: "delivery", status: "expired" },
  ];
  return rows.map((row, index) => { const branch = branches[index % branches.length]; return { ...row, branchId: branch.id, branchName: branch.name }; });
}
