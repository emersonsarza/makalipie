import { QueryClient, queryOptions } from "@tanstack/react-query";
import { adminRequest, OrderRequestError } from "./orders-data";

export type AdminResource = "catalog" | "drops" | "orders" | "queues" | "summaries" | "lineup" | "preview" | "drop-preview" | "backups";
export function resourceFor(url: string): AdminResource {
  const path = url.split("?")[0];
  if (path.endsWith("/orders/queues")) return "queues";
  if (path.endsWith("/orders/numbers")) return "summaries";
  if (path.endsWith("/drops/preview")) return "drop-preview";
  if (path.includes("/orders")) return "orders";
  if (path.includes("/catalog")) return "catalog";
  if (path.includes("/drops")) return "drops";
  if (path.includes("/backups")) return "backups";
  if (path.includes("/lineup")) return "lineup";
  return "preview";
}
export function adminKey(account: string, url: string) {
  const [path, search] = url.split("?");
  const params = new URLSearchParams(search);
  params.sort();
  return ["admin", account, resourceFor(url), path, params.toString()] as const;
}
export function adminQuery<T>(account: string, url: string) {
  return queryOptions({ queryKey: adminKey(account, url), queryFn: ({ signal }) => adminRequest<T>(url, { signal }) });
}
export function createAdminQueryClient() {
  const client = new QueryClient({ defaultOptions: {
    queries: { staleTime: 0, gcTime: 300_000, refetchOnMount: true, refetchOnWindowFocus: true, refetchOnReconnect: true,
      retry: (count, error) => count < 1 && !(error instanceof DOMException && error.name === "AbortError") && (!(error instanceof OrderRequestError) || error.status >= 500),
    },
    mutations: { retry: false, networkMode: "always", gcTime: 0 },
  } });
  client.getQueryCache().subscribe(event => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    const ids = terminalOrderIds(event.query.state.data);
    for (const id of ids) redactOrder(client, id);
  });
  return client;
}
function terminalOrderIds(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data)) return data.flatMap(terminalOrderIds);
  const row = data as Record<string, unknown>;
  if (typeof row.id === "string" && "orderNumber" in row && (row.status === "completed" || row.status === "cancelled")) return [row.id];
  return Object.values(row).flatMap(terminalOrderIds);
}
export function redactOrder(client: QueryClient, id: string) {
  function scrub(data: unknown): unknown {
    if (!data || typeof data !== "object") return data;
    if (Array.isArray(data)) {
      const next = data.map(scrub);
      return next.some((value, index) => value !== data[index]) ? next : data;
    }
    const row = data as Record<string, unknown>;
    if (row.id === id && "orderNumber" in row && ["customerName", "customerPhone", "deliveryAddress", "notes"].some(key => row[key] != null)) {
      return { ...row, customerName: null, customerPhone: null, deliveryAddress: null, notes: null };
    }
    const entries = Object.entries(row).map(([key, value]) => [key, scrub(value)] as const);
    return entries.some(([key, value]) => value !== row[key]) ? Object.fromEntries(entries) : row;
  }
  for (const query of client.getQueryCache().findAll()) {
    const previous = query.state.data;
    const next = scrub(previous);
    if (next !== previous) client.setQueryData(query.queryKey, next, { updatedAt: query.state.dataUpdatedAt });
  }
}
const dependencies: Record<AdminResource, AdminResource[]> = {
  orders: ["orders", "summaries", "lineup", "drops", "drop-preview", "queues"],
  catalog: ["catalog", "queues", "lineup", "preview", "drop-preview"],
  drops: ["drops", "queues", "orders", "lineup", "preview", "drop-preview"],
  backups: ["backups"], queues: ["queues"], summaries: ["summaries"], lineup: ["lineup"], preview: ["preview"], "drop-preview": ["drop-preview"],
};
export async function invalidateAdmin(client: QueryClient, resource?: AdminResource | AdminResource[]) {
  const resources = resource ? (Array.isArray(resource) ? resource : [resource]).flatMap(item => dependencies[item]) : undefined;
  const filters = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === "admin" && (!resources || resources.includes(query.queryKey[2] as AdminResource)) };
  // Cancel observers first: an older read must never win a race with a write/event.
  await client.cancelQueries(filters);
  await client.invalidateQueries(filters);
}
