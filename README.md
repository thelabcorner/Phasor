# waapi-to-svg

Experimental, independent TypeScript compiler for converting **WAAPI-authored animations of existing SVG geometry** into self-contained, scriptless, declaratively animated SVG.

**Status 2026-10-19:** P1 headless timing/easing/keyframe evaluator and early P2 scalar SMIL compiler implemented. 50 local tests pass. Chromium differential and SVG `<img>` evidence are recorded under `evidence/`. **Not production-complete or cross-browser-certified.** PresGen is a reference system only, not a dependency. This is NOT general HTML-to-SVG, video export, or arbitrary JavaScript execution inside SVG.

## Try it

```bash
npm ci
npm run build
npm test
```

```ts
import { compileSvgAnimation } from "waapi-to-svg";

const result = compileSvgAnimation({
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle id="dot" cx="0" cy="50" r="10" fill="#2563eb"/>
  </svg>`,
  tracks: [{
    target: { svgId: "dot" },
    keyframes: [
      { offset: 0, cx: 0, easing: "ease-in-out" },
      { offset: 1, cx: 80 },
    ],
    timing: { duration: 1200, iterations: Infinity },
  }],
  options: { profile: "svg-image", mode: "exact-only" },
});

console.log(result.svg);    // inline <animate> within circle, no JS runtime
console.log(result.report); // structural evidence, NOT universal browser certification
```

The library is currently private and emits ESM with TypeScript declarations. Runtime core uses `@xmldom/xmldom`; browser-comparison tools are dev-only.

### Capture a real browser WAAPI animation (experimental)

Use the separately exported browser adapter to capture actual native `Animation` / `KeyframeEffect` data into the same serializable request format. It can be transported to Node for compilation:

```ts
import { captureWaapiAnimations } from "waapi-to-svg/browser";
import { compileSvgAnimation } from "waapi-to-svg";

const circle = document.querySelector<SVGCircleElement>("#dot")!;
const scene = circle.ownerSVGElement!;
const animation = circle.animate(
  [{ opacity: 1, easing: "ease-in-out" }, { opacity: 0 }],
  { duration: 1000, iterations: 2, fill: "forwards" }
);
animation.pause();
await animation.ready;

const request = captureWaapiAnimations(scene, [animation]);
const output = compileSvgAnimation(request);
```

**Current capture contract:** opacity-related channels only; explicit numeric underlying SVG attributes; DOM-connected root; document timeline; rate=1; settled state; replace-only effects; no author stylesheets, unresolved CSS, or extra animations on the captured subtree. Capture *reauthors* to local time 0, rather than copying the animation's current playhead position. The browser adapter has no DOM dependency at import time, but requires browser globals when called. This is an intentionally restrictive first implementation, not a promise to capture arbitrary SVG/HTML animations.

## Supported P2 subset

SVG scalar coordinates `cx,cy,x,y,x1,x2,y1,y2`, `r,rx,ry,width,height`, and `opacity,fill-opacity,stroke-opacity`, with explicit numerical base attributes, unitless numeric keyframe values, strictly increasing offsets with endpoints 0 and 1, and replace composition. Native linear and compatible cubic Bézier keyframe/effect easing are supported under constrained composition conditions. Positive start delay, finite **integer** repeats and infinite normal repeats, and fill none/forwards have native lowering candidates. Multiple independent channels/targets are supported. Negative delay, fractional repeat, alternate direction, transforms, overlapping same-property effects, CSS computed baselines, and unsupported easing **refuse**.

Every input track is checked; unknown timing fields (including unsupported composite operations), unsupported values, unsafe XML and missing resources are errors, not silently ignored. Failures throw `AnimationCompileError` with a typed `code`. The output report uses the label `structural-under-preconditions-not-browser-certified`: `status: exact` is a conservative structural rule classification, not a broad browser-conformance guarantee.

### Scope and security

Core is pure TypeScript and requires no live browser. It parses an existing SVG and inserts declarative SVG animation elements. Refuses `DOCTYPE`, entities, scripts, external resources, style elements, inline styles, event handlers, duplicate IDs, unresolved local references and other unresolved semantics. Not intended as a general SVG sanitizer for accepting arbitrary untrusted web content; extend the threat model before public untrusted document upload.

## Reproduce evidence

```bash
npm run test:chromium
npm run test:image
npm run test:capture
npm run bench
```

Browser probes currently use an installed **Windows Chrome** binary at `C:\Program Files\Google\Chrome\Application\chrome.exe`. They are not CI-portable yet; cross-browser WebKit/Firefox coverage remains unfinished. `test:chromium` exercises WAAPI vs inline SMIL seeking; `test:image` verifies actual painted pixels of SVG loaded via `<img>`. The seeded corpus fixes the random seed and records exact samples. Evidence snapshots under `evidence/` are committed research artifacts, including original boundary failures.

## Design documents

- [RFC 0001](docs/ARCHITECTURE_RFC_0001.md): architecture, temporal IR, proof-directed lowering and constraints.
- [Compatibility proof matrix](docs/COMPATIBILITY_PROOF_MATRIX_0001.md): exact/approximate/refusal conditions.
- [Implementation plan](docs/IMPLEMENTATION_PLAN_0001.md): eight gated phases P0–P7.
- [Adversarial requirements corpus](docs/ADVERSARIAL_CORPUS_0001.md): 60 designed scenarios; not all executable yet.
- [Timing oracle](docs/TIMING_ORACLE_0001.md): normative phase/iteration/easing math.
- [Engineering status](docs/IMPLEMENTATION_STATUS_0002.md): measured evidence, remaining work.

## Next stages

Differentially validate candidate exact cases in Chromium/Firefox/WebKit and `<img>`; implement CSS baseline and transform-origin resolution, browser WAAPI capture, effect-stack compositing, deterministic boundary-safe adaptive approximation, optional PresGen adapter and procedural tesseract geometry. Do not weaken refusal conditions to improve a pass rate.
