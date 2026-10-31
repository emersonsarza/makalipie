"use client";

import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Check, Landmark, MapPin, Minus, Plus, Store, Truck, Wallet, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PackageChoices } from "@/components/customer-packages";
import { DropNotice } from "@/components/customer-policy";

import Image from "next/image";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar } from "@/components/ui/calendar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { dayjs } from "@/lib/dayjs";
import {
  formatPrice,
  paymentMethods,
  type MenuItem,
} from "@/lib/site";
import { usePublicShop, ChatLinks } from "@/components/public-shop-provider";
import { PickupAddress } from "@/components/pickup-address";
import { MobileLineup } from "@/components/mobile-lineup";
import { CatalogAddonOptions } from "@/components/catalog-addon-options";
import { availabilityStatus, manilaDate, quoteSelection } from "@/lib/catalog/rules";
import { type MenuSection } from "@/lib/catalog/sections";
import { flavorSizeName } from "@/lib/catalog/size";
import { variantOrderMode } from "@/lib/catalog/mode";
import { groupMenuRows } from "@/lib/catalog/presentation";
import { unifiedDraftKey, loadUnifiedDraft, type UnifiedDraft } from "@/lib/orders/browsing-draft";
import { formatInstagramOrder } from "@/lib/orders/instagram-message";
import { phoneNumberError } from "@/lib/orders/phone";
import type { Addon, Catalog, Selection, Variant } from "@/lib/catalog/schema";
import { useOrderSchedule } from "@/hooks/use-order-schedule";
import type { ScheduleSettings } from "@/lib/scheduling/schema";
import { addCalendarDays, orderingDateOptions, preparationStartDate } from "@/lib/scheduling/rules";
import { branchById, orderingBranchCatalog, variantAvailable, visibleBranches, type BranchId, type BranchSettings, type CatalogMode } from "@/lib/branches/schema";
import { cn } from "@/lib/utils";
import design from "./customer-order.module.css";

type FormState = {
  name: string;
  contact: string;
  preferredDate: Date | undefined;
  preferredTime: string;
  quantities: Record<string, number>;
  notes: string;
  selectedAddons: string[];
  addonMessages: Record<string, string>;
  lineAddons: Record<string, string[]>;
  lineMessages: Record<string, Record<string, string>>;
  payment: string;
  delivery: "pickup" | "lalamove";
  address: string;
  deliveryFeePayment: "with_total" | "to_driver";
};

const initialState: FormState = {
  name: "",
  contact: "",
  preferredDate: undefined,
  preferredTime: "",
  quantities: {},
  notes: "",
  selectedAddons: [],
  addonMessages: {}, lineAddons: {}, lineMessages: {},
  payment: "bank", delivery: "pickup", address: "", deliveryFeePayment: "with_total",
};

function formatPreferredWhen(date: Date | undefined, time: string) {
  if (!date) return "";
  return `${dayjs(date).format("ddd MMM D")} · ${time || "Choose a time slot"}`;
}

function openInstagram(url: string) {
  if (window.matchMedia("(pointer: coarse)").matches) window.location.assign(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

function QtyStepper({
  value,
  onChange,
  label,
  unavailable = false,
  productRow = false,
}: {
  productRow?: boolean;
  unavailable?: boolean;
  value: number;
  onChange: (next: number) => void;
  label: string;
}) {
  const addButton = value === 0 && !productRow ? <Button type="button" variant="outline" className={design.addButton} disabled={unavailable} aria-label={`Add ${label}`} onClick={() => onChange(1)}>Add <Plus size={14} aria-hidden /></Button> : null;
  if (value === 0 && !productRow) return addButton;
  return (
    <>
    {addButton}
    <div className={cn("order-stepper", design.stepper)}>
      <Button
        type="button"
        variant="ghost"
        className="pressable size-11 rounded-full text-charcoal hover:bg-transparent"
        aria-label={`Decrease ${label}`}
        disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
      >
        <Minus className="size-3.5" />
      </Button>
      <span className="w-7 text-center text-sm font-semibold tabular-nums">
        {value}
      </span>
      <Button
        type="button"
        variant="ghost"
        className="pressable size-11 rounded-full text-charcoal hover:bg-transparent"
        aria-label={`Increase ${label}`}
        disabled={unavailable || value >= 100}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
    </>
  );
}

function FlavorRow({
  item,
  quantity,
  onQuantityChange,
  reason,
  atLimit = false,
  availabilityLabel,
}: {
  availabilityLabel?: string;
  atLimit?: boolean;
  reason?: string | null;
  item: OrderItem;
  quantity: number;
  onQuantityChange: (next: number) => void;
}) {
  const selected = quantity > 0;


  return (
    <div className={cn("order-flavor", selected ? "is-selected" : "", reason && !selected ? design.unavailable : "")}>
      <Image src={item.image.src} unoptimized alt="" width={72} height={72} className="order-thumb" />
      <div className={design.productInfo}>
      <div className={design.productCopy}>
        <p className={design.productName}>{item.displayName}</p>
        {reason && availabilityLabel !== "" && <p className={selected ? design.productWarning : design.productNote}>{availabilityLabel ?? reason}</p>}
        {!!item.allergens?.length && <details className={design.productDetails}><summary>Allergen information</summary><p>Contains: {item.allergens.join(", ")}.</p></details>}
      </div>
      <p className={design.productPrice}>{item.price == null ? "Price to confirm" : formatPrice(item.price)}</p>
      </div>
      {(!reason || selected) && <QtyStepper
        productRow
        value={quantity}
        onChange={onQuantityChange}
        unavailable={Boolean(reason) || atLimit}
        label={item.name}
      />}
    </div>
  );
}

type OrderItem = MenuItem & { catalogMode: CatalogMode; displayName: string; productId: string; variant: Variant };
export function OrderForm({ items, catalogAddons, branches, initialBranch, schedule, serverNow, openDates = {}, openProducts = {}, intakeEnabled = false, mode = "regular", sections = [] }: { items: MenuItem[]; catalogAddons: Addon[]; branches: BranchSettings; initialBranch: BranchId; schedule: ScheduleSettings; serverNow: string; openDates?: Record<string, string[]>; openProducts?: Record<string, Record<string, string[]>>; intakeEnabled?: boolean; mode?: CatalogMode; sections?: MenuSection[] }) {
  const [step, setStep] = useState(0);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const stepsSlot = useRef<HTMLDivElement>(null);
  const stepsBar = useRef<HTMLElement>(null);
  const [stepsPin, setStepsPin] = useState<{ top: number; height: number } | null>(null);
  function goToStep(next: number) {
    setStep(next);
    requestAnimationFrame(() => {
      const heading = stepHeading.current;
      heading?.focus({ preventScroll: true });
      (heading?.parentElement ?? heading)?.scrollIntoView({ block: "start", behavior: "instant" });
    });
  }
  const publicShop = usePublicShop();
  const packages = publicShop.experience?.packages ?? [];
  const [packageQuantities,setPackageQuantities] = useState<Record<string,number>>({});
  const channels = publicShop.links.messenger ? (publicShop.links.messenger.includes("facebook.com")?"Instagram or Facebook":"Instagram or Messenger") : "Instagram";
  const scheduleState = useOrderSchedule(schedule, serverNow, openDates, openProducts);
  const [priceNotice, setPriceNotice] = useState<string[]>([]);
  const [priceAcknowledged, setPriceAcknowledged] = useState(true);
  const previousPrices = useRef<Record<string, string>>({});
  const dateTouched = useRef(false);
  const [draftReadyMode, setDraftReadyMode] = useState<CatalogMode | null>(null);
  const submittedDraft = useRef(false);
  const draftPriceBaseline = useRef<Record<string,string>>({});
  const draftPricesPending = useRef(false);
  const [draftDateNotice, setDraftDateNotice] = useState("");
  const [editing] = useState<{ token: string; revision: string; keys: string[]; date: string; quantities: Record<string, number> } | null>(null);
  const [draftLoading] = useState(false);
  const [draftFailed] = useState(false);
  const [recovery] = useState<{ orderNumber: string; priceChanges: { from: string; to: string }[]; unavailableLines: { productId: string; variantId: string; label: string }[] } | null>(null);
  const [dismissedLines, setDismissedLines] = useState<string[]>([]);
  const [branch, setBranch] = useState<BranchId>(initialBranch);
  const shop = branchById(branches, branch);
  const publicBranches = visibleBranches(branches);
  const branchUnavailable = !publicBranches.some(item => item.id === branch);
  const menuItems: OrderItem[] = items.flatMap((item) => (item.variants ?? []).filter((v) => v.active).map((v) => ({ ...item, catalogMode: variantAvailable(branches, branch, item.slug, v.id, v.minLeadDays, "regular", v.orderMode) ? "regular" as const : "preorder" as const, displayName: item.name, productId: item.slug, slug: `${item.slug}:${v.id}`, name: flavorSizeName(item.name, v.label), price: v.pricingMode === "fixed" ? v.priceCentavos! / 100 : undefined, priceLabel: "Price pending", variant: v, image: v.image ? { src: v.image.url, alt: v.image.alt } : item.image })));
  const availableHere = (item: OrderItem) => variantAvailable(branches, branch, item.productId, item.variant.id, item.variant.minLeadDays, "regular", item.variant.orderMode) || variantAvailable(branches, branch, item.productId, item.variant.id, item.variant.minLeadDays, "preorder", item.variant.orderMode);
  const visibleItems = menuItems.filter(availableHere);
  const [form, setForm] = useState<FormState>(() => ({ ...initialState, delivery: shop.pickupEnabled ? "pickup" : "lalamove", quantities: Object.fromEntries(menuItems.map((item) => [item.slug, 0])) }));
  useLayoutEffect(() => {
    const slot = stepsSlot.current;
    if (!slot || !window.matchMedia("(max-width: 767px)").matches) return;
    const header = document.querySelector(".brand-header");
    const offset = header?.getBoundingClientRect().height ?? 0;
    const y = slot.getBoundingClientRect().top + window.scrollY - offset;
    if (y > 8) window.scrollTo(0, y);
  }, []);
  useEffect(() => {
    const slot = stepsSlot.current;
    const bar = stepsBar.current;
    if (!slot || !bar) return;
    const query = window.matchMedia("(max-width: 767px)");
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!query.matches) { setStepsPin(null); return; }
      const header = document.querySelector(".brand-header");
      const top = Math.max(0, Math.round(header?.getBoundingClientRect().bottom ?? 0));
      const shouldPin = slot.getBoundingClientRect().top < top - 1;
      setStepsPin((current) => {
        if (!shouldPin) return null;
        const height = current?.height ?? slot.offsetHeight;
        if (current && current.top === top && current.height === height) return current;
        return { top, height };
      });
    };
    const onScroll = () => { if (frame) return; frame = window.requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    query.addEventListener("change", onScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      query.removeEventListener("change", onScroll);
    };
  }, []);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);

  const [checking, setChecking] = useState(false);
  const [copiedOrder, setCopiedOrder] = useState(false);
  const [manualCopy, setManualCopy] = useState("");
  useEffect(() => {
    const current = Object.fromEntries([
      ...items.flatMap(p => (p.variants ?? []).map(v => [`${p.slug}:${v.id}`, `${v.pricingMode}:${v.priceCentavos}`])),
      ...catalogAddons.map(a => [`addon:${a.id}`, String(a.priceCentavos)]),
      ...packages.map(p => [`package:${p.id}`, String(p.priceCentavos)]),
    ]);
    const selectedKeys = [...Object.keys(packageQuantities).filter(id => packageQuantities[id] > 0).map(id => `package:${id}`), ...Object.keys(form.quantities).filter(key => form.quantities[key] > 0), ...form.selectedAddons.map(id => `addon:${id}`), ...Object.values(form.lineAddons).flat().map(id => `addon:${id}`)];
    const changed = selectedKeys.filter(key => previousPrices.current[key] !== undefined && current[key] !== undefined && previousPrices.current[key] !== current[key]);
    if (changed.length) { draftPricesPending.current = true; for (const key of changed) draftPriceBaseline.current[key] = previousPrices.current[key]; setPriceNotice(changed.map(key => key.startsWith("package:") ? packages.find(p => `package:${p.id}` === key)?.name || "Package" : key.startsWith("addon:") ? catalogAddons.find(a => `addon:${a.id}` === key)?.name || "Extra" : items.find(p => key.startsWith(`${p.slug}:`))?.name || "Pie")); setPriceAcknowledged(false); }
    previousPrices.current = {...previousPrices.current,...current};
  }, [items, catalogAddons, form.quantities, form.selectedAddons, form.lineAddons, publicShop.experience?.packages, packageQuantities]);
  const removedSelections = Object.entries(form.quantities).filter(([key, quantity]) => quantity > 0 && !menuItems.some(item => item.slug === key));
  const selectedPackageCount = Object.values(packageQuantities).reduce((sum, quantity) => sum + quantity, 0);
  const selectedCount = menuItems.reduce((sum, item) => sum + (form.quantities[item.slug] ?? 0), 0) + selectedPackageCount * 4;
  const selectedItems = menuItems.filter(
    (item) => form.quantities[item.slug] > 0,
  );
  const unavailableItems = selectedItems.filter((item) => !availableHere(item));
  const pendingUnavailable = (recovery?.unavailableLines ?? []).filter((line) => !dismissedLines.includes(`${line.productId}:${line.variantId}`));
  const [pendingChange, setPendingChange] = useState<{ kind: "date"; date: Date } | { kind: "branch"; branch: BranchId } | null>(null);
  function changeBranch(next: BranchId, confirmed = false) {
    if (next === branch) return;
    if (selectedCount && !confirmed) { setPendingChange({ kind: "branch", branch: next }); return; }
    const destination = branchById(branches, next);
    setForm((current) => ({ ...current, preferredTime: "", delivery: current.delivery === "pickup" && !destination.pickupEnabled ? "lalamove" : current.delivery === "lalamove" && !destination.deliveryEnabled ? "pickup" : current.delivery }));
    setBranch(next);
    setError(null);
    const url = new URL(window.location.href); url.searchParams.set("branch", next);
    window.history.replaceState(null, "", url.toString());
  }
  const chosenAddons = catalogAddons.filter((a) => form.selectedAddons.includes(a.id));
  const selectedContent: Omit<Selection, "date"> = { lines: selectedItems.map((item) => ({ productId: item.productId, variantId: item.variant.id, quantity: form.quantities[item.slug], addons: (form.lineAddons[item.slug] ?? []).map((id) => ({ id, message: form.lineMessages[item.slug]?.[id] ?? "" })) })), addons: form.selectedAddons.map((id) => ({ id, message: form.addonMessages[id] ?? "" })) };
  const clientCatalog: Catalog = { initialized: true, preorderLeadDays: publicShop.defaultPreorderLeadDays ?? 3, sections, addons: catalogAddons, products: items.map((p) => ({ id: p.slug, slug: p.slug, name: p.name, blurb: p.blurb, description: p.description, category: p.kind, image: { url: p.image.src, alt: p.image.alt }, allergens: p.allergens ?? [], publicNotes: p.note ?? "", active: true, sortOrder: 0, version: 1, updatedAt: null, legacyPriceCentavos: null, menuCategoryId: p.menuCategoryId ?? null, variants: p.variants ?? [], availableWeekdays: p.availableWeekdays ?? [], unavailableDates: p.unavailableDates ?? [], allowedAddonIds: p.allowedAddonIds ?? [] })) };
  const modeCatalog = orderingBranchCatalog(clientCatalog, branches, branch);
  const preparationStart = preparationStartDate(scheduleState.settings,branch,scheduleState.now);
  const availableDates = orderingDateOptions(scheduleState.settings,branch,modeCatalog,scheduleState.now,{intakeEnabled,openProducts:scheduleState.openProducts[branch],editingDate:editing?.date});
  const preorderDates = new Set(scheduleState.error ? [] : availableDates.filter(date=>date.preorderAvailable).map(date=>date.date));
  const drop = publicShop.experience?.drops?.find(item => item.branchId === branch);
  const dropClosed = !!drop && drop.state !== "open";
  const todayKey = manilaDate(scheduleState.now);
  useEffect(() => {
    if (dateTouched.current || editing || recovery || draftLoading) return;
    if (typeof window !== "undefined" && /^#(edit|reorder)=/.test(window.location.hash)) return;
    if (dropClosed || (drop && !drop.fulfillmentDates.includes(todayKey))) return;
    if (!availableDates.some((date) => date.date === todayKey)) return;
    setForm((current) => current.preferredDate ? current : { ...current, preferredDate: new Date(`${todayKey}T12:00:00`) });
  }, [availableDates, todayKey, editing, recovery, draftLoading, dropClosed, drop]);
  const selectedDate = form.preferredDate ? dayjs(form.preferredDate).format("YYYY-MM-DD") : "";
  const dateValue = selectedDate ? new Date(`${selectedDate}T12:00:00`) : undefined;
  const slots = dropClosed || drop && !drop.fulfillmentDates.includes(selectedDate) ? [] : availableDates.find((d) => d.date === selectedDate)?.slots ?? [];
  const selectedSlot = slots.find((slot) => slot.id === form.preferredTime);
  const dateInvalid = Boolean(selectedDate && !availableDates.some((d) => d.date === selectedDate));
  const selection: Selection = { ...selectedContent, date: selectedDate };
  const quote = quoteSelection(clientCatalog, { ...selection, date: selectedDate || manilaDate(scheduleState.now) }, manilaDate(scheduleState.now), {preparationStart:preparationStart});
  const selectedPackages = packages.filter(p => p.branchId === branch && p.date === selectedDate && (packageQuantities[p.id]||0)>0);
  const invalidPackages = Object.entries(packageQuantities).some(([id,quantity]) => { if(!quantity)return false; const p=selectedPackages.find(p=>p.id===id); return !publicShop.experience?.packageCheckoutEnabled||!p||p.unavailableReason||p.priceCentavos===null||p.availablePackages===null||quantity>p.availablePackages||p.maxPerOrder!==null&&quantity>p.maxPerOrder; });
  const packageSubtotal = selectedPackages.reduce((sum,p)=>sum+(p.priceCentavos??0)*(packageQuantities[p.id]||0),0);
  const subtotal = (quote.knownSubtotalCentavos + packageSubtotal) / 100;
  const hasUnpriced = quote.quoteRequired;
  const today = new Date(`${manilaDate(scheduleState.now)}T12:00:00`);
  const lastDate = new Date(`${addCalendarDays(manilaDate(scheduleState.now), scheduleState.settings.bookingHorizonDays)}T12:00:00`);
  const limit = shop.customerLimit?.per === "order" && shop.customerLimit.unit === "pies" ? shop.customerLimit.quantity : null;
  const unsupportedLimit = Boolean(shop.customerLimit?.quantity && (shop.customerLimit.per !== "order" || shop.customerLimit.unit !== "pies"));
  const atLimit = limit !== null && selectedCount >= limit;
  type ItemBlocker = { code: string; message: string };
  function itemBlockers(item: OrderItem): ItemBlocker[] {
    if (!availableHere(item)) return [{ code: "branch", message: `Not available at ${shop.name}. Remove this item or switch back.` }];
    if (!selectedDate) return [{ code: "date", message: "Choose a date to see availability." }];
    if (!scheduleState.settings.branches[branch]?.enabled) return [{ code: "paused", message: `Online ordering is paused at ${shop.name}.` }];
    const product = clientCatalog.products.find((p) => p.id === item.productId)!;
    const section = sections.find((entry) => entry.id === product.menuCategoryId);
    const blockers: ItemBlocker[] = [...availabilityStatus(product, item.variant, selectedDate, 0, manilaDate(scheduleState.now), { categoryWeekdays: section?.availableWeekdays, preorderLeadDays: publicShop.defaultPreorderLeadDays ?? 3, preparationStart: preparationStart }).blockers];
    // Refresh failures have their own retry state; do not report stale stock as sold out.
    if (!scheduleState.error && intakeEnabled && !scheduleState.openProducts[branch]?.[selectedDate]?.includes(item.productId) && !(editing?.date === selectedDate && editing.keys.includes(item.slug) && (form.quantities[item.slug] ?? 0) <= editing.quantities[item.slug])) blockers.push({ code: "sold_out", message: `Sold out on ${dayjs(selectedDate).format("ddd, MMM D")}.` });
    return blockers;
  }
  function itemReason(item: OrderItem) { return itemBlockers(item).map((blocker) => blocker.message).join(" ") || null; }
  function row(item: OrderItem) {
    const primary = itemBlockers(item)[0];
    const label = primary?.code === "weekday" ? "" : primary?.code === "date_exception" ? "Unavailable on this date" : primary?.message;
    return <FlavorRow key={item.slug} availabilityLabel={label} item={item} quantity={form.quantities[item.slug] ?? 0} onQuantityChange={n=>setQuantity(item.slug,n)} reason={itemReason(item)} atLimit={atLimit || Boolean(editing && !editing.keys.includes(item.slug))} />;
  }
  function groupedRows(list: OrderItem[], excluded = false) {
    return groupMenuRows(list, sections, publicShop.defaultPreorderLeadDays ?? 3).map(({section,sizes})=><section key={section.id} className={design.menuGroup}>
      <h3>{section.name}</h3>
      {sizes.map(size=><div key={size.key} className={design.sizeGroup}>
        <div className={design.sizeHeading}><h4>{size.label}</h4>{size.note && <p>{size.note}</p>}</div>
        {excluded && <button type="button" className={design.chooseDate} onClick={()=>goToStep(0)}>Choose another date</button>}
        {size.items.map(item=>row(item))}
      </div>)}
    </section>);
  }
  const availableItems = visibleItems.filter(item=>!itemReason(item));
  const needsAttention = selectedItems.filter(item=>Boolean(itemReason(item)));
  const excludedItems = visibleItems.filter(item=>Boolean(itemReason(item)) && !(form.quantities[item.slug]>0));
  function addonReason(addon: Addon) { return !selectedDate ? "Choose a date first." : (Date.parse(selectedDate) - Date.parse(selectedItems.some(item=>variantOrderMode(item.variant)==="preorder") ? preparationStart : manilaDate(scheduleState.now))) / 86400000 < addon.minLeadDays ? `Needs ${addon.minLeadDays} days preparation. Choose a later date to add this extra.` : null; }
  function changeDate(date: Date | undefined, confirmed = false) {
    if (selectedCount && date && dayjs(date).format("YYYY-MM-DD") !== selectedDate && !confirmed) { setCalendarOpen(false); setPendingChange({ kind: "date", date }); return; }
    dateTouched.current = true;
    setForm((current) => ({ ...current, preferredDate: date, preferredTime: "" }));
    setError(null); if (date) setCalendarOpen(false);
  }
  const dateLabel = dateValue
    ? dayjs(dateValue).format("ddd, MMM D")
    : "Pick a date";
  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function setQuantity(slug: string, next: number) {
    const item = menuItems.find((item) => item.slug === slug);
    if (next > (form.quantities[slug] ?? 0) && (Boolean(editing && !editing.keys.includes(slug)) || atLimit || !item || itemReason(item))) return;
    setForm((current) => ({
      ...current,
      quantities: { ...current.quantities, [slug]: next },
    }));
    setError(null);
  }

  function toggleAddon(id: string) {
    setForm((current) => {
      const selected = current.selectedAddons.includes(id)
        ? current.selectedAddons.filter((item) => item !== id)
        : [...current.selectedAddons, id];
      return { ...current, selectedAddons: selected };
    });
  }

  function orderNotes(id: string) {
    return <div className={design.orderNotes}><Label htmlFor={id}>Notes (optional)</Label><Textarea id={id} name="notes" form="pie-order" rows={2} disabled={checking || draftLoading || draftFailed} readOnly={Boolean(editing)} value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Allergies, packing notes, or anything else" /></div>;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (checking) return;
    if (!priceAcknowledged) { setError("Please acknowledge the updated prices before submitting."); return; }
    if (removedSelections.length) { setError("Some selected sizes are no longer available. Remove them before continuing."); return; }
    if (branchUnavailable) { setError("This branch is no longer available for new orders. Choose another visible branch; your selections are kept."); return; }
    if (dropClosed) { setError("Ordering is not open for this branch drop. Your lineup is preserved."); return; }

    if (unavailableItems.length || pendingUnavailable.length) { setError("Remove unavailable items or switch branches before continuing."); return; }

    if (!editing) {
      const phone = phoneNumberError(form.contact);
      setContactError(phone);
      if (!form.name.trim() || phone) {
        setError(!form.name.trim() && !form.contact.trim() ? "Please fill in your name and contact number." : phone ?? "Please fill in your name.");
        document.getElementById(!form.name.trim() ? "name" : "contact")?.focus();
        return;
      }
    }

    if (!selectedDate || !selectedSlot || scheduleState.error) {
      setError("Please pick a preferred date and time.");
      return;
    }

    if (selectedCount < 1) {
      setError("Please add at least one flavor.");
      return;
    }

    if (invalidPackages) { setError("A selected package is unavailable for this branch/date or exceeds its limit. Adjust your package selection."); return; }
    if (unsupportedLimit) { setError("Please contact us to arrange an order for this branch’s limit."); return; }
    if (limit !== null && selectedCount > limit) { setError(`This branch allows up to ${limit} pies per order.`); return; }
    if (quote.errors.length || selectedItems.some(itemReason)) { setError([...quote.errors, ...selectedItems.map(itemReason).filter(Boolean)].join(" ")); return; }
    if (form.delivery === "lalamove" && form.address.trim().length < 5) { setError("Add your delivery address."); return; }
    const message = formatInstagramOrder({
      name: form.name.trim(),
      phone: form.contact.trim(),
      branch: shop.name,
      when: formatPreferredWhen(dateValue, selectedSlot.label),
      fulfillment: form.delivery === "lalamove" ? "delivery" : "pickup",
      pickupAddress: shop.address,
      deliveryAddress: form.address.trim(),
      deliveryFeePayment: form.deliveryFeePayment,
      payment: paymentMethods.find((method) => method.id === form.payment)?.label ?? form.payment,
      pies: selectedItems.map((item) => ({
        quantity: form.quantities[item.slug],
        name: item.name,
        price: item.price == null ? "To confirm" : formatPrice(item.price * form.quantities[item.slug]),
        extras: (form.lineAddons[item.slug] ?? []).map((id) => {
          const addon = catalogAddons.find((entry) => entry.id === id);
          return { name: addon?.name ?? "Extra", price: addon ? formatPrice(addon.priceCentavos / 100) : "To confirm", message: form.lineMessages[item.slug]?.[id] };
        }),
      })),
      orderExtras: chosenAddons.map((addon) => ({ name: addon.name, price: formatPrice(addon.priceCentavos / 100), message: form.addonMessages[addon.id] })),
      packages: selectedPackages.map((pack) => ({ quantity: packageQuantities[pack.id] || 0, name: pack.name, price: pack.priceCentavos === null ? "To confirm" : formatPrice(pack.priceCentavos / 100 * (packageQuantities[pack.id] || 0)) })),
      notes: form.notes.trim(),
      subtotal: formatPrice(subtotal),
      unpriced: hasUnpriced,
    });
    setChecking(true);
    setCopiedOrder(false);
    setManualCopy("");
    try {
      await navigator.clipboard.writeText(message);
      setCopiedOrder(true);
      submittedDraft.current = true;
      try { sessionStorage.removeItem(unifiedDraftKey); } catch { /* The message is already copied. */ }
      openInstagram(publicShop.links.instagramDm || publicShop.links.instagram);
    } catch {
      setManualCopy(message);
    } finally {
      setChecking(false);
    }
  }

  const missingExtras = [...form.selectedAddons,...Object.values(form.lineAddons).flat()].filter(id=>!catalogAddons.some(addon=>addon.id===id && addon.active));
  function removeMissingExtras() {
    const keep = (id:string)=>catalogAddons.some(addon=>addon.id===id && addon.active);
    setForm(current=>({...current,selectedAddons:current.selectedAddons.filter(keep),lineAddons:Object.fromEntries(Object.entries(current.lineAddons).map(([key,ids])=>[key,ids.filter(keep)]))}));
  }
  function currentDraftPrices() {
    return Object.fromEntries([
      ...menuItems.map(item=>[item.slug,`${item.variant.pricingMode}:${item.variant.priceCentavos}`]),
      ...catalogAddons.map(addon=>[`addon:${addon.id}`,String(addon.priceCentavos)]),
      ...packages.map(pack=>[`package:${pack.id}`,String(pack.priceCentavos)]),
    ]);
  }
  function saveBrowsingDraft() {
    if (submittedDraft.current || draftReadyMode !== mode || editing || recovery || draftLoading || window.location.hash) return;
    try { sessionStorage.setItem(unifiedDraftKey,JSON.stringify({version:2,branch,date:selectedDate,slot:form.preferredTime,quantities:form.quantities,packages:packageQuantities,selectedAddons:form.selectedAddons,addonMessages:form.addonMessages,lineAddons:form.lineAddons,lineMessages:form.lineMessages,prices:priceAcknowledged && !draftPricesPending.current ? currentDraftPrices() : {...currentDraftPrices(),...draftPriceBaseline.current}})); } catch { /* Storage can be unavailable; ordering continues in memory. */ }
  }
  useEffect(()=>{
    let disposed = false;
    queueMicrotask(()=>{
    if (disposed) return;
    if (window.location.hash) { setDraftReadyMode(mode); return; }
    let saved: UnifiedDraft | null = null;
    try {
      const preferred = new URLSearchParams(window.location.search).get("legacyDraft")==="preorder" ? "preorder" : "regular";
      saved=loadUnifiedDraft(sessionStorage,preferred);
    } catch { /* Ignore malformed or blocked storage. */ }
    draftPriceBaseline.current = saved?.prices ?? {};
    const candidateBranch = saved?.branch || initialBranch;
    const nextBranch = publicBranches.some(entry=>entry.id===candidateBranch) ? candidateBranch as BranchId : initialBranch;
    const catalog = orderingBranchCatalog(clientCatalog,branches,nextBranch);
    const nextDates = orderingDateOptions(scheduleState.settings,nextBranch,catalog,scheduleState.now,{intakeEnabled,openProducts:scheduleState.openProducts[nextBranch]});
    const savedDate = saved?.date;
    const candidateDate = savedDate && nextDates.some(date=>date.date===savedDate) ? savedDate : savedDate ?? "";
    const validDate = candidateDate && nextDates.some(date=>date.date===candidateDate) ? candidateDate : "";
    if(saved) {
      dateTouched.current=true;
      setBranch(nextBranch);
      // Keep stale selections visible for recovery; current validators block ordering them.
      const quantities = {...(saved?.quantities ?? {})};
      setForm(current=>({...current,preferredDate:validDate?new Date(`${validDate}T12:00:00`):undefined,preferredTime:validDate && nextDates.find(date=>date.date===validDate)?.slots.some(slot=>slot.id===saved?.slot)?saved?.slot ?? "":"",quantities,selectedAddons:saved?.selectedAddons ?? [],addonMessages:saved?.addonMessages ?? {},lineAddons:saved?.lineAddons ?? {},lineMessages:saved?.lineMessages ?? {}}));
      setPackageQuantities(saved?.packages ?? {});
      const prices=currentDraftPrices();
      const changed=Object.keys(saved?.prices ?? {}).filter(key=>{
        const selected=key.startsWith("addon:") ? (saved?.selectedAddons.includes(key.slice(6)) || Object.values(saved?.lineAddons ?? {}).some(ids=>ids.includes(key.slice(6)))) : key.startsWith("package:") ? (saved?.packages[key.slice(8)] ?? 0)>0 : (quantities[key] ?? 0)>0;
        return selected && prices[key] !== undefined && saved!.prices[key] !== prices[key];
      });
      if(changed.length){draftPricesPending.current=true;setPriceNotice(changed.map(key=>menuItems.find(item=>item.slug===key)?.name ?? "Selected item"));setPriceAcknowledged(false);}
      if(validDate) setStep(1);
      else {setStep(0);setDraftDateNotice(saved.needsDateSelection ? "Your saved selections used different branches or dates. Choose a branch and date for your combined order. All selected pies have been kept." : "Choose an available date for your saved selection. All selected pies have been kept.");}
    }
    setDraftReadyMode(mode);
    });
    return ()=>{disposed=true;};
    // Restore once per route mode; refreshed data must validate the draft, not replace user edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[mode]);
  useEffect(()=>{ saveBrowsingDraft(); });

  return (
    <div className={`order-page wrap ${design.page}`}>
      <header className="order-intro">
        <div>
          <p className="eyebrow">A LITTLE HAPPINESS, COMING YOUR WAY</p>
          <h1>
            Let’s put together
            <br />
            your <span>box of happy.</span>
          </h1>
          <p>
            Choose your branch and date, then pick your pies.
             We’ll confirm the details together in chat.
          </p>
        </div>
        <Image
          src="/brand/seal.png"
          alt="Makalipie Tarts & Pies"
          width={145}
          height={145}
        />
      </header>
      <div ref={stepsSlot} className={design.stepsSlot} style={stepsPin ? { minHeight: stepsPin.height } : undefined}>
      <nav ref={stepsBar} className={stepsPin ? `${design.steps} ${design.stepsPinned}` : design.steps} style={stepsPin ? { top: stepsPin.top } : undefined} aria-label="Order steps">
        {["Branch & date", "Pick your pies", "Your details"].map((label, index) => <button key={label} type="button" aria-current={step === index ? "step" : undefined} disabled={checking || (index > 0 && (!selectedDate || dateInvalid || branchUnavailable || dropClosed)) || (index > 1 && selectedCount < 1)} onClick={() => goToStep(index)}><span className={design.stepIndex}>{index < step ? <Check size={17} aria-hidden /> : index + 1}</span><span className={design.stepLabel}>{label}</span></button>)}
      </nav>
      </div>
      <div className="mb-5 space-y-3">
        {branchUnavailable&&<p role="alert">This branch is no longer available for new orders. Select another branch; your lineup is preserved.</p>}
        <DropNotice branchId={branch}/>
        {!priceAcknowledged && <div role="alert" className="rounded-xl bg-butter p-4"><p>Prices changed for {Array.from(new Set(priceNotice)).join(", ")}. Your total now uses current prices.</p><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={priceAcknowledged} onChange={e => { draftPricesPending.current = !e.target.checked; setPriceAcknowledged(e.target.checked); }}/>I acknowledge the updated prices.</label></div>}
        {removedSelections.map(([key, quantity]) => <div key={key} role="alert" className="rounded-xl border p-4">A selected size ({key}) × {quantity} is no longer available. <button type="button" className="min-h-11 underline" onClick={() => update("quantities", {...form.quantities,[key]:0})}>Remove unavailable size</button></div>)}
      </div>
      {unsupportedLimit && <p role="status">This branch’s ordering limit needs a chat with us. Contact <ChatLinks /> before you copy your order.</p>}
      {draftFailed && <p role="alert">Your saved order could not be loaded. Reload to try again, or return to your private order link.</p>}
      {recovery ? (
        <section className="mb-6 max-w-xl space-y-2" aria-label={`Reorder ${recovery.orderNumber}`}>
          <p className="text-sm font-medium">{editing ? "Editing" : "Reordering"} {recovery.orderNumber}</p>
          {editing && <p className="text-sm">You can change existing pie quantities, the date, and time. Your original hold deadline stays the same. For other changes, contact <ChatLinks />. <a className="underline" href={`/order/status#${editing.token}`}>Return without saving</a>.</p>}
          {recovery.priceChanges.map((change) => <p key={change.from} className="text-sm text-charcoal/70">{change.from} is now {change.to}</p>)}
          {pendingUnavailable.map((line) => (
            <div key={`${line.productId}:${line.variantId}`} className="flex flex-wrap items-center gap-2">
              <p className="text-sm">{line.label} is no longer on the menu.</p>
              <Button type="button" variant="link" className="h-11 px-0" onClick={() => setDismissedLines((current) => [...current, `${line.productId}:${line.variantId}`])}>Remove</Button>
            </div>
          ))}
        </section>
      ) : null}
      <div className="order-layout">
        <div>
          <form id="pie-order" noValidate onSubmit={(event) => { if (step !== 2) { event.preventDefault(); return; } if (!event.currentTarget.reportValidity()) { event.preventDefault(); return; } void handleSubmit(event); }} onInvalidCapture={(event) => { const target = event.target as HTMLElement; const targetStep = Number(target.closest("[data-order-step]")?.getAttribute("data-order-step") ?? 2); if (step !== targetStep) { setStep(targetStep); requestAnimationFrame(() => target.focus()); } }} className="order-form">
            {draftDateNotice && step === 0 && <p role="status" className={design.draftDateNotice}>{draftDateNotice}</p>}

            <div className={design.sectionHeading}><p className="eyebrow">STEP {step + 1} OF 3</p><h2 ref={stepHeading} tabIndex={-1}>{["First, where and when?", "A few for you. A few to share.", "The last little details."][step]}</h2><p>{["Every branch and date has its own lineup. Let’s find yours.", "Choose your favourites, then make your box a little more personal.", "Tell us who it’s for and how you’d like to receive it."][step]}</p></div>
            {step > 0 && <div className={design.selectionContext}><span><MapPin size={15} aria-hidden />{shop.name}</span><span><CalendarDays size={15} aria-hidden />{dateLabel}</span><button type="button" disabled={checking} onClick={() => goToStep(0)}>Change date</button></div>}
            <fieldset disabled={checking || draftLoading || draftFailed} className="contents">
            {draftLoading && <p role="status">Loading your order…</p>}
              <legend className="sr-only">Your order</legend>
            <div hidden={step !== 0} data-order-step="0" className={design.stepContent}>
      <section className="space-y-2" aria-label="Branch">
        {publicBranches.length > 1 ? (
          <>
            <Label htmlFor="order-branch">Ordering from</Label>
            <NativeSelect
              id="order-branch"
              className="h-12 rounded-xl border-charcoal/20 bg-cream text-base"
              disabled={checking || Boolean(editing) || draftLoading}
              value={branch}
              onChange={(e) => changeBranch(e.target.value as BranchId)}
            >
              {publicBranches.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </NativeSelect>

          </>
        ) : (
          <>
            <p className="text-sm font-medium">Ordering from</p>
            <p className="text-base">{shop.name}</p>

          </>
        )}
      </section>
            {!scheduleState.settings.branches[branch]?.enabled && <Alert role="status" className="bg-butter/60"><AlertDescription>Orders are currently closed at {shop.name}. This branch remains available for future drops. <DropNotice branchId={branch} />{!drop && <span>Next drop to be announced. Follow us on <ChatLinks />.</span>}</AlertDescription></Alert>}
            {modeCatalog.products.some(product=>product.variants.some(variant=>variantOrderMode(variant)==="preorder")) && <p className={design.preparationNotice}>Preparation starts from {dayjs(`${preparationStart}T12:00:00`).format("ddd, MMM D")}, the next date with an orderable branch time slot. Add the preparation days shown for each size.</p>}
            <section aria-label="Choose fulfillment date" className={design.dateSection}>              <div className="space-y-3">

                {quote.preparationDays > 0 ? <p className="text-sm text-charcoal/65">Selected extras or sizes need {quote.preparationDays} days of preparation. Choose an eligible date or remove the affected item.</p> : null}
                {scheduleState.error && (
                  <Alert className="border-berry/40 bg-transparent text-berry">
                    <AlertDescription className="text-berry">{scheduleState.error}</AlertDescription>
                  </Alert>
                )}

                {!availableDates.length && (
                  <Alert role="status" className="border-transparent bg-butter/60 text-charcoal">
                    <AlertDescription className="text-charcoal">
                      {intakeEnabled
                        ? "No online dates are currently available. Your items are still here."
                        : "No online dates are currently available for this branch and selection. Your items are still here; try another branch or adjust your selection."}
                    </AlertDescription>
                  </Alert>
                )}
                {availableDates.length > 0 && !availableDates.some((d) => d.date === manilaDate(scheduleState.now)) && (
                  <Alert role="status" className="border-transparent bg-transparent text-charcoal">
                    <AlertDescription className="text-charcoal">
                      Today is unavailable for this selection. Earliest available: {dayjs(`${availableDates[0].date}T12:00:00`).format("ddd, MMM D")}.
                    </AlertDescription>
                  </Alert>
                )}
                {dateInvalid && (
                  <Alert className="border-berry/40 bg-transparent text-berry">
                    <AlertDescription className="text-berry">
                      Your selected date is no longer available. Please choose another date; your items have been kept.
                    </AlertDescription>
                  </Alert>
                )}
                <Label htmlFor="preferred-date">When would you like your pies?</Label>
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger
                    id="preferred-date"
                    type="button"
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "h-11 w-full justify-start rounded-xl border-charcoal/15 bg-cream px-3 text-base font-medium md:text-sm",
                    )}
                  >
                    <CalendarDays className="size-4 text-charcoal/60" />
                    <span
                      className={
                        dateValue
                          ? "text-charcoal"
                          : "text-charcoal/45"
                      }
                    >
                      {dateLabel}
                    </span>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className={design.calendarPopover}
                  >
                    <Calendar
                      className={design.calendar}
                      mode="single"
                      modifiers={{ preorderAvailable: date=>preorderDates.has(dayjs(date).format("YYYY-MM-DD")) }}
                      modifiersClassNames={{ preorderAvailable: design.preorderCalendarDay }}
                      labels={{ labelDayButton: (date,modifiers)=>`${dayjs(date).format("dddd, MMMM D, YYYY")}${modifiers.today ? ", today" : ""}${modifiers.selected ? ", selected" : ""}${preorderDates.has(dayjs(date).format("YYYY-MM-DD")) ? ", pre-order sizes available" : ""}` }}
                      selected={dateValue}
                      onSelect={(date) => changeDate(date)}
                      disabled={(date) => !availableDates.some((d) => d.date === dayjs(date).format("YYYY-MM-DD"))}
                      startMonth={today}
                      endMonth={lastDate}
                      defaultMonth={dateValue ?? today}
                    />
                    <p className={design.calendarLegend}><span aria-hidden="true" />Pre-order sizes available</p>
                  </PopoverContent>
                </Popover>
                <p className="text-sm text-charcoal/65">Choose up to {scheduleState.settings.bookingHorizonDays} days ahead. All times are in Manila time.</p>
                <Button type="button" variant="link" className="h-11 px-0 text-charcoal" onClick={scheduleState.refresh}>
                  Refresh available dates
                </Button>
              </div>
</section>
            </div>
            <div hidden={step !== 1} data-order-step="1" className={design.stepContent}>
            {missingExtras.length > 0 && <Alert role="alert"><AlertDescription>Some saved extras are no longer available. <button type="button" className={design.retryAvailability} onClick={removeMissingExtras}>Remove unavailable extras</button></AlertDescription></Alert>}

            {scheduleState.error && <Alert role="alert"><AlertDescription>{scheduleState.error} <button type="button" className={design.retryAvailability} onClick={scheduleState.refresh}>Retry availability</button></AlertDescription></Alert>}
            <fieldset className="space-y-3">
              <legend className="sr-only">Pick your pies</legend>
              <p className={cn("text-xs text-charcoal/55", design.selectionHelp)}>
                Choose the pies you’d like for your selected date.
              </p>
              {visibleItems.length === 0 && (
                <Alert role="status" className="border-transparent bg-butter/60 text-charcoal">
                  <AlertDescription className="text-charcoal">
                    No pies are currently available at {shop.name}. {publicBranches.length > 1 ? "Choose another main branch or contact us." : "Contact us."}
                  </AlertDescription>
                </Alert>
              )}
              {needsAttention.length > 0 && (
                <section aria-label="Your selection needs attention" className="space-y-3">
                  <Alert className="border-berry/40 bg-transparent text-berry">
                    <AlertDescription className="text-berry">
                      Your selection needs attention. Reduce or remove unavailable pies, or choose another date.
                    </AlertDescription>
                  </Alert>
                  {groupedRows(needsAttention)}
                  {needsAttention.map((item) => (
                    <div key={item.slug}>
                      <Button type="button" variant="link" className="h-11 px-3 text-charcoal" onClick={() => setQuantity(item.slug, 0)}>
                        Remove {item.name}
                      </Button>
                    </div>
                  ))}
                </section>
              )}
              {limit !== null && <p className="text-sm">Up to {limit} pies per order at {shop.name}.{atLimit && " That’s the limit for this branch."}</p>}
              {!selectedDate ? <p className="rounded-xl bg-butter/60 p-4">Choose a date above to see which pies you can order.</p> : <>
                <div aria-label="Available pies">{availableItems.length ? groupedRows(availableItems) : <p>No pies are available for this date and order type. Choose another date or browse the other sizes below.</p>}</div>
                {excludedItems.length > 0 && <details key={`${branch}:${selectedDate}:${mode}`} className={design.unavailableSection}>
                  <summary>Not available for this date <span className={design.availabilityCount}>({excludedItems.length})</span></summary>
                  <p className={design.excludedHelp}>Choose another date to see when these pies are available.</p>
                  {groupedRows(excludedItems,true)}
                </details>}
              </>}
              {!!selectedDate && quote.errors.length > 0 && (
                <Alert role="status" className="border-berry/40 bg-transparent text-berry">
                  <AlertDescription className="text-berry">{quote.errors.join(" ")}</AlertDescription>
                </Alert>
              )}

            </fieldset>

            <PackageChoices packages={packages} branchId={branch} date={selectedDate} quantities={packageQuantities} enabled={!!publicShop.experience?.packageCheckoutEnabled && !editing && !checking} remainingPies={limit===null?null:Math.max(0,limit-selectedCount)} onChange={(id,quantity)=>setPackageQuantities(current=>({...current,[id]:quantity}))}/>
            {invalidPackages && <div role="alert" className="rounded-xl bg-butter p-4">A selected package needs attention. Your selection is preserved. {Object.entries(packageQuantities).filter(([,q])=>q>0).map(([id,q])=><p key={id}>{packages.find(p=>p.id===id)?.name||'Unavailable package'} × {q} <button type="button" className="min-h-11 underline" onClick={()=>setPackageQuantities(current=>({...current,[id]:0}))}>Remove</button></p>)}</div>}
            {catalogAddons.some(a => a.active && a.scope === "per_order") && <fieldset disabled={Boolean(editing)} className="space-y-3">
              <legend className="text-sm font-medium">
                Make it a little personal
              </legend>
              <p className="text-xs text-charcoal/60">Add a finishing touch, if you like. Preparation times are shown with each extra.</p>
              <CatalogAddonOptions addons={catalogAddons.filter((a) => a.active && a.scope === "per_order")} selected={form.selectedAddons} messages={form.addonMessages} prefix="order-extra" unavailableReason={addonReason} toggle={toggleAddon} message={(id, value) => update("addonMessages", { ...form.addonMessages, [id]: value })} />
            </fieldset>}

            {catalogAddons.some(a => a.active && a.scope === "per_item") && <fieldset disabled={Boolean(editing)} className="space-y-3"><legend className="font-medium">Extras for individual pies</legend>
              {selectedItems.length === 0 ? <CatalogAddonOptions addons={catalogAddons.filter((a) => a.active && a.scope === "per_item")} selected={[]} messages={{}} prefix="unselected-pie" unavailableReason={() => "Choose a pie line to add this extra."} toggle={() => {}} message={() => {}} /> : selectedItems.map((item) => <div key={item.slug} className="space-y-3"><h3 className="text-sm font-semibold">For {item.name} ×{form.quantities[item.slug]}</h3><CatalogAddonOptions addons={catalogAddons.filter((a) => a.active && a.scope === "per_item")} quantity={form.quantities[item.slug]} prefix={item.slug} selected={form.lineAddons[item.slug] ?? []} messages={form.lineMessages[item.slug] ?? {}} unavailableReason={addonReason} toggle={(id) => { const current = form.lineAddons[item.slug] ?? []; update("lineAddons", { ...form.lineAddons, [item.slug]: current.includes(id) ? current.filter((x) => x !== id) : [...current, id] }); }} message={(id,value) => update("lineMessages", { ...form.lineMessages, [item.slug]: { ...form.lineMessages[item.slug], [id]: value } })} /></div>)}
            </fieldset>}
            </div>
            <div hidden={step !== 2} data-order-step="2" className={design.stepContent}>
            <fieldset className="order-details-fields space-y-5">
              <legend>Your contact details</legend>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    readOnly={Boolean(editing)}
                    name="name"
                    required
                    value={form.name}
                    onChange={(event) => update("name", event.target.value)}
                    className="h-11 rounded-xl bg-cream px-3"
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact">Contact Number</Label>
                  <Input
                    id="contact"
                    readOnly={Boolean(editing)}
                    type="tel"
                    name="contact"
                    required
                    inputMode="tel"
                    autoComplete="tel"
                    aria-invalid={contactError ? true : undefined}
                    aria-describedby={contactError ? "contact-error" : "contact-hint"}
                    value={form.contact}
                    onChange={(event) => {
                      update("contact", event.target.value);
                      setContactError((current) => current ? phoneNumberError(event.target.value) : null);
                    }}
                    onBlur={(event) => { if (!editing) setContactError(phoneNumberError(event.currentTarget.value)); }}
                    className="h-11 rounded-xl bg-cream px-3"
                  />
                  {contactError ? <p id="contact-error" className="text-sm text-berry">{contactError}</p> : <p id="contact-hint" className="text-sm text-charcoal/65">Start with 0 or 9, or a country code such as +63.</p>}
                </div>
              </div>


              <div className="space-y-3">
                <p className="text-sm font-medium" id="time-slots-label">Preferred time slot</p>
                {form.preferredTime && !selectedSlot && (
                  <Alert className="border-berry/40 bg-transparent text-berry">
                    <AlertDescription className="text-berry">Your selected time is no longer available. Please choose a new slot.</AlertDescription>
                  </Alert>
                )}
                {!slots.length && <p className="text-sm text-charcoal/65">Choose an available date to see one-hour slots.</p>}
                <div className={design.timeSlots} role="group" aria-labelledby="time-slots-label">
                  {slots.map((slot) => {
                    const active = form.preferredTime === slot.id;
                    return (
                      <Button
                        key={slot.id}
                        type="button"
                        variant="outline"
                        onClick={() => { setForm((current) => ({ ...current, preferredDate: dateValue, preferredTime: slot.id })); setError(null); }}
                        className={cn("pressable", design.timeSlot, active && design.timeSlotOn)}
                        aria-pressed={active}
                      >
                        {slot.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </fieldset>
            <fieldset disabled={Boolean(editing)} className="space-y-3"><legend className="font-medium">Pickup or delivery</legend>
              {shop.pickupEnabled && shop.deliveryEnabled && <RadioGroup value={form.delivery} onValueChange={(value) => update("delivery", value as "pickup" | "lalamove")}>
                <Label><RadioGroupItem value="pickup" /><Store size={18} aria-hidden />Pickup</Label>
                <Label><RadioGroupItem value="lalamove" /><Truck size={18} aria-hidden />Delivery</Label>
              </RadioGroup>}
              {form.delivery === "pickup" ? <PickupAddress name={shop.name} address={shop.address} hoursLabel={shop.hoursLabel} mapUrl={shop.mapUrl} /> : <div className="space-y-3 rounded-xl bg-butter/60 p-4"><Label htmlFor="delivery-address" className="gap-2"><Truck size={16} aria-hidden />Delivery address</Label><Textarea id="delivery-address" required minLength={5} maxLength={300} autoComplete="street-address" value={form.address} onChange={(e) => update("address", e.target.value)} /><p className="text-sm">We book the rider and confirm the delivery fee in chat. Pay it with your total or directly to the rider.</p><label className="block">Delivery fee payment<select className="mt-2 min-h-11 w-full rounded-lg border p-3" value={form.deliveryFeePayment} onChange={e => update("deliveryFeePayment", e.target.value as FormState["deliveryFeePayment"])}><option value="with_total">Include in my bakery payment</option><option value="to_driver">Pay the rider directly</option></select></label><p className="text-sm">{form.deliveryFeePayment === "with_total" ? "We'll confirm the delivery fee in chat. If you include it with the bakery payment, wait for that total before paying." : "Pay the delivery fee directly to the rider. We'll tell you in chat if the pies need to be paid in full before we start baking."}</p></div>}
            </fieldset>

            <fieldset disabled={Boolean(editing)} className="space-y-3">
              <legend className="text-sm font-medium">
                Your payment preference
              </legend>
              <p className="text-xs text-charcoal/55">
                GCash or bank transfer. We send payment details in chat, never on this page. Big orders are paid in full before we start baking. Other orders can pay later. We will say which applies.
              </p>
              <RadioGroup
                name="payment"
                value={form.payment}
                disabled={checking}
                onValueChange={(value) => update("payment", value)}
                className="gap-3"
              >
                {paymentMethods.filter((method) => method.id !== "cash").map((method) => {
                  const PaymentIcon: LucideIcon = method.id === "bank" ? Landmark : Wallet;
                  return (
                  <Label key={method.id}>
                    <RadioGroupItem value={method.id} />
                    <PaymentIcon size={18} aria-hidden />
                    <span>{method.label}</span>
                  </Label>
                  );
                })}
              </RadioGroup>
            </fieldset>

            <p className="order-submit-note">Our kitchen also handles nuts and gluten, so cross-contact is possible.</p>
            <p className="order-submit-note">Once a third-party courier picks up your order, we’re no longer responsible for how or when it arrives.</p>
            {error ? (
              <Alert role="alert" className="border-berry/40 bg-transparent text-berry">
                <AlertDescription className="font-medium text-berry">{error}</AlertDescription>
              </Alert>
            ) : null}

            {!selectedSlot && <p className={design.continueHelp}>Choose a preferred time slot above before copying your order.</p>}
            <Button
              type="submit"
              disabled={branchUnavailable || invalidPackages || checking || !priceAcknowledged || removedSelections.length > 0 || dropClosed || selectedCount < 1 || selectedItems.some(itemReason) || quote.errors.length > 0 || unavailableItems.length > 0 || pendingUnavailable.length > 0 || (visibleItems.length === 0 && selectedPackageCount === 0) || !selectedSlot || dateInvalid || Boolean(scheduleState.error)}
              className="order-submit brand-button"
            >
              {checking ? "Copying your order…" : "Copy order & open Instagram"}{" "}
              <ArrowUpRight size={18} aria-hidden />
            </Button>
            {copiedOrder && <p role="status" className="order-submit-note">Copied. Paste it into the Instagram chat. Sending it does not confirm the order.</p>}
            {manualCopy && <div className="space-y-2"><label htmlFor="order-copy" className="text-sm">Select the order and copy it, then paste it into Instagram.</label><Textarea id="order-copy" readOnly value={manualCopy} rows={8} /><a href={publicShop.links.instagramDm || publicShop.links.instagram} target="_blank" rel="noreferrer">Open Instagram <ArrowUpRight size={15} aria-hidden /></a></div>}
            <p className="order-submit-note">
              Copying this request does not reserve the pies. We confirm it on {channels}. Payment details are sent in that chat, never on this page. No payment is taken here.{" "}
              <Link href="/terms">Terms</Link>, <Link href="/privacy">Privacy</Link>, and{" "}
              <Link href="/refund">Refund policy</Link>.
            </p>
            </div>
            </fieldset>
            {step === 0 && (!selectedDate || dateInvalid || dropClosed) && <p className={design.continueHelp}>Choose an available date for this branch to see its pies.</p>}
            {step === 1 && selectedCount === 0 && <p className={design.continueHelp}>Add at least one pie or available package to continue.</p>}
            {step === 1 && selectedCount > 0 && (invalidPackages || quote.errors.length > 0 || selectedItems.some(itemReason) || unavailableItems.length > 0) && <p role="status" className={design.continueHelp}>Your lineup needs attention. Adjust the unavailable items above, or go back to choose another date.</p>}
            <div className={design.actions}>
              {step > 0 && <Button type="button" variant="ghost" disabled={checking} onClick={() => goToStep(step - 1)}><ArrowLeft size={17} aria-hidden />Back</Button>}
              {step < 2 && <Button type="button" className="brand-button" disabled={checking || draftLoading || draftFailed || !selectedDate || dateInvalid || branchUnavailable || dropClosed || Boolean(scheduleState.error) || (step === 1 && (Boolean(scheduleState.error) || selectedCount < 1 || invalidPackages || quote.errors.length > 0 || selectedItems.some(itemReason) || unavailableItems.length > 0))} onClick={() => goToStep(step + 1)}>{step === 0 ? "Choose your pies" : "Continue to your details"}<ArrowRight size={18} aria-hidden /></Button>}
            </div>
            {step === 0 && <div className={design.explainer}><CalendarDays size={21} aria-hidden /><div><strong>Every day has its own lineup.</strong><p>Some pies are baked on selected days. Others need more preparation time. Choose a date to see its available sizes.</p></div></div>}
          </form>
        </div>

        <aside className="order-summary" aria-label="Your order summary">
          <div className={design.context}><MapPin size={16} aria-hidden /><span>{shop.name}</span><button type="button" onClick={() => goToStep(0)}>Change</button></div>
          {selectedDate && <p className={design.summaryDate}><CalendarDays size={16} aria-hidden />{dateLabel}</p>}
          <div className="order-summary-heading">
            <p className="eyebrow">A BOX TO LOOK FORWARD TO</p>
            <h2>Your box of happy.</h2>
            <p>
              {selectedCount === 0
                ? "Your favourites will appear here."
                : `${selectedCount} ${selectedCount === 1 ? "pie" : "pies"} picked. Good choices.`}
            </p>
          </div>
          {selectedCount === 0 ? (
            <div className="order-empty">
              <Image
                src="/images/brand/gift.webp"
                alt="An assortment of Makalipie tarts in a gift box"
                width={700}
                height={500}
              />
              <p>
                A tart for Tuesday.
                <br />A box for the whole table.
              </p>
            </div>
          ) : (
            <ul className="order-summary-lines">
              {selectedItems.map((item) => (
                <li key={item.slug}>
                  <span>
                    {form.quantities[item.slug]} × {item.name}
                  </span>
                  <span>
                    {item.price == null
                      ? "To confirm"
                      : formatPrice(item.price * form.quantities[item.slug])}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {selection.lines.some((line) => line.addons.length) && <p className="order-total-note">Selected per-pie extras are included in the known subtotal.</p>}
          {chosenAddons.length > 0 && (
            <ul className="order-summary-lines order-summary-addons">
              {chosenAddons.map((addon) => (
                <li key={addon.id}>
                  <span>{addon.name}</span>
                  <span>{formatPrice(addon.priceCentavos / 100)}</span>
                </li>
              ))}
            </ul>
          )}
          {selectedPackages.map(p=><p key={p.id}>{packageQuantities[p.id]} × {p.name} · fixed box of 4 pies · {p.priceCentavos===null?'Price pending':formatPrice(p.priceCentavos/100*(packageQuantities[p.id]||0))}</p>)}

          <div className="order-subtotal">
            <span>Known subtotal</span>
            <strong>{formatPrice(subtotal)}</strong>
          </div>
          <p className="order-total-note">
            {hasUnpriced
              ? "Quoted sizes will be priced after confirmation. "
              : ""}
            Staff confirm the final total in chat.
          </p>
          {orderNotes("desktop-order-notes")}
          <div className="order-summary-logistics">
            <span className={design.logisticsLine}>
              {form.delivery === "lalamove" ? <Truck size={16} aria-hidden /> : <Store size={16} aria-hidden />}
              {form.delivery === "lalamove" ? `Delivery to ${form.address || "your address"} · Fee confirmed in chat` : `Pickup at ${shop.name}${shop.address ? ` · ${shop.address}` : ""}`}
            </span>
            <span className={design.logisticsLine}>
              <CalendarDays size={16} aria-hidden />
              {formatPreferredWhen(dateValue, selectedSlot?.label ?? "") ||
                "Choose your preferred date and time."}
            </span>
          </div>
          <div className="order-next">
            <p className="eyebrow">WHAT HAPPENS NEXT</p>
            <p>
              Copy your order and paste it into our chat on {channels}. We confirm it there. Nothing is reserved until we reply.
            </p>
            {publicShop.links.messenger && <a href={publicShop.links.messenger} target="_blank" rel="noreferrer">{publicShop.links.messenger.includes("facebook.com") ? "Find us on Facebook" : "Chat on Messenger"} ↗</a>}
            <a href={publicShop.links.instagramDm || publicShop.links.instagram} target="_blank" rel="noreferrer">
              Have a question? Talk to us <ArrowUpRight size={15} aria-hidden />
            </a>
          </div>
          <Link href="/menu" className="order-back-menu">
            Take another look at the menu <ArrowUpRight size={15} aria-hidden />
          </Link>
        </aside>
      </div>
      <MobileLineup count={selectedCount} subtotal={subtotal} hasUnpriced={hasUnpriced}>
        <ul className="mobile-lineup-items">
          {selectedItems.map((item) => {
            const quantity = form.quantities[item.slug];
            const product = clientCatalog.products.find((p) => p.id === item.productId)!;
            const reason = itemReason(item);
            const extras = catalogAddons.filter((addon) => form.lineAddons[item.slug]?.includes(addon.id));
            return <li key={item.slug}>
              <div className="mobile-lineup-item">
                <Image src={item.image.src} alt="" width={56} height={56} unoptimized />
                <div><strong>{item.name}</strong><p>{quantity} {quantity === 1 ? "pc" : "pcs"}{item.price == null ? " · Price to confirm" : ` · ${formatPrice(item.price)} each`}</p></div>
                <strong>{item.price == null ? "To confirm" : formatPrice(item.price * quantity)}</strong>
              </div>
              {reason ? <p className="mobile-lineup-warning">{reason}</p> : null}
              {extras.map((addon) => <p className="mobile-lineup-extra" key={addon.id}>{addon.name}{form.lineMessages[item.slug]?.[addon.id] ? `: ${form.lineMessages[item.slug][addon.id]}` : ""} · {formatPrice(addon.priceCentavos * quantity / 100)}</p>)}
              <div className="mobile-lineup-controls"><QtyStepper label={item.name} value={quantity} onChange={(next) => setQuantity(item.slug, next)} unavailable={Boolean(reason)} /><Button type="button" variant="ghost" className="h-11" onClick={() => setQuantity(item.slug, 0)} aria-label={`Remove ${item.name}`}>Remove</Button></div>
            </li>;
          })}
        </ul>
        {selectedPackages.length > 0 && <section className="mobile-lineup-extras"><h3>Packages</h3>{selectedPackages.map(p => <p key={p.id}><span>{packageQuantities[p.id]} × {p.name}</span><strong>{p.priceCentavos === null ? "Price pending" : formatPrice(p.priceCentavos / 100 * packageQuantities[p.id])}</strong></p>)}</section>}
        {chosenAddons.length ? <section className="mobile-lineup-extras"><h3>Order extras</h3>{chosenAddons.map((addon) => <p key={addon.id}><span>{addon.name}{form.addonMessages[addon.id] ? `: ${form.addonMessages[addon.id]}` : ""}</span><strong>{formatPrice(addon.priceCentavos / 100)}</strong></p>)}</section> : null}
        <p className="mobile-lineup-note">{hasUnpriced ? "Some prices are to confirm. " : ""}Priced extras are included in the subtotal. Staff confirm the final total in chat.</p>
        {orderNotes("mobile-order-notes")}
        <section className="mobile-lineup-logistics"><h3>Your schedule</h3><p>{form.delivery === "lalamove" ? `Delivery to ${form.address || "your address"} · Fee confirmed in chat` : `Pickup at ${shop.name}`}</p><p>{formatPreferredWhen(dateValue, selectedSlot?.label ?? "") || "Choose your date and time in the form."}</p>{dateInvalid ? <p className="mobile-lineup-warning">Choose an available date in the form.</p> : null}</section>
      </MobileLineup>
      <AlertDialog open={pendingChange !== null} onOpenChange={(open) => { if (!open) setPendingChange(null); }}>
        <AlertDialogContent className="motion-reduce:animate-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">{pendingChange?.kind === "branch" ? "Change branch?" : "Change your date?"}</AlertDialogTitle>
            <AlertDialogDescription className="mt-1 text-base leading-relaxed">
              {pendingChange?.kind === "branch"
                ? "Availability and fulfillment may change at another branch. Your pies will stay in your lineup, with unavailable items marked for removal."
                : "Availability may change on your new date. Your pies will stay in your lineup, with unavailable items marked for removal."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 px-4">Keep {pendingChange?.kind === "branch" ? "branch" : "date"}</AlertDialogCancel>
            <AlertDialogAction className="min-h-11 px-4" onClick={() => {
              if (!pendingChange) return;
              if (pendingChange.kind === "branch") changeBranch(pendingChange.branch, true);
              else changeDate(pendingChange.date, true);
              setPendingChange(null);
            }}>Change {pendingChange?.kind === "branch" ? "branch" : "date"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
