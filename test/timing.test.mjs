import test from "node:test";
import assert from "node:assert/strict";
import {compileTiming,sampleTiming} from "../dist/timing.js";
import {parseEasing,evaluateEasing,nativeSpline} from "../dist/easing.js";
const at=(timing,t,rate=1)=>sampleTiming(compileTiming(timing),t,rate);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9, String(a)+" vs "+String(b));
test("T01: ordinary timeline and terminal ownership",()=>{
  const t={duration:1000,fill:"forwards"};
  close(at(t,0).transformedProgress,0);
  close(at(t,500).transformedProgress,.5);
  close(at(t,1000).transformedProgress,1);
  assert.equal(at(t,1000).phase,"after");
});
test("T02–T04: fill modes before/after",()=>{
  const t={duration:1000,delay:250};
  assert.equal(at(t,0).transformedProgress,null);
  assert.equal(at(t,249).transformedProgress,null);
  close(at(t,250).transformedProgress,0);
  assert.equal(at(t,1250).transformedProgress,null);
  close(at({...t,fill:"backwards"},0).transformedProgress,0);
  close(at({...t,fill:"both"},1250).transformedProgress,1);
});
test("T05: negative delay accounts for elapsed active time",()=> {
  close(at({duration:1000,delay:-250},0).transformedProgress,.25);
  close(at({duration:1000,delay:-250,fill:"forwards"},750).transformedProgress,1);
});
test("T06–T07: negative endDelay truncates active interval",()=> {
  const x=compileTiming({duration:1000,endDelay:500});
  assert.equal(x.endTime,1500);
  assert.equal(sampleTiming(x,1100).phase,"after");
  const y=compileTiming({duration:1000,endDelay:-300});
  assert.equal(y.endTime,700);
  assert.equal(sampleTiming(y,700).phase,"after");
  close(sampleTiming(y,699).transformedProgress,.699);
  close(sampleTiming(compileTiming({duration:1000,endDelay:-300,fill:"forwards"}),700).transformedProgress,.7);
});
test("T08: clamps effect endTime to zero",()=> {
  const x=compileTiming({duration:1000,delay:-100,endDelay:-900});
  assert.equal(x.endTime,0);
  assert.equal(x.beforeActiveBoundary,0);
  assert.equal(x.activeAfterBoundary,0);
  assert.equal(sampleTiming(x,0).phase,"after");
});
test("T09–T12: no NaN when zero duration or iterations multiply infinity",()=>{
  for (const timing of [
    {duration:0,iterations:1}, {duration:1000,iterations:0},
    {duration:Infinity,iterations:0}, {duration:0,iterations:Infinity}
  ]) {
    const x=compileTiming(timing);
    assert.equal(x.activeDuration,0);
    assert.equal(Number.isNaN(x.endTime),false);
  }
  close(at({duration:0,fill:"forwards"},0).transformedProgress,1);
  close(at({duration:1000,iterations:0,fill:"forwards"},0).transformedProgress,0);
});
test("T13: integer repeat boundary belongs to next iteration but final endpoint=1",()=>{
  const t={duration:1000,iterations:2,fill:"forwards"};
  assert.equal(at(t,999).currentIteration,0);
  assert.equal(at(t,1000).simpleProgress,0);
  assert.equal(at(t,1000).currentIteration,1);
  assert.equal(at(t,2000).simpleProgress,1);
  assert.equal(at(t,2000).currentIteration,1);
});
test("T14: fractional iterations preserve terminal fraction",()=>{
  close(at({duration:1000,iterations:2.5,fill:"forwards"},2500).transformedProgress,.5);
});
test("T15–T16: iterationStart changes progress and final iteration index",()=>{
  close(at({duration:1000,iterationStart:.25},0).transformedProgress,.25);
  assert.equal(at({duration:1000,iterationStart:1.5,iterations:.5,fill:"forwards"},500).simpleProgress,1);
  assert.equal(at({duration:1000,iterationStart:1.5,iterations:.5,fill:"forwards"},500).currentIteration,1);
});
test("T17–T19: direction and alternating iteration parity",()=>{
  close(at({duration:1000,direction:"reverse"},0).transformedProgress,1);
  close(at({duration:1000,iterations:2,direction:"alternate"},1000).directedProgress,1);
  close(at({duration:1000,iterations:2,direction:"alternate"},1500).directedProgress,.5);
  close(at({duration:1000,iterations:2,direction:"alternate-reverse"},0).directedProgress,1);
  close(at({duration:1000,iterations:2,direction:"alternate-reverse"},1000).directedProgress,0);
});
test("T20: negative rate changes phase equality ownership",()=>{
  const x=compileTiming({duration:1000,fill:"both",delay:100});
  assert.equal(sampleTiming(x,100,-1).phase,"before");
  assert.equal(sampleTiming(x,1100,-1).phase,"active");
  assert.equal(sampleTiming(x,1100,1).phase,"after");
});
test("T22: bezier easing numeric inversion",()=>{
  const x=parseEasing("cubic-bezier(0.42,0,0.58,1)");
  close(evaluateEasing(x,.5),.5);
  close(evaluateEasing(x,0),0);
  close(evaluateEasing(x,1),1);
  assert.notEqual(nativeSpline(x),null);
});
test("T23: bezier overshoot legal CSS but forbidden SVG keySplines",()=>{
  const x=parseEasing("cubic-bezier(0.5,1.5,0.5,-0.5)");
  assert.equal(nativeSpline(x),null);
  assert.ok(Number.isFinite(evaluateEasing(x,.23)));
});
test("T24–T27: steps variants and before flag",()=>{
  close(evaluateEasing(parseEasing("steps(4,jump-start)"),0),.25);
  close(evaluateEasing(parseEasing("steps(4,jump-start)"),0,true),0);
  close(evaluateEasing(parseEasing("steps(4,jump-end)"),.25),.25);
  close(evaluateEasing(parseEasing("steps(4,jump-end)"),.25,true),0);
  close(evaluateEasing(parseEasing("steps(4,jump-none)"),.25),1/3);
  close(evaluateEasing(parseEasing("steps(4,jump-both)"),0),.2);
  close(evaluateEasing(parseEasing("steps(4,jump-both)"),1),1);
});
test("validation rejects out of domain inputs",()=>{
  assert.throws(()=>compileTiming({duration:-1}),{code:"TIMING_INVALID"});
  assert.throws(()=>compileTiming({delay:NaN}),{code:"TIMING_INVALID"});
  assert.throws(()=>compileTiming({iterations:-1}),{code:"TIMING_INVALID"});
  assert.throws(()=>parseEasing("cubic-bezier(1.1,0,0,1)"),{code:"EASING_UNSUPPORTED"});
  assert.throws(()=>parseEasing("steps(1,jump-none)"),{code:"EASING_UNSUPPORTED"});
});
test("deterministic repeated samples and idle",()=>{
  const x=compileTiming({duration:300,iterations:Infinity,fill:"both"});
  for (const t of [0,100,300,12345,30000]) assert.deepEqual(sampleTiming(x,t),sampleTiming(x,t));
  assert.equal(sampleTiming(x,null).phase,"idle");
});
