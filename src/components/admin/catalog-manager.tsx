"use client";

import Link from "next/link";
import dayjs from "@/lib/dayjs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCatalogEditState } from "./catalog-edit-guard";
import Image from "next/image";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CatalogTabActions } from "./catalog-tab-actions";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  addonWriteSchema,
  pesosToCentavos,
  productCatalogSchema,
  type Addon,
  type CatalogProduct,
  type ProductCatalog,
} from "@/lib/catalog/schema";
import { availabilityText } from "@/lib/catalog/rules";
import { slugify } from "@/lib/products/schema";

type Save = (body: unknown) => Promise<void>;

function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return (
    <div className="admin-field">
      <Label>
        {label}
        {children}
      </Label>
      {help && <p className="product-help">{help}</p>}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  max = 9999,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={0}
        max={max}
        step={1}
        required
        value={Number.isNaN(value) ? "" : value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
    </Field>
  );
}

function Money({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  const [text, setText] = useState(value === null ? "" : (value / 100).toFixed(2));
  return (
    <Field label="Price (₱)" help="Up to two decimal places.">
      <Input
        inputMode="decimal"
        required
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(pesosToCentavos(e.target.value));
        }}
      />
    </Field>
  );
}

function useUnsaved(dirty: boolean, pending = false) {
  const embedded = useCatalogEditState(dirty, pending);
  useEffect(() => {
    if (!dirty || embedded) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const click = (e: MouseEvent) => {
      const link = (e.target as Element).closest("a");
      if (
        link &&
        link.target !== "_blank" &&
        !link.hash &&
        !e.metaKey &&
        !e.ctrlKey &&
        !window.confirm("Discard your unsaved catalog changes?")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty, embedded]);
}

function Feedback({ error }: { error: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  if (!error) return null;
  return (
    <div ref={ref} tabIndex={-1} className="catalog-error outline-none">
      <Alert variant="destructive" role="alert">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    </div>
  );
}

function CheckRow({
  checked,
  onCheckedChange,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center gap-2 text-sm">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      <Label htmlFor={id} className="cursor-pointer text-left font-normal">
        {children}
      </Label>
    </div>
  );
}

function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const items = Object.fromEntries(options.map((option) => [option.value, option.label]));
  return (
    <Field label={label}>
      <Select value={value} items={items} onValueChange={(next) => { if (next != null) onChange(String(next)); }}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="start">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function priceLabel(variant: ProductCatalog["variants"][number]) {
  if (variant.pricingMode === "quote_required") return "Quote";
  return `₱${((variant.priceCentavos ?? 0) / 100).toFixed(2)}`;
}

function validationMessage(issues: { path: PropertyKey[]; message: string }[]) {
  return issues.map((i) => `${i.path.join(" › ") || "Catalog"}: ${i.message}`).join(" · ");
}

export function ProductOptions({
  product,
  addons,
  save,
  back,
  embedded = false,
}: {
  embedded?: boolean;
  product: CatalogProduct;
  addons: Addon[];
  save: Save;
  back: () => void;
}) {
  const original: ProductCatalog = {
    version: product.version,
    variants: product.variants,
    availableWeekdays: product.availableWeekdays,
    unavailableDates: product.unavailableDates,
    allowedAddonIds: product.allowedAddonIds,
  };
  const [form, setForm] = useState(original);
  const [openId, setOpenId] = useState(product.variants[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(original);
  useUnsaved(dirty, pending);

  function leave() {
    if (embedded || !dirty || window.confirm("Discard your unsaved catalog changes?")) back();
  }

  return (
    <>
      {!embedded && <><Button variant="ghost" onClick={leave}>
        <ArrowLeft aria-hidden /> All catalog products
      </Button>
      <div className="products-heading">
        <div className="admin-page-heading">
          <h1>{product.name}</h1>
          <p>Sizes, preparation, and when it’s on the menu.</p>
        </div>
        <Link href={`/admin/catalog?product=${encodeURIComponent(product.id)}&tab=details`}>Edit product details</Link>
      </div></>}
      <form
        id={embedded ? "catalog-selling-form" : undefined}
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const parsed = productCatalogSchema.safeParse(form);
          if (!parsed.success) {
            setError(validationMessage(parsed.error.issues));
            return;
          }
          setPending(true);
          try {
            await save({ action: "product", id: product.id, fields: parsed.data });
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save.");
          } finally {
            setPending(false);
          }
        }}
      >
        <Feedback error={error} />
        <fieldset disabled={pending} className="catalog-fields catalog-ledger">
          <legend className="sr-only">Catalog options</legend>
          <div className="catalog-ledger-split">
            <div className="catalog-ledger-list">
              <div className="catalog-ledger-head">
                <h2>Sizes & prices</h2>
                <Button
                  type="button"
                  variant="outline"
                  disabled={form.variants.length >= 30}
                  onClick={() => {
                    const id = `size-${crypto.randomUUID().slice(0, 8)}`;
                    setOpenId(id);
                    setForm({
                      ...form,
                      variants: [
                        ...form.variants,
                        {
                          id,
                          label: "",
                          pricingMode: "quote_required",
                          priceCentavos: null,
                          minLeadDays: 0,
                          active: false,
                          sortOrder: form.variants.length,
                        },
                      ],
                    });
                  }}
                >
                  <Plus aria-hidden /> Add size
                </Button>
              </div>
              {form.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="catalog-size-row"
                  data-on={v.id === (form.variants.find((row) => row.id === openId) ?? form.variants[0])?.id}
                  data-off={!v.active}
                  onClick={() => setOpenId(v.id)}
                >
                  <span className="catalog-size-copy">
                    <strong>{v.label || "New size"}</strong>
                    <span>{priceLabel(v)} · {v.minLeadDays} days</span>
                  </span>
                  <em>{v.active ? "Available" : "Inactive"}</em>
                </button>
              ))}
            </div>
            {form.variants.map((v, index) => {
              const shown = v.id === (form.variants.find((row) => row.id === openId) ?? form.variants[0])?.id;
              if (!shown) return null;
              const update = (values: Partial<typeof v>) =>
                setForm({
                  ...form,
                  variants: form.variants.map((row, i) => (i === index ? { ...row, ...values } : row)),
                });
              return (
                <section className="product-editor-section" key={v.id}>
                  <h2>{v.label || "New size"}</h2>
                  <div className="catalog-grid-fields">
                    <Field label="Size name">
                      <Input required maxLength={80} value={v.label} onChange={(e) => update({ label: e.target.value })} />
                    </Field>
                    <Choice
                      label="Pricing"
                      value={v.pricingMode}
                      options={[{ value: "fixed", label: "Fixed price" }, { value: "quote_required", label: "Quote required" }]}
                      onChange={(pricingMode) =>
                        update({
                          pricingMode: pricingMode as typeof v.pricingMode,
                          priceCentavos: pricingMode === "fixed" ? (v.priceCentavos ?? 0) : null,
                        })
                      }
                    />
                    {v.pricingMode === "fixed" ? (
                      <Money key={`${v.id}-fixed`} value={v.priceCentavos} onChange={(priceCentavos) => update({ priceCentavos })} />
                    ) : (
                      <p className="product-help">Customers see “DM for price.” The final price is confirmed in chat.</p>
                    )}
                    <NumberField label="Preparation days" max={365} value={v.minLeadDays} onChange={(minLeadDays) => update({ minLeadDays })} />
                    <NumberField label="Display order" value={v.sortOrder} onChange={(sortOrder) => update({ sortOrder })} />
                    <Choice
                      label="Status"
                      value={v.active ? "active" : "inactive"}
                      options={[{ value: "active", label: "Available" }, { value: "inactive", label: "Inactive" }]}
                      onChange={(status) => update({ active: status === "active" })}
                    />
                  </div>
                </section>
              );
            })}
          </div>
          <div className="catalog-ledger-band">
          <section className="product-editor-section">
            <h2>Weekly availability</h2>
            <p className="product-help">Leave every day off for daily availability. Dates use Manila time.</p>
            <div className="catalog-days">
              {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((label, i) => (
                <Button
                  key={label}
                  type="button"
                  variant="outline"
                  data-on={form.availableWeekdays.includes(i)}
                  onClick={() =>
                    setForm({
                      ...form,
                      availableWeekdays: form.availableWeekdays.includes(i)
                        ? form.availableWeekdays.filter((d) => d !== i)
                        : [...form.availableWeekdays, i].sort(),
                    })
                  }
                >
                  {label.slice(0, 3)}
                </Button>
              ))}
            </div>
            <p className="product-help">{availabilityText(form)}</p>
            <h2>Unavailable dates</h2>
            <div className="catalog-date-add">
              <div className="admin-field">
                <Label htmlFor="blocked-date-picker">Block a date</Label>
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger render={<Button id="blocked-date-picker" type="button" variant="outline" />}>
                    {date ? dayjs(date, "YYYY-MM-DD", true).format("D MMM YYYY") : "Choose a date"}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={date ? dayjs(date, "YYYY-MM-DD", true).toDate() : undefined}
                      defaultMonth={dayjs(dayjs().tz("Asia/Manila").format("YYYY-MM-DD"), "YYYY-MM-DD", true).toDate()}
                      onSelect={value => { setDate(value ? dayjs(value).format("YYYY-MM-DD") : ""); setCalendarOpen(false); }} />
                  </PopoverContent>
                </Popover>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!dayjs(date, "YYYY-MM-DD", true).isValid() || form.unavailableDates.includes(date)}
                onClick={() => {
                  setForm({ ...form, unavailableDates: [...form.unavailableDates, date].sort() });
                  setDate("");
                }}
              >
                Add date
              </Button>
            </div>
            <div className="catalog-checks">
              {form.unavailableDates.map((d) => (
                <Button
                  key={d}
                  variant="outline"
                  type="button"
                  aria-label={`Remove blocked date ${d}`}
                  onClick={() =>
                    setForm({
                      ...form,
                      unavailableDates: form.unavailableDates.filter((x) => x !== d),
                    })
                  }
                >
                  {dayjs(d, "YYYY-MM-DD", true).format("D MMM YYYY")} ×
                </Button>
              ))}
            </div>
          </section>
          <section className="product-editor-section">
            <h2>Compatible add-ons</h2>
            <p className="product-help">
              Select what can accompany this product. No selections means no add-ons. Order-level extras need at least one
              compatible pie.
            </p>
            <div className="catalog-checks">
              {addons.map((a) => (
                <CheckRow
                  key={a.id}
                  checked={form.allowedAddonIds.includes(a.id)}
                  onCheckedChange={(checked) =>
                    setForm({
                      ...form,
                      allowedAddonIds: checked
                        ? [...form.allowedAddonIds, a.id]
                        : form.allowedAddonIds.filter((id) => id !== a.id),
                    })
                  }
                >
                  {a.name}
                  {!a.active && " (inactive)"}
                </CheckRow>
              ))}
            </div>
          </section>
          </div>
        </fieldset>
        <div className="product-savebar">
          <p className="product-help">{dirty ? "You have unsaved changes." : "Prices and availability apply after saving."}</p>
          <CatalogTabActions active={embedded}>
            <Button type="button" variant="outline" disabled={pending} onClick={leave}>
              Back
            </Button>
            <Button type="submit" form={embedded ? "catalog-selling-form" : undefined} disabled={pending}>
              {pending ? "Saving…" : "Save selling options"}
            </Button>
          </CatalogTabActions>
        </div>
      </form>
    </>
  );
}

export function AddonEditor({ initial, save, back, embedded = false }: { initial?: Addon; save: Save; back: () => void; embedded?: boolean }) {
  const blank: Addon = {
    id: "",
    version: 0,
    name: "",
    priceCentavos: 0,
    image: { url: "/brand/seal.png", alt: "Makalipie add-on" },
    minLeadDays: 0,
    allergens: [],
    active: false,
    sortOrder: 0,
    scope: "per_order",
    customization: { enabled: false, label: "Your message", required: false, maxLength: 300 },
  };
  const [form, setForm] = useState(initial ?? blank);
  const [allergens, setAllergens] = useState(initial?.allergens.join(", ") ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const { id, version, ...fields } = form;
  const current = {
    ...fields,
    allergens: [...new Set(allergens.split(",").map((s) => s.trim()).filter(Boolean))],
  };
  const dirty = JSON.stringify({ ...form, allergens: current.allergens }) !== JSON.stringify(initial ?? blank);
  useUnsaved(dirty, pending);
  const update = (values: Partial<Addon>) => setForm({ ...form, ...values });

  function leave() {
    if (embedded || !dirty || window.confirm("Discard your unsaved add-on changes?")) back();
  }

  return (
    <>
      <Button variant="ghost" onClick={leave}>
        <ArrowLeft aria-hidden /> All add-ons
      </Button>
      <div className="admin-page-heading products-heading">
        <div>
          <h1>{initial ? "Edit add-on" : "Add an extra"}</h1>
          <p>A little something to go with their pies.</p>
        </div>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const parsed = addonWriteSchema.safeParse({ id, version, fields: current });
          if (!parsed.success) {
            setError(validationMessage(parsed.error.issues));
            return;
          }
          setPending(true);
          try {
            await save({ action: "addon", addon: parsed.data });
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save.");
          } finally {
            setPending(false);
          }
        }}
      >
        <Feedback error={error} />
        <fieldset disabled={pending} className="catalog-fields">
          <legend className="sr-only">Add-on details</legend>
          <section className="product-editor-section">
            <h2>The essentials</h2>
            <div className="catalog-grid-fields">
              <Field label="Name">
                <Input
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(e) => update({ name: e.target.value, ...(!initial ? { id: slugify(e.target.value) } : {}) })}
                />
              </Field>
              <Field label="Permanent ID">
                <Input required readOnly={!!initial} value={id} onChange={(e) => update({ id: e.target.value })} />
              </Field>
              <Money value={form.priceCentavos} onChange={(priceCentavos) => update({ priceCentavos })} />
              <Field label="Charge">
                <NativeSelect value={form.scope} onChange={(e) => update({ scope: e.target.value as Addon["scope"] })}>
                  <option value="per_order">Once per order</option>
                  <option value="per_item">For each pie in a selected line</option>
                </NativeSelect>
              </Field>
              <NumberField label="Preparation days" max={365} value={form.minLeadDays} onChange={(minLeadDays) => update({ minLeadDays })} />
              <NumberField label="Display order" value={form.sortOrder} onChange={(sortOrder) => update({ sortOrder })} />
              <Field label="Status">
                <NativeSelect
                  value={form.active ? "active" : "inactive"}
                  onChange={(e) => update({ active: e.target.value === "active" })}
                >
                  <option value="active">Available</option>
                  <option value="inactive">Inactive</option>
                </NativeSelect>
              </Field>
              <Field label="Allergens" help="Comma separated; only confirmed allergens.">
                <Input value={allergens} onChange={(e) => setAllergens(e.target.value)} />
              </Field>
            </div>
            <p className="product-help">
              Choose compatible products from each product’s catalog options. New extras are not automatically offered with
              every pie.
            </p>
          </section>
          <section className="product-editor-section">
            <h2>Photo</h2>
            <Image src={form.image.url} unoptimized alt={form.image.alt} width={140} height={140} className="catalog-addon-photo" />
            <Field label="Upload photo" help="JPG, PNG, or WebP, up to 3 MB.">
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  e.target.value = "";
                  setError("");
                  if (file.size > 3 * 1024 * 1024) {
                    setError("Choose a photo smaller than 3 MB.");
                    return;
                  }
                  setPending(true);
                  try {
                    const response = await fetch("/api/admin/products/images", {
                      method: "POST",
                      headers: { "Content-Type": file.type },
                      body: file,
                    });
                    const body = await response.json();
                    if (!response.ok) throw new Error(body.error);
                    setForm((p) => ({ ...p, image: { ...p.image, url: body.url } }));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Upload failed.");
                  } finally {
                    setPending(false);
                  }
                }}
              />
            </Field>
            <Field label="Photo description">
              <Input
                required
                maxLength={200}
                value={form.image.alt}
                onChange={(e) => update({ image: { ...form.image, alt: e.target.value } })}
              />
            </Field>
          </section>
          <section className="product-editor-section">
            <h2>Customer message</h2>
            <div className="catalog-checks">
              <CheckRow
                checked={form.customization.enabled}
                onCheckedChange={(checked) =>
                  update({
                    customization: {
                      ...form.customization,
                      enabled: checked,
                      required: checked && form.customization.required,
                    },
                  })
                }
              >
                Allow a custom message
              </CheckRow>
            </div>
            {form.customization.enabled && (
              <div className="catalog-grid-fields">
                <Field label="Message field label">
                  <Input
                    required
                    maxLength={100}
                    value={form.customization.label}
                    onChange={(e) => update({ customization: { ...form.customization, label: e.target.value } })}
                  />
                </Field>
                <NumberField
                  label="Maximum characters"
                  max={500}
                  value={form.customization.maxLength}
                  onChange={(maxLength) => update({ customization: { ...form.customization, maxLength } })}
                />
                <div className="catalog-checks">
                  <CheckRow
                    checked={form.customization.required}
                    onCheckedChange={(checked) =>
                      update({ customization: { ...form.customization, required: checked } })
                    }
                  >
                    Message is required
                  </CheckRow>
                </div>
              </div>
            )}
          </section>
        </fieldset>
        <div className="product-savebar">
          <p className="product-help">{dirty ? "You have unsaved changes." : "Inactive extras remain available for later editing."}</p>
          <div className="product-save-actions">
            <Button type="button" variant="outline" disabled={pending} onClick={leave}>
              Back
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save add-on"}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
