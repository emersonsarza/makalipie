import assert from "node:assert/strict";
import test from "node:test";
import {parseBrowsingDraft,draftKey} from "../src/lib/orders/browsing-draft";
const draft={version:1 as const,branch:"cebu",date:"2026-10-30",slot:"10:00",quantities:{"keylime:4":2},packages:{},selectedAddons:[],addonMessages:{},lineAddons:{},lineMessages:{},prices:{"keylime:4":"fixed:24000"}};
test("separate draft keys and round-trip selected quantities without private fields",()=>{
 assert.notEqual(draftKey("regular"),draftKey("preorder"));
 assert.deepEqual(parseBrowsingDraft(JSON.stringify(draft)),draft);
 for(const field of ["name","contact","address","token","recoveryToken"]) assert.equal(parseBrowsingDraft(JSON.stringify({...draft,[field]:"private"})),null);
});
test("malformed, unsupported, invalid-date and out-of-range drafts are ignored",()=>{
 for(const raw of [null,"broken",JSON.stringify({...draft,version:2}),JSON.stringify({...draft,date:"wrong"}),JSON.stringify({...draft,quantities:{x:-1}}),JSON.stringify({...draft,quantities:{x:101}})]) assert.equal(parseBrowsingDraft(raw),null);
});

import {loadUnifiedDraft,mergeBrowsingDrafts,parseUnifiedDraft,unifiedDraftKey} from "../src/lib/orders/browsing-draft";
test("migration merges selections without doubling quantities and keeps primary messages",()=>{
 const a={...draft,quantities:{a:2,b:1},selectedAddons:["card"],addonMessages:{card:"primary"},lineAddons:{a:["ribbon"]},lineMessages:{a:{ribbon:"primary"}}};
 const b={...draft,quantities:{a:3,c:2},selectedAddons:["card","topper"],addonMessages:{card:"secondary"},lineAddons:{a:["card"]},lineMessages:{a:{ribbon:"secondary",card:"note"}}};
 const merged=mergeBrowsingDrafts(a,b)!;
 assert.deepEqual(merged.quantities,{a:3,b:1,c:2});assert.deepEqual(merged.selectedAddons,["card","topper"]);
 assert.equal(merged.addonMessages.card,"primary");assert.equal(merged.lineMessages.a.ribbon,"primary");assert.equal(merged.lineMessages.a.card,"note");
 assert.equal(merged.date,draft.date);assert.equal(parseUnifiedDraft(JSON.stringify(merged))?.version,2);
});
test("conflicting saved branch/date requires a fresh choice but keeps every selection",()=>{
 const merged=mergeBrowsingDrafts(draft,{...draft,branch:"manila",date:"2026-10-31",quantities:{pecan:1}})!;
 assert.equal(merged.branch,"");assert.equal(merged.date,"");assert.equal(merged.slot,"");assert.equal(merged.needsDateSelection,true);
 assert.equal(merged.quantities.pecan,1);assert.equal(merged.quantities["keylime:4"],2);
});
test("legacy storage keys are removed only after a successful unified save",()=>{
 const entries=new Map([[draftKey("regular"),JSON.stringify(draft)],[draftKey("preorder"),JSON.stringify({...draft,addonMessages:{card:"preferred"}})]]);
 let fail=true;const storage={getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>{if(fail)throw Error("quota");entries.set(key,value);},removeItem:(key:string)=>{entries.delete(key);}};
 assert.ok(loadUnifiedDraft(storage,"preorder"));assert.equal(entries.has(draftKey("regular")),true);
 fail=false;const saved=loadUnifiedDraft(storage,"preorder")!;assert.equal(saved.addonMessages.card,"preferred");assert.equal(entries.has(unifiedDraftKey),true);assert.equal(entries.has(draftKey("regular")),false);assert.equal(entries.has(draftKey("preorder")),false);
 assert.deepEqual(loadUnifiedDraft(storage),saved);
});
test("a full union of legacy add-on lists stays readable in the unified draft",()=>{
 const primary={...draft,selectedAddons:Array.from({length:100},(_,index)=>`a-${index}`)};
 const secondary={...draft,selectedAddons:Array.from({length:100},(_,index)=>`b-${index}`)};
 const merged=mergeBrowsingDrafts(primary,secondary)!;
 assert.equal(merged.selectedAddons.length,200);assert.ok(parseUnifiedDraft(JSON.stringify(merged)));
});
