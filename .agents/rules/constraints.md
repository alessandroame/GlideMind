# GlideMind Architecture & Engineering Constraints

## 1. Structural Architecture: Decoupled Core vs UI Shell

1. **Headless Domain Core (`core/`)**:
   - Strictly governed by [`engineering-workflow`](file:///c:/github/antigravity-plugins/plugins/engineering-workflow) (Section 4): zero DOM references, 100% testable in pure Node.js without JSDOM, and injectable `storageAdapter` interface (in-memory for Node.js, `localStorage`/`IndexedDB` for browser).
2. **Modular Component-Driven UI (`ui/`)**:
   - The UI is composed of self-contained views (`HomeDashboardView`, `ForecastView`, `SpotMapView`, `LogbookView`, `SettingsView`).
   - Monolithic files (>1,000 lines of mixed UI and state) are strictly forbidden.
   - `index.html` is an ultralight application shell (<200 lines) with designated mounting targets.
3. **Single Source of Truth (SSOT) & Reactive State (`core/store.js`)**:
   - Application state (selected spot, active date, filter criteria, cached flights) resides in a centralized reactive store with deterministic pub/sub events.
   - Views subscribe to state slices; views NEVER mutate state directly through DOM querying or sibling hacking.

---

## 2. Coding Standards & Governance

- **Language & Conventions**: Governed centrally by [`engineering-workflow`](file:///c:/github/antigravity-plugins/plugins/engineering-workflow) (Section 3): strict English in all identifiers, comments, tests, and logs.
  - **GlideMind UI Exception**: User-facing copy in the application interface is localized in Italian according to product specs. Dictionary keys remain in English.
- **Anti-Hack & Zero Workarounds**: Governed centrally by [`engineering-sobriety`](file:///c:/github/antigravity-plugins/plugins/engineering-sobriety): mandatory root-cause resolution for every bug.

---

## 3. UI & Ergonomic Constraints (Outdoor Mobile Interface)

- **General Outdoor HMI**: Governed centrally by [`laws-of-ux`](file:///c:/github/antigravity-plugins/plugins/laws-of-ux) (Section 8) and skill `ux-outdoor-and-field-ergonomics` (touch target floor $\ge 44\text{px}$/$\ge 48\text{px}$, single-row `pan-x` carousels, dynamic `100dvh`, zero icon clutter).
- **GlideMind Theme Custom Properties**: Dual theme engine (dark cockpit + `[data-theme="light"]` sunlight mode) strictly governed via CSS custom properties (`var(--gm-bg-base)`, `var(--gm-touch-min)`, `var(--gm-text-primary)` in `css/theme.css`) with WCAG 2.1 AA contrast $\ge 4.5:1$.
- **Controlled Viewport & Gestures**: Dashboard views adopt vertical scrolling; full-viewport map and 3D replay manage their canvas containers (`height: 100dvh`, cooperative gestures / `touch-action: pan-y`).

---

## 4. Progressive Web App (PWA) & Offline-First

- Service worker (`sw.js`) with cache-first strategy for static assets and pass-through mode for `open-meteo.com` (delegating meteorological caching to `core/openMeteoApi.js`).
- Web App Manifest (`manifest.webmanifest`) compliant with PWA installability criteria.
- Local persistence via `LocalStorage` (app preferences) and `IndexedDB` (flight log tracks and binary blobs).
