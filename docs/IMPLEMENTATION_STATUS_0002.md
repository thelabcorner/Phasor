# Engineering status 0002 — First executable semantic core and native-SVG lowering

**Date:** 2026-10-19. The initial RFC and plan preserve their original planning-only timestamps; implementation proceeded after user approval.

## Code delivered

- `src/timing.ts`: phase, endDelay, fill, iterationStart/count, terminal ownership, reverse parity, transformed progress oracle.
- `src/easing.ts`: CSS linear/Bézier/steps parsing; cubic X inversion, before flag, legal native spline eligibility.
- `src/waapi/normalize.ts`: computed offsets, property-sparse value isolation, explicit composite ownership, conservative property-indexed subset.
- `src/compile.ts`: DOM-free-input exact scalar compiler, namespace-aware SVG parser, no scripting, explicit target ID lookup, XML serialization, typed diagnostics, fail-closed lowering, source/reference safety gate.
- `test/*.test.mjs`: 50 self-contained Node unit tests, 0 failures, 0 skips after the final validation hardening.
- `tools/*.mjs`: browser-oracle probes (paused WAAPI vs paused/seeked inline SMIL), actual `<img>` rendered-pixel test, seeded differential campaign, targeted seam investigation, source-size/throughput benchmark.
- `src/browser/capture.ts`: native `Animation` / `KeyframeEffect` capture for opacity channels with explicit SVG baselines, document timeline, replace composition and strict stylesheet/overlap refusals. Exported separately via `waapi-to-svg/browser`. Imports without a DOM at module initialization.

## Actual browser evidence

- Initial six-fixture Chromium differential: linear, spline, two passes, fill remove, infinite repeat, opacity; all at ≤0.000107 px measured position error or ≤1.3e-8 opacity error.
- Updated seven-fixture Chromium differential adds positive delay, also within the 0.1 tolerance.
- Deterministic 80-fixture randomized differential (seed 132479505), *original* 1505 probes: six **failed** near the finite repeat terminal boundary, all at time `endTime-0.001 ms`. Worst error ≈69.99649px due different phase boundary ownership. These failures remain recorded in `evidence/chromium-seeded-differential-0001.json`. **Do not count original as passing.**
- Targeted `tools/chromium-seam-probe.mjs` confirmed in Chromium that WAAPI computed progress became null at local time 399.999 ms, while SVG `setCurrentTime` still reported ~0.399998 seconds with the animated value. At 400 ms both returned the base value. This is an observed sub-millisecond engine discrepancy; whether it is spec-permitted needs separate investigation, not an assertion of full equivalence.
- Revised 80-fixture campaign uses exact boundaries and conservative ≥1ms neighboring probes. 1425 probes; zero failures; maximum position error 0.00592041015625px. Stored as `evidence/chromium-seeded-differential-0002.json`. **This is qualified evidence, not replacement for the original failures.**
- SVG image playback: embedded generated SVG as a data-URL `<img>`, detected painted circle centroid movement in successive screenshots, and verified terminal `fill=freeze`. Timings include screenshot rendering delay and should not be interpreted as exact animation frames. Raw `evidence/chromium-svg-image-playback-0001.json`.
- Native capture round trip: real Chromium `circle.animate([{opacity:1,easing:'ease-in-out'},{opacity:0}], {duration:1000,iterations:2,fill:'forwards'})` captured using browser `effect.getKeyframes()` / `getTiming()`, compiled in Node, and compared at 11 controlled times; worst observed opacity error `1.686e-8`. `evidence/chromium-native-capture-0001.json`. Eight browser negative tests for unsupported conditions all passed and are retained in `evidence/chromium-capture-refusals-0001.json`.

## Benchmark results — Windows, Node 24.21.0, Ryzen 9 5900X

Cold/warm mixed, 3–7 runs each; medians in milliseconds. Generated fixtures share authored keyframe descriptor identity across targets. No explicit GC control; repeat controlled benchmarks before publishing performance guarantees.

| Targets × keyframes | Baseline DOM getElementById | Indexed target map | Indexed + per-compile authored-effect interning |
|---|---:|---:|---:|
| 1 × 2 | 0.2645 | 0.3993 | 0.2637 |
| 10 × 2 | 0.6131 | 0.8377 | 0.5323 |
| 100 × 2 | 3.8133 | 4.9343 | 4.0295 |
| 1000 × 2 | 59.3632 | 29.4167 | 19.9515 |
| 1000 × 10 | 63.8061 | 33.4496 | 21.5471 |
| 1000 × 100 | 121.4467 | 101.1406 | 48.2405 |

For the 1000 × 100 shared-descriptor benchmark, interning reaches ~2.52× the original median throughput. Different authored keyframe identities will not obtain the same interning gain. These are measurements, not universal speedups; output size unchanged for each case.

An explicit *distinct-keyframe-object* follow-up (`evidence/benchmark-distinct-0004.json`) measured 1000 × 100 at **88.6118ms** median, 1000 × 10 at **27.6056ms** and 1000 × 2 at **23.6553ms**. This demonstrates that shared-object identity materially influences the interning benchmark; the 48.24ms case is not a representative performance estimate for all workloads.

## Explicit nonclaims and engineering gates

- Native capture is **only** a narrow opacity proof-of-concept, not general WAAPI capture or full CSS baseline resolution.
- No cross-browser Firefox/WebKit/Edge differential results yet.
- No certified worst-case error bounds, adaptive sampling, transforms, path morphing, overlapped property stacks, PresGen adapter, or tesseract code.
- Unsupported input features intentionally refuse, including negative delay, complex fill, alternate direction, noninteger iterations, composite/add and computed CSS inheritance.
- No tested claim about security of every possible XML/SVG feature. Current source restriction is conservative and should be threat-modeled further.

## Immediate next proof obligations

1. Expand Chromium seam investigation into precision classification and preserve original red controls.
2. Add standards-based independent browser oracle results from Firefox/WebKit; confirm `<img>` and inline are not conflated.
3. Build browser capture adapter and computed-style baseline resolver *without* contaminating the browser-independent core.
4. Implement mathematically exact native transform and iteration/direction normalization only once test-driven proofs exist.
5. Run same benchmarks with distinct authored keyframe objects and memory profiler to prevent inflated shared-identity optimization claims.
