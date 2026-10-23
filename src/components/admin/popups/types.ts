export type PopupDraft={id:string;name:string;address:string;mapUrl:string;startDate:string;endDate:string;hours:string;items:string[];visible:boolean|null};
export type PopupSnapshot={revision:string;listings:PopupDraft[];canEdit:boolean;manualVisibility:boolean;reservedIds:string[]};
export type PopupResource={status:'unconnected'|'loading'|'error'|'forbidden';message?:string}|{status:'ready';snapshot:PopupSnapshot;freshness:'current'|'refreshing'|'stale'|'offline'};
export type PopupResult={ok:true;snapshot:PopupSnapshot}|{ok:false;kind:'validation'|'conflict'|'permission'|'network';message:string};
export type PopupAdapter={onRefresh?:()=>void;onSave?:(command:{listing:PopupDraft;isNew:boolean;expectedRevision:string})=>Promise<PopupResult>};
