import { AnimationCompileError } from "./diagnostics.js";

export type Ease =
  | { readonly kind: "linear" }
  | { readonly kind: "bezier"; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }
  | { readonly kind: "steps"; readonly count: number; readonly position: "jump-start" | "jump-end" | "jump-none" | "jump-both" };

const KEYWORDS: Record<string, readonly [number, number, number, number]> = {
  "ease": [.25, .1, .25, 1], "ease-in": [.42, 0, 1, 1],
  "ease-out": [0, 0, .58, 1], "ease-in-out": [.42, 0, .58, 1]
};
const NUM = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
const BEZIER_RE = new RegExp("^cubic-bezier\\(\\s*("+NUM+")\\s*,\\s*("+NUM+")\\s*,\\s*("+NUM+")\\s*,\\s*("+NUM+")\\s*\\)$", "i");
const STEPS_RE = /^steps\(\s*(\d+)\s*(?:,\s*(start|end|jump-start|jump-end|jump-none|jump-both)\s*)?\)$/i;

export function parseEasing(raw: string = "linear"): Ease {
  if (typeof raw !== "string") throw new AnimationCompileError("EASING_UNSUPPORTED", "Easing must be a CSS easing string");
  const value = raw.trim().toLowerCase();
  if (value === "linear") return { kind: "linear" };
  const keyword = KEYWORDS[value];
  const match = value.match(BEZIER_RE);
  if (keyword || match) {
    const values = keyword ?? match!.slice(1).map(Number);
    const [x1, y1, x2, y2] = values;
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined ||
      !values.every(Number.isFinite) || x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
      throw new AnimationCompileError("EASING_UNSUPPORTED", "Invalid CSS cubic-bezier: " + raw);
    }
    return { kind: "bezier", x1, y1, x2, y2 };
  }
  if (value === "step-start" || value === "step-end") {
    return { kind: "steps", count: 1, position: value === "step-start" ? "jump-start" : "jump-end" };
  }
  const steps = value.match(STEPS_RE);
  if (steps) {
    const count = Number(steps[1]);
    const named = steps[2] ?? "end";
    const position = named === "start" ? "jump-start" : named === "end" ? "jump-end" : named;
    if (!Number.isSafeInteger(count) || count <= 0 || (position === "jump-none" && count === 1)) {
      throw new AnimationCompileError("EASING_UNSUPPORTED", "Invalid steps() count: " + raw);
    }
    return { kind: "steps", count, position: position as "jump-start" | "jump-end" | "jump-none" | "jump-both" };
  }
  throw new AnimationCompileError("EASING_UNSUPPORTED", "Unsupported CSS easing: " + raw);
}

const polynomial = (u: number, a: number, b: number) =>
  3 * a * u * (1-u) * (1-u) + 3 * b * u * u * (1-u) + u*u*u;
const derivative = (u: number, a: number, b: number) =>
  3*a*(1-u)*(1-u) + 6*(b-a)*u*(1-u) + 3*(1-b)*u*u;

export function evaluateEasing(ease: Ease, progress: number, beforeFlag = false): number {
  if (ease.kind === "linear") return progress;
  if (ease.kind === "steps") {
    const n = ease.count;
    let step = Math.floor(progress*n);
    if (ease.position === "jump-start" || ease.position === "jump-both") step++;
    if (beforeFlag && Number.isInteger(progress*n)) step--;
    const jumps = n + (ease.position === "jump-both" ? 1 : ease.position === "jump-none" ? -1 : 0);
    if (progress >= 0 && step < 0) step = 0;
    if (progress <= 1 && step > jumps) step = jumps;
    return step / jumps;
  }
  const { x1, y1, x2, y2 } = ease;
  // CSS curves extrapolate outside [0,1] using endpoint tangents.
  if (progress < 0) {
    const slope = x1 !== 0 ? y1 / x1 : x2 !== 0 ? y2 / x2 : 0;
    return progress * slope;
  }
  if (progress > 1) {
    const slope = x2 !== 1 ? (y2 - 1)/(x2 - 1) : x1 !== 1 ? (y1-1)/(x1-1) : 0;
    return 1+(progress-1)*slope;
  }
  if (progress === 0 || progress === 1) return progress;
  let u = progress;
  // Newton first, followed by bounded bisection for near-flat X.
  for (let i = 0; i < 8; i++) {
    const d = derivative(u, x1, x2);
    if (Math.abs(d) < 1e-8) break;
    const candidate = u - (polynomial(u,x1,x2) - progress)/d;
    if (candidate < 0 || candidate > 1) break;
    u = candidate;
    if (Math.abs(polynomial(u,x1,x2)-progress) < 1e-12) break;
  }
  if (Math.abs(polynomial(u,x1,x2)-progress) > 1e-11) {
    let low = 0, high = 1;
    for (let i=0; i<55; i++) {
      u = (low+high)/2;
      if (polynomial(u,x1,x2) < progress) low = u; else high = u;
    }
  }
  return polynomial(u,y1,y2);
}

export function nativeSpline(ease: Ease): string | null {
  if (ease.kind === "linear") return "0 0 1 1";
  if (ease.kind !== "bezier") return null;
  const { x1, x2, y1, y2 } = ease;
  if ([x1,x2,y1,y2].some(n => n < 0 || n > 1)) return null;
  return `${x1} ${y1} ${x2} ${y2}`;
}
