import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { Document as XmlDocument, Element as XmlElement, Node as XmlNode } from "@xmldom/xmldom";
import { AnimationCompileError } from "./diagnostics.js";
import { compileTiming } from "./timing.js";
import { nativeSpline } from "./easing.js";
import type { Ease } from "./easing.js";
import { normalizeSequenceKeyframes, normalizePropertyIndexed } from "./waapi/normalize.js";
import type { SequenceKeyframe, PropertyIndexedKeyframes, NormalizedProperty, ScalarStop } from "./waapi/normalize.js";
import type { TimingOptions } from "./timing.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const SAFE_SCALARS = new Set(["cx","cy","x","y","x1","x2","y1","y2","r","rx","ry","width","height","opacity","fill-opacity","stroke-opacity"]);
const NONNEGATIVE = new Set(["r","rx","ry","width","height","opacity","fill-opacity","stroke-opacity"]);
const DISALLOWED_ELEMENTS = new Set(["script","foreignObject","style","image","video","audio","iframe","object","embed","link","animate","animateTransform","animateMotion","set","discard"]);
const REQUIRED_BASE = "Animated target must have an explicit numerical base SVG attribute; unresolved CSS/base interpolation is unsupported: ";

export interface TrackSource {
  readonly target: { readonly svgId: string };
  readonly keyframes: readonly SequenceKeyframe[] | PropertyIndexedKeyframes;
  readonly timing: TimingOptions;
  readonly playback?: { readonly playbackRate?: number; readonly startOffsetMs?: number };
}
export interface CompileRequest {
  readonly svg: string;
  readonly tracks: readonly TrackSource[];
  readonly options?: { readonly profile?: "svg-image" | "svg-document"; readonly mode?: "exact-only" | "adaptive"; readonly maxBytes?: number; readonly maxKeyframes?: number };
}
export interface EffectEvidence {
  readonly target: string;
  readonly property: string;
  readonly lowering: "native-smil-scalar";
  readonly rule: "structural-equivalence-candidate";
  readonly browserVerification: "not-run";
}
export interface CompileResult {
  readonly svg: string;
  readonly report: {
    readonly status: "exact";
    readonly guarantee: "structural-under-preconditions-not-browser-certified";
    readonly effects: readonly EffectEvidence[];
    readonly bytes: number;
  };
}
function reject(code: "SVG_UNSAFE" | "SVG_TARGET_INVALID" | "LOWERING_UNSUPPORTED" | "PROPERTY_UNSUPPORTED" | "LIMIT_EXCEEDED", reason: string): never {
  throw new AnimationCompileError(code,reason);
}
function parseSvg(input: string): {document:XmlDocument; byId:Map<string,XmlElement>} {
  if (typeof input !== "string" || input.length > 5_000_000)
    return reject("LIMIT_EXCEEDED","Invalid SVG text or source exceeds 5 million UTF-16 code units");
  // xmldom is not used to resolve external entities; refuse all declarations and processing instructions before parsing.
  if (/<!\s*(?:DOCTYPE|ENTITY)\b|<\?(?!xml(?:\s|\?>))/i.test(input))
    return reject("SVG_UNSAFE","DTD, XML entities, and processing instructions are forbidden");
  const errors: string[]=[];
  const parser = new DOMParser({ onError: (_level, message) => { errors.push(message); } });
  const document = parser.parseFromString(input,"image/svg+xml");
  if (errors.length || document.documentElement?.namespaceURI !== SVG_NS ||
    document.documentElement.localName !== "svg")
    return reject("SVG_UNSAFE","Malformed or non-SVG document: "+errors.join("; "));
  const byId = new Map<string,XmlElement>();
  const references: string[]=[];
  function check(node: XmlNode): void {
    if (node.nodeType === 1) {
      const element=node as XmlElement;
      const tag=element.localName;
      if (!tag || element.namespaceURI !== SVG_NS || DISALLOWED_ELEMENTS.has(tag))
        reject("SVG_UNSAFE","Unsupported element: "+tag);
      const id=element.getAttribute("id");
      if (id !== null) {
        if (!id || byId.has(id)) reject("SVG_UNSAFE","Empty or duplicate SVG ID: "+id);
        byId.set(id,element);
      }
      for (let a=0; a<element.attributes.length; a++) {
        const attr=element.attributes.item(a)!;
        const key=attr.name.toLowerCase();
        const value=attr.value;
        if (key === "style" || /^on[a-z]/i.test(key) || key === "src" || key === "xml:base")
          reject("SVG_UNSAFE","Styles/event handlers/source attributes unresolved: "+attr.name);
        if (/url\s*\(/i.test(value) && !/^\s*url\(\s*#[\w.:-]+\s*\)\s*$/i.test(value))
          reject("SVG_UNSAFE","External or dynamically resolved url() reference forbidden: "+attr.name);
        const urlReference=value.match(/^\s*url\(\s*#([\w.:-]+)\s*\)\s*$/i);
        if (urlReference) references.push(urlReference[1]!);
        if ((key === "href" || key === "xlink:href") && !/^#[A-Za-z_][\w.:-]*$/.test(value))
          reject("SVG_UNSAFE","External or unresolved href forbidden");
        if (key === "href" || key === "xlink:href") references.push(value.slice(1));
      }
    } else if (node.nodeType === 7 || node.nodeType === 10 || node.nodeType === 5) {
      reject("SVG_UNSAFE","Processing instructions, DTD and entity references unsupported");
    }
    for (let child=node.firstChild;child;child=child.nextSibling) check(child);
  }
  check(document);
  for (const reference of references) {
    if (!byId.has(reference)) reject("SVG_UNSAFE","Unresolved local SVG reference: #"+reference);
  }
  return {document,byId};
}
function numericValue(value: string | number, name: string): number {
  if (typeof value === "string" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))
    return reject("PROPERTY_UNSUPPORTED","Only unitless scalar numbers are supported: "+name);
  const n=Number(value);
  if (!Number.isFinite(n) || NONNEGATIVE.has(name) && n < 0)
    return reject("PROPERTY_UNSUPPORTED","Invalid numerical value for: "+name);
  if (NONNEGATIVE.has(name) && name.includes("opacity") && n > 1)
    return reject("PROPERTY_UNSUPPORTED","Opacity out of structural subset: "+name);
  return n;
}
function lowerStops(stops: readonly ScalarStop[], name: string, effectEase: Ease): {values:string;keyTimes:string;keySplines:string|null} {
  if (stops.length<2 || stops.length>10000 || stops[0]!.offset!==0 || stops[stops.length-1]!.offset!==1)
    return reject("LOWERING_UNSUPPORTED","Full 0..1 endpoints and 2-10000 stops required for "+name);
  if (stops.some((s,i)=>s.composite!=="replace" || i>0 && s.offset<=stops[i-1]!.offset))
    return reject("LOWERING_UNSUPPORTED","Duplicate offsets/non-replace composition need a boundary/composition pass: "+name);
  const numbers=stops.map(s=>numericValue(s.value,name));
  const effectNonlinear=effectEase.kind!=="linear";
  const perKeyframeNonlinear=stops.slice(0,-1).some(s=>s.easing.kind!=="linear");
  if (effectNonlinear && (stops.length!==2 || perKeyframeNonlinear))
    return reject("LOWERING_UNSUPPORTED","Nested effect and keyframe easing cannot be lowered directly: "+name);
  const easings=stops.slice(0,-1).map(s=>effectNonlinear?effectEase:s.easing);
  const splines=easings.map(nativeSpline);
  if (splines.some(s=>s===null))
    return reject("LOWERING_UNSUPPORTED","Easing not representable by SVG keySplines: "+name);
  return {
    values:numbers.join(";"),
    keyTimes:stops.map(s=>String(s.offset)).join(";"),
    keySplines:easings.some(s=>s.kind!=="linear")?splines.join(";"):null
  };
}

/** Fail-closed first exact subset; no hidden approximation or browser dependency. */
export function compileSvgAnimation(input: CompileRequest): CompileResult {
  if (!input || typeof input!=="object")
    return reject("LOWERING_UNSUPPORTED","Expected a compile request");
  const optionKeys=new Set(["profile","mode","maxBytes","maxKeyframes"]);
  const options=input.options ?? {};
  for (const key of Object.keys(options)) {
    if (!optionKeys.has(key)) return reject("LOWERING_UNSUPPORTED","Unknown compile option: "+key);
  }
  if (options.mode !== undefined && options.mode!=="exact-only" && options.mode!=="adaptive" ||
    options.profile !== undefined && options.profile!=="svg-image" && options.profile!=="svg-document")
    return reject("LOWERING_UNSUPPORTED","Unknown mode or SVG output profile");
  if (options.maxBytes !== undefined && (!Number.isSafeInteger(options.maxBytes) || options.maxBytes<1) ||
    options.maxKeyframes !== undefined && (!Number.isSafeInteger(options.maxKeyframes) || options.maxKeyframes<1))
    return reject("LIMIT_EXCEEDED","Output/input caps must be positive safe integers");
  if (input.options?.mode === "adaptive")
    return reject("LOWERING_UNSUPPORTED","Adaptive lowering is not implemented; exact-only is supported");
  const {document:doc,byId}=parseSvg(input.svg);
  if (!Array.isArray(input.tracks) || input.tracks.length > 1000)
    return reject("LIMIT_EXCEEDED","Track count exceeds 1000 or is invalid");
  const scheduled: {target:XmlElement;name:string;attributes:Record<string,string>;id:string}[]=[];
  const claimed=new Set<string>();
  let normalizedStops=0;
  // Compilation-local intern tables: repeated authored effects pay parsing/timing costs once.
  // No global retained keys or cache state across independent compiler invocations.
  const timingCache=new WeakMap<object,ReturnType<typeof compileTiming>>();
  const propertyCache=new WeakMap<object,readonly NormalizedProperty[]>();
  const lowerCache=new WeakMap<NormalizedProperty,WeakMap<Ease,ReturnType<typeof lowerStops>>>();
  for (const track of input.tracks) {
    if (!track || typeof track.target?.svgId!=="string" || !track.target.svgId ||
      !/^[A-Za-z_][\w.:-]*$/.test(track.target.svgId))
      return reject("SVG_TARGET_INVALID","Expected a valid explicit target SVG ID");
    const trackKeys=new Set(["target","keyframes","timing","playback"]);
    for (const key of Object.keys(track)) {
      if (!trackKeys.has(key)) return reject("LOWERING_UNSUPPORTED","Unknown track field: "+key);
    }
    if (track.playback) for (const key of Object.keys(track.playback)) {
      if (key!=="playbackRate" && key!=="startOffsetMs")
        return reject("LOWERING_UNSUPPORTED","Unknown playback property: "+key);
    }
    const target=byId.get(track.target.svgId);
    if (!target) return reject("SVG_TARGET_INVALID","Unknown target ID: "+track.target.svgId);
    if (track.playback && (track.playback.playbackRate!==undefined && track.playback.playbackRate!==1 ||
      track.playback.startOffsetMs!==undefined && track.playback.startOffsetMs!==0))
      return reject("LOWERING_UNSUPPORTED","Playback mapping requires timeline normalization");
    let timing=track.timing && timingCache.get(track.timing);
    if (!timing) {
      timing=compileTiming(track.timing);
      if (track.timing && typeof track.timing==="object") timingCache.set(track.timing,timing);
    }
    if (!(timing.duration>0) || !Number.isFinite(timing.duration) || timing.duration<.001 ||
      timing.delay<0 || timing.endDelay!==0 || timing.iterationStart!==0 ||
      timing.direction!=="normal" || timing.iterations<1 ||
      timing.iterations!==Infinity && !Number.isSafeInteger(timing.iterations) ||
      (timing.fill!=="none" && timing.fill!=="forwards"))
      return reject("LOWERING_UNSUPPORTED","Timing outside v0 native-SMIL proven subset");
    if (!track.keyframes || typeof track.keyframes!=="object")
      return reject("LOWERING_UNSUPPORTED","Expected object or array keyframe descriptor");
    let properties=propertyCache.get(track.keyframes);
    if (!properties) {
      properties=Array.isArray(track.keyframes)
        ? normalizeSequenceKeyframes(track.keyframes as readonly SequenceKeyframe[])
        : normalizePropertyIndexed(track.keyframes as PropertyIndexedKeyframes);
      propertyCache.set(track.keyframes,properties);
    }
    if (!properties.length) return reject("LOWERING_UNSUPPORTED","Track has no animated properties");
    for (const property of properties) {
      normalizedStops+=property.stops.length;
      if (normalizedStops>(input.options?.maxKeyframes??100000))
        return reject("LIMIT_EXCEEDED","Too many normalized keyframes");
      if (!SAFE_SCALARS.has(property.name)) return reject("PROPERTY_UNSUPPORTED","Unsupported SVG scalar: "+property.name);
      const owner=track.target.svgId+"\u0000"+property.name;
      if (claimed.has(owner)) return reject("LOWERING_UNSUPPORTED","Multiple effects on the same target/property require effect-stack resolution");
      claimed.add(owner);
      if (!target.hasAttribute(property.name))
        return reject("LOWERING_UNSUPPORTED",REQUIRED_BASE+property.name);
      numericValue(target.getAttribute(property.name)!,property.name);
      let byEasing=lowerCache.get(property);
      if (!byEasing) {byEasing=new WeakMap();lowerCache.set(property,byEasing);}
      let lower=byEasing.get(timing.easing);
      if (!lower) {lower=lowerStops(property.stops,property.name,timing.easing);byEasing.set(timing.easing,lower);}
      const attributes:Record<string,string>={
        attributeName:property.name,attributeType:"XML",begin:String(timing.delay/1000)+"s",
        dur:String(timing.duration/1000)+"s",
        repeatCount:timing.iterations===Infinity?"indefinite":String(timing.iterations),
        fill:timing.fill==="forwards"?"freeze":"remove",
        calcMode:lower.keySplines===null?"linear":"spline",
        values:lower.values,keyTimes:lower.keyTimes
      };
      if (lower.keySplines !== null) attributes.keySplines=lower.keySplines;
      scheduled.push({target,name:property.name,attributes,id:track.target.svgId});
    }
  }
  for (const entry of scheduled) {
    const animation=doc.createElementNS(SVG_NS,"animate");
    for (const [name,value] of Object.entries(entry.attributes)) animation.setAttribute(name,value);
    entry.target.appendChild(animation);
  }
  const svg=new XMLSerializer().serializeToString(doc);
  const bytes=new TextEncoder().encode(svg).byteLength;
  if (bytes>(input.options?.maxBytes??5_000_000))
    return reject("LIMIT_EXCEEDED","Compiled SVG output exceeds maxBytes");
  return {svg,report:{status:"exact",guarantee:"structural-under-preconditions-not-browser-certified",effects:scheduled.map(x=>({
    target:x.id, property:x.name,lowering:"native-smil-scalar" as const,
    rule:"structural-equivalence-candidate" as const,browserVerification:"not-run" as const
  })),bytes}};
}
