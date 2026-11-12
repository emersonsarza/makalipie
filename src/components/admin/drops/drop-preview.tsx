"use client";

import Image from "next/image";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminSelect } from "@/components/admin/admin-select";
import { Skeleton } from "@/components/ui/skeleton";
import type { presentDrop } from "@/lib/drops/present";
import dayjs from "@/lib/dayjs";
import { Field } from "../catalog/catalog-ui";
import { useAdminQuery } from "../query-provider";
import { OrderRequestError, pesos } from "../orders-data";

type Preview = NonNullable<ReturnType<typeof presentDrop>>;

export function DropPreview({ slug }: { slug: string }) {
  const [selected, setSelected] = useState("");
  const query = useAdminQuery<Preview>("/api/admin/drops/preview?slug=" + encodeURIComponent(slug), !!slug);
  const drop = query.data;
  const error = query.isError && !drop ? query.error instanceof OrderRequestError && query.error.status === 404 ? "This drop was not found." : "Could not load the drop preview." : "";
  if (!slug || error) return <div className="space-y-3">
    <Alert variant="destructive"><AlertDescription>{error || "Choose a saved drop to preview."}</AlertDescription></Alert>
    {slug && <Button variant="outline" onClick={() => { void query.refetch(); }}>Try again</Button>}
  </div>;
  if (!drop) return <Skeleton className="h-56" />;
  const date = drop.dates.find(item => item.date === selected) ?? drop.dates[0];

  return <div className="mx-auto max-w-5xl space-y-5">
    <Alert><AlertTitle>Read-only drop preview</AlertTitle><AlertDescription>This preview shows the saved drop. Ordering is unavailable here.</AlertDescription></Alert>
    <header className="space-y-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-semibold">{drop.name}</h2><Badge variant="outline">{drop.status}</Badge></div>
      <p className="text-sm">{drop.address}</p>
      {drop.mapUrl && <a href={drop.mapUrl} target="_blank" rel="noreferrer" className="text-sm underline">Open pickup map</a>}
    </header>
    {date ? <>
      <div className="max-w-xs"><Field label="Preview date"><AdminSelect label="Preview date" value={date.date} onValueChange={setSelected}
        options={drop.dates.map(item => ({ value: item.date, label: dayjs(item.date).format("MMM D, YYYY") }))} /></Field></div>
      <dl className="grid gap-3 rounded-lg border bg-background p-4 text-sm sm:grid-cols-3">
        <div><dt className="text-muted-foreground">Ordering hours (Manila)</dt><dd>{date.orderingOpens}–{date.orderingCutoff}</dd></div>
        <div><dt className="text-muted-foreground">Pickup window</dt><dd>{date.pickup.starts}–{date.pickup.ends}</dd></div>
        {date.dispatch && <div><dt className="text-muted-foreground">Dispatch window</dt><dd>{date.dispatch.starts}–{date.dispatch.ends}</dd></div>}
      </dl>
      {date.offerings.length ? <div className="grid gap-4 sm:grid-cols-2">
        {date.offerings.map(offering => <Card key={offering.id}>
          <CardHeader><CardTitle>{offering.name}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">{offering.images.map((image, index) => <Image key={index} src={image.path} alt={image.alt} width={72} height={72} className="size-[72px] rounded-md object-cover" />)}</div>
            <p className="font-semibold">{pesos(offering.priceCentavos)}</p>
            <p className="text-sm text-muted-foreground">{offering.remaining > 0 ? `${offering.remaining} remaining` : "Sold out"} · Maximum {offering.perOrderMax} per order</p>
            {offering.kind === "package" && <p className="text-xs text-muted-foreground">Four pies per box. No substitutions.</p>}
          </CardContent>
        </Card>)}
      </div> : <p className="text-sm text-muted-foreground">No offerings are included on this date.</p>}
    </> : <p className="text-sm text-muted-foreground">This draft has no dates yet.</p>}
    {!!drop.addons.length && <section className="space-y-2"><h3 className="font-semibold">Add-ons</h3><ul className="divide-y">
      {drop.addons.map(item => <li key={item.addOnId} className="flex justify-between gap-2 py-2 text-sm"><span>{item.name}</span><span>{pesos(item.priceCentavos)}</span></li>)}
    </ul></section>}
  </div>;
}
