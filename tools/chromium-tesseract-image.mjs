import { chromium } from "playwright-core";
import {PNG} from "pngjs";
import {compileTesseractSvg} from "../dist/procedural/tesseract.js";
import {writeFileSync,mkdirSync} from "node:fs";

const start=performance.now();
const {svg,report}=compileTesseractSvg({tolerancePx:.3,periodMs:4000});
const compileMs=performance.now()-start;
const browser=await chromium.launch({executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",headless:true,args:["--no-sandbox"]});
const page=await browser.newPage({viewport:{width:540,height:540},deviceScaleFactor:1});
const snapshots=[];
try{
 await page.setContent('<html><body style="margin:0"><img id="scene" width="512" height="512" /></body></html>');
 await page.evaluate(src=>new Promise((resolve,reject)=>{
   const img=document.querySelector("#scene");img.onload=resolve;img.onerror=()=>reject("Image load error");
   img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(src);
 }),svg);
 for(const delayMs of [100,900,1800]){
   await page.waitForTimeout(delayMs);
   const screenshot=await page.locator("#scene").screenshot();
   snapshots.push({elapsedLabel:delayMs,image:PNG.sync.read(screenshot)});
 }
}finally{await page.close();await browser.close();}
function changed(a,b){
 let count=0;let maxDelta=0;
 for(let i=0;i<a.data.length;i+=4){
   const d=Math.max(Math.abs(a.data[i]-b.data[i]),Math.abs(a.data[i+1]-b.data[i+1]),Math.abs(a.data[i+2]-b.data[i+2]));
   maxDelta=Math.max(maxDelta,d);
   if(d>15)count++;
 }
 return {pixelsWithColorDeltaOver15:count,maxChannelDelta:maxDelta};
}
const comparison=[changed(snapshots[0].image,snapshots[1].image),changed(snapshots[1].image,snapshots[2].image)];
const passed=comparison.every(x=>x.pixelsWithColorDeltaOver15>200);
const evidence={compiled:{...report,compileMs},embedding:"data:image/svg+xml in HTML img, Chromium headless",comparisons:comparison,passed};
mkdirSync("evidence",{recursive:true});writeFileSync("evidence/chromium-tesseract-img-0001.json",JSON.stringify(evidence,null,2));
mkdirSync("examples",{recursive:true});writeFileSync("examples/animated-tesseract.svg",svg);
console.log(JSON.stringify(evidence,null,2));
if(!passed)process.exitCode=1;
