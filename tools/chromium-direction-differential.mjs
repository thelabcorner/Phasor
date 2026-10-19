import { chromium } from "playwright-core";
import { compileSvgAnimation } from "../dist/index.js";
import { writeFileSync,mkdirSync } from "node:fs";
const browser=await chromium.launch({executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",headless:true,args:["--no-sandbox"]});
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><circle id="dot" cx="20" cy="40" r="8" fill="#2563eb"/></svg>';
const cfg=[
 {name:"reverse",direction:"reverse",iterations:3,fill:"forwards",keyframes:[{cx:20},{cx:200}]},
 {name:"reverse-infinite",direction:"reverse",iterations:Infinity,fill:"none",keyframes:[{cx:20},{cx:200}]},
 {name:"reverse-ease-in",direction:"reverse",iterations:2,fill:"forwards",keyframes:[{cx:20,easing:"ease-in"},{cx:200}]},
 {name:"alternate-even",direction:"alternate",iterations:2,fill:"forwards",keyframes:[{cx:20},{cx:200}]},
 {name:"alternate-odd",direction:"alternate",iterations:3,fill:"forwards",keyframes:[{cx:20},{cx:200}]},
 {name:"alternate-reverse-odd",direction:"alternate-reverse",iterations:3,fill:"forwards",keyframes:[{cx:20},{cx:200}]},
 {name:"alternate-infinite",direction:"alternate",iterations:Infinity,fill:"none",keyframes:[{cx:20},{cx:200}]},
 {name:"alternate-spline",direction:"alternate",iterations:3,fill:"forwards",keyframes:[{offset:0,cx:20,easing:"ease-in"},{offset:.3,cx:100,easing:"ease-out"},{offset:1,cx:200}]},
 {name:"reverse-effect-easing",direction:"reverse",iterations:3,fill:"forwards",effectEasing:"ease-in-out",keyframes:[{cx:20},{cx:200}]}
];
const page=await browser.newPage({viewport:{width:520,height:250}});
const results=[];
try {
 for(const f of cfg){
   const timing={duration:1000,iterations:f.iterations,direction:f.direction,fill:f.fill,easing:f.effectEasing??"linear"};
   const compiled=compileSvgAnimation({svg,tracks:[{target:{svgId:"dot"},keyframes:f.keyframes,timing}]});
   const raw=svg.replace("<svg ","<svg id=\"reference\" ")+compiled.svg.replace("<svg ","<svg id=\"compiled\" ");
   await page.setContent("<html><body style='margin:0'>"+raw+"</body></html>");
   await page.evaluate(({frames,timing})=>{
      const ref=document.querySelector("#reference #dot");
      window.effect=ref.animate(frames.map(k=>({...k,cx:k.cx+"px"})),timing);
      window.effect.pause();
      document.querySelector("#compiled").pauseAnimations();
   },{frames:f.keyframes,timing});
   const times=[0,5,100,250,300,450,500,750,900,999,1000,1001,1250,1500,1999,2000,2001,2500,2999,3000,3010,3600,4500];
   const samples=[];
   for(const t of times){
      const s=await page.evaluate(time=>{
        window.effect.currentTime=time;
        const compiled=document.querySelector("#compiled");
        compiled.setCurrentTime(time/1000);
        const ref=document.querySelector("#reference #dot").getBoundingClientRect();
        const dst=document.querySelector("#compiled #dot").getBoundingClientRect();
        const srcSvg=document.querySelector("#reference").getBoundingClientRect();
        const dstSvg=compiled.getBoundingClientRect();
        return {ref:ref.x-srcSvg.x,compiled:dst.x-dstSvg.x};
      },t);
      samples.push({t,...s,error:Math.abs(s.ref-s.compiled)});
   }
   results.push({name:f.name,maxErrorPx:Math.max(...samples.map(s=>s.error)),failures:samples.filter(s=>s.error>.1)});
 }
}finally{await page.close();await browser.close();}
mkdirSync("evidence",{recursive:true});
writeFileSync("evidence/chromium-direction-differential-0001.json",JSON.stringify({results},null,2));
console.log(JSON.stringify(results,null,2).slice(0,11000));
if(results.some(r=>r.failures.length))process.exitCode=1;
