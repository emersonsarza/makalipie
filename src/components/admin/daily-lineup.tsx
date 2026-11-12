"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminSelect } from "@/components/admin/admin-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { lineup } from "@/lib/orders/query";
import type { StoreCatalog } from "@/lib/storefront/types";
import type { DropStore } from "@/lib/drops/types";
import { useAdminQuery, useAdminToday } from "./query-provider";

type Lineup = Awaited<ReturnType<typeof lineup>>;

function Totals({ title, rows }: { title: string; rows: { name: string; quantity: number }[] }) {
  return <section className="space-y-2"><h3 className="font-semibold">{title}</h3>
    {rows.length ? <Table><TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Quantity</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map((row, index) => <TableRow key={index}><TableCell>{row.name}</TableCell><TableCell className="text-right">{row.quantity}</TableCell></TableRow>)}</TableBody>
    </Table> : <p className="text-sm text-muted-foreground">No items.</p>}</section>;
}

export function DailyLineup() {
  const today = useAdminToday();
  const [chosenDate, setDate] = useState<string>();
  const date = chosenDate ?? today;
  const [selection, setSelection] = useState("");
  const query = useAdminQuery<Lineup>("/api/admin/lineup?date=" + date, !!date);
  const result = query.data;
  const error = query.isError && !result ? "Could not load the lineup." : "";
  const locations = useAdminQuery<StoreCatalog>("/api/admin/catalog").data?.locations ?? [];
  const drops = useAdminQuery<DropStore>("/api/admin/drops").data?.drops ?? [];
  const groups = result?.groups.filter(group => !selection || selection === "location:" + group.locationId || selection === "drop:" + group.dropId) ?? [];
  return <div className="space-y-6">
    <div className="flex flex-wrap gap-4">
      <div className="space-y-2"><Label htmlFor="lineup-date">Fulfillment date</Label><Input id="lineup-date" type="date" value={date} onChange={event => { setDate(event.target.value); }} /></div>
      <div className="space-y-2"><Label htmlFor="lineup-location">Location or drop</Label><AdminSelect id="lineup-location" label="Location or drop" value={selection} onValueChange={setSelection} options={[
        { value: "", label: "All locations and drops" },
        ...locations.map(location => ({ value: "location:" + location.id, label: location.name })),
        ...drops.map(drop => ({ value: "drop:" + drop.id, label: drop.name })),
      ]} /></div>
    </div>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : !date ? <p>Select a date.</p> : !result ? <Skeleton className="h-48" /> : !groups.length ? <p>No confirmed or completed orders for this selection.</p> : groups.map(group => (
      <section key={group.locationId + ":" + group.dropId} className="space-y-4 rounded-lg border bg-white p-5">
        <h2 className="text-lg font-semibold">{drops.find(drop => drop.id === group.dropId)?.name ?? group.dropId ?? locations.find(location => location.id === group.locationId)?.name ?? group.locationId}</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4"><h3 className="text-lg font-semibold">Packing</h3><Totals title="Packages" rows={group.packing.packages} /><Totals title="Individual pies" rows={group.packing.pies} /><Totals title="Add-ons" rows={group.packing.addons} /></div>
          <Totals title="Baking" rows={group.baking} />
        </div>
      </section>
    ))}
  </div>;
}
