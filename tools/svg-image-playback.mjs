import {chromium} from "playwright-core";
import {PNG} from "pngjs";
import {compileSvgAnimation} from "../dist/index.js";
import {writeFileSync,mkdirSync} from "node:fs";
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="140" height="80" viewBox="0 0 140 80"><circle id="dot" cx="15" cy="40" r="9" fill="#1565c0"/></svg>';
const compiled=compileSvgAnimation({svg,tracks:[{target:{svgId:"dot"},keyframes:[{cx:15},{cx:125}],timing:{duration:1200,fill:"forwards"}}]});
const browser=await chromium.launch({executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",headless:true,args:["--no-sandbox"]});
const page=await browser.newPage({viewport:{width:300,height:180},deviceScaleFactor:1});
let results=[];
try {
  await page.setContent('<html><body style="margin:0"><img id="asset" style="display:block" /></body></html>');
  await page.evaluate((src)=>new Promise((resolve,reject)=>{
    const img=document.querySelector("#asset");
    img.onload=()=>resolve(null);img.onerror=()=>reject(new Error("SVG image failed to load"));
    img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(src);
  }),compiled.svg);
  const loadedAt=Date.now();
  async function sample(){
    const png=PNG.sync.read(await page.locator("#asset").screenshot());
    let sx=0,count=0;
    for(let y=0;y<png.height;y++)for(let x=0;x<png.width;x++){
      const idx=(y*png.width+x)*4;
      const [r,g,b,a]=png.data.subarray(idx,idx+4);
      if (r<80 && g>30 && g<150 && b>130 && a>150){sx+=x;count++;}
    }
    return {centroidX:count?sx/count:null,paintedPixels:count,elapsedAfterLoadMs:Date.now()-loadedAt};
  }
  results.push({elapsedLabel:"initial",...await sample()});
  await page.waitForTimeout(400);
  results.push({elapsedLabel:"after 400ms",...await sample()});
  await page.waitForTimeout(400);
  results.push({elapsedLabel:"after 800ms",...await sample()});
  await page.waitForTimeout(600);
  results.push({elapsedLabel:"after 1400ms (frozen)",...await sample()});
  await page.waitForTimeout(300);
  results.push({elapsedLabel:"later frozen-state confirmation",...await sample()});
} finally {await page.close();await browser.close();}
const shifts=results.map(r=>r.centroidX);
const ok=shifts.every(Number.isFinite)&&shifts[1]-shifts[0]>10&&shifts[2]-shifts[1]>10&&
  Math.abs(shifts[3]-124.5)<1&&Math.abs(shifts[4]-shifts[3])<1;
mkdirSync("evidence",{recursive:true});
writeFileSync("evidence/chromium-svg-image-playback-0001.json",JSON.stringify({profile:"SVG loaded as HTML img, data URL, Chromium headless",results,pass:ok},null,2));
console.log(JSON.stringify({pass:ok,results},null,2));
if (!ok) process.exitCode=1;
