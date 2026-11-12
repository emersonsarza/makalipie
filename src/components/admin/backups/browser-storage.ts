import type { BackupFile } from "@/lib/backups/format";

export type BackupDirectory = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  keys(): AsyncIterableIterator<string>;
};

export type FolderConfig = {
  folder: BackupDirectory;
  enabled: boolean;
  savedAt?: string;
  savedDay?: string;
};

export function directoryPicker() {
  return (window as Window & { showDirectoryPicker?: (options: { mode: "readwrite"; id: string }) => Promise<BackupDirectory> }).showDirectoryPicker;
}

async function storage<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("makalipie-local-backups", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("folders");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction("folders", mode);
      const request = operation(transaction.objectStore("folders"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export const readFolder = (key: string): Promise<FolderConfig | undefined> =>
  storage("readonly", store => store.get(key));
export const storeFolder = (key: string, config: FolderConfig) =>
  storage("readwrite", store => store.put(config, key));

function filenamePrefix(environment: string) {
  return `makalipie-backup-v1-${encodeURIComponent(environment)}--`;
}

export function backupFilename(file: BackupFile) {
  return `${filenamePrefix(file.environment)}${new Date(file.exportedAt).toISOString().replace(/:/g, "_")}.json`;
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveBackup(folder: BackupDirectory, file: BackupFile) {
  const handle = await folder.getFileHandle(backupFilename(file), { create: true });
  const stream = await handle.createWritable();
  try {
    await stream.write(JSON.stringify(file));
    await stream.close();
  } catch (failure) {
    await stream.abort().catch(() => {});
    throw failure;
  }
}

export async function pruneBackups(folder: BackupDirectory, file: BackupFile) {
  const prefix = filenamePrefix(file.environment);
  const threshold = Date.parse(file.exportedAt) - 14 * 86_400_000;
  for await (const name of folder.keys()) {
    if (!name.startsWith(prefix)) continue;
    const stamp = name.slice(prefix.length);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}_\d{2}_\d{2}\.\d{3}Z\.json$/.test(stamp)) continue;
    if (!(Date.parse(stamp.slice(0, -5).replace(/_/g, ":")) < threshold)) continue;
    const handle = await folder.getFileHandle(name).catch(() => undefined);
    if (!handle) continue;
    const entry = await handle.getFile();
    const old = await entry.text().then(value => {
      try { return JSON.parse(value) as Partial<BackupFile> | null; } catch { return null; }
    });
    if (old?.format !== file.format || old.environment !== file.environment || typeof old.exportedAt !== "string"
      || typeof old.keyId !== "string" || typeof old.ciphertext !== "string" || !old.ciphertext
      || !Number.isFinite(Date.parse(old.exportedAt))) continue;
    if (backupFilename(old as BackupFile) === name) await folder.removeEntry(name);
  }
}
