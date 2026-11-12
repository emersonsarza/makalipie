"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin/admin-select";
import { allowDiscard, catalogChange, catalogError, EditorActions, Feedback, SplitEditor, useDraftGuard, type Catalog } from "./catalog-ui";

type Resource = { id: string; name: string; updatedAt: string };

export function ResourceEditor<T extends Resource>({ catalog, items, action, label, create, payload, reload, fields, summary, filterEnabled }: {
  catalog: Catalog; items: T[]; action: string; label: string; create: () => T;
  payload: (draft: T) => object & { id: string }; reload: () => Promise<Catalog | undefined>;
  fields: (draft: T, update: (patch: Partial<T>) => void) => ReactNode;
  summary: (item: T) => ReactNode;
  filterEnabled?: (item: T) => boolean;
}) {
  const [draft, setDraft] = useState<T>();
  const [selected, setSelected] = useState<string>();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [phoneEditor, showEditor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [version, setVersion] = useState(0);
  const active = draft ?? items.find(item => item.id === selected) ?? items[0];
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(items.find(item => item.id === draft.id));
  useDraftGuard(dirty);

  function choose(item: T) {
    if (busy || !allowDiscard(dirty)) return;
    setSelected(item.id); setDraft(item.id ? undefined : item);
    setVersion(value => value + 1); showEditor(true); setError(""); setSuccess("");
  }

  const filtered = items.filter(item => item.name.toLowerCase().includes(search.toLowerCase())
    && (!filterEnabled || filter === "all" || filterEnabled(item) === (filter === "enabled")));

  return <SplitEditor showEditor={phoneEditor} back={() => { if (!busy) showEditor(false); }} list={<>
    <Button disabled={busy} onClick={() => choose(create())}>New {label}</Button>
    <Input aria-label={`Search ${label}s`} placeholder={`Search ${label}s`} value={search} onChange={event => setSearch(event.target.value)} />
    {filterEnabled && <AdminSelect label="Filter by status" value={filter} onValueChange={setFilter} options={[
      { value: "all", label: "All statuses" }, { value: "enabled", label: "Enabled" }, { value: "disabled", label: "Disabled" },
    ]} />}
    {filtered.length ? <ul className="divide-y">{filtered.map(item => <li key={item.id}>
      <Button variant="ghost" className="h-auto w-full justify-start whitespace-normal p-2 text-left aria-pressed:bg-accent" aria-pressed={active?.id === item.id} disabled={busy} onClick={() => choose(item)}>{summary(item)}</Button>
    </li>)}</ul> : <p className="text-sm text-muted-foreground">No matching {label}s.</p>}
  </>} editor={<>
    <Feedback error={error} success={success} />
    {error.startsWith("Someone") && <Button variant="outline" onClick={async () => {
      if (allowDiscard(dirty) && await reload()) { setDraft(undefined); setError(""); setVersion(value => value + 1); }
    }}>Reload catalog</Button>}
    {active ? <form className="space-y-4" onSubmit={async event => {
      event.preventDefault();
      if (!dirty || busy) return;
      setBusy(true); setError(""); setSuccess("");
      try {
        const data = payload(active);
        await catalogChange(action, catalog.revision, data);
        setSelected(data.id); setDraft(undefined); setVersion(value => value + 1);
        const fresh = await reload();
        if (fresh) setSuccess("Changes saved.");
        else setError("Changes were saved, but the catalog could not refresh. Reload this page.");
      } catch (failure) { setError(catalogError(failure)); }
      finally { setBusy(false); }
    }}>
      <h2 className="text-lg font-semibold">{active.id ? active.name : `New ${label}`}</h2>
      <fieldset key={active.id + ":" + version} disabled={busy} className="min-w-0 space-y-4">
        {fields(active, patch => { setDraft({ ...active, ...patch }); setSuccess(""); })}
      </fieldset>
      <EditorActions busy={busy} dirty={dirty} reset={() => { setDraft(undefined); setError(""); setVersion(value => value + 1); }} />
    </form> : <p className="text-sm text-muted-foreground">Select or create a {label}.</p>}
  </>} />;
}
