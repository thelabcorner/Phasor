import { AnimationCompileError } from "./diagnostics.js";
import type { PlaybackDirection } from "./timing.js";

/** Direction normalization performed on authored mathematical segments, not sampled frames. */
export interface NativeCurve {
  readonly values: string;
  readonly keyTimes: string;
  readonly keySplines: string | null;
}
export interface NativeDirectedCurve extends NativeCurve {
  readonly durationMultiplier: 1 | 2;
  readonly repeatMultiplier: 1 | .5;
  readonly keyframeCount: number;
}

type Pieces={values:string[];times:number[];splines:number[][]|null};

const split=(curve:NativeCurve):Pieces=>{
  const values=curve.values.split(";");
  const times=curve.keyTimes.split(";").map(Number);
  const splines=curve.keySplines===null?null:curve.keySplines.split(";").map(s=>s.trim().split(/\s+/).map(Number));
  if (values.length!==times.length || values.length<2 ||
      times.some(t=>!Number.isFinite(t)) ||
      splines!==null && (splines.length!==values.length-1 || splines.some(s=>s.length!==4 || s.some(n=>!Number.isFinite(n)))))
    throw new AnimationCompileError("LOWERING_UNSUPPORTED","Inconsistent curve encoding");
  return {values,times,splines};
};
const reversed=(curve:Pieces):Pieces=>({
  values:[...curve.values].reverse(),
  times:[...curve.times].reverse().map(t=>1-t),
  splines:curve.splines===null?null:[...curve.splines].reverse().map(([x1,y1,x2,y2])=>
    [1-x2!,1-y2!,1-x1!,1-y1!].map(v=>Number(v.toPrecision(15))))
});

function pair(first:Pieces,second:Pieces):Pieces {
  if (first.values.at(-1)!==second.values[0])
    throw new AnimationCompileError("LOWERING_UNSUPPORTED","An alternating direction cycle requires coincident turnaround values");
  return {
    values:[...first.values,...second.values.slice(1)],
    times:[...first.times.map(t=>t*.5),...second.times.slice(1).map(t=>(t+1)*.5)],
    splines:first.splines===null && second.splines===null?null:
      [...(first.splines??Array.from({length:first.values.length-1},()=>[0,0,1,1])),
       ...(second.splines??Array.from({length:second.values.length-1},()=>[0,0,1,1]))]
  };
}
export function lowerDirectedCurve(curve:NativeCurve,direction:PlaybackDirection,validatedStopCount?:number):NativeDirectedCurve {
  // The compiler has already verified authored offsets, value types and spline
  // correspondence. Normal direction is an identity lowering: keep the exact
  // original serialized mathematical representation with no reparse.
  if (direction==="normal" && validatedStopCount!==undefined)
    return {...curve,durationMultiplier:1,repeatMultiplier:1,keyframeCount:validatedStopCount};
  const forward=split(curve);
  const backwards=reversed(forward);
  let output:Pieces, durationMultiplier:1|2=1,repeatMultiplier:1|.5=1;
  if (direction==="normal") output=forward;
  else if(direction==="reverse") output=backwards;
  else {
    durationMultiplier=2;
    repeatMultiplier=.5;
    output=direction==="alternate"?pair(forward,backwards):pair(backwards,forward);
  }
  if (output.times[0]!==0 || output.times.at(-1)!==1 ||
      output.times.some((t,i)=>i>0 && t<=output.times[i-1]!))
    throw new AnimationCompileError("LOWERING_UNSUPPORTED","Directed curve has invalid or duplicate keyTimes");
  return {
    values:output.values.join(";"),
    keyTimes:output.times.map(String).join(";"),
    keySplines:output.splines?.map(s=>s.map(x=>String(Object.is(x,-0)?0:x)).join(" ")).join(";")??null,
    durationMultiplier,repeatMultiplier,keyframeCount:output.values.length
  };
}
