"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { manilaDate } from "@/lib/catalog/rules";
import {
  popupDateRange,
  popupIsPast,
  popupSettingsSchema,
  type PopupListing,
  type PopupSettings,
} from "@/lib/popups/schema";

function slug(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return base || "popup";
}

function blankListing(settings: PopupSettings, today: string): PopupListing {
  const base = "new-popup";
  let id = base;
  let n = 2;
  const taken = new Set(settings.listings.map((listing) => listing.id));
  while (taken.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return {
    id,
    name: "",
    address: "",
    mapUrl: "",
    startDate: today,
    endDate: today,
    hours: "10:00 AM – 6:00 PM",
    items: ["Pies"],
  };
}

export function PopupManager({ initialSettings }: { initialSettings: PopupSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [baseline, setBaseline] = useState(initialSettings);
  const [selectedId, setSelectedId] = useState(initialSettings.listings[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const today = manilaDate();
  const dirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(baseline), [baseline, settings]);
  const listing = settings.listings.find((item) => item.id === selectedId) ?? null;

  function patch(id: string, update: Partial<PopupListing>) {
    setSettings((current) => ({
      ...current,
      listings: current.listings.map((item) => (item.id === id ? { ...item, ...update } : item)),
    }));
    setError("");
    setNotice("");
  }

  function addListing() {
    const next = blankListing(settings, today);
    setSettings((current) => ({ ...current, listings: [...current.listings, next] }));
    setSelectedId(next.id);
    setError("");
    setNotice("");
  }

  function removeListing(id: string) {
    setSettings((current) => ({ ...current, listings: current.listings.filter((item) => item.id !== id) }));
    setSelectedId((current) => (current === id ? settings.listings.find((item) => item.id !== id)?.id ?? "" : current));
    setError("");
    setNotice("");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !dirty) return;
    const parsed = popupSettingsSchema.safeParse({
      ...settings,
      listings: settings.listings.map((item) => ({
        ...item,
        items: item.items.map((line) => line.trim()).filter(Boolean),
      })),
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/popups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save pop-ups.");
      setSettings(data.settings);
      setBaseline(data.settings);
      setSelectedId((current) => data.settings.listings.some((item: PopupListing) => item.id === current) ? current : data.settings.listings[0]?.id ?? "");
      setNotice("Pop-ups saved. Current and upcoming listings appear on the visit section.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save pop-ups.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="popup-board" onSubmit={save}>
      <aside className="popup-list">
        <Button type="button" variant="outline" onClick={addListing}>New listing</Button>
        {settings.listings.length === 0 ? <p className="popup-empty">No pop-ups yet. Add a visit listing when the next market is set.</p> : (
          <ul>
            {settings.listings.map((item) => (
              <li key={item.id}>
                <button type="button" data-active={item.id === selectedId} onClick={() => setSelectedId(item.id)}>
                  <span>{item.name.trim() || "Untitled pop-up"}</span>
                  <small>{popupDateRange(item.startDate, item.endDate)}</small>
                  {popupIsPast(item, today) ? <Badge variant="outline">Past</Badge> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      {listing ? (
        <div className="popup-editor">
          <div className="popup-fields">
            <div className="admin-field">
              <Label htmlFor="popup-name">Name</Label>
              <Input id="popup-name" value={listing.name} maxLength={80} onChange={(event) => {
                const name = event.target.value;
                const previous = slug(listing.name);
                const nextId = listing.id === previous || listing.id.startsWith("new-popup") ? slug(name) : listing.id;
                const taken = settings.listings.some((item) => item.id !== listing.id && item.id === nextId);
                patch(listing.id, { name, id: taken ? listing.id : nextId });
                if (!taken && nextId !== listing.id) setSelectedId(nextId);
              }} />
            </div>
            <div className="admin-field">
              <Label htmlFor="popup-address">Address</Label>
              <Input id="popup-address" value={listing.address} maxLength={300} onChange={(event) => patch(listing.id, { address: event.target.value })} />
            </div>
            <div className="admin-field">
              <Label htmlFor="popup-map">Map link</Label>
              <Input id="popup-map" value={listing.mapUrl} inputMode="url" placeholder="https://" maxLength={500} onChange={(event) => patch(listing.id, { mapUrl: event.target.value })} />
            </div>
            <div className="popup-dates">
              <div className="admin-field">
                <Label htmlFor="popup-start">First date</Label>
                <Input id="popup-start" type="date" value={listing.startDate} onChange={(event) => patch(listing.id, { startDate: event.target.value })} />
              </div>
              <div className="admin-field">
                <Label htmlFor="popup-end">Last date</Label>
                <Input id="popup-end" type="date" value={listing.endDate} onChange={(event) => patch(listing.id, { endDate: event.target.value })} />
              </div>
            </div>
            <div className="admin-field">
              <Label htmlFor="popup-hours">Hours</Label>
              <Input id="popup-hours" value={listing.hours} maxLength={80} onChange={(event) => patch(listing.id, { hours: event.target.value })} />
            </div>
            <div className="admin-field">
              <Label htmlFor="popup-items">Items people can find there</Label>
              <Textarea id="popup-items" rows={5} value={listing.items.join("\n")} onChange={(event) => patch(listing.id, { items: event.target.value.split("\n") })} />
            </div>
          </div>
          <div className="popup-actions">
            <Button type="submit" disabled={!dirty || busy}>{busy ? "Saving…" : "Save pop-ups"}</Button>
            <Button type="button" variant="outline" onClick={() => removeListing(listing.id)}>Remove listing</Button>
            {popupIsPast(listing, today) ? <p>This listing is past. It stays here and stays off the public visit section.</p> : <p>This listing shows on the visit section through its last date.</p>}
          </div>
          {error ? <p className="popup-error" role="alert">{error}</p> : null}
          {notice ? <p className="popup-notice" role="status">{notice}</p> : null}
        </div>
      ) : (
        <div className="popup-editor">
          <p className="popup-empty">Add a listing to publish a temporary visit stop.</p>
          {error ? <p className="popup-error" role="alert">{error}</p> : null}
          {notice ? <p className="popup-notice" role="status">{notice}</p> : null}
          {dirty ? <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save pop-ups"}</Button> : null}
        </div>
      )}
    </form>
  );
}
