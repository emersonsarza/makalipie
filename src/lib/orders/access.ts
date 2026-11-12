import { createServiceClient } from "../admin/supabase";
export { originAllowed } from "../http/origin";

const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 30;

export function clientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || "unknown").slice(0, 70);
}

export async function orderRateLimited(request: Request) {
  const service = createServiceClient();
  const attemptKey = `order:${clientAddress(request)}`;
  const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();
  const existing = await service.from("login_attempts").select("id", { count: "exact", head: true }).eq("attempt_key", attemptKey).gte("attempted_at", cutoff);
  if (existing.error) return "error" as const;
  if ((existing.count ?? 0) >= LIMIT) return true;
  const inserted = await service.from("login_attempts").insert({ attempt_key: attemptKey });
  if (inserted.error) return "error" as const;
  return false;
}
