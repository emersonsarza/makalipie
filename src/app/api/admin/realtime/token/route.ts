import { readSupabaseEnv } from "@/lib/admin/env";
import { withOwner } from "../../../../../lib/admin/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return withOwner(request, async (session) => ({
    status: 200,
    body: { accessToken: session.accessToken, expiresAt: session.expiresAt, ...(new URL(request.url).searchParams.get("connection") === "1" ? realtimeConfig() : {}) },
  }));
}

function realtimeConfig() {
  const { url, publishableKey } = readSupabaseEnv();
  return { url, publishableKey };
}
