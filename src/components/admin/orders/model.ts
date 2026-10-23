// Fictional presentation data. Deliberately separate from persisted order schemas.
export const TODAY = "2026-10-23";
export const NOW = "2026-10-23T09:22:00+08:00";
export type Status = "requested" | "processing" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled" | "expired";
export type View = "needs-action" | "overnight" | "today" | "upcoming" | "ready" | "completed" | "closed" | "all";
export type Scenario = "normal" | "overnight" | "fee" | "payment" | "allocation" | "rider" | "edited" | "conflict" | "network" | "expired" | "paused" | "unreachable" | "price" | "no-show" | "anonymous" | "loading" | "load-error" | "empty" | "restricted" | "unassigned";
export type Item = { id: string; name: string; size: string; quantity: number; price: number; addon?: string; addonPrice?: number; message?: string; contents?: string[]; savory?: boolean };
export type Payment = { id: string; amount: number; kind: "payment" | "refund"; method: string; reference: string; note: string; proof?: string; voidReason?: string; at: string; actor: string };
export type Order = { id: string; number: string; branchId: string; branchName: string; customer: string; contact: string; date: string; time: string; submitted: string; status: Status; delivery: boolean; address: string; items: Item[]; fee: number | null; feeToRider: boolean; requirePayment: boolean; editable: boolean; night: boolean; urgent: boolean; pickupSoon: boolean; edited: boolean; new: boolean; allocationBlocked: boolean; overLimit: boolean; anonymous: boolean; rider: { name: string; plate: string; link: string } | null; payments: Payment[]; customerNote: string; staffNotes: { text: string; at: string; actor: string }[]; history: { text: string; at: string; actor: string }[]; cancelReason?: string; boxMode: "customer" | "automatic" | "reset"; menuChanged?: boolean };
export const views: { id: View; label: string; empty: string }[] = [
 { id: "needs-action", label: "Needs action", empty: "All caught up. No orders need action." }, { id: "overnight", label: "Waiting since last night", empty: "No night orders waiting." }, { id: "today", label: "Today", empty: "No pickups or deliveries today." }, { id: "upcoming", label: "Upcoming", empty: "No upcoming orders yet." }, { id: "ready", label: "Ready / Out", empty: "No orders ready for pickup or out for delivery." }, { id: "completed", label: "Completed", empty: "No completed orders yet." }, { id: "closed", label: "Closed", empty: "No cancelled or expired orders." }, { id: "all", label: "All", empty: "No orders yet. New requests will appear here." },
];
export const scenarios: { id: Scenario; label: string }[] = [
 ["normal","All order states"], ["overnight","Overnight / pickup soon"], ["fee","Unconfirmed delivery fee"], ["payment","Full payment required"], ["allocation","Allocation blocked"], ["rider","Missing rider"], ["edited","Customer edit arrived"], ["conflict","Concurrent change"], ["network","Save failure"], ["expired","Hold just expired"], ["paused","Branch paused"], ["unreachable","Unreachable address"], ["price","Menu price changed"], ["no-show","Pickup no-show"], ["anonymous","Anonymized record"], ["loading","Initial loading"], ["load-error","Load failure"], ["empty","Empty views"], ["restricted","Order not found / restricted"], ["unassigned","No assigned branches"],
].map(([id,label]) => ({id:id as Scenario,label}));
export const labels: Record<Status,string> = {requested:"Pending validation",processing:"Processing",confirmed:"Approved",preparing:"Preparing",ready:"Ready for pickup",completed:"Completed",cancelled:"Cancelled",expired:"Expired"};
export const statusLabel = (o: Order) => o.status === "ready" && o.delivery ? "Out for delivery" : labels[o.status];
export const subtotal = (o: Order) => o.items.reduce((sum,line) => sum + line.quantity * (line.price + (line.addonPrice ?? 0)),0);
export const total = (o: Order) => subtotal(o) + (o.delivery && !o.feeToRider ? o.fee ?? 0 : 0);
export const received = (o: Order) => o.payments.filter(p=>!p.voidReason).reduce((sum,p)=>sum+(p.kind==="refund"?-p.amount:p.amount),0);
export const balance = (o: Order) => total(o)-received(o);
export const paymentLabel = (o: Order) => received(o)<=0 ? "Unpaid" : balance(o)>0 ? "Partly paid" : "Paid";
export const money = (n: number) => new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",maximumFractionDigits:2}).format(n/100);
export const terminal = (o: Order) => ["completed","cancelled","expired"].includes(o.status);
export function inView(o: Order,v: View) {
 const active=["confirmed","preparing","ready"].includes(o.status);
 switch(v){case "needs-action":return !terminal(o)&&(o.status==="requested"||o.status==="processing"||(o.delivery&&o.fee===null)||(o.status==="confirmed"&&o.requirePayment&&balance(o)>0));case "overnight":return o.status==="requested"&&o.night;case "today":return active&&o.date===TODAY;case "upcoming":return active&&o.date>TODAY;case "ready":return o.status==="ready";case "completed":return o.status==="completed";case "closed":return o.status==="expired"||o.status==="cancelled";default:return true;}
}
export function sortOrders(rows:Order[],view:View){return [...rows].sort((a,b)=>{
 if(view==="needs-action"){const rank=(o:Order)=>o.status==="requested"?(o.urgent?0:1):2;if(rank(a)!==rank(b))return rank(a)-rank(b);}
 if(["all","closed"].includes(view))return b.submitted.localeCompare(a.submitted);
 if(view==="completed")return b.date.localeCompare(a.date)||b.time.localeCompare(a.time);
 return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)||a.submitted.localeCompare(b.submitted);
});}
export function matchesSearch(o:Order,query:string){const q=query.trim().toLowerCase();if(!q)return true;const number=q.toUpperCase().replace(/[\s-]/g,"").replace(/^MK/,"");if(/^\d+$/.test(number))return o.number===`MK-${number}`;return !o.anonymous&&`${o.customer} ${o.contact}`.toLowerCase().includes(q);}
export function fixtures(branches:{id:string;name:string}[]):Order[]{
 if(!branches.length)return [];
 const statuses:Status[]=["requested","requested","processing","confirmed","preparing","ready","ready","completed","expired","cancelled","confirmed","processing"];
 return statuses.map((status,i)=>{const branch=branches[i%branches.length];const delivery=[2,4,6,9].includes(i);const o:Order={id:`example-${i+1}`,number:`MK-${1201+i}`,branchId:branch.id,branchName:branch.name,customer:["Alex Reyes","Sam Cruz","Jamie Lee","Taylor Santos","Morgan Diaz","Casey Ramos","Riley Tan","Avery Lim","Drew Garcia","Robin Perez","Jordan Co","Noah Flores"][i],contact:`@sample.customer${i+1}`,date:i===10?"2026-10-24":i===7||i===9?"2026-10-22":TODAY,time:`${String(10+i%8).padStart(2,"0")}:00`,submitted:`2026-10-${i===1?"22":"23"}T${i===1?"23:42":"09:00"}:00+08:00`,status,delivery,address:delivery?"Sample address · 12 Example Street, Cebu City":"Sample branch pickup address",items:[{id:"pecan",name:"Pecan pie",size:"4-inch",quantity:4,price:18000},{id:"oreo",name:"Oreo pie",size:"4-inch",quantity:4,price:16000,addon:i===3?"Message topper":undefined,addonPrice:i===3?5000:0,message:i===3?"Happy birthday, Alex!":undefined}],fee:delivery?(i===2?null:12000):null,feeToRider:i===6,requirePayment:i===3,editable:i===1,night:i===1,urgent:i===0,pickupSoon:false,edited:i===11,new:i===0,allocationBlocked:false,overLimit:false,anonymous:false,rider:i===6?{name:"Sample rider",plate:"DEMO 01",link:""}:null,payments:[],customerNote:i===3?"Please keep the message card with the birthday box.":"",staffNotes:[],history:[{text:"Order submitted; pies held against allocation.",at:NOW,actor:"Customer"}],boxMode:i===3?"customer":"automatic",cancelReason:status==="cancelled"?"Customer asked to cancel":undefined};if([5,6,7,9].includes(i))o.payments=[{id:`pay-${i}`,amount:total(o),kind:"payment",method:"GCash",reference:"SAMPLE",note:"",at:NOW,actor:"Sample staff"}];if(i===11)o.payments=[{id:"partial-sample",amount:40000,kind:"payment",method:"Bank transfer",reference:"SAMPLE-PARTIAL",note:"Deposit example",at:NOW,actor:"Sample staff"}];if(i===10)o.items=[{id:"package",name:"Sample sweet box",size:"Fixed 4-pie package",quantity:1,price:68000,contents:["2 Pecan 4-inch","2 Oreo 4-inch"]},{id:"chicken",name:"Butter chicken pie",size:"Single pie",quantity:1,price:22000,savory:true}];return o;});
}
export function scenarioOrders(base:Order[],scenario:Scenario):Order[]{
 if(scenario==="empty")return [];
 if(scenario==="normal"||scenario==="paused"||scenario==="loading"||scenario==="load-error"||scenario==="unassigned"||scenario==="restricted")return base;
 const first=base[0];if(!first)return base;
 const o:Order={...first,items:first.items.map(i=>({...i})),new:false,urgent:false,history:[...first.history]};
 if(scenario==="overnight"){o.night=true;o.pickupSoon=true;o.urgent=true;}
 if(["fee","unreachable"].includes(scenario)){o.status="processing";o.delivery=true;o.fee=null;o.address="Sample address · 12 Example Street, Cebu City";}
 if(scenario==="payment"){o.status="confirmed";o.requirePayment=true;}
 if(scenario==="allocation"){o.status="processing";o.allocationBlocked=true;}
 if(scenario==="rider"){o.status="preparing";o.delivery=true;o.fee=12000;o.rider=null;}
 if(scenario==="edited"){o.status="processing";o.edited=true;o.editable=true;o.history.push({text:"Pecan quantity changed from 2 to 4. Boxes reset to automatic.",at:NOW,actor:"Customer"});}
 if(scenario==="expired")o.status="expired";
 if(scenario==="price")o.menuChanged=true;
 if(scenario==="no-show")o.status="ready";
 if(scenario==="anonymous"){o.status="completed";o.anonymous=true;o.customer="Customer (removed)";o.contact="";o.address="";o.date="2026-09-20";o.customerNote="";o.payments=[{id:"anonymous-payment",amount:total(o),kind:"payment",method:"Bank transfer",reference:"",note:"",at:NOW,actor:"Sample staff"}];}
 return [o,...base.slice(1)];
}
