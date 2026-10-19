export type DiagnosticCode = 
  | "TIMING_INVALID" | "EASING_UNSUPPORTED" | "OFFSET_INVALID" | "KEYFRAME_INVALID"
  | "COMPOSITION_UNSUPPORTED" | "PROPERTY_UNSUPPORTED" | "SVG_UNSAFE"
  | "SVG_TARGET_INVALID" | "LOWERING_UNSUPPORTED" | "LIMIT_EXCEEDED";

export class AnimationCompileError extends Error {
  constructor(readonly code: DiagnosticCode, message: string) {
    super(message);
    this.name = "AnimationCompileError";
  }
}

export function requireFinite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new AnimationCompileError("TIMING_INVALID", name + " must be finite");
  return value;
}
