"use client";
import Image from "next/image";
import { ArrowUpRight, CalendarDays, Clock, MapPin } from "lucide-react";
import { AddressLines } from "@/components/address-lines";
import { DropNotice } from "@/components/customer-policy";
import { usePublicShop } from "@/components/public-shop-provider";
import { locationAnchor } from "@/lib/popups/locations";
import { popupDateRange, type PopupListing } from "@/lib/popups/schema";

function Directions({ href, name, className = "location-directions" }: { href: string; name: string; className?: string }) {
  return <a href={href} target="_blank" rel="noreferrer" className={`brand-button outline-button ${className}`}>
    Get directions <ArrowUpRight size={17} aria-hidden /><span className="sr-only">for {name} (opens in a new tab)</span>
  </a>;
}

function Popups({ title, items }: { title: string; items: PopupListing[] }) {
  if (!items.length) return null;
  return <section className="location-popup-group" aria-label={title}>
    <div className="section-heading popup-heading"><div><p className="eyebrow">A LITTLE PIE, AROUND TOWN</p><h3>{title}</h3></div></div>
    <div className="location-popup-list">{items.map(popup => {
      const [year, month, day] = popup.startDate.split("-");
      const monthLabel = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(`${year}-${month}-01T12:00:00Z`));
      const sameMonth = popup.startDate.slice(0, 7) === popup.endDate.slice(0, 7);
      const days = popup.startDate === popup.endDate ? Number(day) : sameMonth ? `${Number(day)}–${Number(popup.endDate.slice(-2))}` : Number(day);
      return <article key={popup.id} id={locationAnchor(popup.id)} tabIndex={-1} className="location-popup-row location-anchor">
        <div className="popup-date-mark" aria-hidden="true"><span>{monthLabel}</span><strong>{days}</strong><span>{year}</span></div>
        <div className="popup-event-details">
          <h4>{popup.name}</h4>
          <p className="location-detail-line"><CalendarDays size={16} strokeWidth={1.5} aria-hidden /><span>{popupDateRange(popup.startDate, popup.endDate)}</span></p>
          <p className="location-detail-line"><Clock size={16} strokeWidth={1.5} aria-hidden /><span>{popup.hours}</span></p>
          <p className="location-detail-line"><MapPin size={16} strokeWidth={1.5} aria-hidden /><AddressLines address={popup.address} /></p>
        </div>
        {popup.mapUrl && <Directions href={popup.mapUrl} name={popup.name} className="popup-directions" />}
      </article>;
    })}</div>
  </section>;
}
export function VisitSection() {
  const shop = usePublicShop();
  const branches = (shop.branches ?? []).filter(branch => branch.visible && branch.id === "cebu");
  return <section id="visit" className="visit-section section-space location-section"><div className="wrap">
    <div className="section-heading"><div><p className="eyebrow">YOUR LITTLE PIE STOP</p><h2>Visit us in Cebu.</h2></div>
    </div>
    {branches.map(branch => <article key={branch.id} id={locationAnchor(branch.id)} tabIndex={-1} className="visit-layout location-anchor">
      <div className="visit-photo">
        <Image src="/images/brand/table.webp" alt="Makalipie tarts on an outdoor café table surrounded by greenery" fill sizes="(max-width: 767px) 100vw, 55vw" />
      </div>
      <div className="visit-details">
        <h3>Makalipie Cebu</h3>
        <p className="visit-location-intro">Come for a pie. Stay for a little while.</p>
        {branch.address && <p className="location-detail-line"><MapPin size={16} strokeWidth={1.5} aria-hidden /><AddressLines address={branch.address} /></p>}
        {branch.hoursLabel && <div className="opening-hours"><span className="location-detail-line"><Clock size={16} strokeWidth={1.5} aria-hidden />Opening hours</span><span>{branch.hoursLabel}</span></div>}
        {branch.mapUrl && <Directions href={branch.mapUrl} name="Makalipie Cebu" />}
        <DropNotice branchId={branch.id} />
      </div>
    </article>)}
    <div className="location-content">
      <Popups title="Popups" items={shop.locations?.upcoming ?? []} />
      <Popups title="Recent popups" items={shop.locations?.recent ?? []} />
    </div>
  </div></section>;
}
