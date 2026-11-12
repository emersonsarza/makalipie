import { z } from "zod";
import { createServiceClient } from "../admin/supabase";
import { minutesOfDay } from "../scheduling/schema";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(60);
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const https = z.string().refine((value) => value === "" || value.startsWith("https://"));
const revision = z.number().int().nonnegative();

const dateSchema = z.object({
  date: day,
  orderingOpens: clock,
  orderingCutoff: clock,
  pickupStarts: clock,
  pickupEnds: clock,
  dispatchStarts: clock.nullable(),
  dispatchEnds: clock.nullable(),
}).refine((date) => minutesOfDay(date.orderingCutoff) > minutesOfDay(date.orderingOpens))
  .refine((date) => minutesOfDay(date.pickupEnds) > minutesOfDay(date.pickupStarts))
  .refine((date) => (date.dispatchStarts === null) === (date.dispatchEnds === null))
  .refine((date) => date.dispatchStarts === null || date.dispatchEnds === null || minutesOfDay(date.dispatchEnds) > minutesOfDay(date.dispatchStarts));

const componentSchema = z.object({
  productId: slug,
  sizeId: slug,
  quantity: z.number().int().min(1).max(4),
});

const offeringSchema = z.object({
  id: slug,
  kind: z.enum(["size", "package"]),
  name: z.string().trim().min(1).max(120),
  priceCentavos: z.number().int().nonnegative(),
  perOrderMax: z.number().int().min(1).max(99),
  productId: slug.nullable(),
  sizeId: slug.nullable(),
  sortOrder: z.number().int(),
  components: z.array(componentSchema).max(4),
  dates: z.array(z.object({
    date: day,
    included: z.boolean(),
    allocated: z.number().int().nonnegative(),
  })).max(31),
}).refine((offering) => new Set(offering.dates.map((date) => date.date)).size === offering.dates.length)
  .refine((offering) => new Set(offering.components.map((component) => `${component.productId}/${component.sizeId}`)).size === offering.components.length)
  .refine((offering) => offering.kind === "size"
    ? offering.productId !== null && offering.sizeId !== null && offering.components.length === 0
    : offering.productId === null && offering.sizeId === null && offering.components.reduce((sum, component) => sum + component.quantity, 0) === 4);

const saveSchema = z.object({
  revision,
  id: slug,
  updatedAt: z.string().min(1).optional(),
  locationId: slug,
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(300),
  mapUrl: https.default(""),
  deliveryEnabled: z.boolean(),
  dates: z.array(dateSchema).max(31),
  offerings: z.array(offeringSchema).max(40),
  addons: z.array(z.object({
    addOnId: slug,
    priceCentavos: z.number().int().nonnegative(),
    sortOrder: z.number().int(),
  })).max(20),
}).refine((drop) => new Set(drop.dates.map((date) => date.date)).size === drop.dates.length)
  .refine((drop) => new Set(drop.offerings.map((offering) => offering.id)).size === drop.offerings.length)
  .refine((drop) => new Set(drop.addons.map((addon) => addon.addOnId)).size === drop.addons.length)
  .refine((drop) => {
    const dates = new Set(drop.dates.map((date) => date.date));
    return drop.offerings.every((offering) => offering.dates.every((date) => dates.has(date.date)));
  });

const statusSchema = z.object({
  revision,
  id: slug,
  updatedAt: z.string().min(1),
});

const duplicateSchema = statusSchema.extend({
  newId: slug,
}).refine((drop) => drop.id !== drop.newId);

function schemaFor(action: string) {
  switch (action) {
    case "save_drop": return saveSchema;
    case "publish_drop":
    case "unpublish_drop":
    case "end_drop":
      return statusSchema;
    case "duplicate_drop": return duplicateSchema;
    default: return null;
  }
}

export function parseDropChange(action: unknown, payload: unknown) {
  if (typeof action !== "string") return null;
  const parsed = schemaFor(action)?.safeParse(payload);
  if (!parsed?.success) return null;
  return { action, payload: parsed.data };
}

function mapDropError(error: { code?: string; message?: string }) {
  const message = error.message ?? "";
  for (const code of ["booked_date_locked", "committed_allocation", "disabled_drop_source"]) {
    if (message.includes(code)) return { status: 409, body: { error: code } };
  }
  if (message.includes("stale_save")) return { status: 409, body: { error: "stale_save" } };
  if (message.includes("not_found")) return { status: 404, body: { error: "not_found" } };
  const validationCodes = new Set(["22023", "22P02", "23502", "23503", "23505", "23514", "42804"]);
  if (message.includes("validation") || (error.code && (error.code === "P0001" || validationCodes.has(error.code)))) {
    return { status: 400, body: { error: "validation" } };
  }
  return { status: 503, body: { error: "temporary_failure" } };
}

export async function applyDropChange(action: unknown, payload: unknown) {
  const parsed = parseDropChange(action, payload);
  if (!parsed) return { status: 400, body: { error: "validation" } };
  const result = await createServiceClient().rpc("apply_drop_change", { action: parsed.action, payload: parsed.payload });
  if (result.error) return mapDropError(result.error);
  return { status: 200, body: result.data ?? { revision: null } };
}
