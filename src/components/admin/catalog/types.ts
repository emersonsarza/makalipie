/** UI contracts only; no data access or seeded catalog. */
export type CatalogSize = { key: string; name: string; active: boolean; price: string; pricing: 'fixed' | 'quote_required'; leadDays: string; weekdays: number[] | null };
export type CatalogEntry = {
  id: string; version: number; kind: 'product' | 'addon'; name: string; description: string;
  active: boolean; sortOrder: string; imageUrl: string; imageAlt: string; allergens: string;
  weekdays: number[]; blockedDates: string[]; branchIds: string[]; sizes: CatalogSize[];
  price: string; leadDays: string; scope: 'per_order' | 'per_item';
  messageEnabled: boolean; messageRequired: boolean; messageLabel: string; messageMax: string;
};
export type CatalogSnapshot = { revision: string; entries: CatalogEntry[]; canEdit: boolean };
export type CatalogResource =
  | { status: 'unconnected' | 'loading' | 'error' | 'forbidden'; message?: string }
  | { status: 'ready'; snapshot: CatalogSnapshot; freshness: 'current' | 'refreshing' | 'stale' | 'offline' };
export type CatalogResult = { ok: true; snapshot: CatalogSnapshot } | { ok: false; kind: 'validation' | 'conflict' | 'permission' | 'network'; message: string };
export type CatalogAdapter = { onRefresh?: () => void; onSave?: (command: { entry: CatalogEntry; expectedRevision: string }) => Promise<CatalogResult> };
