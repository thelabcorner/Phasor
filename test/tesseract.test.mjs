import test from "node:test";
import assert from "node:assert/strict";
import {DOMParser} from "@xmldom/xmldom";
import {
  TESSERACT_EDGES,TESSERACT_VERTICES,sampleTesseract,compileTesseractSvg,tesseractPathAt
} from "../dist/procedural/tesseract.js";

const shared=compileTesseractSvg({periodMs:4000,tolerancePx:.3});
test("tesseract has 16 vertices and 32 degree-four edges",()=>{
 assert.equal(TESSERACT_VERTICES.length,16);
 assert.equal(TESSERACT_EDGES.length,32);
 const degree=new Int32Array(16);
 for(const [a,b] of TESSERACT_EDGES) {
  assert.ok(a>=0&&a<16&&b>=0&&b<16);
  assert.equal((a^b).toString(2).replace(/0/g,"").length,1);
  degree[a]++;degree[b]++;
 }
 assert.deepEqual([...degree],Array(16).fill(4));
});
test("4D rotating projection is finite and canonical across any full cycle",()=>{
 for(let t=0;t<=4000;t+=25){
  const x=sampleTesseract(t),p=sampleTesseract(t+4000);
  assert.equal(x.length,32);
  for(let i=0;i<x.length;i++){
   assert.ok(Number.isFinite(x[i]));
   assert.ok(Math.abs(x[i]-p[i])<1e-10);
  }
 }
  assert.deepEqual([...sampleTesseract(0)],[...sampleTesseract(4000)]);
});
test("configured rotation period drives the geometry oracle and closes exactly",()=>{
 const periodMs=4800;
 assert.equal(tesseractPathAt(0,{periodMs}),tesseractPathAt(periodMs,{periodMs}));
 assert.notEqual(tesseractPathAt(2400,{periodMs}),tesseractPathAt(2400,{periodMs:4000}));
 const compiled=compileTesseractSvg({periodMs,tolerancePx:.24,maxKeyframes:1024});
 assert.equal(compiled.report.exactSerializedSeam,true);
 const animation=new DOMParser().parseFromString(compiled.svg,"image/svg+xml").getElementsByTagName("animate").item(0);
 assert.equal(animation.getAttribute("dur"),"4.8s");
 const values=animation.getAttribute("values").split(";");
 assert.equal(values[0],values.at(-1));
});
test("SVG has exact serialized seam, compatible M/L path grammar and no JS",()=>{
 assert.equal(tesseractPathAt(0),tesseractPathAt(4000));
 const doc=new DOMParser().parseFromString(shared.svg,"image/svg+xml");
 const path=doc.getElementById("tesseract");
 const animation=path.getElementsByTagName("animate").item(0);
 assert.equal(animation.getAttribute("attributeName"),"d");
 assert.equal(animation.getAttribute("repeatCount"),"indefinite");
 assert.equal(animation.getAttribute("calcMode"),"linear");
 const frames=animation.getAttribute("values").split(";");
 const times=animation.getAttribute("keyTimes").split(";").map(Number);
 assert.equal(frames.length,shared.report.outputKeyframes);
 assert.equal(frames[0],frames.at(-1));
 assert.equal(frames[0],path.getAttribute("d"));
 assert.equal(frames[0].match(/M/g).length,32);
 assert.equal(frames[0].match(/L/g).length,32);
 assert.equal(times.length,frames.length);
 assert.equal(times[0],0);
 assert.equal(times.at(-1),1);
 for(let i=1;i<times.length;i++)assert.ok(times[i]>times[i-1]);
 assert.doesNotMatch(shared.svg,/<script|onload=|javascript:/);
});
test("shared-knots 4D projection measured error is below declared tolerance at 2000 extra times",()=>{
 const doc=new DOMParser().parseFromString(shared.svg,"image/svg+xml");
 const a=doc.getElementsByTagName("animate").item(0);
 const times=a.getAttribute("keyTimes").split(";").map(Number);
 const values=a.getAttribute("values").split(";");
 const numeric=/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/g;
 function positions(path){
   const coordinates=path.match(numeric).map(Number);
   assert.equal(coordinates.length,32*4);
   const projected=new Float64Array(32);
   const visited=new Set();
   for(let e=0;e<32;e++){
     const [from,to]=TESSERACT_EDGES[e];
     for(const [id,offset] of [[from,e*4],[to,e*4+2]]){
       const x=coordinates[offset],y=coordinates[offset+1];
       if(!visited.has(id)){
         visited.add(id);projected[id*2]=x;projected[id*2+1]=y;
       } else {
         assert.ok(Math.abs(projected[id*2]-x)<1e-9);
         assert.ok(Math.abs(projected[id*2+1]-y)<1e-9);
       }
     }
   }
   assert.equal(visited.size,16);
   return projected;
 }
 const paths=values.map(positions);
 let max=0;
 for(let i=0;i<=2000;i++){
   const t=i/2000;
   let low=0,high=times.length-1;
   while(high-low>1){const mid=(low+high)>>1;if(times[mid]<=t)low=mid;else high=mid;}
   const amount=(t-times[low])/(times[high]-times[low]);
   const oracle=sampleTesseract(t*4000);
   for(let vertex=0;vertex<16;vertex++){
     const x=paths[low][vertex*2]*(1-amount)+paths[high][vertex*2]*amount;
     const y=paths[low][vertex*2+1]*(1-amount)+paths[high][vertex*2+1]*amount;
     max=Math.max(max,Math.hypot(x-oracle[vertex*2],y-oracle[vertex*2+1]));
   }
 }
 assert.ok(max<.34,"dense observed error "+max);
});
test("tesseract capacity and projection safety fail closed",()=>{
 assert.throws(()=>compileTesseractSvg({maxKeyframes:3,tolerancePx:.001}),{code:"LIMIT_EXCEEDED"});
 assert.throws(()=>compileTesseractSvg({fourDObserverDistance:1.4}),{code:"TIMING_INVALID"});
 assert.throws(()=>compileTesseractSvg({decimalDigits:-1}),{code:"TIMING_INVALID"});
 assert.throws(()=>sampleTesseract(Infinity),{code:"TIMING_INVALID"});
});
