import {DOMParser} from "@xmldom/xmldom";
import {TESSERACT_EDGES,sampleTesseract,tesseractPathAt,compileTesseractSvg} from "../dist/procedural/tesseract.js";
import {writeFileSync,mkdirSync} from "node:fs";
const PERIOD=4000;
const result=compileTesseractSvg({periodMs:PERIOD,tolerancePx:.3});
const xml=new DOMParser().parseFromString(result.svg,"image/svg+xml");
const a=xml.getElementsByTagName("animate").item(0);
const adaptiveTimes=a.getAttribute("keyTimes").split(";").map(Number);
const adaptiveValues=a.getAttribute("values").split(";");
function decode(path){
 const numbers=path.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/g).map(Number);
 const out=new Float64Array(32),set=new Uint8Array(16);
 for(let i=0;i<32;i++){
  const [x,y]=TESSERACT_EDGES[i];
  for(const [v,offset] of [[x,i*4],[y,i*4+2]]){
   const vx=numbers[offset],vy=numbers[offset+1];
   if(!set[v]) {set[v]=1;out[v*2]=vx;out[v*2+1]=vy;}
  }
 }
 return out;
}
const prepared=values=>values.map(decode);
const frameArray=[
 {name:"selected-optimized",times:adaptiveTimes,values:adaptiveValues,bytes:result.report.outputBytes},
 ...[91,241,401].map(frames=>{
   const times=Array.from({length:frames},(_,i)=>i/(frames-1));
   const values=times.map(t=>tesseractPathAt(t*PERIOD));
   const compiled=result.svg.replace(a.getAttribute("keyTimes"),times.map(String).join(";"))
      .replace(a.getAttribute("values"),values.join(";"));
   return {name:"uniform-"+frames,times,values,bytes:new TextEncoder().encode(compiled).length};
 })
];
function measure(frames){
 const points=prepared(frames.values);
 const errors=[];
 let cursor=0;
 for(let index=0;index<=4000;index++){
   const t=index/4000;
   while(cursor+2<frames.times.length && t>frames.times[cursor+1]) cursor++;
   const ta=frames.times[cursor],tb=frames.times[cursor+1];
   const u=Math.min(1,Math.max(0,(t-ta)/(tb-ta)));
   const actual=sampleTesseract(t*PERIOD);
   let err=0;
   for(let v=0;v<16;v++){
     const x=points[cursor][v*2]*(1-u)+points[cursor+1][v*2]*u;
     const y=points[cursor][v*2+1]*(1-u)+points[cursor+1][v*2+1]*u;
     err=Math.max(err,Math.hypot(x-actual[v*2],y-actual[v*2+1]));
   }
   errors.push(err);
 }
 const sorted=[...errors].sort((a,b)=>a-b);
 return {
  name:frames.name,frames:frames.values.length,bytes:frames.bytes,
  denseChecks:errors.length,maxObservedErrorPx:Math.max(...errors),
  p99ErrorPx:sorted[Math.floor(sorted.length*.99)],meanErrorPx:errors.reduce((x,y)=>x+y,0)/errors.length
 };
}
const rows=frameArray.map(measure);
mkdirSync("evidence",{recursive:true});
writeFileSync("evidence/tesseract-pareto-optimized-0003.json",JSON.stringify({periodMs:PERIOD,method:result.report.lowering,rows},null,2));
console.log(JSON.stringify(rows,null,2));
