import {chromium} from "playwright-core";
import {PNG} from "pngjs";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
const svg=readFileSync("assets/phasor-hero.svg","utf8");
const browser=await chromium.launch({executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",headless:true,args:["--no-sandbox"]});
const page=await browser.newPage({viewport:{width:1220,height:470},deviceScaleFactor:1});
const images=[];
try{
 await page.setContent('<html><body style="margin:0;background:#09090b"><img id="hero" width="1200" height="450" alt="Animated Phasor hero"></body></html>');
 await page.evaluate(svg=>new Promise((resolve,reject)=>{
  const img=document.querySelector("#hero");
  img.onload=()=>resolve(null);img.onerror=()=>reject(new Error("SVG as img failed"));
  img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg);
 }),svg);
 for(const delay of [0,850,850]){
   if(delay)await page.waitForTimeout(delay);
   const screenshot=await page.locator("#hero").screenshot();
   images.push(PNG.sync.read(screenshot));
 }
}finally{await page.close();await browser.close();}
function changes(a,b){
 let left=0,right=0,leftInk=0,rightInk=0;
 for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
  const i=(y*a.width+x)*4;
  const delta=Math.max(Math.abs(a.data[i]-b.data[i]),Math.abs(a.data[i+1]-b.data[i+1]),Math.abs(a.data[i+2]-b.data[i+2]));
  if(delta>32){if(x<570)left++;else if(x>630)right++;}
  if(a.data[i]>115||a.data[i+1]>115||a.data[i+2]>115){if(x<570)leftInk++;else if(x>630)rightInk++;}
 }
 return {leftChangedPixels:left,rightChangedPixels:right,leftBrightPixels:leftInk,rightBrightPixels:rightInk};
}
const first=changes(images[0],images[1]),second=changes(images[1],images[2]);
const pass=first.rightChangedPixels>1500&&second.rightChangedPixels>1500&&first.leftChangedPixels<100&&second.leftChangedPixels<100&&first.leftBrightPixels>1000;
const report={profile:"standalone SVG loaded via HTML img, Chromium",titlePresent:svg.includes("PHASOR"),first,second,pass};
mkdirSync("evidence",{recursive:true});
writeFileSync("evidence/chromium-phasor-hero-0001.json",JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!pass)process.exitCode=1;
