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

// Responses rotate one refresh cookie, so dispatch stays serialized even after cancellation.
let pendingRequest: Promise<unknown> = Promise.resolve();
let generation = 0;
type TransportHooks = {
  unauthorized: () => void;
  mutate: <T>(url: string, init: RequestInit, run: () => Promise<T>) => Promise<T>;
};
let hooks: TransportHooks | undefined;
export function configureAdminTransport(next?: TransportHooks) { hooks = next; }
export function retireAdminSession() { generation += 1; }

export function adminRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const epoch = generation;
  const run = () => {
    const request = pendingRequest.then(async () => {
      init?.signal?.throwIfAborted();
      if (epoch !== generation) throw new DOMException("Session ended", "AbortError");
      const dispatch = async () => {
        init?.signal?.throwIfAborted();
        if (epoch !== generation) throw new DOMException("Session ended", "AbortError");
        if (init?.method && init.method !== "GET" && typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("You’re offline. Reconnect before saving.");
        const response = await fetch(url, { ...init, cache: "no-store", credentials: "same-origin", signal: undefined });
        return { response, body: await response.json() };
      };
      // Tabs share the same cookie as well as a session. Web Locks prevent competing rotations.
      const { response, body } = typeof navigator !== "undefined" && navigator.locks
        ? await navigator.locks.request("makalipie-admin-request", dispatch) : await dispatch();
      if (epoch !== generation) throw new DOMException("Session ended", "AbortError");
      if (response.status === 401 && body.error !== "invalid_credentials") hooks?.unauthorized();
      init?.signal?.throwIfAborted();
      if (!response.ok) throw new OrderRequestError(response.status, body);
      return body as T;
    });
    pendingRequest = request.catch(() => {});
    return request;
  };
  const write = init?.method && init.method !== "GET";
  return write && hooks ? hooks.mutate(url, init, run) : run();
}

export function writeOrder<T>(action: string, payload: unknown) {
  return adminRequest<T>("/api/admin/orders", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
}
