import test from "node:test";
import assert from "node:assert/strict";
import {DOMParser} from "@xmldom/xmldom";
import {compileSvgAnimation} from "../dist/index.js";
const svg='<svg xmlns="http://www.w3.org/2000/svg"><circle id="a" cx="0" cy="10" r="4"/><circle id="b" cx="0" cy="20" r="4"/><circle id="c" cx="0" cy="30" r="4"/></svg>';
const animations=xml=>[...Array.from(new DOMParser().parseFromString(xml,"image/svg+xml").getElementsByTagName("animate"))];
test("shared authored keyframes with distinct directions remain independently compiled",()=>{
 const keyframes=[{cx:0},{cx:100}];
 const result=compileSvgAnimation({svg,tracks:[
  {target:{svgId:"a"},keyframes,timing:{duration:1000,direction:"normal"}},
  {target:{svgId:"b"},keyframes,timing:{duration:1000,direction:"reverse"}},
  {target:{svgId:"c"},keyframes,timing:{duration:1000,direction:"alternate",iterations:3}}
 ]});
 const [a,b,c]=animations(result.svg);
 assert.equal(a.getAttribute("values"),"0;100");
 assert.equal(b.getAttribute("values"),"100;0");
 assert.equal(c.getAttribute("values"),"0;100;0");
 assert.equal(c.getAttribute("repeatCount"),"1.5");
});
test("same authored keyframes but different effect easing cannot alias cache result",()=>{
 const keyframes=[{cx:0},{cx:100}];
 const result=compileSvgAnimation({svg,tracks:[
  {target:{svgId:"a"},keyframes,timing:{duration:1000,easing:"ease-in"}},
  {target:{svgId:"b"},keyframes,timing:{duration:1000,easing:"ease-out"}}
 ]});
 const [a,b]=animations(result.svg);
 assert.equal(a.getAttribute("keySplines"),"0.42 0 1 1");
 assert.equal(b.getAttribute("keySplines"),"0 0 0.58 1");
});
test("shared transform descriptors never bypass per-element baseline validation",()=>{
 const transforms=[{transform:"rotate(0deg)"},{transform:"rotate(360deg)"}];
 const scene='<svg xmlns="http://www.w3.org/2000/svg"><rect id="a" transform="rotate(0)" width="10" height="10"/><rect id="b" transform="scale(1)" width="10" height="10"/></svg>';
 assert.throws(()=>compileSvgAnimation({svg:scene,tracks:[
  {target:{svgId:"a"},keyframes:transforms,timing:{duration:1000}},
  {target:{svgId:"b"},keyframes:transforms,timing:{duration:1000}}
 ]}),{code:"LOWERING_UNSUPPORTED"});
});
test("alternate expansion applies the output cap, rather than counting only source frames",()=>{
 const x={svg,tracks:[{target:{svgId:"a"},keyframes:[{cx:0},{cx:100}],timing:{duration:1000,direction:"alternate",iterations:2}}],options:{maxKeyframes:2}};
 assert.throws(()=>compileSvgAnimation(x),{code:"LIMIT_EXCEEDED"});
});
