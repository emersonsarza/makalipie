import dayjs from "@/lib/dayjs";

export const manilaToday = () => dayjs().tz("Asia/Manila").format("YYYY-MM-DD");
export const pesos = (value: number) => new Intl.NumberFormat("en-PH", {
  style: "currency", currency: "PHP",
}).format(value / 100);

type PriceChange = { id?: string; productId?: string; sizeId?: string; offeringId?: string; unitPriceCentavos: number | null };

export class OrderRequestError extends Error {
  constructor(public status: number, public body: { error?: string; message?: string; lines?: PriceChange[]; addons?: PriceChange[]; offerings?: { id: string; remaining: number }[] }) {
    super(body.message ?? ({
      stale_save: "This order changed. Reload it before saving.",
      unavailable: "Availability changed. Review the quantities and date.",
      price_change: "Prices changed. Review the latest prices before saving.",
      refund_required: "Record the refund before cancelling.",
      closed_ordering: "Ordering is closed for this drop date.",
    } as Record<string, string>)[body.error ?? ""] ?? "The request could not be completed.");
  }
}

// Each owner response may rotate the same refresh cookie.
let pendingRequest: Promise<unknown> = Promise.resolve();

export function adminRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const request = pendingRequest.then(() => requestOwner<T>(url, init));
  pendingRequest = request.catch(() => {});
  return request;
}

async function requestOwner<T>(url: string, init?: RequestInit): Promise<T> {
  init?.signal?.throwIfAborted();
  const response = await fetch(url, { cache: "no-store", ...init, signal: undefined });
  const body = await response.json();
  if (!response.ok) throw new OrderRequestError(response.status, body);
  return body;
}

export function writeOrder<T>(action: string, payload: unknown) {
  return adminRequest<T>("/api/admin/orders", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
}
