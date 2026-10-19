# Timing oracle 0001

**Normative alignment**: Web Animations Level 1 §§4.5.5 and 4.8–4.10; CSS Easing Level 1 §2.3.1. This document is written before executable implementation and is not browser-test evidence.

Input is `localTime`, NOT wall-clock document time. Playback rate controls mapping from document time to local time externally; negative playback rate also changes phase-boundary ownership.

Normalize effective duration `D`, iterations `N`, delay `d`, endDelay `e`: `activeDuration = D*N` except `D=0 || N=0` then zero; `endTime=max(d+activeDuration+e,0)`. Boundaries `beforeActive=max(min(d,endTime),0)` and `activeAfter=max(min(d+activeDuration,endTime),0)`.

Phase: before if t < beforeActive (or equality and negative playback rate); otherwise after if t > activeAfter (or equality and nonnegative playback rate); else active. A before phase produces activeTime `max(t-d,0)` only with backwards/both fill. An after phase produces `max(min(t-d,activeDuration),0)` only with forwards/both fill. Active phase produces `t-d`.

Overall = `activeTime/D+iterationStart`, except D=0: 0 if before, otherwise N, plus iterationStart. Simple = overall modulo 1, except if overall infinite use iterationStart modulo 1; if simple=0 and (active|after) and activeTime=activeDuration and N !=0, force simple=1. Current iteration = infinity if after with N infinity; otherwise floor(overall)-1 when simple=1, else floor(overall). Directed progress applies normal/reverse/alternate/alternate-reverse to simple. Transform with effect easing; CSS step easing receives beforeFlag = (before and going forward) OR (after and going reverse).

**Proof gate**: property interpolation and SVG code generation must not silently reinterpret null progress as zero, elide terminal endpoints, or use epsilon to create event boundaries. Browser time mapping and style-stack composition are separate functions to validate later. Relevant corpus cases: T01–T20, T24–T27.
