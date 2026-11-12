import { withOwner } from "@/lib/admin/session";
import { createServiceClient } from "@/lib/admin/supabase";
import { parseCatalogChange } from "@/lib/storefront/change";
import { branchWindow } from "@/lib/storefront/eligibility";
import { loadCatalog } from "@/lib/storefront/load";
import { minutesOfDay } from "@/lib/scheduling/schema";

export function POST(request: Request) {
  return withOwner(request, async () => {
    const body = await request.json().catch(() => null);
    const change = parseCatalogChange(body?.action, body?.payload);
    if (!change || !["save_override", "delete_override"].includes(change.action)) {
      return { status: 400, body: { error: "validation" } };
    }
    const { revision, date, locationId, closed, opens, cutoff } = change.payload;
    const catalog = await loadCatalog();
    if (catalog.revision !== revision) return { status: 409, body: { error: "stale_save" } };
    if (typeof date !== "string" || typeof locationId !== "string" || !catalog.locations.some(location => location.id === locationId && location.kind === "regular")) {
      return { status: 400, body: { error: "validation" } };
    }

    const window = change.action === "delete_override"
      ? branchWindow({ ...catalog, overrides: catalog.overrides.filter(item => item.locationId !== locationId || item.date !== date) }, locationId, date)
      : closed || typeof opens !== "string" || typeof cutoff !== "string" ? null : { opens, cutoff };
    const client = createServiceClient();
    const affected: { id: string; number: string; slot: string | null }[] = [];
    for (let offset = 0; ; offset += 250) {
      const { data, error } = await client.from("orders").select("id,order_number,slot_id,window_starts,window_ends")
        .eq("channel", "regular").eq("location_id", locationId).eq("fulfillment_date", date)
        .in("status", ["pending", "confirmed"]).order("id").range(offset, offset + 249);
      if (error) throw error;
      for (const order of data) {
        const slot = (order.window_starts ?? order.slot_id)?.slice(0, 5) ?? null;
        const start = slot ? minutesOfDay(slot) : -1;
        const end = order.window_ends ? minutesOfDay(order.window_ends.slice(0, 5)) : start + 60;
        if (!window || start < minutesOfDay(window.opens) || end > minutesOfDay(window.cutoff)) {
          affected.push({ id: order.id, number: order.order_number, slot });
        }
      }
      if (data.length < 250) break;
    }
    return { status: 200, body: { affected } };
  }, { mutation: true });
}
