"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useId } from "react";
import { adminRequest, OrderRequestError } from "../orders-data";
import type { StoreCatalog } from "@/lib/storefront/types";

export type Catalog = StoreCatalog & { imagePaths: string[] };

export function catalogChange(action: string, revision: number, payload: object) {
  return adminRequest<{ revision: number }>("/api/admin/catalog", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload: { ...payload, revision } }),
  });
}

export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog>();
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      const next = await adminRequest<Catalog>("/api/admin/catalog");
      setCatalog(next);
      setError("");
      return next;
    } catch {
      setError("Could not load the catalog. Try again.");
      return undefined;
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);
  return { catalog, error, reload };
}

export function catalogError(error: unknown) {
  if (error instanceof OrderRequestError) {
    if (error.body.error === "stale_save") return "Someone changed the catalog. Reload before saving this draft.";
    if (error.status === 400) return "Check the required fields, dates, and values before saving.";
  }
  return "Could not save. Try again.";
}

let activeDrafts = 0;

function warnBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
}

function warnBeforeNavigation(event: MouseEvent) {
  if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.origin !== location.origin || link.pathname === location.pathname) return;
  if (!allowDiscard(true)) {
    event.preventDefault();
    event.stopPropagation();
  }
}

export function useDraftGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    if (activeDrafts++ === 0) {
      window.addEventListener("beforeunload", warnBeforeUnload);
      document.addEventListener("click", warnBeforeNavigation, true);
    }
    return () => {
      if (--activeDrafts === 0) {
        window.removeEventListener("beforeunload", warnBeforeUnload);
        document.removeEventListener("click", warnBeforeNavigation, true);
      }
    };
  }, [dirty]);
}

export function allowDiscard(dirty: boolean) {
  return !dirty || window.confirm("Discard unsaved changes?");
}

export const slug = (value: string) => value.trim().toLowerCase().normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60).replace(/-$/, "");

export function uniqueSlug(value: string, used: string[], fallback: string) {
  const base = slug(value) || fallback;
  let id = base;
  for (let index = 2; used.includes(id); index++) id = base.slice(0, 54) + "-" + index;
  return id;
}

export function Field({ label, children, hideLabel }: { label: string; children: ReactNode; hideLabel?: boolean }) {
  return <label className="grid min-w-0 gap-1.5 text-sm font-medium"><span className={hideLabel ? "sr-only" : undefined}>{label}</span>{children}</label>;
}

export function TextField({ label, value, change, hideLabel, ...props }: {
  label: string; value: string; hideLabel?: boolean; change: (value: string) => void;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  return <Field label={label} hideLabel={hideLabel}><Input {...props} value={value} onChange={event => change(event.target.value)} /></Field>;
}

export function Toggle({ label, checked, change, disabled, hideLabel }: { label: string; checked: boolean; change: (value: boolean) => void; disabled?: boolean; hideLabel?: boolean }) {
  const id = useId();
  return <div className="flex min-h-8 items-center gap-3">
    <Switch id={id} checked={checked} onCheckedChange={change} disabled={disabled} aria-labelledby={id + "-label"} />
    <label id={id + "-label"} htmlFor={id} className={hideLabel ? "sr-only" : "text-sm font-medium"}>{label}</label>
  </div>;
}

export function Feedback({ error, success }: { error?: string; success?: string }) {
  return error ? <Alert role="alert" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
    : success ? <p role="status" className="text-sm text-muted-foreground">{success}</p> : null;
}

export function CatalogLoading({ error, retry }: { error: string; retry: () => void }) {
  return error ? <div className="space-y-3"><Feedback error={error} /><Button variant="outline" onClick={retry}>Try again</Button></div> : <Skeleton className="h-56" />;
}

export function EditorActions({ busy, dirty, reset }: { busy: boolean; dirty: boolean; reset: () => void }) {
  return <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
    <Button type="button" variant="outline" disabled={busy || !dirty} onClick={() => { if (allowDiscard(dirty)) reset(); }}>Discard changes</Button>
    <Button type="submit" disabled={busy || !dirty}>{busy ? "Saving…" : "Save changes"}</Button>
  </div>;
}

export function SplitEditor({ list, editor, showEditor, back }: { list: ReactNode; editor: ReactNode; showEditor: boolean; back: () => void }) {
  return <div className="grid items-start gap-5 lg:grid-cols-[minmax(14rem,0.72fr)_minmax(0,1.28fr)]">
    <section className={showEditor ? "hidden min-w-0 space-y-3 lg:block" : "min-w-0 space-y-3"}>{list}</section>
    <section className={(showEditor ? "" : "hidden lg:block ") + "min-w-0 space-y-4 rounded-lg border bg-background p-4 sm:p-5"}>
      {showEditor && <Button variant="outline" className="lg:hidden" onClick={back}>Back to list</Button>}
      {editor}
    </section>
  </div>;
}

export function PriceField({ cents, change }: { cents: number; change: (cents: number) => void }) {
  const [value, setValue] = useState(String(cents / 100));
  return <TextField label="Price (₱)" type="number" min="0" max="21474836.47" step="0.01" required value={value} change={next => { setValue(next); change(Math.round(Number(next) * 100)); }} />;
}

