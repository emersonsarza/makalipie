/** Frontend contract only. No fixtures or data access. Null is not an allocation policy. */
export type AllocationLimit = { mode: "limited"; quantity: number } | { mode: "unconfigured" | "unlimited"; quantity: null };
export type AllocationRow = {
  productId: string;
  name: string;
  sizeSummary: string;
  unit: "pies";
  limit: AllocationLimit;
  held: number | null;
  version: number;
  eligibility: "eligible" | "not-sold" | "lead-time" | "inactive";
  eligibilityNote: string | null;
  editable: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};
export type AllocationSnapshot = {
  branchId: string; date: string; generatedAt: string; dayVersion: number;
  intake: "online" | "paused" | "closed" | "unconfigured";
  rows: AllocationRow[];
  permissions: { edit: boolean; pause: boolean; unlimited: boolean; lowerBelowHeld: boolean };
  maximumQuantity: number;
};
export type AllocationResource =
  | { status: "unconnected" | "loading" | "error" | "forbidden"; message?: string }
  | { status: "ready"; snapshot: AllocationSnapshot; freshness: "current" | "refreshing" | "stale" | "offline" };
export type AllocationChange = { productId: string; expectedVersion: number; expectedHeld: number | null; limit: AllocationLimit };
export type AllocationCommand = { branchId: string; date: string; expectedDayVersion: number; changes: AllocationChange[]; paused?: boolean; acknowledgeBelowHeld: boolean };
export type AllocationResult =
  | { ok: true; snapshot: AllocationSnapshot }
  | { ok: false; kind: "conflict" | "permission" | "network" | "validation"; message: string; fields?: Record<string,string> };
export type AllocationAdapter = {
  onScopeChange?: (branchId: string, date: string) => void;
  onRefresh?: () => void;
  onSave?: (command: AllocationCommand) => Promise<AllocationResult>;
};
