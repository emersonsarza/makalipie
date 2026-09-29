import { z } from "zod";
import { clockTimeSchema } from "@/lib/scheduling/schema";
import { readScheduleSettings } from "@/lib/scheduling/store";
import { scheduleValidationError, slotsForDate } from "@/lib/scheduling/rules";
import { branchIdSchema, catalogForSelection, resolveBranch } from "@/lib/branches/schema";
import { readBranchSettings } from "@/lib/branches/store";
import { NextResponse } from "next/server";
import { selectionSchema } from "@/lib/catalog/schema";
import { manilaDate, quoteSelection } from "@/lib/catalog/rules";
import { readPublicMenu } from "@/lib/products/public";
import { readLimitedBody } from "@/lib/admin/http";
import { flavorAvailabilityMessage, flavorCapacityKey, flavorHasRoom, flavorQuantities } from "@/lib/orders/allocation";
import { dailyCapacityKey } from "@/lib/orders/policy";
import { orderIntakeEnabled } from "@/lib/orders/schema";
import { readAllocationDayMap, readAllocationMap, readOrderingAvailability } from "@/lib/orders/store";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Expected JSON." }, 415);
    const input = selectionSchema.extend({ branchId: branchIdSchema.optional(), slotId: clockTimeSchema, catalogMode: z.enum(["regular", "preorder"]).optional() }).safeParse(JSON.parse((await readLimitedBody(request, 30_000)).toString()));
    if (!input.success) return json({ error: "Please check your product selections and date." }, 400);
    const { catalog } = await readPublicMenu();
    if (!catalog) return json({ error: "The menu is temporarily unavailable. Please try again." }, 503);
    const settings = await readBranchSettings();
    const branch = resolveBranch(input.data.branchId, settings);
    const selection = { date: input.data.date, lines: input.data.lines, addons: input.data.addons };
    const scoped = catalogForSelection(catalog, settings, branch, selection.lines, input.data.catalogMode);
    if ("error" in scoped) return json({ error: scoped.error }, 400);
    const schedule = await readScheduleSettings();
    const now = new Date();
    const scheduleError = scheduleValidationError(schedule, branch, input.data.date, input.data.slotId, now);
    if (scheduleError) {
      const availability = orderIntakeEnabled() ? await readOrderingAvailability(now) : null;
      return json({ error: scheduleError, schedule, serverNow: now.toISOString(), ...(availability ? { openDates: availability.openDates, openProducts: availability.openProducts } : {}) }, 409);
    }
    if (orderIntakeEnabled()) {
      const [allocations, days] = await Promise.all([readAllocationMap(), readAllocationDayMap()]);
      const today = manilaDate(now);
      const paused = input.data.date === today && days.get(dailyCapacityKey(branch, input.data.date))?.paused === true;
      const availability = await readOrderingAvailability(now);
      if (paused) return json({ error: "That date is no longer available for online requests. Choose another date; your cart has been kept.", schedule: availability.schedule, openDates: availability.openDates, openProducts: availability.openProducts, serverNow: availability.serverNow }, 409);
      const names = new Map(scoped.catalog.products.map((product) => [product.id, product.name]));
      const short = flavorQuantities(input.data.lines).flatMap((flavor) => flavorHasRoom(allocations.get(flavorCapacityKey(branch, input.data.date, flavor.productId)), flavor.quantity, input.data.date, today, false) ? [] : [names.get(flavor.productId) ?? flavor.productId]);
      if (short.length) return json({ error: flavorAvailabilityMessage(short), schedule: availability.schedule, openDates: availability.openDates, openProducts: availability.openProducts, serverNow: availability.serverNow }, 409);
    }
    const quote = quoteSelection(scoped.catalog, selection);
    return quote.errors.length ? json({ error: quote.errors.join(" ") }, 400) : json({ ...quote, slot: slotsForDate(schedule, branch, input.data.date, now).find((slot) => slot.id === input.data.slotId) });
  } catch { return json({ error: "Could not check your selections. Please try again." }, 400); }
}
