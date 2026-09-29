"use client";

import Image from "next/image";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Addon } from "@/lib/catalog/schema";

export function CatalogAddonOptions({
  addons,
  selected,
  messages,
  prefix,
  quantity = 1,
  toggle,
  message,
}: {
  addons: Addon[];
  selected: string[];
  messages: Record<string, string>;
  prefix: string;
  quantity?: number;
  toggle: (id: string) => void;
  message: (id: string, value: string) => void;
}) {
  return (
    <div className="space-y-3">
      {addons.map((addon) => {
        const checkId = `${prefix}-${addon.id}-selected`;
        return (
          <div key={addon.id} className="rounded-xl bg-butter/60 p-3">
            <div className="flex min-h-11 items-center gap-3">
              <Checkbox
                id={checkId}
                checked={selected.includes(addon.id)}
                aria-label={addon.name}
                onCheckedChange={() => toggle(addon.id)}
              />
              <Label htmlFor={checkId} className="h-auto cursor-pointer items-center gap-3 font-normal">
                <Image src={addon.image.url} alt="" unoptimized width={36} height={36} className="rounded-md object-cover" />
                <span className="text-sm">
                  <strong>{addon.name}</strong>
                  <span className="block text-charcoal/70">
                    +₱{(addon.priceCentavos * quantity / 100).toLocaleString("en-PH")}
                    {addon.scope === "per_item" ? ` for ${quantity} ${quantity === 1 ? "pie" : "pies"}` : " per order"}
                    {addon.minLeadDays > 0 ? ` · ${addon.minLeadDays} days preparation` : ""}
                  </span>
                  {addon.allergens.length > 0 && <span className="block text-xs">Contains: {addon.allergens.join(", ")}</span>}
                </span>
              </Label>
            </div>
            {selected.includes(addon.id) && addon.customization.enabled ? (
              <div className="mt-3 space-y-2">
                <Label htmlFor={`${prefix}-${addon.id}`}>
                  {addon.customization.label}
                  {addon.customization.required ? " (required)" : " (optional)"}
                </Label>
                <Input
                  id={`${prefix}-${addon.id}`}
                  maxLength={addon.customization.maxLength}
                  required={addon.customization.required}
                  value={messages[addon.id] ?? ""}
                  onChange={(e) => message(addon.id, e.target.value)}
                />
                <p className="text-xs text-charcoal/60">
                  {(messages[addon.id] ?? "").length}/{addon.customization.maxLength} characters
                  {addon.scope === "per_item" ? " · Same message for each pie in this line." : ""}
                </p>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
