# Corpus 0001 — Preimplementation adversarial requirements

**Designed 2026-10-19. This is a REQUIREMENTS corpus, not passing test evidence.**

Every fixture has a contract and should eventually have a machine-readable sample with before/at/after boundary oracle expectations and source reference. P0 only defines cases; P1+ turns them into executable tests. Result labels distinguish structural equivalence from observed browser conformance. See WAAPI §4.5.5, §§4.8–4.10, SVG Animations Level 2.

| ID | Domain | Stimulus | Required behavior |
|---|---|---|---|
| T01 | timing | default linear: t=0,500,1000 | progress 0,.5,1 boundary-after with fill forwards |
| T02 | timing | start delay +250 fill none: 0,249,250,1249,1250 | null,null,0,.999,null |
| T03 | timing | start delay +250 fill backwards: 0,250 | 0,0 |
| T04 | timing | start delay +250 fill both: 0,1250,2000 | 0,1,1 |
| T05 | timing | negative delay -250: 0,249,750 | progress .25,.499, after boundary |
| T06 | timing | positive endDelay +500 | effect active duration unchanged, endTime extended |
| T07 | timing | negative endDelay -300 | after phase begins at trimmed boundary |
| T08 | timing | delay -100 and endDelay -900 | clamped zero endTime, no phantom active output |
| T09 | timing | duration zero and iterations 1 | zero-active endpoint obeys fill and phase |
| T10 | timing | iterations zero and duration 1000 | zero active duration, no spurious endpoint=1 |
| T11 | timing | duration Infinity iterations zero | active duration zero rather than NaN |
| T12 | timing | duration 0 iterations Infinity | active duration zero rather than NaN |
| T13 | timing | iterations 2 normal: 1000,2000 | at boundary progress 0 next iteration, final endpoint 1 |
| T14 | timing | iterations 2.5: 2500ms | terminal progress .5 |
| T15 | timing | iterationStart .25: 0,750 | progress .25 and 0 at wrap |
| T16 | timing | iterationStart 1.5, iterations .5 | terminal exact endpoint 1 and currentIteration 1 |
| T17 | timing | direction reverse: 0,1000 | progress 1 then 0 |
| T18 | timing | direction alternate: 0,1000,1500,2000 | forward first pass and reverse second |
| T19 | timing | direction alternate-reverse: 0,1000,1500,2000 | reverse first, forward second |
| T20 | timing | rate negative at transition | boundary ownership reverses; localTime mapping separately modeled |
| T21 | easing | linear outgoing property keyframe easing | segment [0,.5] easing attached to FROM keyframe |
| T22 | easing | cubic-bezier(0.42,0,0.58,1) | native spline candidate under direct linear-time mapping |
| T23 | easing | cubic-bezier(0.5,1.5,0.5,-.5) | valid CSS; reject native SVG keySplines |
| T24 | easing | steps(4,jump-start) | exact discontinuity sides; cannot naively interpolate |
| T25 | easing | steps(4,jump-end) | endpoint ownership including before flag |
| T26 | easing | steps(4,jump-none) | correct count and edge positions |
| T27 | easing | steps(4,jump-both) | correct leading/trailing jumps |
| T28 | easing | CSS linear() piecewise with plateaus | detect exact piecewise segments or refuse |
| T29 | easing | effect easing combined with keyframe easing | must not flatten as single keySplines without proof |
| T30 | normalization | omitted offsets 0,null,null,1 | computed 0,1/3,2/3,1 |
| T31 | normalization | omitted 0 and 1 endpoints | computed first 0 last 1 |
| T32 | normalization | duplicate offsets .5,.5 | discontinuity preserved; exact boundary special-case |
| T33 | normalization | decreasing specified offsets | reject with diagnostic |
| T34 | normalization | invalid offset -0.1 or 1.01 | reject with diagnostic |
| T35 | normalization | multiple properties with sparse keyframes | per-property normalization no nonexistent synthetic interpolation |
| T36 | normalization | property-indexed arrays of uneven length | per-property distributed offsets |
| T37 | normalization | one-keyframe effect | underlying neutral endpoint required; refuse without resolved base |
| T38 | normalization | per-keyframe composite add | do not silently treat as replace |
| T39 | lowering | circle cx linear, duration 1000 | candidate exact <animate> with SMIL repeat semantics |
| T40 | lowering | opacity with CSS stylesheet override | explicit baseline/cascade refusal |
| T41 | lowering | opacity animated, two independent targets | correct namespaces and target binding |
| T42 | lowering | fill none restores static attribute | SMIL fill remove mirrors property after phase |
| T43 | lowering | fill forwards persists terminal value | SMIL fill freeze after finite repeat |
| T44 | lowering | infinite normal repeat with seam discontinuity | preserve jump at boundary not smooth |
| T45 | lowering | alternate 2 iterations | explicit unsupported until direction folding proof |
| T46 | lowering | fractional iteration count | explicit unsupported until terminal progress proof |
| T47 | lowering | endDelay negative | explicit unsupported until exact phase sandwich proof |
| T48 | lowering | 2 concurrent effects same target/property | explicit unsupported until order composition proof |
| T49 | lowering | transform rotate(0deg) to rotate(360deg) | never optimize to static identity |
| T50 | lowering | SVG unsupported JS dynamic callback | refuse no JS in exported image |
| T51 | security | source contains DOCTYPE and ENTITY | refuse without entity expansion |
| T52 | security | source has script or onload handler | refuse before serialization |
| T53 | security | source external href or url(http) | refuse external resource |
| T54 | security | missing / duplicated IDs | target binding refusal |
| T55 | security | entity-escaped valid attributes | escape generated values once only |
| T56 | robustness | NaN, ±Infinity scalar values | explicit validation failure |
| T57 | robustness | very large keyframe count | bounded rejection not OOM |
| T58 | procedural | tesseract 16 vertices 32 edges | incidence plus math reference oracle |
| T59 | procedural | tesseract periodic seam 0=T | serialize same position exactly |
| T60 | profile | inline SVG vs <img> playback | measure separately; no assumed image seek |

## Mandatory gate

No case is counted as **passed** merely by being documented. CI must emit a count of implemented tests, skipped fixture IDs, and unsupported lowering cases. WAAPI browser oracle comparisons are separately gated from unit tests. Test exact t−,t,t+ where discontinuities exist. Maintain a red-list of failed differential fixtures.
