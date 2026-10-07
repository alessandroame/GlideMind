---
name: geodesy-webgl-3d
description: >-
  Use this skill when implementing 3D flight telemetry replay, map projections,
  LTTB downsampling, coordinate transformations (WGS84/ENU), or terrain alignment.
---

# 3D Geodesy, WebGL & Flight Telemetry Replay

## 1. Mathematical Geodesy & Cartographic Projections
1. **Web Mercator (EPSG:3857) Conformal Scale Factor**:
   With geodetic latitude in radians $\phi = \text{lat} \cdot \frac{\pi}{180}$:
   $$\text{scaleFactor} = \sec(\phi) = \frac{1}{\cos(\phi)}$$
   Never use flat Euclidean approximations for distances without local scale adjustment computed at reference origin $P_0$.

2. **Reference Frame Origin ($P_0$) - Single-Shot Alignment (ENU)**:
   Transform all trajectory points, waypoints, and landmarks into local East-North-Up (ENU) coordinates centered at $P_0 = (\lambda_0, \phi_0, h_0)$ once upon flight load:
   $$x_{\text{East}} = R \cdot (\lambda - \lambda_0) \cdot \cos(\phi_0)$$
   $$y_{\text{Up}} = h - h_0$$
   $$z_{\text{South}} = -R \cdot (\phi - \phi_0)$$
   Where $R = 6371000\text{ m}$. In the right-handed Three.js scene (Y-Up), $+X$ points East, $+Y$ points Up, and $+Z$ points South ($\mathbf{\hat{X}} \times \mathbf{\hat{Y}} = \mathbf{\hat{Z}}$).
   Do not modify scene origin or recalculate transforms during runtime rendering loops.

3. **Geoid vs MSL DEM Alignment & Terrarium Decoding**:
   GPS IGC records provide GNSS ellipsoidal altitude (WGS84) or barometric MSL altitude. Raster DEMs (Terrarium) operate on MSL (EGM96).
   Altimetric terrain height is decoded from RGB channels:
   $$h_{\text{MSL}} = (R \cdot 256 + G + B / 256) - 32768\quad [\text{meters}]$$
   Apply uniform vertical translation $\mathbf{T}_y = [0, \Delta h, 0]^T$ across the Three.js scene rather than non-linear point-by-point distortion.

---

## 2. 2D Telemetry & Double-Buffered Canvas Pipeline
For GPS flights with 5,000 to 50,000 points:
1. **LTTB Decimation (Largest-Triangle-Three-Buckets)**:
   Downsample dense GPS arrays to 800-1,200 points for real-time 60 FPS graphing while preserving peaks, troughs, and thermal climbs.
   Candidate point $B$ in current bucket maximizes triangle area formed with selected point $A$ and average centroid $C$:
   $$\text{Area} = \frac{1}{2} |x_A (y_B - y_C) + x_B (y_C - y_A) + x_C (y_A - y_B)|$$
2. **Double-Buffered Architecture**:
   - **Static Base Canvas**: Renders grid lines, terrain elevation profile, altitude curve, and thermal climbs. Cached off-screen.
   - **Interactive Overlay Canvas**: 60 FPS lightweight cursor, hover guides, and time scrubbing without redrawing complex curves.
