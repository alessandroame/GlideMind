# Worklog Fragment: Aim Sub-Menu Dropdown & Timeline Scrubber Unification

## Context
Following user design feedback:
1. Merge the two separate map centering controls (`Comprensorio` and `GPS`) into an aim sub-menu triggered by a crosshair/sight icon (`mirino`) across all cartographic views.
2. Unify the floating timeline scrubber header across `SpotMapView`, `ForecastView` (sticky scrubber), and `ForecastView` (flight analysis overlay) with consistent structure: title ("Timeline Volabilità"), spot status pill with dynamic flyability color, and active hour display ("Ore XX:00").

## Changes Implemented

### 1. Unified CSS Styles (`css/theme.css`)
- Defined `.gm-aim-menu-wrap`, `.gm-aim-menu-trigger`, `.gm-aim-chevron`, `.gm-aim-dropdown`, and `.gm-aim-menu-item`.
- Implemented high-contrast frosted glass aesthetics (`backdrop-filter: blur(14px)`) conforming to dark and sunlight light themes (`[data-theme="light"]`).
- Maintained minimum touch target floor $\ge 44\text{px}$ / $\ge 48\text{px}$ for outdoor usability.

### 2. Spot Map View (`ui/views/SpotMapView.js`)
- Replaced separate centering controls with `.gm-aim-menu-wrap` containing `#gm-map-aim-trigger` (crosshair icon + directional indicator) and `#gm-map-aim-dropdown` containing `#gm-map-top-spot-btn` and `#gm-map-gps-btn`.
- Added reactive controller methods: `toggleAimMenu(forceOpen)`, `closeAimMenu()`, `handleDocumentClick(e)`, and `handleDocumentKey(e)`.
- Bound outside click listeners and `Escape` key listeners to dismiss the aim menu.
- Enforced uniform scrubber header with `#gm-map-scrubber-spot-pill` and `#gm-map-active-hour-label`.

### 3. Forecast View (`ui/views/ForecastView.js`)
- Replaced separate centering buttons in `openFlightAnalysisOverlay()` with the identical aim menu dropdown with crosshair trigger.
- Harmonized both `renderStickyScrubber()` and flight analysis overlay timeline headers with the unified `.gm-map-scrubber-header` layout.
- Added `toggleFlightAnalysisAimMenu(forceOpen)`, `closeFlightAnalysisAimMenu()`, and outside click auto-dismissal.
- Synchronized `#forecast-scrubber-spot-pill`, `#forecast-active-hour-label`, `#flight-analysis-scrubber-spot-pill`, and `#flight-analysis-active-hour-label` on hourly scrubbing.

### 4. Automated Test Suites
- Updated `tests/ui/spotMapView.test.mjs` with assertions for aim menu markup, toggle state (`aria-expanded`), and unified scrubber header.
- Updated `tests/ui/forecastView.test.mjs` with assertions for flight analysis aim menu and uniform timeline scrubber structure.
- Executed complete suite (`npm test`): 446 passing tests across 61 test suites with 0 regressions.

## Pre-Delivery Verification
- **Gate 1 (Headless Domain Core)**: Core logic remains 100% headless with zero DOM references.
- **Gate 2 (Rigore di Implementazione)**: Strict English identifiers and comments, Italian copy for user-facing UI.
- **Gate 3 (Automated Quality Gates)**: `npm test` verified cleanly with 446 passing tests.
- **Gate 4 (Ergonomia & Touch Targets)**: Minimum touch targets $\ge 44\text{px}$, responsive flexbox without truncation.
- **Gate 5 (Sobriety & Zero Icon Clutter)**: Zero decorative emojis; functional crosshair SVG indicator.
