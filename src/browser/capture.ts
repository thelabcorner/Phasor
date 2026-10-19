import { AnimationCompileError } from "../diagnostics.js";
import type { CompileRequest, TrackSource } from "../compile.js";
import type { SequenceKeyframe } from "../waapi/normalize.js";
import type { TimingOptions } from "../timing.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const PROPERTY_MAP: Readonly<Record<string,string>> = Object.freeze({
  opacity: "opacity",
  fillOpacity: "fill-opacity",
  strokeOpacity: "stroke-opacity",
  transform: "transform"
});
const META_KEYS = new Set(["offset","computedOffset","easing","composite"]);
const VALID_COMPOSITE = new Set(["auto","replace"]);

export interface CaptureOptions {
  /** The captured effect is reauthored to start at t=0, not a snapshot of its current playhead. */
  readonly profile?: "svg-image" | "svg-document";
}

/**
 * Capture a deliberately restricted, browser-authored native KeyframeEffect.
 * No DOM is accessed during module initialization; all browser globals remain
 * behind this explicit function. The captured result is a plain serialized
 * CompileRequest that can be passed to the headless core in another process.
 *
 * Gate v0: opacity and single-function transform channels, explicit SVG attribute baseline,
 * no author stylesheets, no CSS inheritance or additive composition.
 */
export function captureWaapiAnimations(
  svgRoot: SVGSVGElement,
  animations: readonly Animation[],
  options: CaptureOptions = {}
): CompileRequest {
  if (typeof document === "undefined" || typeof SVGSVGElement === "undefined")
    throw new AnimationCompileError("SVG_TARGET_INVALID","Browser DOM is required for WAAPI capture");
  if (!(svgRoot instanceof SVGSVGElement) || svgRoot.namespaceURI !== SVG_NS)
    throw new AnimationCompileError("SVG_TARGET_INVALID","Expected a native SVGSVGElement scene root");
  if (!svgRoot.isConnected || svgRoot.ownerDocument !== document)
    throw new AnimationCompileError("SVG_TARGET_INVALID","SVG capture must originate from the active document");
  // Stylesheet rules can affect underlying composition before/after an animation
  // and cannot be reconstructed by reading the *animated* computed style.
  if (document.styleSheets.length > 0 || document.querySelector("style,link[rel=stylesheet]"))
    throw new AnimationCompileError("LOWERING_UNSUPPORTED","External or document CSS stylesheet baseline requires style capture");
  if (!Array.isArray(animations) || !animations.length || animations.length > 1000)
    throw new AnimationCompileError("LIMIT_EXCEEDED","Expected 1..1000 native Animation objects");
  if (svgRoot.getAnimations({subtree:true}).some(animation=>!animations.includes(animation)))
    throw new AnimationCompileError("COMPOSITION_UNSUPPORTED","Uncaptured additional animation affects this SVG subtree");
  const targeted = new Set<string>();
  const tracks: TrackSource[]=[];
  for (const animation of animations) {
    if (typeof Animation === "undefined" || !(animation instanceof Animation))
      throw new AnimationCompileError("LOWERING_UNSUPPORTED","Capture inputs must be native Animation objects");
    const effect=animation.effect;
    if (typeof KeyframeEffect === "undefined" || !(effect instanceof KeyframeEffect))
      throw new AnimationCompileError("LOWERING_UNSUPPORTED","Only native KeyframeEffect is currently supported");
    const target=effect.target;
    if (!(target instanceof SVGElement) || !svgRoot.contains(target))
      throw new AnimationCompileError("SVG_TARGET_INVALID","KeyframeEffect must target a descendant SVGElement");
    if (!target.id || !/^[A-Za-z_][\w.:-]*$/.test(target.id))
      throw new AnimationCompileError("SVG_TARGET_INVALID","Target requires explicit unique XML-safe ID");
    if (svgRoot.querySelectorAll('[id="'+CSS.escape(target.id)+'"]').length!==1)
      throw new AnimationCompileError("SVG_TARGET_INVALID","Target ID must be unique within the root");
    if (animation.playbackRate !== 1 || animation.timeline !== document.timeline ||
      animation.pending)
      throw new AnimationCompileError("LOWERING_UNSUPPORTED","Capture requires settled playbackRate=1 on document timeline");
    if (effect.composite!=="replace" || effect.pseudoElement)
      throw new AnimationCompileError("COMPOSITION_UNSUPPORTED","Non-replace composite or pseudo-element effect unsupported");
    if ("iterationComposite" in effect && effect.iterationComposite!=="replace")
      throw new AnimationCompileError("COMPOSITION_UNSUPPORTED","Accumulating iterations unsupported");
    const raw=effect.getTiming();
    if (raw.duration!=="auto" && typeof raw.duration!=="number")
      throw new AnimationCompileError("TIMING_INVALID","Browser effect duration cannot be resolved to numeric milliseconds");
    const timing: TimingOptions = {
      delay:raw.delay??0, endDelay:raw.endDelay??0,
      direction:raw.direction??"normal", duration:raw.duration,
      easing:raw.easing??"linear", fill:raw.fill??"auto",
      iterationStart:raw.iterationStart??0, iterations:raw.iterations??1
    };
    const captured: SequenceKeyframe[] =[];
    for(const native of effect.getKeyframes()) {
      if (!Number.isFinite(native.computedOffset) ||
          native.computedOffset < 0 || native.computedOffset > 1)
        throw new AnimationCompileError("OFFSET_INVALID","Browser did not resolve a safe keyframe offset");
      if (native.composite && !VALID_COMPOSITE.has(native.composite))
        throw new AnimationCompileError("COMPOSITION_UNSUPPORTED","Add/accumulate keyframe composition unsupported");
      const frame: Record<string,number|string|null> = {
        offset: native.computedOffset,
        easing: native.easing || "linear"
      };
      let count=0;
      for(const [name,value] of Object.entries(native)) {
        if (META_KEYS.has(name)) continue;
        const mapped=PROPERTY_MAP[name];
        if (!mapped)
          throw new AnimationCompileError("PROPERTY_UNSUPPORTED","No browser capture proof for CSS property: "+name);
        if (!target.hasAttribute(mapped))
          throw new AnimationCompileError("LOWERING_UNSUPPORTED","Underlying SVG attribute baseline unresolved: "+mapped);
        const attrValue=target.getAttribute(mapped);
        if (!attrValue || mapped!=="transform" && !/^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/.test(attrValue))
          throw new AnimationCompileError("LOWERING_UNSUPPORTED","Non-numeric underlying baseline: "+mapped);
        if (mapped==="transform") {
          if (target.hasAttribute("transform-origin") || target.hasAttribute("transform-box"))
            throw new AnimationCompileError("LOWERING_UNSUPPORTED","Transform origin/reference box are unresolved");
          if (typeof value!=="string")
            throw new AnimationCompileError("PROPERTY_UNSUPPORTED","Transform values must be CSS transform strings");
        } else {
          const number=Number(value);
          if (!Number.isFinite(number) || number<0 || number>1)
            throw new AnimationCompileError("PROPERTY_UNSUPPORTED","Opacity value must be a finite number in [0,1]");
        }
        const owner=target.id+"\u0000"+mapped;
        if (targeted.has(owner) && !captured.some(x=>mapped in x))
          throw new AnimationCompileError("COMPOSITION_UNSUPPORTED","Overlapping effects require effect-stack compilation");
        frame[mapped]=mapped==="transform"?value as string:Number(value);
        count++;
      }
      if (!count) throw new AnimationCompileError("KEYFRAME_INVALID","Keyframe has no supported animated value");
      captured.push(frame as unknown as SequenceKeyframe);
    }
    if (!captured.length) throw new AnimationCompileError("KEYFRAME_INVALID","KeyframeEffect returned no keyframes");
    for (const property of Object.keys(captured[0]!)) {
      if (META_KEYS.has(property)) continue;
      targeted.add(target.id+"\u0000"+property);
    }
    tracks.push({target:{svgId:target.id},keyframes:captured,timing});
  }
  return {svg:svgRoot.outerHTML,tracks,options:{profile:options.profile??"svg-image",mode:"exact-only"}};
}
