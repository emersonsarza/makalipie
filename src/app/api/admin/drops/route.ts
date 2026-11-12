import { createServiceClient } from "@/lib/admin/supabase";
import { withOwner } from "../../../../lib/admin/session";
import { applyDropChange } from "../../../../lib/drops/change";
import { loadDrops } from "../../../../lib/drops/load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return withOwner(request, async () => {
    const [store, booked] = await Promise.all([
      loadDrops(),
      createServiceClient().rpc("admin_booked_drop_dates"),
    ]);
    if (booked.error) throw booked.error;
    const bookedDates: Record<string, string[]> = {};
    for (const row of booked.data ?? []) (bookedDates[row.drop_id] ??= []).push(row.date);
    return { status: 200, body: { ...store, bookedDates } };
  });
}

export function POST(request: Request) {
  return withOwner(request, async () => {
    const body: unknown = await request.json().catch(() => null);
    const record = typeof body === "object" && body !== null ? body as { action?: unknown; payload?: unknown } : {};
    return applyDropChange(record.action, record.payload);
  }, { mutation: true });
}
