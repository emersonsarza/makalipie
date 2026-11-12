"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { AdminOrder } from "@/lib/orders/query";
import { adminRequest, OrderRequestError, writeOrder } from "./orders-data";

export type SavedDeliveryFee = Pick<AdminOrder, "id" | "updatedAt" | "deliveryFeeMode" | "deliveryFeeCentavos" | "totalCentavos">;

function eligible(order: AdminOrder) {
  return order.fulfillment === "delivery" && order.payment === "unpaid"
    && (order.status === "pending" || order.status === "confirmed");
}

function feeInCentavos(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) && result <= 2147483647 ? result : null;
}

export function DeliveryFeeEditor({ order, disabled, onWorkingChange, onSaved, onReload }: {
  order: AdminOrder;
  disabled: boolean;
  onWorkingChange: (working: boolean) => void;
  onSaved: (saved: SavedDeliveryFee, version: string) => void;
  onReload: (latest: AdminOrder, version: string) => void;
}) {
  const [draft, setDraft] = useState<{ version: string; amount: string; rider: boolean }>();
  const [error, setError] = useState("");
  const amountField = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const riderId = useId();
  const allowed = eligible(order);
  const { version, amount, rider } = draft ?? {
    version: order.updatedAt,
    amount: order.deliveryFeeCentavos === null ? "" : (order.deliveryFeeCentavos / 100).toFixed(2),
    rider: order.deliveryFeeMode === "rider",
  };
  const fee = feeInCentavos(amount.trim());
  const proposedTotal = rider ? order.subtotalCentavos : fee === null ? null : order.subtotalCentavos + fee;
  const changed = rider ? order.deliveryFeeMode !== "rider"
    : order.deliveryFeeMode !== "known" || fee !== order.deliveryFeeCentavos;

  function edit(patch: { amount?: string; rider?: boolean }) {
    setDraft({ version, amount, rider, ...patch });
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allowed || disabled || !changed) return;
    if (proposedTotal === null || proposedTotal > 2147483647) {
      setError("Enter a valid fee in pesos with up to two decimal places.");
      amountField.current?.focus();
      return;
    }
    onWorkingChange(true);
    setError("");
    try {
      const saved = await writeOrder<SavedDeliveryFee>("set_delivery_fee", {
        orderId: order.id,
        updatedAt: version,
        ...(rider ? { deliveryFeeMode: "rider" } : { deliveryFeeMode: "known", deliveryFeeCentavos: fee }),
      });
      onSaved(saved, version);
      setDraft(undefined);
    } catch (failure) {
      if (failure instanceof OrderRequestError && failure.body.error === "stale_save") {
        try {
          const latest = await adminRequest<AdminOrder>("/api/admin/orders/" + encodeURIComponent(order.id));
          onReload(latest, order.updatedAt);
          setDraft({ version: latest.updatedAt, amount, rider });
          setError(eligible(latest) ? "The order changed. Review the updated total and save again."
            : "The order changed and is no longer eligible for a quick fee update.");
        } catch {
          setError("The order changed. Couldn’t load the latest order. Try again.");
        }
      } else {
        setError(failure instanceof Error ? failure.message : "Could not save the delivery fee.");
      }
    } finally {
      onWorkingChange(false);
    }
  }

  if (!allowed && !draft) return null;

  return <form noValidate onSubmit={event => void save(event)} className="grid gap-1.5">
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,6rem)_auto] items-center gap-2">
      <div className="flex items-center gap-1.5">
        <Switch id={riderId} aria-label="Customer pays the driver instead" checked={rider} disabled={disabled || !allowed} onCheckedChange={checked => edit({ rider: checked })} />
        <Label htmlFor={riderId} className="cursor-pointer leading-tight">Customer pays the driver instead</Label>
      </div>
      <Label htmlFor={inputId} className="sr-only">Delivery fee in pesos</Label>
      <Input id={inputId} ref={amountField} inputMode="decimal" placeholder="₱0.00" maxLength={14} value={amount}
        disabled={disabled || rider || !allowed} aria-describedby={error ? inputId + "-error" : undefined}
        onChange={event => edit({ amount: event.target.value })} />
      <Button type="submit" disabled={disabled || !allowed || !changed || (!rider && !amount.trim())}>{disabled ? "Saving…" : order.deliveryFeeMode === "unknown" ? "Add" : "Save"}</Button>
    </div>
    {error && <p id={inputId + "-error"} className="text-sm text-destructive" role="alert">{error}</p>}
  </form>;
}
