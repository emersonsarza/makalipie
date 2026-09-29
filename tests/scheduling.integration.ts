import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { emulatorEnv } from "../scripts/emulator-env.mjs";
import { defaultScheduleSettings } from "../src/lib/scheduling/schema";
import { addCalendarDays } from "../src/lib/scheduling/rules";
import { manilaDate } from "../src/lib/catalog/rules";
Object.assign(process.env,emulatorEnv);
const origin=process.env.SCHEDULE_TEST_ORIGIN || "http://localhost:3002";
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) throw new Error("Use a local demo preview only.");
test("saved schedules constrain customer requests and remain owner protected",async t=>{
 const {getServerFirebase}=await import("../src/lib/firebase/server"); const {db,auth,app}=getServerFirebase(); assert.equal(app.options.projectId,"demo-makalipie");
 const ref=db.doc("settings/orderingSchedule"), before=await ref.get();
 const user=await auth.createUser({email:`schedule-${randomUUID()}@example.test`,password:"Schedule-demo-only!"});
 await db.doc(`admins/${user.uid}`).set({role:"owner",active:true,email:user.email});
 let latestVersion:number|undefined;
 try {
  const login=await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:user.email,password:"Schedule-demo-only!",returnSecureToken:true})});
  const {idToken}=await login.json();
  const session=await fetch(`${origin}/api/admin/session`,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({idToken})}); assert.equal(session.status,200);
  const cookie=session.headers.get("set-cookie")!.split(";")[0];
  const get=()=>fetch(`${origin}/api/admin/schedule`,{headers:{Cookie:cookie}});
  const save=(body:unknown,requestOrigin=origin)=>fetch(`${origin}/api/admin/schedule`,{method:"POST",headers:{Cookie:cookie,Origin:requestOrigin,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const current=await (await get()).json(), settings=defaultScheduleSettings(); settings.version=current.settings.version; settings.branches.cebu.enabled=true;
  const date=addCalendarDays(manilaDate(),2);
  const body={branchId:"cebu",date,slotId:"10:00",lines:[{productId:"keylime",variantId:"standard",quantity:1,addons:[]}],addons:[]};
  const preview=(patch:object={})=>fetch(`${origin}/api/catalog/preview`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,...patch})});
  await t.test("owner and origin required; invalid hours rejected",async()=>{
   assert.equal((await fetch(`${origin}/api/admin/schedule`)).status,401);
   assert.equal((await save(settings,"https://evil.example")).status,403);
   const invalid=structuredClone(settings); invalid.branches.cebu.cutoffTime="09:00"; assert.equal((await save(invalid)).status,400);
  });
  await t.test("save survives reload; stale edits conflict; public response hides audit fields",async()=>{
   const response=await save(settings); assert.equal(response.status,200,await response.clone().text()); latestVersion=(await response.json()).settings.version;
   assert.equal((await (await get()).json()).settings.version,latestVersion);
   assert.equal((await save(settings)).status,409);
   const publicResponse=await fetch(`${origin}/api/ordering/schedule`); assert.match(publicResponse.headers.get("cache-control")!,/no-store/);
   const publicData=await publicResponse.json(); assert.equal(publicData.settings.version,latestVersion); assert.equal(publicData.settings.updatedBy,undefined); assert.ok(Number.isFinite(Date.parse(publicData.serverNow)));
  });
  await t.test("valid quote succeeds; disabled branch, forged slot and horizon fail",async()=>{
   const valid=await preview(); assert.equal(valid.status,200,await valid.clone().text()); assert.equal((await valid.json()).slot.id,"10:00");
   for(const patch of [{branchId:"manila"},{slotId:"10:15"},{date:addCalendarDays(manilaDate(),31)},{date:"2000-01-01"}]) assert.equal((await preview(patch)).status,409);
  });
  await t.test("closing a chosen date invalidates stale requests and supplies refreshed rules",async()=>{
   const next={...settings,version:latestVersion!,branches:structuredClone(settings.branches)}; next.branches.cebu.closedDates=[date];
   const saved=await save(next); assert.equal(saved.status,200); latestVersion=(await saved.json()).settings.version;
   const rejected=await preview(); assert.equal(rejected.status,409); const data=await rejected.json(); assert.equal(data.schedule.version,latestVersion); assert.match(data.error,/cart has been kept/);
   const events=await db.collection("scheduleSettingsEvents").where("actorUid","==",user.uid).get(); assert.equal(events.size,2);
  });
  await t.test("revoked owner cannot save",async()=>{
   await db.doc(`admins/${user.uid}`).update({active:false}); assert.equal((await save({...settings,version:latestVersion})).status,403);
  });
 } finally {
  await db.runTransaction(async tx=>{const doc=await tx.get(ref);if(doc.data()?.updatedBy===user.uid && doc.data()?.version===latestVersion){if(before.exists)tx.set(ref,before.data()!);else tx.delete(ref);}});
  const events=await db.collection("scheduleSettingsEvents").where("actorUid","==",user.uid).get(); for(const event of events.docs)await event.ref.delete();
  await db.doc(`admins/${user.uid}`).delete(); await auth.deleteUser(user.uid);
 }
});
