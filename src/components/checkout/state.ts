import { z } from "zod";
import { businessDateSchema } from "@/lib/business-date";

const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
const date = businessDateSchema;
const slot = z.string().regex(/^\d{2}:\d{2}$/);
const method = z.enum(["pickup", "delivery"]);
const quantity = z.number().int().min(1).max(99);
const price = z.number().int().min(0).max(2147483647);
const entry = z.object({ quantity, price });
const cartSchema = z.object({
  date: date.or(z.literal("")),
  method,
  slot: slot.or(z.literal("")),
  items: z.record(z.string().max(170), entry),
  addons: z.record(id, entry),
});
const line = z.union([
  z.object({ productId: id, sizeId: id, quantity, unitPriceCentavos: price }),
  z.object({ offeringId: id, quantity, unitPriceCentavos: price }),
]);
const pendingSchema = z.object({
  idempotencyKey: z.uuid(),
  channel: z.enum(["regular", "drop"]),
  locationId: id,
  dropId: id.optional(),
  fulfillmentDate: date,
  fulfillment: method,
  slotId: slot.optional(),
  lines: z.array(line).min(1).max(40),
  addons: z.array(z.object({ id, quantity, unitPriceCentavos: price })).max(20),
});
const receiptSchema = z.string().regex(/^MP-\d{7,}$/);

export type Cart = z.infer<typeof cartSchema>;
export type Selection = z.infer<typeof entry>;
export type PendingOrder = z.infer<typeof pendingSchema>;
export type Method = z.infer<typeof method>;
export type Contact = { customerName: string; customerPhone: string; deliveryAddress: string; notes: string };
export const emptyCart: Cart = { date: "", method: "pickup", slot: "", items: {}, addons: {} };
export const emptyContact: Contact = { customerName: "", customerPhone: "", deliveryAddress: "", notes: "" };
const pendingKey = "makalipie:checkout:v1:pending";
const receiptKey = "makalipie:checkout:v1:receipt";
const cartKey = (locationId: string, dropId?: string) => `makalipie:checkout:v1:cart:${dropId ? "drop:" + dropId : "regular:" + locationId}`;
let lastReceipt: { number: string; afterHours: boolean } | undefined;
let memoryPending: PendingOrder | undefined;

export function loadCart(locationId: string, dropId?: string): Cart {
  try {
    const saved = cartSchema.safeParse(JSON.parse(localStorage.getItem(cartKey(locationId, dropId)) ?? "null"));
    if (saved.success) return saved.data;
  } catch {}
  return emptyCart;
}

export function saveCart(locationId: string, dropId: string | undefined, cart: Cart) {
  try { localStorage.setItem(cartKey(locationId, dropId), JSON.stringify(cartSchema.parse(cart))); } catch {}
}

export function clearSubmittedCart(attempt: PendingOrder) {
  const cart = loadCart(attempt.locationId, attempt.dropId);
  // A different tab may have saved a newer cart while this order was pending.
  const matches = (values: Cart["items"], submitted: [string, number, number][]) =>
    Object.keys(values).length === submitted.length && submitted.every(([key, quantity, price]) =>
      values[key]?.quantity === quantity && values[key]?.price === price);
  if (cart.date !== attempt.fulfillmentDate || cart.method !== attempt.fulfillment || cart.slot !== (attempt.slotId ?? "")
    || !matches(cart.items, attempt.lines.map(item => [lineKey(item), item.quantity, item.unitPriceCentavos]))
    || !matches(cart.addons, attempt.addons.map(item => [item.id, item.quantity, item.unitPriceCentavos]))) return;
  try { localStorage.removeItem(cartKey(attempt.locationId, attempt.dropId)); } catch {}
}

export function loadPending() {
  if (memoryPending) return memoryPending;
  try {
    const pending = pendingSchema.safeParse(JSON.parse(sessionStorage.getItem(pendingKey) ?? "null"));
    if (pending.success) return pending.data;
  } catch {}
}

export function savePending(value?: PendingOrder) {
  memoryPending = value;
  try {
    if (value) sessionStorage.setItem(pendingKey, JSON.stringify(pendingSchema.parse(value)));
    else sessionStorage.removeItem(pendingKey);
  } catch {}
}

export function rememberReceipt(number: string, afterHours: boolean) {
  lastReceipt = { number, afterHours };
  try { localStorage.setItem(receiptKey, receiptSchema.parse(number)); } catch {}
}

export function loadReceipt() {
  try {
    const number = receiptSchema.safeParse(localStorage.getItem(receiptKey));
    if (number.success) return lastReceipt?.number === number.data ? lastReceipt : { number: number.data, afterHours: false };
  } catch {}
  return lastReceipt;
}

export function lineKey(value: { offeringId?: string; productId?: string; sizeId?: string }) {
  return value.offeringId ?? `${value.productId}/${value.sizeId}`;
}

export function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })
    .format(new Date(`${date}T12:00:00+08:00`));
}

export function pesos(centavos: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(centavos / 100);
}

export function reviewedTotal(items: Cart["items"], addons: Cart["addons"]) {
  return [...Object.values(items), ...Object.values(addons)].reduce((total, item) => total + item.price * item.quantity, 0);
}
