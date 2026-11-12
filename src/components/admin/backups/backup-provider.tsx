"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { BackupFile } from "@/lib/backups/format";
import { useAdminQuery } from "../query-provider";
import { adminRequest, manilaToday } from "../orders-data";
import { backupFilename, directoryPicker, downloadFile, pruneBackups, readFolder, saveBackup, storeFolder, type FolderConfig } from "./browser-storage";

type Key = { keyId: string; createdAt: string; confirmedAt: string | null };
type Status = { key: Key | null; environment: string };
const mode = { mode: "readwrite" } as const;

function post<T>(endpoint: string) {
  return adminRequest<T>(`/api/admin/backups/${endpoint}`, { method: "POST" });
}

function useBackupControls(accountId: string) {
  const pathname = usePathname();
  const statusQuery = useAdminQuery<Status>("/api/admin/backups");
  const status = statusQuery.data;
  const [config, setConfig] = useState<FolderConfig>();
  const [folderSupported, setFolderSupported] = useState(false);
  const [privateKey, setPrivateKey] = useState("");
  const [permission, setPermission] = useState<PermissionState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const running = useRef(false);
  const scope = status ? JSON.stringify([status.environment, accountId]) : "";
  const lock = "makalipie-backup:" + scope;

  const { refetch } = statusQuery;
  const refresh = useCallback(async () => { await refetch(); }, [refetch]);
  useEffect(() => {
    void Promise.resolve().then(() => setFolderSupported(Boolean(directoryPicker() && navigator.locks && window.indexedDB)));
  }, []);

  const run = useCallback(async (manual: boolean, download = false) => {
    if (!status?.key?.confirmedAt || running.current) return;
    if (!manual && (!folderSupported || document.visibilityState !== "visible")) return;
    running.current = true;
    async function exportFile() {
      const file = await post<BackupFile>("export");
      if (file.environment !== status?.environment) throw new Error("environment changed");
      return file;
    }
    try {
      const current = folderSupported ? await readFolder(scope) : undefined;
      if (!manual && (!current?.enabled || current.savedDay === manilaToday())) {
        if (current) setConfig(current);
        return;
      }
      setBusy(true);
      setError("");
      setMessage("");
      if (download || !current) {
        const file = await exportFile();
        downloadFile(backupFilename(file), JSON.stringify(file), "application/json");
        setMessage("Download started. Check your Downloads folder for the encrypted file.");
        return;
      }
      const attempted = await navigator.locks.request(lock, { ifAvailable: true }, async held => {
        if (!held) return false;
        const latest = await readFolder(scope);
        if (!latest || (!manual && (!latest.enabled || latest.savedDay === manilaToday()))) {
          setConfig(latest);
          return true;
        }
        const access = await latest.folder.queryPermission(mode);
        setPermission(access);
        if (access !== "granted") {
          setError("Allow access to the backup folder in Settings, or download an encrypted copy.");
          return true;
        }
        const file = await exportFile();
        await saveBackup(latest.folder, file);
        const saved = {
          ...latest, savedAt: new Date().toISOString(), savedDay: manilaToday(),
        };
        setConfig(saved);
        try {
          await storeFolder(scope, saved);
        } catch {
          setError("The backup file was saved, but this browser could not remember the save time.");
          return true;
        }
        try {
          await pruneBackups(latest.folder, file);
          setMessage("Encrypted backup saved.");
        } catch {
          setMessage("Encrypted backup saved. Some older files could not be checked or removed.");
        }
        return true;
      });
      if (!attempted && manual) setError("A backup is already running in another tab. Try again when it finishes.");
    } catch {
      setError("Could not finish the backup. Check folder access or try an encrypted download.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [folderSupported, lock, scope, status]);

  useEffect(() => {
    if (!folderSupported || !scope) return;
    let active = true;
    void readFolder(scope).then(async next => {
      const access = await next?.folder.queryPermission(mode);
      if (active) { setConfig(next); setPermission(access); }
    }).catch(() => { if (active) setError("Could not read the saved backup folder."); });
    return () => { active = false; };
  }, [folderSupported, scope]);

  useEffect(() => {
    function check() { void run(false); }
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [pathname, run]);

  async function change(action: () => Promise<void>, failure: string) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try { await action(); }
    catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(failure);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return {
    status, config, folderSupported, privateKey, permission, busy, error, message, refresh, run,
    generate: () => change(async () => {
      try {
        const generated = await post<Key & { privateKey: string }>("key");
        const { privateKey: recoveryKey } = generated;
        setPrivateKey(recoveryKey);
        await refresh();
      } catch (failure) {
        await refresh();
        throw failure;
      }
    }, "Could not generate the recovery key. If a key was already created, use the saved copy or contact the developer."),
    confirm: () => change(async () => {
      await post<Key>("key/confirm");
      await refresh();
      setPrivateKey("");
      setMessage("Recovery key confirmed.");
    }, "Could not confirm the recovery key. Keep your saved copy and try again."),
    chooseFolder: () => change(async () => {
      const picker = directoryPicker();
      if (!picker) return;
      const folder = await picker.call(window, { ...mode, id: "makalipie-backups" });
      await navigator.locks.request(lock, async () => {
        const latest = await readFolder(scope);
        const next = latest && await latest.folder.isSameEntry(folder) ? { ...latest, folder } : { folder, enabled: false };
        await storeFolder(scope, next);
        setConfig(next);
        setPermission(await folder.queryPermission(mode));
      });
    }, "Could not set the backup folder. Choose a folder you can write to."),
    renewPermission: async () => {
      let access: PermissionState | undefined;
      await change(async () => {
        access = await config?.folder.requestPermission(mode);
        setPermission(access);
        if (access !== "granted") setError("Folder access was denied. You can still download an encrypted copy.");
      }, "Could not renew folder access. Choose the folder again or download an encrypted copy.");
      if (access === "granted") void run(false);
    },
    enable: async (enabled: boolean) => {
      await change(async () => {
        await navigator.locks.request(lock, async () => {
          const latest = await readFolder(scope);
          if (!latest) return;
          const next = { ...latest, enabled };
          await storeFolder(scope, next);
          setConfig(next);
        });
      }, "Could not update automatic backups.");
      if (enabled) void run(false);
    },
  };
}

const BackupContext = createContext<ReturnType<typeof useBackupControls> | null>(null);

export function BackupProvider({ accountId, children }: { accountId: string; children: ReactNode }) {
  const controls = useBackupControls(accountId);
  return <BackupContext.Provider value={controls}>{children}</BackupContext.Provider>;
}

export function useBackups() {
  const controls = useContext(BackupContext);
  if (!controls) throw new Error("Backups require an authenticated workspace.");
  return controls;
}
