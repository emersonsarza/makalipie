"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin/admin-select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DEFAULT_PRODUCT_IMAGE, THEMES, type StoreProduct, type StoreSize, type StoreImage, type ThemeName } from "@/lib/storefront/types";
import { pesos } from "../orders-data";
import { CatalogLoading, catalogChange, catalogError, EditorActions, Feedback, Field, PriceField, SplitEditor, TextField, Toggle, uniqueSlug, useAllowDiscard, useCatalog, useDraftGuard, type Catalog } from "./catalog-ui";

import { SortableList } from "./sortable-list";

function ImagePicker({ label, image, fallback, paths, change }: {
  label: string; image: StoreImage | null; fallback: StoreImage; paths: string[]; change: (image: StoreImage | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const resolved = image ?? fallback;
  return <div className="space-y-2">
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button type="button" variant="outline" className="h-auto w-full justify-start whitespace-normal p-2 text-left" />}>
        <Image src={resolved.path} alt="" width={48} height={48} className="size-12 shrink-0 rounded-md object-cover" />
        <span><span className="block">{label}</span><span className="block text-xs text-muted-foreground">{image ? image.path.split("/").at(-1) : "Uses fallback"}</span></span>
      </PopoverTrigger>
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
    {image && <TextField label="Image description" required maxLength={300} value={image.alt} change={alt => change({ ...image, alt })} />}
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
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField label="Name" required maxLength={120} value={draft.name} change={name => update({ name })} />
      <Field label="Menu section"><AdminSelect label="Menu section" required placeholder="Select a section" value={draft.sectionId} onValueChange={sectionId => {
        update({ sectionId, sortOrder: Math.max(-1, ...catalog.products.filter(product => product.sectionId === sectionId).map(product => product.sortOrder)) + 1 });
      }} options={catalog.sections.map(section => ({ value: section.id, label: section.name }))} /></Field>
    </div>
    <Field label="Short description"><Textarea maxLength={400} value={draft.shortDescription} onChange={event => update({ shortDescription: event.target.value })} /></Field>
    <Field label="Full description"><Textarea maxLength={2000} value={draft.description} onChange={event => update({ description: event.target.value })} /></Field>
    <TextField label="Allergens (comma separated)" value={allergens} change={value => { setAllergens(value); update({ allergens: value.split(",").map(item => item.trim()).filter(Boolean) }); }} />
    <Toggle label="Product enabled" checked={draft.enabled} change={enabled => update({ enabled })} />
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField label="Season starts (optional)" type="date" value={draft.seasonStart ?? ""} change={value => update({ seasonStart: value || null })} />
      <TextField label="Season ends (optional)" type="date" min={draft.seasonStart ?? undefined} value={draft.seasonEnd ?? ""} change={value => update({ seasonEnd: value || null })} />
    </div>
    <ImagePicker label="Shared regular image" image={draft.image.path === DEFAULT_PRODUCT_IMAGE.path && draft.image.alt === DEFAULT_PRODUCT_IMAGE.alt ? null : draft.image} fallback={DEFAULT_PRODUCT_IMAGE} paths={catalog.imagePaths} change={image => update({ image: image ?? DEFAULT_PRODUCT_IMAGE })} />

    <section className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Sizes</h3>
        <Button type="button" variant="outline" disabled={draft.sizes.length >= 8} onClick={() => update({ sizes: [...draft.sizes, emptySize(uniqueSlug("", draft.sizes.map(size => size.id), "size"), draft.sizes.length)] })}>Add size</Button>
      </div>
      <p className="text-sm text-muted-foreground">Preorder sizes use the shared {catalog.settings.preorderLeadDays}-day preparation time. Disable a size to retire it.</p>
      <SortableList items={draft.sizes} label={size => size.label || "New size"} className="rounded-lg border"
        onReorder={sizes => update({ sizes })} row={(size, grip, controls) => (
        <Collapsible defaultOpen={!size.label} className="space-y-3 p-3">
          <div className="flex items-center justify-between gap-2">
            {grip}
            <CollapsibleTrigger render={<Button type="button" variant="ghost" className="min-w-0 flex-1 justify-start" />}>
              <span className="truncate">{size.label || "New size"}</span>
              <span className="text-muted-foreground">{pesos(size.priceCentavos)}</span>
            </CollapsibleTrigger>
            {controls}
          </div>
          <CollapsibleContent keepMounted className="admin-disclosure space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Size label" required maxLength={40} value={size.label} change={label => updateSize(size.id, { label })} />
              <PriceField cents={size.priceCentavos} change={priceCentavos => updateSize(size.id, { priceCentavos })} />
              <Field label="Availability"><AdminSelect label="Availability" value={size.mode} onValueChange={mode => updateSize(size.id, { mode })}
                options={[{ value: "regular", label: "Regular" }, { value: "preorder", label: "Preorder" }]} /></Field>
              <Toggle label="Size enabled" checked={size.enabled} change={enabled => updateSize(size.id, { enabled })} />
              {!persistedSizes.includes(size.id) && draft.sizes.length > 1 && <Button type="button" variant="outline" onClick={() => update({ sizes: draft.sizes.filter(item => item.id !== size.id) })}>Remove unsaved size</Button>}
            </div>
            <fieldset className="flex flex-wrap gap-x-4 gap-y-2"><legend className="text-sm font-medium">Regular branches</legend>
              {catalog.locations.filter(location => location.kind === "regular").map(location => <Toggle key={location.id} label={location.name} checked={size.branchIds.includes(location.id)} change={checked => updateSize(size.id, { branchIds: checked ? [...size.branchIds, location.id] : size.branchIds.filter(id => id !== location.id) })} />)}
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
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
  const allowDiscard = useAllowDiscard();
  useDraftGuard(dirty || reorderDirty);

  if (!catalog) return <CatalogLoading error={loadError} retry={() => void reload()} />;
  const snapshot = catalog;
  const active = draft ?? snapshot.products[0];

  async function pick(product: StoreProduct) {
    if (busy || !(await allowDiscard(dirty || reorderDirty))) return;
    setDraft(product); setBase(product.id ? product : undefined); setOrder(undefined);
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
      await catalogChange("save_product", snapshot.revision, {
        ...draft, id, updatedAt: draft.updatedAt || undefined, imagePath: draft.image.path, imageAlt: draft.image.alt,
        sizes: draft.sizes.map((size, sortOrder) => ({ ...size, sortOrder, imagePath: size.image?.path ?? null, imageAlt: size.image?.alt ?? null })),
      });
      const updated = (await reload())?.products.find(product => product.id === id);
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
      await catalogChange("reorder_products", snapshot.revision, { sectionId: order.sectionId, items: order.items.map(({ id, updatedAt }) => ({ id, updatedAt })) });
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
      {snapshot.products.filter(product => product.name.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || product.enabled === (filter === "enabled"))).map(product => <li key={product.id}>
        <Button variant="ghost" className="h-auto w-full justify-start gap-3 whitespace-normal p-2 text-left aria-pressed:bg-accent" aria-pressed={!order && active?.id === product.id} disabled={busy} onClick={() => pick(product)}>
          <Image src={product.image.path} alt="" width={40} height={40} className="size-10 shrink-0 rounded-md object-cover" />
          <span className="min-w-0 flex-1"><span className="block font-medium">{product.name}</span>{product.seasonStart && <span className="block text-xs text-muted-foreground">{product.seasonStart} – {product.seasonEnd}</span>}</span>
          <Badge variant="outline">{product.enabled ? "Enabled" : "Disabled"}</Badge>
        </Button>
      </li>)}
    </ul>
  </>} editor={<>
    <Feedback error={error || loadError} success={success} />
    {(loadError || error.startsWith("Someone")) && <Button variant="outline" onClick={async () => {
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
      <EditorActions busy={busy} dirty={reorderDirty} reset={() => setOrder(undefined)} />
    </form> : active ? <form onSubmit={save} className="space-y-4">
      <h2 className="text-lg font-semibold">{active.id ? active.name : "New product"}</h2>
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <ProductFields key={active.id + ":" + version} draft={active} catalog={snapshot} persistedSizes={snapshot.products.find(product => product.id === active.id)?.sizes.map(size => size.id) ?? []} update={patch => {
          if (!draft) setBase(active);
          setDraft({ ...active, ...patch }); setSuccess("");
        }} />
      </fieldset>
      <EditorActions busy={busy} dirty={dirty} reset={() => { setDraft(base); setVersion(value => value + 1); setError(""); }} />
    </form> : <p className="text-sm text-muted-foreground">Select or create a product.</p>}
  </>} />;
}
