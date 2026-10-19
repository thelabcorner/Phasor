import test from "node:test";
import assert from "node:assert/strict";
import {DOMParser} from "@xmldom/xmldom";
import {compileSvgAnimation} from "../dist/index.js";

const SVG='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle id="dot" cx="0" cy="25" r="10" opacity="1"/></svg>';
const compile=(frames,timing={duration:1000},svg=SVG)=>compileSvgAnimation({
  svg,tracks:[{target:{svgId:"dot"},keyframes:frames,timing}]
});
const elements=(str,name)=>new DOMParser().parseFromString(str,"image/svg+xml").getElementsByTagName(name);
test("T39: first standalone SVG emitted with scriptless SMIL and correctly serialized report",()=>{
  const result=compile([{cx:0},{cx:80}],{duration:1000,iterations:Infinity});
  const animations=elements(result.svg,"animate");
  assert.equal(animations.length,1);
  assert.equal(animations.item(0).getAttribute("values"),"0;80");
  assert.equal(animations.item(0).getAttribute("keyTimes"),"0;1");
  assert.equal(animations.item(0).getAttribute("repeatCount"),"indefinite");
  assert.equal(animations.item(0).getAttribute("calcMode"),"linear");
  assert.equal(result.report.effects[0].rule,"structural-equivalence-candidate");
  assert.equal(result.report.effects[0].browserVerification,"not-run");
  assert.doesNotMatch(result.svg,/<script/);
});
test("native compatible cubic-bezier and multiple independent scalar channels",()=>{
  const r=compile([{offset:0,cx:0,opacity:1,easing:"ease-in-out"},{offset:1,cx:80,opacity:0}]);
  const animations=elements(r.svg,"animate");
  assert.equal(animations.length,2);
  assert.equal(animations.item(0).getAttribute("calcMode"),"spline");
  assert.equal(animations.item(0).getAttribute("keySplines"),"0.42 0 0.58 1");
  assert.equal(animations.item(1).getAttribute("attributeName"),"opacity");
});
test("effect-wide cubic-bezier can lower only with two stops and linear outgoing easing",()=>{
  const r=compile([{cx:0},{cx:80}],{duration:1000,easing:"ease-in"});
  assert.equal(elements(r.svg,"animate").item(0).getAttribute("keySplines"),"0.42 0 1 1");
  assert.throws(()=>compile([{cx:0},{cx:20},{cx:80}],{duration:1000,easing:"ease-in"}),{code:"LOWERING_UNSUPPORTED"});
});
test("multiple offsets preserve actual unequal timing",()=>{
  const r=compile([{offset:0,cx:0},{offset:.1,cx:20},{offset:1,cx:80}]);
  assert.equal(elements(r.svg,"animate").item(0).getAttribute("keyTimes"),"0;0.1;1");
});
test("T42 and T43: correct WAAPI fill mapping",()=>{
  assert.equal(elements(compile([{cx:0},{cx:80}],{duration:1000,fill:"none"}).svg,"animate").item(0).getAttribute("fill"),"remove");
  assert.equal(elements(compile([{cx:0},{cx:80}],{duration:1000,fill:"forwards"}).svg,"animate").item(0).getAttribute("fill"),"freeze");
});
test("T44 infinite looping supported when effect repeats independently",()=>{
  const delayed=compile([{cx:0},{cx:80}],{duration:1000,delay:250,fill:"forwards"});
  assert.equal(elements(delayed.svg,"animate").item(0).getAttribute("begin"),"0.25s");
  const r=compile([{cx:0},{cx:80}],{duration:200,iterations:Infinity});
  assert.equal(elements(r.svg,"animate").item(0).getAttribute("repeatCount"),"indefinite");
});
test("T46 T47: unsupported fractional repeats and endDelay rejected",()=>{
  const f=[{cx:0},{cx:80}];
  for (const timing of [
    {duration:1000,iterations:2.5},
    {duration:1000,endDelay:-200},
    {duration:0},
    {duration:Infinity},
    {duration:1000,iterationStart:.5},
    {duration:1000,fill:"both"}
  ]) assert.throws(()=>compile(f,timing),{code:"LOWERING_UNSUPPORTED"});
});
test("negative begin preserves active phase; expired pre-zero animation refuses",()=>{
  const f=[{cx:0},{cx:80}];
  const active=compile(f,{duration:1000,delay:-250,iterations:2,fill:"forwards"});
  assert.equal(elements(active.svg,"animate").item(0).getAttribute("begin"),"-0.25s");
  assert.throws(()=>compile(f,{duration:1000,delay:-2500,iterations:2,fill:"forwards"}),{code:"LOWERING_UNSUPPORTED"});
});
test("T48: competing effects on same attribute explicitly rejected",()=>{
  const x={target:{svgId:"dot"},keyframes:[{cx:0},{cx:2}],timing:{duration:100}};
  assert.throws(()=>compileSvgAnimation({svg:SVG,tracks:[x,x]}),{code:"LOWERING_UNSUPPORTED"});
});
test("T49: transform winding cannot be reduced to zero",()=>{
  // Missing baseline is not silently synthesized; an explicit baseline can preserve full 360-degree winding.
  assert.throws(()=>compile([{transform:"rotate(0deg)"},{transform:"rotate(360deg)"}]),{code:"LOWERING_UNSUPPORTED"});
});
test("unsupported CSS bezier overshoot cannot silently become SMIL keySplines",()=>{
  assert.throws(()=>compile([{cx:0,easing:"cubic-bezier(0.5,1.5,0.5,-0.5)"},{cx:80}]),{code:"LOWERING_UNSUPPORTED"});
});
test("T40: CSS styling masks underlying baseline and is refused",()=>{
  assert.throws(()=>compile([{cx:0},{cx:80}],{duration:1000},SVG.replace('r="10"','r="10" style="fill:red"')),{code:"SVG_UNSAFE"});
});
test("T51 T52 T53: malicious SVG script / DTD / remote resources rejected",()=>{
  const sources=[
    SVG.replace("<circle",'<script>alert(1)</script><circle'),
    '<!DOCTYPE svg [<!ENTITY a "abcdef">]>'+SVG,
    SVG.replace("<circle",'<image href="https://example.com/x.png"/><circle'),
    SVG.replace('r="10"','r="10" onload="alert(1)"'),
    SVG.replace('r="10"','r="10" fill="url(https://example.com/a.svg#f)"'),
    SVG.replace("<circle",'<style>circle{animation:x 1s infinite}</style><circle'),
    SVG.replace("<circle",'<foreignObject><body xmlns="http://www.w3.org/1999/xhtml">hi</body></foreignObject><circle')
  ];
  for (const source of sources) assert.throws(()=>compile([{cx:0},{cx:80}],{duration:1000},source),{code:"SVG_UNSAFE"});
});
test("T54: ID uniqueness and missing target rejected",()=>{
  assert.throws(()=>compile([{cx:0},{cx:80}],{duration:1000},SVG.replace("</svg>",'<circle id="dot" cx="0"/></svg>')),{code:"SVG_UNSAFE"});
  assert.throws(()=>compileSvgAnimation({svg:SVG,tracks:[{target:{svgId:"unknown"},keyframes:[{cx:0},{cx:80}],timing:{duration:100}}]}),{code:"SVG_TARGET_INVALID"});
});
test("T55: escaped XML input remains valid after animation insertion",()=>{
  const xml=SVG.replace("viewBox=",'data-note="Tom &amp; Jerry" viewBox=');
  const result=compile([{cx:0},{cx:80}],{duration:1000},xml);
  assert.match(result.svg,/Tom &amp; Jerry/);
  assert.equal(elements(result.svg,"animate").length,1);
});
test("unresolved baseline is not invented",()=>{
  assert.throws(()=>compile([{x:0},{x:80}]),{code:"LOWERING_UNSUPPORTED"});
});
test("T57: output byte limits enforced",()=>{
  assert.throws(()=>compileSvgAnimation({
    svg:SVG,tracks:[{target:{svgId:"dot"},keyframes:[{cx:0},{cx:80}],timing:{duration:1000}}],
    options:{maxBytes:40}
  }),{code:"LIMIT_EXCEEDED"});
});
test("unsupported adaptive mode does not fall back silently",()=>{
  assert.throws(()=>compileSvgAnimation({
    svg:SVG,tracks:[{target:{svgId:"dot"},keyframes:[{cx:0},{cx:80}],timing:{duration:1000}}],
    options:{mode:"adaptive"}
  }),{code:"LOWERING_UNSUPPORTED"});
});
