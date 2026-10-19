# Contributing to Phasor

Phasor is research-oriented software. New behavior is accepted when its browser semantics, failure modes, and resource bounds can be reviewed and reproduced.

## Development

```bash
git clone https://github.com/thelabcorner/Phasor.git
cd Phasor
npm ci
npm run typecheck
npm test
npm run docs:check
```

The basic suite uses Node.js and does not require a live browser. The browser differential scripts use an installed Windows Chrome executable and are separate from portable CI.

```bash
npm run test:chromium
npm run test:transforms
npm run test:directions
npm run test:capture
npm run test:tesseract
```

## Quality bar

1. Add a focused regression test before broadening the lowering rules. A passing self-oracle test is not proof of browser fidelity; include independent browser evidence when proposing native WAAPI equivalence.
2. Preserve the distinction between mathematically exact lowering candidates, empirical approximation, and explicit refusal. Do not turn unsupported behavior into silent approximation.
3. Keep output SVG scriptless and self-contained. Treat external resource references, implicit CSS baselines, duplicate IDs, and arbitrary input as hostile until modeled.
4. Avoid mutating unrelated systems or repositories. Phasor is standalone; PresGen is an upstream inspiration, not a dependency.
5. Preserve failing fixtures and measurement provenance. Do not rewrite or discard red evidence to improve pass counts. Add corrected cases under new evidence filenames.
6. Include sample sizes, workload identity, environment, and measured units for performance claims. Shared-keyframe-object caching results do not generalize to distinct source objects.

## Pull requests

Keep each change scoped. Describe intended semantics, browsers tested, actual results, known limitations, and why the output remains declarative. CI checks TypeScript, the Node test suite, package assembly, and README/SVG invariants.

The project is pre-1.0 and does not promise API stability. Avoid adding new dependencies when a small self-contained implementation suffices.

## Issues and security

Use GitHub Issues for feature proposals and nonsensitive bugs. See [SECURITY.md](SECURITY.md) for handling suspected vulnerabilities.
