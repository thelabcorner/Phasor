import { chromium } from "playwright-core";
import { compileSvgAnimation } from "../dist/index.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";

const BASE='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><circle id="dot" cx="0" cy="25" r="10" opacity="1"/></svg>';
const CHROME='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cases=[
  {name:"linear",keyframes:[{cx:0},{cx:80}],waapi:[{cx:"0px"},{cx:"80px"}],timing:{duration:1000,fill:"forwards"},times:[0,20,100,250,500,750,999,1000,1200]},
  {name:"spline",keyframes:[{cx:0,easing:"ease-in-out"},{cx:80}],waapi:[{cx:"0px",easing:"ease-in-out"},{cx:"80px"}],timing:{duration:1000,fill:"forwards"},times:[0,20,100,250,500,750,999,1000]},
  {name:"two-iterations",keyframes:[{cx:0},{cx:80}],waapi:[{cx:"0px"},{cx:"80px"}],timing:{duration:1000,iterations:2,fill:"forwards"},times:[0,20,250,500,999,1000,1001,1500,1999,2000,2200]},
  {name:"no-fill",keyframes:[{cx:0},{cx:80}],waapi:[{cx:"0px"},{cx:"80px"}],timing:{duration:1000,fill:"none"},times:[0,250,999,1000,1500]},
  {name:"infinite",keyframes:[{cx:0},{cx:80}],waapi:[{cx:"0px"},{cx:"80px"}],timing:{duration:1000,iterations:Infinity,fill:"none"},times:[0,250,999,1000,1001,1250,1999,2000]},
  {name:"opacity",keyframes:[{opacity:1},{opacity:0}],waapi:[{opacity:1},{opacity:0}],timing:{duration:1000,fill:"forwards"},times:[0,100,250,500,750,999,1000,1200]},
  {name:"positive-delay",keyframes:[{cx:0},{cx:80}],waapi:[{cx:"0px"},{cx:"80px"}],timing:{duration:1000,delay:250,fill:"forwards"},times:[0,100,249,250,500,750,1249,1250,1500]},
];
const browser=await chromium.launch({executablePath:CHROME,headless:true,args:["--no-sandbox"]});
const results=[];
try {
  for (const fixture of cases) {
    const c=compileSvgAnimation({svg:BASE,tracks:[{target:{svgId:"dot"},keyframes:fixture.keyframes,timing:fixture.timing}]});
    const out=c.svg.replace("<svg ","<svg id=\"compiled\" ");
    const source=BASE.replace("<svg ","<svg id=\"source\" ");
    const page=await browser.newPage({viewport:{width:400,height:240}});
    await page.setContent('<html><body>'+source+out+'</body></html>');
    const setup=await page.evaluate(({waapi,timing})=>{
      const src=document.querySelector("#source #dot");
      try {
        window.anim=src.animate(waapi,timing);
        window.anim.pause();
        document.querySelector("#compiled").pauseAnimations();
        return {ok:true};
      } catch(e) {return {ok:false,error:String(e)}}
    },{waapi:fixture.waapi,timing:fixture.timing});
    if (!setup.ok) {results.push({name:fixture.name,error:setup.error});await page.close();continue;}
    const samples=[];
    for(const t of fixture.times){
      const sample=await page.evaluate((time)=>{
        const ref=document.querySelector("#source #dot");
        const output=document.querySelector("#compiled #dot");
        const svg=document.querySelector("#compiled");
        window.anim.currentTime=time;
        svg.setCurrentTime(time/1000);
        const refRect=ref.getBoundingClientRect(),outputRect=output.getBoundingClientRect();
        const refSvg=document.querySelector("#source").getBoundingClientRect();
        const outSvg=svg.getBoundingClientRect();
        const reference={
          x:refRect.x-refSvg.x,
          cx:parseFloat(getComputedStyle(ref).cx),
          opacity:parseFloat(getComputedStyle(ref).opacity)
        };
        const actual={
          x:outputRect.x-outSvg.x,
          cx:output.cx.animVal.value,
          opacity:parseFloat(getComputedStyle(output).opacity)
        };
        return {reference,actual};
      },t);
      const property=fixture.name==="opacity"?"opacity":"x";
      const delta=sample.actual[property]-sample.reference[property];
      samples.push({t,delta,...sample});
    }
    results.push({name:fixture.name,samples,maxError:Math.max(...samples.map(x=>Math.abs(x.delta)))});
    await page.close();
  }
} finally {await browser.close();}
mkdirSync("evidence",{recursive:true});
const result={engine:"Chromium (installed Chrome)",date:new Date().toISOString(),browserVersion:await (async()=>{return "see probe metadata"})(),results};
writeFileSync("evidence/chromium-differential-0001.json",JSON.stringify(result,null,2));
console.log(JSON.stringify(results.map(x=>({name:x.name,error:x.error,maxError:x.maxError,bad:x.samples?.filter(y=>Math.abs(y.delta)>.1).map(z=>({t:z.t,delta:z.delta,ref:z.reference,compiled:z.actual}))})),null,2));
if(results.some(r=>r.error||r.maxError>.1))process.exitCode=1;
