/** Proposed frontend contract, not an approved package policy or persistence schema. */
export type PackageDraft={id:string;name:string;description:string;active:boolean;branchIds:string[];contents:{variantKey:string;quantity:string}[];price:string;preparationDays:string;packingNotes:string;priceMode?:"calculated"|"override";maxPackagesPerOrder?:string};
export type PackageVariant={key:string;productId:string;variantId:string;name:string;size:string;active:boolean;branchIds:string[];category:'sweet'|'savory';priceCentavos?:number|null;minLeadDays?:number};
export type PackageSnapshot={revision:string;packages:PackageDraft[];variants:PackageVariant[];branches:{id:string;name:string}[];canEdit:boolean;policy:{publicationReady:boolean;fixedPrice:boolean;preparationOverride:boolean;reason:string;summary:string[]}};
export type PackageResource={status:'unconnected'|'loading'|'error'|'forbidden';message?:string}|{status:'ready';snapshot:PackageSnapshot;freshness:'current'|'refreshing'|'stale'|'offline'};
export type PackageResult={ok:true;snapshot:PackageSnapshot}|{ok:false;kind:'validation'|'conflict'|'permission'|'network';message:string};
export type PackageAdapter={onRefresh?:()=>void;onSave?:(command:{package:PackageDraft;isNew:boolean;expectedRevision:string})=>Promise<PackageResult>};
