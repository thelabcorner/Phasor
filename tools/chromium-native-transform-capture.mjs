import { chromium } from "playwright-core";
import { readFileSync,writeFileSync,mkdirSync } from "node:fs";
import { compileSvgAnimation } from "../dist/index.js";

const raw=readFileSync("dist/browser/capture.js","utf8");
const adapter=raw.replace(
 /import\s*\{\s*AnimationCompileError\s*\}\s*from\s*"\.\.\/diagnostics\.js";/,
 'class AnimationCompileError extends Error {constructor(code,message){super(message);this.code=code;}}'
);
if(adapter.includes('from "../diagnostics.js"')) throw Error("Cannot run browser adapter in browser without a bundle");
const url="data:text/javascript;base64,"+Buffer.from(adapter).toString("base64");
const original=base=>`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect id="tile" x="80" y="30" width="30" height="20" fill="#2a68ce" transform="${base}"/></svg>`;
const scenarios=[
 {name:"translate",base:"translate(0 0)",frames:[{transform:"translate(0px, 0px)"},{transform:"translate(80px, 20px)"}]},
 {name:"scale",base:"scale(1)",frames:[{transform:"scale(1)",easing:"ease-in-out"},{transform:"scale(1.5,0.75)"}]},
 {name:"full-rotation",base:"rotate(0)",frames:[{transform:"rotate(0deg)"},{transform:"rotate(360deg)"}]},
];
const browser=await chromium.launch({executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",headless:true,args:["--no-sandbox"]});
const page=await browser.newPage({viewport:{width:700,height:700},deviceScaleFactor:1});
const runs=[];
try{
 for(const scenario of scenarios){
   await page.setContent("<html><body style='margin:0'>"+original(scenario.base).replace("<svg ","<svg id=\"native\" ")+"</body></html>");
   const capture=await page.evaluate(async({frames,url})=>{
     const {captureWaapiAnimations}=await import(url);
     const root=document.querySelector("#native"),element=root.querySelector("#tile");
     window.effect=element.animate(frames,{duration:1000,iterations:2,fill:"forwards"});
     window.effect.pause();await window.effect.ready;
     return captureWaapiAnimations(root,[window.effect]);
   },{frames:scenario.frames,url});
   const compiled=compileSvgAnimation(capture);
   await page.evaluate(svg=>{
      const root=document.createElement("div");root.innerHTML=svg;
      const element=root.firstElementChild;element.setAttribute("id","compiled");
      document.body.appendChild(element);
      element.pauseAnimations();
   },compiled.svg);
   const samples=[];
   for(const ms of [0,50,125,250,500,750,999,1000,1250,1750,1999,2000]){
     const s=await page.evaluate(time=>{
        window.effect.currentTime=time;
        document.querySelector("#compiled").setCurrentTime(time/1000);
        function measure(root){
          const svg=document.querySelector(root),rect=svg.querySelector("#tile").getBoundingClientRect(),view=svg.getBoundingClientRect();
          return {x:rect.x-view.x,y:rect.y-view.y,width:rect.width,height:rect.height};
        }
        return {native:measure("#native"),compiled:measure("#compiled")};
     },ms);
     const error=Math.max(...Object.keys(s.native).map(k=>Math.abs(s.native[k]-s.compiled[k])));
     samples.push({ms,error,...s});
   }
   runs.push({name:scenario.name,bytes:compiled.report.bytes,maxErrorPx:Math.max(...samples.map(x=>x.error)),failures:samples.filter(x=>x.error>.1),sampleCount:samples.length});
 }
} finally {await page.close();await browser.close();}
mkdirSync("evidence",{recursive:true});
writeFileSync("evidence/chromium-native-transform-capture-0001.json",JSON.stringify({runs},null,2));
console.log(JSON.stringify(runs,null,2));
if(runs.some(x=>x.failures.length))process.exitCode=1;
