import assert from "node:assert/strict";
import test from "node:test";
import { groupMenuRows, sellingDaysLabel } from "../src/lib/catalog/presentation";
import { defaultCatalog } from "../src/lib/catalog/defaults";
const variant = {...defaultCatalog().products[0].variants[0],active:true,orderMode:"regular" as const,minLeadDays:0};
const sections=[{id:"classic",name:"Classic Flavors",note:"",sortOrder:0},{id:"weekend",name:"Weekend Specials",note:"",sortOrder:1,availableWeekdays:[0,5,6]}];
test("category order, normalized numeric sizes and product order remain stable",()=>{
 const rows=[{id:"apple",menuCategoryId:"weekend",variant:{...variant,label:'4"'}},{id:"keylime10",menuCategoryId:"classic",variant:{...variant,label:'10"',orderMode:"preorder" as const}},{id:"keylime4",menuCategoryId:"classic",variant:{...variant,label:'4 inch'}},{id:"pecan4",menuCategoryId:"classic",variant:{...variant,label:'4"'}}];
 const result=groupMenuRows(rows,sections);
 assert.deepEqual(result.map(g=>g.section.id),["classic","weekend"]);
 assert.deepEqual(result[0].sizes.map(g=>g.label),["4-inch Pies","10-inch Pies"]);
 assert.deepEqual(result[0].sizes[0].items.map(row=>row.id),["keylime4","pecan4"]);
 assert.equal(result[0].sizes[1].note,"3 days preparation");
 assert.equal(result[1].sizes[0].note,"Friday–Sunday");
});
test("unknown categories, extra sizes, empty groups and different modes are retained correctly",()=>{
 const rows=[{id:"a",variant:{...variant,label:'6"'}},{id:"b",variant:{...variant,label:'4"',orderMode:"preorder" as const}},{id:"c",variant:{...variant,label:'4"'}}];
 const result=groupMenuRows(rows,sections);
 assert.equal(result.length,1); assert.equal(result[0].section.id,"unassigned");
 assert.equal(result[0].sizes.length,3); assert.equal(result[0].sizes[2].label,"6-inch Pies");
 assert.deepEqual(groupMenuRows([],sections),[]);
});
test("saved mode and preparation rules take precedence, with weekday notes only for regular pies",()=>{
 const result=groupMenuRows([{menuCategoryId:"weekend",variant:{...variant,label:'10"',orderMode:"preorder" as const,minLeadDays:5}}],sections,4);
 assert.equal(result[0].sizes[0].note,"4 days preparation");
 assert.equal(sellingDaysLabel([5,6,0]),"Friday–Sunday");
 assert.equal(sellingDaysLabel([1,3,5]),"Monday, Wednesday, Friday");
 assert.equal(sellingDaysLabel([]),"");
});
