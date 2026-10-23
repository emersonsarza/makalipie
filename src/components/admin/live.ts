"use client";

import { useCallback, useEffect, useState } from "react";

export type LiveResource<T> =
  | { status: "loading" | "error" | "forbidden"; message?: string }
  | { status: "ready"; snapshot: T; freshness: "current" | "refreshing" | "stale" | "offline" };

export type SaveResult<T> =
  | { ok: true; snapshot: T }
  | { ok: false; kind: "conflict" | "permission" | "network" | "validation" | "reauth"; message: string; fields?: Record<string, string> };

const saveKinds = new Set(["conflict", "permission", "network", "validation", "reauth"]);

export function useAdminResource<T>(url: string | null) {
  const [resource, setResource] = useState<LiveResource<T>>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!url) {
      setResource({ status: "loading" });
      return;
    }
    const controller = new AbortController();
    setResource((current) => current.status === "ready" ? { ...current, freshness: navigator.onLine ? "refreshing" : "offline" } : { status: "loading" });
    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { error?: unknown };
        if (response.status === 401) {
          window.location.replace("/admin/login?reason=session");
          return;
        }
        if (response.status === 403) {
          setResource({ status: "forbidden", message: typeof body.error === "string" ? body.error : "You do not have access to this page." });
          return;
        }
        if (!response.ok) {
          const message = typeof body.error === "string" ? body.error : "Could not load this page.";
          setResource((current) => current.status === "ready" ? { ...current, freshness: "stale" } : { status: "error", message });
          return;
        }
        setResource({ status: "ready", snapshot: body as T, freshness: "current" });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResource((current) => current.status === "ready" ? { ...current, freshness: navigator.onLine ? "stale" : "offline" } : { status: "error", message: "Could not load this page." });
      });
    return () => controller.abort();
  }, [url, nonce]);

  return { resource, refresh };
}

type PageSave<T> = { ok: true; snapshot: T } | { ok: false; kind: "conflict" | "permission" | "network" | "validation"; message: string; fields?: Record<string, string> };

export async function savePage<T>(url: string, body: Record<string, unknown>): Promise<PageSave<T>> {
  const result = await saveAdmin<T>(url, body);
  if (result.ok) return result;
  if (result.kind === "reauth") return { ok: false, kind: "permission", message: result.message, ...(result.fields ? { fields: result.fields } : {}) };
  return { ok: false, kind: result.kind, message: result.message, ...(result.fields ? { fields: result.fields } : {}) };
}

export async function saveAdmin<T>(url: string, body: Record<string, unknown>): Promise<SaveResult<T>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() }),
    });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; snapshot?: T; kind?: string; message?: string; error?: string; fields?: Record<string, string> };
    if (response.status === 401) {
      window.location.replace("/admin/login?reason=session");
      return { ok: false, kind: "permission", message: "Please sign in to continue." };
    }
    if (payload.ok === true && payload.snapshot) return { ok: true, snapshot: payload.snapshot };
    const kind = payload.kind && saveKinds.has(payload.kind) ? payload.kind as SaveResult<T> extends { ok: false; kind: infer K } ? K : never : response.status === 403 ? "permission" : response.status === 409 ? "conflict" : response.status >= 500 ? "network" : "validation";
    return { ok: false, kind, message: payload.message || payload.error || "The save could not be completed.", ...(payload.fields ? { fields: payload.fields } : {}) };
  } catch {
    return { ok: false, kind: "network", message: "Could not confirm the save. Refresh before retrying." };
  }
}
