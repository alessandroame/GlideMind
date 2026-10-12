# Worklog Fragment: Dynamic Traveled Track Rendering up to Playback Instant in 3D Flight Replay

**Date**: 2026-10-12  
**Topic**: Dynamic Traveled Track Rendering in 3D Replay  
**Files Modified**:
- `ui/3d/MapLibreThreeEngine.js`
- `ui/3d/HeadlessReplayEngine.js`
- `core/flightReplayMath.js`
- `tests/ui/replayTakeoffLandingTrackVisibility.test.mjs`
- `tests/core/flightReplayMath.test.mjs`

---

## Context & Motivation
In the 3D flight replay (`FlightReplayView` / `MapLibreThreeEngine`), the full volumetric trajectory ribbon, variometer centerline spine, and ground drop curtain were drawn completely from takeoff to landing as soon as the view mounted.
When the user hit "Play", the paraglider avatar flew along an already pre-existing track in the sky, depriving the pilot of the realistic sensation of drawing a flight path over terrain as time advances.
The goal was to render strictly the track traveled up to the current playback instant ($t$ or progress $0.0 \le p \le 1.0$), leaving the forward sky clear.

---

## Architectural Implementation
1. **O(1) WebGL Draw Range Management**:
   - `BufferGeometry.setDrawRange(0, count)` dynamically modulates the rendered indices/vertices without GPU memory reallocation or garbage collection pressure at 60 FPS.
   - For progress $p = 0$ (takeoff), all draw ranges are clamped to 0 (`setDrawRange(0, 0)`), keeping takeoff/landing markers and avatar visible while the ribbon remains hidden.
   - For intermediate progress, binary search locates the active segment index `idx`.
   - The ribbon mesh (24 indices per quad segment) draws `(idx + 1) * 24` indices.
   - The centerline line mesh draws `nextIdx + 1` vertices.
   - The drop curtain line segments draw `curtainDrawCount = min(total, (floor(idx / step) + 1) * 2)` vertices.
   - At touchdown ($p = 1.0$), the draw ranges are set to full geometry size.

2. **Avatar-Attached Dynamic Leading Vertex (`_updateTraveledTrack`)**:
   - Between discrete GPS track samples, the avatar is continuously interpolated.
   - The 4 vertices (12 floats) of point `nextIdx` in `trackRibbonMesh.geometry.attributes.position` and `color` are updated in-place to attach directly to `currentPoint` with instantaneous FAI variometer colors.
   - When the active segment advances or the user seeks backward/forward across the timeline, `_restoreRibbonPoint(i)` restores the previously modified vertex to its precomputed coordinates and colors.

3. **Headless Replay Contract (`HeadlessReplayEngine.js`)**:
   - Implemented `getTraveledPoints()` returning the array slice of points traversed up to current progress for pure Node.js verification without WebGL.

4. **Test Suite Coverage (`replayTakeoffLandingTrackVisibility.test.mjs`)**:
   - Added Section 4 covering takeoff clamp ($p = 0 \to 0$ drawRange), dynamic in-flight rendering ($p = 10 / (n - 1)$), timeline seeking, backward seek vertex restoration, touchdown ($p = 1.0 \to$ full track), and `HeadlessReplayEngine.getTraveledPoints()`.
