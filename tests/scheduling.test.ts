import assert from "node:assert/strict";
import test from "node:test";
import { defaultScheduleSettings, scheduleSettingsSchema } from "../src/lib/scheduling/schema";
import { addCalendarDays, configuredSlots, slotsForDate, availableOrderDates, scheduleValidationError } from "../src/lib/scheduling/rules";
import { defaultCatalog } from "../src/lib/catalog/defaults";
import { quoteSelection } from "../src/lib/catalog/rules";
import { flavorHasRoom } from "../src/lib/orders/allocation";
const now = new Date("2026-09-28T00:00:00Z"); // 8 AM Manila
function settings() { const s=defaultScheduleSettings(); s.branches.cebu.enabled=true; s.branches.cebu.startTime="08:00"; s.branches.cebu.cutoffTime="11:30"; return s; }
test("missing configuration stays closed; branches have independent schedules",()=>{
 assert.deepEqual(slotsForDate(defaultScheduleSettings(),"cebu","2026-09-29",now),[]);
 assert.deepEqual(slotsForDate(settings(),"manila","2026-09-29",now),[]);
});
test("only complete hours are offered, anchored to opening time",()=>{
 const s=settings(); s.branches.cebu.startTime="08:30"; s.branches.cebu.cutoffTime="11:00";
 assert.deepEqual(configuredSlots(s.branches.cebu,"2026-09-29").map(x=>x.id),["08:30","09:30"]);
 assert.equal(configuredSlots(s.branches.cebu,"2026-09-29")[0].startsAt,"2026-09-29T00:30:00.000Z");
});
test("started slots disappear at their exact start; cutoff affects today only",()=>{
 const s=settings(); assert.deepEqual(slotsForDate(s,"cebu","2026-09-28",now).map(x=>x.id),["09:00","10:00"]);
 const cutoff=new Date("2026-09-28T03:30:00Z");
 assert.equal(slotsForDate(s,"cebu","2026-09-28",cutoff).length,0);
 assert.equal(slotsForDate(s,"cebu","2026-09-29",cutoff).length,3);
});
test("Manila midnight, inclusive 30-day horizon and calendar boundaries",()=>{
 const s=settings(), midnight=new Date("2026-09-27T16:00:00Z");
 assert.equal(slotsForDate(s,"cebu","2026-09-27",midnight).length,0);
 assert.equal(slotsForDate(s,"cebu","2026-10-28",midnight).length,3);
 assert.equal(slotsForDate(s,"cebu","2026-10-29",midnight).length,0);
 assert.equal(addCalendarDays("2028-02-28",2),"2028-03-01");
 assert.equal(addCalendarDays("2026-12-31",1),"2027-01-01");
});
test("closed weekdays and explicit dates override offered hours",()=>{
 const s=settings(); s.branches.cebu.openWeekdays=[1];
 assert.equal(slotsForDate(s,"cebu","2026-09-29",now).length,0);
 s.branches.cebu.closedDates=["2026-09-28"];
 assert.equal(slotsForDate(s,"cebu","2026-09-28",now).length,0);
});
test("date search combines product weekdays, blackouts and preparation requirements",()=>{
 const s=settings(), catalog=defaultCatalog(), product=catalog.products[0];
 product.availableWeekdays=[4]; product.unavailableDates=["2026-10-01"];
 product.variants[0].minLeadDays=3;
 const selection={lines:[{productId:product.id,variantId:product.variants[0].id,quantity:1,addons:[]}],addons:[]};
 assert.equal(availableOrderDates(s,"cebu",catalog,selection,now)[0].date,"2026-10-08");
 s.bookingHorizonDays=3;
 assert.deepEqual(availableOrderDates(s,"cebu",catalog,selection,now),[]);
});
test("the longest preparation sets the earliest date, and a shorter selection brings earlier dates back",()=>{
 const s=settings(), catalog=defaultCatalog(), product=catalog.products[0];
 product.availableWeekdays=[];
 product.variants[0].minLeadDays=3;
 const longer={...product.variants[0], id:"large", minLeadDays:5};
 product.variants.push(longer);
 const both={lines:[{productId:product.id,variantId:product.variants[0].id,quantity:1,addons:[]},{productId:product.id,variantId:"large",quantity:1,addons:[]}],addons:[]};
 const shorter={lines:[both.lines[0]],addons:[]};
 assert.equal(quoteSelection(catalog,{...both,date:"2026-10-03"},"2026-09-28").preparationDays,5);
 assert.equal(availableOrderDates(s,"cebu",catalog,both,now)[0].date,"2026-10-03");
 assert.equal(availableOrderDates(s,"cebu",catalog,shorter,now)[0].date,"2026-10-01");
 const ready=quoteSelection(catalog,{...shorter,date:"2026-10-01"},"2026-09-28");
 assert.deepEqual(ready.errors,[]);
 assert.equal(flavorHasRoom({limit:0,held:0},1,"2026-10-01","2026-09-28",false),false);
});
test("add-on preparation can push the earliest date forward",()=>{
 const s=settings(), catalog=defaultCatalog(), product=catalog.products[0], addon=catalog.addons[0];
 addon.minLeadDays=4; product.allowedAddonIds=[addon.id]; product.availableWeekdays=[];
 const selection={lines:[{productId:product.id,variantId:product.variants[0].id,quantity:1,addons:[]}],addons:[{id:addon.id,message:""}]};
 assert.equal(availableOrderDates(s,"cebu",catalog,selection,now)[0].date,"2026-10-02");
});
test("forged, past and out-of-horizon slots fail validation",()=>{
 for(const [date,slot] of [["2026-09-29","08:15"],["2026-09-27","09:00"],["2026-10-29","09:00"]]) assert.ok(scheduleValidationError(settings(),"cebu",date,slot,now));
 assert.equal(scheduleValidationError(settings(),"cebu","2026-09-29","09:00",now),null);
});
test("invalid schedules cannot be saved",()=>{
 for(const patch of [{cutoffTime:"08:30"},{cutoffTime:"07:00"},{startTime:"24:00"},{closedDates:["2026-02-30"]},{openWeekdays:[1,1]},{closedDates:["2026-09-28","2026-09-28"]}]) {
  const s=settings(); Object.assign(s.branches.cebu,patch); assert.equal(scheduleSettingsSchema.safeParse(s).success,false);
 }
 for(const horizon of [0,366,1.5]) assert.equal(scheduleSettingsSchema.safeParse({...settings(),bookingHorizonDays:horizon}).success,false);
});
