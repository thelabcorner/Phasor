import { compileSvgAnimation } from "../dist/index.js";
import { performance } from "node:perf_hooks";
import {writeFileSync,mkdirSync} from "node:fs";
import { cpus } from "node:os";

const cases=[[1,2],[10,2],[100,2],[1000,2],[1000,10],[1000,100]];
const distinct=process.argv.includes("--distinct");
const directionOption=process.argv.find(arg=>arg.startsWith("--direction="));
const direction=directionOption?.slice("--direction=".length)??"normal";
const results=[];
for(const [targets,frames] of cases) {
  const els=Array.from({length:targets},(_,i)=>'<circle id="n'+i+'" cx="0" cy="'+(i%100)+'" r="1"/>').join("");
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">'+els+'</svg>';
  const keyframes=Array.from({length:frames},(_,i)=>({offset:i/(frames-1),cx:i*.1}));
  const tracks=Array.from({length:targets},(_,i)=>({target:{svgId:"n"+i},keyframes:distinct?keyframes.map(x=>({...x})):keyframes,timing:{duration:1000,iterations:2,fill:"forwards",direction}}));
  const input={svg,tracks,options:{maxKeyframes:250000,maxBytes:20000000}};
  const runs=targets*frames>30000?3:7;
  const values=[];
  for(let j=0;j<runs;j++){
    const start=performance.now();
    const result=compileSvgAnimation(input);
    values.push({compileMs:performance.now()-start,bytes:result.report.bytes});
  }
  const sorted=values.map(x=>x.compileMs).sort((a,b)=>a-b);
  results.push({targets,frames,numberOfRuns:runs,medianCompileMs:sorted[Math.floor(sorted.length/2)],minCompileMs:sorted[0],maxCompileMs:sorted.at(-1),outputBytes:values[0].bytes});
}
const report={date:new Date().toISOString(),node:process.version,cpu:cpus()[0]?.model,platform:process.platform,profile:"cold/warm mixed, no explicit GC",direction,keyframeIdentity:distinct?"distinct per target":"shared across targets",results};
mkdirSync("evidence",{recursive:true});
const label=process.argv[2]??"baseline";
writeFileSync("evidence/benchmark-"+label+".json",JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
