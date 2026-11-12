import { withOwner } from "../../../../../../lib/admin/session";
import { confirmBackupKey } from "../../../../../../lib/backups/keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request) {
  return withOwner(request, async () => confirmBackupKey(), { mutation: true });
}
