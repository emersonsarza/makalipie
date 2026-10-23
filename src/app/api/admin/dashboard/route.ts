import { NextResponse } from "next/server";
import { AdminAccessError } from "@/lib/admin/access";
import { DASHBOARD_CACHE_CONTROL, DashboardQueryError } from "@/lib/admin/dashboard";
import { readAdminDashboard } from "@/lib/admin/dashboard-data";
import { adminFailure } from "@/lib/admin/http";

function dashboardJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": DASHBOARD_CACHE_CONTROL } });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return dashboardJson(await readAdminDashboard({
      branch: url.searchParams.get("branch"),
      date: url.searchParams.get("date"),
      attentionCursor: url.searchParams.get("attentionCursor"),
      fulfillmentCursor: url.searchParams.get("fulfillmentCursor"),
    }));
  } catch (error) {
    if (error instanceof DashboardQueryError || error instanceof AdminAccessError) {
      return dashboardJson({ error: error.message }, error.status);
    }
    const response = adminFailure(error);
    response.headers.set("Cache-Control", DASHBOARD_CACHE_CONTROL);
    return response;
  }
}
