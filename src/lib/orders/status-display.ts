import type { InboxOrder } from "@/lib/orders/schema";

export type OrderStatus = InboxOrder["status"];
export type OrderDelivery = InboxOrder["delivery"];
export type OrderStatusTone = "awaiting" | "approved" | "ready" | "done" | "closed";

export function orderStatusLabel(status: OrderStatus, delivery: OrderDelivery = "pickup") {
  const courier = delivery === "lalamove";
  if (status === "processing") return "Processing";
  if (status === "confirmed") return "Approved";
  if (status === "preparing") return "Preparing";
  if (status === "ready") return courier ? "Ready" : "Ready for pickup";
  if (status === "completed") return courier ? "Delivered" : "Completed";
  if (status === "expired") return "Expired";
  if (status === "cancelled") return "Cancelled";
  if (status === "requested") return "Pending validation";
  return status;
}

export function orderStatusTone(status: OrderStatus): OrderStatusTone {
  if (status === "requested" || status === "processing") return "awaiting";
  if (status === "confirmed" || status === "preparing") return "approved";
  if (status === "ready") return "ready";
  if (status === "completed") return "done";
  return "closed";
}
