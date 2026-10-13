# Worklog Fragment: MapLibre GL 3D Replay Continuous Repaint & Animation Freeze Resolution

## 1. Context & Problem Statement
During flight playback in the 3D replay view (`MapLibreThreeEngine` / `FlightReplayView`), when the user pressed the "Play" button, the 3D WebGL viewport appeared completely frozen and static. The paraglider avatar did not move, the camera did not track the flight, and the dynamic traveled track did not advance, even though the 2D timeline scrubber at the bottom was progressing normally.

## 2. Root Cause Analysis (RCA)
- **MapLibre GL JS On-Demand Rendering Engine**: MapLibre GL JS uses a strictly on-demand dirty-checking rendering loop to conserve battery and GPU resources on mobile devices. Once the initial `fitBounds` camera transition (1200ms) completes, MapLibre enters an idle state.
- **Missing `this.map.triggerRepaint()` in Playback Loop**: `MapLibreThreeEngine._runLoop()` advanced `currentTimeSec` and updated Three.js vertex positions in `requestAnimationFrame`, but never called `this.map.triggerRepaint()`.
- **CustomLayer Deadlock**: Because `triggerRepaint()` was never called from the playback loop, MapLibre never woke up its WebGL canvas renderer, and `glCustomLayer.render(gl, matrix)` was never executed.
- **Camera Mode Vulnerabilities**: In `free` camera mode, `jumpTo()` was bypassed completely. In `chase` mode, the sub-pixel coordinate deltas across 16ms frames were below MapLibre's camera movement threshold, preventing automatic dirty marking.
- **Avatar Coupling**: In `_updateCurrentFrame(pt)`, camera tracking `_updateCameraForFrame(pt)` was nested inside `if (this.avatarGroup && this.map)`. If `this.avatarGroup` was null or delayed, camera updates were completely halted.

## 3. Implementation Details
1. **Continuous Repaint in Animation Loop (`_runLoop`)**:
   - Added `if (this.map && typeof this.map.triggerRepaint === 'function') { this.map.triggerRepaint(); }` on every active frame of `_runLoop()`.
2. **Immediate Repaints on Playback & View Transitions**:
   - Injected `this.map.triggerRepaint()` in `play()`, `pause()`, `seek()`, `setCameraMode()`, and `setElevationOffset()`.
3. **Auto-Rewind on Play at Touchdown**:
   - In `play()`, if `this.progress >= 1.0`, automatically seek back to 0 (`this.seek(0)`) so pressing play at the end of the flight seamlessly restarts playback from takeoff.
4. **Decoupled Camera Tracking & Defensive Invocations**:
   - Separated `_updateCameraForFrame(pt)` from `avatarGroup` initialization, checking `typeof this.map.jumpTo === 'function'`.

## 4. Verification & Automated Test Coverage
- Added 4 new automated unit tests in `tests/ui/replayTakeoffLandingTrackVisibility.test.mjs`:
  1. Verify `triggerRepaint` is called on play, pause, seek, and on every tick of `_runLoop`.
  2. Verify continuous repaint occurs in `free` camera mode where `jumpTo` is not called.
  3. Verify auto-rewind to takeoff ($p = 0$) when `play()` is called at $p = 1.0$.
  4. Verify immediate repaint on `setCameraMode` and `setElevationOffset`.
- Full project test suite (`npm test`): 724 passed, 0 failed, 1 skipped across 125 test suites.
