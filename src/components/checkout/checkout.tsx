"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, Gift, Lock, MapPin, Minus, PackagePlus, Plus, ShoppingBag, StickyNote, Store, Trash2, Truck, Wallet } from "lucide-react";
import { BrandSeal } from "@/components/brand-seal";
import { MobileLineup } from "@/components/mobile-lineup";
import { AddressLines } from "@/components/address-lines";
import { ChatLinks } from "@/components/public-shop-provider";
import { ThemeLink as Link } from "@/components/site-theme";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import styles from "./checkout.module.css";
import { DeliveryFeeNotice } from "./delivery-fee-notice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { checkoutHref, type BranchEligibility, type DropSummary, type PublicDrop } from "@/lib/public/checkout";
import { DEFAULT_PRODUCT_IMAGE } from "@/lib/storefront/types";
import type { PublishedShop } from "@/lib/public/storefront-view";
import { phoneNumberError } from "@/lib/orders/phone";
import { timeLabel } from "@/lib/scheduling/rules";
import {
  clearSubmittedCart, dateLabel, emptyCart, emptyContact, lineKey, loadCart, loadPending, pesos,
  rememberReceipt, reviewedTotal, saveCart, savePending, type Cart, type Contact, type Method, type PendingOrder, type ReceiptSummary,
} from "./state";

export type CheckoutLocation = { id: string; name: string; kind: "regular" | "drop" };
type CheckoutProps = {
  locations: CheckoutLocation[];
  locationId: string;
  events: DropSummary[];
  shop?: PublishedShop;
  drop?: PublicDrop;
  eligibility?: BranchEligibility;
  notice?: string;
  requestedProduct?: string;
  requestedSize?: string;
};
type Choice = {
  key: string;
  name: string;
  sizeLabel?: string;
  price: number;
  maximum: number;
  available: boolean;
  reason?: string;
  needsPreparation?: boolean;
  stock?: { remaining: number; limit: number };
  icon?: string;
  image?: { path: string; alt: string };
  components?: { name: string; sizeLabel: string; quantity: number; image?: { path: string; alt: string } }[];
  productId?: string;
  sizeId?: string;
  offeringId?: string;
};

function choiceLabel(choice: Choice) {
  return choice.sizeLabel ? `${choice.name} · ${choice.sizeLabel}` : choice.name;
}
type PriceUpdate = { productId?: string; sizeId?: string; offeringId?: string; id?: string; unitPriceCentavos?: number };
const steps = ["Branch & date", "Pick your pies", "Your details"];
const compactSteps = ["Schedule", "Pies", "Details"];
const deliveryFeeOptions = [
  { value: "unknown", title: "Include delivery in my payment", description: "We’ll confirm the fee in chat and add it to your order total.", Icon: Wallet },
  { value: "rider", title: "I’ll pay the driver directly", description: "Pay the delivery fee to the driver, separately from your pie order.", Icon: Truck },
] as const;
type DeliveryFeeChoice = "" | (typeof deliveryFeeOptions)[number]["value"];
type ContactErrors = Partial<Record<"name" | "phone" | "delivery-fee" | "address", string>>;
type StockAdjustment = { name: string; remaining: number };
const stepHeadings = ["Schedule", "Choose your pies", "Your details"];

function formatWindow(window?: { starts: string; ends: string } | null) {
  return window ? `${timeLabel(window.starts)}–${timeLabel(window.ends)}` : "";
}

async function publicData<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Availability unavailable.");
  return response.json();
}

function stockReason(day: PublicDrop["dates"][number] | undefined, offering: PublicDrop["dates"][number]["offerings"][number]) {
  if (offering.remaining <= 0) return "Sold out for this date.";
  if (!day?.orderingOpen) return "Order during this date’s opening hours.";
  return "Currently unavailable.";
}

function branchLabel(name: string) {
  return /^Makalipie(?:\s|$)/i.test(name) ? name : `Makalipie ${name}`;
}

function regularChoices(shop: PublishedShop | undefined, eligibility: BranchEligibility | undefined, branch: string, date: string): Choice[] {
  const available = new Map<string, string[]>(eligibility?.products.flatMap(product => product.sizes.map(size => [`${product.id}/${size.id}`, size.dates] as const)));
  return shop?.menu.flatMap(section => section.products.flatMap(product =>
    product.sizes.filter(size => size.branchIds.includes(branch)).flatMap(size => {
      const key = `${product.id}/${size.id}`;
      const dates = available.get(key);
      if (product.seasonStart && product.seasonEnd && !dates?.length && eligibility) return [];
      const weekday = date ? new Date(date + "T00:00:00Z").getUTCDay() : undefined;
      const isAvailable = Boolean(dates?.includes(date));
      const reason = isAvailable ? undefined : !date ? "Choose a date first."
        : product.seasonStart && product.seasonEnd && (date < product.seasonStart || date > product.seasonEnd) ? "Outside its seasonal dates."
        : size.mode === "regular" && weekday !== undefined && !section.weekdays.includes(weekday) ? "This pie isn’t baked on that weekday."
        : size.mode === "preorder" ? undefined
        : "This size is unavailable on the selected date.";
      return [{
        key, name: product.name, sizeLabel: size.label, price: size.priceCentavos, maximum: 99, image: size.image,
        available: isAvailable, reason, needsPreparation: !isAvailable && !reason && size.mode === "preorder",
        productId: product.id, sizeId: size.id,
      }];
    }))) ?? [];
}

function Quantity({ label, value, max, change, disabled, onEmpty }: {
  label: string; value: number; max: number; change: (value: number) => void; disabled?: boolean; onEmpty?: (source: HTMLElement) => void;
}) {
  return <div className={styles.quantity}>
    <Button type="button" size="icon" variant="ghost" className="size-11 rounded-none" aria-label={`Decrease ${label}`} disabled={!value} onClick={event => {
      if (value === 1) onEmpty?.(event.currentTarget);
      change(value - 1);
    }}><Minus /></Button>
    <output aria-label={`${label} quantity`} className="min-w-6 text-center tabular-nums">{value}</output>
    <Button type="button" size="icon" variant="ghost" className="size-11 rounded-none" aria-label={`Increase ${label}`} disabled={disabled || value >= max} onClick={() => change(value + 1)}><Plus /></Button>
  </div>;
}

function packagePhotos(components: NonNullable<Choice["components"]>) {
  return components.flatMap(component =>
    Array.from({ length: Math.min(component.quantity, 4) }, () => (component.image ?? DEFAULT_PRODUCT_IMAGE).path),
  ).slice(0, 4);
}

function CheckoutPhoto({ choice, compact = false }: { choice: Choice; compact?: boolean }) {
  const Icon = choice.icon === "gift" ? Gift : choice.icon === "note" ? StickyNote : PackagePlus;
  const className = compact ? styles.summaryPhoto : styles.choiceImage;
  if (choice.components?.length) {
    return <div className={`${className} ${styles.mosaic}`} aria-hidden>
      {packagePhotos(choice.components).map((path, index) => <Image key={index} src={path} alt="" width={40} height={40} sizes="40px" />)}
    </div>;
  }
  if (choice.image) return <Image src={choice.image.path} alt={compact ? "" : choice.image.alt}
    width={76} height={76} className={className} />;
  return <span className={`${className} ${styles.choiceIcon}`}><Icon size={20} aria-hidden /></span>;
}

function InlineError({ message, id }: { message?: string; id?: string }) {
  return message ? <p id={id} role="alert" className={styles.inlineError}>{message}</p> : null;
}

function adjustmentMessage({ remaining }: StockAdjustment) {
  return remaining ? `Only ${remaining} left. Quantity updated to ${remaining}.` : "Sold out. Removed from your order.";
}

function ChoiceRow({ choice, quantity, change, limitReached, notice }: {
  choice: Choice; quantity: number; change: (value: number) => void; limitReached: boolean; notice?: string;
}) {
  const components = choice.components ?? [];
  const isPackage = components.length > 0;
  const rowProps = { className: styles.choice, "data-selected": quantity > 0, "data-available": choice.available };
  const price = <>{pesos(choice.price)} <span className="font-normal text-muted-foreground">each</span></>;
  const row = <>
    <CheckoutPhoto choice={choice} />
    <div className={styles.choiceInfo}>
      <h3 className={styles.choiceName}>{isPackage
        ? <CollapsibleTrigger type="button" className={styles.contentsTrigger}>
          <span>{choice.name}</span><ChevronDown aria-hidden />
        </CollapsibleTrigger>
        : choice.name}</h3>
      {choice.sizeLabel && <p className={styles.choiceSize}>{choice.sizeLabel}</p>}
      <p className={styles.mobilePrice}>{price}</p>
      {choice.stock && <p className="text-sm text-muted-foreground">Limit {choice.stock.limit} per order</p>}
      {choice.reason && <p className="text-sm text-muted-foreground">{choice.reason}</p>}
      <InlineError message={notice} />
    </div>
    <p className={styles.choicePrice}>{price}</p>
    {(choice.available || quantity > 0) && <div className={styles.choiceQuantity}>
      <Quantity label={choiceLabel(choice)} value={quantity} max={choice.maximum}
        change={change} disabled={!choice.available || (!quantity && limitReached)} />
    </div>}
  </>;
  if (!isPackage) return <article {...rowProps}>{row}</article>;

  return <Collapsible render={<article />} {...rowProps}>
    {row}
    <CollapsibleContent className={styles.contentsPanel}>
      <ul aria-label="Fixed package contents" className={styles.components}>
        {components.map((component, index) => <li key={index}>
          <Image src={(component.image ?? DEFAULT_PRODUCT_IMAGE).path} alt="" width={96} height={96} sizes="96px" />
          <span className="font-semibold">{component.name}</span>
          <span className="text-muted-foreground">{component.quantity} × {component.sizeLabel}</span>
        </li>)}
      </ul>
    </CollapsibleContent>
  </Collapsible>;
}

function ScheduleField({ id, label, value, options, onChange, placeholder, error }: {
  id: string; label: string; value: string; options: { value: string; label: string }[];
  onChange: (value: string) => void; placeholder?: string; error?: string;
}) {
  return <div className={`grid gap-2 ${styles.controls}`}>
    {options.length > 1 ? <>
      <Label htmlFor={id}>{label}</Label>
      <SelectField id={id} label={label} value={value} options={options} placeholder={placeholder}
        contentClassName={styles.checkoutSelect} className={value ? styles.selectedField : undefined} onValueChange={onChange}
        ariaInvalid={Boolean(error)} describedBy={error ? id + "-error" : undefined} />
    </> : <>
      <p id={id + "-label"} className="text-sm font-medium">{label}</p>
      <p aria-labelledby={id + "-label"} className={styles.confirmedValue}>{options[0]?.label ?? "Unavailable"}</p>
    </>}
    <InlineError id={id + "-error"} message={error} />
  </div>;
}

function FulfillmentCalendar({ date, today, dates, error, change }: {
  date: string; today?: string; dates: string[]; error?: string; change: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const available = new Set(dates);
  const calendarDate = (value: string) => new Date(value + "T12:00:00");
  const selected = date ? calendarDate(date) : undefined;
  const first = dates[0];
  const start = today && (!first || today < first) ? today : first;

  return <div className={`grid gap-2 ${styles.controls}`}>
    <Label htmlFor="checkout-date">Fulfillment date</Label>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button id="checkout-date" type="button" variant="outline"
        className={`w-full justify-between ${styles.dateTrigger} ${date ? styles.selectedField : ""}`} disabled={!first}
        aria-invalid={Boolean(error)} aria-describedby={error ? "checkout-date-error" : undefined} />}>
        <span className="flex items-center gap-2"><CalendarDays aria-hidden /> {date ? dateLabel(date) : "Choose a date"}</span>
        <ChevronDown aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className={styles.checkoutCalendar}>
        <PopoverTitle className="sr-only">Choose a fulfillment date</PopoverTitle>
        <Calendar mode="single" required autoFocus selected={selected}
          today={today ? calendarDate(today) : undefined}
          defaultMonth={selected && date >= (start ?? date) && date <= (dates.at(-1) ?? date) ? selected : first ? calendarDate(first) : undefined}
          startMonth={start ? calendarDate(start) : undefined}
          endMonth={first ? calendarDate(dates[dates.length - 1]) : undefined}
          disabled={day => !available.has(format(day, "yyyy-MM-dd"))}
          onSelect={day => {
            if (!day) return;
            change(format(day, "yyyy-MM-dd"));
            setOpen(false);
          }} />
      </PopoverContent>
    </Popover>
    <InlineError id="checkout-date-error" message={error} />
  </div>;
}

function ContactFields({ contact, change, method, errors, feeChoice, changeFeeChoice }: {
  contact: Contact; change: (patch: Partial<Contact>) => void; method: Method; errors: ContactErrors;
  feeChoice: DeliveryFeeChoice; changeFeeChoice?: (choice: DeliveryFeeChoice) => void;
}) {
  return <fieldset className={`grid gap-4 sm:grid-cols-2 ${styles.controls}`}>
    <div className="grid content-start gap-2">
      <Label htmlFor="checkout-name">Name</Label>
      <Input id="checkout-name" required maxLength={120} autoComplete="name" value={contact.customerName}
        aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "checkout-name-error" : undefined}
        onChange={event => change({ customerName: event.target.value })} />
      <InlineError id="checkout-name-error" message={errors.name} />
    </div>
    <div className="grid content-start gap-2">
      <Label htmlFor="checkout-phone">Mobile number</Label>
      <Input id="checkout-phone" type="tel" required maxLength={20} autoComplete="tel" value={contact.customerPhone}
        aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? "checkout-phone-error" : undefined}
        onChange={event => change({ customerPhone: event.target.value })} />
      <InlineError id="checkout-phone-error" message={errors.phone} />
    </div>
    {method === "delivery" && <div className="@container min-w-0 space-y-4 sm:col-span-2">
      <div className="space-y-2">
        <p id="checkout-delivery-fee-title" className="font-semibold">How would you like to pay the delivery fee?</p>
        <p id="checkout-delivery-fee-help" className="text-sm">Makalipie books the delivery. The fee is separate from the subtotal shown here.</p>
        <RadioGroup id="checkout-delivery-fee-options" value={feeChoice} onValueChange={value => {
          if (value === "unknown" || value === "rider") changeFeeChoice?.(value);
        }} disabled={!changeFeeChoice} aria-required="true" aria-invalid={Boolean(errors["delivery-fee"])}
          aria-labelledby="checkout-delivery-fee-title"
          aria-describedby={errors["delivery-fee"] ? "checkout-delivery-fee-help checkout-delivery-fee-error" : "checkout-delivery-fee-help"}
          className="gap-3 @min-[28rem]:grid-cols-2">
          {deliveryFeeOptions.map(({ value, title, description, Icon }) => {
            const id = value === "unknown" ? "checkout-delivery-fee" : "checkout-delivery-fee-rider";
            return <label key={value} htmlFor={id} data-selected={feeChoice === value}
              className={styles.deliveryFeeChoice}>
              <span className="sr-only">
                <RadioGroupItem id={id} value={value} aria-labelledby={id + "-title"} aria-describedby={id + "-description"} />
              </span>
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0 space-y-1">
                <span id={id + "-title"} className="block text-sm font-semibold">{title}</span>
                <span id={id + "-description"} className="block text-xs leading-relaxed">{description}</span>
              </span>
            </label>;
          })}
        </RadioGroup>
        <InlineError id="checkout-delivery-fee-error" message={errors["delivery-fee"]} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="checkout-address">Delivery address</Label>
        <div className="relative">
          {!feeChoice && <Lock className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden />}
          <Textarea id="checkout-address" disabled={!feeChoice} required maxLength={300} autoComplete="street-address" value={contact.deliveryAddress}
            className={!feeChoice ? "bg-muted pl-9 disabled:opacity-100" : undefined}
            placeholder={!feeChoice ? "Select a delivery fee option first" : undefined}
            aria-invalid={Boolean(errors.address)} aria-describedby={errors.address ? "checkout-address-error" : undefined}
            onChange={event => change({ deliveryAddress: event.target.value })} />
        </div>
        <InlineError id="checkout-address-error" message={errors.address} />
      </div>
    </div>}
    <div className="grid gap-2 sm:col-span-2"><Label htmlFor="checkout-notes">Order notes (optional)</Label><Textarea id="checkout-notes" maxLength={500} value={contact.notes} onChange={event => change({ notes: event.target.value })} /></div>
  </fieldset>;
}

export function Checkout(props: CheckoutProps) {
  const { locationId, locations, events, requestedProduct, requestedSize } = props;
  const dropId = props.drop?.id;
  const router = useRouter();
  const [shop, setShop] = useState(props.shop);
  const [eligibility, setEligibility] = useState(props.eligibility);
  const [drop, setDrop] = useState(props.drop);
  const [savedCart, setCart] = useState(emptyCart);
  const [contact, setContact] = useState(emptyContact);
  const [feeChoice, setFeeChoice] = useState<DeliveryFeeChoice>("");
  const paysDriver = feeChoice === "rider";
  const [pending, setPending] = useState<PendingOrder>();
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [contactErrors, setContactErrors] = useState<ContactErrors>({});
  const [stockAdjustments, setStockAdjustments] = useState<Record<string, StockAdjustment>>({});
  const [refreshError, setRefreshError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [conflictKeys, setConflictKeys] = useState<string[]>([]);
  const [pricesToReview, setPricesToReview] = useState<Record<string, number>>({});
  const locked = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController>(null);
  const regular = locations.some(location => location.id === locationId && location.kind === "regular");
  const branch = shop?.locations.find(location => location.id === locationId && location.kind === "regular");
  const location = locations.find(location => location.id === locationId);
  const isCheckout = regular || Boolean(dropId);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setCart(loadCart(locationId, dropId));
      const savedAttempt = loadPending();
      setPending(savedAttempt);
      if (savedAttempt?.fulfillment === "delivery") setFeeChoice(savedAttempt.deliveryFeeMode ?? "unknown");
      setHydrated(true);
    });
    return () => { active = false; };
  }, [locationId, dropId]);

  const refresh = useCallback(async () => {
    if (!regular && !dropId) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      if (dropId) {
        const next = await publicData<PublicDrop>("/api/public/drops/" + encodeURIComponent(dropId), controller.signal);
        if (!controller.signal.aborted) setDrop(next);
      } else {
        const [next, availability] = await Promise.all([
          publicData<PublishedShop>("/api/public/shop", controller.signal),
          publicData<BranchEligibility>(`/api/public/eligibility?location=${encodeURIComponent(locationId)}`, controller.signal),
        ]);
        if (!controller.signal.aborted) { setShop(next); setEligibility(availability); }
      }
      if (!controller.signal.aborted) setRefreshError("");
    } catch {
      if (!controller.signal.aborted) setRefreshError("Could not refresh availability. Your selections are saved. Try again.");
    }
  }, [dropId, locationId, regular]);

  useEffect(() => {
    const check = () => { if (document.visibilityState === "visible") void refresh(); };
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      request.current?.abort();
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [refresh]);

  useEffect(() => {
    if (!drop || drop.status !== "published") return;
    const now = Date.now();
    const next = Math.min(...drop.dates.flatMap(date => [date.orderingOpens, date.orderingCutoff]
      .map(clock => Date.parse(`${date.date}T${clock}:00+08:00`))).filter(time => time > now));
    if (!Number.isFinite(next) || next - now > 2_147_483_000) return;
    const timer = window.setTimeout(() => void refresh(), next - now + 250);
    return () => window.clearTimeout(timer);
  }, [drop, refresh]);

  function updateCart(next: Cart) {
    setCart(next);
    saveCart(locationId, dropId, next);
  }

  function goTo(next: number) {
    setStep(next);
    requestAnimationFrame(() => heading.current?.focus());
  }

  const today = drop?.today ?? eligibility?.today ?? shop?.today;
  const dropDates = drop?.dates.filter(date => !today || date.date >= today) ?? [];
  const dates = dropId ? dropDates : eligibility?.dates ?? [];
  const defaultDate = dropId ? dates.find(candidate => candidate.date === today)?.date : today;
  const savedDate = today && savedCart.date < today && !Object.keys(savedCart.items).length && !Object.keys(savedCart.addons).length
    ? "" : savedCart.date;
  const date = dropId && dates.length === 1 ? dates[0].date : savedDate || defaultDate || "";
  const day = dropDates.find(candidate => candidate.date === date);
  const slots = eligibility?.dates.find(candidate => candidate.date === date)?.slots ?? [];
  const pickup = dropId ? true : branch?.pickupEnabled;
  const delivery = dropId ? Boolean(drop?.deliveryEnabled && day?.dispatch) : branch?.deliveryEnabled;
  const method = !pickup && delivery ? "delivery" : pickup && !delivery ? "pickup" : savedCart.method;
  const slot = dropId ? "" : slots.length === 1 ? slots[0].id : savedCart.slot;
  const cart: Cart = { ...savedCart, date, method, slot };
  useEffect(() => {
    if (!hydrated || pending || !savedCart.date || (savedCart.date === date && savedCart.method === method && savedCart.slot === slot)) return;
    const normalized = { ...savedCart, date, method, slot };
    saveCart(locationId, dropId, normalized);
    void Promise.resolve().then(() => setCart(current => current === savedCart ? normalized : current));
  }, [savedCart, date, method, slot, dropId, hydrated, locationId, pending]);
  const windowLabel = dropId ? formatWindow(method === "delivery" ? day?.dispatch : day?.pickup) : slots.find(slot => slot.id === cart.slot)?.label ?? "";
  const validDate = dates.some(date => date.date === cart.date);
  const validMethod = method === "pickup" ? pickup : delivery;
  const validWindow = Boolean(validDate && validMethod && windowLabel);
  const dropOfferings = day?.offerings ?? [];
  const choices: Choice[] = dropId ? [...dropOfferings].sort((a, b) =>
    Number(b.orderable) - Number(a.orderable) || Number(b.kind === "package") - Number(a.kind === "package"),
  ).map(offering => ({
    key: offering.id, offeringId: offering.id, name: offering.name, sizeLabel: offering.sizeLabel,
    price: offering.priceCentavos, maximum: Math.min(99, offering.perOrderMax), available: offering.orderable,
    stock: { remaining: offering.remaining, limit: offering.perOrderMax },
    reason: offering.orderable ? undefined : stockReason(day, offering),
    image: offering.kind === "size" ? offering.images[0] : undefined,
    components: offering.components.map((component, index) => ({ ...component, image: offering.images[index] })),
  })) : regularChoices(shop, eligibility, locationId, cart.date);
  const addons: Choice[] = dropId ? (drop?.addons ?? []).map(addon => ({
    key: addon.addOnId, name: addon.name, icon: addon.icon, price: addon.priceCentavos, maximum: 99, available: Boolean(day?.orderingOpen),
  })) : (shop?.addOns ?? []).filter(addon => addon.locationIds.includes(locationId)).map(addon => ({
    key: addon.id, name: addon.name, icon: addon.icon, price: addon.priceCentavos, maximum: 99, available: true,
  }));
  const choiceMap = new Map(choices.map(choice => [choice.key, choice]));
  const addonMap = new Map(addons.map(addon => [addon.key, addon]));
  const unavailable = Object.entries(cart.items).filter(([key, value]) => {
    const choice = choiceMap.get(key);
    const stockCheckAtSubmit = Boolean(day?.orderingOpen && choice?.stock?.remaining === 0);
    return !choice || (!choice.available && !stockCheckAtSubmit) || value.quantity > choice.maximum || conflictKeys.includes(key);
  });
  const unavailableAddons = Object.keys(cart.addons).filter(key => !addonMap.get(key)?.available);
  const hasPriceChange = Object.entries(cart.items).some(([key, item]) => (pricesToReview[key] ?? choiceMap.get(key)?.price ?? item.price) !== item.price)
    || Object.entries(cart.addons).some(([key, item]) => (pricesToReview["addon:" + key] ?? addonMap.get(key)?.price ?? item.price) !== item.price);
  const readyToOrder = validWindow && (!dropId || day?.orderingOpen) && !refreshError
    && Object.keys(cart.items).length > 0 && !unavailable.length && !unavailableAddons.length && !hasPriceChange;
  const total = reviewedTotal(cart.items, cart.addons);
  const revised = (values: Cart["items"], map: Map<string, Choice>, prefix = "") => Object.fromEntries(
    Object.entries(values).map(([key, item]) => [key, { ...item, price: pricesToReview[prefix + key] ?? map.get(key)?.price ?? item.price }]),
  );
  const requested = !dropId && requestedProduct ? choices.filter(choice => choice.productId === requestedProduct && (!requestedSize || choice.sizeId === requestedSize)) : [];
  const pendingHere = pending && pending.locationId === locationId && pending.dropId === dropId;
  function contactChange(patch: Partial<Contact>) {
    setContact(current => ({ ...current, ...patch }));
    setContactErrors(current => ({ ...current,
      name: patch.customerName === undefined ? current.name : undefined,
      phone: patch.customerPhone === undefined ? current.phone : undefined,
      address: patch.deliveryAddress === undefined ? current.address : undefined,
    }));
  }

  function changeFeeChoice(choice: DeliveryFeeChoice) {
    setFeeChoice(choice);
    setContactErrors(current => ({ ...current, "delivery-fee": undefined, address: undefined }));
  }

  function quantityChange(group: "items" | "addons", key: string, quantity: number, price: number) {
    const values = { ...cart[group] };
    if (quantity === 0) delete values[key];
    else values[key] = { quantity, price: values[key]?.price ?? price };
    setConflictKeys(current => current.filter(value => value !== key));
    if (group === "items" && stockAdjustments[key]) {
      setStockAdjustments(current => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
    updateCart({ ...cart, [group]: values });
  }

  function reviewPrices() {
    updateCart({ ...cart, items: revised(cart.items, choiceMap), addons: revised(cart.addons, addonMap, "addon:") });
    setPricesToReview({});
  }

  function newAttempt(): PendingOrder {
    return {
      idempotencyKey: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2).padEnd(8, "0")}`, channel: dropId ? "drop" : "regular", locationId,
      dropId, fulfillmentDate: cart.date, fulfillment: method, slotId: dropId ? undefined : cart.slot,
      deliveryFeeMode: method === "delivery" && paysDriver ? "rider" : undefined,
      lines: Object.entries(cart.items).map(([key, item]) => {
        const choice = choiceMap.get(key)!;
        const amount = { quantity: item.quantity, unitPriceCentavos: item.price };
        return dropId ? { offeringId: key, ...amount } : { productId: choice.productId!, sizeId: choice.sizeId!, ...amount };
      }),
      addons: Object.entries(cart.addons).map(([id, item]) => ({ id, quantity: item.quantity, unitPriceCentavos: item.price })),
    };
  }

  function summarizeAttempt(attempt: PendingOrder): ReceiptSummary {
    const serviceDay = drop?.dates.find(candidate => candidate.date === attempt.fulfillmentDate);
    const window = attempt.channel === "drop"
      ? formatWindow(attempt.fulfillment === "delivery" ? serviceDay?.dispatch : serviceDay?.pickup)
      : eligibility?.dates.find(candidate => candidate.date === attempt.fulfillmentDate)?.slots
        .find(candidate => candidate.id === attempt.slotId)?.label
        ?? (attempt.slotId ? timeLabel(attempt.slotId) : "");
    return {
      location: fulfillmentLocation,
      date: attempt.fulfillmentDate,
      method: attempt.fulfillment,
      deliveryFeeMode: attempt.deliveryFeeMode,
      window,
      items: [
        ...attempt.lines.map(line => {
          const choice = choiceMap.get(lineKey(line));
          return {
            name: choice ? choiceLabel(choice) : "Pie or package",
            quantity: line.quantity,
            unitPriceCentavos: line.unitPriceCentavos,
            photos: choice?.components?.length ? packagePhotos(choice.components) : [choice?.image?.path ?? DEFAULT_PRODUCT_IMAGE.path],
          };
        }),
        ...attempt.addons.map(addon => ({
          name: addonMap.get(addon.id)?.name ?? "Add-on", quantity: addon.quantity, unitPriceCentavos: addon.unitPriceCentavos,
        })),
      ],
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked.current || (pending ? !pendingHere : !readyToOrder)) return;
    const delivery = (pending?.fulfillment ?? method) === "delivery";
    const details = {
      customerName: contact.customerName.trim(), customerPhone: contact.customerPhone.trim(),
      deliveryAddress: delivery ? contact.deliveryAddress.trim() : "", notes: contact.notes.trim(),
    };
    const errors: ContactErrors = {
      name: details.customerName ? undefined : "Enter your name.",
      phone: phoneNumberError(details.customerPhone) ?? (details.customerPhone.length > 20 ? "Enter up to 20 characters." : undefined),
      "delivery-fee": delivery && !pending && !feeChoice ? "Choose how you’ll pay the delivery fee." : undefined,
      address: delivery && (pending || feeChoice) && !details.deliveryAddress ? "Enter your delivery address." : undefined,
    };
    setContactErrors(errors);
    const firstInvalid = (["name", "phone", "delivery-fee", "address"] as const).find(field => errors[field]);
    if (firstInvalid) {
      requestAnimationFrame(() => {
        const field = firstInvalid === "delivery-fee"
          ? document.querySelector<HTMLElement>('#checkout-delivery-fee-options [role="radio"]')
          : document.getElementById("checkout-" + firstInvalid);
        field?.focus();
      });
      return;
    }
    locked.current = true;
    setSubmitting(true);
    setError("");
    setScheduleError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
    const attempt = pending ?? newAttempt();
    const { receiptSummary = summarizeAttempt(attempt), ...orderRequest } = attempt;
    savePending({ ...orderRequest, receiptSummary });
    setPending({ ...orderRequest, receiptSummary });
      const response = await fetch("/api/public/orders", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...orderRequest, ...details }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (response.ok && typeof body.orderNumber === "string" && /^MP-\d{7,}$/.test(body.orderNumber)) {
        rememberReceipt(body.orderNumber, body.submittedAfterHours === true, receiptSummary);
        clearSubmittedCart(attempt);
        savePending();
        router.replace("/order/status");
        return;
      }
      const rejection = response.status === 409 && ["price_change", "unavailable", "closed_ordering"].includes(body.error);
      if (rejection || (response.status === 400 && (!pending || body.replayChecked === true))) {
        savePending();
        setPending(undefined);
        if (body.error === "price_change") {
          const prices: Record<string, number> = {};
          for (const line of (body.lines ?? []) as PriceUpdate[]) if (typeof line.unitPriceCentavos === "number") prices[lineKey(line)] = line.unitPriceCentavos;
          for (const addon of (body.addons ?? []) as PriceUpdate[]) if (addon.id && typeof addon.unitPriceCentavos === "number") prices["addon:" + addon.id] = addon.unitPriceCentavos;
          setPricesToReview(prices);
          goTo(1);
        } else if (body.error === "unavailable") {
          const items = Object.fromEntries(attempt.lines.map(line => [lineKey(line), {
            quantity: line.quantity, price: line.unitPriceCentavos,
          }]));
          const adjustments: Record<string, StockAdjustment> = {};
          const conflicts: string[] = [];
          const submitted = new Set(attempt.lines.map(lineKey));
          const offerings: unknown[] = Array.isArray(body.offerings) ? body.offerings : [];
          for (const entry of offerings) {
            if (!entry || typeof entry !== "object" || !("id" in entry) || typeof entry.id !== "string"
              || !submitted.has(entry.id)) continue;
            const item = items[entry.id];
            const remaining = "remaining" in entry ? entry.remaining : undefined;
            if (!item || typeof remaining !== "number" || !Number.isInteger(remaining) || remaining < 0 || remaining >= item.quantity) {
              if (item) conflicts.push(entry.id);
              continue;
            }
            const choice = choiceMap.get(entry.id);
            adjustments[entry.id] = { name: choice ? choiceLabel(choice) : entry.id, remaining };
            if (remaining === 0) delete items[entry.id];
            else items[entry.id] = { ...item, quantity: remaining };
          }
          if (Object.keys(adjustments).length) {
            updateCart({ date: attempt.fulfillmentDate, method: attempt.fulfillment, slot: attempt.slotId ?? "", items,
              addons: Object.fromEntries(attempt.addons.map(addon => [addon.id, { quantity: addon.quantity, price: addon.unitPriceCentavos }])),
            });
            setStockAdjustments(current => ({ ...current, ...adjustments }));
          }
          setConflictKeys(conflicts);
          if (Object.keys(adjustments).length && !conflicts.length) {
            const nextStep = Object.keys(items).length ? 2 : 1;
            setStep(nextStep);
            requestAnimationFrame(() => {
              const notice = document.getElementById(nextStep === 2 ? "checkout-stock-review" : "checkout-stock-picker");
              (notice ?? heading.current)?.focus();
            });
          } else {
            setError("Availability changed. Review your selections before submitting again.");
            goTo(1);
          }
        } else {
          setScheduleError("This schedule is no longer available. Check the date and fulfillment window.");
          goTo(0);
        }
        await refresh();
      } else {
        setError(response.status === 429 ? "Too many attempts. Wait a moment, then retry this same order."
          : body.error === "idempotency_mismatch" ? "We couldn’t match this retry to the original order. Contact the shop before placing another."
          : response.status === 400 ? "Check your contact details and retry this same order."
          : "We couldn’t confirm whether the order went through. Retry this same order.");
        requestAnimationFrame(() => feedback.current?.focus());
      }
    } catch {
      setError("We couldn’t confirm whether the order went through. Retry this same order.");
      requestAnimationFrame(() => feedback.current?.focus());
    } finally {
      window.clearTimeout(timeout);
      locked.current = false;
      setSubmitting(false);
    }
  }

  const feedbackMessage = error ? <div ref={feedback} tabIndex={-1}><InlineError message={error} /></div> : null;
  const refreshMessage = refreshError ? <div>
    <InlineError message={refreshError} />
    <Button type="button" variant="link" onClick={() => void refresh()}>Refresh availability</Button>
  </div> : null;
  const priceNotice = (group: "items" | "addons", key: string, choice?: Choice) => {
    const previous = cart[group][key]?.price;
    const next = pricesToReview[group === "addons" ? "addon:" + key : key] ?? choice?.price;
    return previous !== undefined && next !== undefined && previous !== next
      ? `Price changed from ${pesos(previous)} to ${pesos(next)} each.` : undefined;
  };
  const choiceNotice = (group: "items" | "addons", choice: Choice) => {
    const adjustment = group === "items" ? stockAdjustments[choice.key] : undefined;
    const invalid = group === "items" ? unavailable.some(([key]) => key === choice.key) : unavailableAddons.includes(choice.key);
    return [
      adjustment ? adjustmentMessage(adjustment) : undefined,
      priceNotice(group, choice.key, choice),
      invalid ? "Adjust or remove this selection." : undefined,
    ].filter(Boolean).join(" ");
  };
  const privacy = <p className="text-sm text-muted-foreground">We use contact details to fulfill your order and remove them and your notes as soon as it is completed or cancelled. <Link href="/privacy" className="underline">Privacy Policy</Link></p>;

  const address = drop?.address ?? branch?.address;
  const methodLabel = method === "delivery" ? "Delivery dispatch" : "Pickup";
  const MethodIcon = method === "delivery" ? Truck : ShoppingBag;
  const dateOptions = dates.map(({ date }) => date);
  const todayUnavailable = !dropId && cart.date === today && !validDate;
  const dateError = !dates.length ? "No fulfillment dates are available right now."
    : todayUnavailable ? "No fulfillment times are available today. Choose another date."
    : cart.date && !validDate ? "Your saved date is unavailable. Choose a new date." : undefined;
  const orderingHours = dropId ? day && { opens: day.orderingOpens, cutoff: day.orderingCutoff } : eligibility?.todayOrderingWindow;
  const slotOptions = slots.map(candidate => ({ value: candidate.id, label: candidate.label }));
  const methods = [
    ...(pickup ? [{ value: "pickup", label: "Pickup" }] : []),
    ...(delivery ? [{ value: "delivery", label: "Delivery" }] : []),
  ];
  function changeDate(date: string) {
    const nextSlots = eligibility?.dates.find(candidate => candidate.date === date)?.slots ?? [];
    setScheduleError("");
    setStockAdjustments({});
    setConflictKeys([]);
    updateCart({ ...cart, date, slot: nextSlots.some(candidate => candidate.id === cart.slot) ? cart.slot : "" });
    void refresh();
  }
  const locationPicker = <div className={`grid gap-4 sm:grid-cols-2 ${styles.controls}`}>
    {(locations.length > 1 || !location) && <div className="grid gap-2">
      <Label htmlFor="checkout-location">Where are you ordering?</Label>
      <SelectField contentClassName={styles.checkoutSelect} id="checkout-location" label="Where are you ordering?" value={location?.id ?? ""} placeholder="Choose a location"
        options={locations.map(item => ({ value: item.id, label: item.kind === "regular" ? branchLabel(item.name) : item.name }))}
        onValueChange={id => router.push(checkoutHref(id))} />
    </div>}
    {events.length > 0 && <ScheduleField id="checkout-drop" label="Drop" value={events.some(event => event.id === dropId) ? dropId! : ""} placeholder="Choose a drop"
      options={events.map(event => ({ value: event.id, label: event.name }))}
      onChange={id => router.push(checkoutHref(locationId, id))} />}
    {props.notice && <p role="status" className="text-sm sm:col-span-2">{props.notice}</p>}
  </div>;
  const hasLocationPicker = locations.length > 1 || !location || events.length > 0 || Boolean(props.notice);
  const selectedCount = [...Object.values(cart.items), ...Object.values(cart.addons)]
    .reduce((sum, item) => sum + item.quantity, 0);
  const hasItems = selectedCount > 0;
  const hasAdjustments = Object.keys(stockAdjustments).length > 0;
  const removedLines = Object.entries(stockAdjustments).filter(([key]) => !cart.items[key]);
  const totalLabel = method === "delivery" ? "Subtotal" : "Total";
  const selectedLines = (["items", "addons"] as const).flatMap(group =>
    Object.entries(cart[group]).map(([key, value]) => ({
      group, key, value, choice: (group === "items" ? choiceMap : addonMap).get(key),
    })));
  function focusLineupClose(source: HTMLElement) {
    source.closest("[role=dialog]")?.querySelector<HTMLButtonElement>(".mobile-lineup-close")?.focus();
  }
  const branchName = branch?.name ?? (location?.kind === "regular" ? location.name : undefined);
  const fulfillmentLocation = drop?.name ?? (branchName ? branchLabel(branchName) : location?.name ?? "Choose a location");
  const mapUrl = drop?.mapUrl ?? branch?.mapUrl;
  const pickupDirections = method === "pickup" && mapUrl &&
    <a className="underline" href={mapUrl} target="_blank" rel="noreferrer">Pickup directions</a>;
  const pickupAddress = method === "pickup" && (address || pickupDirections) && <>
    {address && <AddressLines address={address} cebu={!drop && branch?.id === "cebu"} />}
    {pickupDirections}
  </>;
  const canChoosePies = dropId ? validDate : validWindow && !refreshError;
  const scheduleAction = {
    label: dropId && !day?.orderingOpen ? "View the lineup" : "Choose your pies",
    disabled: !canChoosePies,
    onClick: () => goTo(1),
  };
  const detailsAction = { label: "Continue to your details", disabled: !readyToOrder, onClick: () => goTo(2) };
  const reviewAction = { label: "Submit order", disabled: !readyToOrder || submitting, form: "checkout-submit" };
  const choosePies = <Button type="button" variant="ghost" className={styles.primary} disabled={scheduleAction.disabled} onClick={scheduleAction.onClick}>
    {scheduleAction.label} <ArrowRight aria-hidden />
  </Button>;
  const continueToDetails = <Button type="button" variant="ghost" className={styles.primary} disabled={detailsAction.disabled} onClick={detailsAction.onClick}>
    {detailsAction.label} <ArrowRight aria-hidden />
  </Button>;
  const submitOrder = <Button type="button" variant="ghost" className={`${styles.primary} w-full`} disabled={reviewAction.disabled} onClick={() => {
    const target = document.getElementById(reviewAction.form);
    if (target instanceof HTMLFormElement) {
      if (typeof target.requestSubmit === "function") target.requestSubmit();
      else target.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  }}>
    {reviewAction.label} <ArrowRight aria-hidden />
  </Button>;
  const mobileHint = step === 0 && !canChoosePies && !refreshError
    ? !validDate ? todayUnavailable ? "Choose another date to continue." : "Choose a date to continue." : !validMethod ? "Choose a fulfillment method to continue."
      : method === "delivery" ? "Choose a dispatch time to continue." : "Choose a pickup time to continue."
    : step === 1 && !readyToOrder && !Object.keys(cart.items).length && (!dropId || day?.orderingOpen)
      ? "Add a pie or box to continue."
      : step === 2 && method === "delivery" ? paysDriver ? "Pay the delivery fee directly to the driver." : "Delivery fee to be confirmed in chat." : undefined;

  return <section className={`wrap order-page ${styles.checkout}`}>
    <header className={`order-intro ${styles.intro}`}>
      <div>
        <h1>Order pies</h1>
        <p>{drop?.name ?? "Choose a schedule, pick your pies, and confirm with us in chat."}</p>
      </div>
      <BrandSeal alt="" width={48} height={48} />
    </header>
    {!hydrated ? <p role="status">Loading your cart…</p> : pending ? <form noValidate onSubmit={event => void submit(event)} className={`${styles.panel} max-w-3xl space-y-5`}>
      <h2 className="text-xl font-semibold">{submitting ? "Sending your order…" : "Resume your submission"}</h2>
      <p>We’re checking the same order. If you reloaded, re-enter the contact details and any notes you originally submitted.</p>
      <p className="text-sm">{dateLabel(pending.fulfillmentDate)} · {pending.fulfillment === "delivery" ? "Delivery" : "Pickup"} · {pending.fulfillment === "delivery" ? "Subtotal" : "Total"} {pesos(pending.lines.reduce((sum, item) => sum + item.unitPriceCentavos * item.quantity, 0) + pending.addons.reduce((sum, item) => sum + item.unitPriceCentavos * item.quantity, 0))}</p>
      {pendingHere ? <>
        <fieldset disabled={submitting}><ContactFields contact={contact} method={pending.fulfillment} change={contactChange} errors={contactErrors}
          feeChoice={pending.deliveryFeeMode ?? "unknown"} /></fieldset>
        {privacy}
        {feedbackMessage}
        <Button type="submit" variant="ghost" className={styles.primary} disabled={submitting}>{submitting ? "Submitting…" : "Retry this order"}</Button>
      </> : <p className="text-sm">This attempt belongs to another branch or drop. <Link className="underline" href={checkoutHref(pending.locationId, pending.dropId)}>Resume there</Link></p>}
      {!submitting && <p className="text-sm">Need help? Contact us through <ChatLinks /> before placing another order.</p>}
    </form> : <>
      {hasLocationPicker && (!isCheckout || drop?.status === "ended" ? locationPicker
        : step !== 0 && <div className={styles.desktopActions}>{locationPicker}</div>)}
      {drop?.status === "ended" ? <Alert><AlertDescription className="space-y-3">
        <p>This drop has ended.</p>
        <p className="flex flex-wrap gap-3"><Link href="/#upcoming-drops" className="underline">See upcoming events</Link><Link href="/order" className="underline">Order from Cebu</Link></p>
      </AlertDescription></Alert> : !isCheckout ? <p>Select an event to view its dates and offerings.</p> : <>
        <ol className={styles.steps} aria-label="Checkout steps">
          {steps.map((label, index) => <li key={label}>
            <button type="button" aria-current={step === index ? "step" : undefined} disabled={index > step}
              onClick={() => goTo(index)}>
              <span className={styles.stepIndex} aria-hidden>{index < step ? <Check size={15} /> : index + 1}</span><span className={styles.desktopStepLabel}>{label}</span><span className={styles.mobileStepLabel}>{compactSteps[index]}</span>
            </button>
          </li>)}
        </ol>
        <div className={styles.layout} data-review={step === 2}>
        <section className={`${step === 1 ? "min-w-0" : styles.panel} space-y-5`} aria-labelledby="checkout-step">
          <div className={styles.stepHeading}>
            <h2 ref={heading} id="checkout-step" tabIndex={-1}>{stepHeadings[step]}</h2>
          </div>
          {step === 0 && <>
            {hasLocationPicker && locationPicker}
            {drop && <p className="text-sm text-muted-foreground">Drop orders open on each fulfillment day. You can browse future dates.</p>}
            <FulfillmentCalendar date={cart.date} today={today} dates={dateOptions} error={dateError} change={changeDate} />
            {orderingHours && <p className="text-sm text-muted-foreground">
              {dropId ? "Online ordering for this date" : "Online ordering today"} opens at {timeLabel(orderingHours.opens)} and closes at {timeLabel(orderingHours.cutoff)} Manila time.
            </p>}
            {!dropId && eligibility && !orderingHours && <p className="text-sm text-muted-foreground">Same-day ordering is closed today.</p>}
            {validDate && <>
              <ScheduleField id="checkout-method" label="How would you like to get your pies?" value={method} options={methods}
                onChange={value => { setScheduleError(""); updateCart({ ...cart, method: value === "delivery" ? "delivery" : "pickup" }); }}
                error={!methods.length ? "Fulfillment is unavailable for this date." : undefined} />
              {!dropId && <ScheduleField id="checkout-slot" label={method === "delivery" ? "Delivery dispatch window" : "Pickup time"}
                value={windowLabel ? cart.slot : ""} options={slotOptions} placeholder="Choose a time"
                onChange={slot => { setScheduleError(""); updateCart({ ...cart, slot }); }}
                error={!slots.length ? "No times are available for this date. Choose another date." : cart.slot && !windowLabel ? "That time is no longer available. Choose a new time." : scheduleError} />}
            </>}
            {(dropId || !validDate) && <InlineError message={scheduleError} />}
            {refreshMessage}
            {dropId && day && <>
              {windowLabel && <p className="text-sm">{method === "delivery" ? "Delivery dispatch window" : "Pickup window"} · {windowLabel}</p>}
              <p className="text-sm">{day.orderingOpen ? day.offerings.some(item => item.orderable) ? "Ordering open for this date." : day.offerings.some(item => item.remaining > 0) ? "Ordering is unavailable for this date." : "Sold out for this date."
                : "Ordering is closed right now. You can still browse this date’s lineup."}</p>
            </>}
            {method === "delivery" ? <p className="text-sm text-muted-foreground">The shop books the rider. Arrival depends on rider availability and travel time.</p>
              : <p className="text-sm text-muted-foreground">Booking your own rider? Choose Pickup and send them to the pickup address.</p>}
            {pickupAddress && <div className={`${styles.mobileAddress} ${styles.summaryLine} text-sm`}><MapPin aria-hidden /><div>{pickupDirections || pickupAddress}</div></div>}
            {requested.length > 0 && <p className="text-sm">Looking for {choiceLabel(requested[0])}? Choose a date to check availability.</p>}
            <div className={`${styles.actions} ${styles.desktopActions}`}>{choosePies}</div>
          </>}
          {step === 1 && <>
            {hasAdjustments && <p id="checkout-stock-picker" tabIndex={-1} role="status" className="text-sm">Review the stock adjustments below.</p>}
            {validDate && <div className={`${styles.scheduleStrip} flex flex-wrap items-center justify-between gap-x-3 text-sm`}>
              <p className="flex items-center gap-2"><CalendarDays size={16} className="shrink-0" aria-hidden /> <span>{dateLabel(cart.date)} · {methodLabel}<span className={styles.desktopStepLabel}>{windowLabel && ` · ${windowLabel}`}</span></span></p>
              <Button type="button" variant="link" onClick={() => goTo(0)}>Change date</Button>
            </div>}
            {shop && choices.some(choice => choice.needsPreparation) && <p className="text-sm text-muted-foreground">
              Preorder pies need {shop.settings.preorderLeadDays} {shop.settings.preorderLeadDays === 1 ? "day" : "days"} to prepare. Choose a later date to order them.
            </p>}
            {!dropId && choices.filter(choice => choice.available).length === 0 && <p>No pies are available on this date.</p>}
            {dropId && <p className={`text-sm text-muted-foreground ${day?.orderingOpen ? styles.desktopStepLabel : ""}`}>{day?.orderingOpen ? "Stock can change until the order is submitted." : "Preview only. Orders open on the selected date during its ordering hours."}</p>}
            <div className="grid gap-3">
              {choices.filter(choice => dropId || choice.available || cart.items[choice.key]).map(choice => <ChoiceRow key={choice.key} choice={choice}
                quantity={cart.items[choice.key]?.quantity ?? 0} change={quantity => quantityChange("items", choice.key, quantity, choice.price)}
                limitReached={Object.keys(cart.items).length >= 40} notice={choiceNotice("items", choice)} />)}
            </div>
            {removedLines.filter(([key]) => !choiceMap.has(key)).map(([key, adjustment]) => <div key={key} className="text-sm">
              <p className="font-semibold">{adjustment.name}</p><InlineError message={adjustmentMessage(adjustment)} />
            </div>)}
            {unavailable.filter(([key]) => !choiceMap.has(key)).map(([key, item]) => <div key={key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <InlineError message={`Saved selection · ${item.quantity} selected. This item is no longer available.`} />
              <Button type="button" variant="outline" onClick={() => quantityChange("items", key, 0, 0)}>Remove</Button>
            </div>)}
            {!dropId && choices.some(choice => !choice.available && !cart.items[choice.key]) && <Collapsible className="rounded-sm border p-3">
              <CollapsibleTrigger render={<Button type="button" variant="ghost" className="min-h-11" />}>Unavailable for this date <ChevronDown aria-hidden /></CollapsibleTrigger>
              <CollapsibleContent className="space-y-3">
                {choices.filter(choice => !choice.available && !cart.items[choice.key]).map(choice => <ChoiceRow key={choice.key} choice={choice}
                  quantity={0} change={() => {}} limitReached />)}
                <Button type="button" variant="link" onClick={() => goTo(0)}>Change date</Button>
              </CollapsibleContent>
            </Collapsible>}
            {(addons.length > 0 || unavailableAddons.length > 0) && <section className="space-y-3" aria-labelledby="checkout-addons">
              <h3 id="checkout-addons" className="text-lg font-semibold">Optional extras</h3>
              {addons.map(addon => <ChoiceRow key={addon.key} choice={addon} quantity={cart.addons[addon.key]?.quantity ?? 0}
                change={quantity => quantityChange("addons", addon.key, quantity, addon.price)} limitReached={Object.keys(cart.addons).length >= 20} notice={choiceNotice("addons", addon)} />)}
              {unavailableAddons.filter(id => !addonMap.has(id)).map(id => <div className="flex flex-wrap items-center gap-2" key={id}>
                <p className="text-sm">{id} is no longer available.</p><Button type="button" variant="outline" onClick={() => quantityChange("addons", id, 0, 0)}>Remove extra</Button>
              </div>)}
            </section>}
            {hasPriceChange && <div className="space-y-2 rounded-sm border p-3">
              <p className="font-semibold">Review updated prices</p>
              <p className="text-sm">Updated {method === "delivery" ? "subtotal" : "total"} · {pesos(reviewedTotal(revised(cart.items, choiceMap), revised(cart.addons, addonMap, "addon:")))}</p>
              <Button type="button" variant="outline" onClick={reviewPrices}>Use updated prices</Button>
            </div>}
            {feedbackMessage}
            {refreshMessage}
            <div className={`${styles.actions} ${styles.desktopActions}`}>
              <Button type="button" variant="ghost" onClick={() => goTo(0)}><ArrowLeft aria-hidden /> Back</Button>
              {continueToDetails}
            </div>
          </>}
          {step === 2 && <form noValidate id="checkout-submit" className="space-y-5" onSubmit={event => void submit(event)}>
            <ContactFields contact={contact} method={method} change={contactChange} errors={contactErrors}
              feeChoice={feeChoice} changeFeeChoice={changeFeeChoice} />
            {privacy}
          </form>}
        </section>
        <aside className={`${styles.panel} ${styles.summary} space-y-4`} aria-labelledby="checkout-summary">
          <h2 id="checkout-summary" className="text-xl font-semibold">{step === 2 ? "Order summary" : "Your order"}</h2>
          <div className={styles.summarySchedule}>
            <div className={styles.scheduleColumn}>
              <p className={styles.summaryLine}><Store aria-hidden /> <span>{fulfillmentLocation}</span></p>
              {pickupAddress && <div className={styles.summaryLine}><MapPin aria-hidden /><div>{pickupAddress}</div></div>}
            </div>
            <div className={styles.scheduleColumn}>
              {validDate && <p className={styles.summaryLine}><CalendarDays aria-hidden /> <span>{dateLabel(cart.date)}</span></p>}
              {validMethod && <p className={styles.summaryLine}><MethodIcon aria-hidden /> <span>{methodLabel}{windowLabel && <span className="block text-muted-foreground">{windowLabel}</span>}</span></p>}
            </div>
            {step === 2 && <Button variant="outline" className="min-h-11" type="button" onClick={() => goTo(0)}>Edit schedule</Button>}
          </div>
          {step === 2 && hasAdjustments && <p id="checkout-stock-review" tabIndex={-1} role="status" className="text-sm">Review the updated quantities and total before submitting again.</p>}
          {hasItems ? <ul>
            {selectedLines.map(({ group, key, value, choice }) => {
              return <li key={group + ":" + key} className={styles.summaryItem}>
                {choice && <CheckoutPhoto choice={choice} compact />}
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold">{choice ? choiceLabel(choice) : "Saved selection"}</p>
                  <p className="text-muted-foreground tabular-nums">{value.quantity} × {pesos(value.price)}</p>
                  {step === 2 && <InlineError message={choice ? choiceNotice(group, choice) : "This selection is unavailable. Edit your items to remove it."} />}
                  {step === 2 && choice?.components?.map((component, index) => <p key={index} className="text-muted-foreground">{component.quantity} × {component.name} · {component.sizeLabel} per package</p>)}
                </div>
                <span className={styles.summaryAmount}>{pesos(value.quantity * value.price)}</span>
              </li>;
            })}
            {step === 2 && removedLines.map(([key, adjustment]) => <li key={key} className="py-3 text-sm">
              <p className="font-semibold">{adjustment.name}</p><InlineError message={adjustmentMessage(adjustment)} />
            </li>)}
          </ul> : <div className={styles.empty}><ShoppingBag size={24} aria-hidden /> <p>No items yet.</p></div>}
          {step === 2 && <Button variant="link" type="button" onClick={() => goTo(1)}>Edit pies and extras</Button>}
          {hasItems && <p className={styles.summaryTotal}>
            <span>{totalLabel}</span><span className="tabular-nums">{pesos(total)}</span>
          </p>}
          {method === "delivery" && <DeliveryFeeNotice paysDriver={paysDriver} />}
          {step === 2 && <>
            {feedbackMessage}
            {refreshMessage}
            {!validWindow && <InlineError message="Edit your schedule to select an available date and time." />}
            {dropId && validWindow && !day?.orderingOpen && <InlineError message="Ordering is closed for this date." />}
            <div className={styles.desktopActions}>{submitOrder}</div>
          </>}
        </aside>
        </div>
        <MobileLineup count={selectedCount} amount={pesos(total)} totalLabel={totalLabel} fallbackFocus={heading}
          action={step === 0 ? scheduleAction : step === 1 ? detailsAction : reviewAction} hint={mobileHint}>
          <ul className="mobile-lineup-items">
            {selectedLines.map(({ group, key, value, choice }) => {
              const label = choice ? choiceLabel(choice) : "Saved selection";
              const blocked = group === "items" && conflictKeys.includes(key);
              const warning = !choice?.available ? choice?.reason ?? (choice?.needsPreparation ? "Choose a later date for this preorder pie." : "This selection is unavailable.")
                : value.quantity > choice.maximum || blocked ? "Stock has changed. Adjust this selection." : undefined;
              return <li key={group + ":" + key}>
                <div className="mobile-lineup-item">
                  {choice && <CheckoutPhoto choice={choice} compact />}
                  <div>
                    <strong>{label}</strong>
                    {choice?.components?.map((component, index) => <p key={index}>{component.quantity} × {component.name} · {component.sizeLabel}</p>)}
                  </div>
                  <strong>{pesos(value.quantity * value.price)}</strong>
                </div>
                {warning && <p className="mobile-lineup-warning">{warning}</p>}
                <div className="mobile-lineup-controls">
                  <Button type="button" variant="outline" size="icon" className="size-11 rounded-[4px] bg-white" aria-label={`Remove ${label}`}
                    onClick={event => {
                      focusLineupClose(event.currentTarget);
                      quantityChange(group, key, 0, value.price);
                    }}><Trash2 aria-hidden /></Button>
                  <Quantity label={label} value={value.quantity} max={choice?.maximum ?? 0}
                    change={quantity => quantityChange(group, key, quantity, value.price)} disabled={!choice?.available || blocked} onEmpty={focusLineupClose} />
                </div>
              </li>;
            })}
            {step === 2 && removedLines.map(([key, adjustment]) => <li key={key} className="py-3 text-sm">
              <p className="font-semibold">{adjustment.name}</p><InlineError message={adjustmentMessage(adjustment)} />
            </li>)}
          </ul>
          {method === "delivery" && <div className="mt-4"><DeliveryFeeNotice paysDriver={paysDriver} /></div>}
          {validDate && <section className="mobile-lineup-logistics">
            <h3>Your schedule</h3>
            <p className={styles.summaryLine}><Store aria-hidden /> <span>{fulfillmentLocation} · {dateLabel(cart.date)}</span></p>
            {validMethod && <p className={styles.summaryLine}><MethodIcon aria-hidden /> <span>{methodLabel}{windowLabel && <span className="block text-muted-foreground">{windowLabel}</span>}</span></p>}
            {pickupAddress && <div className="mt-2 text-sm">{pickupAddress}</div>}
          </section>}
        </MobileLineup>
      </>}
    </>}
  </section>;
}
