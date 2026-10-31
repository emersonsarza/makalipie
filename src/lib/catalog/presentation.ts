import type { Variant } from "./schema";
import { groupBySection, type MenuSection } from "./sections";
import { customerSizeLabel } from "./size";
import { preparationLeadDays, scheduledWeekdays, variantOrderMode } from "./mode";

export function sellingDaysLabel(days: number[]) {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const unique = [...new Set(scheduledWeekdays(days))].sort((a,b)=>a-b);
  if (!unique.length) return "";
  const start = unique.find(day=>!unique.includes((day+6)%7));
  if (start !== undefined && unique.every((_,index)=>unique.includes((start+index)%7))) return `${names[start]}${unique.length>1?`–${names[(start+unique.length-1)%7]}`:""}`;
  return unique.map(day=>names[day]).join(", ");
}

type Row = { menuCategoryId?: string | null; variant: Variant; availableWeekdays?: number[]; catalogMode?: "regular" | "preorder" };
/** Stable category/product order with normalized, numerically sorted size groups. */
export function groupMenuRows<T extends Row>(rows: T[], sections: MenuSection[], leadDays = 3) {
  const {groups,unassigned}=groupBySection(rows,sections);
  const categories = [...groups, ...(unassigned.length ? [{section:{id:"unassigned",name:"More pies",note:"",sortOrder:9999} as MenuSection,items:unassigned}] : [])];
  return categories.map(({section,items})=>{
    const sizes=new Map<string,{key:string;label:string;mode:"regular"|"preorder";items:T[]}>();
    for(const item of items){
      const normalized=customerSizeLabel(item.variant.label);
      const mode=item.catalogMode ?? variantOrderMode(item.variant);
      const key=`${normalized ?? item.variant.label}:${mode}`;
      if(!sizes.has(key)) sizes.set(key,{key,label:normalized?`${normalized.slice(0,-1)}-inch Pies`:item.variant.label,mode,items:[]});
      sizes.get(key)!.items.push(item);
    }
    return {section,sizes:[...sizes.values()].sort((a,b)=>(parseFloat(a.label)||Infinity)-(parseFloat(b.label)||Infinity)||a.key.localeCompare(b.key)).map(group=>{
      const labels=group.items.map(item=>group.mode==="preorder"?`${preparationLeadDays(item.variant,leadDays)} days preparation`:sellingDaysLabel(section.availableWeekdays ?? item.variant.availableWeekdays ?? item.availableWeekdays ?? []));
      return {...group,note:labels.every(label=>label===labels[0])?labels[0]:""};
    })};
  });
}
