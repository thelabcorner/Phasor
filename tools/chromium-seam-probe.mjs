import {chromium} from "playwright-core";
import {readFileSync,writeFileSync} from "node:fs";
import {compileSvgAnimation} from "../dist/index.js";
const fixture=JSON.parse(readFileSync("evidence/chromium-seeded-differential-0001.json")).failures[0];
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle id="dot" cx="0" cy="40" r="8"/></svg>';
const compiled=compileSvgAnimation({svg,tracks:[{target:{svgId:"dot"},keyframes:fixture.keyframes,timing:fixture.timing}]}).svg;
const browser=await chromium.launch({executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",headless:true,args:["--no-sandbox"]});
const page=await browser.newPage();
await page.setContent(svg.replace("<svg ","<svg id=\"reference\" ")+compiled.replace("<svg ","<svg id=\"compiled\" "));
await page.evaluate(({frames,timing})=>{
  window.anim=document.querySelector("#reference #dot").animate(frames.map(x=>({...x,cx:x.cx+"px"})),timing);
  window.anim.pause();document.querySelector("#compiled").pauseAnimations();
},{frames:fixture.keyframes,timing:fixture.timing});
const samples=[];
for(const t of [395,398,399,399.1,399.5,399.75,399.9,399.95,399.99,399.995,399.999,399.9995,400,400.0005,400.001,400.01,400.1,401]){
  samples.push(await page.evaluate(time=>{
    window.anim.currentTime=time;
    const svg=document.querySelector("#compiled");svg.setCurrentTime(time/1000);
    const ref=document.querySelector("#reference #dot");
    const dst=document.querySelector("#compiled #dot");
    const computed=window.anim.effect.getComputedTiming();
    return {time,phase:computed.phase,progress:computed.progress,localTime:window.anim.currentTime,
      refCss:getComputedStyle(ref).cx,refBox:ref.getBoundingClientRect().x-document.querySelector("#reference").getBoundingClientRect().x,
      svgTime:svg.getCurrentTime(),svgAnim:dst.cx.animVal.value,svgBox:dst.getBoundingClientRect().x-svg.getBoundingClientRect().x};
  },t));
}
await browser.close();
writeFileSync("evidence/chromium-seam-probe-0001.json",JSON.stringify(samples,null,2));
console.log(JSON.stringify(samples,null,2));
