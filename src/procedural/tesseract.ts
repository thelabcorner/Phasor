import { AnimationCompileError } from "../diagnostics.js";

export type Vec4 = readonly [number,number,number,number];
export type Edge4 = readonly [number,number];
export interface ProjectionOptions {
  /** Length in svg user units per projected coordinate. */
  readonly scale?: number;
  readonly fourDObserverDistance?: number;
  readonly threeDObserverDistance?: number;
  readonly width?: number;
  readonly height?: number;
}
export interface TesseractCompilerOptions extends ProjectionOptions {
  readonly periodMs?: number;
  /** Required observed maximum vertex-space residual at interval probes. */
  readonly tolerancePx?: number;
  readonly maxKeyframes?: number;
  readonly maxBytes?: number;
  readonly decimalDigits?: number;
}
export interface TesseractResult {
  readonly svg: string;
  readonly report: {
    readonly topology: {readonly vertices:16;readonly edges:32};
    readonly lowering: "shared-vertex-adaptive-path-smil" | "shared-vertex-uniform-path-smil";
    readonly errorClassification: "sampled-empirical-not-certified";
    readonly samples: number;
    readonly outputKeyframes: number;
    readonly observedMaxVertexResidualPx: number;
    readonly coordinateQuantizationBoundPx: number;
    readonly outputBytes: number;
    readonly exactSerializedSeam: true;
    readonly candidateFrames: {readonly adaptive:number;readonly uniform:number|null};
  };
}

const TAU=2*Math.PI;
export const TESSERACT_VERTICES: readonly Vec4[] = Object.freeze(
  Array.from({length:16},(_,i)=>Object.freeze(
    [0,1,2,3].map(d=>(i&(1<<d))!==0?1:-1) as unknown as Vec4
  ))
);
export const TESSERACT_EDGES: readonly Edge4[] = Object.freeze(
  Array.from({length:16},(_,i)=>[0,1,2,3].filter(d=>(i&(1<<d))===0).map(d=>
    Object.freeze([i,i|(1<<d)] as Edge4))).flat()
);

function optionsOrThrow(o:TesseractCompilerOptions){
  const width=o.width??512,height=o.height??512,scale=o.scale??48;
  const fourD=o.fourDObserverDistance??3,threeD=o.threeDObserverDistance??5;
  const period=o.periodMs??4000,tolerance=o.tolerancePx??.3;
  const maxKeyframes=o.maxKeyframes??2048,maxBytes=o.maxBytes??8_000_000;
  const decimalDigits=o.decimalDigits??3;
  const checks=[width,height,scale,fourD,threeD,period,tolerance,maxKeyframes,maxBytes,decimalDigits];
  if (checks.some(n=>typeof n!=="number" || !Number.isFinite(n)) ||
      width<=0||height<=0||scale<=0||period<=0||tolerance<=0 ||
      fourD<=Math.SQRT2||threeD<=fourD/(fourD-Math.SQRT2) ||
      maxKeyframes<3||maxKeyframes>100000||!Number.isSafeInteger(maxKeyframes)||
      maxBytes<100||!Number.isSafeInteger(maxBytes)||
      !Number.isInteger(decimalDigits)||decimalDigits<0||decimalDigits>9)
    throw new AnimationCompileError("TIMING_INVALID","Invalid tesseract projection, duration, capacity or precision");
  return {width,height,scale,fourD,threeD,period,tolerance,maxKeyframes,maxBytes,decimalDigits};
}

/** Canonical 4D hypercube: 16 vertices, 32 edges, degree-four graph. */
export function sampleTesseract(
  timeMs:number,
  settings:ProjectionOptions&{readonly periodMs?:number}={}
):Float64Array{
  const o=optionsOrThrow({...settings,tolerancePx:.3});
  if (!Number.isFinite(timeMs)) throw new AnimationCompileError("TIMING_INVALID","Projection time must be finite");
  const normalized=((timeMs%o.period)+o.period)%o.period;
  const angle=TAU*normalized/o.period;
  const cos=Math.cos(angle),sin=Math.sin(angle);
  const out=new Float64Array(32);
  for (let i=0;i<TESSERACT_VERTICES.length;i++){
    const [x,y,z,w]=TESSERACT_VERTICES[i]!;
    const xr=x*cos-w*sin,wr=x*sin+w*cos;
    const denom4=o.fourD-wr;
    if (denom4<=0) throw new AnimationCompileError("PROPERTY_UNSUPPORTED","4D projection crosses camera pole");
    const k4=o.fourD/denom4;
    const denom3=o.threeD-z*k4;
    if(denom3<=0) throw new AnimationCompileError("PROPERTY_UNSUPPORTED","3D projection crosses camera pole");
    const k3=o.threeD/denom3;
    out[2*i]=o.width/2+o.scale*xr*k4*k3;
    out[2*i+1]=o.height/2-o.scale*y*k4*k3;
  }
  if(out.some(n=>!Number.isFinite(n))) throw new AnimationCompileError("PROPERTY_UNSUPPORTED","Non-finite projected geometry");
  return out;
}

interface Interval {
  a:number;b:number;
  pa:Float64Array;pb:Float64Array;
  residual:number;worstTime:number;worstValue:Float64Array;
}
class IntervalHeap {
  private heap:Interval[]=[];
  get length(){return this.heap.length;}
  peek(){return this.heap[0];}
  push(v:Interval){
    const a=this.heap; let n=a.length;a.push(v);
    while(n>0){const p=(n-1)>>1;if(a[p]!.residual>=v.residual)break;a[n]=a[p]!;n=p;}a[n]=v;
  }
  pop(){
    const a=this.heap;if(!a.length)return undefined;
    const result=a[0]!,v=a.pop()!;
    if(a.length){let i=0;while(2*i+1<a.length){
      let j=2*i+1;if(j+1<a.length&&a[j+1]!.residual>a[j]!.residual)j++;
      if(a[j]!.residual<=v.residual)break;a[i]=a[j]!;i=j;
    }a[i]=v;}
    return result;
  }
}
function residualInterval(a:number,b:number,pa:Float64Array,pb:Float64Array,
  at:(t:number)=>Float64Array):Interval{
  let residual=-1,worstTime=(a+b)/2,worstValue=at(worstTime);
  for(const fraction of [.125,.25,.375,.5,.625,.75,.875]){
    const t=a+(b-a)*fraction;
    if(t<=a||t>=b)continue;
    const value=at(t);
    let e=0;
    for(let i=0;i<32;i+=2){
      const dx=value[i]!-(pa[i]!+(pb[i]!-pa[i]!)*fraction);
      const dy=value[i+1]!-(pa[i+1]!+(pb[i+1]!-pa[i+1]!)*fraction);
      e=Math.max(e,Math.hypot(dx,dy));
    }
    if(e>residual){residual=e;worstTime=t;worstValue=value;}
  }
  return {a,b,pa,pb,residual:Math.max(residual,0),worstTime,worstValue};
}

function serializePath(vertices:Float64Array,digits:number){
  const f=(v:number)=>Number(v.toFixed(digits)).toString();
  const fragments:string[]=[];
  for(const [a,b] of TESSERACT_EDGES){
    fragments.push("M"+f(vertices[a*2]!)+" "+f(vertices[a*2+1]!)+
      "L"+f(vertices[b*2]!)+" "+f(vertices[b*2+1]!));
  }
  return fragments.join(" ");
}

/** Public projected geometry oracle, with deterministic decimal serialization. */
export function tesseractPathAt(timeMs:number,options:ProjectionOptions&{
  readonly periodMs?:number;
  readonly decimalDigits?:number;
}={}):string{
  const o=optionsOrThrow({...options,tolerancePx:.3});
  return serializePath(sampleTesseract(timeMs,{...o,periodMs:o.period}),o.decimalDigits);
}

/**
 * Compile a deterministic 4D rotation into one scriptless SVG path animation.
 * Temporal knots are shared by all 16 vertices, not selected independently
 * for all 32 edges. Reported quality is a *sampled* error, not a global proof.
 */
export function compileTesseractSvg(options:TesseractCompilerOptions={}):TesseractResult{
  const o=optionsOrThrow(options);
  const at=(t:number)=>sampleTesseract(t,{...o,periodMs:o.period});
  const quantizationBound=Math.SQRT2*.5*10**(-o.decimalDigits);
  const geometryBudget=o.tolerance-quantizationBound;
  if(geometryBudget<=0)
    throw new AnimationCompileError("TIMING_INVALID","Requested tolerance is below coordinate serialization precision");
  const knots=new Map<number,Float64Array>();
  const left=at(0),right=at(o.period);
  knots.set(0,left);knots.set(o.period,right);
  const heap=new IntervalHeap();
  heap.push(residualInterval(0,o.period,left,right,at));
  while(heap.peek() && heap.peek()!.residual>geometryBudget){
    if(knots.size>=o.maxKeyframes)
      throw new AnimationCompileError("LIMIT_EXCEEDED","Tolerance not reached within maxKeyframes");
    const interval=heap.pop()!;
    // Bisect the interval with the largest observed residual, rather than
    // placing a knot directly at the worst sampled probe. The latter can
    // create severely unbalanced intervals on smooth periodic curves.
    const t=(interval.a+interval.b)/2;
    if(t<=interval.a||t>=interval.b||knots.has(t))
      throw new AnimationCompileError("LIMIT_EXCEEDED","Cannot refine interval at representable time resolution");
    const projected=at(t);
    knots.set(t,projected);
    heap.push(residualInterval(interval.a,t,interval.pa,projected,at));
    heap.push(residualInterval(t,interval.b,projected,interval.pb,at));
  }
  function serialize(knots:Map<number,Float64Array>){
    const sorted=[...knots].sort((a,b)=>a[0]-b[0]);
    const times=sorted.map(([t])=>t===o.period?"1":String(Number((t/o.period).toPrecision(15))));
    const values=sorted.map(([_,positions])=>serializePath(positions,o.decimalDigits));
    if(values[0]!==values.at(-1))
      throw new AnimationCompileError("LOWERING_UNSUPPORTED","Periodic tesseract geometry does not close exactly");
    const first=values[0]!;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}" viewBox="0 0 ${o.width} ${o.height}"><path id="tesseract" d="${first}" fill="none" stroke="#2563eb" stroke-width="1.5"><animate attributeName="d" begin="0s" dur="${o.period/1000}s" repeatCount="indefinite" fill="remove" calcMode="linear" keyTimes="${times.join(";")}" values="${values.join(";")}"/></path></svg>`;
    return {svg,bytes:new TextEncoder().encode(svg).byteLength,frames:sorted.length};
  }
  function uniform(count:number){
    const frameKnots=new Map<number,Float64Array>();
    let prior=at(0),previousTime=0,maxError=0;
    frameKnots.set(0,prior);
    for(let i=1;i<count;i++){
      const t=i===count-1?o.period:o.period*i/(count-1);
      const current=at(t);
      frameKnots.set(t,current);
      maxError=Math.max(maxError,residualInterval(previousTime,t,prior,current,at).residual);
      if(maxError>geometryBudget)break;
      prior=current;previousTime=t;
    }
    return {frameKnots,maxError,passes:maxError<=geometryBudget&&frameKnots.size===count};
  }
  let low=2,high=3,passing:ReturnType<typeof uniform>|null=null;
  while(high<=o.maxKeyframes){
    const attempt=uniform(high);
    if(attempt.passes){passing=attempt;break;}
    if(high===o.maxKeyframes)break;
    low=high;high=Math.min(o.maxKeyframes,high*2);
  }
  if(passing){
    while(high-low>1){
      const mid=Math.floor((high+low)/2);
      const attempt=uniform(mid);
      if(attempt.passes){high=mid;passing=attempt;}
      else low=mid;
    }
  }
  const adaptiveEncoded=serialize(knots);
  const uniformEncoded=passing?serialize(passing.frameKnots):null;
  const preferUniform=uniformEncoded!==null&&uniformEncoded.bytes<adaptiveEncoded.bytes;
  const result=preferUniform?uniformEncoded!:adaptiveEncoded;
  if(result.bytes>o.maxBytes)throw new AnimationCompileError("LIMIT_EXCEEDED","Procedural SVG exceeds maxBytes");
  return {svg:result.svg,report:{
    topology:{vertices:16,edges:32},lowering:preferUniform?"shared-vertex-uniform-path-smil":"shared-vertex-adaptive-path-smil",
    errorClassification:"sampled-empirical-not-certified",
    samples:result.frames,outputKeyframes:result.frames,
    observedMaxVertexResidualPx:preferUniform?passing!.maxError:heap.peek()?.residual??0,
    coordinateQuantizationBoundPx:quantizationBound,
    outputBytes:result.bytes,exactSerializedSeam:true,
    candidateFrames:{adaptive:knots.size,uniform:passing?.frameKnots.size??null}
  }};
}
