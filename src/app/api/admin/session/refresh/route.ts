import { refresh } from "../../../../../lib/admin/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request) {
  return refresh(request);
}
