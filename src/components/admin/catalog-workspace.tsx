"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, EyeOff, Plus, Search, Package, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { adminKeys, fetchAdminCatalog, fetchAdminProducts, importAdminProducts, saveAdminCatalog } from "@/lib/admin/query";
import type { Catalog, CatalogProduct } from "@/lib/catalog/schema";
import { ProductEditor } from "./product-editor";
import { ProductOptions, AddonEditor } from "./catalog-manager";
import { CatalogEditContext, type EditState } from "./catalog-edit-guard";

const catalogCache = { staleTime: 5 * 60_000, gcTime: 30 * 60_000, refetchOnWindowFocus: false } as const;

function CatalogListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading products">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="catalog-finder-item" key={index}>
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <span className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2.5 w-16" />
          </span>
          <Skeleton className="size-7 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function CatalogDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading product">
      <div className="catalog-tabbar">
        <div className="flex items-center gap-6">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="catalog-tab-actions">
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-40 rounded-md" />
        </div>
      </div>
      <div className="catalog-ledger-split">
        <Skeleton className="h-44 rounded-xl" />
        <div className="flex flex-col gap-4 rounded-xl border border-[var(--admin-line)] p-6">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-1/2" />
        </div>
      </div>
    </div>
  );
}

function VisibilityBadge({ active }: { active: boolean }) {
  const Icon = active ? Eye : EyeOff;
  const description = active ? "Shown on the public menu." : "Hidden from the public menu.";
  return (
    <HoverCard>
      <HoverCardTrigger
        render={<button type="button" />}
        className={active ? "catalog-badge-visible" : "catalog-badge-hidden"}
        aria-label={description}
      >
        <Icon aria-hidden="true" />
      </HoverCardTrigger>
      <HoverCardContent className="catalog-status-card w-auto" side="top" align="center">
        <span className={active ? "catalog-badge-visible" : "catalog-badge-hidden"} aria-hidden="true"><Icon /></span>
        <p>{description}</p>
      </HoverCardContent>
    </HoverCard>
  );
}

// Freeze the initial editor snapshot until an intentional save or selection change.
function SellingEditor({ product, catalog, save, back }: { product: CatalogProduct; catalog: Catalog; save: (body: unknown) => Promise<void>; back: () => void }) {
  const [initial] = useState(product);
  return <ProductOptions product={initial} addons={catalog.addons} save={save} back={back} embedded />;
}
function ExtraEditor({ id, catalog, save, back }: { id: string; catalog: Catalog; save: (body: unknown) => Promise<void>; back: () => void }) {
  const [initial] = useState(catalog.addons.find(a => a.id === id));
  return <AddonEditor initial={initial} save={save} back={back} embedded />;
}

export function CatalogWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const urlParams = useSearchParams();
  const [viewQuery, setViewQuery] = useState(urlParams.toString());
  const params = useMemo(() => new URLSearchParams(viewQuery), [viewQuery]);
  const selected = params.get("product");
  const addons = params.get("view") === "addons";
  const addon = params.get("addon");
  const activeTab = params.get("tab") === "details" ? "details" : "selling";
  const queryClient = useQueryClient();
  const catalogQuery = useQuery({ queryKey: adminKeys.catalog(), queryFn: fetchAdminCatalog, ...catalogCache });
  const productsQuery = useQuery({ queryKey: adminKeys.products(), queryFn: fetchAdminProducts, ...catalogCache });
  const catalog = catalogQuery.data;
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [edit, setEdit] = useState<EditState>({ dirty: false, busy: false });
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [listMode, setListMode] = useState(false);
  const nextAction = useRef<(() => void) | null>(null);
  const pane = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const stateRef = useRef(edit);

  const report = useCallback((value: EditState) => { stateRef.current = value; setEdit(value); }, []);
  const guard = useCallback((action: () => void) => {
    if (stateRef.current.busy) return;
    if (stateRef.current.dirty) { nextAction.current = action; setConfirmOpen(true); }
    else action();
  }, []);
  useEffect(() => {
    const next = urlParams.toString();
    if (next === viewQuery) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (stateRef.current.dirty || stateRef.current.busy) {
        router.replace(`${pathname}${viewQuery ? `?${viewQuery}` : ""}`, { scroll: false });
        guard(() => { setViewQuery(next); router.push(`${pathname}${next ? `?${next}` : ""}`, { scroll: false }); });
      } else setViewQuery(next);
    });
    return () => { cancelled = true; };
  }, [urlParams, viewQuery, pathname, router, guard]);
  const destination = (values: Record<string, string>) => `${pathname}${Object.keys(values).length ? `?${new URLSearchParams(values)}` : ""}`;
  function go(values: Record<string, string>) {
    guard(() => { setError(""); setNotice(""); setListMode(false); router.push(destination(values), { scroll: false }); });
  }
  const busy = edit.busy || pending;
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (stateRef.current.dirty || stateRef.current.busy) { event.preventDefault(); event.returnValue = ""; } };
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest("a");
      if (!link || link.target === "_blank" || link.hasAttribute("download") || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      if (!stateRef.current.dirty && !stateRef.current.busy) return;
      event.preventDefault(); event.stopPropagation();
      guard(() => { if (link.origin === location.origin) router.push(link.pathname + link.search + link.hash); else location.assign(link.href); });
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); };
  }, [guard, router]);
  useEffect(() => {
    if (selected || addons) {
      pane.current?.scrollTo({ top: 0 });
      pane.current?.focus({ preventScroll: true });
    } else list.current?.querySelector<HTMLElement>("input")?.focus({ preventScroll: true });
  }, [selected, addons, addon]);
  useEffect(() => {
    if (!catalog || !catalog.initialized || addons || selected === "new" || !catalog.products.length) return;
    const first = catalog.products[0];
    const match = selected ? catalog.products.find(p => p.id === selected) : null;
    if (match) return;
    router.replace(`${pathname}?${new URLSearchParams({ product: first.id })}`, { scroll: false });
  }, [catalog, addons, selected, pathname, router]);

  async function save(body: unknown) {
    const result = await saveAdminCatalog(body);
    queryClient.setQueryData(adminKeys.catalog(), result);
    await queryClient.invalidateQueries({ queryKey: adminKeys.products() });
    setRevision(value => value + 1);
    setNotice("Saved. Your latest changes are on the menu.");
  }
  async function initialize() {
    setPending(true); setError("");
    try {
      if (!productsQuery.data?.initialized) await importAdminProducts();
      await save({ action: "initialize" });
    } catch (err) { setError(err instanceof Error ? err.message : "Could not set up the catalog."); }
    finally { setPending(false); }
  }
  const failure = catalogQuery.error || productsQuery.error;
  const ready = Boolean(catalog && productsQuery.data);
  if (failure && !ready) {
    return <Alert variant="destructive"><AlertDescription>{failure.message}<Button variant="outline" onClick={() => { void catalogQuery.refetch(); void productsQuery.refetch(); }}>Try again</Button><a href="/admin/login">Return to sign-in</a></AlertDescription></Alert>;
  }
  const firstProduct = catalog?.products[0];
  const product = catalog?.products.find(p => p.id === selected);
  const filtered = catalog?.products.filter(p => `${p.name} ${p.category}`.toLowerCase().includes(search.trim().toLowerCase()) && (visibility === "all" || (visibility === "visible") === p.active)) ?? [];
  const awaitingProduct = ready && Boolean(catalog?.initialized) && !addons && selected !== "new" && !product && Boolean(firstProduct);
  const selectionKey = `${selected}-${activeTab}-${addon}-${revision}`;
  const status = <>
    {(error || catalogQuery.error || productsQuery.error) && <Alert variant="destructive"><AlertDescription>{error || catalogQuery.error?.message || productsQuery.error?.message}</AlertDescription></Alert>}
    {notice && <Alert className="mb-4" role="status"><AlertDescription>{notice}</AlertDescription></Alert>}
  </>;
  return <CatalogEditContext.Provider value={report}>
    <div className="catalog-workspace" data-detail={Boolean(addons || !catalog?.initialized || (selected && !listMode))}>
      <aside className="catalog-finder-list" aria-label="Products" ref={list}>
        <div className="catalog-finder-tools">
          <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Products <span className="text-muted-foreground text-xs">({catalog?.products.length ?? 0})</span></h2><Button size="sm" disabled={busy || !catalog?.initialized} onClick={() => go({ product: "new", tab: "details" })}><Plus aria-hidden />Add product</Button></div>
          <div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden /><Input className="pl-9" placeholder="Search products…" aria-label="Search products" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <Select
            value={visibility}
            onValueChange={(value) => { if (value != null) setVisibility(String(value)); }}
            items={{ all: "All products", visible: "Visible", hidden: "Hidden" }}
          >
            <SelectTrigger aria-label="Filter products by visibility" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="start">
              <SelectItem value="all">All products</SelectItem>
              <SelectItem value="visible">Visible</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <nav className="catalog-finder-items" aria-label="Choose a product">
          {!ready ? <CatalogListSkeleton /> : filtered.map(p => <div key={p.id} className="catalog-finder-item" aria-current={!addons && selected === p.id ? "true" : undefined}><button type="button" className="catalog-finder-open" disabled={busy || !catalog?.initialized} onClick={() => go({ product: p.id })}><Image src={p.image.url} unoptimized width={40} height={40} alt="" /><span className="min-w-0 flex-1"><strong>{p.name}</strong><small>{p.variants.filter(v => v.active).length} available sizes</small></span></button><VisibilityBadge active={p.active} /></div>)}
          {ready && !filtered.length && <div className="p-4 text-sm"><p>{(catalog?.products.length ?? 0) > 0 ? "No matching products." : "Add your first product to get started."}</p>{(catalog?.products.length ?? 0) > 0 && <Button variant="ghost" onClick={() => { setSearch(""); setVisibility("all"); }}>Clear filters</Button>}</div>}
        </nav>
        <div className="catalog-finder-footer"><Button variant={addons ? "secondary" : "outline"} disabled={busy || !catalog?.initialized} onClick={() => go({ view: "addons" })}>Manage add-ons</Button><Button variant="ghost" aria-label="Refresh catalog" disabled={busy || !ready || catalogQuery.isFetching} onClick={() => guard(() => { void Promise.all([catalogQuery.refetch(), productsQuery.refetch()]).then(() => setRevision(v => v + 1)); })}><RefreshCw aria-hidden /></Button></div>
      </aside>
      <div className="catalog-finder-detail" ref={pane} tabIndex={-1} aria-label="Catalog editor">
        <Button className="catalog-mobile-back" variant="ghost" disabled={busy} onClick={() => setListMode(true)}><ArrowLeft aria-hidden />Back to products</Button>
        {!ready || awaitingProduct || !catalog ? <CatalogDetailSkeleton /> : product ? <Tabs value={activeTab} onValueChange={value => go({ product: product.id, tab: String(value) })}><div className="catalog-tabbar"><TabsList className="catalog-tabs" aria-label="Product sections"><TabsTrigger value="selling" disabled={busy}>Selling options</TabsTrigger><TabsTrigger value="details" disabled={busy}>Product details</TabsTrigger></TabsList><div id="catalog-tab-actions" className="catalog-tab-actions" /></div>{status}<TabsContent value="selling"><SellingEditor key={selectionKey} product={product} catalog={catalog} save={save} back={() => go({ product: product.id })} /></TabsContent><TabsContent value="details"><ProductEditor key={selectionKey} initial={product} embedded onBack={() => go({ product: product.id })} onSaved={() => setNotice("Product details saved.")} /></TabsContent></Tabs>
        : !catalog.initialized ? <>{status}<div className="catalog-selection-empty"><Package aria-hidden /><h2>Bring your menu together</h2><p>Import your existing products, sizes, prices, and add-ons. Existing edits are preserved.</p><Button disabled={pending} onClick={() => void initialize()}>{pending ? "Setting up…" : "Set up catalog"}</Button></div></>
        : addons ? <>
          {status}
          {addon ? addon !== "new" && !catalog.addons.some(a => a.id === addon) ? <p>This add-on could not be found.</p> : <ExtraEditor key={selectionKey} id={addon} catalog={catalog} save={async body => { await save(body); if (addon === "new") router.replace(destination({ view: "addons" }), { scroll: false }); }} back={() => go({ view: "addons" })} /> : <><div className="flex flex-wrap items-center justify-between gap-3 mb-6"><h2 className="text-xl font-semibold">Shared add-ons</h2><Button onClick={() => go({ view: "addons", addon: "new" })}><Plus aria-hidden />Add an extra</Button></div><p className="text-sm text-muted-foreground mb-5">Create extras here, then choose compatible products in Selling options.</p>{catalog.addons.map(a => <div className="catalog-admin-row" key={a.id}><div><h3>{a.name}</h3><p>₱{(a.priceCentavos / 100).toLocaleString("en-PH")} · {a.scope === "per_item" ? "per item" : "per order"}</p></div><Badge variant="outline">{a.active ? "Available" : "Inactive"}</Badge><Button variant="outline" onClick={() => go({ view: "addons", addon: a.id })}>Edit<span className="sr-only"> {a.name}</span></Button></div>)}{!catalog.addons.length && <p>No add-ons yet.</p>}</>}
        </> : selected === "new" ? <>{status}<h2 className="text-xl font-semibold mb-6">Add a product</h2><ProductEditor key={selectionKey} embedded onBack={() => firstProduct ? go({ product: firstProduct.id }) : go({})} onSaved={p => { report({ dirty: false, busy: false }); router.replace(destination({ product: p.id }), { scroll: false }); }} /></>
        : !firstProduct ? <>{status}<div className="catalog-selection-empty"><Package aria-hidden /><h2>No products yet</h2><p>Add your first product to start building the menu.</p></div></>
        : null}
      </div>
    </div>
    <AlertDialog open={confirmOpen} onOpenChange={(open) => { setConfirmOpen(open); if (!open) nextAction.current = null; }}>
      <AlertDialogContent className="catalog-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>Your edits in this section haven’t been saved. Stay here to keep working, or discard them to continue.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => { const action = nextAction.current; nextAction.current = null; setConfirmOpen(false); setEdit({ dirty: false, busy: false }); stateRef.current = { dirty: false, busy: false }; action?.(); }}>Discard changes</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </CatalogEditContext.Provider>;
}
