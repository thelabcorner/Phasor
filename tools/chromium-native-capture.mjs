import {chromium} from "playwright-core";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {compileSvgAnimation} from "../dist/index.js";
const moduleSource=readFileSync("dist/browser/capture.js","utf8");
const browser=await chromium.launch({executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",headless:true,args:["--no-sandbox"]});
const page=await browser.newPage();
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><circle id="dot" cx="50" cy="50" opacity="1" r="20" fill="#2266cc"/></svg>';
const expected=[0,.25,.5,.75,.99,1,1.1];
let result;
try {
  await page.setContent("<html><body>"+svg.replace("<svg ","<svg id=\"source\" ")+"</body></html>");
  const moduleUrl="data:text/javascript;base64,"+Buffer.from(moduleSource.replace(
    /import\s*\{\s*AnimationCompileError\s*\}\s*from\s*"\.\.\/diagnostics\.js";/,
    'class AnimationCompileError extends Error { constructor(code,message) { super(message); this.code=code; } }'
  )).toString("base64");
  const captured=await page.evaluate(async (sourceUrl)=>{
    const {captureWaapiAnimations}=await import(sourceUrl);
    const source=document.querySelector("#source");
    const dot=source.querySelector("#dot");
    const animation=dot.animate([{opacity:1,easing:"ease-in-out"},{opacity:0}],{duration:1000,iterations:2,fill:"forwards"});
    animation.pause();
    await animation.ready;
    window.nativeAnimation=animation;
    return {capture:captureWaapiAnimations(source,[animation]),rawKeyframes:animation.effect.getKeyframes(),timing:animation.effect.getTiming()};
  },moduleUrl);
  const compiled=compileSvgAnimation(captured.capture);
  await page.evaluate((s)=>{
    const holder=document.createElement("div");
    holder.innerHTML=s;
    const svg=holder.firstElementChild;
    svg.id="compiled";
    document.body.appendChild(svg);
    svg.pauseAnimations();
  },compiled.svg);
  const samples=[];
  for(const ms of [0,100,250,500,750,999,1000,1250,1500,1999,2000]){
    const value=await page.evaluate(t=>{
      window.nativeAnimation.currentTime=t;
      document.querySelector("#compiled").setCurrentTime(t/1000);
      const ref=document.querySelector("#source #dot");
      const out=document.querySelector("#compiled #dot");
      return {ref:Number(getComputedStyle(ref).opacity),actual:Number(getComputedStyle(out).opacity)};
    },ms);
    samples.push({ms,...value,absError:Math.abs(value.ref-value.actual)});
  }
  result={rawKeyframes:captured.rawKeyframes,timing:captured.timing,
    compilerBytes:compiled.report.bytes, samples,
    maxObservedError:Math.max(...samples.map(s=>s.absError))};
} catch(e) {result={error:String(e),stack:e.stack};}
finally {await page.close();await browser.close();}
mkdirSync("evidence",{recursive:true});
writeFileSync("evidence/chromium-native-capture-0001.json",JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2).slice(0,7500));
if(result.error||result.maxObservedError>.0001)process.exitCode=1;
