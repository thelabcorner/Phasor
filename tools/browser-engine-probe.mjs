import {firefox,chromium} from "playwright-core";
const engines=[
 {name:"Windows installed Firefox",api:firefox,executablePath:"C:\\Program Files\\Mozilla Firefox\\firefox.exe"},
 {name:"Windows installed Edge",api:chromium,executablePath:"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"}
];
for(const engine of engines) {
 try {
  const browser=await engine.api.launch({executablePath:engine.executablePath,headless:true,timeout:12000});
  const page=await browser.newPage();
  await page.goto("about:blank");
  console.log(JSON.stringify({engine:engine.name,status:"available",version:browser.version(),userAgent:await page.evaluate(()=>navigator.userAgent)}));
  await browser.close();
 } catch(error){
  console.log(JSON.stringify({engine:engine.name,status:"unavailable-through-playwright",message:String(error).slice(0,600)}));
 }
}
