# Engineering status 0003: native transform/direction fidelity and procedural geometry

**Date:** 2026-10-19. **Project:** Phasor. **Status:** experimental open-source TypeScript compiler; not general-WAAPI compatible or cross-browser certified.

This file supersedes status 0002 for the current working state. It does not overwrite earlier documents or replace the earlier failing controls.

## Implemented code and observable behavior

- `src/compile.ts`: existing namespace-aware SVG parser, target-resolution map and conservative scalar native `<animate>` emitter extended with native `<animateTransform>` (single-function translate/scale/rotate); direction-aware curve lowering; eligible negative begin offsets; content-local interning of shared easing and directed curves. The compiler still refuses unresolved source CSS, duplicated IDs, unsupported composition, transform stacks/reference-box/origin overrides, fully expired pre-zero negative-delay effects, and unsupported easing.
- `src/transform.ts`: strict CSS transform syntax and SVG transform-base validators. Emits component values directly to `<animateTransform>` only after eligible shape checking. Preserves full 360° winding; never equates endpoints by matrix identity.
- `src/direction.ts`: reverse spline mirroring; alternate and alternate-reverse as 2-pass cycles; odd finite counts lower to fractional **SMIL repeatCount**, not fractional authored WAAPI iterations. Explicit bounds and serialized knot count accounting. Normal direction has a zero-reparse identity path.
- `src/browser/capture.ts`: opacity + eligible single-function transforms from actual native `Animation` and `KeyframeEffect`; fails closed on CSS baselines, additional animations, unsupported composite, non-document timelines and non-unit playback rate. Captured effect is reauthored from t=0 (not a live playhead snapshot).
- `src/procedural/tesseract.ts`: optional independent 4D mesh geometry oracle: 16 vertices, 32 edges, 4D X–W rotation followed by 4D/3D perspective projection. Emits one SVG animated `d` path with shared-vertex knot lattice and exact serialized 0=T seam. Compares an adaptive heap-based candidate and a bounded uniform alternative using common sampled geometric tolerance; chooses smaller SVG. Includes quantization allowance, max-keyframe and max-byte guards. This is **not** implicit WAAPI semantics.
- `test/*.test.mjs`: **75 local tests passed** after the README release preparation and custom-period tesseract regression test, zero failures and zero skips.

## Chromium differential evidence

| Campaign | Observed outcome | Evidence file |
|---|---|---|
| Original 80-fixture randomized scalar corpus, 1,505 probes | **6 failures** at sub-millisecond finite-repeat terminal edges; do not claim passed | `chromium-seeded-differential-0001.json` |
| Revised 80-fixture scalar corpus, 1,425 probes | zero failures; max measured 0.0059204 px; exact endpoints retained, ≥1ms adjacent probes | `chromium-seeded-differential-0002.json` |
| 10 transform fixtures (translate, rotate, scale, direction combinations) | zero failures; worst max geometry residual 0.0007038 px | `chromium-transform-differential-0001.json` |
| 9 directed scalar fixtures | zero failures; max residual 0.0005036 px | `chromium-direction-differential-0001.json` |
| Native captured translate/scale/360° rotation | 3 scenarios × 12 times; max residual 0.0006753 px | `chromium-native-transform-capture-0001.json` |
| Negative start delay | 5 eligible scenarios passed, 2 fully expired scenarios refused | `chromium-negative-delay-differential-0002.json` |
| Original unsafe negative-delay trial | exposed pre-zero `fill:forwards` frozen-value loss in SVG; retained | `chromium-negative-delay-probe-0001.json` |

These are controlled Chromium conditions, not a proof of universal browser parity. Firefox was installed but the unpatched Firefox executable failed Playwright's required Juggler protocol. Edge launch also failed in this environment; no claim of cross-engine verification. Inline SVG precise seeking and autonomous `<img>` playback were tested separately.

## Performance: distinguish shared versus distinct authorship

Node v24.21.0, Windows, AMD Ryzen 9 5900X. 3–7 cold/warm mixed runs, no explicit GC control. The script preserves raw measurements under `evidence/benchmark-*.json`.

| Workload | Before optimization | After | Qualification |
|---|---:|---:|---|
| 1,000 elements × 100 keyframes, normal motion, shared descriptor | 72.99 ms after introducing direction processing | 43.55 ms with normal-direction identity fast path | Prevented a regression |
| 1,000 elements × 100 keyframes, alternate, shared descriptor | 109.37 ms | 17.92 ms | 6.10× observed median ratio; compilation-local shared object/easing/directed-curve interning |
| 1,000 elements × 100 keyframes, alternate, distinct descriptor objects | Not directly A/B matched | 306.36 ms | Significant **remaining** bottleneck; do not claim shared-cache gains on distinct data |

Shared-curve output remains identical between compared benchmark stages (5,760,887 B at 1,000×100 alternate). Caches do not bypass per-target transform-base validation. Four regression tests enforce separate direction/easing owners and reject incompatible transform baselines even with shared keyframe arrays. Distinct-object structural deduplication and faster normalization remain future work.

## Procedural tesseract audit and correction

The first adaptive allocator used 91 keyframes, 96,983 B and a 0.29146 px approximate maximum at 4,001 dense time probes. A uniform 91-keyframe baseline was slightly larger (97,536 B) **but had better error** (0.18688 px); therefore an unconditional claim of adaptive superiority was false.

A midpoint-splitting adaptive experiment produced 105 keyframes / 110,492 B and still did not beat the same-size uniform alternatives. The compiler now evaluates both families and chooses a smaller eligible result. For a 4-second 0.3px tolerance instance:

| Generated representation | Frames | Bytes | Max dense 4,001-sample vertex residual |
|---|---:|---:|---:|
| Selected cost-based candidate (uniform in this instance) | **73** | **77,883** | **0.29159 px** |
| Uniform, 91 | 91 | 97,536 | 0.18688 px |
| Uniform, 241 | 241 | 254,683 | 0.02659 px |
| Uniform, 401 (10ms sampling) | 401 | 421,380 | 0.00977 px |

The compiler considers coordinate quantization separately and reports the empirical nature of interpolation residuals. The output is a single path with 32 M/L edge instances, one common keyTimes list, 73 animated `d` frames, no JavaScript. `tools/chromium-tesseract-image.mjs` verified real `<img>` playback by detecting thousands of changed pixels between screenshots. The three phases of scientific correctness remain distinct: topology (degree-four graph), mathematical projection, and compositor rendering.

Release preparation exposed and fixed a custom-period projection error: the exported animation's timing could differ from the geometry sampler's implicit four-second default. Both sampling and serialization now respect a caller-supplied period, and a 4.8-second regression fixture asserts the exact seam. The repository's self-contained animated hero (`assets/phasor-hero.svg`) was generated from the corrected procedural compiler, and its motion was validated as an embedded image in Chromium (`evidence/chromium-phasor-hero-0001.json`).

**Methodological limitation:** this Pareto experiment compares byte size under a chosen sampled tolerance and a specific periodic tesseract. It does not establish general adaptive-vs-uniform supremacy, certified maximum visual error, or superior browser playback performance.

## Remaining engineering priorities

1. CSS transform stacks, animated transform-origin and transform-box reference geometry. Strictly verify matrix order before supporting grouped transforms.
2. Full WAAPI effect-stack composition (replace/add/accumulate), overlaps, underlying values and fill; do not delegate it to SVG's different animation priority semantics.
3. Browser-based source scene capture across CSS inheritance, computed baselines, paths, gradients and property-indexed forms. Refuse mismatches.
4. Genuine Firefox/WebKit cross-engine conformance and `<img>` temporal validation. Install compatible instrumented browser automation if needed; do not mislabel Chrome-only evidence as cross-engine.
5. General adaptive lowering for unsupported WAAPI easing (overshoot, step discontinuities, CSS linear(), procedural springs), with declared quality budgets and adversarial sample boundaries.
6. Faster distinct-object normalization/content interning with collision/semantics safety proofs. Profile parse, normalization, serialization, layout/DOM bottlenecks separately.
7. A PresGen DTO adapter that shifts destination-keyframe easing to WAAPI outgoing ownership and retains dwell/arrivalLag/repeat gaps as authored.
8. Procedural tesseract evolution: configurable 4D rotation planes and camera; certified interval error bounds where analytically tractable, further byte/CPU Pareto optimization and cross-browser validation.

## Constraints carried forward

Do not change PresGen's source to accommodate this library. No runtime JS in exported SVG. Keep test artifacts and failures; never erase them just to improve pass rates. Source-scene SVG restrictions are intentionally stricter than general SVG. Code remains private, version 0.0.0, until multi-engine evidence and a release-threat model justify publication.
