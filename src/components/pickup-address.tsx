export function PickupAddress({ name, address, legacy = false }: { name: string; address?: string; legacy?: boolean }) {
  return (
    <section className="min-w-0 space-y-2 rounded-xl bg-butter/60 p-4 text-sm leading-relaxed text-charcoal [overflow-wrap:anywhere]" aria-label="Pickup address">
      <h3 className="font-semibold">Pickup address</h3>
      <p className="font-medium">{name}</p>
      <p>{address?.trim() || "Pickup address to be confirmed. Please contact Makalipie before arranging collection."}</p>
      <p>{legacy ? "This is the outlet address. This older delivery order retains its previously arranged delivery terms." : "Collect your order here after confirmation, or book your own courier to this address. Makalipie does not provide delivery or collect a drop-off address."}</p>
    </section>
  );
}
