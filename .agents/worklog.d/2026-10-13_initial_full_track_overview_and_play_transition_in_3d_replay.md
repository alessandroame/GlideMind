# Worklog Fragment: 3D Replay Initial Full Track Overview & Playback Transition State Machine

## 1. Context & User Requirement
Upon opening the 3D flight replay view (`FlightReplayView` / `MapLibreThreeEngine`), the user requested to see the entire flight trajectory drawn in the 3D space upfront for immediate route comprehension and overview. Only when the user hits "Play" (or actively scrubs the timeline) should the track switch to dynamic traveled track mode, showing strictly the path traveled up to the playback instant:
*"quando apro il render 3d mostra tutta la traccia. Solo quando si fa play la traccia viene mostrata fino all'istante di riproduzione"*.

## 2. Root Cause Analysis (RCA)
- In the initial implementation of traveled track rendering, `_buildTrackRibbon()`, `_buildDropCurtain()`, and the initial call to `_updateTraveledTrack()` during `loadTrack()` clamped the `BufferGeometry.drawRange` to `0` because `progress <= 0` at takeoff.
- There was no distinction between the **initial inspection/overview state** (`hasPlaybackStarted = false`) and the **active dynamic playback state** (`hasPlaybackStarted = true`). Consequently, opening the replay view displayed an empty sky until the user pressed play.

## 3. Implementation Details
1. **Explicit State Flag (`this.hasPlaybackStarted`)**:
   - Initialized to `false` in `MapLibreThreeEngine` and `HeadlessReplayEngine` constructors.
   - Reset to `false` on every track load in `loadTrack()`.
   - Reset to `false` in `destroy()`.
2. **Full Geometry Draw Ranges on Initial Overview**:
   - In `_buildTrackRibbon()`: if `!this.hasPlaybackStarted`, set `drawRange` to `(n - 1) * 24` for the 3D diamond prism ribbon mesh, and `n` for the variometer centerline spine.
   - In `_buildDropCurtain()`: if `!this.hasPlaybackStarted`, set `drawRange` to `this._totalCurtainVertices`.
   - In `_updateTraveledTrack(currentPoint)`: added Case 0 guard `if (!this.hasPlaybackStarted)` to keep 100% draw range and return early without truncating geometry.
3. **Deterministic Transition to Dynamic Traveled Track**:
   - In `play()`: set `this.hasPlaybackStarted = true;` and immediately call `_updateTraveledTrack(currentPoint)` before starting the animation loop. At takeoff ($p = 0$), the track draw range collapses to 0 and dynamically expands frame by frame at 60 FPS behind the avatar.
   - In `seek(progressFraction)`: set `this.hasPlaybackStarted = true;` and immediately render the track traveled up to the scrubbed fraction.
4. **Headless Replay Engine Alignment (`ui/3d/HeadlessReplayEngine.js`)**:
   - Updated `getTraveledPoints()` to return `[...this.trackPoints]` if `!this.hasPlaybackStarted`, switching to the sliced sub-array only once playback or seeking is initiated.

## 4. Verification & Automated Test Coverage
- Enhanced `tests/ui/replayTakeoffLandingTrackVisibility.test.mjs`:
  1. `should show full track on initial load and switch to traveled track only when play() is called`: verifies full ribbon, centerline, and curtain draw ranges upon `loadTrack()`, followed by instant collapse to 0 and dynamic playback start on `play()`.
  2. `should clamp to 0 track drawRange when seek(0) is called (at takeoff)`: verifies explicit timeline seek to 0 activates `hasPlaybackStarted = true` and clamps draw range to 0.
  3. `HeadlessReplayEngine should return traveledPoints array reflecting playback progress`: verifies `getTraveledPoints()` returns all points on load, and 0 points after `seek(0)`.
- Full test suite execution: `npm test` -> 725 passed, 0 failed, 1 skipped across 125 test suites.
