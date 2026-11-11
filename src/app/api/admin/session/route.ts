import { readSession, signIn } from "../../../../lib/admin/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request) {
  return signIn(request);
}

export function GET(request: Request) {
  return readSession(request);
}
