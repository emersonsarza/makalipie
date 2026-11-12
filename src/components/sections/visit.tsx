"use client";
import Image from "next/image";
import { ArrowUpRight, CalendarDays, Clock, MapPin, ShoppingBag, Truck } from "lucide-react";
import { AddressLines } from "@/components/address-lines";
import { ThemeLink as Link } from "@/components/site-theme";
import { checkoutHref, dropStateLabels, type DropSummary } from "@/lib/public/checkout";
import { usePublicShop } from "@/components/public-shop-provider";
import { dropEventAnchor, eventCountdown, locationAnchor, type PublicLocations } from "@/lib/popups/locations";
import { popupDateRange } from "@/lib/popups/schema";

function Directions({ href, name, className = "" }: { href: string; name: string; className?: string }) {
  return <a href={href} target="_blank" rel="noreferrer" className={`brand-button outline-button ${className}`}>
    Get directions <ArrowUpRight size={17} aria-hidden /><span className="sr-only">for {name} (opens in a new tab)</span>
  </a>;
}

function EventAddress({ address, city }: { address: string; city?: string }) {
  const compact = address.split(/\r?\n/).map(line => line.trim()).filter(Boolean).join(", ");
  const words = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const cityWords = city ? words(city) : "";
  const showCity = cityWords && !` ${words(compact)} `.includes(` ${cityWords} `);
  return <p className="location-detail-line"><MapPin size={16} strokeWidth={1.5} aria-hidden /><span>{compact}{showCity && ` · ${city}`}</span></p>;
}

function compactDropDates(dates: string[], today: string) {
  const groups = new Map<string, string[]>();
  for (const date of dates) {
    const month = date.slice(0, 7);
    const group = groups.get(month);
    if (group) group.push(date);
    else groups.set(month, [date]);
  }
  return [...groups].map(([month, datesInMonth]) => {
    const label = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(month + "-01T00:00:00Z"));
    const days = datesInMonth.map(date => Number(date.slice(-2)));
    const consecutive = days.every((day, index) => day === days[0] + index);
    const dayLabel = days.length === 1 ? String(days[0])
      : consecutive ? `${days[0]}–${days.at(-1)}`
      : `${days.slice(0, -1).join(", ")} & ${days.at(-1)}`;
    return `${label} ${dayLabel}${month.slice(0, 4) === today.slice(0, 4) ? "" : ", " + month.slice(0, 4)}`;
  }).join(" · ");
}

type UpcomingEvent = { kind: "popup"; data: PublicLocations["upcoming"][number] } | { kind: "drop"; data: DropSummary };

function EventCard({ event, today, wide, preview }: { event: UpcomingEvent; today: string; wide: boolean; preview: boolean }) {
  const item = event.data;
  const drop = event.kind === "drop" ? event.data : undefined;
  const popup = event.kind === "popup" ? event.data : undefined;
  const open = drop?.ordering === "open";
  const countdown = drop ? eventCountdown(today, drop.nextDate) : popup ? eventCountdown(today, popup.startDate, popup.endDate) : null;
  const FulfillmentIcon = drop?.deliveryEnabled ? Truck : ShoppingBag;

  return <article id={popup ? locationAnchor(item.id) : dropEventAnchor(item.id)} tabIndex={-1}
    className={`location-event-card location-anchor${wide ? " location-event-card--wide" : ""}`}>
    <div className="location-event-content">
      <div className="location-event-heading">
        <p className="location-event-type">{drop ? "Drop" : "Pop-up"}</p>
        <h4>{item.name}</h4>
      </div>
      <div className="location-event-badges">
        {countdown && <span className="popup-event-countdown"><Clock size={13} aria-hidden />{countdown}</span>}
        {drop && <span className="location-event-status" data-open={open}>{dropStateLabels[drop.ordering]}</span>}
      </div>
      <div className="location-event-details">
        <p className="location-detail-line"><CalendarDays size={16} strokeWidth={1.5} aria-hidden /><span>
          {drop ? compactDropDates(drop.dates, today) : popup && popupDateRange(popup.startDate, popup.endDate)}
        </span></p>
        {drop && <p className="location-detail-line"><FulfillmentIcon size={16} strokeWidth={1.5} aria-hidden /><span>{drop.deliveryEnabled ? "Pickup or delivery" : "Pickup only"}</span></p>}
        {popup && <p className="location-detail-line"><Clock size={16} strokeWidth={1.5} aria-hidden /><span>{popup.hours}</span></p>}
        <EventAddress address={item.address} city={item.city} />
      </div>
    </div>
    {(item.mapUrl || (drop && !preview)) && <div className="location-event-actions">
      {item.mapUrl && (drop
        ? <a className="location-event-directions" href={item.mapUrl} target="_blank" rel="noreferrer">Directions<span className="sr-only"> for {item.name} (opens in a new tab)</span></a>
        : <Directions href={item.mapUrl} name={item.name} className="location-event-button" />)}
      {drop && !preview && <Link className={`brand-button location-event-button${open ? "" : " outline-button"}`} href={checkoutHref(drop.locationId, drop.id)}>
        {open ? "Order this drop" : "View drop"} <ArrowUpRight size={17} aria-hidden />
      </Link>}
    </div>}
  </article>;
}

function UpcomingEvents({ popups, drops, today, preview }: { popups: PublicLocations["upcoming"]; drops: DropSummary[]; today: string; preview: boolean }) {
  const events: UpcomingEvent[] = [
    ...popups.map(data => ({ kind: "popup" as const, data })),
    ...drops.map(data => ({ kind: "drop" as const, data })),
  ];
  if (!events.length) return null;
  const open = (event: UpcomingEvent) => event.kind === "drop" && event.data.ordering === "open";
  const date = (event: UpcomingEvent) => event.kind === "drop" ? event.data.nextDate : event.data.startDate;
  events.sort((left, right) => Number(open(right)) - Number(open(left))
    || date(left).localeCompare(date(right)) || left.data.name.localeCompare(right.data.name));
  const wide = (event: UpcomingEvent) => events.length === 1 || (events.length >= 3 && open(event));
  const columns = Math.max(1, Math.min(3, events.filter(event => !wide(event)).length));

  return <section id="upcoming-drops" className="location-events location-anchor" aria-labelledby="location-events-heading">
    <div className="section-heading"><h3 id="location-events-heading">Upcoming events</h3></div>
    <div className="location-event-grid" data-columns={columns}>
      {events.map(event => <EventCard key={`${event.kind}:${event.data.id}`} event={event} today={today} wide={wide(event)} preview={preview} />)}
    </div>
  </section>;
}

export function VisitSection({ drops = [], today, preview = false }: { drops?: DropSummary[]; today: string; preview?: boolean }) {
  const shop = usePublicShop();
  const branches = (shop.branches ?? []).filter(branch => branch.visible && branch.id === "cebu");
  return <section id="visit" className="visit-section section-space location-section"><div className="wrap">
    <div className="section-heading">
      <div><p className="eyebrow">YOUR LITTLE PIE STOP</p><h2>Visit us in Cebu.</h2></div>
    </div>
    {branches.map(branch => <article key={branch.id} id={locationAnchor(branch.id)} tabIndex={-1} className="visit-layout location-anchor">
      <div className="visit-photo">
        <Image src="/images/brand/table.webp" alt="Makalipie tarts on an outdoor café table surrounded by greenery" fill sizes="(max-width: 767px) 100vw, 55vw" />
      </div>
      <div className="visit-details">
        <h3>Makalipie Cebu</h3>
        <p className="visit-location-intro">Come for a pie. Stay for a little while.</p>
        {branch.address && <p className="location-detail-line"><MapPin size={16} strokeWidth={1.5} aria-hidden /><AddressLines address={branch.address} pairCommaParts={branch.id === "cebu"} /></p>}
        {branch.hoursLabel && <div className="opening-hours"><span className="location-detail-line"><Clock size={16} strokeWidth={1.5} aria-hidden />Opening hours</span><span>{branch.hoursLabel}</span></div>}
        {(branch.mapUrl || !preview) && <div className="visit-actions">
          {branch.mapUrl && <Directions href={branch.mapUrl} name="Makalipie Cebu" />}
          {!preview && <Link href="/order" className="brand-button">Order in Cebu <ArrowUpRight size={17} aria-hidden /></Link>}
        </div>}
      </div>
    </article>)}
    <UpcomingEvents popups={shop.locations?.upcoming ?? []} drops={drops} today={today} preview={preview} />
  </div></section>;
}
