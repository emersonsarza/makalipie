"use client";
import { ArrowUpRight, Clock, MapPin } from "lucide-react";
import { AddressLines } from "@/components/address-lines";
import { usePublicShop } from '@/components/public-shop-provider';
export type DropWindow={branchId:string;orderingOpensAt:string|null;orderingClosesAt:string|null;fulfillmentDates:string[];nextAnnouncement:string|null;state:'open'|'upcoming'|'closed'|'sold_out'};
import type { CustomerPackage } from "@/components/customer-packages";
export type PublicExperience={featuredProductIds?:string[];seasonalNote?:string;drops?:DropWindow[];packages?:CustomerPackage[];packageCheckoutEnabled?:boolean};
export function DropNotice({branchId}:{branchId:string}){const shop=usePublicShop();const drop=shop.experience?.drops?.find(d=>d.branchId===branchId);if(!drop)return null;return <div className="rounded-xl border border-charcoal/15 bg-butter/40 p-4 text-sm" role="status"><strong>{drop.state==='open'?'Orders are open for this drop.':drop.state==='sold_out'?'This drop is sold out.':drop.state==='upcoming'?'The next drop is planned.':'Orders are currently closed.'}</strong>{drop.orderingOpensAt&&drop.state==='upcoming'&&<p>Orders open {new Date(drop.orderingOpensAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})} (Manila time).</p>}{drop.orderingClosesAt&&drop.state==='open'&&<p>Order by {new Date(drop.orderingClosesAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})} (Manila time), while stock lasts.</p>}{drop.fulfillmentDates.length>0?<p>Fulfillment dates: {drop.fulfillmentDates.join(', ')}</p>:drop.state!=='open'&&<p>{drop.nextAnnouncement||'Next drop to be announced.'}</p>}</div>;}
export function VisibleBranches(){const shop=usePublicShop();const branches=shop.branches;if(!branches)return null;return <div className="grid gap-5" aria-label="Our visible branches">{branches.filter(b=>b.visible).map(branch=><section key={branch.id} className="space-y-2"><h3 className="font-semibold">{branch.name}</h3>{branch.address&&<p className="location-detail-line"><MapPin size={14} strokeWidth={1.5} aria-hidden /><AddressLines address={branch.address} /></p>}{branch.hoursLabel&&<p className="location-detail-line"><Clock size={14} strokeWidth={1.5} aria-hidden /><span>{branch.hoursLabel}</span></p>}{branch.mapUrl&&<a href={branch.mapUrl} target="_blank" rel="noreferrer" className="location-footer-directions">Get directions <ArrowUpRight size={14} aria-hidden /><span className="sr-only">for {branch.name} (opens in a new tab)</span></a>}<DropNotice branchId={branch.id}/></section>)}</div>;}
export function PackingExplanation(){return <p className="text-xs text-charcoal/65">Every four 4-inch sweet pies share one box. Remaining pies each have an individual container: six pies means one box and two containers. Savory pies are packed separately; large pies have individual custom boxes.</p>;}
export function PackingBreakdown({lines,packageCount=0}:{lines:{size:string;category:'sweet'|'savory';quantity:number}[];packageCount?:number}) {
  const isSmall = (size:string) => /^4(?:[- ]?inch|[″"])?$/i.test(size.trim());
  const isLarge = (size:string) => /^10(?:[- ]?inch|[″"])?$/i.test(size.trim());
  const small = lines.filter(l => l.category === 'sweet' && isSmall(l.size)).reduce((sum,l) => sum+l.quantity,0);
  const large = lines.filter(l => l.category === 'sweet' && isLarge(l.size)).reduce((sum,l) => sum+l.quantity,0);
  const savory = lines.filter(l => l.category === 'savory').reduce((sum,l) => sum+l.quantity,0);
  const unknown = lines.some(l => l.quantity > 0 && l.category === 'sweet' && !isSmall(l.size) && !isLarge(l.size));
  const boxes = Math.floor(small/4)+packageCount;
  if (!lines.some(l => l.quantity > 0) && !packageCount) return null;
  return <div className="space-y-2 py-3 text-sm"><ul className="space-y-1">
    {boxes > 0 && <li>{boxes} {boxes === 1 ? 'box' : 'boxes'} of four pies</li>}
    {small%4 > 0 && <li>{small%4} individual {small%4 === 1 ? 'container' : 'containers'}</li>}
    {large > 0 && <li>{large} custom {large === 1 ? 'box' : 'boxes'} for large pies</li>}
    {savory > 0 && <li>{savory} savory {savory === 1 ? 'pie, packed separately' : 'pies, packed separately'}</li>}
  </ul>{unknown && <p>We’ll confirm the packaging for your selected sizes in chat.</p>}</div>;
}
