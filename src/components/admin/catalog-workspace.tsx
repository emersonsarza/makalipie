"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Search, Package, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription } from "@/components/ui/alert-dialog";
import { adminKeys, fetchAdminCatalog, fetchAdminProducts, importAdminProducts, saveAdminCatalog } from "@/lib/admin/query";
import type { Catalog, CatalogProduct } from "@/lib/catalog/schema";
import { ProductEditor } from "./product-editor";
import { ProductOptions, AddonEditor } from "./catalog-manager";
import { CatalogEditContext, type EditState } from "./catalog-edit-guard";

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
  const catalogQuery = useQuery({ queryKey: adminKeys.catalog(), queryFn: fetchAdminCatalog });
  const productsQuery = useQuery({ queryKey: adminKeys.products(), queryFn: fetchAdminProducts });
  const catalog = catalogQuery.data;
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [edit, setEdit] = useState<EditState>({ dirty: false, busy: false });
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
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
    guard(() => { setError(""); setNotice(""); router.push(destination(values), { scroll: false }); });
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
    if (selected || addons) { pane.current?.scrollTo({ top: 0 }); pane.current?.focus(); }
    else list.current?.querySelector<HTMLElement>("input")?.focus();
  }, [selected, addons, addon]);

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
  if (!catalog || !productsQuery.data) {
    const failure = catalogQuery.error || productsQuery.error;
    return failure ? <Alert variant="destructive"><AlertDescription>{failure.message}<Button variant="outline" onClick={() => { void catalogQuery.refetch(); void productsQuery.refetch(); }}>Try again</Button><a href="/admin/login">Return to sign-in</a></AlertDescription></Alert> : <div aria-label="Loading catalog" aria-busy="true" className="space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }
  const product = catalog.products.find(p => p.id === selected);
  const filtered = catalog.products.filter(p => `${p.name} ${p.category}`.toLowerCase().includes(search.trim().toLowerCase()) && (visibility === "all" || (visibility === "visible") === p.active));
  const selectionKey = `${selected}-${activeTab}-${addon}-${revision}`;
  return <CatalogEditContext.Provider value={report}>
    <div className="catalog-workspace" data-detail={Boolean(selected || addons || !catalog.initialized)}>
      <aside className="catalog-finder-list" aria-label="Products" ref={list}>
        <div className="catalog-finder-tools">
          <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Products <span className="text-muted-foreground text-xs">{catalog.products.length}</span></h2><Button size="sm" disabled={busy || !catalog.initialized} onClick={() => go({ product: "new", tab: "details" })}><Plus aria-hidden />Add product</Button></div>
          <div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden /><Input className="pl-9" placeholder="Search products…" aria-label="Search products" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <NativeSelect aria-label="Filter products by visibility" value={visibility} onChange={e => setVisibility(e.target.value)}><option value="all">All products</option><option value="visible">Visible</option><option value="hidden">Hidden</option></NativeSelect>
        </div>
        <nav className="catalog-finder-items" aria-label="Choose a product">
          {filtered.map(p => <button type="button" key={p.id} disabled={busy || !catalog.initialized} aria-current={!addons && selected === p.id ? "true" : undefined} className="catalog-finder-item" onClick={() => go({ product: p.id })}><Image src={p.image.url} unoptimized width={40} height={40} alt="" /><span className="min-w-0 flex-1"><strong>{p.name}</strong><small>{p.variants.filter(v => v.active).length} available sizes</small></span><Badge variant="outline">{p.active ? "Visible" : "Hidden"}</Badge></button>)}
          {!filtered.length && <div className="p-4 text-sm"><p>{catalog.products.length ? "No matching products." : "Add your first product to get started."}</p>{catalog.products.length > 0 && <Button variant="ghost" onClick={() => { setSearch(""); setVisibility("all"); }}>Clear filters</Button>}</div>}
        </nav>
        <div className="catalog-finder-footer"><Button variant={addons ? "secondary" : "outline"} disabled={busy || !catalog.initialized} onClick={() => go({ view: "addons" })}>Manage add-ons</Button><Button variant="ghost" aria-label="Refresh catalog" disabled={busy || catalogQuery.isFetching} onClick={() => guard(() => { void Promise.all([catalogQuery.refetch(), productsQuery.refetch()]).then(() => setRevision(v => v + 1)); })}><RefreshCw aria-hidden /></Button></div>
      </aside>
      <div className="catalog-finder-detail" ref={pane} tabIndex={-1} aria-label="Catalog editor">
        <Button className="catalog-mobile-back" variant="ghost" disabled={busy} onClick={() => go({})}><ArrowLeft aria-hidden />Back to products</Button>
        {(error || catalogQuery.error || productsQuery.error) && <Alert variant="destructive"><AlertDescription>{error || catalogQuery.error?.message || productsQuery.error?.message}</AlertDescription></Alert>}
        {notice && <Alert className="mb-4" role="status"><AlertDescription>{notice}</AlertDescription></Alert>}
        {!catalog.initialized ? <div className="catalog-selection-empty"><Package aria-hidden /><h2>Bring your menu together</h2><p>Import your existing products, sizes, prices, and add-ons. Existing edits are preserved.</p><Button disabled={pending} onClick={() => void initialize()}>{pending ? "Setting up…" : "Set up catalog"}</Button></div>
        : addons ? <>
          {addon ? addon !== "new" && !catalog.addons.some(a => a.id === addon) ? <p>This add-on could not be found.</p> : <ExtraEditor key={selectionKey} id={addon} catalog={catalog} save={async body => { await save(body); if (addon === "new") router.replace(destination({ view: "addons" }), { scroll: false }); }} back={() => go({ view: "addons" })} /> : <><div className="flex flex-wrap items-center justify-between gap-3 mb-6"><h2 className="text-xl font-semibold">Shared add-ons</h2><Button onClick={() => go({ view: "addons", addon: "new" })}><Plus aria-hidden />Add an extra</Button></div><p className="text-sm text-muted-foreground mb-5">Create extras here, then choose compatible products in Selling options.</p>{catalog.addons.map(a => <div className="catalog-admin-row" key={a.id}><div><h3>{a.name}</h3><p>₱{(a.priceCentavos / 100).toLocaleString("en-PH")} · {a.scope === "per_item" ? "per item" : "per order"}</p></div><Badge variant="outline">{a.active ? "Available" : "Inactive"}</Badge><Button variant="outline" onClick={() => go({ view: "addons", addon: a.id })}>Edit<span className="sr-only"> {a.name}</span></Button></div>)}{!catalog.addons.length && <p>No add-ons yet.</p>}</>}
        </> : selected === "new" ? <><h2 className="text-xl font-semibold mb-6">Add a product</h2><ProductEditor key={selectionKey} embedded onBack={() => go({})} onSaved={p => { report({ dirty: false, busy: false }); router.replace(destination({ product: p.id }), { scroll: false }); }} /></>
        : product ? <><div className="flex items-center gap-3 mb-5"><Image src={product.image.url} unoptimized width={48} height={48} alt="" className="rounded-lg" /><div><h2 className="text-xl font-semibold">{product.name}</h2><p className="text-sm text-muted-foreground">{product.active ? "Visible on the menu" : "Hidden from the menu"}</p></div></div><Tabs value={activeTab} onValueChange={value => go({ product: product.id, tab: String(value) })}><TabsList className="mb-6" aria-label="Product sections"><TabsTrigger value="selling" disabled={busy}>Selling options</TabsTrigger><TabsTrigger value="details" disabled={busy}>Product details</TabsTrigger></TabsList><TabsContent value="selling"><SellingEditor key={selectionKey} product={product} catalog={catalog} save={save} back={() => go({})} /></TabsContent><TabsContent value="details"><ProductEditor key={selectionKey} initial={product} embedded onBack={() => go({})} onSaved={() => setNotice("Product details saved.")} /></TabsContent></Tabs></>
        : <div className="catalog-selection-empty"><Package aria-hidden /><h2>{selected ? "Product not found" : "Your menu, all together"}</h2><p>{selected ? "Choose another product from the list." : "Choose a product to manage its details, sizes, prices, and availability."}</p></div>}
      </div>
    </div>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}><AlertDialogContent><AlertDialogTitle className="text-lg font-semibold">Discard unsaved changes?</AlertDialogTitle><AlertDialogDescription className="mt-2 text-sm text-muted-foreground">Your edits in this section haven’t been saved. Stay here to keep working, or discard them to continue.</AlertDialogDescription><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => { nextAction.current = null; setConfirmOpen(false); }}>Keep editing</Button><Button variant="destructive" onClick={() => { setConfirmOpen(false); setEdit({ dirty: false, busy: false }); stateRef.current = { dirty: false, busy: false }; nextAction.current?.(); nextAction.current = null; }}>Discard changes</Button></div></AlertDialogContent></AlertDialog>
  </CatalogEditContext.Provider>;
}
