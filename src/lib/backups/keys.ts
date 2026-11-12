import { generateIdentity, identityToRecipient } from "age-encryption";
import { createServiceClient } from "../admin/supabase";
import { backupEnvironment } from "./format";

type KeyRow = {
  id: string;
  public_key: string;
  created_at: string;
  confirmed_at: string | null;
};

function present(row: KeyRow) {
  return {
    keyId: row.id,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
  };
}

export async function readBackupKey() {
  const result = await createServiceClient().from("backup_keys").select("id, public_key, created_at, confirmed_at").limit(1).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as KeyRow | null;
}

export async function backupStatus() {
  const key = await readBackupKey();
  return { environment: backupEnvironment(), key: key ? present(key) : null };
}

export async function createBackupKey() {
  const existing = await readBackupKey();
  if (existing) return { status: 409, body: { error: "key_exists" } };
  const privateKey = (await generateIdentity()).trim();
  const publicKey = (await identityToRecipient(privateKey)).trim();
  const inserted = await createServiceClient().from("backup_keys").insert({ public_key: publicKey }).select("id, public_key, created_at, confirmed_at").single();
  if (inserted.error?.code === "23505") return { status: 409, body: { error: "key_exists" } };
  if (inserted.error || !inserted.data) return { status: 503, body: { error: "temporary_failure" } };
  const key = inserted.data as KeyRow;
  return {
    status: 200,
    body: { ...present(key), publicKey: key.public_key, privateKey },
  };
}

export async function confirmBackupKey() {
  const existing = await readBackupKey();
  if (!existing) return { status: 404, body: { error: "not_found" } };
  if (existing.confirmed_at) return { status: 200, body: present(existing) };
  const confirmedAt = new Date().toISOString();
  const updated = await createServiceClient().from("backup_keys").update({ confirmed_at: confirmedAt }).eq("id", existing.id).select("id, created_at, confirmed_at").single();
  if (updated.error || !updated.data) return { status: 503, body: { error: "temporary_failure" } };
  return {
    status: 200,
    body: {
      keyId: updated.data.id,
      createdAt: updated.data.created_at,
      confirmedAt: updated.data.confirmed_at,
    },
  };
}
