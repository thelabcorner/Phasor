import {chromium} from "playwright-core";
import {compileSvgAnimation} from "../dist/index.js";
import {writeFileSync,mkdirSync} from "node:fs";

let state=0x7e57a11;
function random(){state|=0;state=state+0x6d2b79f5|0;let t=Math.imul(state^state>>>15,1|state);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;}
const pick=x=>x[Math.floor(random()*x.length)];
const seed=state;
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle id="dot" cx="0" cy="40" r="8"/></svg>';
const easings=["linear","ease","ease-in","ease-out","ease-in-out","cubic-bezier(0.21,0.05,0.74,0.87)"];
const browser=await chromium.launch({executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",headless:true,args:["--no-sandbox"]});
const page=await browser.newPage({viewport:{width:250,height:230}});
let count=0,maxError=0,failures=[];
try {
  for(let n=0;n<80;n++){
    const stops=pick([2,3,4,5]);
    const interior=[];
    while(interior.length<stops-2){const v=pick([.1,.2,.3,.4,.5,.6,.7,.8,.9]);if(!interior.includes(v))interior.push(v);}
    const offsets=[0,...interior.sort((a,b)=>a-b),1];
    const values=offsets.map(()=>Math.floor(random()*75)+5);
    const keyframes=offsets.map((offset,i)=>({offset,cx:values[i],easing:pick(easings)}));
    const native=keyframes.map(f=>({...f,cx:f.cx+"px"}));
    const duration=pick([200,500,800,1000,2500]);
    const timing={duration,fill:pick(["none","forwards"]),iterations:pick([1,2,3])};
    const result=compileSvgAnimation({svg,tracks:[{target:{svgId:"dot"},keyframes,timing}]});
    const pageMarkup=svg.replace("<svg ","<svg id=\"reference\" ")+result.svg.replace("<svg ","<svg id=\"compiled\" ");
    await page.setContent("<html><body>"+pageMarkup+"</body></html>");
    const status=await page.evaluate(({native,timing})=>{
      const ref=document.querySelector("#reference #dot");
      window.anim=ref.animate(native,timing);window.anim.pause();
      document.querySelector("#compiled").pauseAnimations();
      return {waapiKeyframes:window.anim.effect.getKeyframes().length};
    },{native,timing});
    const probes=new Set([0,0.001,.1,.23,.5,.77,.999,1,1.01]);
    // Keep boundary probes ≥1ms away from the end; sub-ms Blink WAAPI and SMIL
    // precision divergence is retained, not erased, in the 0001 corpus.
    for(const x of offsets) for(const delta of [-.01,0,.01]) if(x+delta>=0) probes.add(x+delta);
    const progress=[...probes].map(x=>x*duration);
    if(timing.iterations>1) progress.push(duration+duration*.33,2*duration-1);
    progress.push(duration*timing.iterations+10);
    for(const time of progress){
      const v=await page.evaluate(t=>{
        window.anim.currentTime=t;
        document.querySelector("#compiled").setCurrentTime(t/1000);
        const ref=document.querySelector("#reference #dot");
        const out=document.querySelector("#compiled #dot");
        const r=ref.getBoundingClientRect(),o=out.getBoundingClientRect();
        return {ref:r.x-document.querySelector("#reference").getBoundingClientRect().x,
          actual:o.x-document.querySelector("#compiled").getBoundingClientRect().x};
      },time);
      const error=Math.abs(v.ref-v.actual);
      count++;maxError=Math.max(maxError,error);
      if(error>.1 && failures.length<30) failures.push({fixture:n,time,error,timing,keyframes,v,status});
    }
  }
}finally{await page.close();await browser.close();}
const evidence={seed,fixtures:80,probes:count,maxObservedErrorPx:maxError,failures};
mkdirSync("evidence",{recursive:true});
writeFileSync("evidence/chromium-seeded-differential-0002.json",JSON.stringify(evidence,null,2));
console.log(JSON.stringify({seed,fixtures:80,probes:count,maxObservedErrorPx:maxError,failures:failures.slice(0,3)},null,2));
if(failures.length)process.exitCode=1;
