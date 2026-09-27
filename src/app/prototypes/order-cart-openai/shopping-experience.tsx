"use client";

import Image from "next/image";
import { tryCopySummary } from "./clipboard";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Copy,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  availabilityReason,
  availabilityText,
  manilaDate,
  quoteSelection,
} from "@/lib/catalog/rules";
import type { Addon, Catalog, Selection } from "@/lib/catalog/schema";
import { deliveryOptions, paymentMethods, pickupTimes, site } from "@/lib/site";

export type ExperienceProps = { catalog: Catalog | null; unavailable: boolean };
type Direction = "side" | "bottom" | "builder";
type Extras = Selection["addons"];
const money = (value: number) =>
  `₱${(value / 100).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
const keyOf = (p: string, v: string) => `${p}:${v}`;
const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function ExtrasEditor({
  options,
  value,
  onChange,
  prefix,
  quantity = 1,
}: {
  options: Addon[];
  value: Extras;
  onChange: (value: Extras) => void;
  prefix: string;
  quantity?: number;
}) {
  return (
    <div className="pc-extras">
      {options.map((addon) => {
        const selected = value.find((a) => a.id === addon.id);
        return (
          <div key={addon.id}>
            <Label className="pc-extra-label" htmlFor={`${prefix}-${addon.id}`}>
              <Checkbox
                id={`${prefix}-${addon.id}`}
                checked={!!selected}
                onCheckedChange={(checked) =>
                  onChange(
                    checked
                      ? [...value, { id: addon.id, message: "" }]
                      : value.filter((a) => a.id !== addon.id),
                  )
                }
              />
              <span>
                {addon.name}
                <small>
                  +{money(addon.priceCentavos * quantity)}{" "}
                  {addon.scope === "per_item" ? `for ${quantity}` : "per order"}
                  {addon.minLeadDays
                    ? ` · ${addon.minLeadDays} days preparation`
                    : ""}
                </small>
                {addon.allergens.length > 0 && (
                  <small>Contains: {addon.allergens.join(", ")}</small>
                )}
              </span>
            </Label>
            {selected && addon.customization.enabled && (
              <div className="pc-field">
                <Label htmlFor={`${prefix}-${addon.id}-message`}>
                  {addon.customization.label}
                  {addon.customization.required ? " (required)" : " (optional)"}
                </Label>
                <Input
                  id={`${prefix}-${addon.id}-message`}
                  maxLength={addon.customization.maxLength}
                  value={selected.message}
                  onChange={(e) =>
                    onChange(
                      value.map((a) =>
                        a.id === addon.id
                          ? { ...a, message: e.target.value }
                          : a,
                      ),
                    )
                  }
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ShoppingExperience({
  catalog,
  unavailable,
  direction,
}: ExperienceProps & { direction: Direction }) {
  const data = catalog ?? { initialized: false, products: [], addons: [] };
  const products = data.products.filter((p) => p.active);
  const [lines, setLines] = useState<Selection["lines"]>([]);
  const [addons, setAddons] = useState<Extras>([]);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"cart" | "details" | "summary">("cart");
  const [date, setDate] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [details, setDetails] = useState({
    name: "",
    contact: "",
    time: "",
    delivery: "pickup",
    address: "",
    payment: "bank",
    notes: "",
  });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) titleRef.current?.focus();
  }, [step, open]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const quote = quoteSelection(data, {
    lines,
    addons,
    date: date || manilaDate(),
  });
  const eligibleOrderAddons = data.addons.filter(
    (a) =>
      a.active &&
      a.scope === "per_order" &&
      lines.some((line) =>
        products
          .find((p) => p.id === line.productId)
          ?.allowedAddonIds.includes(a.id),
      ),
  );
  const updateDetail = (field: keyof typeof details, value: string) => {
    setDetails((d) => ({ ...d, [field]: value }));
    setError("");
  };
  function changeQty(productId: string, variantId: string, quantity: number) {
    const next = lines.filter(
      (line) =>
        keyOf(line.productId, line.variantId) !== keyOf(productId, variantId),
    );
    const previous = lines.find(
      (line) =>
        keyOf(line.productId, line.variantId) === keyOf(productId, variantId),
    );
    if (quantity > 0)
      next.push({
        productId,
        variantId,
        quantity: Math.min(100, quantity),
        addons: previous?.addons ?? [],
      });
    // Preserve display order when updating a line and remove incompatible order extras.
    const originalOrder = lines.map((line) =>
      keyOf(line.productId, line.variantId),
    );
    next.sort((a, b) => {
      const rank = (line: Selection["lines"][number]) => {
        const index = originalOrder.indexOf(
          keyOf(line.productId, line.variantId),
        );
        return index < 0 ? originalOrder.length : index;
      };
      return rank(a) - rank(b);
    });
    setLines(next);
    setAddons((current) =>
      current.filter((a) =>
        next.some((l) =>
          products
            .find((p) => p.id === l.productId)
            ?.allowedAddonIds.includes(a.id),
        ),
      ),
    );
    setError("");
    setCopied(false);
  }
  function add(productId: string, variantId: string) {
    const line = lines.find(
      (l) => l.productId === productId && l.variantId === variantId,
    );
    changeQty(productId, variantId, (line?.quantity ?? 0) + 1);
    setNotice(
      `${products.find((p) => p.id === productId)?.name} added. ${count + 1} in your box.`,
    );
    setStep("cart");
  }
  const subtotal = (
    <>
      <span>Known subtotal</span>
      <strong>{money(quote.knownSubtotalCentavos)}</strong>
    </>
  );
  const summary = [
    "Makalipie Order · Prototype preview",
    "",
    `Name: ${details.name.trim()}`,
    `Contact: ${details.contact.trim()}`,
    `Preferred date & time: ${date} · ${details.time}`,
    "",
    ...quote.lines,
    ...quote.addonLines,
    "",
    `Delivery: ${deliveryOptions.find((d) => d.id === details.delivery)?.label}`,
    details.delivery === "lalamove"
      ? `Address: ${details.address.trim()}`
      : "Pickup: 2nd Floor, Streetscape, Banilad",
    `Payment preference: ${paymentMethods.find((p) => p.id === details.payment)?.label}`,
    details.notes.trim() ? `Notes: ${details.notes.trim()}` : "",
    `Known subtotal: ${money(quote.knownSubtotalCentavos)}`,
    quote.quoteRequired ? "Quoted items: price to confirm." : "",
    "Availability, delivery fees and payment to be confirmed on Instagram.",
  ]
    .filter(Boolean)
    .join("\n");
  function review() {
    const issues = [...quote.errors];
    if (!lines.length) issues.unshift("Add at least one pie to your box.");
    if (
      !details.name.trim() ||
      !details.contact.trim() ||
      !date ||
      !details.time
    )
      issues.unshift(
        "Enter your name, contact number, preferred date and time.",
      );
    if (details.delivery === "lalamove" && !details.address.trim())
      issues.unshift("Enter your delivery address.");
    if (issues.length) {
      setError(issues.join(" "));
      return;
    }
    setError("");
    setCopied(false);
    setCopyFailed(false);
    setStep("summary");
  }
  async function copy() {
    const success = await tryCopySummary(summary);
    setCopied(success);
    setCopyFailed(!success);
    if (!success) {
      summaryRef.current?.focus();
      summaryRef.current?.select();
    }
  }
  const cartTrigger = (className: string) => (
    <SheetTrigger
      render={<Button className={className} variant="default" />}
      aria-label={`Open your box, ${count} items`}
    >
      <ShoppingBag aria-hidden />
      <span>
        Your box <Badge variant="outline">{count}</Badge>
      </span>
      <strong>{money(quote.knownSubtotalCentavos)}</strong>
      <ArrowUpRight aria-hidden />
    </SheetTrigger>
  );

  return (
    <div className={`cart-prototype pc-${direction}`}>
      <Sheet open={open} onOpenChange={setOpen}>
        <header className="pc-header">
          <a
            href="#pc-menu"
            className="pc-wordmark"
            aria-label="Makalipie menu"
          >
            <Image src="/brand/seal.png" alt="" width={46} height={46} />
            <span>
              makalipie<small>TARTS & PIES · CEBU</small>
            </span>
          </a>
          <span className="pc-header-note">Handmade, with a happy heart.</span>
          {cartTrigger("pc-header-cart")}
        </header>
        <main className="pc-main">
          <section className="pc-hero">
            <div>
              <p className="pc-eyebrow">A LITTLE BOX OF HAPPINESS</p>
              <h1>
                Good things.
                <br />
                <span>By the pie.</span>
              </h1>
              <p>
                Something bright. Something chocolatey.
                <br />
                Pick your favourites. We’ll take care of the crust.
              </p>
              <a href="#pc-menu" className="pc-text-link">
                Find your little treat <ArrowRight size={17} />
              </a>
            </div>
            <div className="pc-hero-photo">
              <Image
                src="/images/brand/gift.webp"
                alt="A gift box of Makalipie tarts"
                fill
                priority
                sizes="(max-width: 700px) 100vw, 45vw"
              />
              <span>
                Made to share.
                <br />
                Or keep. ♡
              </span>
            </div>
          </section>
          <div className="pc-shop-layout">
            <div id="pc-menu" className="pc-menu">
              <nav className="pc-category-nav" aria-label="Menu categories">
                <a href="#pc-sweet">
                  Sweet tarts{" "}
                  <span>
                    {products.filter((p) => p.category === "sweet").length}
                  </span>
                </a>
                <a href="#pc-savory">
                  Savoury pies{" "}
                  <span>
                    {products.filter((p) => p.category === "savory").length}
                  </span>
                </a>
                <span>BAKED IN CEBU</span>
              </nav>
              {!products.length && (
                <Alert>
                  <AlertDescription>
                    {unavailable
                      ? "We couldn’t load the menu. Please refresh to try again, or message us on Instagram."
                      : "Our menu is being updated. Please check back soon."}{" "}
                    <a
                      href={site.instagramDmUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Message Makalipie
                    </a>
                  </AlertDescription>
                </Alert>
              )}
              {(["sweet", "savory"] as const).map((category) => (
                <section
                  id={`pc-${category}`}
                  key={category}
                  className="pc-category"
                >
                  <div className="pc-section-heading">
                    <div>
                      <p className="pc-eyebrow">
                        {category === "sweet"
                          ? "FOR THE EVERYDAY LITTLE TREAT"
                          : "SOMETHING HEARTY, SOMETHING HOMEMADE"}
                      </p>
                      <h2>
                        {category === "sweet"
                          ? "Sweet by nature."
                          : "A savoury little moment."}
                      </h2>
                    </div>
                    <span>
                      {category === "sweet"
                        ? "A buttery crust. A happy ending."
                        : "Worth gathering around."}
                    </span>
                  </div>
                  <div className="pc-product-grid">
                    {products
                      .filter((p) => p.category === category)
                      .map((product) => (
                        <article className="pc-product" key={product.id}>
                          <div className="pc-product-photo">
                            <Image
                              src={product.image.url}
                              alt={product.image.alt}
                              fill
                              unoptimized
                              sizes="(max-width: 600px) 100vw, (max-width: 1100px) 45vw, 30vw"
                            />
                            {lines.some((l) => l.productId === product.id) && (
                              <Badge className="pc-photo-badge">
                                <Check size={12} /> In your box
                              </Badge>
                            )}
                          </div>
                          <h3>{product.name}</h3>
                          <p>{product.blurb}</p>
                          <small>
                            {availabilityText(product)}
                            {product.allergens.length
                              ? ` · Contains ${product.allergens.join(", ")}`
                              : ""}
                          </small>
                          {product.publicNotes && (
                            <small>{product.publicNotes}</small>
                          )}
                          <div className="pc-sizes">
                            {product.variants
                              .filter((v) => v.active)
                              .map((variant) => {
                                const qty =
                                  lines.find(
                                    (l) =>
                                      l.productId === product.id &&
                                      l.variantId === variant.id,
                                  )?.quantity ?? 0;
                                const reason = date
                                  ? availabilityReason(product, variant, date)
                                  : null;
                                return (
                                  <div key={variant.id}>
                                    <div className="pc-size-row">
                                      <div>
                                        <span>{variant.label}</span>
                                        <strong>
                                          {variant.pricingMode === "fixed"
                                            ? money(variant.priceCentavos!)
                                            : "Price to confirm"}
                                        </strong>
                                      </div>
                                      <Button
                                        variant={qty ? "secondary" : "outline"}
                                        onClick={() =>
                                          add(product.id, variant.id)
                                        }
                                        disabled={!!reason || qty >= 100}
                                        aria-label={`Add ${product.name}, ${variant.label}`}
                                      >
                                        <Plus size={15} /> Add
                                        {qty ? ` · ${qty}` : ""}
                                      </Button>
                                    </div>
                                    {(reason || variant.minLeadDays > 0) && (
                                      <small
                                        className={
                                          reason ? "pc-error-text" : ""
                                        }
                                      >
                                        {reason ||
                                          `${variant.minLeadDays} days preparation`}
                                      </small>
                                    )}
                                  </div>
                                );
                              })}
                            {!product.variants.some((v) => v.active) && (
                              <Badge variant="outline">
                                Currently unavailable
                              </Badge>
                            )}
                          </div>
                        </article>
                      ))}
                  </div>
                </section>
              ))}
            </div>
            {direction === "builder" && (
              <aside className="pc-builder-summary">
                <p className="pc-eyebrow">A LITTLE OF WHAT YOU LOVE</p>
                <h2>Your happy box.</h2>
                {count ? (
                  <ul>
                    {lines.map((l) => (
                      <li key={keyOf(l.productId, l.variantId)}>
                        <span>
                          {l.quantity} ×{" "}
                          {products.find((p) => p.id === l.productId)?.name}
                          <small>
                            {
                              products
                                .find((p) => p.id === l.productId)
                                ?.variants.find((v) => v.id === l.variantId)
                                ?.label
                            }
                          </small>
                        </span>
                        <Check size={15} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="pc-builder-empty">
                    <Image
                      src="/brand/seal.png"
                      width={100}
                      height={100}
                      alt=""
                    />
                    <p>
                      A tart for you.
                      <br />A pie for someone you love.
                    </p>
                  </div>
                )}
                <Separator />
                <div className="pc-total">{subtotal}</div>
                {cartTrigger("pc-builder-trigger")}
                <small>
                  Choose your date and finishing touches in your box.
                </small>
              </aside>
            )}
          </div>
          <footer className="pc-page-footer">
            <Image src="/brand/seal.png" alt="" width={60} height={60} />
            <div>
              <h2>From our kitchen, with love.</h2>
              <p>Pickup at Streetscape, Banilad · Delivery via Lalamove</p>
            </div>
            <a
              href={site.instagramDmUrl}
              target="_blank"
              rel="noreferrer"
              className="pc-text-link"
            >
              Say hello <ArrowUpRight size={17} />
            </a>
          </footer>
        </main>
        {direction !== "side" && (
          <div className="pc-bottom-dock">{cartTrigger("pc-dock-trigger")}</div>
        )}
        <div
          role="status"
          aria-live="polite"
          className={`pc-notice ${notice ? "pc-notice-visible" : ""}`}
        >
          {notice && (
            <>
              <Check size={15} />
              {notice}
            </>
          )}
        </div>
        <SheetContent
          initialFocus={titleRef}
          side={direction === "bottom" ? "bottom" : "right"}
          className={`pc-sheet pc-sheet-${direction}`}
        >
          <SheetHeader className="pc-sheet-header">
            <p className="pc-eyebrow">
              YOUR LITTLE LINEUP · {count} {count === 1 ? "ITEM" : "ITEMS"}
            </p>
            <SheetTitle ref={titleRef} tabIndex={-1} className="pc-sheet-title">
              {step === "cart"
                ? "A box of good things."
                : step === "details"
                  ? "Make it yours."
                  : "Ready to say hello."}
            </SheetTitle>
            <SheetDescription>
              {step === "cart"
                ? "A little extra joy? There’s always room."
                : step === "details"
                  ? "Tell us when and where. We’ll confirm on Instagram."
                  : "Copy your order, then send it to us on Instagram."}
            </SheetDescription>
          </SheetHeader>
          <div className="pc-sheet-scroll" key={step}>
            {step === "cart" && (
              <>
                {!count ? (
                  <div className="pc-empty">
                    <Image
                      src="/images/brand/gift.webp"
                      alt="A box waiting for your favourite tarts"
                      width={440}
                      height={260}
                    />
                    <h3>Your next happy moment starts here.</h3>
                    <p>Add something delicious from the menu.</p>
                    <Button onClick={() => setOpen(false)}>
                      Explore the menu <ArrowRight />
                    </Button>
                  </div>
                ) : (
                  <>
                    {lines.map((line) => {
                      const product = products.find(
                        (p) => p.id === line.productId,
                      )!;
                      const variant = product.variants.find(
                        (v) => v.id === line.variantId,
                      )!;
                      const id = keyOf(line.productId, line.variantId);
                      return (
                        <div className="pc-cart-line" key={id}>
                          <div className="pc-line-top">
                            <Image
                              src={product.image.url}
                              alt=""
                              unoptimized
                              width={76}
                              height={76}
                            />
                            <div>
                              <h3>{product.name}</h3>
                              <p>{variant.label}</p>
                              <strong>
                                {variant.pricingMode === "fixed"
                                  ? money(
                                      variant.priceCentavos! * line.quantity,
                                    )
                                  : "Price to confirm"}
                              </strong>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove ${product.name}, ${variant.label}`}
                              onClick={() =>
                                changeQty(product.id, variant.id, 0)
                              }
                            >
                              <Trash2 />
                            </Button>
                          </div>
                          <div className="pc-line-controls">
                            <small>
                              {variant.pricingMode === "fixed"
                                ? `${money(variant.priceCentavos!)} each`
                                : "We’ll confirm the price"}
                            </small>
                            <div className="pc-stepper">
                              <Button
                                variant="ghost"
                                aria-label={`Decrease ${product.name}, ${variant.label}`}
                                onClick={() =>
                                  changeQty(
                                    product.id,
                                    variant.id,
                                    line.quantity - 1,
                                  )
                                }
                              >
                                <Minus />
                              </Button>
                              <span>{line.quantity}</span>
                              <Button
                                variant="ghost"
                                disabled={line.quantity >= 100}
                                aria-label={`Increase ${product.name}, ${variant.label}`}
                                onClick={() =>
                                  changeQty(
                                    product.id,
                                    variant.id,
                                    line.quantity + 1,
                                  )
                                }
                              >
                                <Plus />
                              </Button>
                            </div>
                          </div>
                          <ExtrasEditor
                            prefix={id}
                            quantity={line.quantity}
                            options={data.addons.filter(
                              (a) =>
                                a.active &&
                                a.scope === "per_item" &&
                                product.allowedAddonIds.includes(a.id),
                            )}
                            value={line.addons}
                            onChange={(value) =>
                              setLines((current) =>
                                current.map((l) =>
                                  keyOf(l.productId, l.variantId) === id
                                    ? { ...l, addons: value }
                                    : l,
                                ),
                              )
                            }
                          />
                        </div>
                      );
                    })}
                    {eligibleOrderAddons.length > 0 && (
                      <section className="pc-finishing">
                        <p className="pc-eyebrow">THE FINISHING TOUCHES</p>
                        <h3>A little more thoughtful.</h3>
                        <ExtrasEditor
                          options={eligibleOrderAddons}
                          value={addons}
                          onChange={setAddons}
                          prefix="order"
                        />
                      </section>
                    )}
                  </>
                )}
              </>
            )}
            {step === "details" && (
              <form
                id="pc-details"
                onSubmit={(e) => {
                  e.preventDefault();
                  review();
                }}
                noValidate
                className="pc-details"
              >
                <Button
                  variant="ghost"
                  className="pc-back"
                  onClick={() => {
                    setStep("cart");
                    setError("");
                  }}
                >
                  <ArrowLeft /> Back to your box
                </Button>
                <div className="pc-field">
                  <Label htmlFor="pc-name">Your name</Label>
                  <Input
                    id="pc-name"
                    autoComplete="name"
                    value={details.name}
                    onChange={(e) => updateDetail("name", e.target.value)}
                  />
                </div>
                <div className="pc-field">
                  <Label htmlFor="pc-contact">Contact number</Label>
                  <Input
                    id="pc-contact"
                    type="tel"
                    autoComplete="tel"
                    value={details.contact}
                    onChange={(e) => updateDetail("contact", e.target.value)}
                  />
                </div>
                <div className="pc-two-fields">
                  <div className="pc-field">
                    <Label htmlFor="pc-date">Preferred date</Label>
                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                      <PopoverTrigger
                        render={
                          <Button
                            id="pc-date"
                            variant="outline"
                            className="pc-date-button"
                          />
                        }
                      >
                        <CalendarDays />
                        {date || "Choose date"}
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={
                            date ? new Date(`${date}T12:00:00`) : undefined
                          }
                          disabled={(d) => localDate(d) < manilaDate()}
                          onSelect={(d) => {
                            setDate(d ? localDate(d) : "");
                            setCalendarOpen(false);
                            setError("");
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="pc-field">
                    <Label htmlFor="pc-time">Preferred time</Label>
                    <NativeSelect
                      id="pc-time"
                      value={details.time}
                      onChange={(e) => updateDetail("time", e.target.value)}
                    >
                      <option value="">Choose time</option>
                      {pickupTimes.map((time) => (
                        <option key={time}>{time}</option>
                      ))}
                    </NativeSelect>
                  </div>
                </div>
                {date && quote.errors.length > 0 && (
                  <Alert>
                    <AlertDescription>
                      {quote.errors.join(" ")}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="pc-field">
                  <Label htmlFor="pc-delivery">How will it get to you?</Label>
                  <NativeSelect
                    id="pc-delivery"
                    value={details.delivery}
                    onChange={(e) => updateDetail("delivery", e.target.value)}
                  >
                    {deliveryOptions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </NativeSelect>
                  <small>
                    {
                      deliveryOptions.find((d) => d.id === details.delivery)
                        ?.detail
                    }
                  </small>
                </div>
                {details.delivery === "lalamove" && (
                  <div className="pc-field">
                    <Label htmlFor="pc-address">Delivery address</Label>
                    <Textarea
                      id="pc-address"
                      autoComplete="street-address"
                      value={details.address}
                      onChange={(e) => updateDetail("address", e.target.value)}
                    />
                  </div>
                )}
                <div className="pc-field">
                  <Label htmlFor="pc-payment">Payment preference</Label>
                  <NativeSelect
                    id="pc-payment"
                    value={details.payment}
                    onChange={(e) => updateDetail("payment", e.target.value)}
                  >
                    {paymentMethods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="pc-field">
                  <Label htmlFor="pc-notes">Anything else? (optional)</Label>
                  <Textarea
                    id="pc-notes"
                    placeholder="A special occasion, a little request…"
                    value={details.notes}
                    onChange={(e) => updateDetail("notes", e.target.value)}
                  />
                </div>
              </form>
            )}
            {step === "summary" && (
              <div className="pc-summary">
                <Button variant="ghost" onClick={() => setStep("details")}>
                  <ArrowLeft /> Edit order details
                </Button>
                <Label htmlFor="pc-summary">Your order summary</Label>
                <Textarea
                  ref={summaryRef}
                  id="pc-summary"
                  readOnly
                  value={summary}
                  className="pc-summary-text"
                />
                <Alert>
                  <AlertDescription>
                    This is an order request. Availability, payment and delivery
                    fees are confirmed by Makalipie.
                  </AlertDescription>
                </Alert>
                <p role="status">
                  {copied
                    ? "Copied! Your order is ready to paste into Instagram."
                    : copyFailed
                      ? "Automatic copying wasn’t available. Select and copy the summary above."
                      : "Nothing is sent automatically."}
                </p>
                <a
                  className="pc-text-link"
                  href={site.instagramDmUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Instagram <ArrowUpRight />
                </a>
              </div>
            )}
            {error && (
              <Alert
                ref={errorRef}
                tabIndex={-1}
                className="pc-validation"
                role="alert"
              >
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          {count > 0 && (
            <SheetFooter className="pc-sheet-footer">
              <div className="pc-total">{subtotal}</div>
              <p>
                {quote.quoteRequired
                  ? "Quoted items are additional · prices to confirm."
                  : "Delivery fees, if any, are confirmed separately."}
              </p>
              {step === "cart" ? (
                <Button
                  className="pc-primary-cta"
                  onClick={() => setStep("details")}
                >
                  Continue to order details <ArrowRight />
                </Button>
              ) : step === "details" ? (
                <Button
                  className="pc-primary-cta"
                  type="submit"
                  form="pc-details"
                >
                  Review your order <ArrowRight />
                </Button>
              ) : (
                <Button className="pc-primary-cta" onClick={copy}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied to clipboard" : "Copy order summary"}
                </Button>
              )}
              {step === "cart" && (
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Keep browsing
                </Button>
              )}
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
