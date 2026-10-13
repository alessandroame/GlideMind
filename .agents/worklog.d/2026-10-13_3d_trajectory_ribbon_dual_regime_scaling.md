# Worklog Fragment: 3D Trajectory Ribbon Dual-Regime Multi-Scale Engine & Anti-Occlusion Architecture

## 1. Context & User Requirement
In the 3D flight replay view (`FlightReplayView` / `MapLibreThreeEngine`), the user reported that the flight track ribbon must remain clearly visible and recognizable from afar, but when zooming in close to inspect flight details and maneuvers, the track must remain small so it does not engulf or occlude the paraglider:
*"la traccia del volo nel render deve essere sempre visibile e riconoscibile, ma quando si zooma per vederne il dettaglio deve rimanere piccola altrimenti copre il parapendio. studia un modo efficace"*.

## 2. Root Cause Analysis (RCA)
- **Screen-Space vs World-Space Projection Conflict**: Imposing a constant screen thickness ($6.0\text{ px}$) across all zoom levels meant that at zoom 14, where Web Mercator resolution is $3.32\text{ m/px}$, the physical ribbon was extruded to $19.9\text{ meters}$ wide and $11.9\text{ meters}$ high.
- **Scale Mismatch with 3D Aircraft Geometry**: The Enzo 3 paraglider has a wingspan of $13.2\text{ m}$, a chord of $2.02\text{ m}$, a line clearance of $7.2\text{ m}$, and a pod harness width of only $0.50\text{ m}$. A 20-meter wide and 12-meter tall prism completely swallowed the pilot, lines, and canopy. In thermal 360 spirals (radius $15-25\text{ m}$), the ribbon formed a solid opaque cylinder of coils.
- **Chest-Embedded Attachment**: `_updateTraveledTrack` attached the head vertex directly to $(cp.x, cp.y, cp.z)$, which is the center of the pilot harness.
- **Z-Buffer Occlusion Inverse Bias**: Negative polygon offset (`polygonOffsetFactor: -1.0, units: -4.0`) on the track ribbon pulled track fragments in front of the paraglider in the depth buffer, causing the track to be rasterized on top of the aircraft.

## 3. Implementation Details
1. **Multi-Scale Dual-Regime Ribbon Engine (`core/flightReplayMath.js`)**:
   - **Regime 1 (Macro, $z \le 12.0$)**: Guaranteed screen presence at $\approx 5.0\text{ px}$ ($W = 66\text{m} \dots 318\text{m}$, $H \le 25\text{m}$), ensuring prominent, recognizable visibility across mountain ranges and valleys.
   - **Regime 2 (Smooth Transition, $12.0 < z < 17.0$)**: C1 Hermite smoothstep interpolation ($s(t) = 3t^2 - 2t^3$) scaling target screen pixels down from $5.0\text{ px}$ to $2.0\text{ px}$. At zoom 14 (chase view), width scales to $13.09\text{ m}$ (within the $13.2\text{ m}$ wingspan) and height to $3.24\text{ m}$ (under line height).
   - **Regime 3 (Micro Aerodynamic Tracer, $z \ge 17.0$)**: Tapered to a sleek aerodynamic ribbon ($W = 0.20\text{m} \dots 0.83\text{m}$, $H \le 0.10\text{m}$, $\approx 2.0\text{ px}$ on screen). Narrower than or matching the $0.50\text{m}$ pod harness, preventing any occlusion of canopy, lines, or pilot.
2. **Pencil-Tip Tapering & Harness Tail Attachment (`ui/3d/MapLibreThreeEngine.js`)**:
   - In `_updateTraveledTrack`: active head point $nextIdx$ is offset backward along the trailing vector to the tail cone of the pod harness ($z_{\text{tail}} = 0.85\text{m} \cdot \text{scale}$, $y_{\text{tail}} = 0.35\text{m} \cdot \text{scale}$).
   - Applied pencil-tip tapering at the head ($hw_{\text{head}} \le 0.04\text{m}$, $hh_{\text{head}} \le 0.02\text{m}$), producing an authentic aerodynamic wake originating from behind the harness.
3. **Z-Buffer Depth Writing & Render Order (`ui/3d/models/paragliderModel.js` & `MapLibreThreeEngine.js`)**:
   - Paraglider meshes (`canopyMesh`, `podHarnessMesh`) configured with `depthWrite: true`, `polygonOffset: true` (`-1.0, -2.0`), and `renderOrder = 10`.
   - Track ribbon configured with `renderOrder = 1`, centerline spine `renderOrder = 2`, drop curtains `renderOrder = 0`.
   - Reduced track polygon offset to `-0.25, -1.0`, ensuring the paraglider avatar always wins the depth test over trailing track geometry.

## 4. Verification & Automated Test Coverage
- Updated `tests/core/flightReplayMath.test.mjs`:
  - Verified slender ribbon at zoom 18 ($W = 0.41\text{m} < 0.50\text{m}$, $H = 0.06\text{m} < 0.10\text{m}$).
  - Verified balanced transition at zoom 14 ($W = 13.09\text{m} \le 13.2\text{m}$, $H = 3.24\text{m} < 7.2\text{m}$).
  - Verified continuous screen pixels bounded in $[1.95\text{px}, 5.05\text{px}]$ across all zooms $10 \le z \le 19$.
- Ran full test suite: `npm test` -> 725 passed, 0 failed, 1 skipped across 125 test suites.
