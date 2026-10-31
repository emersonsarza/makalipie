import { AddressLines } from "@/components/address-lines";
import { MapPin } from "lucide-react";

export function PickupAddress({ name, address, hoursLabel, mapUrl, legacy = false }: { name: string; address?: string; hoursLabel?: string; mapUrl?: string; legacy?: boolean }) {
  void legacy;
  return <section className="min-w-0 space-y-2 rounded-xl bg-butter/60 p-4 text-sm leading-relaxed text-charcoal [overflow-wrap:anywhere]" aria-label="Pickup address"><h3 className="flex items-center gap-2 font-semibold"><MapPin size={16} aria-hidden />Pickup address</h3><p className="font-medium">{name}</p>{address?.trim() ? <p><AddressLines address={address} /></p> : <p>Pickup address to be confirmed. Please contact Makalipie before arranging collection.</p>}{hoursLabel && <p>{hoursLabel}</p>}{mapUrl && <a className="underline" href={mapUrl} target="_blank" rel="noreferrer">Get directions ↗</a>}<p>Booking your own Grab or Lalamove? Choose Pickup and send them to this address.</p></section>;
}
