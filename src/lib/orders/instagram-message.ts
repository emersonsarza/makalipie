export type InstagramExtra = { name: string; price: string; message?: string };
export type InstagramPie = { quantity: number; name: string; price: string; extras?: InstagramExtra[] };
export type InstagramPackageLine = { quantity: number; name: string; price: string };

export type InstagramOrder = {
  name: string;
  phone: string;
  branch: string;
  when: string;
  fulfillment: "pickup" | "delivery";
  pickupAddress?: string;
  deliveryAddress?: string;
  deliveryFeePayment?: "with_total" | "to_driver";
  payment: string;
  pies: InstagramPie[];
  orderExtras?: InstagramExtra[];
  packages?: InstagramPackageLine[];
  notes?: string;
  subtotal: string;
};

export function formatInstagramOrder(order: InstagramOrder) {
  const lines = [
    "Makalipie order request",
    "",
    `Name: ${order.name}`,
    `Phone: ${order.phone}`,
    `Branch: ${order.branch}`,
    `When: ${order.when} (Manila time)`,
    order.fulfillment === "pickup"
      ? `Fulfillment: Pickup${order.pickupAddress ? ` at ${order.pickupAddress}` : ""}`
      : "Fulfillment: Delivery",
  ];
  if (order.fulfillment === "delivery") {
    lines.push(`Address: ${order.deliveryAddress ?? ""}`);
    lines.push(order.deliveryFeePayment === "to_driver" ? "Delivery fee: pending, confirmed in chat. Pay the rider directly." : "Delivery fee: pending, confirmed in chat. Pay with the order.");
  }
  lines.push(`Payment: ${order.payment}`, "", "Pies");
  for (const pie of order.pies) {
    lines.push(`${pie.quantity} × ${pie.name} — ${pie.price}`);
    for (const extra of pie.extras ?? []) {
      lines.push(`  Extra: ${extra.name} — ${extra.price}`);
      if (extra.message?.trim()) lines.push(`  Message: ${extra.message.trim()}`);
    }
  }
  if (order.orderExtras?.length) {
    lines.push("", "Order extras");
    for (const extra of order.orderExtras) {
      lines.push(`${extra.name} — ${extra.price}`);
      if (extra.message?.trim()) lines.push(`  Message: ${extra.message.trim()}`);
    }
  }
  if (order.packages?.length) {
    lines.push("", "Packages");
    for (const pack of order.packages) lines.push(`${pack.quantity} × ${pack.name} — ${pack.price}`);
  }
  if (order.notes?.trim()) lines.push("", "Notes", order.notes.trim());
  const totalLine = order.fulfillment === "delivery" && order.deliveryFeePayment === "with_total"
    ? `Total: ${order.subtotal} + Delivery fee`
    : `Subtotal: ${order.subtotal}`;
  lines.push("", totalLine);
  lines.push("This is a request until Makalipie confirms it in this chat.");
  return lines.join("\n");
}
