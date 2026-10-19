import {readdirSync,readFileSync,statSync,existsSync} from "node:fs";
import {join,relative,extname} from "node:path";
const ignore=new Set([".git","node_modules","dist"]);
const ext=new Set([".ts",".mjs",".js",".md",".json",".yml",".yaml",".svg",".txt",".py"]);
const findings=[],files=[];
function walk(dir){
 for(const item of readdirSync(dir,{withFileTypes:true})){
  if(ignore.has(item.name))continue;
  const path=join(dir,item.name);
  if(item.isDirectory())walk(path);
  else if(item.isFile()&&ext.has(extname(path).toLowerCase()))files.push(path);
 }
}
walk(".");
const patterns=[
 ["GitHub token",/\b(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{25,})\b/g],
 ["OpenAI/API secret",/\b(?:sk-[A-Za-z0-9_-]{30,}|AKIA[0-9A-Z]{16})\b/g],
 ["Private key",/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/g],
 ["Local personal directory",/C:\\Users\\[^\s\\"']+|\/Users\/[^\s\\"']+|\/home\/[^\s\\"']+/g],
 ["Embedded local Windows path",/(?:[A-Za-z]:\\){1}(?:Users|Documents|Downloads)\\/g]
];
for(const file of files){
 const data=readFileSync(file,"utf8");
 for(const [description,rx] of patterns){
  const matches=[...data.matchAll(rx)];
  if(matches.length)findings.push({path:file,description,count:matches.length});
 }
}
const bad=findings.filter(x=>x.description!=="Embedded local Windows path");
console.log(JSON.stringify({scannedFiles:files.length,findings,pass:bad.length===0},null,2));
if(bad.length)process.exitCode=1;
