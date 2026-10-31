import assert from "node:assert/strict";
import test from "node:test";
import {defaultScheduleSettings} from "../src/lib/scheduling/schema";
import {availableOrderDates,preparationStartDate,addCalendarDays} from "../src/lib/scheduling/rules";
import {defaultCatalog} from "../src/lib/catalog/defaults";
import {availabilityReason,quoteSelection,manilaDate} from "../src/lib/catalog/rules";
function setup(){
 const schedule=defaultScheduleSettings();
 Object.assign(schedule.branches.cebu,{enabled:true,startTime:"08:00",cutoffTime:"20:00",openWeekdays:[0,1,2,3,4,5,6],closedDates:[]});
 const catalog=defaultCatalog();catalog.preorderLeadDays=3;
 const product=catalog.products[0];product.active=true;product.availableWeekdays=[5,6,0];product.unavailableDates=[];
 product.variants=[{...product.variants[0],label:'10"',active:true,orderMode:"preorder",minLeadDays:3}];
 const selection={lines:[{productId:product.id,variantId:product.variants[0].id,quantity:1,addons:[]}],addons:[]};
 return {schedule,catalog,product,variant:product.variants[0],selection};
}
test("late Monday starts Tuesday and three days means Friday, on both picker and quote",()=>{
 const {schedule,catalog,product,variant,selection}=setup();const now=new Date("2026-10-26T14:00:00Z");
 const start=preparationStartDate(schedule,"cebu",now);assert.equal(start,"2026-10-27");
 assert.equal(availableOrderDates(schedule,"cebu",catalog,selection,now)[0]?.date,"2026-10-30");
 assert.match(availabilityReason(product,variant,"2026-10-29",0,manilaDate(now),{preparationStart:start})!,/preparation/);
 assert.equal(quoteSelection(catalog,{...selection,date:"2026-10-30"},manilaDate(now),{preparationStart:start}).errors.length,0);
 assert.equal(quoteSelection(catalog,{...selection,date:"2026-10-29"},manilaDate(now),{preparationStart:start}).errors.length,1);
});
test("configured hours and remaining slots determine the base, not a fixed hour",()=>{
 const {schedule}=setup();
 assert.equal(preparationStartDate(schedule,"cebu",new Date("2026-10-26T02:00:00Z")),"2026-10-26");
 schedule.branches.cebu.cutoffTime="12:00";
 assert.equal(preparationStartDate(schedule,"cebu",new Date("2026-10-26T05:00:00Z")),"2026-10-27");
 assert.equal(preparationStartDate(schedule,"cebu",new Date("2026-10-26T03:00:00Z")),"2026-10-27"); // Last slot already started.
});
test("closed dates and weekdays delay the base; calendar days then count normally",()=>{
 const {schedule,catalog,selection}=setup();const now=new Date("2026-10-26T14:00:00Z");
 schedule.branches.cebu.closedDates=["2026-10-27"];
 schedule.branches.cebu.openWeekdays=[0,1,4,5,6];
 assert.equal(preparationStartDate(schedule,"cebu",now),"2026-10-29");
 assert.equal(availableOrderDates(schedule,"cebu",catalog,selection,now)[0]?.date,"2026-11-01");
 assert.equal(addCalendarDays("2026-12-30",3),"2027-01-02");
});
test("the final fulfillment date must also be open and inside the horizon",()=>{
 const {schedule,catalog,selection}=setup();const now=new Date("2026-10-26T14:00:00Z");
 schedule.branches.cebu.closedDates=["2026-10-30"];
 assert.equal(availableOrderDates(schedule,"cebu",catalog,selection,now)[0]?.date,"2026-10-31");
 schedule.bookingHorizonDays=3;
 assert.deepEqual(availableOrderDates(schedule,"cebu",catalog,selection,now),[]);
});
