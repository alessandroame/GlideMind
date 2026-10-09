# GlideMind Architecture & Engineering Constraints

## 1. Structural Architecture: Decoupled Core vs UI Shell
1. **Headless Domain Core (`core/`)**:
   - Must contain pure computational algorithms, mathematical transformations, data parsers, and API fetch wrappers.
   - **Zero DOM Dependencies**: Files in `core/` must NEVER directly reference `window`, `document`, `localStorage`, or CSS selectors. They must be 100% executable and testable in pure Node.js test runners without JSDOM.
   - **Injectable Storage Adapter**: Persistence mechanisms used by `core/store.js` must operate via an injectable `storageAdapter` interface, defaulting to an in-memory map under Node.js and binding to `localStorage`/`IndexedDB` only when mounted in the browser shell.
2. **Modular Component-Driven UI (`ui/`)**:
   - The UI is composed of self-contained components or views (e.g. `HomeDashboardView`, `ForecastView`, `SpotMapView`, `LogbookView`, `SettingsView`).
   - Monolithic files (>1,000 lines of mixed UI and state) are strictly forbidden.
   - `index.html` is an ultralight application shell (<200 lines) with designated mounting targets.
3. **Single Source of Truth (SSOT) & Reactive State (`core/store.js`)**:
   - Application state (selected spot, active date, filter criteria, cached flights) resides in a centralized reactive store with deterministic pub/sub events.
   - Views subscribe to state slices; views NEVER mutate state directly through DOM querying or sibling hacking.

---

## 2. Coding Standards
- **Language**: English for all code identifiers, functions, variables, comments, and commit messages.
- **Single Responsibility Principle (SRP)**:
  - Each module handles one cohesive domain (e.g., `igcParser.js` parses files; `flightTelemetry.js` calculates kinematics).
- **Zero Workarounds & Anti-Hack Policy**:
  - Banned: Arbitrary `setTimeout` hacks to mask race conditions, `!important` cascades to fix broken layouts, monkey-patching, and ad-hoc global variables.
  - Mandatory root-cause resolution for every bug.

---

## 3. UI & Ergonomic Constraints (Outdoor Mobile Interface)
- **Dual High-Contrast Theme Engine (Outdoor Sunlight Resilient)**: Default glare-resistant dark cockpit theme and high-luminance sunlight light mode (`data-theme="light"`), strictly governed via CSS custom properties (`var(--gm-bg-base)`, `var(--gm-bg-card)`, etc.) with verified WCAG 2.1 AA contrast ratios ($\ge 4.5:1$).
- **Zero Horizontal Scrollbar**: The application must never trigger horizontal scrolling.
- **Controlled Viewport & Scrolling**: Document/dashboard views adopt natural vertical scrolling; full-viewport map and 3D replay views manage their own canvas containers (`height: 100dvh`, `touch-action: none` / cooperative gesture handling).
- **Touch Target Floor**: Every clickable/tappable element must strictly provide $\ge 44 \times 44\text{ px}$ effective touch area (with $\ge 48\text{px}$ preferred where layout permits).
- **Dynamic Viewport (`100dvh`)**: Mobile layout must compute against `100dvh` to eliminate iOS Safari / Android Chrome toolbar clipping.
- **Zero Icon Clutter**: Icons are restricted to functional, actionable controls or safety markers. No decorative icons in section titles.

---

## 4. Progressive Web App (PWA) & Offline-First
- Service worker (`sw.js`) with cache-first strategy for static assets and pass-through mode for `open-meteo.com` (delegating meteorological caching to `core/openMeteoApi.js`).
- Web App Manifest (`manifest.json`) compliant with PWA installability criteria.
- Local persistence via `LocalStorage` (app preferences) and `IndexedDB` (flight log tracks and binary blobs).
