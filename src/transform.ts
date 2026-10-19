import { AnimationCompileError } from "./diagnostics.js";
import type { ScalarStop } from "./waapi/normalize.js";

export type NativeTransformType = "translate" | "scale" | "rotate";

export interface NativeTransformValues {
  readonly type: NativeTransformType;
  readonly values: string;
}

const NUM = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`;
const TRANSLATE = new RegExp(
  String.raw`^translate\(\s*(${NUM})px(?:\s*,\s*(${NUM})px)?\s*\)$`, "i"
);
const SCALE = new RegExp(
  String.raw`^scale\(\s*(${NUM})(?:\s*,\s*(${NUM}))?\s*\)$`, "i"
);
const ROTATE = new RegExp(String.raw`^rotate\(\s*(${NUM})deg\s*\)$`, "i");
const BASE_TRANSLATE = new RegExp(
  String.raw`^translate\(\s*(${NUM})(?:\s*[ ,]\s*(${NUM}))?\s*\)$`, "i"
);
const BASE_SCALE = new RegExp(
  String.raw`^scale\(\s*(${NUM})(?:\s*[ ,]\s*(${NUM}))?\s*\)$`, "i"
);
const BASE_ROTATE = new RegExp(String.raw`^rotate\(\s*(${NUM})\s*\)$`, "i");

interface TransformStop {
  readonly type: NativeTransformType;
  readonly parameters: readonly number[];
}

function parseNumbers(match: RegExpMatchArray, secondDefault: (first: number) => number): readonly number[] {
  const first=Number(match[1]);
  const second=match[2]===undefined?secondDefault(first):Number(match[2]);
  if (!Number.isFinite(first) || !Number.isFinite(second))
    throw new AnimationCompileError("PROPERTY_UNSUPPORTED","Non-finite transform values cannot be serialized");
  return [first,second];
}

function parseAuthored(value: string): TransformStop {
  const translate=value.match(TRANSLATE);
  if (translate) return {type:"translate",parameters:parseNumbers(translate,()=>0)};
  const scale=value.match(SCALE);
  if (scale) return {type:"scale",parameters:parseNumbers(scale,first=>first)};
  const rotate=value.match(ROTATE);
  if (rotate) {
    const angle=Number(rotate[1]);
    if (!Number.isFinite(angle)) throw new AnimationCompileError("PROPERTY_UNSUPPORTED","Invalid rotate() angle");
    return {type:"rotate",parameters:[angle]};
  }
  throw new AnimationCompileError("PROPERTY_UNSUPPORTED",
    "Only CSS translate(px[,px]), scale(number[,number]) and rotate(deg) are proven transform candidates");
}

function parseSvgBaseline(raw: string, type: NativeTransformType): readonly number[] {
  if (type==="translate") {
    const m=raw.match(BASE_TRANSLATE);
    if (m) return parseNumbers(m,()=>0);
  } else if(type==="scale") {
    const m=raw.match(BASE_SCALE);
    if (m) return parseNumbers(m,first=>first);
  } else {
    const m=raw.match(BASE_ROTATE);
    if (m) {
      const angle=Number(m[1]);
      if (Number.isFinite(angle)) return [angle];
    }
  }
  throw new AnimationCompileError("LOWERING_UNSUPPORTED",
    "Transform baseline must be an explicit SVG single-function transform of the same type");
}

/**
 * A restricted CSS-transform to SVG-animateTransform mapping. Higher-level
 * caller must enforce no style overrides, default zero transform-origin,
 * one owner for transform, replace composition, and standard viewBox semantics.
 */
export function lowerNativeTransform(stops: readonly ScalarStop[], baseAttribute: string): NativeTransformValues {
  if (stops.length<2)
    throw new AnimationCompileError("LOWERING_UNSUPPORTED","Transform requires at least two keyframes");
  let type:NativeTransformType|null=null;
  const formatted:string[]=[];
  for(const stop of stops) {
    if (typeof stop.value!=="string")
      throw new AnimationCompileError("PROPERTY_UNSUPPORTED","Transform keyframe must be a CSS transform string");
    const parsed=parseAuthored(stop.value);
    if (type!==null && type!==parsed.type)
      throw new AnimationCompileError("LOWERING_UNSUPPORTED","Mixed transform functions need CSS matrix decomposition");
    type=parsed.type;
    formatted.push(parsed.parameters.map(String).join(" "));
    // Preserve authored rotate winding even if endpoints have identical matrices.
  }
  if (!type) throw new AnimationCompileError("LOWERING_UNSUPPORTED","Empty transform track");
  parseSvgBaseline(baseAttribute,type);
  return {type,values:formatted.join(";")};
}
