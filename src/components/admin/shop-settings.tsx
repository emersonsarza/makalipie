"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ShopSettings } from "@/lib/settings/schema";
export function ShopSettingsForm({ initial }: { initial: ShopSettings }) {
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const labels: Record<keyof ShopSettings["links"], string> = { instagram: "Instagram profile", instagramDm: "Instagram chat", messenger: "Messenger (optional)", grabFood: "GrabFood", foodpanda: "Foodpanda" };
  return <section className="mx-auto max-w-2xl space-y-6 p-6"><header><h1 className="text-2xl font-semibold">Customer settings</h1><p>Contact links and defaults for new orders.</p></header><form className="space-y-5" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save settings.");
      setSettings(result.settings); setNotice("Saved. Customers see these settings on their next page load.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save. Your changes are still here."); }
    finally { setBusy(false); }
  }}><fieldset disabled={busy} className="space-y-5"><legend className="font-semibold">Contact and ordering links</legend>{(Object.keys(labels) as (keyof ShopSettings["links"])[]).map((key) => <label key={key} className="block space-y-2"><span>{labels[key]}</span><Input type="url" required={key !== "messenger"} value={settings.links[key]} onChange={(event) => setSettings({ ...settings, links: { ...settings.links, [key]: event.target.value } })} /></label>)}<p className="text-sm">Leave Messenger blank to hide it across the customer site.</p><h2 className="font-semibold">New order defaults</h2><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={settings.requireFullPaymentDefault} onChange={(e) => setSettings({ ...settings, requireFullPaymentDefault: e.target.checked })} />Require full payment before baking</label><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={settings.customerEditDefault} onChange={(e) => setSettings({ ...settings, customerEditDefault: e.target.checked })} />Allow customer editing before approval</label><p className="text-sm">Both defaults start off while the policy is undecided. Staff can change them on eligible orders.</p><label className="block space-y-2"><span>Hold minutes</span><Input type="number" min={1} max={1440} value={settings.holdMinutes} onChange={(e) => setSettings({ ...settings, holdMinutes: Number(e.target.value) })} /></label><label className="block space-y-2"><span>Confirm at least this many minutes before the slot</span><Input type="number" min={0} max={1440} value={settings.confirmBeforeSlotMinutes} onChange={(e) => setSettings({ ...settings, confirmBeforeSlotMinutes: Number(e.target.value) })} /></label><Button type="submit">{busy ? "Saving…" : "Save settings"}</Button></fieldset><p role="status">{notice}</p></form></section>;
}
