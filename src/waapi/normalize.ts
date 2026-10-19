import { AnimationCompileError } from "../diagnostics.js";
import { parseEasing } from "../easing.js";
import type { Ease } from "../easing.js";

export type KeyframeValue = number | string;
export interface SequenceKeyframe {
  readonly offset?: number | null;
  readonly easing?: string;
  readonly composite?: "replace" | "add" | "accumulate" | "auto";
  readonly [property: string]: KeyframeValue | null | undefined;
}
export type PropertyIndexedKeyframes = Readonly<Record<string, ReadonlyArray<KeyframeValue>>>;
export interface ScalarStop {
  readonly offset: number;
  readonly value: KeyframeValue;
  readonly easing: Ease;
  readonly composite: "replace" | "add" | "accumulate";
}
export interface NormalizedProperty {
  readonly name: string;
  readonly stops: readonly ScalarStop[];
}
function checkedOffset(offset: unknown, index: number): number | null {
  if (offset === null || offset === undefined) return null;
  if (typeof offset !== "number" || !Number.isFinite(offset) || offset < 0 || offset > 1)
    throw new AnimationCompileError("OFFSET_INVALID","Invalid offset at keyframe " + index);
  return offset;
}
/** Distribute missing offsets, retaining duplicates for explicit boundary semantics. */
export function distributeOffsets(given: ReadonlyArray<number | null>): number[] {
  if (given.some(x=>x !== null && (typeof x !== "number" || !Number.isFinite(x) || x<0 || x>1)))
    throw new AnimationCompileError("OFFSET_INVALID","Offset must be null or a finite number in [0,1]");
  const count = given.length;
  if (!count) return [];
  const a = given.slice();
  let previous=-Infinity;
  for (let i=0; i<count; i++) {
    if (a[i] !== null) {
      if (a[i]! < previous) throw new AnimationCompileError("OFFSET_INVALID","Out-of-order specified offsets");
      previous = a[i]!;
    }
  }
  if (a[0] === null) a[0]=0;
  if (count>1 && a[count-1] === null) a[count-1]=1;
  let start=0;
  while (start<count-1) {
    let end=start+1;
    while (end<count && a[end]===null) end++;
    if (end===count) break;
    const from=a[start]!, to=a[end]!;
    for (let j=start+1;j<end;j++) a[j]=from+(to-from)*(j-start)/(end-start);
    start=end;
  }
  return a.map(x=>x!);
}
const RESERVED = new Set(["offset","easing","composite"]);
export function normalizeSequenceKeyframes(input: readonly SequenceKeyframe[]): readonly NormalizedProperty[] {
  if (!Array.isArray(input) || !input.length)
    throw new AnimationCompileError("KEYFRAME_INVALID","At least one keyframe required");
  if (input.some(f=>!f || typeof f !== "object" || Array.isArray(f)))
    throw new AnimationCompileError("KEYFRAME_INVALID","Every keyframe must be an object");
  const offsets=distributeOffsets(input.map((f,i)=>checkedOffset(f.offset,i)));
  const properties=new Map<string, ScalarStop[]>();
  for (let i=0;i<input.length;i++) {
    const frame=input[i]!;
    if ("computedOffset" in frame)
      throw new AnimationCompileError("KEYFRAME_INVALID","computedOffset requires the browser-capture adapter");
    if (frame.composite !== undefined && !["replace","auto","add","accumulate"].includes(frame.composite))
      throw new AnimationCompileError("COMPOSITION_UNSUPPORTED","Unknown composite");
    const easing=parseEasing(frame.easing??"linear");
    for (const [name,value] of Object.entries(frame)) {
      if (RESERVED.has(name)) continue;
      if (typeof value !== "string" && typeof value !== "number")
        throw new AnimationCompileError("KEYFRAME_INVALID","Invalid value for "+name);
      if (typeof value === "number" && !Number.isFinite(value))
        throw new AnimationCompileError("KEYFRAME_INVALID","Non-finite value for "+name);
      const stops=properties.get(name)??[];
      stops.push({offset:offsets[i]!,value,easing,composite:frame.composite === "auto" || !frame.composite ? "replace" : frame.composite});
      properties.set(name,stops);
    }
  }
  return [...properties].map(([name,stops])=>({name,stops}));
}
export function normalizePropertyIndexed(input: PropertyIndexedKeyframes): readonly NormalizedProperty[] {
  const properties: NormalizedProperty[]=[];
  for (const [name,values] of Object.entries(input)) {
    if (RESERVED.has(name)) throw new AnimationCompileError("KEYFRAME_INVALID","Property-indexed timing metadata not yet implemented: "+name);
    if (!Array.isArray(values) || !values.length)
      throw new AnimationCompileError("KEYFRAME_INVALID","Expected nonempty property array: "+name);
    properties.push({name,stops:values.map((value,i)=> {
      if ((typeof value !== "number" && typeof value !== "string") ||
        typeof value === "number" && !Number.isFinite(value))
        throw new AnimationCompileError("KEYFRAME_INVALID","Invalid property value: "+name);
      return {offset:values.length===1?0:i/(values.length-1),value,easing:{kind:"linear"} as const,composite:"replace" as const};
    })});
  }
  if (!properties.length) throw new AnimationCompileError("KEYFRAME_INVALID","No animated properties");
  return properties;
}
