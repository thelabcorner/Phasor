import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import {DOMParser} from "@xmldom/xmldom";
const read=path=>readFileSync(path,"utf8");
const readme=read("README.md");
const hero=read("assets/phasor-hero.svg");
const issues=[];
function check(ok,message){if(!ok)issues.push(message);}
check(readme.startsWith('<p align="center">'),"Missing premium masthead");
check(readme.includes('assets/phasor-hero.svg'),"README does not embed animated SVG");
check(readme.includes('The rotating tesseract in the header'),"Missing provenance explanation");
check(readme.includes('6 unresolved discrepancies'),"README must retain known failing corpus");
check(readme.includes('MIT License'),"README missing verified license reference");
check(readme.trimEnd().endsWith("Jackson Cummings."),"License must remain the final section");
check(!readme.includes("\u2014"),"README should not contain em dashes");
check(existsSync("LICENSE")&&read("LICENSE").includes("MIT License"),"MIT LICENSE missing");
check(existsSync(".github/workflows/ci.yml"),"CI workflow missing");
check(existsSync("CONTRIBUTING.md")&&existsSync("SECURITY.md"),"Contributor/security docs missing");
check(hero.length>1000,"Hero is empty or not generated");
const warnings=[];
const xml=new DOMParser({onError:(level,message)=>warnings.push(level+": "+message)})
 .parseFromString(hero,"image/svg+xml");
check(warnings.length===0,"Hero SVG XML errors: "+warnings.join("; "));
const root=xml.documentElement;
check(root?.localName==="svg"&&root?.namespaceURI==="http://www.w3.org/2000/svg","Hero not valid namespaced SVG");
check(root?.getAttribute("viewBox")==="0 0 1200 450","Hero viewport not 1200x450");
check(xml.getElementsByTagName("title").length>0&&xml.getElementsByTagName("desc").length>0,"Hero lacks accessible title/description");
check(xml.getElementsByTagName("script").length===0&&!hero.includes("javascript:"),"Hero contains script");
check(xml.getElementsByTagName("animate").length===1,"Hero must include compiled animated tesseract geometry");
check(xml.getElementsByTagName("animateTransform").length>=1,"Hero lacks declarative auxiliary motion");
check(xml.getElementsByTagName("animateMotion").length>=1,"Hero lacks orbital motion");
const a=xml.getElementsByTagName("animate").item(0);
if(a){
 const frames=a.getAttribute("values")?.split(";")??[];
 const times=a.getAttribute("keyTimes")?.split(";").map(Number)??[];
 check(frames.length>=40&&frames.length<=2048,"Hero unexpected number of compiled frames");
 check(frames.length===times.length,"Hero keyTimes and path values mismatch");
 check(frames[0]===frames.at(-1),"Hero animation does not close exactly");
 check(times[0]===0&&times.at(-1)===1,"Hero time domain not normalized");
}
const mdLink=/\]\(([^)]+)\)/g;
for(const [,url] of readme.matchAll(mdLink)){
 const clean=url.split("#")[0];
 if(!clean||clean.includes("://")||clean.startsWith("mailto:"))continue;
 check(existsSync(clean),"README has broken link to "+clean);
}
if(issues.length){console.error("README release audit failed:\n"+issues.map(x=>"- "+x).join("\n"));process.exitCode=1;}
else console.log("README release audit PASS: real animated 4D hero, XML, seam, accessibility, CI/license and local links.");
