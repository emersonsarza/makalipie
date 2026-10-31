export type StaffAccess = { uid:string; name:string; active:boolean; branchIds:string[]; pages:string[] };
export type SettingsValues = {
 links:{instagram:string;instagramDm:string;messenger:string;grabFood:string;foodpanda:string};
 holdMinutes:string;confirmBeforeSlotMinutes:string;defaultPreorderLeadDays:string;requireFullPaymentDefault:boolean|null;customerEditDefault:boolean|null;
 themeId:string|null;bannerEnabled:boolean|null;bannerText:string;bannerLink:string;
 staff:StaffAccess[];
};
export type SettingsSnapshot = {revision:string;values:SettingsValues;canEdit:boolean;branches:{id:string;name:string}[];
 capabilities:{paymentDefault:boolean;customerEditDefault:boolean;appearance:boolean;staff:boolean};
 themes:{id:string;name:string}[];staffPages:{id:string;name:string;supported:boolean;note?:string}[]};
export type SettingsResource = {status:'unconnected'|'loading'|'error'|'forbidden';message?:string}|{status:'ready';snapshot:SettingsSnapshot;freshness:'current'|'refreshing'|'stale'|'offline'};
export type SettingsResult = {ok:true;snapshot:SettingsSnapshot}|{ok:false;kind:'validation'|'conflict'|'permission'|'network'|'reauth';message:string};
export type SettingsAdapter = {onRefresh?:()=>void;onSave?:(command:{expectedRevision:string;values:SettingsValues})=>Promise<SettingsResult>};
