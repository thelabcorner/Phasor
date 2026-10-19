import test from "node:test";
import assert from "node:assert/strict";
import {compileSvgAnimation,compileTiming,normalizeSequenceKeyframes,distributeOffsets,parseEasing} from "../dist/index.js";
const svg='<svg xmlns="http://www.w3.org/2000/svg"><rect id="r" x="0" y="0" width="100" height="20" /></svg>';
const base={svg,tracks:[{target:{svgId:"r"},keyframes:[{x:0},{x:40}],timing:{duration:1000}}]};
test("unknown KeyframeEffectOptions composite does not silently disappear",()=>{
  assert.throws(()=>compileSvgAnimation({...base,tracks:[{...base.tracks[0],timing:{duration:1000,composite:"add"}}]}),{code:"TIMING_INVALID"});
});
test("unknown track fields and playback fields refused",()=>{
  assert.throws(()=>compileSvgAnimation({...base,tracks:[{...base.tracks[0],scrollTimeline:"x"}]}),{code:"LOWERING_UNSUPPORTED"});
  assert.throws(()=>compileSvgAnimation({...base,tracks:[{...base.tracks[0],playback:{reverse:true}}]}),{code:"LOWERING_UNSUPPORTED"});
});
test("computedOffset cannot be treated as opaque metadata",()=>{
  assert.throws(()=>normalizeSequenceKeyframes([{offset:0,computedOffset:.4,x:0},{offset:1,x:5}]),{code:"KEYFRAME_INVALID"});
});
test("unresolved local definitions cannot be silently kept",()=>{
  const xml=svg.replace('width="100"','width="100" fill="url(#nonexistent)"');
  assert.throws(()=>compileSvgAnimation({...base,svg:xml}),{code:"SVG_UNSAFE"});
});
test("xml:base redirect and malicious external href rejected",()=>{
  assert.throws(()=>compileSvgAnimation({...base,svg:svg.replace("<rect",'<g xml:base="https://evil.example/"/><rect')}),{code:"SVG_UNSAFE"});
  assert.throws(()=>compileSvgAnimation({...base,svg:svg.replace("<rect",'<use href="https://evil.example/foo.svg#r"/><rect')}),{code:"SVG_UNSAFE"});
});
test("resource limits cannot be bypassed through NaN or zero",()=>{
  for(const options of [{maxBytes:NaN},{maxBytes:0},{maxKeyframes:0},{maxKeyframes:1}])
    assert.throws(()=>compileSvgAnimation({...base,options}),{code:"LIMIT_EXCEEDED"});
});
test("invalid runtime types fail with typed diagnostics",()=>{
  assert.throws(()=>compileTiming({duration:"1000"}),{code:"TIMING_INVALID"});
  assert.throws(()=>parseEasing(123),{code:"EASING_UNSUPPORTED"});
  assert.throws(()=>distributeOffsets([NaN,1]),{code:"OFFSET_INVALID"});
});
