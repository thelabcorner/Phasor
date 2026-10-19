import {chromium} from "playwright-core";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
const captureSource=readFileSync("dist/browser/capture.js","utf8");
const source=captureSource.replace(
  /import\s*\{\s*AnimationCompileError\s*\}\s*from\s*"\.\.\/diagnostics\.js";/,
  'class AnimationCompileError extends Error { constructor(code,message) {super(message);this.code=code;} }'
);
if (source.includes('from "../diagnostics.js"'))throw new Error("Capture harness failed to resolve browser-only test module");
const moduleUrl="data:text/javascript;base64,"+Buffer.from(source).toString("base64");
const browser=await chromium.launch({executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",headless:true,args:["--no-sandbox"]});
const page=await browser.newPage();
let evidence;
try {
  await page.setContent('<html><body><svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle id="dot" cx="20" cy="40" r="10" opacity="1"/></svg></body></html>');
  evidence=await page.evaluate(async moduleUrl=>{
    const {captureWaapiAnimations}=await import(moduleUrl);
    const svg=document.querySelector("svg"),dot=svg.querySelector("#dot");
    const animation=dot.animate([{opacity:1},{opacity:0}],{duration:1000,fill:"forwards"});
    animation.pause();await animation.ready;
    const results=[];
    const check=(name,expected,run)=>{
      let got="none";
      try {run();} catch(e) {got=e.code??e.name;}
      results.push({name,expected,got,pass:got===expected});
    };
    check("accepted independent opacity","accepted",()=>{
      const result=captureWaapiAnimations(svg,[animation]);
      if (result.tracks.length!==1)throw {code:"missing"};
      throw {code:"accepted"};
    });
    animation.playbackRate=-1;
    check("negative playback rate","LOWERING_UNSUPPORTED",()=>captureWaapiAnimations(svg,[animation]));
    animation.playbackRate=1;
    animation.effect.composite="add";
    check("effect additive composite","COMPOSITION_UNSUPPORTED",()=>captureWaapiAnimations(svg,[animation]));
    animation.effect.composite="replace";
    const extra=dot.animate([{opacity:.5},{opacity:.8}],{duration:1000});
    extra.pause();await extra.ready;
    check("untracked concurrent animation","COMPOSITION_UNSUPPORTED",()=>captureWaapiAnimations(svg,[animation]));
    extra.cancel();
    const style=document.createElement("style");style.textContent="circle { stroke:black; }";document.head.appendChild(style);
    check("document stylesheet baseline","LOWERING_UNSUPPORTED",()=>captureWaapiAnimations(svg,[animation]));
    style.remove();
    const keyframeEffect=animation.effect;
    keyframeEffect.setKeyframes([{transform:"translateX(0px)"},{transform:"translateX(10px)"}]);
    check("transform capture with no explicit underlying SVG baseline refused","LOWERING_UNSUPPORTED",()=>captureWaapiAnimations(svg,[animation]));
    keyframeEffect.setKeyframes([{opacity:1},{opacity:0}]);
    dot.removeAttribute("opacity");
    check("missing underlying baseline refused","LOWERING_UNSUPPORTED",()=>captureWaapiAnimations(svg,[animation]));
    dot.setAttribute("opacity","1");
    const invalid=svg.cloneNode(true);
    check("disconnected DOM root refused","SVG_TARGET_INVALID",()=>captureWaapiAnimations(invalid,[animation]));
    animation.cancel();
    return results;
  },moduleUrl);
} catch(e){evidence={error:String(e).slice(0,500)};}
finally {await browser.close();}
mkdirSync("evidence",{recursive:true});
writeFileSync("evidence/chromium-capture-refusals-0001.json",JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence,null,2).slice(0,4000));
if(!Array.isArray(evidence)||evidence.some(x=>!x.pass))process.exitCode=1;
