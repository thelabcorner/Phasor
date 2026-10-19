# Plan 0001 — Research → Proof Obligations → Compiler Build

**Status:** planning-only baseline, 2026-10-18. **No runtime source code yet.**
**Canonical independent project:** `/webstormprojects/waapi-to-svg`
**Companion architecture:** `docs/ARCHITECTURE_RFC_0001.md`

## Acceptance contract

A self-contained SVG loaded as an image must reproduce the source SVG+WAAPI animation in a declared browser/profile and a declared time domain, without JS in the exported file. The tool must return `exact`, `measured-approximation`, or `unsupported` *per property/effect*, never mislabel one as another.

For "exact" distinguish (A) **mathematically specified equivalent** under explicit preconditions, (B) **cross-engine empirically verified** for known fixtures. The compiler may label a rule structurally exact without claiming universal browser-fidelity if the runtime disagrees.

No separate animated-HTML-to-SVG compiler. No copy/paste from PresGen. No top-level dependency on browser globals in core.

## Phase P0 — Research and oracle contracts (BEFORE IMPLEMENTATION)

**Inputs**: PresGen source audit, WAAPI Level 1/2 timing and compositing, SVG Animations Level 2, SVG image-context portability restrictions, WPT fixtures, modern browsers and representative exports.

Deliverables:
- RFC 0001 and this plan; compatibility matrix (native / transform-normalized / adaptive / unsupported).
- Versioned test corpus with 40+ *designed* adversarial fixtures and expected semantics (not only examples that happen to pass).
- Plain-language mathematical oracle: local time, active phase, current iteration, directed progress, eased progress, fill and composition.
- WPT-based property probe design: browser SVG in `<img>`, inline SVG, CSS background, SVG document; no assumed symmetry.
- Existing package/prior-art audit: SVGator, flubber, browser SMIL, PresGen evaluators (note third-party licensing).
- Go/no-go review identifying what exact means; initial subset limited to SVG scalar attributes, opacity, simple colors and elementary 2D transforms.

**Gate P0:** all requirements explicit; every unsupported feature has a defined refusal. Absolutely no implementation source at P0.

## Phase P1 — Headless typed core + canonical IR

Build modules only after Gate P0:
- `packages/core/src/waapi/normalize.ts`: standards-aligned authored keyframe normalizer (property-indexed and sequence forms).
- `packages/core/src/timing/{model,intervals}.ts`: phase/direction/iteration/fill/two-sided-boundary evaluator.
- `packages/core/src/values/{scalar,color,transform,path}.ts`: property type registry and equivalence gates; start with scalar.
- `packages/core/src/ir/{scene,effects,temporal}.ts`: typed immutable IR, no DOM type requirements in emitted JS.
- `packages/core/src/diagnostics.ts`: machine-readable diagnostics; strict finite/unsupported handling.

Tests: reference oracle for all timing controls; randomly generated validated effects; independently implemented small fixtures; property-based invariants (offset monotonicity, loop seam, reverse parity, composition consistency). No SMIL emission until timing oracle passes.

**Gate P1:** oracle tests green, documented behavior for all WAAPI timing fields, no implicit dropping of unsupported fields.

## Phase P2 — Exact SVG compiler

Modules:
- `packages/core/src/svg/{parse,ids,serialize,validate}.ts`
- `packages/core/src/lower/{numeric,discrete,transform,motion,compose}.ts`
- `packages/core/src/compile.ts`

Emit: `<animate>`, `<set>`, elementary `<animateTransform>` after proof; preserve base SVG. Validate generated XML, external references, xmlns/href, ID uniqueness, and target styles.

**Gate P2:** conservative exact-only API works both in Node and browser and builds SVG that functions in Chrome, Firefox, WebKit `<img>`; at least one fixture each for ordinary linear, compatible spline, discrete event, finite repeat, infinite repeat, fill, direction and independent channels. Anything outside exact subset refuses with a typed error/report.

## Phase P3 — Browser capture, computed style and composition

Browser adapter (`packages/browser`) obtains `getKeyframes()`, `getTiming()`, `getComputedTiming()`, target binding, reference boxes, style baseline and inherited CSS (with explicit unresolved markers). Do not confuse current live animation play-state with reusable authored timeline.

Add event sweep and owner resolution for overlapping WAAPI effects, underlying/base interactions, fill and additive. Transform matrix/order/origin correctness must precede aggressive optimizations. Compile compatible `linear()` piecewise exactly when possible.

**Gate P3:** property-level result agrees with the browser reference for adversarial overlaps and transforms at semantic boundaries and representative interior samples; failures are reported rather than fudged.

## Phase P4 — Adaptive approximation (explicit opt-in)

Implement:
- boundary locked partition / edge sampling;
- interval subdivision with priority queue and multiple probes;
- shared temporal knot tables for multi-element scientific animation;
- residual tolerance reporting (measured vs certified);
- output caps, fallback/refusal and cost-based lowering.

Test adversarial easings: spring/elastic, bezier Y overshoot, steps jump-start/jump-end/jump-none/jump-both, CSS `linear()`, zero/duplicate offsets, near-tangent curves, high-frequency ripple, discontinuous repeat seams.

**Gate P4:** compared to dense uniform 10ms and 16.67ms baselines, yield Pareto data for bytes, max observed geometry error, compile throughput and Chrome playback cost; no predetermined speedup claims. Enforce error budget as a failure threshold.

## Phase P5 — Independent PresGen adapter

Only optional adapter module; load PresGen authored tracks through public DTOs (avoid importing PresGen runtime). Preserve:
- keyframe time in seconds and **destination easing ownership**;
- dwell, arrivalLag, repeatGap, turnaroundGap, gapHoldMode, direction/fill, fractional/infinite only insofar as actual PresGen semantics;
- XY motion handles and timing; 3D camera/projected motion;
- base rotation/transform TRSO composition and root/content/SVG drawing target routing.

Use PresGen's schedule evaluator as comparative oracle under tests, not the compiled library dependency. Advanced timing may lower as finite composed curve or retained safe loop; report unsupported case otherwise.

**Gate P5:** fixture parity vs PresGen evaluators at every dwell/gap/turnaround boundary and across multiple iterations including before/after.

## Phase P6 — Procedural 4D tesseract stress suite

Implement *optional* `packages/procedural` with deterministic analytic sampler (no generic arbitrary JS executed in export).
- 16 vertices, 32 edges, XW rotation, perspective projection.
- Move through line → square → plane → cube → tesseract construction and hold/transition phases as separate example.
- Compare per-line 4-channel SMIL vs single `<path d>` vs shared temporal lattice.
- Validate source motion, 4D topology, projection singularity policy, smooth-handoff exact serialized endpoints, and loop behavior.
- Experiment with periodicity reductions and geometric symmetries: **never** collapse independent edges or change perspective for byte savings.

**Gate P6:** all topological incidences correct, seam at t0=tT exactly, no invalid SVG numeric values, measured visual quality vs 4D oracle, empirical size/performance Pareto report.

## Phase P7 — Performance, conformance and release

- Build both ESM and CJS only if there is a demonstrable compatibility need; otherwise ESM first with declarations and explicit export map.
- Strict TypeScript, reproducible build, browser/headless entrypoints, no accidental DOM requirements.
- `pnpm`/npm optional examples; package-manager-neutral library behavior.
- Browser comparison on current Chromium/Firefox/WebKit and, separately, vector-editing applications without falsely claiming those support SMIL.
- Cross-origin/reference security, XML billion-laughs protection, CSS url refs, clipping/masking/filter interactions, invalid/huge input memory bounds.
- Real dataset benchmark: 1, 10, 100, 1,000 targets; 2, 10, 100, 1,000 keyframes; durations up to long/infinite; repeated style and transform cases.
- Preserve set of failing adversarial controls (never delete to improve percentage).

**Gate P7:** published compatibility chart, CI reference snapshots, benchmark numbers with environment metadata, README examples, release changelog; no claims beyond measured domain.

## Priority attack list (frontier)

**Correctness first:**
1. WAAPI `KeyframeEffect` normalization, nonuniform omitted offsets, effect-level vs per-keyframe easing.
2. Deep timing: phase boundaries, endDelay, iterationStart, fractional loop, direction parity.
3. SMIL prior/after fill and overlapping effect composition, especially transforms.
4. Exact CSS/SVG transform-origin and length/unit semantics.
5. Infinite-loop expressibility and cap/overflow decisions.

**Efficiency:**
6. Preserve mathematical segments; do not blanket sample at a fixed FPS.
7. Shared easing and shared knot lattices, shape-preserving piecewise compression.
8. Cost model deciding one large animated `d` vs many small attribute channels.
9. Native wrapping/factorization only when SVG compositing semantics remain invariant.
10. Test compact SMIL parse/per-frame cost, not just serialized bytes.

## Adversarial matrix checklist

| Dimension | Inputs expected |
|---|---|
| Easing | linear, cubic-bezier in-range, overshooting Y, steps variants, CSS linear(), nonlinear effect easing |
| Keyframes | 0/1/many, duplicates, null offsets, missing endpoints/properties, unsorted offsets |
| Timing | negative/positive delay, endDelay, zero duration, iterationStart, fractional/∞ iterations |
| Direction | normal/reverse/alternate/alternate-reverse; negative playback rate |
| Fill | none/forwards/backwards/both; before/after active |
| Composition | replace/add/accumulate; same property overlaps; multiple targets |
| Geometry | scalar, mixed units, lengths %, transform list, origin, reference box, path morph, paint colors |
| SVG | defs/use, local href, gradients, filters, masks, clipping, nested viewBox, duplicate IDs |
| Loop | continuous/discontinuous seam, co-prime periods, noncommensurate periods, huge LCM |
| Runtime | Chromium/Firefox/WebKit; inline SVG, document, `<img>` |
| Robustness | NaN/Infinity, negative sizes, pathological XML, too many keyframes, missing target |

At each detected discontinuity sample t-ε, t, t+ε with ε chosen based on timeline quantum, *as tests only*. The compiler itself must represent exact temporal ownership instead of smearing boundaries with arbitrarily tiny epsilon.

## Benchmark / evidence protocol

Preserve raw data and hardware:
```
runId,engine,engineVersion,device,fixture,targets,inputKeyframes,
outputKeyframes,outputBytes,compileMs,peakMemoryBytes,svgParseMs,
meanPlaybackCPUms,maxObservedPositionErrorPx,maxObservedRasterError,
referenceMethod,qualityGatePassed
```
Also report native-exact fraction, adaptive fraction, explicit refusal fraction. Track failures by class. Use randomized test seed and commit hash. No invented baseline.

## Research references

- WAAPI: https://www.w3.org/TR/web-animations-1/
- WAAPI 2: https://www.w3.org/TR/web-animations-2/
- SVG animations: https://svgwg.org/specs/animations/
- MDN SVG keySplines: https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/keySplines
- MDN image-context restrictions: https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image
- MDN WAAPI keyframes: https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Keyframe_Formats
- WPT repository: https://github.com/web-platform-tests/wpt/tree/master/svg/animations
- Chromium timing notes: https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/animation/README.md
- PresGen core: `/webstormprojects/presGEN_v2/client/src/components/ui/canvas/tools/animation`

## Planning-skill availability

The user requested the "code planning" skill. A matching installed skill was not discovered in available skill registries or project skills. This document uses explicit gated, test-first compiler planning as a fallback; do not pretend an unavailable named skill was executed.
