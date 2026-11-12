import { createServiceClient } from "../admin/supabase";
import { backupEnvironment, backupFormat, encryptPlaintext, type BackupFile, type BackupPlaintext } from "./format";
import { readBackupKey } from "./keys";

export async function exportBackup(): Promise<{ status: number; body: BackupFile | { error: string } }> {
  const key = await readBackupKey();
  if (!key) return { status: 409, body: { error: "key_missing" } };
  if (!key.confirmed_at) return { status: 409, body: { error: "key_unconfirmed" } };
  const exportedAt = new Date().toISOString();
  const environment = backupEnvironment();
  const snapshot = await createServiceClient().rpc("admin_backup_snapshot");
  if (snapshot.error || !snapshot.data) throw new Error("Backup snapshot unavailable.");
  const tables = snapshot.data as BackupPlaintext["tables"];
  const ciphertext = await encryptPlaintext({
    format: backupFormat,
    environment,
    keyId: key.id,
    exportedAt,
    tables,
  }, key.public_key);
  return {
    status: 200,
    body: { format: backupFormat, environment, keyId: key.id, exportedAt, ciphertext },
  };
}
