import { z } from "zod";
import { createServiceClient } from "../admin/supabase";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(60);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const money = z.number().int().nonnegative();
const quantity = z.number().int().min(1).max(99);

const lineSchema = z.object({
  productId: slug.nullable().optional(),
  sizeId: slug.nullable().optional(),
  offeringId: slug.nullable().optional(),
  quantity,
  unitPriceCentavos: money,
});

const addonSchema = z.object({
  id: slug,
  quantity,
  unitPriceCentavos: money,
});

const placeSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(80),
  channel: z.enum(["regular", "drop"]),
  locationId: slug,
  dropId: slug.nullable().optional(),
  fulfillmentDate: day,
  fulfillment: z.enum(["pickup", "delivery"]),
  slotId: clock.nullable().optional(),
  lines: z.array(lineSchema).min(1).max(40),
  addons: z.array(addonSchema).max(20).default([]),
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z.string().trim().min(8).max(20),
  deliveryAddress: z.string().trim().max(300).default(""),
  notes: z.string().trim().max(500).default(""),
  deliveryFeeMode: z.enum(["unknown", "known", "rider"]).optional(),
  deliveryFeeCentavos: money.nullable().optional(),
  allowUnavailable: z.boolean().optional(),
}).refine((order) => order.deliveryFeeMode !== "known" || typeof order.deliveryFeeCentavos === "number")
  .refine((order) => order.channel === "drop" ? Boolean(order.dropId) && !order.slotId : !order.dropId && Boolean(order.slotId))
  .refine((order) => order.fulfillment === "pickup" || order.deliveryAddress.length > 0)
  .refine((order) => order.lines.every((line) => order.channel === "drop" ? Boolean(line.offeringId) && !line.productId : Boolean(line.productId && line.sizeId) && !line.offeringId));

const editLineSchema = lineSchema.extend({ lineId: z.string().uuid().optional() });

const updateSchema = z.object({
  orderId: z.string().uuid(),
  updatedAt: z.string().min(1),
  fulfillmentDate: day,
  fulfillment: z.enum(["pickup", "delivery"]),
  slotId: clock.nullable().optional(),
  deliveryFeeMode: z.enum(["unknown", "known", "rider"]).optional(),
  deliveryFeeCentavos: money.nullable().optional(),
  paymentStatus: z.enum(["unpaid", "paid", "refunded"]).optional(),
  lines: z.array(editLineSchema).min(1).max(40),
  addons: z.array(addonSchema).max(20).default([]),
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z.string().trim().min(8).max(20),
  deliveryAddress: z.string().trim().max(300).default(""),
  notes: z.string().trim().max(500).default(""),
}).refine((order) => order.fulfillment === "pickup" || order.deliveryAddress.length > 0)
  .refine((order) => order.deliveryFeeMode !== "known" || typeof order.deliveryFeeCentavos === "number");

const transitionSchema = z.object({
  orderId: z.string().uuid(),
  updatedAt: z.string().min(1),
  status: z.enum(["confirmed", "paid", "completed", "cancelled", "refunded"]),
});

const deliveryFeeVersion = {
  orderId: z.string().uuid(),
  updatedAt: z.iso.datetime({ offset: true }),
};
const deliveryFeeSchema = z.discriminatedUnion("deliveryFeeMode", [
  z.object({ ...deliveryFeeVersion, deliveryFeeMode: z.literal("known"), deliveryFeeCentavos: money.max(2147483647) }),
  z.object({ ...deliveryFeeVersion, deliveryFeeMode: z.literal("rider") }),
]);

function schemaFor(action: string): z.ZodTypeAny | null {
  if (action === "place_order") return placeSchema;
  if (action === "update_order") return updateSchema;
  if (action === "transition_order") return transitionSchema;
  if (action === "set_delivery_fee") return deliveryFeeSchema;
  return null;
}

function detailBody(error: string, message: string) {
  const jsonStart = message.indexOf("{");
  if (jsonStart === -1) return { error };
  try {
    const detail = JSON.parse(message.slice(jsonStart)) as Record<string, unknown>;
    return { error, ...detail };
  } catch {
    return { error };
  }
}

function mapOrderError(error: { message?: string }) {
  const message = error.message ?? "";
  if (message.includes("delivery_fee_not_editable")) return { status: 409, body: { error: "delivery_fee_not_editable", message: "This order is no longer eligible for a quick delivery fee update." } };
  if (message.includes("stale_save")) return { status: 409, body: { error: "stale_save" } };
  if (message.includes("price_change")) return { status: 409, body: detailBody("price_change", message) };
  if (message.includes("unavailable")) return { status: 409, body: detailBody("unavailable", message) };
  if (message.includes("idempotency_mismatch")) return { status: 409, body: { error: "idempotency_mismatch" } };
  if (message.includes("refund_required")) return { status: 409, body: { error: "refund_required" } };
  if (message.includes("closed_ordering")) return { status: 409, body: { error: "closed_ordering" } };
  if (message.includes("not_found")) return { status: 404, body: { error: "not_found" } };
  if (message.includes("validation")) return { status: 400, body: { error: "validation", replayChecked: true } };
  if (message.includes("invalid input")) return { status: 400, body: { error: "validation" } };
  return { status: 503, body: { error: "temporary_failure" } };
}

export async function applyOrderChange(action: unknown, payload: unknown, actor: "public" | "admin" = "public") {
  if (typeof action !== "string") return { status: 400, body: { error: "validation" } };
  if (action === "set_delivery_fee" && actor !== "admin") return { status: 403, body: { error: "forbidden" } };
  const parsed = schemaFor(action)?.safeParse(payload);
  if (!parsed?.success) return { status: 400, body: { error: "validation" } };
  const data = parsed.data as Record<string, unknown>;
  const body = action === "place_order"
    ? { ...data, actor, allowUnavailable: actor === "admin" && data.allowUnavailable === true }
    : data;
  const result = await createServiceClient().rpc("apply_order_change", { action, payload: body });
  if (result.error) return mapOrderError(result.error);
  return { status: 200, body: result.data };
}
