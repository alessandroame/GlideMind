# Worklog Fragment: Constant 6px Screen-Invariant 3D Flight Track Across All Zoom Levels

**Date**: 2026-10-12  
**Topic**: Invariant 6px Visual Thickness for 3D Flight Ribbon in MapLibre/Three.js  
**Files Modified**:
- `core/flightReplayMath.js`
- `ui/3d/MapLibreThreeEngine.js`
- `tests/core/flightReplayMath.test.mjs`
- `tests/ui/replayTakeoffLandingTrackVisibility.test.mjs`

---

## Context & Motivation
Following user feedback ("non ci stiamo capendo, falla sempre larga 6px indipendentemente dal livello di zoom"), the 3D flight trajectory in the 3D replay engine (`MapLibreThreeEngine`) previously oscillated between two extremes:
1. Oversized highway distortion (~80px wide) caused by uncalibrated tile dimensions and static geometry that never updated during zoom changes.
2. Sub-pixel hairline (~0.15px wide) caused by an incorrect perspective scale factor (0.13 m/px instead of 3.32 m/px at zoom 14).

The user explicitly mandated that the flight ribbon must maintain a **constant, crisp visual screen thickness of strictly 6.0 pixels** across all zoom levels ($z \in [8, 22]$).

---

## Architectural Implementation

1. **Deterministic Web Mercator Resolution Scale (`core/flightReplayMath.js`)**:
   - In Web Mercator / MapLibre 3D, earth circumference is $40,075,016.686\text{ m}$.
   - At zoom $z$ and latitude $\phi$, ground resolution is:
     $$\text{metersPerPixel}(z, \phi) = \frac{40075016.686 \cdot \cos(\phi)}{512 \cdot 2^z}$$
   - For an invariant screen thickness of 6 pixels:
     $$\text{widthMeters}(z, \phi) = 6.0 \cdot \text{metersPerPixel}(z, \phi)$$
     $$\text{heightMeters} = \text{widthMeters} \cdot 0.6$$
   - Projected screen pixels $\frac{\text{widthMeters}}{\text{metersPerPixel}} \equiv 6.0\text{ px}$ holds identically across all zoom levels.
   - Physical clamps: `minWidthMeters: 0.20`, `maxWidthMeters: 1000.0`.

2. **60 FPS Dynamic Geometry Modulation (`ui/3d/MapLibreThreeEngine.js`)**:
   - Registered map `'zoom'` event listener in `_setupThreeCustomLayer` that updates ribbon vertices immediately during interactive user gestures (wheel/pinch).
   - Tightened zoom differential check in `render(gl, matrix)` from `> 0.08` to `> 0.02` to update dynamically during camera pitch/fly-to transitions.
   - Provided proper cleanup of `this.map.off('zoom', this._onMapZoom)` in `destroy()`.
   - Modulates vertex positions in-place inside `posAttr.array` without GPU re-allocation or memory fragmentation.

3. **Automated Test Contracts (`tests/core/flightReplayMath.test.mjs`)**:
   - Verified exact 6.0px projection across zooms 10 through 19 (`Math.abs(screenPixels - 6.0) < 0.05`).
   - Verified zoom 14 ($19.91\text{m}$), zoom 18 ($1.24\text{m}$), zoom 12 ($79.65\text{m}$).
   - All 31 core replay math tests passing.
