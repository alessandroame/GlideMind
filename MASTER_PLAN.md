# 🦅 GlideMind - Master Architecture & Execution Plan

> **Rebuilding Free-Flight Weather & Logbook Tools with a Touch-First Outdoor UX**  
> *Project*: `GlideMind` (Evolution and Complete UI Redesign of `ParaMeteo`)  
> *Target Workspace*: `C:\github\GlideMind`  
> *Reference Repository*: `C:\github\ParaMeteo`  
> *Author*: Google DeepMind Antigravity Pair Programmer & Alessandro Amè  
> *Version*: 1.0.0 (Piano Architetturale)

---

## 1. Executive Summary & Vision

### 1.1 The Premise
The core algorithms of **ParaMeteo** (flyability waterfall scoring, thermodynamic soundings, IGC parser, 3D flight replay kinematics, maneuvers detection, Peter Pan flight syllabus) represent an established, mathematically verified aeronautical logic base.

However, the user interface suffered from architectural fatigue:
- A single monolithic HTML file exceeding 170 KB.
- Giant imperatively-driven UI scripts (`ui.js` at 174 KB, `logbookUi.js` at 344 KB) manipulating global DOM nodes.
- Fragile modal stacking and scroll-traps on mobile devices.
- High cognitive load for outdoor pilots wearing gloves in high-glare launchpad environments.

### 1.2 The Goal of GlideMind
**GlideMind** riprogetta integralmente l'interfaccia utente riutilizzando la logica di dominio collaudata.
The new application will deliver:
1. **Zero-Clutter Outdoor Ergonomics**: Mobile-first, glare-resistant dark mode, 44px Fitts's law touch targets, zero nested modals.
2. **Decoupled Headless Core**: Pure mathematical and domain algorithms isolated in `core/` with zero DOM dependencies and 100% automated test coverage.
3. **Component-Based UI Shell**: Lightweight, modular view components (`ui/views/`) with centralized reactive state (`GlideStore`) and deterministic routing.
4. **Instant Safety Overview**: Clear indicators of launch safety, wind evolution, and thermal ceiling.

---

## 2. Decoupling Strategy: The Headless Engine vs The Modern Shell

```
+--------------------------------------------------------------------------+
|                       GLIDEMIND ARCHITECTURE                             |
+--------------------------------------------------------------------------+
|  PRESENTATION LAYER (ui/)                                                |
|  +--------------------+ +--------------------+ +----------------------+  |
|  | Home View          | |   Forecast View    | |   Spot Map View      |  |
|  +--------------------+ +--------------------+ +----------------------+  |
|  | Flight Logbook View| | 3D Replay View     | |   Settings & Hangar  |  |
|  +--------------------+ +--------------------+ +----------------------+  |
|  | Components: Single-Row Carousels | 360° Windsock | 44px Touch Hits |  |
|  +--------------------------------------------------------------------+  |
|  | Sheet & Drawer Manager (Zero Nested Modals, Full 100dvh Drawers)   |  |
+--------------------------------------------------------------------------+
                                    ▲
                         Events & Pub/Sub Subscriptions
                                    ▼
+--------------------------------------------------------------------------+
|  STATE & PERSISTENCE LAYER (core/store.js & core/db.js)                  |
|  +-----------------------------+  +-----------------------------------+  |
|  | Reactive GlideStore         |  | Storage Engines                   |  |
|  | - Active Site & Date        |  | - LocalStorage: Preferences/Cache |  |
|  | - Flyability Timeline State |  | - IndexedDB: Flights/IGC Blobs    |  |
|  +-----------------------------+  +-----------------------------------+  |
+--------------------------------------------------------------------------+
                                    ▲
                             Pure Function Calls
                                    ▼
+--------------------------------------------------------------------------+
|  HEADLESS DOMAIN CORE (core/) [Zero DOM Dependencies, Pure Node Testable]|
|  +--------------------------------------------------------------------+  |
|  | flyability.js          -> Waterfall paragliding safety algorithm   |  |
|  | openMeteoApi.js        -> Weather fetching, pressure levels & cache|  |
|  | soundingsMath.js       -> LCL Cloud Base, Magnus-Tetens, Lapse Rate|  |
|  | igcParser.js           -> B-record GPS telemetry parsing           |  |
|  | flightManeuvers.js     -> Thermals, 360s, wingovers, spirals       |  |
|  | flightTelemetry.js     -> LTTB decimation, ground speed, glide ratio| |
|  | geoSpatialMath.js      -> Great circle, bearing, wind off-axis     |  |
|  | sitesDatabase.json     -> Italian & Alpine takeoff registry        |  |
|  | syllabusData.js        -> Peter Pan flight school maneuver matrix  |  |
+--------------------------------------------------------------------------+
```

---

## 3. Technology Stack Evaluation

| Layer | Choice | Rationale |
| :--- | :--- | :--- |
| **Language & Runtime** | Vanilla Modern JavaScript (ES2023+ ES Modules) | Zero heavy bundler friction, instant browser reload, native PWA compatibility. |
| **CSS & Design System** | Tailwind CSS (Tailwind v3.4+ or compiled lightweight build) + High-Contrast CSS Custom Properties | Rapid layout iteration with consistent tokens (`--gm-bg-base`, `--gm-accent-sky`, `--gm-accent-emerald`, etc.). |
| **Component Model** | Lightweight Functional View Controllers (`render()`, `mount(el)`, `destroy()`) | Eliminates framework lock-in while providing true encapsulation and lifecycle management. |
| **State Management** | Centralized Reactive Store with lightweight Signals/Pub-Sub | Predictable state updates with single source of truth (SSOT). |
| **Map Rendering** | Leaflet or MapLibre GL with OpenTopoMap / Satellite | Smooth cartography with dynamic wind cones and landing zones. |
| **3D Trajectory Replay**| CesiumJS or Three.js + MapLibre CustomLayer with Terrarium DEM | Accurate terrain rendering with WGS84 single-shot origin alignment. |
| **Telemetry Charts** | Canvas 2D Double-Buffered rendering with LTTB decimation | 60 FPS scrubbing without GC jank across 50,000 GPS points. |
| **Testing Harness** | Node.js native test runner (`node:test` + `node:assert`) | Zero external test dependencies, sub-second test execution. |

---

## 4. Phased Implementation Roadmap

### Phase 0: Workspace Foundation & Governance (Completata)
- [x] Configure `.agents/skills` with domain knowledge (`outdoor-hmi-touch`, `flyability-evaluator`, `open-meteo-integration`, `ai-briefing-gemini`, `geodesy-webgl-3d`).
- [x] Configure `.agents/rules` with architectural constraints (`constraints.md`, `ui_layout_spec.md`, `anti_sycophancy_integrity.md`, `geodesy_webgl_3d_spec.md`, `testing_weather_mock_guard.md`).
- [x] Configure global Antigravity plugins (`engineering-sobriety`, `engineering-workflow`, `execution-guard`, `laws-of-ux`, `cognitive-persistence`, `proactive-mentorship`).
- [x] Initialize `package.json`, `.gitignore`, dev server harness (`scripts/serve.js`), and smoke test runner (`node --test`).

### Phase 1: Core Engine Migration & Automated Test Harness
- [x] Extract pure logic modules from `C:\github\ParaMeteo\js\` into `C:\github\GlideMind\core\`:
  - `core/flyability.js` (waterfall algorithm)
  - `core/geoSpatialMath.js` (geodesic formulas)
  - `core/soundingsMath.js` (thermodynamic soundings, LCL cloud base)
  - `core/igcParser.js` (IGC B-record parser)
  - `core/flightTelemetry.js` (LTTB decimation & flight kinematics)
  - `core/flightManeuvers.js` (thermals, spirals, wingovers detector)
  - `core/openMeteoApi.js` (weather client with mock support)
- [x] Implement automated unit test suite in `tests/core/`:
  - `tests/core/flyability.test.mjs`
  - `tests/core/geoSpatialMath.test.mjs`
  - `tests/core/soundingsMath.test.mjs`
  - `tests/core/igcParser.test.mjs`
  - `tests/core/flightTelemetry.test.mjs`
  - `tests/core/flightManeuvers.test.mjs`
  - `tests/core/openMeteoApi.test.mjs`
- [x] **Quality Gate 1**: 100% tests passing in Node.js with zero DOM mocks (149/149 pass).

### Phase 2: Design System & Shell Architecture
- [ ] Build minimal `index.html` shell (<200 lines).
- [ ] Implement CSS design tokens in `css/theme.css`:
  - High-Contrast Dark palette (`--gm-bg-base: #070d18`, `--gm-bg-card: #0f1c30`, etc.).
  - Fitts's law touch minimums ($44\text{px}$).
  - Single-row horizontal scroll snap carousels (`.gm-carousel`).
- [ ] Implement `core/store.js` (Reactive State Engine).
- [ ] Implement `ui/router.js` (5-tab navigation manager: Home, Forecast, Map, Logbook, Settings).
- [ ] Implement `ui/sheetManager.js` (Full-height drawers and sheets, zero trapped modals).

### Phase 3: Home Dashboard View
- [ ] Implement `ui/views/HomeDashboardView.js`:
  - **Date Scrubber**: Quick pills (Today, Tomorrow, Weekend, Calendar).
  - **Pinned Takeoffs Carousel**: Horizontal swipeable cards with live flyability status badge, takeoff heading, and wind vector arrow.
  - **Quick Search & Spot Selector**: Instant filtering by name, region, or GPS distance.
  - **Nowcast Summary**: High-contrast summary card with primary launch safety verdict.

### Phase 4: Weather & Flyability Dashboard
- [ ] Implement `ui/views/ForecastView.js`:
  - **Hourly Flyability Timeline**: Interactive waterfall bars (color-coded, tap to scrub).
  - **360° Windsock & Wind Direction Indicator**: Takeoff azimuth vs hourly wind vector with cross-wind warning cone.
  - **Sounding & Lapse Rate Panel**: Atmospheric temperature vs dew point curves, LCL cloud base, and inversion altitudes.
  - **AI Flight Briefing (Guido)**: 1-click voice/text briefing with concise safety persona.

### Phase 5: Spot Map & "Dove Volare Oggi" Finder
- [ ] Implement `ui/views/SpotMapView.js`:
  - Full-viewport map with toggleable satellite / terrain base layers.
  - Takeoff cones colored dynamically by wind alignment.
  - Official and emergency landings with glide ratio cones.
  - "Dove Volare Oggi" radius filter: finds top flyable spots within $X\text{ km}$.

### Phase 6: Flight Logbook & Telemetry Module
- [ ] Implement `core/logbookDb.js` (IndexedDB storage for tracks and metadata).
- [ ] Implement `ui/views/LogbookView.js`:
  - Drag-and-drop IGC upload with instant parsing.
  - Flight cards with altitude profile, duration, thermal count, and glider name.
  - Career KPI counters (Total hours, flights, max altitude, longest flight).
  - Peter Pan flight training syllabus checklist with 1-click Excel export.

### Phase 7: 3D Flight Replay with Synced Telemetry
- [ ] Implement `ui/views/FlightReplayView.js`:
  - WebGL 3D flight path over real elevation DEM terrain.
  - Double-buffered 2D telemetry strip (altitude, vario, ground speed) with LTTB decimation.
  - Playback controls (play, pause, scrub, speed 1x-20x, camera follow modes).

### Phase 8: PWA, Multilingual (i18n) & Offline Hardening
- [ ] Service worker (`sw.js`) with cache-first static assets and network-first weather cache.
- [ ] Web App Manifest (`manifest.json`) with high-contrast icons.
- [ ] i18n support across 4 languages (Italian, English, French, German).
- [ ] Audit for WCAG 2.1 AA accessibility and outdoor sunlight readability.

---

## 5. Verification & Ground-Truth Protocol

In accordance with `anti_sycophancy_integrity.md`:
1. **No Faux Testing**: Every algorithm must be verified with real recorded flight data (e.g. valid IGC files and real Open-Meteo JSON responses).
2. **Visual Verification**: Every view will be visually inspected on simulated mobile viewports ($390 \times 844\text{ px}$) using headless browser screenshots.
3. **Ergonomic Verification**: Verify touch target hitboxes ($\ge 44\text{px}$) and ensure zero horizontal scrolling across all screens.
