import { Decrypter, Encrypter } from "age-encryption";

export const backupFormat = 1;

export const backupTables = [
  { name: "locations", order: ["id"] },
  { name: "menu_sections", order: ["id"] },
  { name: "products", order: ["id"] },
  { name: "product_sizes", order: ["product_id", "id"] },
  { name: "product_theme_images", order: ["product_id", "theme"] },
  { name: "size_theme_images", order: ["product_id", "size_id", "theme"] },
  { name: "size_branch_assignments", order: ["product_id", "size_id", "location_id"] },
  { name: "add_ons", order: ["id"] },
  { name: "add_on_locations", order: ["add_on_id", "location_id"] },
  { name: "branch_schedules", order: ["location_id"] },
  { name: "schedule_date_overrides", order: ["location_id", "service_date"] },
  { name: "shop_settings", order: ["id"] },
  { name: "featured_products", order: ["rank"] },
  { name: "popups", order: ["id"] },
  { name: "storefront_revision", order: ["id"] },
  { name: "drop_revision", order: ["id"] },
  { name: "drops", order: ["id"] },
  { name: "drop_dates", order: ["drop_id", "service_date"] },
  { name: "drop_offerings", order: ["drop_id", "id"] },
  { name: "drop_package_components", order: ["drop_id", "offering_id", "product_id", "size_id"] },
  { name: "drop_offering_dates", order: ["drop_id", "offering_id", "service_date"] },
  { name: "drop_addons", order: ["drop_id", "add_on_id"] },
  { name: "daily_order_sequences", order: ["service_date"] },
  { name: "orders", order: ["id"] },
  { name: "order_lines", order: ["order_id", "line_no"] },
  { name: "order_line_components", order: ["line_id", "product_id", "size_id"] },
  { name: "order_addons", order: ["order_id", "add_on_id"] },
  { name: "order_idempotency", order: ["idempotency_key"] },
] as const;

export type BackupTableName = (typeof backupTables)[number]["name"];
export type BackupRow = Record<string, unknown>;

export type BackupPlaintext = {
  format: typeof backupFormat;
  environment: string;
  keyId: string;
  exportedAt: string;
  tables: Record<BackupTableName, BackupRow[]>;
};

export type BackupFile = {
  format: typeof backupFormat;
  environment: string;
  keyId: string;
  exportedAt: string;
  ciphertext: string;
};

export function backupEnvironment() {
  const value = process.env.BACKUP_ENVIRONMENT?.trim();
  return value && value.length <= 40 ? value : "local";
}

export async function encryptPlaintext(plaintext: BackupPlaintext, publicKey: string) {
  const encrypter = new Encrypter();
  encrypter.addRecipient(publicKey);
  const bytes = await encrypter.encrypt(JSON.stringify(plaintext));
  return Buffer.from(bytes).toString("base64");
}

export async function decryptBackup(file: BackupFile, identity: string) {
  if (file.format !== backupFormat || typeof file.ciphertext !== "string" || !file.keyId || !file.environment || !file.exportedAt) {
    throw new Error("validation");
  }
  let text: string;
  try {
    const decrypter = new Decrypter();
    decrypter.addIdentity(identity.trim());
    text = await decrypter.decrypt(Buffer.from(file.ciphertext, "base64"), "text");
  } catch {
    throw new Error("decryption_failed");
  }
  let plaintext: BackupPlaintext;
  try {
    plaintext = JSON.parse(text) as BackupPlaintext;
  } catch {
    throw new Error("decryption_failed");
  }
  if (
    plaintext.format !== file.format
    || plaintext.environment !== file.environment
    || plaintext.keyId !== file.keyId
    || plaintext.exportedAt !== file.exportedAt
  ) {
    throw new Error("header_mismatch");
  }
  return plaintext;
}
