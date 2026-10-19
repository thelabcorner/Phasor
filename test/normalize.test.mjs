import test from "node:test";
import assert from "node:assert/strict";
import {distributeOffsets,normalizeSequenceKeyframes,normalizePropertyIndexed} from "../dist/waapi/normalize.js";
test("T30: null offsets equally distributed",()=>{
  assert.deepEqual(distributeOffsets([0,null,null,1]),[0,1/3,2/3,1]);
});
test("T31: missing endpoints default to 0 and 1",()=>{
  assert.deepEqual(distributeOffsets([null,.5,null]),[0,.5,1]);
});
test("T32: duplicate offsets retained",()=>{
  assert.deepEqual(distributeOffsets([0,.5,.5,1]),[0,.5,.5,1]);
});
test("T33 and T34: decreasing and out-of-range offsets rejected",()=>{
  assert.throws(()=>distributeOffsets([0,.7,.2,1]),{code:"OFFSET_INVALID"});
  assert.throws(()=>normalizeSequenceKeyframes([{offset:-.1,cx:1},{offset:1,cx:2}]),{code:"OFFSET_INVALID"});
  assert.throws(()=>normalizeSequenceKeyframes([{offset:0,cx:1},{offset:1.1,cx:2}]),{code:"OFFSET_INVALID"});
});
test("T35: property-sparse keyframes preserve independent stops",()=>{
  const p=normalizeSequenceKeyframes([{cx:0,cy:10},{offset:.5,cx:3},{cx:5,cy:30}]);
  assert.deepEqual(p.find(x=>x.name==="cx").stops.map(x=>x.offset),[0,.5,1]);
  assert.deepEqual(p.find(x=>x.name==="cy").stops.map(x=>x.offset),[0,1]);
});
test("T36: property-indexed arrays get independent offsets",()=>{
  const p=normalizePropertyIndexed({cx:[0,10,20],opacity:[0,1]});
  assert.deepEqual(p[0].stops.map(x=>x.offset),[0,.5,1]);
  assert.deepEqual(p[1].stops.map(x=>x.offset),[0,1]);
});
test("T37: singleton preserves just one stop",()=>{
  assert.equal(normalizeSequenceKeyframes([{cx:42}])[0].stops.length,1);
});
test("T38: additive compositing is preserved for later lowering refusal",()=>{
  assert.equal(normalizeSequenceKeyframes([{cx:0,composite:"add"},{cx:2}])[0].stops[0].composite,"add");
});
test("T21: easing ownership remains on outgoing keyframe",()=>{
  const p=normalizeSequenceKeyframes([{cx:0,easing:"ease-in"},{cx:10,easing:"linear"}]);
  assert.equal(p[0].stops[0].easing.kind,"bezier");
  assert.equal(p[0].stops[1].easing.kind,"linear");
});
test("T56: NaN keyframe values rejected",()=>{
  assert.throws(()=>normalizeSequenceKeyframes([{cx:NaN},{cx:2}]),{code:"KEYFRAME_INVALID"});
});
