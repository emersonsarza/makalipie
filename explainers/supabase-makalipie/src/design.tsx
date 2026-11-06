import React from 'react';
import {AbsoluteFill, CanvasImage, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
export const colors = {cream:'#faf9f6', ink:'#454145', yellow:'#efc315', butter:'#f3ebce', red:'#c74c3d', green:'#28705a'};
export const Pie = () => {const {fps}=useVideoConfig(); return <CanvasImage src={staticFile('buko.webp')} premountFor={fps} style={{width:430,height:390,objectFit:'contain'}}/>;};
export function Shell({chapter,title,subtitle,children,caption,source='Supabase pricing · verified 28 Oct 2026'}:{chapter:string;title:string;subtitle:string;children:React.ReactNode;caption:string;source?:string}) {
 const frame=useCurrentFrame(); const {durationInFrames}=useVideoConfig();
 return <AbsoluteFill style={{background:colors.cream,color:colors.ink,fontFamily:'Garet, sans-serif',padding:'64px 100px'}}>
 <style>{`@font-face{font-family:Garet;src:url('${staticFile('fonts/Garet-Book.woff2')}')}@font-face{font-family:Garet;src:url('${staticFile('fonts/Garet-Heavy.woff2')}');font-weight:800}*{box-sizing:border-box}`}</style>
 <div style={{display:'flex',justifyContent:'space-between',fontSize:24,letterSpacing:2}}><b>MAKALIPIE / FIELD NOTES</b><span>{chapter}</span></div>
 <div style={{height:8,background:colors.butter,marginTop:24}}><div style={{width:`${Math.max(0,frame)/durationInFrames*100}%`,height:'100%',background:colors.yellow}}/></div>
 <h1 style={{fontSize:72,lineHeight:1.1,margin:'32px 0 12px',fontWeight:800}}>{title}</h1>
 <div style={{fontSize:29,lineHeight:1.4,maxWidth:1650}}>{subtitle}</div>
 <div style={{position:'absolute',left:100,right:100,top:310,bottom:205}}>{children}</div>
 <div style={{position:'absolute',left:100,right:100,bottom:76,borderTop:'2px solid #d9d2be',paddingTop:20,fontSize:29,lineHeight:1.4}}>{caption}</div>
 <div style={{position:'absolute',bottom:28,left:100,right:100,fontSize:18,display:'flex',justifyContent:'space-between'}}><span>{source}</span><span>ILLUSTRATIVE · NO LIVE CUSTOMER DATA</span></div>
 </AbsoluteFill>;
}
export function Panel({label,children,accent=false}:{label:string;children:React.ReactNode;accent?:boolean}) {return <div style={{background:accent?colors.butter:'#fff',padding:30,borderRadius:20,border:'1px solid #ddd5c6',height:'100%'}}><div style={{fontSize:24,color:colors.green,fontWeight:800,marginBottom:22}}>{label}</div>{children}</div>;}
export function Row({a,b}:{a:string;b:string}) {return <div style={{display:'flex',gap:25,justifyContent:'space-between',padding:'17px 0',borderBottom:'1px solid #e8e3d8',fontSize:27,lineHeight:1.3}}><span>{a}</span><b style={{textAlign:'right'}}>{b}</b></div>;}
export function Meter({label,value,limit,unit,delay=0}:{label:string;value:number;limit:number;unit:string;delay?:number}) {
 const frame=useCurrentFrame();const {fps}=useVideoConfig();
 return <div style={{marginBottom:26}}><div style={{display:'flex',justifyContent:'space-between',fontSize:26,marginBottom:10}}><b>{label}</b><span>{value.toLocaleString()} / {limit.toLocaleString()} {unit}</span></div><div style={{height:22,background:colors.butter,borderRadius:20,overflow:'hidden'}}><div style={{height:'100%',background:value>limit?colors.red:colors.green,width:`${interpolate(frame,[delay*fps,(delay+1.2)*fps],[0,Math.min(value/limit,1)*100],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}%`}}/></div></div>;
}
export function Big({children}:{children:React.ReactNode}) {return <div style={{fontSize:56,fontWeight:800,lineHeight:1.2,margin:'20px 0'}}>{children}</div>;}
export function Text({children}:{children:React.ReactNode}) {return <div style={{fontSize:30,lineHeight:1.55}}>{children}</div>;}
export const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'1fr 1fr',gap:32,height:'100%'};
