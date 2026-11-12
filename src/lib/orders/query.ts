import { manilaDate } from "../catalog/rules";
import { createServiceClient } from "../admin/supabase";
import { effectiveStatus } from "../drops/present";

const pageSize = 10;
type Row = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function clock(value: unknown) {
  return text(value).slice(0, 5);
}

export type OrderQueue = { key: string; label: string; group: "regular" | "active" | "past" };

export function orderQueueKey(order: { locationId: string; dropId: string | null }) {
  return order.dropId ? `drop:${order.dropId}` : `regular:${order.locationId}`;
}

function relationName(value: unknown) {
  return value && typeof value === "object" && "name" in value ? text(value.name) : "";
}

export function orderSourceLabel(order: { location?: unknown; drop?: unknown }) {
  return [relationName(order.location), relationName(order.drop)].filter(Boolean).join(" · ");
}

export async function listOrderQueues(): Promise<OrderQueue[]> {
  const service = createServiceClient();
  const [locations, drops, booked] = await Promise.all([
    service.from("locations").select("id,name").eq("kind", "regular").order("name"),
    service.from("drops").select("id,name,status,location:locations(name),drop_dates(service_date,pickup_ends,dispatch_ends)").order("name"),
    service.rpc("admin_booked_drop_dates"),
  ]);
  const failure = [locations, drops, booked].find(result => result.error);
  if (failure?.error) throw failure.error;
  const bookedIds = new Set((booked.data ?? []).map((row: { drop_id: string }) => row.drop_id));
  const now = new Date();
  const dropQueues = (drops.data ?? []).flatMap(drop => {
    if (drop.status === "draft" && !bookedIds.has(drop.id)) return [];
    const status = effectiveStatus({
      status: drop.status,
      dates: drop.drop_dates.map(date => ({
        date: date.service_date, pickupEnds: date.pickup_ends, dispatchEnds: date.dispatch_ends,
      })),
    }, now);
    const serviceDates = drop.drop_dates.map(date => text(date.service_date)).filter(Boolean).sort();
    return [{
      key: `drop:${drop.id}`, label: orderSourceLabel({ location: drop.location, drop }), group: status === "published" ? "active" as const : "past" as const,
      sortDate: status === "published" ? serviceDates[0] : serviceDates.at(-1),
    }];
  });
  dropQueues.sort((left, right) => {
    if (left.group !== right.group) return left.group.localeCompare(right.group);
    if (left.sortDate && right.sortDate) {
      const byDate = left.sortDate.localeCompare(right.sortDate);
      if (byDate) return left.group === "active" ? byDate : -byDate;
    }
    return Number(!left.sortDate) - Number(!right.sortDate)
      || left.label.localeCompare(right.label) || left.key.localeCompare(right.key);
  });
  return [
    ...(locations.data ?? []).map(location => ({
      key: orderQueueKey({ locationId: location.id, dropId: null }), label: location.name, group: "regular" as const,
    })),
    ...dropQueues.map(({ key, label, group }) => ({ key, label, group })),
  ];
}

export async function countOrdersNeedingAttention(queue?: string) {
  const service = createServiceClient();
  let query = service
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "confirmed"]);
  if (queue) {
    const match = /^(regular|drop):([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(queue);
    if (!match) return 0;
    const [, channel, id] = match;
    query = query.eq("channel", channel).eq(channel === "regular" ? "location_id" : "drop_id", id);
  }
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function orderShape(row: Row) {
  const lines = Array.isArray(row.order_lines) ? row.order_lines as Row[] : [];
  const addons = Array.isArray(row.order_addons) ? row.order_addons as Row[] : [];
  const source = { locationId: text(row.location_id), dropId: row.drop_id ? text(row.drop_id) : null };
  return {
    id: text(row.id),
    orderNumber: text(row.order_number),
    sequenceDate: text(row.sequence_date).slice(0, 10),
    channel: text(row.channel),
    ...source,
    queueKey: orderQueueKey(source),
    sourceLabel: orderSourceLabel(row),
    fulfillmentDate: text(row.fulfillment_date).slice(0, 10),
    fulfillment: text(row.fulfillment),
    slotId: row.slot_id ? clock(row.slot_id) : null,
    windowStarts: row.window_starts ? clock(row.window_starts) : null,
    windowEnds: row.window_ends ? clock(row.window_ends) : null,
    status: text(row.status),
    payment: text(row.payment),
    deliveryFeeMode: row.delivery_fee_mode ? text(row.delivery_fee_mode) : null,
    deliveryFeeCentavos: typeof row.delivery_fee_centavos === "number" ? row.delivery_fee_centavos : null,
    subtotalCentavos: Number(row.subtotal_centavos),
    totalCentavos: typeof row.total_centavos === "number" ? row.total_centavos : null,
    customerName: row.customer_name ? text(row.customer_name) : null,
    customerPhone: row.customer_phone ? text(row.customer_phone) : null,
    deliveryAddress: row.delivery_address ? text(row.delivery_address) : null,
    notes: row.notes ? text(row.notes) : null,
    submittedAfterHours: Boolean(row.submitted_after_hours),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    lines: lines.sort((left, right) => Number(left.line_no) - Number(right.line_no)).map((line) => ({
      id: text(line.id),
      kind: text(line.kind),
      productId: line.product_id ? text(line.product_id) : null,
      sizeId: line.size_id ? text(line.size_id) : null,
      offeringId: line.offering_id ? text(line.offering_id) : null,
      name: text(line.name),
      unitPriceCentavos: Number(line.unit_price_centavos),
      quantity: Number(line.quantity),
      components: (Array.isArray(line.order_line_components) ? line.order_line_components as Row[] : []).map((component) => ({
        productId: text(component.product_id),
        sizeId: text(component.size_id),
        name: text(component.name),
        quantity: Number(component.quantity),
      })),
    })),
    addons: addons.map((addon) => ({
      id: text(addon.add_on_id),
      name: text(addon.name),
      unitPriceCentavos: Number(addon.unit_price_centavos),
      quantity: Number(addon.quantity),
    })),
  };
}

const columns = "id, order_number, sequence_date, sequence_no, channel, location_id, drop_id, fulfillment_date, fulfillment, slot_id, window_starts, window_ends, status, payment, delivery_fee_mode, delivery_fee_centavos, subtotal_centavos, total_centavos, customer_name, customer_phone, delivery_address, notes, submitted_after_hours, created_at, updated_at, location:locations(name), drop:drops(name), order_lines(id, line_no, kind, product_id, size_id, offering_id, name, unit_price_centavos, quantity, order_line_components(product_id, size_id, name, quantity)), order_addons(add_on_id, name, unit_price_centavos, quantity)";

export async function listOrders(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const view = url.searchParams.get("view") ?? "all";
  let query = createServiceClient().from("orders").select(columns, { count: "exact" });
  const number = url.searchParams.get("q");
  const locationId = url.searchParams.get("location");
  const queue = url.searchParams.get("queue");
  const date = url.searchParams.get("date");
  const status = url.searchParams.get("status");
  const payment = url.searchParams.get("payment");
  const fulfillment = url.searchParams.get("fulfillment");
  if (number) query = query.eq("order_number", number);
  if (queue) {
    const match = /^(regular|drop):([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(queue);
    if (!match) return { page, pageSize, total: 0, orders: [] };
    const [, channel, id] = match;
    query = query.eq("channel", channel).eq(channel === "regular" ? "location_id" : "drop_id", id);
  } else if (locationId) query = query.eq("location_id", locationId);
  if (date) query = query.eq("fulfillment_date", date);
  if (status) query = query.eq("status", status);
  if (payment) query = query.eq("payment", payment);
  if (fulfillment) query = query.eq("fulfillment", fulfillment);
  if (view === "attention") query = query.in("status", ["pending", "confirmed"])
    .order("fulfillment_date")
    .order("window_starts", { nullsFirst: false })
    .order("status", { ascending: false })
    .order("created_at")
    .order("id");
  else if (view === "today") query = query.eq("fulfillment_date", manilaDate()).neq("status", "cancelled").order("window_starts");
  else if (number) query = query.order("sequence_date", { ascending: false }).order("sequence_no", { ascending: false });
  else query = query.order("created_at", { ascending: false });
  const result = await query.range((page - 1) * pageSize, page * pageSize - 1);
  if (result.error) throw new Error(result.error.message);
  return { page, pageSize, total: result.count ?? 0, orders: ((result.data ?? []) as Row[]).map(orderShape) };
}

export async function lineup(date: string) {
  const result = await createServiceClient().from("orders").select(columns).eq("fulfillment_date", date).in("status", ["confirmed", "completed"]);
  if (result.error) throw new Error(result.error.message);
  const groups = new Map<string, { locationId: string; dropId: string | null; packing: { packages: Map<string, number>; pies: Map<string, number>; addons: Map<string, number> }; baking: Map<string, { productId: string; sizeId: string; name: string; quantity: number }> }>();
  for (const order of ((result.data ?? []) as Row[]).map(orderShape)) {
    const key = `${order.locationId}:${order.dropId ?? ""}`;
    const group = groups.get(key) ?? {
      locationId: order.locationId,
      dropId: order.dropId,
      packing: { packages: new Map(), pies: new Map(), addons: new Map() },
      baking: new Map(),
    };
    for (const line of order.lines) {
      if (line.kind === "package") group.packing.packages.set(line.name, (group.packing.packages.get(line.name) ?? 0) + line.quantity);
      else group.packing.pies.set(line.name, (group.packing.pies.get(line.name) ?? 0) + line.quantity);
      const baked = line.kind === "package"
        ? line.components.map((component) => ({ ...component, quantity: component.quantity * line.quantity }))
        : [{ productId: line.productId ?? "", sizeId: line.sizeId ?? "", name: line.name, quantity: line.quantity }];
      for (const item of baked) {
        const bakeKey = `${item.productId}:${item.sizeId}`;
        const current = group.baking.get(bakeKey) ?? { productId: item.productId, sizeId: item.sizeId, name: item.name, quantity: 0 };
        current.quantity += item.quantity;
        group.baking.set(bakeKey, current);
      }
    }
    for (const addon of order.addons) group.packing.addons.set(addon.name, (group.packing.addons.get(addon.name) ?? 0) + addon.quantity);
    groups.set(key, group);
  }
  const named = (counts: Map<string, number>) => [...counts].map(([name, quantity]) => ({ name, quantity })).sort((left, right) => left.name.localeCompare(right.name));
  return {
    date,
    groups: [...groups.values()].map((group) => ({
      locationId: group.locationId,
      dropId: group.dropId,
      packing: { packages: named(group.packing.packages), pies: named(group.packing.pies), addons: named(group.packing.addons) },
      baking: [...group.baking.values()].sort((left, right) => left.name.localeCompare(right.name)),
    })),
  };
}

export type AdminOrder = ReturnType<typeof orderShape>;

export async function findOrder(id: string) {
  const result = await createServiceClient().from("orders").select(columns).eq("id", id).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? orderShape(result.data) : null;
}
