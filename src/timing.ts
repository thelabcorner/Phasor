import { AnimationCompileError, requireFinite } from "./diagnostics.js";
import { parseEasing, evaluateEasing } from "./easing.js";
import type { Ease } from "./easing.js";

export type FillMode = "none" | "auto" | "forwards" | "backwards" | "both";
export type PlaybackDirection = "normal" | "reverse" | "alternate" | "alternate-reverse";
export type EffectPhase = "before" | "active" | "after" | "idle";
export interface TimingOptions {
  duration?: number | "auto";
  delay?: number;
  endDelay?: number;
  iterations?: number;
  iterationStart?: number;
  direction?: PlaybackDirection;
  fill?: FillMode;
  easing?: string;
}
export interface CompiledTiming {
  readonly duration: number;
  readonly delay: number;
  readonly endDelay: number;
  readonly iterations: number;
  readonly iterationStart: number;
  readonly direction: PlaybackDirection;
  readonly fill: Exclude<FillMode,"auto">;
  readonly easing: Ease;
  readonly activeDuration: number;
  readonly endTime: number;
  readonly beforeActiveBoundary: number;
  readonly activeAfterBoundary: number;
}
export interface TimingSample {
  readonly phase: EffectPhase;
  readonly activeTime: number | null;
  readonly overallProgress: number | null;
  readonly simpleProgress: number | null;
  readonly currentIteration: number | null;
  readonly directedProgress: number | null;
  readonly transformedProgress: number | null;
  readonly beforeFlag: boolean;
  readonly reverse: boolean;
}
const DIRECTION = ["normal","reverse","alternate","alternate-reverse"] as const;
const FILL = ["none","auto","forwards","backwards","both"] as const;

export function compileTiming(input: TimingOptions = {}): CompiledTiming {
  if (input === null || typeof input !== "object" || Array.isArray(input))
    throw new AnimationCompileError("TIMING_INVALID","Expected an effect timing object");
  const allowed=new Set(["duration","delay","endDelay","iterations","iterationStart","direction","fill","easing"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key))
      throw new AnimationCompileError("TIMING_INVALID","Unsupported effect timing option: "+key);
  }
  const duration = input.duration === "auto" || input.duration === undefined ? 0 : input.duration;
  const delay = input.delay ?? 0;
  const endDelay = input.endDelay ?? 0;
  const iterations = input.iterations ?? 1;
  const iterationStart = input.iterationStart ?? 0;
  if (typeof duration !== "number" || typeof iterations !== "number" ||
    !(duration >= 0) || Number.isNaN(duration) ||
    !(iterations >= 0) || Number.isNaN(iterations) || !Number.isFinite(iterationStart) || iterationStart < 0) {
    throw new AnimationCompileError("TIMING_INVALID", "Invalid duration/iterations/iterationStart");
  }
  requireFinite(delay,"delay");
  requireFinite(endDelay,"endDelay");
  const direction = input.direction ?? "normal";
  const fillInput = input.fill ?? "auto";
  if (!DIRECTION.includes(direction) || !FILL.includes(fillInput)) {
    throw new AnimationCompileError("TIMING_INVALID", "Invalid direction or fill");
  }
  const activeDuration = duration === 0 || iterations === 0 ? 0 : duration * iterations;
  const endTime = Math.max(delay + activeDuration + endDelay,0);
  return {
    duration, delay, endDelay, iterations, iterationStart, direction,
    fill: fillInput === "auto" ? "none" : fillInput,
    easing: parseEasing(input.easing),
    activeDuration, endTime,
    beforeActiveBoundary: Math.max(Math.min(delay,endTime),0),
    activeAfterBoundary: Math.max(Math.min(delay+activeDuration,endTime),0),
  };
}

/** localTime is WAAPI effect-local time, not document time. playbackRate < 0 changes equality ownership. */
export function sampleTiming(timing: CompiledTiming, localTime: number | null, playbackRate = 1): TimingSample {
  if (localTime !== null) requireFinite(localTime,"localTime");
  requireFinite(playbackRate,"playbackRate");
  const negativeRate = playbackRate < 0;
  const phase: EffectPhase = localTime === null ? "idle" :
    (localTime < timing.beforeActiveBoundary || negativeRate && localTime === timing.beforeActiveBoundary) ? "before" :
    (localTime > timing.activeAfterBoundary || !negativeRate && localTime === timing.activeAfterBoundary) ? "after" : "active";
  let activeTime: number | null = null;
  if (localTime !== null) {
    if (phase === "before" && (timing.fill === "backwards" || timing.fill === "both")) activeTime = Math.max(localTime - timing.delay,0);
    if (phase === "after" && (timing.fill === "forwards" || timing.fill === "both")) activeTime = Math.max(Math.min(localTime - timing.delay,timing.activeDuration),0);
    if (phase === "active") activeTime = localTime - timing.delay;
  }
  if (activeTime === null) return { phase, activeTime: null, overallProgress:null, simpleProgress:null, currentIteration:null, directedProgress:null, transformedProgress:null, beforeFlag:false, reverse:false };
  const overallProgress = (timing.duration === 0 ? phase === "before" ? 0 : timing.iterations : activeTime / timing.duration) + timing.iterationStart;
  let simpleProgress = !Number.isFinite(overallProgress) ? timing.iterationStart % 1 : overallProgress % 1;
  if (simpleProgress === 0 && (phase === "active" || phase === "after") && activeTime === timing.activeDuration && timing.iterations !== 0) simpleProgress = 1;
  const currentIteration = phase === "after" && timing.iterations === Infinity ? Infinity :
    Math.floor(overallProgress) - (simpleProgress === 1 ? 1 : 0);
  const reverse = timing.direction === "reverse" ||
    ((timing.direction === "alternate" || timing.direction === "alternate-reverse") &&
      Number.isFinite(currentIteration) &&
      ((currentIteration + (timing.direction === "alternate-reverse" ? 1 : 0)) % 2 !== 0));
  const directedProgress = reverse ? 1-simpleProgress : simpleProgress;
  const beforeFlag = (phase === "before" && !reverse) || (phase === "after" && reverse);
  return { phase, activeTime, overallProgress, simpleProgress, currentIteration,
    directedProgress, transformedProgress: evaluateEasing(timing.easing,directedProgress,beforeFlag), beforeFlag, reverse };
}
