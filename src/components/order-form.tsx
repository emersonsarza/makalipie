"use client";

import { ArrowUpRight, CalendarDays, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { PackageChoices } from "@/components/customer-packages";
import { DropNotice, PackingExplanation, PackingBreakdown } from "@/components/customer-policy";
import { useRouter } from "next/navigation";

import Image from "next/image";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar } from "@/components/ui/calendar";
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
  itemPriceText,
  paymentMethods,
  type MenuItem,
} from "@/lib/site";
import { usePublicShop, ChatLinks } from "@/components/public-shop-provider";
import { PickupAddress } from "@/components/pickup-address";
import { MobileLineup } from "@/components/mobile-lineup";
import { CatalogAddonOptions } from "@/components/catalog-addon-options";
import { availabilityReason, availabilityText, manilaDate, quoteSelection } from "@/lib/catalog/rules";
import type { Addon, Catalog, Selection, Variant } from "@/lib/catalog/schema";
import { useOrderSchedule } from "@/hooks/use-order-schedule";
import type { ScheduleSettings } from "@/lib/scheduling/schema";
import { addCalendarDays, availableOrderDates } from "@/lib/scheduling/rules";
import { branchById, branchCatalog, variantAvailable, visibleBranches, type BranchId, type BranchSettings, type CatalogMode } from "@/lib/branches/schema";
import { cn } from "@/lib/utils";

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
  if (!date || !time) return "";
  return `${dayjs(date).format("ddd MMM D")} · ${time}`;
}

function flavorNote(item: MenuItem) {
  return item.note;
}

function QtyStepper({
  value,
  onChange,
  label,
  unavailable = false,
}: {
  unavailable?: boolean;
  value: number;
  onChange: (next: number) => void;
  label: string;
}) {
  return (
    <div className="order-stepper">
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
  );
}

function FlavorRow({
  item,
  quantity,
  onQuantityChange,
  reason,
  atLimit = false,
}: {
  atLimit?: boolean;
  reason?: string | null;
  item: MenuItem;
  quantity: number;
  onQuantityChange: (next: number) => void;
}) {
  const selected = quantity > 0;
  const extra = flavorNote(item);

  return (
    <div className={cn("order-flavor", selected ? "is-selected" : "")}>
      <Image src={item.image.src} unoptimized alt="" width={72} height={72} className="order-thumb" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="font-heading text-base font-semibold">{item.name}</p>
          <p className="text-sm font-semibold text-charcoal/70">
            {itemPriceText(item)}
          </p>
        </div>
        {!!item.allergens?.length && <p className="text-xs">Contains: {item.allergens.join(", ")}.</p>}
        {reason && <p className="mt-1 text-xs text-berry">{reason}</p>}
        {extra ? (
          <p className="mt-0.5 text-xs font-medium text-charcoal/55">{extra}</p>
        ) : null}
      </div>
      <QtyStepper
        value={quantity}
        onChange={onQuantityChange}
        unavailable={Boolean(reason) || atLimit}
        label={item.name}
      />
    </div>
  );
}

type OrderItem = MenuItem & { productId: string; variant: Variant };
export function OrderForm({ items, catalogAddons, branches, initialBranch, schedule, serverNow, openDates = {}, openProducts = {}, intakeEnabled = false, mode = "regular" }: { items: MenuItem[]; catalogAddons: Addon[]; branches: BranchSettings; initialBranch: BranchId; schedule: ScheduleSettings; serverNow: string; openDates?: Record<string, string[]>; openProducts?: Record<string, Record<string, string[]>>; intakeEnabled?: boolean; mode?: CatalogMode }) {
  const publicShop = usePublicShop();
  const packages = publicShop.experience?.packages ?? [];
  const [packageQuantities,setPackageQuantities] = useState<Record<string,number>>({});
  const channels = publicShop.links.messenger ? (publicShop.links.messenger.includes("facebook.com")?"Instagram or Facebook":"Instagram or Messenger") : "Instagram";
  const scheduleState = useOrderSchedule(schedule, serverNow, openDates, openProducts);
  const router = useRouter();
  const [refreshingCatalog, refreshCatalog] = useTransition();
  const [priceNotice, setPriceNotice] = useState<string[]>([]);
  const [priceAcknowledged, setPriceAcknowledged] = useState(true);
  const previousPrices = useRef<Record<string, string>>({});
  const idempotencyKey = useRef("");
  const recoveryToken = useRef("");
  const dateTouched = useRef(false);
  const [editing, setEditing] = useState<{ token: string; revision: string; keys: string[]; date: string; quantities: Record<string, number> } | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftFailed, setDraftFailed] = useState(false);
  const [recovery, setRecovery] = useState<{ orderNumber: string; priceChanges: { from: string; to: string }[]; unavailableLines: { productId: string; variantId: string; label: string }[] } | null>(null);
  const [dismissedLines, setDismissedLines] = useState<string[]>([]);
  const [branch, setBranch] = useState<BranchId>(initialBranch);
  const shop = branchById(branches, branch);
  const publicBranches = visibleBranches(branches);
  const branchUnavailable = !publicBranches.some(item => item.id === branch);
  const menuItems: OrderItem[] = items.flatMap((item) => (item.variants ?? []).filter((v) => v.active).map((v) => ({ ...item, productId: item.slug, slug: `${item.slug}:${v.id}`, name: `${item.name} · ${v.label}`, price: v.pricingMode === "fixed" ? v.priceCentavos! / 100 : undefined, priceLabel: "DM for price", variant: v })));
  const availableHere = (item: OrderItem) => variantAvailable(branches, branch, item.productId, item.variant.id, item.variant.minLeadDays, mode);
  const visibleItems = menuItems.filter(availableHere);
  const [form, setForm] = useState<FormState>(() => ({ ...initialState, delivery: shop.pickupEnabled ? "pickup" : "lalamove", quantities: Object.fromEntries(menuItems.map((item) => [item.slug, 0])) }));
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const editMode = hash.startsWith("edit=");
    if (!editMode && !hash.startsWith("reorder=")) return;
    const token = decodeURIComponent(hash.slice(editMode ? 5 : 8));
    setDraftLoading(true);
    let disposed = false;
    void (async () => {
      try {
        const response = await fetch(editMode ? "/api/orders/edit" : "/api/orders/recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await response.json();
        if (disposed) return;
        if (!response.ok) throw new Error(data.error || "This request can no longer be reordered.");
        const draft = data.draft;
        if (editMode) setEditing({ token, revision: draft.revision, date: draft.selection.date, quantities: Object.fromEntries(draft.selection.lines.map((line: { productId: string; variantId: string; quantity: number }) => [`${line.productId}:${line.variantId}`, line.quantity])), keys: draft.selection.lines.map((line: { productId: string; variantId: string }) => `${line.productId}:${line.variantId}`) });
        else recoveryToken.current = token;
        setBranch(draft.branchId);
        setRecovery({ orderNumber: draft.orderNumber, priceChanges: draft.review.priceChanges ?? [], unavailableLines: draft.review.unavailableLines ?? [] });
        setForm((current) => ({
          ...current,
          name: draft.name,
          contact: draft.contact,
          notes: draft.notes,
          payment: draft.payment,
          delivery: draft.delivery ?? "pickup", address: draft.address ?? "",
          preferredDate: new Date(`${draft.selection.date}T12:00:00`),
          preferredTime: draft.slotId,
          selectedAddons: draft.selection.addons.map((addon: { id: string }) => addon.id),
          addonMessages: Object.fromEntries(draft.selection.addons.map((addon: { id: string; message?: string }) => [addon.id, addon.message ?? ""])),
          quantities: {
            ...current.quantities,
            ...Object.fromEntries(draft.selection.lines.map((line: { productId: string; variantId: string; quantity: number }) => [`${line.productId}:${line.variantId}`, line.quantity])),
          },
          lineAddons: Object.fromEntries(draft.selection.lines.map((line: { productId: string; variantId: string; addons: { id: string }[] }) => [`${line.productId}:${line.variantId}`, line.addons.map((addon) => addon.id)])),
          lineMessages: Object.fromEntries(draft.selection.lines.map((line: { productId: string; variantId: string; addons: { id: string; message?: string }[] }) => [`${line.productId}:${line.variantId}`, Object.fromEntries(line.addons.map((addon) => [addon.id, addon.message ?? ""]))])),
        }));
      } catch (loadError) {
        if (!disposed) { setDraftFailed(true); setError(loadError instanceof Error ? loadError.message : "This request can no longer be reordered."); }
      } finally { if (!disposed) setDraftLoading(false); }
    })();
    return () => { disposed = true; };
  }, [mode]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const focus = () => { if (!checking && document.visibilityState === "visible") refreshCatalog(() => router.refresh()); };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [router, checking]);
  useEffect(() => {
    const current = Object.fromEntries([
      ...items.flatMap(p => (p.variants ?? []).map(v => [`${p.slug}:${v.id}`, `${v.pricingMode}:${v.priceCentavos}`])),
      ...catalogAddons.map(a => [`addon:${a.id}`, String(a.priceCentavos)]),
      ...packages.map(p => [`package:${p.id}`, String(p.priceCentavos)]),
    ]);
    const selectedKeys = [...Object.keys(packageQuantities).filter(id => packageQuantities[id] > 0).map(id => `package:${id}`), ...Object.keys(form.quantities).filter(key => form.quantities[key] > 0), ...form.selectedAddons.map(id => `addon:${id}`), ...Object.values(form.lineAddons).flat().map(id => `addon:${id}`)];
    const changed = selectedKeys.filter(key => previousPrices.current[key] !== undefined && current[key] !== undefined && previousPrices.current[key] !== current[key]);
    if (changed.length) { setPriceNotice(changed.map(key => key.startsWith("package:") ? packages.find(p => `package:${p.id}` === key)?.name || "Package" : key.startsWith("addon:") ? catalogAddons.find(a => `addon:${a.id}` === key)?.name || "Extra" : items.find(p => key.startsWith(`${p.slug}:`))?.name || "Pie")); setPriceAcknowledged(false); }
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
  function changeBranch(next: BranchId) {
    if (selectedCount && !window.confirm("Changing branches may affect the selected pies and fulfillment. Your lineup will be kept, with unavailable items marked. Continue?")) return;
    const destination = branchById(branches, next);
    setForm((current) => ({ ...current, preferredTime: "", delivery: current.delivery === "pickup" && !destination.pickupEnabled ? "lalamove" : current.delivery === "lalamove" && !destination.deliveryEnabled ? "pickup" : current.delivery }));
    setBranch(next);
    setError(null);
    const url = new URL(window.location.href); url.searchParams.set("branch", next);
    window.history.replaceState(null, "", url.toString());
  }
  const chosenAddons = catalogAddons.filter((a) => form.selectedAddons.includes(a.id));
  const selectedContent: Omit<Selection, "date"> = { lines: selectedItems.map((item) => ({ productId: item.productId, variantId: item.variant.id, quantity: form.quantities[item.slug], addons: (form.lineAddons[item.slug] ?? []).map((id) => ({ id, message: form.lineMessages[item.slug]?.[id] ?? "" })) })), addons: form.selectedAddons.map((id) => ({ id, message: form.addonMessages[id] ?? "" })) };
  const clientCatalog: Catalog = { initialized: true, addons: catalogAddons, products: items.map((p) => ({ id: p.slug, slug: p.slug, name: p.name, blurb: p.blurb, description: p.description, category: p.kind, image: { url: p.image.src, alt: p.image.alt }, allergens: p.allergens ?? [], publicNotes: p.note ?? "", active: true, sortOrder: 0, version: 1, updatedAt: null, legacyPriceCentavos: null, variants: p.variants ?? [], availableWeekdays: p.availableWeekdays ?? [], unavailableDates: p.unavailableDates ?? [], allowedAddonIds: p.allowedAddonIds ?? [] })) };
  const modeCatalog = branchCatalog(clientCatalog, branches, branch, mode);
  const scheduledDates = availableOrderDates(scheduleState.settings, branch, modeCatalog, { lines: [], addons: [] }, scheduleState.now);
  const availableDates = scheduledDates.filter((date) => (editing?.date === date.date) || modeCatalog.products.some((product) => product.variants.some((variant) => !availabilityReason(product, variant, date.date, 0, manilaDate(scheduleState.now))) && (!intakeEnabled || scheduleState.openProducts[branch]?.[date.date]?.includes(product.id))));
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
  const quote = quoteSelection(clientCatalog, { ...selection, date: selectedDate || manilaDate(scheduleState.now) }, manilaDate(scheduleState.now));
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
  function itemReason(item: OrderItem) {
    if (!availableHere(item)) return `Not available at ${shop.name}. Remove this item or switch back.`;
    if (!selectedDate) return "Choose a date to see availability.";
    if (!scheduleState.settings.branches[branch]?.enabled) return `Online ordering is paused at ${shop.name}.`;
    const product = clientCatalog.products.find((p) => p.id === item.productId)!;
    const reasons: string[] = [];
    const days = (Date.parse(selectedDate) - Date.parse(manilaDate(scheduleState.now))) / 86400000;
    const weekdays = item.variant.availableWeekdays ?? product.availableWeekdays;
    if (weekdays.length && !weekdays.includes(new Date(`${selectedDate}T00:00:00Z`).getUTCDay())) reasons.push(availabilityText(product, item.variant) + ". Not baked on this weekday.");
    if (product.unavailableDates.includes(selectedDate)) reasons.push("Not available on this date.");
    if (days < item.variant.minLeadDays) reasons.push(`Needs ${item.variant.minLeadDays} days of preparation. Choose a later date.`);
    if (intakeEnabled && !scheduleState.openProducts[branch]?.[selectedDate]?.includes(item.productId) && !(editing?.date === selectedDate && editing.keys.includes(item.slug) && (form.quantities[item.slug] ?? 0) <= editing.quantities[item.slug])) reasons.push(`Sold out on ${dayjs(selectedDate).format("ddd, MMM D")}.`);
    return reasons.join(" ") || null;
  }
  function row(item: OrderItem) {
    const product = clientCatalog.products.find((p) => p.id === item.productId)!;
    return <div key={item.slug} className="space-y-2"><FlavorRow item={item} quantity={form.quantities[item.slug] ?? 0} onQuantityChange={(n) => setQuantity(item.slug, n)} reason={itemReason(item)} atLimit={atLimit || Boolean(editing && !editing.keys.includes(item.slug))} /><p className="px-3 text-sm text-charcoal/70">{availabilityText(product, item.variant)}{item.variant.minLeadDays > 0 ? ` · ${item.variant.minLeadDays} days preparation` : ""}</p></div>;
  }
  const availableItems = visibleItems.filter((item) => !itemReason(item)).sort((a,b) => a.variant.minLeadDays - b.variant.minLeadDays || Number(Boolean(a.variant.availableWeekdays?.length || a.availableWeekdays?.length)) - Number(Boolean(b.variant.availableWeekdays?.length || b.availableWeekdays?.length)));
  const otherDays = visibleItems.filter((item) => /weekday|Not available on this date/.test(itemReason(item) ?? ""));
  const needsTime = visibleItems.filter((item) => !otherDays.includes(item) && /preparation/.test(itemReason(item) ?? ""));
  const soldOut = visibleItems.filter((item) => !otherDays.includes(item) && !needsTime.includes(item) && /Sold out/.test(itemReason(item) ?? ""));
  function addonReason(addon: Addon) { return !selectedDate ? "Choose a date first." : (Date.parse(selectedDate) - Date.parse(manilaDate(scheduleState.now))) / 86400000 < addon.minLeadDays ? `Needs ${addon.minLeadDays} days preparation. Choose a later date to add this extra.` : null; }
  function changeDate(date: Date | undefined) {
    dateTouched.current = true;
    if (selectedCount && date && dayjs(date).format("YYYY-MM-DD") !== selectedDate && !window.confirm("Changing the date may affect availability. Your pies will stay in the lineup, with any unavailable items marked for removal. Continue?")) return;
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (checking || refreshingCatalog) return;
    if (!priceAcknowledged) { setError("Please acknowledge the updated prices before submitting."); return; }
    if (removedSelections.length) { setError("Some selected sizes are no longer available. Remove them before continuing."); return; }
    if (branchUnavailable) { setError("This branch is no longer available for new orders. Choose another visible branch; your selections are kept."); return; }
    if (dropClosed) { setError("Ordering is not open for this branch drop. Your lineup is preserved."); return; }

    if (unavailableItems.length || pendingUnavailable.length) { setError("Remove unavailable items or switch branches before continuing."); return; }

    if (!form.name.trim() || !form.contact.trim()) {
      setError("Please fill in your name and contact number.");
      return;
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
    setChecking(true);
    try {
      if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
      const response = await fetch(editing ? "/api/orders/revise" : "/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { token: editing.token, revision: editing.revision, selection, slotId: selectedSlot.id } : {
          idempotencyKey: idempotencyKey.current,
          branchId: branch,
          slotId: selectedSlot.id,
          name: form.name.trim(),
          contact: form.contact.trim(),
          notes: form.notes.trim(),
          delivery: form.delivery,
          address: form.delivery === "lalamove" ? form.address.trim() : "",
          payment: form.payment,
          ...(form.delivery === "lalamove" ? { deliveryFeePayment: form.deliveryFeePayment } : {}),
          catalogMode: mode,
          ...(selectedPackageCount > 0 ? { packages: selectedPackages.map(p => ({id:p.id,quantity:packageQuantities[p.id]})) } : {}),
          ...(recoveryToken.current ? { recoveryToken: recoveryToken.current } : {}),
          selection,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.schedule && result.serverNow) scheduleState.acceptFreshSettings(result.schedule, result.serverNow, result.openDates, result.openProducts);
        throw new Error(result.error || "Could not place your request.");
      }
      try { sessionStorage.setItem("makalipie-request-token", result.token); } catch { /* The private URL also keeps receipt access. */ }
      router.push(`/order/status#${result.token}`);
    } catch(e) {
      setError(e instanceof Error ? e.message : "Could not place your request. Please retry.");
      setChecking(false);
    }
  }

  return (
    <div className="order-page wrap">
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
            <br />
            We’ll take it from there, together on {channels}.
          </p>
        </div>
        <Image
          src="/brand/seal.png"
          alt="Makalipie Tarts & Pies"
          width={145}
          height={145}
        />
      </header>
      <div className="mb-5 space-y-3">
        {branchUnavailable&&<p role="alert">This branch is no longer available for new orders. Select another branch; your lineup is preserved.</p>}
        <DropNotice branchId={branch}/>
        {refreshingCatalog && <p role="status">Checking current prices and availability. Your selections are kept.</p>}
        {!priceAcknowledged && <div role="alert" className="rounded-xl bg-butter p-4"><p>Prices changed for {Array.from(new Set(priceNotice)).join(", ")}. Your total now uses current prices.</p><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={priceAcknowledged} onChange={e => setPriceAcknowledged(e.target.checked)}/>I acknowledge the updated prices.</label></div>}
        {removedSelections.map(([key, quantity]) => <div key={key} role="alert" className="rounded-xl border p-4">A selected size ({key}) × {quantity} is no longer available. <button type="button" className="min-h-11 underline" onClick={() => update("quantities", {...form.quantities,[key]:0})}>Remove unavailable size</button></div>)}
      </div>
      <section className="mb-6 max-w-xl space-y-2" aria-label="Main branch">
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
            <p className="text-sm text-charcoal/65">Regular and advance-preparation pies can share the same date. For another date, place a separate order.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">Ordering from</p>
            <p className="text-base">{shop.name}</p>
            <p className="text-sm text-charcoal/65">Regular and advance-preparation pies can share the same date. For another date, place a separate order.</p>
          </>
        )}
      </section>
      {unsupportedLimit && <p role="status">This branch’s ordering limit needs a chat with us. Contact <ChatLinks /> before placing your order.</p>}
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
          <form id="pie-order" onSubmit={handleSubmit} className="order-form">
            <fieldset disabled={checking || draftLoading || draftFailed} className="contents">
            {draftLoading && <p role="status">Loading your order…</p>}
              <legend className="sr-only">Your order</legend>
            {!scheduleState.settings.branches[branch]?.enabled && <Alert role="status" className="bg-butter/60"><AlertDescription>Orders are currently closed at {shop.name}. This branch remains available for future drops. <DropNotice branchId={branch} />{!drop && <span>Next drop to be announced. Follow us on <ChatLinks />.</span>}</AlertDescription></Alert>}
            <section aria-label="Choose fulfillment date">              <div className="space-y-3">
                <p className="text-sm text-charcoal/65">Choose up to {scheduleState.settings.bookingHorizonDays} days ahead. All times are in Manila time.</p>
                {quote.preparationDays > 0 ? <p className="text-sm text-charcoal/65">Selected extras or sizes need {quote.preparationDays} days of preparation. Choose an eligible date or remove the affected item.</p> : null}
                {scheduleState.error && (
                  <Alert className="border-berry/40 bg-transparent text-berry">
                    <AlertDescription className="text-berry">{scheduleState.error}</AlertDescription>
                  </Alert>
                )}
                <Button type="button" variant="link" className="h-11 px-0 text-charcoal" onClick={scheduleState.refresh}>
                  Refresh available dates
                </Button>
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
                    className="w-auto overflow-hidden rounded-2xl p-2"
                  >
                    <Calendar
                      mode="single"
                      selected={dateValue}
                      onSelect={changeDate}
                      disabled={(date) => !availableDates.some((d) => d.date === dayjs(date).format("YYYY-MM-DD"))}
                      startMonth={today}
                      endMonth={lastDate}
                      defaultMonth={dateValue ?? today}
                    />
                  </PopoverContent>
                </Popover>
              </div>
</section>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Pick your pies</legend>
              <p className="text-xs text-charcoal/55">
                A few for you, a few to share. Use + to add your favourites.
              </p>
              {visibleItems.length === 0 && (
                <Alert role="status" className="border-transparent bg-butter/60 text-charcoal">
                  <AlertDescription className="text-charcoal">
                    No pies are currently available at {shop.name}. {publicBranches.length > 1 ? "Choose another main branch or contact us." : "Contact us."}
                  </AlertDescription>
                </Alert>
              )}
              {unavailableItems.length > 0 && (
                <section aria-label="Unavailable cart items" className="space-y-3">
                  <Alert className="border-berry/40 bg-transparent text-berry">
                    <AlertDescription className="text-berry">
                      Some selected items are unavailable at this branch. Matching items remain in your order.
                    </AlertDescription>
                  </Alert>
                  {unavailableItems.map((item) => (
                    <div key={item.slug}>
                      {row(item)}
                      <Button type="button" variant="link" className="h-11 px-3 text-charcoal" onClick={() => setQuantity(item.slug, 0)}>
                        Remove {item.name}
                      </Button>
                    </div>
                  ))}
                </section>
              )}
              {limit !== null && <p className="text-sm">Up to {limit} pies per order at {shop.name}.{atLimit && " That’s the limit for this branch."}</p>}
              {!selectedDate ? <p className="rounded-xl bg-butter/60 p-4">Choose a date above to see which pies you can order.</p> : <>
                <section className="space-y-3" aria-label="Available pies"><h3 className="font-semibold">Available for {dateLabel}</h3>{availableItems.length ? availableItems.map(row) : <p>No pies are available for this date. Choose another date or branch.</p>}</section>
                {otherDays.length > 0 && <section className="space-y-3 pt-5"><h3 className="font-semibold">Available on other days</h3><p className="text-sm">These pies are not baked on the selected date.</p>{otherDays.map(row)}</section>}
                {needsTime.length > 0 && <section className="space-y-3 pt-5"><h3 className="font-semibold">Needs more preparation time</h3><p className="text-sm">Choose a later date to order these sizes.</p>{needsTime.map(row)}</section>}
                {soldOut.length > 0 && <section className="space-y-3 pt-5"><h3 className="font-semibold">Sold out for this date</h3>{soldOut.map(row)}</section>}
              </>}
              {!!selectedDate && quote.errors.length > 0 && (
                <Alert role="status" className="border-berry/40 bg-transparent text-berry">
                  <AlertDescription className="text-berry">{quote.errors.join(" ")}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2 pt-1">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  readOnly={Boolean(editing)} value={form.notes}
                  onChange={(event) => update("notes", event.target.value)}
                  className="min-h-0 rounded-xl bg-cream"
                  placeholder="Allergies, packing notes, or anything else"
                />
              </div>
            </fieldset>

            <fieldset className="order-details-fields space-y-5">
              <legend>Your details & time slot</legend>
              <p className="order-section-help">
                Let us know who it’s for and when you’d like it.
              </p>
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
                    value={form.contact}
                    onChange={(event) => update("contact", event.target.value)}
                    className="h-11 rounded-xl bg-cream px-3"
                    autoComplete="tel"
                  />
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
                <div className="flex flex-wrap gap-2" role="group" aria-labelledby="time-slots-label">
                  {slots.map((slot) => {
                    const active = form.preferredTime === slot.id;
                    return (
                      <Button
                        key={slot.id}
                        type="button"
                        variant="outline"
                        onClick={() => { setForm((current) => ({ ...current, preferredDate: dateValue, preferredTime: slot.id })); setError(null); }}
                        className={cn(
                          "pressable h-11 rounded-full px-3.5 font-semibold ring-1",
                          active
                            ? "border-charcoal bg-charcoal text-white ring-charcoal hover:bg-charcoal hover:text-white"
                            : "border-transparent bg-cream text-charcoal/80 ring-charcoal/10 hover:bg-butter",
                        )}
                        aria-pressed={active}
                      >
                        {slot.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </fieldset>
            <PackageChoices packages={packages} branchId={branch} date={selectedDate} quantities={packageQuantities} enabled={!!publicShop.experience?.packageCheckoutEnabled && !editing && !checking} remainingPies={limit===null?null:Math.max(0,limit-selectedCount)} onChange={(id,quantity)=>setPackageQuantities(current=>({...current,[id]:quantity}))}/>
            {invalidPackages && <div role="alert" className="rounded-xl bg-butter p-4">A selected package needs attention. Your selection is preserved. {Object.entries(packageQuantities).filter(([,q])=>q>0).map(([id,q])=><p key={id}>{packages.find(p=>p.id===id)?.name||'Unavailable package'} × {q} <button type="button" className="min-h-11 underline" onClick={()=>setPackageQuantities(current=>({...current,[id]:0}))}>Remove</button></p>)}</div>}
            <fieldset disabled={Boolean(editing)} className="space-y-3">
              <legend className="text-sm font-medium">
                Make it a little personal
              </legend>
              <p className="text-xs text-charcoal/60">Optional extras for your order. Every active extra is shown here; preparation times still apply.</p>
              <CatalogAddonOptions addons={catalogAddons.filter((a) => a.active && a.scope === "per_order")} selected={form.selectedAddons} messages={form.addonMessages} prefix="order-extra" unavailableReason={addonReason} toggle={toggleAddon} message={(id, value) => update("addonMessages", { ...form.addonMessages, [id]: value })} />
            </fieldset>

            <fieldset disabled={Boolean(editing)} className="space-y-3"><legend className="font-medium">Extras for individual pies</legend>
              {selectedItems.length === 0 ? <CatalogAddonOptions addons={catalogAddons.filter((a) => a.active && a.scope === "per_item")} selected={[]} messages={{}} prefix="unselected-pie" unavailableReason={() => "Choose a pie line to add this extra."} toggle={() => {}} message={() => {}} /> : selectedItems.map((item) => <div key={item.slug} className="space-y-3"><h3 className="text-sm font-semibold">For {item.name} ×{form.quantities[item.slug]}</h3><CatalogAddonOptions addons={catalogAddons.filter((a) => a.active && a.scope === "per_item")} quantity={form.quantities[item.slug]} prefix={item.slug} selected={form.lineAddons[item.slug] ?? []} messages={form.lineMessages[item.slug] ?? {}} unavailableReason={addonReason} toggle={(id) => { const current = form.lineAddons[item.slug] ?? []; update("lineAddons", { ...form.lineAddons, [item.slug]: current.includes(id) ? current.filter((x) => x !== id) : [...current, id] }); }} message={(id,value) => update("lineMessages", { ...form.lineMessages, [item.slug]: { ...form.lineMessages[item.slug], [id]: value } })} /></div>)}
            </fieldset>
            <fieldset disabled={Boolean(editing)} className="space-y-3"><legend className="font-medium">Pickup or delivery</legend>
              {shop.pickupEnabled && shop.deliveryEnabled && <RadioGroup value={form.delivery} onValueChange={(value) => update("delivery", value as "pickup" | "lalamove")}><Label className="rounded-xl bg-butter/60 p-4"><RadioGroupItem value="pickup" />Pickup</Label><Label className="rounded-xl bg-butter/60 p-4"><RadioGroupItem value="lalamove" />Delivery</Label></RadioGroup>}
              {form.delivery === "pickup" ? <PickupAddress name={shop.name} address={shop.address} hoursLabel={shop.hoursLabel} mapUrl={shop.mapUrl} /> : <div className="space-y-3 rounded-xl bg-butter/60 p-4"><Label htmlFor="delivery-address">Delivery address</Label><Textarea id="delivery-address" required minLength={5} maxLength={300} autoComplete="street-address" value={form.address} onChange={(e) => update("address", e.target.value)} /><p className="text-sm">We book the rider and confirm the delivery fee in chat. Pay it with your total or directly to the rider.</p><label className="block">Delivery fee payment<select className="mt-2 min-h-11 w-full rounded-lg border p-3" value={form.deliveryFeePayment} onChange={e => update("deliveryFeePayment", e.target.value as FormState["deliveryFeePayment"])}><option value="with_total">Include in my bakery payment</option><option value="to_driver">Pay the rider directly</option></select></label><p className="text-sm">{form.deliveryFeePayment === "with_total" ? "Delivery fee pending. Wait for staff to confirm the exact fee and final total before paying." : "Pay the pies in full before preparation. Pay the delivery fee directly to the rider."}</p></div>}
            </fieldset>

            <fieldset disabled={Boolean(editing)} className="space-y-3">
              <PackingExplanation />
              <legend className="text-sm font-medium">
                Your payment preference
              </legend>
              <p className="text-xs text-charcoal/55">
                Pay in full after staff confirm your order and total, before preparation begins.
              </p>
              <RadioGroup
                name="payment"
                value={form.payment}
                disabled={checking}
                onValueChange={(value) => update("payment", value)}
                className="gap-3"
              >
                {paymentMethods.filter((method) => method.id !== "cash").map((method) => (
                  <Label
                    key={method.id}
                    className="pressable h-auto cursor-pointer gap-3 rounded-xl bg-butter/60 px-4 py-3 font-normal"
                  >
                    <RadioGroupItem value={method.id} />
                    <span className="text-sm font-semibold">{method.label}</span>
                  </Label>
                ))}
              </RadioGroup>
            </fieldset>

            <p className="order-submit-note">Made in a shared kitchen that handles nuts (including pecans) and gluten, so cross-contact is possible.</p>
            <p className="order-submit-note">Once a third-party courier picks up your order, we’re no longer responsible for how or when it arrives.</p>
            {error ? (
              <Alert role="alert" className="border-berry/40 bg-transparent text-berry">
                <AlertDescription className="font-medium text-berry">{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="submit"
              disabled={branchUnavailable || invalidPackages || checking || refreshingCatalog || !priceAcknowledged || removedSelections.length > 0 || dropClosed || selectedCount < 1 || selectedItems.some(itemReason) || quote.errors.length > 0 || unavailableItems.length > 0 || pendingUnavailable.length > 0 || (visibleItems.length === 0 && selectedPackageCount === 0) || !selectedSlot || dateInvalid || Boolean(scheduleState.error)}
              className="order-submit brand-button"
            >
              {checking ? (editing ? "Saving changes…" : "Placing your order…") : editing ? "Save changes" : "Place order"}{" "}
              <ArrowUpRight size={18} aria-hidden />
            </Button>
            <p className="order-submit-note">
              Placing this request reserves the pies and opens your order page. Send your order number on {channels} so we can confirm it. No payment is taken here.{" "}
              <Link href="/terms">Terms</Link>, <Link href="/privacy">Privacy</Link>, and{" "}
              <Link href="/refund">Refund policy</Link>.
            </p>
            </fieldset>
          </form>
        </div>

        <aside className="order-summary" aria-label="Your order summary">
          <div className="order-summary-heading">
            <p className="eyebrow">A BOX TO LOOK FORWARD TO</p>
            <h2>Your little lineup.</h2>
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
          <PackingBreakdown lines={selectedItems.map(item=>({size:item.variant.label,category:item.kind,quantity:form.quantities[item.slug]}))} packageCount={selectedPackageCount}/>
          <PackingExplanation/>
          <div className="order-subtotal">
            <span>Known subtotal</span>
            <strong>{formatPrice(subtotal)}</strong>
          </div>
          <p className="order-total-note">
            {hasUnpriced
              ? "Quoted sizes will be priced after confirmation. "
              : ""}
            Staff confirm the final total on your order page.
          </p>
          <div className="order-summary-logistics">
            <span>
              {form.delivery === "lalamove" ? `Delivery to ${form.address || "your address"} · Fee confirmed in chat` : `Pickup at ${shop.name}${shop.address ? ` · ${shop.address}` : ""}`}
            </span>
            <span>
              {formatPreferredWhen(dateValue, selectedSlot?.label ?? "") ||
                "Choose your preferred date and time."}
            </span>
          </div>
          <div className="order-next">
            <p className="eyebrow">WHAT HAPPENS NEXT</p>
            <p>
              Place the order to open your order page. Copy the order number there to confirm with us on {channels}.
            </p>
            {publicShop.links.messenger && <a href={publicShop.links.messenger} target="_blank" rel="noreferrer">Open Messenger ↗</a>}
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
        {chosenAddons.length ? <section className="mobile-lineup-extras"><h3>Order extras</h3>{chosenAddons.map((addon) => <p key={addon.id}><span>{addon.name}{form.addonMessages[addon.id] ? `: ${form.addonMessages[addon.id]}` : ""}</span><strong>{formatPrice(addon.priceCentavos / 100)}</strong></p>)}</section> : null}
        <p className="mobile-lineup-note">{hasUnpriced ? "Some prices are to confirm. " : ""}Priced extras are included in the subtotal. Staff confirm the final total on your order page.</p>
        <section className="mobile-lineup-logistics"><h3>Your schedule</h3><p>{form.delivery === "lalamove" ? `Delivery to ${form.address || "your address"} · Fee confirmed in chat` : `Pickup at ${shop.name}`}</p><p>{formatPreferredWhen(dateValue, selectedSlot?.label ?? "") || "Choose your date and time in the form."}</p>{dateInvalid ? <p className="mobile-lineup-warning">Choose an available date in the form.</p> : null}</section>
      </MobileLineup>
    </div>
  );
}
