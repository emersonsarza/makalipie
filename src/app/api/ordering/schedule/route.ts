import { NextResponse } from "next/server";
import { orderIntakeEnabled } from "@/lib/orders/schema";
import { readOrderingAvailability } from "@/lib/orders/store";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const availability = await readOrderingAvailability();
    return NextResponse.json({ settings: availability.schedule, openDates: availability.openDates, openProducts: availability.openProducts, intakeEnabled: orderIntakeEnabled(), serverNow: availability.serverNow }, { headers: { "Cache-Control": "no-store" } });
  }
  catch { return NextResponse.json({ error: "We couldn’t refresh the available dates. Please try again." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
