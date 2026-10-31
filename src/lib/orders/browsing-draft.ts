import { z } from "zod";
import { dateSchema } from "../catalog/schema";
import type { CatalogMode } from "../branches/schema";

const quantities = z.record(z.string().max(160), z.number().int().min(0).max(100));
const messages = z.record(z.string().max(160), z.string().max(2000));
export const browsingDraftSchema = z.object({
  version: z.literal(1), branch: z.string().max(80), date: dateSchema.or(z.literal("")), slot: z.string().max(80),
  quantities, packages: quantities,
  selectedAddons: z.array(z.string().max(160)).max(100), addonMessages: messages,
  lineAddons: z.record(z.string().max(160),z.array(z.string().max(160)).max(100)),
  lineMessages: z.record(z.string().max(160),messages),
  prices: z.record(z.string().max(180),z.string().max(100)),
}).strict();
export type BrowsingDraft = z.infer<typeof browsingDraftSchema>;
export const draftKey = (mode: CatalogMode) => `makalipie-browsing-draft-v1:${mode}`;
export function parseBrowsingDraft(raw: string | null): BrowsingDraft | null {
  try { const result=browsingDraftSchema.safeParse(JSON.parse(raw ?? "null")); return result.success ? result.data : null; }
  catch { return null; }
}

export const unifiedDraftKey = "makalipie-browsing-draft-v2";
export const unifiedDraftSchema = browsingDraftSchema.extend({version:z.literal(2),needsDateSelection:z.boolean().optional(),selectedAddons:z.array(z.string().max(160)).max(200),lineAddons:z.record(z.string().max(160),z.array(z.string().max(160)).max(200))}).strict();
export type UnifiedDraft = z.infer<typeof unifiedDraftSchema>;
export function parseUnifiedDraft(raw:string|null):UnifiedDraft|null {
  try{const result=unifiedDraftSchema.safeParse(JSON.parse(raw ?? "null"));return result.success?result.data:null;}catch{return null;}
}
function maxQuantities(a:Record<string,number>,b:Record<string,number>){
  return Object.fromEntries([...new Set([...Object.keys(a),...Object.keys(b)])].map(key=>[key,Math.max(a[key] ?? 0,b[key] ?? 0)]));
}
export function mergeBrowsingDrafts(primary:BrowsingDraft|null,secondary:BrowsingDraft|null):UnifiedDraft|null {
  if(!primary && !secondary)return null;
  if(!primary)return {...secondary!,version:2};
  if(!secondary)return {...primary,version:2};
  const conflict=primary.branch!==secondary.branch || primary.date!==secondary.date;
  const lineAddons=Object.fromEntries([...new Set([...Object.keys(primary.lineAddons),...Object.keys(secondary.lineAddons)])].map(key=>[key,[...new Set([...(primary.lineAddons[key] ?? []),...(secondary.lineAddons[key] ?? [])])]]));
  const lineMessages=Object.fromEntries([...new Set([...Object.keys(primary.lineMessages),...Object.keys(secondary.lineMessages)])].map(key=>[key,{...secondary.lineMessages[key],...primary.lineMessages[key]}]));
  return {...primary,version:2,branch:conflict?"":primary.branch,date:conflict?"":primary.date,slot:conflict?"":primary.slot,needsDateSelection:conflict,
    quantities:maxQuantities(primary.quantities,secondary.quantities),packages:maxQuantities(primary.packages,secondary.packages),
    selectedAddons:[...new Set([...primary.selectedAddons,...secondary.selectedAddons])],addonMessages:{...secondary.addonMessages,...primary.addonMessages},lineAddons,lineMessages,prices:{...secondary.prices,...primary.prices}};
}
export function loadUnifiedDraft(storage:Pick<Storage,"getItem"|"setItem"|"removeItem">,preferred:CatalogMode="regular") {
  try{
    const existing=parseUnifiedDraft(storage.getItem(unifiedDraftKey));if(existing)return existing;
    const result=mergeBrowsingDrafts(parseBrowsingDraft(storage.getItem(draftKey(preferred))),parseBrowsingDraft(storage.getItem(draftKey(preferred==="regular"?"preorder":"regular"))));
    if(result){
      try{storage.setItem(unifiedDraftKey,JSON.stringify(result));storage.removeItem(draftKey("regular"));storage.removeItem(draftKey("preorder"));}catch{/* Do not remove old drafts if saving the merged draft fails. */}
    }
    return result;
  }catch{return null;}
}
