# Worklog Fragment: External Bottom-Anchored Timeline Scrubber

## Context
User requirement: "la timeline deve essere ancorata in basso ed esterna alla mappa" (The timeline scrubber must be anchored at the bottom and strictly external to the map canvas).
Previously, `.gm-map-scrubber-container` was nested inside `<div class="gm-map-canvas-wrapper">` as an absolute floating card with `bottom: 16px; left: 12px; right: 12px; pointer-events: none;`. This caused the lower portion of the Leaflet map and markers to be partially obscured behind the scrubber, and risked gesture conflicts with map panning.

## Changes Implemented

### 1. Architectural DOM Refactoring (`ui/views/SpotMapView.js`)
- Closed `<div class="gm-map-canvas-wrapper">` immediately following the floating canvas controls (`.gm-map-canvas-controls`).
- Moved `<footer class="gm-map-scrubber-container">` outside of the map canvas wrapper, establishing it as a direct flex child of `<section class="gm-map-view">`.
- Layout structure now consists of three distinct, non-overlapping flex zones:
  1. `header.gm-map-top-bar`: Fixed 50px top external filter toolbar.
  2. `div.gm-map-canvas-wrapper`: Flexible, clean map canvas container (`flex: 1 1 0%; min-height: 0;`), unobstructed across its full viewport height.
  3. `footer.gm-map-scrubber-container`: Rigid bottom external bar (`flex-shrink: 0;`) containing the unified 13-slot timeline scrubber.

### 2. Layout & Theme CSS (`css/theme.css`)
- Converted `.gm-map-scrubber-container` from absolute floating position to a solid, docked bottom bar:
  - `position: relative; width: 100%; flex-shrink: 0; z-index: 500;`
  - Solid background `var(--gm-bg-surface)` in dark mode and `#ffffff` in `[data-theme="light"]`.
  - Upper divider `border-top: 1px solid var(--gm-border)` (dark) and `rgba(0, 0, 0, 0.12)` (light) with elevated drop-shadow (`box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.35)`).
  - Compact padding (`6px 12px 8px`) ensuring zero vertical wastage while preserving the Fitts touch floor.
- Adjusted `.gm-map-scrubber-inner` with `max-width: 680px; margin: 0 auto; touch-action: none;`.

### 3. Automated Regression Guard (`tests/ui/spotMapView.test.mjs`)
- Added architectural assertion in `tests/ui/spotMapView.test.mjs`:
  `assert.equal(canvasWrapper.contains(scrubberContainer), false, 'Timeline scrubber must be strictly external to the map canvas wrapper');`
- Executed full test suite (`npm test`): 447 tests passing across 61 test suites with 0 failures.

## Quality Gates & Verification
- **Gate 1 (Headless Domain Core)**: Core logic untouched; pure headless mock in Node.js.
- **Gate 2 (Rigore di Implementazione)**: Strict English identifiers and comments, Italian user-facing copy.
- **Gate 3 (Test Suite Governance)**: 447/447 tests green.
- **Gate 4 (Ergonomia & Touch Targets)**: Scrubber touch slots and header retain compliant heights; map canvas receives 100% unobstructed touch gestures.
- **Gate 5 (Sobriety & Zero Clutter)**: Clean solid panel without visual noise.
