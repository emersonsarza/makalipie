// Restore procedure
// 1. Read the backup header and confirm the environment before decrypting.
// 2. Keep the private recovery key outside the database and outside the backup file.
//    Losing that key makes the matching backups unrecoverable. A later key does not open older files.
// 3. Run this script with --file, --identity, and --target makalipie_recovery.
//    It refuses the live postgres database.
// 4. Reconcile the owner allowlist in the recovery environment. Auth accounts are not copied.
// 5. Pending orders return without a name, phone, address, or notes. Recover those from the customer chat.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { backupTables, decryptBackup, type BackupFile, type BackupRow } from "../src/lib/backups/format";

const recoveryDatabase = "makalipie_recovery";
const migrationFiles = [
  "20261111120000_phase1_catalog.sql",
  "20261111140000_phase2_catalog_api.sql",
  "20261111150000_phase3_drops.sql",
  "20261111160000_phase4_orders.sql",
];

function databaseUrl(database: string) {
  const base = process.env.BACKUP_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
}

function quoteIdent(name: string) {
  if (!/^[a-z_]+$/.test(name)) throw new Error("validation");
  return `"${name}"`;
}

async function applySchema(client: Client) {
  await client.query(`
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key
    );
  `);
  for (const file of migrationFiles) {
    const sql = readFileSync(join(process.cwd(), "supabase", "migrations", file), "utf8");
    await client.query(sql);
  }
}

async function insertRows(client: Client, table: string, rows: BackupRow[]) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]).filter((column) => /^[a-z_]+$/.test(column));
  const columnList = columns.map(quoteIdent).join(", ");
  for (const row of rows) {
    const values = columns.map((column) => row[column] ?? null);
    const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
    await client.query(`insert into public.${quoteIdent(table)} (${columnList}) values (${placeholders})`, values);
  }
}

export async function dropRecoveryDatabase() {
  const admin = new Client({ connectionString: databaseUrl("postgres") });
  await admin.connect();
  try {
    await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()", [recoveryDatabase]);
    await admin.query(`drop database if exists ${quoteIdent(recoveryDatabase)}`);
  } finally {
    await admin.end();
  }
}

export async function restoreBackup(file: BackupFile, identity: string, target = recoveryDatabase) {
  if (target !== recoveryDatabase) throw new Error("refused_target");
  const plaintext = await decryptBackup(file, identity);
  const admin = new Client({ connectionString: databaseUrl("postgres") });
  await admin.connect();
  try {
    const existing = await admin.query("select 1 from pg_database where datname = $1", [recoveryDatabase]);
    if (existing.rowCount === 0) {
      await admin.query(`create database ${quoteIdent(recoveryDatabase)} template template0`);
    }
  } finally {
    await admin.end();
  }

  const client = new Client({ connectionString: databaseUrl(recoveryDatabase) });
  await client.connect();
  try {
    const ready = await client.query("select to_regclass('public.orders') as orders");
    if (!ready.rows[0]?.orders) await applySchema(client);
    const newer = await client.query("select 1 from public.orders where created_at > $1 limit 1", [plaintext.exportedAt]);
    if ((newer.rowCount ?? 0) > 0) throw new Error("newer_data");
    const truncateList = [...backupTables].reverse().map((table) => `public.${quoteIdent(table.name)}`).join(", ");
    await client.query("begin");
    try {
      await client.query(`truncate table ${truncateList} restart identity cascade`);
      for (const table of backupTables) {
        const rows = plaintext.tables[table.name] ?? [];
        await insertRows(client, table.name, rows);
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  } finally {
    await client.end();
  }
}

function argument(name: string) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? "" : process.argv[index + 1];
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

async function main() {
  const file = JSON.parse(readFileSync(argument("--file"), "utf8")) as BackupFile;
  const identity = readFileSync(argument("--identity"), "utf8");
  await restoreBackup(file, identity, argument("--target"));
}

if (process.argv[1]?.endsWith("restore-backup.ts")) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "restore_failed";
    console.error(message);
    process.exitCode = 1;
  });
}
