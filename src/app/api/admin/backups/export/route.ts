import { withOwner } from "../../../../../lib/admin/session";
import { exportBackup } from "../../../../../lib/backups/export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request) {
  return withOwner(request, async () => exportBackup(), { mutation: true });
}
