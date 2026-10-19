import { chromium } from "playwright-core";
import { compileSvgAnimation } from "../dist/index.js";
import { writeFileSync,mkdirSync } from "node:fs";

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const svg=(baseline,extra="")=>`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect id="tile" x="80" y="30" width="30" height="20" fill="#2563eb" transform="${baseline}" ${extra}/></svg>`;
const fixture=[
 {name:"translate",base:"translate(0 0)",keyframes:[{transform:"translate(0px, 0px)"},{transform:"translate(120px, 40px)"}]},
 {name:"rotate-360",base:"rotate(0)",keyframes:[{transform:"rotate(0deg)"},{transform:"rotate(360deg)"}]},
 {name:"rotate-180",base:"rotate(0)",keyframes:[{transform:"rotate(0deg)"},{transform:"rotate(180deg)"}]},
 {name:"rotate-multi-spline",base:"rotate(0)",keyframes:[
   {offset:0,transform:"rotate(0deg)",easing:"ease-in-out"},
   {offset:.2,transform:"rotate(140deg)",easing:"ease-in"},
   {offset:1,transform:"rotate(360deg)"}]},
 {name:"scale",base:"scale(1)",keyframes:[{transform:"scale(1)"},{transform:"scale(2,0.5)"}]},
 {name:"scale-with-spline",base:"scale(1)",keyframes:[{transform:"scale(1,1)",easing:"ease-in-out"},{transform:"scale(1.5,2.25)"}]},
 {name:"translate-delayed",base:"translate(0)",keyframes:[{transform:"translate(0px,0px)"},{transform:"translate(80px,50px)"}],timing:{duration:1000,delay:200,fill:"forwards"}},
 {name:"rotate-alternate-odd",base:"rotate(0)",keyframes:[{transform:"rotate(0deg)"},{transform:"rotate(360deg)"}],timing:{duration:1000,iterations:3,direction:"alternate",fill:"forwards"}},
 {name:"translate-alternate-reverse",base:"translate(0 0)",keyframes:[{transform:"translate(0px,0px)"},{transform:"translate(100px,40px)"}],timing:{duration:1000,iterations:3,direction:"alternate-reverse",fill:"forwards"}},
 {name:"scale-reverse",base:"scale(1)",keyframes:[{transform:"scale(1)",easing:"ease-in"},{transform:"scale(2,0.5)"}],timing:{duration:1000,iterations:2,direction:"reverse",fill:"forwards"}},
];
const times=[0,20,100,200,350,500,750,990,999,1000,1001,1250,1500,1999,2000,2001,2500,2999,3000];
const browser=await chromium.launch({executablePath:chrome,headless:true,args:["--no-sandbox"]});
const page=await browser.newPage({viewport:{width:750,height:750},deviceScaleFactor:1});
const runs=[];
try {
 for(const f of fixture){
   const timing=f.timing??{duration:1000,fill:"forwards"};
   const exported=compileSvgAnimation({svg:svg(f.base),tracks:[{target:{svgId:"tile"},keyframes:f.keyframes,timing}]});
   const src=svg(f.base).replace("<svg ","<svg id=\"reference\" ");
   const dst=exported.svg.replace("<svg ","<svg id=\"compiled\" ");
   await page.setContent("<html><body style='margin:0;'>"+src+dst+"</body></html>");
   await page.evaluate(({keyframes,timing})=>{
     const effect=document.querySelector("#reference #tile").animate(keyframes,timing);
     effect.pause();
     window.referenceAnimation=effect;
     document.querySelector("#compiled").pauseAnimations();
   },{keyframes:f.keyframes,timing});
   const samples=[];
   for(const t of times){
     const sample=await page.evaluate(time=>{
       window.referenceAnimation.currentTime=time;
       document.querySelector("#compiled").setCurrentTime(time/1000);
       const ref=document.querySelector("#reference #tile");
       const out=document.querySelector("#compiled #tile");
       const r=ref.getBoundingClientRect(),o=out.getBoundingClientRect();
       const refViewport=document.querySelector("#reference").getBoundingClientRect();
       const outViewport=document.querySelector("#compiled").getBoundingClientRect();
       return {
         ref:{x:r.x-refViewport.x,y:r.y-refViewport.y,width:r.width,height:r.height,css:getComputedStyle(ref).transform},
         out:{x:o.x-outViewport.x,y:o.y-outViewport.y,width:o.width,height:o.height,css:getComputedStyle(out).transform}
       };
     },t);
     const coordErrors=["x","y","width","height"].map(k=>Math.abs(sample.ref[k]-sample.out[k]));
     samples.push({time:t,maxErrorPx:Math.max(...coordErrors),...sample});
   }
   const maxError=Math.max(...samples.map(s=>s.maxErrorPx));
   runs.push({name:f.name,maxErrorPx:maxError,failures:samples.filter(s=>s.maxErrorPx>.1),samples});
 }
} finally {await page.close();await browser.close();}
mkdirSync("evidence",{recursive:true});
writeFileSync("evidence/chromium-transform-differential-0001.json",JSON.stringify({engine:"installed Chrome",time:new Date().toISOString(),runs},null,2));
console.log(JSON.stringify(runs.map(r=>({name:r.name,maxErrorPx:r.maxErrorPx,failures:r.failures.slice(0,2)})),null,2).slice(0,11000));
if(runs.some(r=>r.maxErrorPx>.1))process.exitCode=1;
