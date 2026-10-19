import {chromium} from "playwright-core";
import {compileSvgAnimation} from "../dist/index.js";
import {writeFileSync,mkdirSync} from "node:fs";
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><circle id="dot" cx="20" cy="50" r="8" /></svg>';
const scenarios=[
 {name:"mid-cycle-forwards",delay:-250,iterations:2,fill:"forwards",direction:"normal"},
 {name:"mid-cycle-none",delay:-250,iterations:2,fill:"none",direction:"normal"},
 {name:"whole-cycle-skipped",delay:-1250,iterations:2,fill:"forwards",direction:"normal"},
 {name:"ended-before-zero-forwards",delay:-2500,iterations:2,fill:"forwards",direction:"normal"},
 {name:"ended-before-zero-none",delay:-2500,iterations:2,fill:"none",direction:"normal"},
 {name:"alternate-mid-cycle",delay:-750,iterations:3,fill:"forwards",direction:"alternate"},
 {name:"reverse-negative",delay:-250,iterations:3,fill:"forwards",direction:"reverse"},
];
const browser=await chromium.launch({executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",headless:true,args:["--no-sandbox"]});
const page=await browser.newPage({viewport:{width:440,height:130}});
const results=[];
try{
 for(const f of scenarios){
   const timing={duration:1000,iterations:f.iterations,fill:f.fill,direction:f.direction};
   const compiled=compileSvgAnimation({svg,tracks:[{target:{svgId:"dot"},keyframes:[{cx:20},{cx:180}],timing}]});
   const marked=compiled.svg.replace('begin="0s"',`begin="${f.delay/1000}s"`);
   await page.setContent(svg.replace("<svg ","<svg id=\"source\" ")+marked.replace("<svg ","<svg id=\"compiled\" "));
   await page.evaluate(({timing,delay})=>{
     window.animation=document.querySelector("#source #dot").animate([{cx:"20px"},{cx:"180px"}],{...timing,delay});
     window.animation.pause();
     document.querySelector("#compiled").pauseAnimations();
   },{timing,delay:f.delay});
   const samples=[];
   for(const t of [0,1,100,250,500,750,999,1000,1250,1500,2000,2500,3000]){
     const s=await page.evaluate(time=>{
       window.animation.currentTime=time;
       const dest=document.querySelector("#compiled");dest.setCurrentTime(time/1000);
       const a=document.querySelector("#source #dot").getBoundingClientRect(),b=dest.querySelector("#dot").getBoundingClientRect();
       const aa=document.querySelector("#source").getBoundingClientRect(),bb=dest.getBoundingClientRect();
       return {ref:a.x-aa.x,actual:b.x-bb.x};
     },t);
     samples.push({t,...s,error:Math.abs(s.actual-s.ref)});
   }
   results.push({name:f.name,maxErrorPx:Math.max(...samples.map(s=>s.error)),failures:samples.filter(s=>s.error>.1)});
 }
}finally{await page.close();await browser.close();}
mkdirSync("evidence",{recursive:true});writeFileSync("evidence/chromium-negative-delay-probe-0001.json",JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2).slice(0,6000));
if(results.some(r=>r.failures.length))process.exitCode=1;
