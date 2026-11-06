/** Decimal teaching units. Estimates, never measured production traffic. */
export const scenario = {
  verifiedOn: '2026-10-28', days: 30, menuKB: 20, cacheMinutes: 5,
  visitsDaily: [100, 1000, 10000], ordersDaily: [10, 50, 200],
  retainedOrderKB: 10, photoMBPerVisit: 1, staffSubscribers: 5,
  quotas: {databaseMB: 500, storageGB: 1, egressGB: 5, cachedEgressGB: 5,
    authMAU: 50000, edgeInvocations: 500000, realtimeMessages: 2000000, realtimeConnections: 200},
} as const;
export const menuGB = (visits: number) => visits * scenario.days * scenario.menuKB / 1e6;
// Scheduled refresh upper bound: one always-running cache, one fetch per refresh.
export const cachedMenuGB = () => scenario.days * 24 * 60 / scenario.cacheMinutes * scenario.menuKB / 1e6;
export const orderMB = (orders: number) => orders * scenario.days * scenario.retainedOrderKB / 1000;
export type Action = 'menu-fetch' | 'cache-hit' | 'host-photo' | 'cart-edit' | 'availability' | 'order-save' | 'status' | 'staff-login' | 'realtime-change' | 'edge-call';
export function affectedMeters(action: Action): string[] {
  switch(action) {
    case 'menu-fetch': case 'availability': case 'status': return ['egress'];
    case 'order-save': return ['database', 'egress'];
    case 'staff-login': return ['auth', 'egress'];
    case 'realtime-change': return ['realtime', 'egress'];
    case 'edge-call': return ['edge', 'egress'];
    default: return [];
  }
}
