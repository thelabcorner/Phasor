import test from "node:test";
import assert from "node:assert/strict";
import {DOMParser} from "@xmldom/xmldom";
import {compileSvgAnimation} from "../dist/index.js";

const svg=(base='translate(0 0)',extra='')=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect id="tile" x="60" y="20" width="30" height="40" fill="#3366aa" transform="${base}" ${extra}/></svg>`;
const run=(base,keyframes,timing={duration:1000},extra='')=>compileSvgAnimation({
 svg:svg(base,extra),tracks:[{target:{svgId:"tile"},keyframes,timing}]
});
const animated=r=>new DOMParser().parseFromString(r.svg,"image/svg+xml").getElementsByTagName("animateTransform").item(0);
test("native translate keeps explicit 2D CSS pixel parameterization",()=>{
 const a=animated(run("translate(0 0)",[{transform:"translate(0px, 0px)"},{transform:"translate(120px, 40px)"}]));
 assert.equal(a.getAttribute("type"),"translate");
 assert.equal(a.getAttribute("values"),"0 0;120 40");
 assert.equal(a.getAttribute("keyTimes"),"0;1");
 assert.equal(a.getAttribute("attributeName"),"transform");
});
test("rotate 0 to 360 does not lose winding",()=>{
 const a=animated(run("rotate(0)",[{transform:"rotate(0deg)"},{transform:"rotate(360deg)"}]));
 assert.equal(a.getAttribute("type"),"rotate");
 assert.equal(a.getAttribute("values"),"0;360");
});
test("uniform and nonuniform scale preserve two components",()=>{
 const a=animated(run("scale(1)",[{transform:"scale(1)"},{transform:"scale(2,3)"}]));
 assert.equal(a.getAttribute("type"),"scale");
 assert.equal(a.getAttribute("values"),"1 1;2 3");
});
test("transforms share compatible per-keyframe splines with scalar lowering",()=>{
 const a=animated(run("rotate(0)",[{offset:0,transform:"rotate(0deg)",easing:"ease-in-out"},{offset:1,transform:"rotate(180deg)"}]));
 assert.equal(a.getAttribute("calcMode"),"spline");
 assert.equal(a.getAttribute("keySplines"),"0.42 0 0.58 1");
});
test("mixed transform functions, multi-function stacks, and CSS percentage translations refused",()=>{
 for(const frames of [
  [{transform:"translate(0px,0px)"},{transform:"rotate(90deg)"}],
  [{transform:"translate(0px) rotate(30deg)"},{transform:"translate(40px) rotate(40deg)"}],
  [{transform:"translate(0%)"},{transform:"translate(20%)"}]
 ]) assert.throws(()=>run("translate(0 0)",frames),{code:/^(LOWERING_UNSUPPORTED|PROPERTY_UNSUPPORTED)$/});
});
test("unresolved transform origin and transform-box refused",()=>{
 for(const extra of ['transform-origin="center"','transform-box="fill-box"'])
  assert.throws(()=>run("rotate(0)",[{transform:"rotate(0deg)"},{transform:"rotate(90deg)"}],{duration:1000},extra),{code:"LOWERING_UNSUPPORTED"});
});
test("transform baseline type mismatch refused",()=>{
 assert.throws(()=>run("scale(1)",[{transform:"rotate(0deg)"},{transform:"rotate(90deg)"}]),{code:"LOWERING_UNSUPPORTED"});
});
test("arbitrary transform numeric tokens refused",()=>{
 assert.throws(()=>run("rotate(0)",[{transform:"rotate(0deg)"},{transform:"rotate(Infinitydeg)"}]),{code:"PROPERTY_UNSUPPORTED"});
});
