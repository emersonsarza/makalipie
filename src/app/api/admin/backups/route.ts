import { withOwner } from "../../../../lib/admin/session";
import { backupStatus } from "../../../../lib/backups/keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return withOwner(request, async () => ({ status: 200, body: await backupStatus() }));
}
