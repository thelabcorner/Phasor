# RFC 0001 — Standalone WAAPI-to-SVG Declarative Animation Compiler

**Date:** 2026-10-18
**Status:** Research / design only — NO implementation authorized by this RFC.
**Provisional package name:** `waapi-to-svg` (rename freely before publishing).
**Target:** Strictly independent TypeScript library; optional PresGen adapter. The PresGen repository must not become a runtime dependency.

## 1. Problem and scope

Compile **existing SVG graphics animated by WAAPI keyframes/effects** into self-contained SVG carrying declarative animation (primarily SMIL `<animate>`, `<animateTransform>`, `<animateMotion>`, `<set>`). The output must animate without JavaScript, fetches, external styles, or access to its original DOM.

Not equivalent to general HTML-to-SVG, raster video export, procedural JS execution inside SVG, or capture of interactive page behavior. None are implied by accepting WAAPI keyframes. The primary product is a *compiler*, not a player.

Guarantee two separate properties:
- **structural:** valid, standalone, safe SVG/XML with stable identifiers, namespaces and internally resolved references;
- **semantic:** agreement with a precisely identified WAAPI reference for a target, timeline, style baseline, and explicitly supported properties.

A compile must never imply exactness when approximation, missing target geometry, computed-style ambiguity, unsupported timing, or unsupported composition remains.

## 2. Inputs and proposed API

```ts
type SvgSource = string; // parsed with a safe namespace-aware XML/SVG parser
interface TrackSource {
  target: { svgId: string };
  keyframes: PropertyIndexedKeyframes | Keyframe[];
  timing: KeyframeEffectOptions;
  // Optional explicit browser-authored play state; when absent, begin at t=0.
  playback?: { playbackRate?: number; startOffsetMs?: number };
}
interface CompileRequest {
  svg: SvgSource;
  tracks: TrackSource[];
  options?: {
    profile?: 'svg-image' | 'svg-document';
    mode?: 'exact-only' | 'adaptive';
    maxErrorPx?: number;
    maxBytes?: number;
    maxKeyframes?: number;
    maxSupercycleMs?: number;
    maxDurationMs?: number;
  };
}
interface CompileResult {
  svg: string;
  report: {
    status: 'exact' | 'measured-approximation' | 'unsupported';
    effects: Array<{ target: string; property: string; lowering: string; status: string; issues: string[] }>;
    warnings: string[];
    estimatedErrorPx?: number; // NEVER present as proved bound when only sampled
    bytes: number;
  };
}
declare function compileSvgAnimation(input: CompileRequest): CompileResult;
// Browser-only convenience: harvest keyframes/timing from Animation/KeyframeEffect
// PLUS original SVG geometry and computed-style baseline. No DOM-free promise.
declare function captureWaapiAnimations(svgRoot: SVGSVGElement, animations: Animation[]): CompileRequest;
```

The API is *proposed*, not implemented; final names are subject to contract review. Use strict, deep input validation and normalize property-indexed keyframe lists, null/omitted offsets, omitted properties, per-keyframe easing/composite. Native runtime `Animation` inspection is a convenience input, not the authoritative source for nondeterministic behavior. Explicit authored input is the headless/Node pathway. Do not require a DOM, WAAPI, React, PresGen, Canvas, Playwright, or WebGPU in the compiler core.

## 3. Canonical IR

```
SVG scene / IDs / static style snapshot
  ↘ target bindings (node ID, property, reference box, origin, inherited baseline)
WAAPI effect descriptors → normalized per-property keyframe sequences
  → timing IR (delay, endDelay, duration, iterationStart/count, direction, fill,
              easing, playbackRate, active interval, exact phase boundaries)
  → value IR (typed scalar, length/unit, color+space, transform matrices,
              path commands, discrete strings, filter/gradient subchannels)
  → temporal expression DAG (piecewise progress, composition order, underlying)
  → proof-obligation-based lowering selector
       1 native exact SMIL
       2 algebraically simplified exact SMIL
       3 adaptive bounded-approximation SMIL
       4 explicit diagnostic/refusal
  → SVG serializer and self-containment validator
  → reference/differential test report
```

Key point: WAAPI has timing *and* effect easing; per-keyframe easing controls outgoing intervals. PresGen stores easing on the **destination** keyframe. Adapter MUST shift easing ownership when converting.

Separate author-time and presentation-time representations. Boundary identity should use integer ticks or rational microseconds, not raw floating-point Set membership. Carry two-sided state at discontinuities (t− and t+) with declared ownership rather than smearing with artificial epsilon keyframes.

## 4. Exact native lowering

Candidates, subject to exact specification/browser validation:
- Numeric / compatible units / opacity / compatible path numbers: `<animate values=... keyTimes=... calcMode=linear>`.
- Supported CSS cubic Bézier intervals where all `keySplines` coordinates are in [0,1]: `calcMode=spline` with segment-specific `keySplines`; incompatible CSS overshoot curves cannot lower exactly to keySplines.
- Compatible 2D translate, scale, rotation, skew: `<animateTransform>` **only after** proof of equivalent transform origin, reference box, matrix order, and interpolation.
- Supported motion path: `<animateMotion>` when its path parameterization/orientation and pacing equal WAAPI semantics; SVG motion default is paced rather than linear.
- Discrete changes: `<set>` or discrete `<animate>` when exact boundary behavior is proven.
- Simple finite/infinite loops: native SMIL repeat when per-iteration and fill behavior match exactly.
- Piecewise CSS `linear()`: compile to additional linear knots when monotonic timing and jumps are handled exactly.
- SMIL `additive` and `accumulate` are **not** drop-in equivalents for WAAPI `composite:add|accumulate`; permit only typed, ordering-proven mappings.

Critical corner cases: duplicate offsets, steps jump variants, one-keyframe effects, CSS `auto` and computed/interpolated values, missing endpoints, underlying values, fill before/after, iterationStart/fractional iterations, zero duration, positive/negative endDelay, negative playback rate, property priority, multiple effects on one element, `transform-origin`, filter/gradient references, clip/mask coordinate systems, and inherited presentation attributes.

Avoid automatic transform-to-`<g>` wrapping unless a static scene proof shows that grouping preserves clip/mask/filter/stroke/paint-order/rendering semantics. Independent nested group transforms can be an excellent *certified fast path*, not a blanket rewrite.

## 5. Arbitrary finite timelines: effect sandwich normalization

WAAPI and SVG's SMIL sandwich are different composition models. Define one reference effect-stack evaluator:
- Build the event/boundary partition from all effect phase transitions and keyframe/step boundaries.
- At each open interval determine active effects, compositing order, underlying base, and interpolation forms.
- Where math admits an exact closed expression, emit the resulting property curve directly (one owner per output channel) rather than trusting cross-runtime animation priority.
- Where no exact lowering exists, adaptively approximate the *fully composed visible property*.
- At boundaries encode correct left/right state or explain a failed representation. Include before-fill and after-fill transitions.

O(n log n) boundary/event sorting with per-property partitioning is a starting point, not a proved final complexity bound; do not evaluate a global frame grid by default.

## 6. Infinite loops and static SVG restriction

Exact independent infinite loops can use separate native SMIL effects when properties are independent and composition is safe. Otherwise find a common superperiod only if:
- all contributing timing periods are finite, commensurate and exactly representable under a fixed tick unit;
- the period, keyframe count and output bytes remain under configured caps;
- the value function matches across superperiod seams (including derivatives when desired, but exact value equality is mandatory).

A large LCM/hyperperiod, quasiperiodic signals, time-varying JS, scroll timelines and arbitrary interactive triggers MUST NOT silently become an inaccurate infinite export. Report `unsupported` or offer explicitly finite export. Never assume all infinite animation can be compressed to one fixed duration.

## 7. Adaptive lowering

Approximation is opt-in and identifiable in the report. First preserve every semantic boundary. Then approximate only on smooth open intervals with a priority-queue / max-residual subdivision, including 1/6,1/3,1/2,2/3,5/6 probes plus adversarial probes when detected.

Error classes:
- Numeric absolute / relative units (after reference-box resolution).
- 2D transform: maximum transformed-pixel distance on conservative geometry controls, including bounds and paths where necessary; matrix coefficient error alone is insufficient.
- Color: explicitly chosen color-space metric (CSS color interpolation may not match SVG default).
- Path: topological correspondence, sampled point-to-curve distance, geometry envelope; raster/ink probes supplementary.
- Loop closure: position exactness at seam and derivative continuity measured separately.
- Visible raster: screenshot RMS/SSIM and worst-pixel delta on controlled fixtures.

Sampling-based probes are **empirical** bounds, not proofs of global supremum. A certified mathematical bound requires derivatives/Lipschitz enclosures, interval arithmetic or known polynomial bounds; label it accurately. If max budget reached before error threshold, FAIL the requested quality, do not relabel as successful.

Use scalar and multi-channel shared-knot strategies as alternative Pareto candidates. A compressed path may have fewer elements but more serialized data; record byte count, parse time, and browser rendering work rather than optimizing knot count alone.

## 8. Procedural mathematical / tesseract extension

Previous 4D study: 16 vertices, 32 edges, X–W 4D plane rotation, perspective factor `k = D/(D-w')` with `D=3`; prior smooth-handoff SVG aimed at mathematically closed loops. Retain exact source geometry and evaluators in an optional procedural authoring extension; this is NOT ordinary WAAPI `KeyframeEffect`.

For vertex `v=(x,y,z,w)`, define projected vertex at t from `R_XW(theta(t))v`, apply perspective and camera, then generate edge geometry. Compare:
1. one animated `<path d>` with canonical M/L command structure for all edges;
2. 32 lines with grouped x1/y1/x2/y2 attribute tracks;
3. reusable subgeometry / grouped transforms where exact factorization exists.

All three preserve 16 vertices and 32 edge incidences; force canonical t0 and t=T values to serialize exactly equal for looping. Optimize a single mesh-level shared time lattice before per-edge expansion. Preserve authored projection perspective, do not substitute an approximate 3D rotation. Include exact corner cases when `D-w'` approaches zero/negative: clip or explicit unsupported rather than emitting infinities.

## 9. Export profiles and security

`svg-image`: no scripts, external files, remote font or image dependencies, event-dependent starts, `foreignObject`, or unsupported runtime-only resources. Inline safe assets with size caps; deterministically namespace IDs; rewrite every internal `url(#id)`, href, style and animation reference as required. Fail closed on unresolved external refs. SVG/XML entity expansion must be disabled in parser. Avoid interpreting source or CSS via eval.

`svg-document`: may support richer SVG-native document interactions, but no required JS in core deliverable; any profile-specific behavior is reported.

Preserve viewBox, static geometry, gradients, filters, defs and namespaces unless a proven compatible transformation requires changes. Serialize deterministically (stable ordering, precision policy, no random IDs), suitable for hashing and reproducible builds.

## 10. Performance architecture

- Browser-independent core; typed arrays for large numeric channels; per-target/property string interning/normalization.
- Compile once; no ongoing JS animation loop in export.
- Segment lookup by indexed boundaries; keep sparsity and temporal coherence.
- Deduplicate identical timing / easing / value curves; share lookup tables within compiler.
- Cost-based choice among `animate`, `animateTransform`, `animateMotion`, path-`d`, nested grouping and discrete states.
- Output Pareto optimization: bytes, compile latency, peak memory, SVG parse cost, seek cost, playback CPU, and visual error. Never call something a breakthrough without measured baselines.

## 11. Sources / evidence

- Live PresGen `presGEN_v2` inspected on 2026-10-18:
  - `client/src/types/index.ts` AnimationTrack/Keyframe (keyframes carry dwell, arrivalLag, motion handles; tracks carry repeatGap, turnaroundGap, gapHoldMode, camera metadata);
  - `client/src/components/ui/canvas/tools/animation/timing/schedule.ts` deterministic phase/pass compilation;
  - `.../trackEvaluation.ts` compiled typed-array evaluation and per-instance segment hints;
  - `.../webAnimationController/controller.ts` exact native vs baked vs windowed strategies, paused WAAPI seek;
  - `.../webAnimationController/sampling/{bspc,adaptive}.ts` boundary-aware adaptive sampling;
  - `.../webAnimationController/keyframes/{property,transform,splitNativeTranslate}.ts` WAAPI emission and conservative native-routing gates.
- Standards: https://www.w3.org/TR/web-animations-1/ ; https://www.w3.org/TR/web-animations-2/ ; https://svgwg.org/specs/animations/ ; https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image ; https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/keySplines
- Market / prior techniques: SVGator CSS/JS-only export and its restrictions; flubber path morph interpolation. This project is differentiated by **standalone WAAPI semantic input, programmatic compiled SMIL, transparent exactness/approximation reports and correctness-first performance**, not by a claim that declarative SVG animation or shape interpolation is novel.

## 12. Explicit design decisions required prior to code

1. Default compilation must be `exact-only` for first MVP; enable approximation only with explicit user option and clear manifest.
2. Primary geometry is SVG-to-SVG. Generic HTML-to-SVG conversion is deferred.
3. The compiler accepts deterministic authored descriptors in Node/headless; optional browser capture reads native WAAPI.
4. No required JS in compiled SVG. Browser use through `<img>` is the portability baseline.
5. PresGen adaptation is a separate package and semantic translation layer, not a direct source-code copy.
6. Failure to prove property/timing composability is grounds to refuse, not silently drop fields.
7. No runtime package code before acceptance tests and phase gates are written and agreed.
