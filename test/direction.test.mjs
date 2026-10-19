import test from "node:test";
import assert from "node:assert/strict";
import {compileSvgAnimation} from "../dist/index.js";
import {lowerDirectedCurve} from "../dist/direction.js";
import {DOMParser} from "@xmldom/xmldom";

const base='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle id="dot" cx="0" cy="20" r="10" /></svg>';
const compile=(direction,iterations=2,frames=[{cx:0},{cx:80}],easing="linear")=>compileSvgAnimation({
 svg:base,tracks:[{target:{svgId:"dot"},keyframes:frames,timing:{duration:1000,iterations,fill:"forwards",direction,easing}}]
});
const tag=svg=>new DOMParser().parseFromString(svg,"image/svg+xml").getElementsByTagName("animate").item(0);
test("reverse direction flips endpoints and changes ease-in into reverse ease-out spline",()=>{
 const result=compile("reverse",3,[{cx:0,easing:"ease-in"},{cx:80}]);
 const a=tag(result.svg);
 assert.equal(a.getAttribute("values"),"80;0");
 assert.equal(a.getAttribute("keySplines"),"0 0 0.58 1");
 assert.equal(a.getAttribute("dur"),"1s");
 assert.equal(a.getAttribute("repeatCount"),"3");
});
test("alternate direction emits one reversible double-cycle and fractional repeatCount for odd passes",()=>{
 const result=compile("alternate",3);
 const a=tag(result.svg);
 assert.equal(a.getAttribute("values"),"0;80;0");
 assert.equal(a.getAttribute("keyTimes"),"0;0.5;1");
 assert.equal(a.getAttribute("dur"),"2s");
 assert.equal(a.getAttribute("repeatCount"),"1.5");
});
test("alternate-reverse emits reverse-forward shared-cycle",()=>{
 const a=tag(compile("alternate-reverse",2).svg);
 assert.equal(a.getAttribute("values"),"80;0;80");
 assert.equal(a.getAttribute("repeatCount"),"1");
});
test("infinite alternate uses indefinite two-pass cycle",()=>{
 const a=tag(compile("alternate",Infinity).svg);
 assert.equal(a.getAttribute("dur"),"2s");
 assert.equal(a.getAttribute("repeatCount"),"indefinite");
});
test("reverse direction transforms Bézier time and value controls correctly",()=>{
 const r=lowerDirectedCurve({
   values:"0;50;100",keyTimes:"0;0.2;1",keySplines:"0.42 0 1 1;0 0 0.58 1"
 },"reverse");
 assert.equal(r.values,"100;50;0");
 assert.equal(r.keyTimes,"0;0.8;1");
 assert.equal(r.keySplines,"0.42 0 1 1;0 0 0.58 1");
});
test("alternating nonuniform segment timing yields monotone doubled keyTimes",()=>{
 const r=lowerDirectedCurve({
   values:"0;10;30",keyTimes:"0;0.2;1",keySplines:null
 },"alternate");
 assert.equal(r.keyTimes,"0;0.1;0.5;0.9;1");
 assert.equal(r.values,"0;10;30;10;0");
});
