/** Presentation contracts only. The adapter must map these to supported persistence fields. */
export type BranchDraft = {
 id: string; name: string; address: string; hoursLabel: string; mapUrl: string;
 visible: boolean; pickupEnabled: boolean; deliveryEnabled: boolean; areas: string[];
 showSingleItems: boolean | null; showPackages: boolean | null;
 limitEnabled: boolean; limitQuantity: string; limitUnit: 'pies' | 'boxes'; limitPeriod: 'order' | 'day';
};
export type BranchItem = BranchDraft & { visibilityLocked: boolean; lockReason?: string };
export type BranchSnapshot = {
 revision: string; branches: BranchItem[]; defaultBranchId: string | null; canEdit: boolean;
 capabilities: { offerings: boolean; customerLimits: boolean; dailyLimits: boolean; boxLimits: boolean };
};
export type BranchResource =
 | { status: 'unconnected' | 'loading' | 'error' | 'forbidden'; message?: string }
 | { status: 'ready'; snapshot: BranchSnapshot; freshness: 'current' | 'refreshing' | 'stale' | 'offline' };
export type BranchResult = {ok:true;snapshot:BranchSnapshot} | {ok:false;kind:'validation'|'conflict'|'permission'|'network';message:string};
export type BranchAdapter = { onRefresh?:()=>void; onSave?:(command:{branch:BranchDraft;isNew:boolean;makeDefault:boolean;expectedRevision:string})=>Promise<BranchResult> };
