# Compatibility & Lowering Proof Matrix 0001

**Purpose:** Decide whether one WAAPI semantic feature can compile to scriptless SVG exactly, with declared empirical approximation, or not at all. This is design research, not test results. Standards references in RFC 0001.

## Classification

- **Candidate exact**: mathematically equivalent subject to checked type/precondition and differential browser verification. Not an unconditional promise.
- **Candidate exact after symbolic expansion**: flatten a bounded effect timeline, finite and representable.
- **Approximation**: explicit opt-in, bounded by sampled quality *measurements* (not automatically a certified supremum).
- **Refusal**: neither exact nor quality-conforming declarative representation established.
- **Context-sensitive**: dependent on the SVG static base, CSS cascade, inherited styles, transform reference box, and browser profile.

| Feature | Native output candidate | Preconditions / proof obligation | Otherwise |
|---|---|---|---|
| Numeric `opacity`, `cx`, `cy`, `x`, `y` | `<animate>` | Units and baseline known; interpolation and fill agree | adaptive or refusal |
| CSS number/length | `<animate>` | explicit compatible unit, resolved percentage reference box | adaptive/refuse |
| Color | `<animate>` | CSS computed color normalization and interpolation color-space semantics match SVG | per-channel compatible color decomposition or refusal |
| One cubic Bézier | `keySplines` | x1,y1,x2,y2 each in [0,1], segment/keyTimes match | adaptive |
| CSS Bézier overshoot | none directly | SVG keySplines cannot encode out-of-range Y | adaptive |
| CSS `linear()` | more linear stops | exact stop math; preserve jumps/duplicate progress | adaptive |
| CSS `steps()` | discrete timing | all jump variants/endpoint ownership verified | adaptive/refuse |
| Spring / elastic JS evaluator | none exact in finite native nodes | needs closed representable function | adaptive |
| One native 2D translate | `animateTransform` | same coordinate space, reference box, origin, interpolation | adaptive |
| CSS `transform` list | transform animation / nested groups | preserve function list/order, path through rotation including 360° winding, origin | matrix/path sampled approximation |
| Individual translate + transform | nested groups / symbolic | proof correct multiplication order, no affected clipping/filter semantics | flatten composed geometry |
| `transform-origin` | static wrapper/matrix channels | time-varying origin expression and reference box correct | adaptive/refuse |
| SVG path morph `d` | `<animate attributeName="d">` | correspondence, same compatible command grammar, segment values | topology normalize then adaptive or refuse |
| Motion along curve | `<animateMotion>` | speed parameterization and path orientation agreement | geometry sampling |
| Stroke dash draw-on | `<animate stroke-dashoffset>` | dash lengths and pathLength style baseline resolved | adaptive/refuse |
| Gradient stop | `<animate>` on stop | isolated local gradient ID, semantics of shared references | clone defs, adaptive or refuse |
| SVG filters | animated filter primitive attributes | effect equivalence proven, no external refs | adaptive/refuse |
| CSS filter string | no general 1:1 mapping | filter graph construction equivalence | refuse in v1 |
| `fill:none/forwards/backwards/both` | SMIL fill/base snapshots | before/after active handling, underlying values, ordering | finite symbolic splitting |
| Delay/endDelay | `begin,dur` or schedule lowering | WAAPI phase transitions incl. negatives | finite flatten/refuse |
| Finite iteration count | `repeatCount` or expanded | fractional+iterationStart+fill parity | finite flatten/refuse |
| Infinite iteration | `repeatCount=indefinite` | entire cycle identical and seam semantics preserved | superperiod/refuse |
| Alternating direction | reversed keyframe list / doubled period | exact per-pass easing reversal and boundary ownership | expand/refuse |
| Add/accumulate | SMIL additive/accumulate | equivalent typed composition AND sandwich order, *not merely same strings* | effect-flatten/refuse |
| Concurrent replace | one composited output curve | correct priority/active/underlying over time | adaptive/refuse |
| `Element.animate()` keyframes | normalized IR | geometry is already SVG and target has stable ID | capture adapter |
| Live `Animation` instance | browser capture adapter | explicit reference time, playback rate, static baseline, effect/timeline | refuse ambiguous state |
| ScrollTimeline / view timelines | no self-contained time mapping | must define deterministic finite time warp | refuse |
| Dynamic JS function / event | no script in `svg-image` | can precompile known bounded timeline only | refuse |
| Tesseract/projected geometry | animated `d` or line channels | analytic input sampler, topology and projection defined, finite period | adaptive with seam lock |

## Proof obligation structure

Each lowering rule reports a typed certificate:
```ts
type Evidence =
  | { kind: 'structural'; rule: string; assumptions: string[] }
  | { kind: 'tested'; rule: string; browsers: string[]; corpusId: string }
  | { kind: 'measured-approximation'; thresholdPx: number; observedMaxPx: number; probeCount: number }
  | { kind: 'unsupported'; code: string; reason: string };
```

Rules must be monotonic: introducing an unsupported property or timing field must degrade exactness or fail; it must never silently disappear.

## Compiler pass proposal

```
parseSvg(input)                              // safe SVG/XML, ID and external refs
normalizeWaapiEffects(input.tracks)          // each property gets its own stops
resolveTargetAndBaseline(svg,effects)        // account for presentation attrs/CSS
compileTimingAndEffectExpressions(effects)  // phases, easing, fill and compositing
partitionIntoSemanticIntervals(expressions) // exact boundaries, t- / t+ owner
for each target+property+interval:
    tryExactNative()
    tryExactAlgebraicComposition()
    if explicitly adaptive:
        tryErrorControlledApproximation()
    else:
        reportUnsupported()
optimizeByProvenEquivalentRewrite()          // shared knots/groups only if safe
serializeDeterministicSvg()
validateSelfContainedSvgAndQuality()
return { svg, report }
```

The native emitter never uses the current browser clock for deterministic compile: the input includes an explicit time origin and end horizon.

## Ten adversarial red flags

1. WAAPI easing on keyframe **from** vs PresGen easing on destination (**to**) — shift correctly.
2. Effect-wide easing composition vs per-segment easing; cannot assume one `keySplines` list reproduces nested easing.
3. CSS `rotate(0deg) -> rotate(360deg)` is not a static identity effect; matrix endpoint equality loses winding.
4. Mixed `translateX` + `transform` may compose in different order from SVG element transform syntax.
5. CSS `cubic-bezier(0.5,1.8,0.5,-0.8)` is valid CSS but invalid as SVG `keySplines`.
6. Discontinuous infinite repeat loops must snap at the boundary, including t exact; cannot smooth away.
7. Contributing loops at 2.1s and 2.3s have 48.3s shared period at tenth-second resolution; multiple periods may exceed cap quickly.
8. Browser `getComputedStyle` observed while an animation is active includes that animation's contribution; it is not automatically the **underlying** base used by composition.
9. Shape morphing may be path syntactically compatible yet visually/topologically wrong through self-crossing; compare geometry and sign/orientation.
10. Exported SVG inside `<img>` has autonomous timing and disabled scripting; inline seek verification is not itself enough to certify `<img>` playback.

## Native-image validation design

Reference: a self-contained SVG root with native WAAPI effects applied in page to matching IDs. Control the reference clock by pausing all Animations and setting `currentTime` to known test instants. For *compiled* SVG, first inspect inline SVG's `setCurrentTime` for precise deterministic frames, then separately test exported SVG in `<img>` under real wall-clock loads; **do not claim** an image-element `setCurrentTime` API exists. Measure timing jitter and preloads in this latter profile.

Retain renderer differences as distinct results. Tests should not mask Chromium/Firefox/WebKit disagreement with broad tolerances. Native code generation should choose profile-specific substitutions only when backed by data.

## Reference research

- https://svgwg.org/specs/animations/
- https://www.w3.org/TR/web-animations-1/
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Keyframe_Formats
- https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/keySplines
- https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/keyTimes
- https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/calcMode
- https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image
