"use client";

import { useState } from "react";
import dayjs from "@/lib/dayjs";
import { Button } from "@/components/ui/button";
import { Feedback, Toggle } from "../catalog/catalog-ui";
import { useBackups } from "./backup-provider";
import { downloadFile } from "./browser-storage";

export function BackupSettings() {
  const backup = useBackups();
  const [acknowledged, setAcknowledged] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const key = backup.status?.key;

  return <section className="max-w-xl space-y-4 rounded-lg border bg-background p-4 sm:p-5" aria-labelledby="backup-heading">
    <h2 id="backup-heading" className="text-lg font-semibold">Encrypted backups</h2>
    <p className="text-sm text-muted-foreground">Backups contain shop data and order records with contact details and notes removed. Keep the recovery key separately. Restoration is developer-assisted.</p>
    <Feedback error={backup.error} success={backup.message} />
    {!backup.status ? <Button variant="outline" onClick={() => void backup.refresh()}>Load backup settings</Button> : !key ?
      <Button disabled={backup.busy} onClick={() => void backup.generate()}>Generate recovery key</Button> : !key.confirmedAt ? <>
        <p className="text-sm">Download the recovery key and verify that you have a safe copy. You’ll need it to restore any backups.</p>
        {backup.privateKey ? <Button variant="outline" onClick={() => {
          downloadFile(`makalipie-recovery-${key.keyId}.txt`, backup.privateKey + "\n", "text/plain");
          setDownloadStarted(true);
        }}>Download recovery key</Button>
          : <p className="text-sm text-muted-foreground">The key was already generated. Check where you saved it. If you no longer have a copy, contact the developer before continuing.</p>}
        <Toggle label="I have verified that my recovery key is safely stored" checked={acknowledged} disabled={Boolean(backup.privateKey) && !downloadStarted} change={setAcknowledged} />
        <Button disabled={!acknowledged || backup.busy || (Boolean(backup.privateKey) && !downloadStarted)} onClick={() => void backup.confirm()}>Confirm recovery key</Button>
      </> : <>
        <p className="text-sm">Recovery key confirmed <time dateTime={key.confirmedAt}>{dayjs(key.confirmedAt).tz("Asia/Manila").format("MMM D, YYYY")}</time>.</p>
        {backup.folderSupported ? <div className="space-y-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">Choose a dedicated folder. Automatic backups run on the first admin visit each Manila day and skip days without a visit. After a successful folder save, recognized backups older than 14 days are removed.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={backup.busy} onClick={() => void backup.chooseFolder()}>{backup.config ? "Change folder" : "Choose backup folder"}</Button>
            {backup.config && <span className="break-all text-sm">{backup.config.folder.name}</span>}
          </div>
          {backup.config && <>
            {backup.permission !== "granted" && <Button variant="outline" disabled={backup.busy} onClick={() => void backup.renewPermission()}>Allow folder access</Button>}
            <Toggle label="Save automatically on admin visits" checked={backup.config.enabled} disabled={backup.busy} change={enabled => void backup.enable(enabled)} />
          </>}
        </div> : <p className="text-sm text-muted-foreground">Automatic folder saves are available on desktop Chrome. You can download encrypted backups in this browser.</p>}
        <p className="text-sm">Last successful folder save {backup.config?.savedAt
          ? <time dateTime={backup.config.savedAt}>{dayjs(backup.config.savedAt).tz("Asia/Manila").format("MMM D, YYYY h:mm A")} Manila time</time>
          : <span className="text-muted-foreground">None yet</span>}</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={backup.busy} onClick={() => void backup.run(true)}>Back up now</Button>
          {backup.config && <Button variant="outline" disabled={backup.busy} onClick={() => void backup.run(true, true)}>Download encrypted backup</Button>}
        </div>
      </>}
  </section>;
}
