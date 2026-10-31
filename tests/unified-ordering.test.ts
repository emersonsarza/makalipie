import assert from "node:assert/strict";
import test from "node:test";
import {defaultBranchSettings,orderingBranchCatalog,catalogForSelection} from "../src/lib/branches/schema";
import {defaultCatalog} from "../src/lib/catalog/defaults";
import {defaultScheduleSettings} from "../src/lib/scheduling/schema";
import {orderingDateOptions,preparationStartDate} from "../src/lib/scheduling/rules";
import {quoteSelection,manilaDate} from "../src/lib/catalog/rules";
function setup(){
 const catalog=defaultCatalog();catalog.preorderLeadDays=3;
 const product=catalog.products[0];product.active=true;product.availableWeekdays=[];product.unavailableDates=[];product.menuCategoryId=null;
 product.variants=[{...product.variants[0],id:"four",label:'4"',active:true,orderMode:"regular",minLeadDays:0},{...product.variants[0],id:"ten",label:'10"',active:true,orderMode:"preorder",minLeadDays:3}];
 catalog.products=[product];const branches=defaultBranchSettings();branches.assignments=[{productId:product.id,variantId:"four",branchIds:["cebu"],mode:"regular"},{productId:product.id,variantId:"ten",branchIds:["cebu"],mode:"preorder"}];
 const schedule=defaultScheduleSettings();Object.assign(schedule.branches.cebu,{enabled:true,startTime:"08:00",cutoffTime:"20:00",openWeekdays:[0,1,2,3,4,5,6],closedDates:[]});
 const now=new Date("2026-10-26T14:00:00Z");return {catalog,product,branches,schedule,now};
}
test("mixed sizes share a branch-scoped quote while each line keeps preparation rules",()=>{
 const {catalog,product,branches,schedule,now}=setup();
 const lines=product.variants.map(variant=>({productId:product.id,variantId:variant.id,quantity:1,addons:[]}));
 const scoped=catalogForSelection(catalog,branches,"cebu",lines,"regular");assert.ok("catalog" in scoped);
 assert.equal(scoped.catalog.products[0].variants.length,2);
 const options={preparationStart:preparationStartDate(schedule,"cebu",now)};
 assert.equal(quoteSelection(scoped.catalog,{date:"2026-10-30",lines,addons:[]},manilaDate(now),options).errors.length,0);
 assert.equal(quoteSelection(scoped.catalog,{date:"2026-10-29",lines,addons:[]},manilaDate(now),options).errors.length,1);
 assert.deepEqual(orderingBranchCatalog(catalog,branches,"manila").products,[]);
});
test("calendar dots require an eligible in-stock pre-order size, not merely elapsed preparation",()=>{
 const {catalog,product,branches,schedule,now}=setup();const scoped=orderingBranchCatalog(catalog,branches,"cebu");
 const openProducts={"2026-10-27":[product.id],"2026-10-29":[product.id],"2026-10-30":[product.id]};
 const dates=orderingDateOptions(schedule,"cebu",scoped,now,{intakeEnabled:true,openProducts});
 assert.equal(dates.find(d=>d.date==="2026-10-27")?.preorderAvailable,false);
 assert.equal(dates.find(d=>d.date==="2026-10-29")?.preorderAvailable,false);
 assert.equal(dates.find(d=>d.date==="2026-10-30")?.preorderAvailable,true);
 assert.equal(dates.some(d=>d.date==="2026-10-31"),false);
 schedule.branches.cebu.closedDates=["2026-10-30"];
 assert.equal(orderingDateOptions(schedule,"cebu",scoped,now,{intakeEnabled:true,openProducts}).some(d=>d.date==="2026-10-30"),false);
});
test("regular selling weekdays and pre-order date exceptions remain independent",()=>{
 const {catalog,product,branches,schedule,now}=setup();product.availableWeekdays=[0,6];product.unavailableDates=["2026-10-30"];
 const scoped=orderingBranchCatalog(catalog,branches,"cebu");
 const dates=orderingDateOptions(schedule,"cebu",scoped,now);
 assert.equal(dates.some(d=>d.date==="2026-10-30"),false);
 assert.equal(dates.find(d=>d.date==="2026-11-02")?.preorderAvailable,true);
});
test("an editing date can stay visible without falsely marking unavailable stock",()=>{
 const {catalog,branches,schedule,now}=setup();const dates=orderingDateOptions(schedule,"cebu",orderingBranchCatalog(catalog,branches,"cebu"),now,{intakeEnabled:true,openProducts:{},editingDate:"2026-10-30"});
 assert.deepEqual(dates.map(d=>[d.date,d.preorderAvailable]),[["2026-10-30",false]]);
});
