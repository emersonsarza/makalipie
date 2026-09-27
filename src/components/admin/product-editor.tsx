"use client";

import Image from "next/image";
import { useCatalogEditState } from "./catalog-edit-guard";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ImagePlus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { adminKeys } from "@/lib/admin/query";
import { productFieldsSchema, slugify, type Product, type ProductFields } from "@/lib/products/schema";

const blank: ProductFields = { slug: "", name: "", blurb: "", description: "", category: "sweet", image: { url: "/brand/seal.png", alt: "Makalipie product" }, allergens: [], publicNotes: "", active: false, sortOrder: 0 };
function editable(product: Product): ProductFields {
  const { slug, name, blurb, description, category, image, allergens, publicNotes, active, sortOrder } = product;
  return { slug, name, blurb, description, category, image, allergens, publicNotes, active, sortOrder };
}

export function ProductEditor({ initial, embedded = false, onSaved, onBack }: { initial?: Product; embedded?: boolean; onSaved?: (product: Product, created: boolean) => void; onBack?: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const allowLeave = useRef(false);
  const [form, setForm] = useState<ProductFields>(() => initial ? editable(initial) : blank);
  const [version, setVersion] = useState(initial?.version);
  const [allergens, setAllergens] = useState(initial?.allergens.join(", ") ?? "");
  const [saved, setSaved] = useState(() => JSON.stringify(initial ? editable(initial) : blank));
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [slugEdited, setSlugEdited] = useState(Boolean(initial));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const current = { ...form, allergens: [...new Set(allergens.split(",").map((s) => s.trim()).filter(Boolean))] };
  const dirty = JSON.stringify(current) !== saved;

  useCatalogEditState(dirty, pending || uploading);
  useEffect(() => {
    if (embedded) return;
    if (!dirty && !uploading && !pending) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { if (allowLeave.current) return; event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    // Guard in-app sidebar navigation too, without interfering with new tabs.
    const navigate = (event: MouseEvent) => {
      const link = (event.target as Element).closest("a");
      if (!link || link.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || link.hash || link.origin !== window.location.origin) return;
      if (!window.confirm("Leave this page? Your unsaved product changes will be lost.")) { event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", navigate, true); };
  }, [dirty, pending, uploading, embedded]);

  function update<K extends keyof ProductFields>(key: K, value: ProductFields[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setNotice("");
  }
  function fieldProps(name: string) {
    return { "aria-invalid": Boolean(fields[name]), "aria-describedby": fields[name] ? `error-${name}` : undefined };
  }
  function fieldError(name: string) {
    return fields[name] ? <p id={`error-${name}`} className="admin-error-message">{fields[name]}</p> : null;
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(""); setNotice("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 3 * 1024 * 1024) {
      setError("Choose a JPG, PNG, or WebP photo smaller than 3 MB."); return;
    }
    setUploading(true);
    try {
      const response = await fetch("/api/admin/products/images", { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const body = await response.json();
      if (response.status === 401 || response.status === 403) setAccessDenied(true);
      if (!response.ok) throw new Error(body.error || "Could not upload the photo.");
      setForm((previous) => ({ ...previous, image: { ...previous.image, url: body.url } }));
      setNotice("Photo uploaded. Save the product to use it on your menu.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not upload the photo. Try again."); }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = ""; }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || uploading) return;
    setError(""); setFields({}); setNotice(""); setConflict(false);
    const parsed = productFieldsSchema.safeParse(current);
    if (!parsed.success) {
      setFields(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path[0] === "allergens" ? "allergens" : issue.path.join("."), issue.message])));
      setError("Please check the highlighted fields.");
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setPending(true);
    try {
      const response = await fetch(version ? `/api/admin/products/${form.slug}` : "/api/admin/products", {
        method: version ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(version ? { ...parsed.data, version } : parsed.data),
      });
      const body = await response.json();
      if (response.status === 401 || response.status === 403) setAccessDenied(true);
      if (!response.ok) {
        setFields(body.fields ?? {});
        setConflict(response.status === 409 && Boolean(version));
        throw new Error(body.error || "Could not save the product.");
      }
      const product = body.product as Product;
      setForm(editable(product)); setAllergens(product.allergens.join(", "));
      setSaved(JSON.stringify(editable(product))); setVersion(product.version); setSlugEdited(true);
      setNotice(product.active ? "Saved. This product is visible on the public menu." : "Saved. This product is hidden from the public menu.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.products() }),
        queryClient.invalidateQueries({ queryKey: adminKeys.product(product.id) }),
        queryClient.invalidateQueries({ queryKey: adminKeys.catalog() }),
      ]);
      onSaved?.(product, !version);
      if (!version && !embedded) {
        // Replace the creation URL so refreshing cannot start a duplicate product.
        window.history.replaceState(null, "", `/admin/catalog?product=${encodeURIComponent(product.id)}&tab=details`);
      }
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save. Your edits are still here; please try again."); }
    finally { setPending(false); }
  }

  return <>
    {!embedded && <><Link href="/admin/catalog" className="product-back"><ArrowLeft size={16} aria-hidden="true" /> All products</Link>
    <div className="products-heading"><div className="admin-page-heading"><p className="admin-eyebrow">A LITTLE DETAIL GOES A LONG WAY</p><h1>{version ? "Edit product" : "Add a product"}</h1><p>{version ? form.name : "Make room for something delicious."}</p></div><Badge variant="outline" className={form.active ? "product-visible" : "product-hidden"}>{form.active ? "Visible" : "Hidden"}</Badge></div>
    </>}
    <form ref={formRef} onSubmit={save} className="product-editor" noValidate aria-busy={pending || uploading}>
      <fieldset disabled={pending || uploading} className="product-editor-fields">
        <legend className="sr-only">Product details</legend>
        <section className="product-editor-section" aria-labelledby="product-details-title"><h2 id="product-details-title">The essentials</h2>
          <div className="admin-field"><Label htmlFor="product-name">Product name</Label><Input id="product-name" value={form.name} maxLength={100} onChange={(e) => { update("name", e.target.value); if (!slugEdited) update("slug", slugify(e.target.value)); }} {...fieldProps("name")} />{fieldError("name")}</div>
          <div className="product-field-pair"><div className="admin-field"><Label htmlFor="product-category">Category</Label><NativeSelect id="product-category" value={form.category} onChange={(e) => update("category", e.target.value as "sweet" | "savory")}><option value="sweet">Sweet</option><option value="savory">Savoury</option></NativeSelect></div><div className="admin-field"><Label htmlFor="product-sort">Display order</Label><Input id="product-sort" type="number" min={0} max={9999} value={Number.isNaN(form.sortOrder) ? "" : form.sortOrder} onChange={(e) => update("sortOrder", e.target.valueAsNumber)} {...fieldProps("sortOrder")} /><p className="product-help">Lower numbers appear first in each category.</p>{fieldError("sortOrder")}</div></div>
          <div className="admin-field"><Label htmlFor="product-blurb">Short description</Label><Textarea id="product-blurb" rows={2} maxLength={180} value={form.blurb} onChange={(e) => update("blurb", e.target.value)} {...fieldProps("blurb")} /><p className="product-help">A short introduction for the home page. {form.blurb.length}/180</p>{fieldError("blurb")}</div>
          <div className="admin-field"><Label htmlFor="product-description">Full description</Label><Textarea id="product-description" rows={5} maxLength={2000} value={form.description} onChange={(e) => update("description", e.target.value)} {...fieldProps("description")} />{fieldError("description")}</div>
        </section>
        <section className="product-editor-section" aria-labelledby="product-extra-title"><h2 id="product-extra-title">Good to know</h2><div className="admin-field"><Label htmlFor="product-allergens">Allergens</Label><Input id="product-allergens" value={allergens} onChange={(e) => { setAllergens(e.target.value); setNotice(""); }} placeholder="e.g. dairy, gluten, nuts" {...fieldProps("allergens")} /><p className="product-help">Separate with commas. List only allergens confirmed by the bakery.</p>{fieldError("allergens")}</div><div className="admin-field"><Label htmlFor="product-notes">Customer notes</Label><Textarea id="product-notes" rows={3} maxLength={300} value={form.publicNotes} onChange={(e) => update("publicNotes", e.target.value)} placeholder="Storage advice, serving suggestions, or availability notes" {...fieldProps("publicNotes")} />{fieldError("publicNotes")}</div><div className="admin-field"><Label htmlFor="product-slug">Product link</Label><Input id="product-slug" value={form.slug} readOnly={Boolean(version)} maxLength={80} onChange={(e) => { setSlugEdited(true); update("slug", e.target.value); }} {...fieldProps("slug")} /><p className="product-help">/menu#{form.slug || "product-name"}{version ? " · Kept fixed so existing links continue to work." : " · Use lowercase letters, numbers, and hyphens."}</p>{fieldError("slug")}</div></section>
      </fieldset>
      <aside className="product-editor-side">
        <section className="product-editor-section" aria-labelledby="product-photo-title"><h2 id="product-photo-title">Product photo</h2><div className="product-photo-preview"><Image src={form.image.url} alt={form.image.alt || "Product photo preview"} unoptimized width={480} height={480} /></div><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label="Choose a product photo" disabled={pending || uploading} onChange={(e) => void upload(e.target.files?.[0])} /><Button type="button" variant="outline" onClick={() => fileInput.current?.click()} disabled={pending || uploading}><Upload aria-hidden="true" />{uploading ? "Uploading photo…" : "Upload photo"}</Button><p className="product-help">JPG, PNG, or WebP. Up to 3 MB. Photos are resized for the website.</p>{form.image.url !== "/brand/seal.png" && <Button type="button" variant="ghost" disabled={pending || uploading} onClick={() => { update("image", { url: "/brand/seal.png", alt: "Makalipie seal" }); }}><ImagePlus aria-hidden="true" /> Use brand image</Button>}{fieldError("image.url")}<div className="admin-field"><Label htmlFor="product-image-alt">Photo description</Label><Input id="product-image-alt" disabled={pending || uploading} value={form.image.alt} maxLength={200} onChange={(e) => update("image", { ...form.image, alt: e.target.value })} {...fieldProps("image.alt")} />{fieldError("image.alt")}</div></section>
        <section className="product-editor-section"><h2>On the menu</h2>{version && !embedded && <Link href="/admin/catalog" className="text-link">Manage sizes, prices & availability</Link>}<div className="admin-field"><Label htmlFor="product-visibility">Visibility</Label><NativeSelect id="product-visibility" disabled={pending || uploading} value={form.active ? "visible" : "hidden"} onChange={(e) => update("active", e.target.value === "visible")}><option value="hidden">Hidden</option><option value="visible">Visible</option></NativeSelect><p className="product-help">Hidden products stay here for editing and disappear from the public menu and order form when saved.</p></div><p className="product-price-note">Prices belong to sizes. Use Catalog to manage fixed prices, quotes, preparation time, and availability.</p></section>
      </aside>
      <div className="product-savebar">
        <div className="product-save-feedback">
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {accessDenied && (
            <a href="/admin/login" target="_blank" rel="noreferrer">
              Sign in in a new tab, then retry saving here.
            </a>
          )}
          {conflict && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (window.confirm("Reload the latest product? This will discard your unsaved edits.")) {
                  allowLeave.current = true;
                  window.location.reload();
                }
              }}
            >
              Reload latest product
            </Button>
          )}
          {notice && (
            <Alert className="border-transparent text-[#356045]" role="status">
              <Check size={16} aria-hidden="true" />
              <AlertDescription className="text-[#356045]">{notice}</AlertDescription>
            </Alert>
          )}
          {!notice && !error && (
            <p className="product-help">{dirty ? "You have unsaved changes." : "Changes appear on the website after saving."}</p>
          )}
        </div>
        <div className="product-save-actions">
          <Button
            type="button"
            variant="outline"
            disabled={pending || uploading}
            onClick={() => {
              if (embedded) { onBack?.(); return; }
              if (dirty) setLeaving(true);
              else router.push("/admin/catalog");
            }}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending || uploading}>
            {pending ? "Saving…" : "Save product details"}
          </Button>
        </div>
      </div>
      {leaving && (
        <Card className="product-discard" size="sm" role="alert">
          <CardHeader>
            <CardTitle>Discard your unsaved changes?</CardTitle>
            <CardDescription>Your edits on this product will be lost.</CardDescription>
          </CardHeader>
          <CardFooter className="gap-2 border-0 bg-transparent">
            <Button type="button" variant="outline" onClick={() => setLeaving(false)}>
              Keep editing
            </Button>
            <Button
              type="button"
              onClick={() => {
                allowLeave.current = true;
                setLeaving(false);
                router.push("/admin/catalog");
              }}
            >
              Discard changes
            </Button>
          </CardFooter>
        </Card>
      )}
    </form>
  </>;
}
