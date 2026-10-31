"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CircleAlert, ClipboardList, Clock3, LockKeyhole, Search, Store, Truck, X } from "lucide-react";
import { useAdminBranch, useAdminWorkspace } from "@/components/admin/admin-shell";
import { useWideAdmin } from "@/components/admin/use-wide-admin";
import { useAdminResource } from "@/components/admin/live";
import { OrdersDetail } from "./orders-detail";
import { labels, money, views, type Order, type View } from "./model";
import styles from "./orders.module.css";

type Row = {
  id: string; number: string; branchId: string; branchName: string; customer: string | null; contact: string | null;
  fulfillmentDate: string; slotId: string; slotLabel: string; submittedAt: string; status: Order["status"];
  fulfillment: "pickup" | "delivery"; feeConfirmed: boolean; requireFullPayment: boolean; customerEditable: boolean;
  submittedAfterHours: boolean; pickupSoon: boolean; paymentStatus: "unpaid" | "partially_paid" | "paid" | "refunded";
  collectionCentavos: number | null; anonymized: boolean; sourceView: View;
};
type ListPayload = {
  serverNow: string;
  counts: Record<View, number>;
  rows: Row[];
  nextCursor: string | null;
  exactMatchId: string | null;
  selected: { id: string; matchesFilters: boolean } | null;
};
type DetailPayload = {
  order: {
    id: string; number: string; version: number; branchId: string; branchName: string; customer: string | null; contact: string | null;
    address: string | null; notes: string | null; anonymized: boolean; status: Order["status"]; fulfillment: "pickup" | "delivery";
    fulfillmentDate: string; slotId: string; slotLabel: string; submittedAt: string; deadline: string | null; submittedAfterHours: boolean;
    pickupSoon: boolean; requireFullPayment: boolean; customerEditable: boolean; feeDestination: "with_total" | "to_rider" | null;
    deliveryFeeCentavos: number | null; knownSubtotalCentavos: number; finalTotalCentavos: number | null; netReceivedCentavos: number;
    collectionCentavos: number | null; refundDueCentavos: number | null; lines: string[];
    selection: { date: string; lines: { productId: string; variantId: string; quantity: number; addons: { id: string; message: string }[] }[]; addons: { id: string; message: string }[] } | null;
    payments: { id: string; at: string; actorUid: string; method: "bank" | "gcash" | "cash"; amountCentavos: number; kind: "payment" | "refund"; reference: string | null; note: string | null; voidReason: string | null }[];
    staffNotes: { text: string; at: string; actorUid: string }[];
    rider: { name: string; plate: string; trackingUrl: string } | null;
    cancelReason: string | null;
    history: { at: string; actorUid: string; action: string; reason: string | null }[];
  };
  version: number;
  allowedActions: string[];
  guardReasons: { action: string; message: string; severity: "block" | "warning" }[];
  serverNow: string;
};

const viewIds = new Set(views.map((view) => view.id));
function statusText(row: { status: Order["status"]; fulfillment: "pickup" | "delivery" }) {
  return row.status === "ready" && row.fulfillment === "delivery" ? "Out for delivery" : labels[row.status];
}
function paymentText(status: Row["paymentStatus"]) {
  if (status === "paid") return "Paid";
  if (status === "partially_paid") return "Partly paid";
  if (status === "refunded") return "Refunded";
  return "Unpaid";
}
function toOrder(detail: DetailPayload): Order {
  const order = detail.order;
  return {
    id: order.id, number: order.number, branchId: order.branchId, branchName: order.branchName,
    customer: order.customer || (order.anonymized ? "Customer (removed)" : "Customer"), contact: order.contact || "",
    date: order.fulfillmentDate, time: order.slotId, submitted: order.submittedAt, status: order.status,
    delivery: order.fulfillment === "delivery", address: order.address || "",
    items: order.lines.length ? order.lines.map((line, index) => ({ id: order.selection?.lines[index] ? `${order.selection.lines[index].productId}:${order.selection.lines[index].variantId}:${index}` : `line-${index}`, name: line, size: "", quantity: order.selection?.lines[index]?.quantity ?? 1, price: 0, message: order.selection?.lines[index]?.addons.map((addon) => addon.message).filter(Boolean).join(", ") || undefined })) : [{ id: "empty", name: "No saved lines", size: "", quantity: 0, price: 0 }],
    fee: order.fulfillment === "delivery" ? order.deliveryFeeCentavos : null, feeToRider: order.feeDestination === "to_rider",
    requirePayment: order.requireFullPayment, editable: order.customerEditable, night: order.submittedAfterHours, urgent: false,
    pickupSoon: order.pickupSoon, edited: false, new: false, allocationBlocked: false, overLimit: false, anonymous: order.anonymized,
    rider: order.rider ? { name: order.rider.name, plate: order.rider.plate, link: order.rider.trackingUrl } : null,
    payments: order.payments.map((payment) => ({ id: payment.id, amount: payment.amountCentavos, kind: payment.kind, method: payment.method === "gcash" ? "GCash" : payment.method === "bank" ? "Bank transfer" : "Cash", reference: payment.reference || "", note: payment.note || "", voidReason: payment.voidReason || undefined, at: payment.at, actor: payment.actorUid })),
    customerNote: order.notes || "", staffNotes: order.staffNotes.map((note) => ({ text: note.text, at: note.at, actor: note.actorUid })),
    history: order.history.map((event) => ({ text: [event.action, event.reason].filter(Boolean).join(" · "), at: event.at, actor: event.actorUid })),
    cancelReason: order.cancelReason || undefined, boxMode: "automatic",
  };
}

export function OrdersPage(){const branch=useAdminBranch();return <OrdersWorkspace key={branch} branch={branch}/>;}
function OrdersWorkspace({branch}:{branch:string}){
 const {branches,role,selectBranch}=useAdminWorkspace();
 const router=useRouter();const params=useSearchParams();const searchRef=useRef<HTMLInputElement>(null);const wide=useWideAdmin();
 const rawView=params.get("view")||"needs-action";
 const view:View=viewIds.has(rawView as View)?rawView as View:["requested","processing","confirmed"].includes(rawView)?"needs-action":"all";
 const query=params.get("q")||"";const date=params.get("date")||"";const end=params.get("to")||"";const delivery=params.get("fulfillment")||"";const pay=params.get("pay")||"";
 const selectedId=params.get("order");
 const listQuery=new URLSearchParams({branch:branch||"all",view});
 if(query)listQuery.set("q",query);if(date)listQuery.set("date",date);if(end)listQuery.set("to",end);if(delivery)listQuery.set("fulfillment",delivery);if(pay)listQuery.set("pay",pay);if(selectedId)listQuery.set("order",selectedId);
 const listUrl=branch?`/api/admin/v2/orders?${listQuery}`:null;
 const {resource,refresh}=useAdminResource<ListPayload>(listUrl);
 const detailUrl=selectedId?`/api/admin/v2/orders/${encodeURIComponent(selectedId)}`:null;
 const detailState=useAdminResource<DetailPayload>(detailUrl);
 const [extra,setExtra]=useState<Row[]>([]);const [moreCursor,setMoreCursor]=useState<string|null|undefined>(undefined);const [notice,setNotice]=useState("");
 useEffect(()=>{setExtra([]);setMoreCursor(undefined);},[listUrl]);
 const list=resource.status==="ready"?resource.snapshot:null;
 const rows=[...(list?.rows??[]),...extra];
 const cursor=moreCursor===undefined?list?.nextCursor??null:moreCursor;
 const detail=detailState.resource.status==="ready"?detailState.resource.snapshot:null;
 const order=detail&&detail.order.id===selectedId?toOrder(detail):undefined;
 function update(values:Record<string,string|null>){const next=new URLSearchParams(params.toString());next.set("branch",branch);Object.entries(values).forEach(([key,value])=>value?next.set(key,value):next.delete(key));router.replace(`/admin/orders?${next}`,{scroll:false});}
 function clear(){selectBranch(role==="owner"?"all":branches[0]?.id||"",new URLSearchParams({view}).toString());}
 useEffect(()=>{if(query.trim()&&list?.exactMatchId&&list.exactMatchId!==selectedId)update({order:list.exactMatchId});},[query,list?.exactMatchId,selectedId]);
 const firstId=rows[0]?.id;
 const selectedInRows=!!selectedId&&rows.some(row=>row.id===selectedId);
 useEffect(()=>{if(wide!==true||resource.status!=="ready")return;if(query.trim()&&list?.exactMatchId)return;if(selectedId&&(selectedInRows||list?.selected))return;if(!firstId||firstId===selectedId)return;update({order:firstId});},[wide,resource.status,selectedId,selectedInRows,firstId,query,list?.exactMatchId,list?.selected]);
 async function loadMore(){if(!cursor||!listUrl)return;const response=await fetch(`${listUrl}&cursor=${encodeURIComponent(cursor)}`,{cache:"no-store"});const body=await response.json().catch(()=>({})) as ListPayload;if(response.ok&&Array.isArray(body.rows)){setExtra(current=>[...current,...body.rows]);setMoreCursor(body.nextCursor);}else setNotice("More orders could not be loaded.");}
 async function command(action:string,payload?:Record<string,unknown>){if(!detail)return "Refresh the order and try again.";const response=await fetch("/api/admin/v2/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({orderId:detail.order.id,action,expectedVersion:detail.version,idempotencyKey:crypto.randomUUID(),...(payload?{payload}:{})})});const body=await response.json().catch(()=>({})) as {error?:string;order?:unknown};if(response.status===401){window.location.replace("/admin/login?reason=session");return "Please sign in to continue.";}if(!response.ok||!body.order)return body.error||"The order was not changed.";detailState.refresh();refresh();setNotice("");return null;}
 function back(){update({order:null});requestAnimationFrame(()=>searchRef.current?.focus());}
 const filters=Boolean(query||date||end||delivery||pay);
 return <div className={styles.orders}>
   <div className={styles.toolbar}><label className={styles.search}><Search size={18} aria-hidden/><span className="sr-only">Search order number, name or contact</span><input ref={searchRef} value={query} placeholder="MK number, name or contact" onChange={e=>update({q:e.target.value||null,order:null})}/>{query&&<button aria-label="Clear search" onClick={()=>update({q:null,order:null})}><X size={16} aria-hidden/></button>}</label></div>
   <div className={styles.tabs} role="group" aria-label="Order views">{views.map(tab=><button key={tab.id} aria-pressed={view===tab.id&&!query} onClick={()=>update({view:tab.id,q:null,order:null})}>{tab.label}<span>{resource.status==="ready"?list?.counts[tab.id]??0:"—"}</span></button>)}</div>
   <div className={styles.filters}>
    {(role==="owner"||branches.length>1)&&<label>Branch<select value={branch} onChange={e=>selectBranch(e.target.value)}>{role==="owner"&&<option value="all">All branches</option>}{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
    <label>Fulfillment date<select value={["","today","tomorrow","next3","week"].includes(date)?date:"custom"} onChange={e=>update({date:e.target.value==="custom"?new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()):e.target.value||null,to:null})}><option value="">Any date</option><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="next3">Next 3 days</option><option value="week">This week</option><option value="custom">Choose date / range</option></select></label>
    {/^[0-9]{4}-/.test(date)&&<><label>From<input type="date" value={date} onChange={e=>update({date:e.target.value||null,to:null})}/></label><label>To (optional)<input type="date" min={date} value={end} onChange={e=>update({to:e.target.value||null})}/></label></>}
    <label>Fulfillment<select value={delivery} onChange={e=>update({fulfillment:e.target.value||null})}><option value="">Pickup & delivery</option><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select></label>
    <label>Payment<select value={pay} onChange={e=>update({pay:e.target.value||null})}><option value="">All payments</option><option value="unpaid">Unpaid</option><option value="partial">Partly paid</option><option value="paid">Fully paid</option><option value="required">Required, not fully paid</option></select></label><button onClick={clear}>Clear filters</button>
   </div>
   {filters&&<div className={styles.chips} aria-label="Applied filters">{[["q",query],["date",date],["to",end],["fulfillment",delivery],["pay",pay]].filter(([,value])=>value).map(([key,value])=><button key={key} onClick={()=>update(key==="date"?{date:null,to:null}:{[key]:null})}>{key}: {value}<X size={12} aria-hidden/><span className="sr-only">Remove filter</span></button>)}</div>}
   {notice&&<div className={styles.notice} role="status">{notice}<button onClick={()=>{setNotice("");refresh();detailState.refresh();}}>Refresh</button></div>}
   {view==="overnight"&&(list?.counts.overnight??0)>0&&<div className={styles.warning}><Clock3 size={18} aria-hidden/><p>{list?.counts.overnight} orders came in while you were closed. Start with the earliest pickup or delivery.</p></div>}
   {!branches.length?<div className={styles.fullState}><Store size={30} aria-hidden/><h3>You’re not assigned to a branch yet.</h3><p>Ask the owner to assign a branch before working with orders.</p></div>:resource.status==="forbidden"?<div className={styles.fullState}><LockKeyhole size={30} aria-hidden/><h3>Orders access is restricted</h3><p>{resource.message||"Ask the owner to enable Orders for this account."}</p></div>:resource.status==="loading"?<div className={styles.loading} aria-busy="true"><p role="status">Loading orders…</p><div/><div/><div/></div>:resource.status==="error"?<div className={styles.fullState} role="alert"><CircleAlert size={30} aria-hidden/><h3>Orders couldn’t be loaded</h3><p>{resource.message||"No orders were changed."}</p><button onClick={refresh}>Try again</button></div>:<div className={styles.workspace} data-detail={Boolean(selectedId)}>
    <section className={styles.list} aria-label="Orders list"><div className={styles.listHeading}><span>{query?"Search across all views":views.find(v=>v.id===view)?.label}</span><small>{list?.counts[query?"all":view]??rows.length} orders</small></div>
     {rows.length?rows.map(row=><button key={row.id} className={styles.orderRow} aria-pressed={selectedId===row.id} onClick={()=>update({order:row.id})}><span className={styles.rowTitle}><strong>{row.number}</strong><span className={styles.badge} data-status={row.status}>{statusText(row)}</span></span><span className={styles.customer}>{row.customer||(row.anonymized?"Customer (removed)":"Customer")}{branch==="all"&&<small> · {row.branchName}</small>}</span><span className={styles.rowMeta}>{row.fulfillment==="delivery"?<Truck size={14} aria-hidden/>:<Store size={14} aria-hidden/>}{row.fulfillmentDate} · {row.slotLabel}</span><span className={styles.rowBottom}><strong>{row.collectionCentavos==null?"Total pending":`${money(row.collectionCentavos)} due`}</strong><span>{row.requireFullPayment&&<LockKeyhole size={12} aria-hidden/>}{paymentText(row.paymentStatus)}</span></span><span className={styles.tags}>{row.submittedAfterHours&&row.status==="requested"&&<small>Night order</small>}{row.pickupSoon&&<small>Pickup soon</small>}{row.fulfillment==="delivery"&&!row.feeConfirmed&&<small>Fee not confirmed</small>}{row.customerEditable&&<small>Edit allowed</small>}{row.anonymized&&<small>Anonymized</small>}</span>{query&&<small className={styles.matchView}>{views.find(v=>v.id===row.sourceView)?.label}</small>}</button>):<div className={styles.empty}><ClipboardList size={27} aria-hidden/><h3>{query?"No order with that number or name.":filters?"No orders match these filters.":views.find(v=>v.id===view)?.empty}</h3><p>{filters?"Try a different search or remove a filter.":"Orders will appear here when they match this view."}</p>{filters&&<button onClick={clear}>Clear filters</button>}</div>}
     {cursor&&<button className={styles.back} onClick={()=>void loadMore()}>Load more <ArrowRight size={14} aria-hidden/></button>}
    </section>
    <section className={styles.detail} aria-label="Order details">{selectedId&&detailState.resource.status==="loading"?<p role="status">Loading this order…</p>:selectedId&&detailState.resource.status==="error"?<div className={styles.detailEmpty}><h3>Order not found.</h3><p>{detailState.resource.message||"Choose an order available in this branch."}</p></div>:order&&detail?<><button className={styles.back} onClick={back}><ArrowLeft size={17} aria-hidden/>Back to orders</button>{list?.selected&&!list.selected.matchesFilters&&<p className={styles.scopeNote}>This order is outside the current list filters. Its latest details remain open.</p>}<OrdersDetail key={detail.version+detail.order.id} order={order} role={role} scenario="normal" onSave={()=>false} onRefresh={()=>{refresh();detailState.refresh();}} onSearch={value=>update({q:value,view:"all",date:null,to:null,pay:null,fulfillment:null,order:null})} command={command} figures={{subtotal:detail.order.knownSubtotalCentavos,total:detail.order.finalTotalCentavos,received:detail.order.netReceivedCentavos,collection:detail.order.collectionCentavos,refundDue:detail.order.refundDueCentavos}} selection={detail.order.selection} allowed={detail.allowedActions} guards={detail.guardReasons} deadline={detail.order.deadline} serverNow={detail.serverNow}/></>:<div className={styles.detailEmpty}><p>{rows.length?"Opening the first order…":"No orders in this view."}</p></div>}</section>
   </div>}
 </div>;
}
