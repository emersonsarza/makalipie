"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { ChevronDown, CircleCheck, CircleMinus, ImageIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin/admin-select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DEFAULT_PRODUCT_IMAGE, THEMES, type StoreProduct, type StoreSize, type StoreImage, type ThemeName } from "@/lib/storefront/types";
import { cn } from "@/lib/utils";
import { pesos } from "../orders-data";
import { useDraftRevision, CatalogLoading, catalogChange, catalogError, EditorActions, Feedback, Field, PriceField, SplitEditor, TextField, Toggle, uniqueSlug, useAllowDiscard, useCatalog, useDraftGuard, type Catalog } from "./catalog-ui";

import { SortableList } from "./sortable-list";

function ProductStatus({ enabled }: { enabled: boolean }) {
  const Icon = enabled ? CircleCheck : CircleMinus;
  return <Badge className={cn("shrink-0 gap-1 whitespace-nowrap text-xs normal-case tracking-normal", enabled
    ? "bg-green-100 text-green-900"
    : "border-neutral-400 bg-neutral-200 text-neutral-800")}>
    <Icon className="size-3.5" aria-hidden />
    {enabled ? "Enabled" : "Disabled"}
  </Badge>;
}

function ImagePicker({ label, image, fallback, paths, change, featured = false }: {
  label: string; image: StoreImage | null; fallback: StoreImage; paths: string[]; change: (image: StoreImage | null) => void; featured?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const resolved = image ?? fallback;
  return <div className="min-w-0 space-y-2.5 rounded-lg border p-2.5">
    <h4 className="text-sm font-medium">{label}</h4>
    <Popover open={open} onOpenChange={setOpen}>
      {featured ? <div className="flex flex-wrap items-center gap-3">
        <Image src={resolved.path} alt="" width={112} height={112} className="size-24 shrink-0 rounded-md object-cover" />
        <div className="min-w-0 space-y-2">
          <p className="break-words text-xs text-muted-foreground">{image ? image.path.split("/").at(-1) : "Uses fallback"}</p>
          <PopoverTrigger render={<Button type="button" variant="outline" aria-label={`Change ${label.toLowerCase()}`} />}><ImageIcon aria-hidden /> Change image</PopoverTrigger>
        </div>
      </div> : <PopoverTrigger render={<Button type="button" variant="outline" aria-label={`Change ${label.toLowerCase()}`} className="h-auto w-full justify-start whitespace-normal p-2 text-left" />}>
        <Image src={resolved.path} alt="" width={40} height={40} className="size-10 shrink-0 rounded-md object-cover" />
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{image ? image.path.split("/").at(-1) : "Uses fallback"}</span>
        <ImageIcon className="shrink-0" aria-hidden />
      </PopoverTrigger>}
      <PopoverContent align="start" className="admin-theme w-[min(24rem,calc(100vw-2rem))]">
        <PopoverTitle>{label}</PopoverTitle>
        <Input aria-label="Search deployed images" placeholder="Search images" value={search} onChange={event => setSearch(event.target.value)} />
        <Button type="button" variant="outline" onClick={() => { change(null); setOpen(false); }}><ImageIcon aria-hidden /> Use fallback image</Button>
        <div className="grid max-h-64 grid-cols-3 gap-2 overflow-auto p-1">
          {paths.filter(path => path.toLowerCase().includes(search.toLowerCase())).map(path => {
            const filename = path.split("/").at(-1) ?? path;
            return <Button key={path} type="button" variant="ghost" className="h-auto min-w-0 flex-col gap-1 p-1" aria-pressed={image?.path === path} onClick={() => {
              change({ path, alt: filename.replace(/\.webp$/i, "").replace(/[-_]/g, " ") });
              setOpen(false);
            }}><Image src={path} alt="" width={84} height={64} loading="lazy" className="h-14 w-full rounded object-cover" /><span className="w-full truncate text-xs" title={path}>{filename}</span></Button>;
          })}
        </div>
      </PopoverContent>
    </Popover>
    {image && <div className="border-t pt-2.5">
      <Field label="Image description">
        <Textarea aria-label={`Image description for ${label.toLowerCase()}`} rows={3} required maxLength={300}
          className="min-h-20 resize-y text-sm"
          value={image.alt} onChange={event => change({ ...image, alt: event.target.value })} />
      </Field>
    </div>}
  </div>;
}

function emptySize(id: string, order: number): StoreSize {
  return { id, label: "", priceCentavos: 0, mode: "regular", enabled: false, sortOrder: order, image: null, themeImages: [], branchIds: [] };
}

function emptyProduct(catalog: Catalog): StoreProduct {
  const sectionId = catalog.sections[0]?.id ?? "";
  return {
    id: "", name: "", shortDescription: "", description: "", allergens: [], sectionId,
    enabled: false, sortOrder: Math.max(-1, ...catalog.products.filter(product => product.sectionId === sectionId).map(product => product.sortOrder)) + 1,
    image: DEFAULT_PRODUCT_IMAGE, seasonStart: null, seasonEnd: null, themeImages: [], updatedAt: "",
    sizes: [emptySize("size-1", 0)],
  };
}

function ProductFields({ draft, catalog, persistedSizes, update }: { draft: StoreProduct; catalog: Catalog; persistedSizes: string[]; update: (patch: Partial<StoreProduct>) => void }) {
  const [allergens, setAllergens] = useState(draft.allergens.join(", "));
  const updateSize = (id: string, patch: Partial<StoreSize>) => update({ sizes: draft.sizes.map(size => size.id === id ? { ...size, ...patch } : size) });

  return <>
    <div className="grid gap-5 @min-[38rem]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="min-w-0 space-y-3" aria-label="Product details">
        <h3 className="text-base font-semibold">Product details</h3>
        <div className="grid gap-4 @min-[27rem]:grid-cols-2">
          <TextField label="Name" required maxLength={120} value={draft.name} change={name => update({ name })} />
          <Field label="Menu section"><AdminSelect label="Menu section" required placeholder="Select a section" value={draft.sectionId} onValueChange={sectionId => {
            update({ sectionId, sortOrder: Math.max(-1, ...catalog.products.filter(product => product.sectionId === sectionId).map(product => product.sortOrder)) + 1 });
          }} options={catalog.sections.map(section => ({ value: section.id, label: section.name }))} /></Field>
        </div>
        <Field label="Short description"><Textarea rows={2} className="min-h-16" maxLength={400} value={draft.shortDescription} onChange={event => update({ shortDescription: event.target.value })} /></Field>
        <Field label="Full description"><Textarea rows={3} className="min-h-20" maxLength={2000} value={draft.description} onChange={event => update({ description: event.target.value })} /></Field>
        <TextField label="Allergens (comma separated)" value={allergens} change={value => { setAllergens(value); update({ allergens: value.split(",").map(item => item.trim()).filter(Boolean) }); }} />
      </section>
      <section className="@container/availability min-w-0 space-y-3 border-t pt-4 @min-[38rem]:border-l @min-[38rem]:border-t-0 @min-[38rem]:pl-5 @min-[38rem]:pt-0" aria-label="Availability">
        <h3 className="text-base font-semibold">Availability</h3>
        <Toggle label="Product enabled" checked={draft.enabled} change={enabled => update({ enabled })} />
        <div className="grid gap-3 @min-[16rem]/availability:grid-cols-2">
          <TextField label="Season starts" type="date" value={draft.seasonStart ?? ""} change={value => update({ seasonStart: value || null })} />
          <TextField label="Season ends" type="date" min={draft.seasonStart ?? undefined} value={draft.seasonEnd ?? ""} change={value => update({ seasonEnd: value || null })} />
        </div>
        <p className="text-xs text-muted-foreground">Leave both dates blank for year-round availability.</p>
        <ImagePicker featured label="Shared regular image" image={draft.image.path === DEFAULT_PRODUCT_IMAGE.path && draft.image.alt === DEFAULT_PRODUCT_IMAGE.alt ? null : draft.image} fallback={DEFAULT_PRODUCT_IMAGE} paths={catalog.imagePaths} change={image => update({ image: image ?? DEFAULT_PRODUCT_IMAGE })} />
      </section>
    </div>

    <section className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-base font-semibold">Sizes</h3>
          <p className="text-sm text-muted-foreground">Preorder sizes use the shared {catalog.settings.preorderLeadDays}-day preparation time.</p>
        </div>
        <Button type="button" variant="outline" disabled={draft.sizes.length >= 8} onClick={() => update({ sizes: [...draft.sizes, emptySize(uniqueSlug("", draft.sizes.map(size => size.id), "size"), draft.sizes.length)] })}><Plus aria-hidden /> Add size</Button>
      </div>
      <SortableList items={draft.sizes} label={size => size.label || "New size"} className="rounded-lg border"
        onReorder={sizes => update({ sizes })} row={(size, grip, controls) => (
        <Collapsible defaultOpen={!size.label || size.id === draft.sizes[0]?.id} className="space-y-3 p-2.5">
          <div className="flex items-center justify-between gap-2">
            {grip}
            <CollapsibleTrigger render={<Button type="button" variant="ghost" className="group h-auto min-w-0 flex-1 justify-start gap-2 whitespace-normal px-1 py-2 text-left" />}>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 @min-[33rem]:grid @min-[33rem]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]">
                <span className="break-words font-semibold">{size.label || "New size"}</span>
                <span className="whitespace-nowrap text-muted-foreground tabular-nums">{pesos(size.priceCentavos)}</span>
                <Badge className="bg-muted text-muted-foreground normal-case tracking-normal">{size.mode === "preorder" ? "Preorder" : "Regular"}</Badge>
                <ProductStatus enabled={size.enabled} />
              </span>
              <ChevronDown aria-hidden className="shrink-0 transition-transform group-aria-expanded:rotate-180 motion-reduce:transition-none" />
            </CollapsibleTrigger>
            {controls}
          </div>
          <CollapsibleContent keepMounted className="admin-disclosure space-y-3 border-t px-1 pt-3">
            <div className="grid gap-3 @min-[23rem]:grid-cols-2 @min-[40rem]:grid-cols-4">
              <TextField label="Size label" required maxLength={40} value={size.label} change={label => updateSize(size.id, { label })} />
              <PriceField cents={size.priceCentavos} change={priceCentavos => updateSize(size.id, { priceCentavos })} />
              <Field label="Availability"><AdminSelect label="Availability" value={size.mode} onValueChange={mode => updateSize(size.id, { mode })}
                options={[{ value: "regular", label: "Regular" }, { value: "preorder", label: "Preorder" }]} /></Field>
              <Toggle label="Size enabled" checked={size.enabled} change={enabled => updateSize(size.id, { enabled })} />
            </div>
            {!persistedSizes.includes(size.id) && draft.sizes.length > 1 && <Button type="button" variant="outline" onClick={() => update({ sizes: draft.sizes.filter(item => item.id !== size.id) })}>Remove unsaved size</Button>}
            <fieldset className="flex flex-wrap gap-x-4 gap-y-2"><legend className="text-sm font-medium">Regular branches</legend>
              {catalog.locations.filter(location => location.kind === "regular").map(location => <Toggle key={location.id} label={location.name} checked={size.branchIds.includes(location.id)} change={checked => updateSize(size.id, { branchIds: checked ? [...size.branchIds, location.id] : size.branchIds.filter(id => id !== location.id) })} />)}
            </fieldset>
            <div className="grid items-start gap-3 @min-[25rem]:grid-cols-2 @min-[36rem]:grid-cols-3">
              <ImagePicker label="Size image" image={size.image} fallback={draft.image} paths={catalog.imagePaths} change={image => updateSize(size.id, { image })} />
              {THEMES.map((theme: ThemeName) => <ImagePicker key={theme} label={theme === "christmas" ? "Christmas image" : "Original theme image"} image={size.themeImages.find(item => item.theme === theme) ?? null} fallback={size.image ?? draft.image} paths={catalog.imagePaths} change={image => updateSize(size.id, { themeImages: [...size.themeImages.filter(item => item.theme !== theme), ...(image ? [{ ...image, theme }] : [])] })} />)}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )} />
    </section>
  </>;
}

export function ProductsEditor() {
  const { catalog, error: loadError, reload } = useCatalog();
  const [draft, setDraft] = useState<StoreProduct>();
  const [base, setBase] = useState<StoreProduct>();
  const [phoneEditor, showEditor] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [order, setOrder] = useState<{ sectionId: string; items: StoreProduct[] }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [version, setVersion] = useState(0);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(base);
  const reorderDirty = !!order && JSON.stringify(order.items.map(product => product.id)) !== JSON.stringify(catalog?.products.filter(product => product.sectionId === order.sectionId).map(product => product.id));
  const draftVersion = useDraftRevision(catalog?.revision, !!draft || !!order);
  const allowDiscard = useAllowDiscard();
  useDraftGuard(dirty || reorderDirty);

  if (!catalog) return <CatalogLoading error={loadError} retry={() => void reload()} />;
  const snapshot = catalog;
  const active = draft ?? snapshot.products[0];

  async function pick(product: StoreProduct) {
    if (busy || !(await allowDiscard(dirty || reorderDirty))) return;
    const fresh = await reload();
    if (!fresh) return;
    const latest = product.id ? fresh.products.find(item => item.id === product.id) : product;
    if (!latest) return;
    draftVersion.capture(fresh.revision);
    setDraft(latest); setBase(latest.id ? latest : undefined); setOrder(undefined);
    setError(""); setSuccess(""); showEditor(true); setVersion(value => value + 1);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !draft || !dirty) return;
    if (!!draft.seasonStart !== !!draft.seasonEnd || (draft.seasonStart && draft.seasonEnd && draft.seasonStart > draft.seasonEnd)) {
      setError("Enter both season dates in chronological order."); return;
    }
    if (draft.sizes.some(size => !size.label.trim())) { setError("Give every size a label before saving."); return; }
    const id = draft.id || uniqueSlug(draft.name, snapshot.products.map(product => product.id), "product");
    setBusy(true); setError(""); setSuccess("");
    try {
      await catalogChange("save_product", draftVersion.revision!, {
        ...draft, id, updatedAt: draft.updatedAt || undefined, imagePath: draft.image.path, imageAlt: draft.image.alt,
        sizes: draft.sizes.map((size, sortOrder) => ({ ...size, sortOrder, imagePath: size.image?.path ?? null, imageAlt: size.image?.alt ?? null })),
      });
      const fresh = await reload();
      const updated = fresh?.products.find(product => product.id === id);
      draftVersion.capture(fresh?.revision);
      setDraft(updated); setBase(updated); setVersion(value => value + 1);
      if (updated) setSuccess("Product saved.");
      else setError("Product saved, but the catalog could not refresh. Reload this page.");
    } catch (failure) { setError(catalogError(failure)); } finally { setBusy(false); }
  }

  async function saveOrder(event: FormEvent) {
    event.preventDefault();
    if (!order || busy || !reorderDirty) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await catalogChange("reorder_products", draftVersion.revision!, { sectionId: order.sectionId, items: order.items.map(({ id, updatedAt }) => ({ id, updatedAt })) });
      await reload();
      setOrder(undefined); setSuccess("Display order saved.");
    } catch (failure) { setError(catalogError(failure)); } finally { setBusy(false); }
  }

  return <SplitEditor showEditor={phoneEditor} back={() => { if (!busy) showEditor(false); }} list={<>
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy} onClick={() => pick(emptyProduct(snapshot))}>New product</Button>
      <Button variant="outline" disabled={busy || !snapshot.sections.length} onClick={() => {
        void allowDiscard(dirty || reorderDirty).then(ok => {
          if (!ok) return;
          const sectionId = active?.sectionId ?? snapshot.sections[0].id;
          setDraft(undefined); setBase(undefined); setOrder({ sectionId, items: snapshot.products.filter(product => product.sectionId === sectionId) });
          setError(""); setSuccess(""); showEditor(true);
        });
      }}>Reorder products</Button>
    </div>
    <Input aria-label="Search products" placeholder="Search products" value={search} onChange={event => setSearch(event.target.value)} />
    <AdminSelect label="Product status" value={filter} onValueChange={setFilter} options={[
      { value: "all", label: "All products" }, { value: "enabled", label: "Enabled" }, { value: "disabled", label: "Disabled" },
    ]} />
    <ul className="divide-y">
      {snapshot.products.filter(product => product.name.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || product.enabled === (filter === "enabled"))).map(product => {
        return <li key={product.id} className={product.enabled ? undefined : "bg-neutral-100"}>
          <Button variant="ghost" className="h-auto w-full justify-start gap-3 whitespace-normal p-2 text-left aria-pressed:bg-accent aria-pressed:ring-1 aria-pressed:ring-inset aria-pressed:ring-border" aria-pressed={!order && active?.id === product.id} disabled={busy} onClick={() => pick(product)}>
            <Image src={product.image.path} alt="" width={40} height={40} className={cn("size-10 shrink-0 rounded-md object-cover", !product.enabled && "grayscale")} />
            <span className="min-w-0 flex-1 break-words"><span className="block font-medium">{product.name}</span>{product.seasonStart && <span className="block text-xs text-muted-foreground">{product.seasonStart} – {product.seasonEnd}</span>}</span>
            <ProductStatus enabled={product.enabled} />
          </Button>
        </li>;
      })}
    </ul>
  </>} editor={<>
    <Feedback error={error || (draftVersion.stale ? "Someone changed the catalog. Reload before saving this draft." : "") || loadError} success={success} />
    {(loadError || (draftVersion.stale || error.startsWith("Someone"))) && <Button variant="outline" onClick={async () => {
      if (!(await allowDiscard(dirty || reorderDirty))) return;
      if (await reload()) { setDraft(undefined); setBase(undefined); setOrder(undefined); setError(""); setVersion(value => value + 1); }
    }}>Reload catalog</Button>}
    {order ? <form onSubmit={saveOrder} className="space-y-4">
      <h2 className="text-lg font-semibold">Product display order</h2>
      <Field label="Menu section"><AdminSelect label="Menu section" value={order.sectionId} onValueChange={sectionId => {
        void allowDiscard(reorderDirty).then(ok => {
          if (!ok) return;
          setOrder({ sectionId, items: snapshot.products.filter(product => product.sectionId === sectionId) });
        });
      }} options={snapshot.sections.map(section => ({ value: section.id, label: section.name }))} /></Field>
      <SortableList key={order.sectionId} items={order.items} label={item => item.name} disabled={busy}
        onReorder={items => setOrder({ ...order, items })} row={(item, grip, controls) => (
          <div className="flex items-center justify-between gap-2 px-2 py-2">
            <span className="flex min-w-0 items-center gap-2">{grip}<span className="break-words">{item.name}</span></span>
            {controls}
          </div>
        )} />
      <EditorActions saveDisabled={draftVersion.stale} busy={busy} dirty={reorderDirty} reset={() => setOrder(undefined)} />
    </form> : active ? <form onSubmit={save} className="@container space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="break-words text-xl font-semibold">{active.id ? active.name : "New product"}</h2>
        <ProductStatus enabled={active.enabled} />
      </div>
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <ProductFields key={active.id + ":" + version} draft={active} catalog={snapshot} persistedSizes={snapshot.products.find(product => product.id === active.id)?.sizes.map(size => size.id) ?? []} update={patch => {
          if (!draft) setBase(active);
          setDraft({ ...active, ...patch }); setSuccess("");
        }} />
      </fieldset>
      <EditorActions saveDisabled={draftVersion.stale} busy={busy} dirty={dirty} reset={() => { const latest = snapshot.products.find(item => item.id === (base?.id ?? active?.id)); setDraft(latest); setBase(latest); draftVersion.capture(snapshot.revision); setVersion(value => value + 1); setError(""); }} />
    </form> : <p className="text-sm text-muted-foreground">Select or create a product.</p>}
  </>} />;
}
