"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import type { Catalog } from "@/lib/catalog/schema";
import { CEBU_BRANCH_ID, currentAssignments, slugifyBranchName, type BranchSettings } from "@/lib/branches/schema";

export function BranchManager({ initialSettings, initialCatalog }: { initialSettings: BranchSettings; initialCatalog: Catalog }) {
  const [settings, setSettings] = useState<BranchSettings | null>(() => ({ ...initialSettings, assignments: currentAssignments(initialCatalog, initialSettings) }));
  const [catalog, setCatalog] = useState<Catalog | null>(initialCatalog);
  const [branch, setBranch] = useState(initialSettings.defaultBranch);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/branches", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load branches.");
      setCatalog(data.catalog);
      setSettings({ ...data.settings, assignments: currentAssignments(data.catalog, data.settings) });
      setBranch((current) => data.settings.branches.some((item: { id: string }) => item.id === current) ? current : CEBU_BRANCH_ID);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load branches.");
    } finally {
      setBusy(false);
    }
  }

  function edit(next: BranchSettings) {
    setSettings(next);
    setNotice("");
  }

  function addBranch() {
    if (!settings) return;
    const name = newName.trim();
    if (!name) return;
    const id = slugifyBranchName(name, settings.branches.map((item) => item.id));
    edit({
      ...settings,
      branches: [...settings.branches, { id, name, address: "", visible: false, deliveryEnabled: true, areas: [] }],
    });
    setBranch(id);
    setAdding(false);
    setNewName("");
  }

  function setVisible(id: string, visible: boolean) {
    if (!settings || id === CEBU_BRANCH_ID) return;
    edit({
      ...settings,
      defaultBranch: !visible && settings.defaultBranch === id ? CEBU_BRANCH_ID : settings.defaultBranch,
      branches: settings.branches.map((item) => item.id === id ? { ...item, visible } : item),
    });
  }

  function removeBranch(id: string) {
    if (!settings || id === CEBU_BRANCH_ID) return;
    const shop = settings.branches.find((item) => item.id === id);
    if (!shop || !window.confirm(`Remove ${shop.name}? It leaves the public site, product assignments, and the bakery schedule.`)) return;
    edit({
      ...settings,
      defaultBranch: settings.defaultBranch === id ? CEBU_BRANCH_ID : settings.defaultBranch,
      branches: settings.branches.filter((item) => item.id !== id),
      assignments: settings.assignments.map((assignment) => ({ ...assignment, branchIds: assignment.branchIds.filter((value) => value !== id) })),
    });
    setBranch(CEBU_BRANCH_ID);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!settings || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          branches: settings.branches.map((item) => ({ ...item, areas: item.areas.map((area) => area.trim()).filter(Boolean) })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.fields ? Object.values(data.fields).join(" ") : data.error || "Could not save branches.");
      setSettings(data.settings);
      setNotice("Branch settings saved. New customer visits will use these settings.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save branches. Your changes are still here.");
    } finally {
      setBusy(false);
    }
  }

  const shop = settings?.branches.find((item) => item.id === branch) ?? settings?.branches.find((item) => item.id === CEBU_BRANCH_ID);
  const here = settings && shop ? settings.assignments.filter((item) => item.branchIds.includes(shop.id)) : [];
  const regular = here.filter((item) => item.mode === "regular").length;
  const preorder = here.filter((item) => item.mode === "preorder").length;

  return (
    <div className="branch-counter space-y-6">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="text-destructive">{error}</AlertDescription>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => {
              if (!settings || window.confirm("Reload and discard unsaved branch changes?")) void load();
            }}
          >
            Reload branches
          </Button>
        </Alert>
      ) : null}
      {!settings || !catalog || !shop ? (
        <p role="status">{busy ? "Loading branches…" : "Branch settings could not be loaded."}</p>
      ) : (
        <form onSubmit={save}>
          <fieldset disabled={busy} className="br-stage">
          <legend className="sr-only">Branch settings</legend>
          <div className="br-tabs" role="tablist" aria-label="Branch">
            {settings.branches.map((item) => (
              <span key={item.id} className="br-tab-wrap" data-on={shop.id === item.id}>
                <button
                  type="button"
                  className="br-tab"
                  role="tab"
                  aria-selected={shop.id === item.id}
                  data-on={shop.id === item.id}
                  onClick={() => setBranch(item.id)}
                >
                  {item.name}
                </button>
                {item.visible ? null : (
                  <HoverCard>
                    <HoverCardTrigger
                      render={<button type="button" />}
                      className="br-tab-hidden"
                      aria-label={`${item.name} is hidden from the public site`}
                    >
                      <EyeOff size={14} aria-hidden="true" />
                    </HoverCardTrigger>
                    <HoverCardContent>
                      Hidden from the public site. Customers will not see this branch until you show it.
                    </HoverCardContent>
                  </HoverCard>
                )}
              </span>
            ))}
            {adding ? (
              <span className="br-add">
                <Input
                  aria-label="New branch name"
                  required
                  maxLength={100}
                  value={newName}
                  disabled={busy}
                  autoFocus
                  placeholder="Branch name"
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addBranch();
                    }
                    if (event.key === "Escape") {
                      setAdding(false);
                      setNewName("");
                    }
                  }}
                />
                <button type="button" className="br-button" disabled={busy || !newName.trim()} onClick={addBranch}>
                  Add
                </button>
              </span>
            ) : (
              <button type="button" className="br-tab" onClick={() => setAdding(true)}>
                Add branch
              </button>
            )}
          </div>

          <div key={shop.id} className="br-pane">
            <article className="br-card">
              <div className="br-controls">
                <p className="br-eyebrow">{shop.id === CEBU_BRANCH_ID ? "Cebu · always on the site" : shop.visible ? "Shown on the site" : "Hidden from the site"}</p>
                <div className="br-controls-right">
                  {shop.visible ? (
                    <button
                      type="button"
                      className={settings.defaultBranch === shop.id ? "br-button" : "br-button-quiet"}
                      onClick={() => edit({ ...settings, defaultBranch: shop.id })}
                    >
                      {settings.defaultBranch === shop.id ? "Customers start here" : "Make this the start"}
                    </button>
                  ) : null}
                  {shop.id === CEBU_BRANCH_ID ? null : (
                    <button type="button" className="br-button-quiet" onClick={() => setVisible(shop.id, !shop.visible)}>
                      {shop.visible ? "Hide" : "Show"}
                    </button>
                  )}
                  {shop.id === CEBU_BRANCH_ID ? null : (
                    <button type="button" className="br-button-quiet" onClick={() => removeBranch(shop.id)}>
                      Remove
                    </button>
                  )}
                  {shop.visible ? (
                    <a className="br-button-quiet" href={`/order?branch=${shop.id}`} target="_blank" rel="noreferrer">
                      Preview menu
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="br-split">
                <label className="br-field">
                  <span>Branch name</span>
                  <Input
                    required
                    maxLength={100}
                    value={shop.name}
                    disabled={busy}
                    onChange={(event) => edit({
                      ...settings,
                      branches: settings.branches.map((item) => item.id === shop.id ? { ...item, name: event.target.value } : item),
                    })}
                  />
                </label>
                <label className="br-field">
                  <span>Pickup address</span>
                  <Input
                    maxLength={300}
                    value={shop.address}
                    placeholder="Pickup address customers will see"
                    disabled={busy}
                    onChange={(event) => edit({
                      ...settings,
                      branches: settings.branches.map((item) => item.id === shop.id ? { ...item, address: event.target.value } : item),
                    })}
                  />
                </label>
              </div>
              <div className="br-split">
                <div className="br-field">
                  <span>Delivery</span>
                  <button
                    type="button"
                    className={shop.deliveryEnabled ? "br-button" : "br-button-quiet"}
                    onClick={() => edit({
                      ...settings,
                      branches: settings.branches.map((item) => item.id === shop.id ? { ...item, deliveryEnabled: !item.deliveryEnabled } : item),
                    })}
                  >
                    {shop.deliveryEnabled ? "Delivery is on" : "Delivery is off"}
                  </button>
                </div>
                <label className="br-field">
                  <span>Delivery areas</span>
                  <Textarea
                    aria-label="Delivery areas"
                    rows={3}
                    value={shop.areas.join("\n")}
                    placeholder="One area name per line"
                    disabled={busy}
                    onChange={(event) => {
                      const seen = new Set<string>();
                      const lines = event.target.value.split("\n");
                      const areas = lines.flatMap((line, index) => {
                        const name = (index === lines.length - 1 ? line : line.trim()).trim();
                        if (!name) return index === lines.length - 1 && event.target.value.endsWith("\n") ? [""] : [];
                        const key = name.toLowerCase();
                        if (seen.has(key)) return [];
                        seen.add(key);
                        return [name];
                      }).slice(0, 30);
                      edit({
                        ...settings,
                        branches: settings.branches.map((item) => item.id === shop.id ? { ...item, areas } : item),
                      });
                    }}
                  />
                  <p className="br-eyebrow">Staff see these names while reviewing an address.</p>
                </label>
              </div>
              <div className="br-funnel" aria-label="Menu counts">
                <div className="br-step">
                  <span>Sold here</span>
                  <strong>{here.length}</strong>
                </div>
                <div className="br-step">
                  <span>Regular</span>
                  <strong>{regular}</strong>
                </div>
                <div className="br-step">
                  <span>Pre-order</span>
                  <strong>{preorder}</strong>
                </div>
              </div>
            </article>

            <section className="br-sizes">
              <h2 className="br-title">Sizes</h2>
              {!catalog.initialized ? (
                <Alert role="status">
                  <AlertDescription>
                    Set up catalog options in <Link href="/admin/catalog" className="underline">Catalog</Link> before saving branch assignments.
                  </AlertDescription>
                </Alert>
              ) : null}
              {catalog.products.length === 0 ? <p className="br-body">No products yet. Add products in Catalog first.</p> : null}
              {settings.assignments.map((assignment, index) => {
                const product = catalog.products.find((item) => item.id === assignment.productId);
                const variant = product?.variants.find((item) => item.id === assignment.variantId);
                if (!product || !variant) return null;
                const on = assignment.branchIds.includes(shop.id);
                const hidden = !product.active || !variant.active;
                const change = (update: Partial<typeof assignment>) => edit({
                  ...settings,
                  assignments: settings.assignments.map((item, itemIndex) => itemIndex === index ? { ...item, ...update } : item),
                });
                return (
                  <article key={`${product.id}:${variant.id}`} className="br-insight" data-on={on}>
                    <label className="br-check">
                      <Checkbox
                        checked={on}
                        disabled={busy}
                        aria-label={`${product.name} ${variant.label} sold at ${shop.name}`}
                        onCheckedChange={(value) => change({
                          branchIds: value === true
                            ? [...new Set([...assignment.branchIds, shop.id])]
                            : assignment.branchIds.filter((id) => id !== shop.id),
                        })}
                      />
                    </label>
                    <img className="br-thumb" src={product.image.url} alt={product.image.alt} width={48} height={48} />
                    <div className="br-insight-copy">
                      <strong>{product.name} · {variant.label}</strong>
                      <p className="br-body">
                        {variant.minLeadDays === 0 ? "No preparation days." : `${variant.minLeadDays} preparation days.`}
                        {hidden ? " Hidden in the catalog." : ""}
                      </p>
                    </div>
                    {hidden ? <span className="br-badge" data-tone="hidden">Hidden</span> : null}
                    <NativeSelect
                      className="br-mode"
                      aria-label={`${product.name} ${variant.label} ordering type`}
                      value={assignment.mode}
                      disabled={busy}
                      onChange={(event) => change({ mode: event.target.value as "regular" | "preorder" })}
                    >
                      <option value="regular" disabled={variant.minLeadDays > 0}>Regular</option>
                      <option value="preorder">Pre-order</option>
                    </NativeSelect>
                  </article>
                );
              })}
            </section>
          </div>

          <div className="br-save">
            <button type="submit" className="br-save-button" disabled={!catalog.initialized || busy}>
              {busy ? "Saving…" : "Save branch settings"}
            </button>
            {notice ? <p className="br-notice" role="status">{notice}</p> : null}
          </div>
          </fieldset>
        </form>
      )}
    </div>
  );
}
