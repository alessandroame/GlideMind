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
The core algorithms of **ParaMeteo** (flyability waterfall scoring, thermodynamic soundings, IGC parser, 3D flight replay kinematics, maneuvers detection) represent an established, mathematically verified aeronautical logic base.

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
- [x] Build minimal `index.html` shell (<200 lines, implemented at 108 lines).
- [x] Implement CSS design tokens in `css/theme.css`:
  - High-Contrast Dark palette (`--gm-bg-base: #070d18`, `--gm-bg-card: #0f1c30`, etc.).
  - Fitts's law touch minimums ($44\text{px}$).
  - Single-row horizontal scroll snap carousels (`.gm-carousel`).
- [x] Implement `core/store.js` (Reactive State Engine with Pub/Sub and injectable storage adapter).
- [x] Implement `ui/router.js` (5-tab navigation manager: Home, Forecast, Map, Logbook, Settings).
- [x] Implement `ui/sheetManager.js` (Full-height drawers and sheets, zero trapped modals).
- [x] **Quality Gate 2**: 100% tests passing in Node.js (173/173 pass across 18 test suites).

### Phase 3: Home Dashboard View (Completata)
- [x] Implement `core/comprensorio.js` (Comprensorio normalization, glide cone to landing $E_{\text{richiesta}}$, dual launch/landing flyability evaluation, and dynamic sorting).
- [x] Implement `ui/views/HomeDashboardView.js`:
  - **Block 1**: Volabilità Comprensori dynamically sorted by flyability descending (Flyable -> Caution -> Unflyable) with $T_{\text{best}}$, $L_{\text{safe}}$, and Explainability reasoning (Zero PIN/favorites clutter, instant search filter).
  - **Block 2**: Pilot Activity & Currency summary with high-contrast primary CTA `+ Carica Traccia IGC` ($\ge 48\text{px}$).
- [x] **Quality Gate 3**: 100% tests passing in Node.js (191/191 pass across 25 test suites).

### Phase 4: Weather & Flyability Dashboard (Completata)
- [x] Implement `ui/views/ForecastView.js`:
  - **Hourly Flyability Timeline**: Interactive waterfall bars (color-coded, tap to scrub).
  - **360° Windsock & Wind Direction Indicator**: Takeoff azimuth vs hourly wind vector with cross-wind warning cone.
  - **Sounding & Lapse Rate Panel**: Atmospheric temperature vs dew point curves, LCL cloud base, and inversion altitudes.
  - **AI Flight Briefing (Guido)**: 1-click voice/text briefing with concise safety persona.

### Phase 5: Spot Map & Mappa della Volabilità ("Dove Volare Oggi")
- [ ] Implement `ui/views/SpotMapView.js`:
  - **Cartografia & Base Layers**: Mappa interattiva a pieno schermo con rendering condizionato/lazy (`mount`) e Headless Map Adapter per testabilità 100% in Node.js puro senza globali DOM.
  - **Vista Macro a Bacini di Volabilità (Stile Paraglidable Sostenibile)**:
    - Aureole semitrasparenti di comprensorio (raggio 8-12 km) con codifica colore semantica reattiva (🟢 Aperto, 🟡 Cautela, 🔴 Chiuso) calcolata deterministicamente con `evaluateComprensorio`.
    - Colpo d'occhio immediato a livello regionale sull'arco alpino e appenninico senza interpolazioni continue orograficamente ingannevoli.
  - **Vista Micro Aeronautica (Zoom Progressivo >= 11)**:
    - Decollo primario ($T_{\text{best}}$): cono azimutale di decollo e freccia del vento reale calcolata a quota decollo.
    - Atterraggio di rientro ($L_{\text{safe}}$): linea di collegamento e cono di planata aerodinamica ($E_{\text{richiesta}} \le E_{\text{glider}}$) parametrato sull'ala attiva del pilota (EN-A/B/C/D).
  - **Timeline di Scrubbing Orario Integrata**:
    - Slider/stepper orario compatto (09:00 - 18:00) sincronizzato con `store.activeDate` e `store.activeHourIndex`.
    - Ricalcolo istantaneo in RAM di tutti i comprensori visibili in $<50\text{ms}$ a costo di rete zero.
  - **Ingestione Meteo a Catalogo Statico**:
    - Query batch Open-Meteo limitata ai comprensori del catalogo registrato (`data/locations.json`) con cache in-memory LRU (TTL 30 min) in `openMeteoApi.js`.
    - Zero query ridondanti o combinatorie su pan e zoom (eliminazione totale del rischio di blocco HTTP 429).
  - **Filtro di Raggio "Dove Volare Oggi"**:
    - Selettore rapido (50 km / 100 km / 150 km dalla posizione GPS o dal punto focale) con attenuazione dei siti fuori raggio o chiusi.
  - **Scheda Rapida Comprensorio (Bottom Sheet)**:
    - Tap sull'aureola o marker: apertura drawer non bloccante (`SheetManager.js`) con metriche essenziali di sicurezza e CTA diretto a `ForecastView.js`.

### Phase 6: Flight Logbook & Telemetry Module
- [ ] Implement `core/logbookDb.js`:
  - Storage driver pattern con driver asincrono IndexedDB (`createIndexedDbAdapter`) e driver in-memory (`createMemoryDbAdapter`) per esecuzione headless e test in Node.js.
  - Schema a due livelli anti-bloat: `flights_meta` per rendering ultraveloce delle liste e KPI, e `flights_raw` per blob IGC e tracce GPS dettagliate (caricamento on-demand per il replay).
- [ ] Implement `ui/views/LogbookView.js`:
  - Inserimento traccia IGC con drag-and-drop / file picker e parsing automatico immediato.
  - Card di volo strutturate con profilo altimetrico sintetico, durata, conteggio termiche rilevate e vela associata.
  - Contatori KPI di carriera (ore totali, numero voli, quota massima, volo più lungo).

### Phase 6-bis: Backup, Auto-Sync & Restore Engine
- [ ] Implement `core/backupManager.js` & `core/syncDirtyTracker.js`:
  - **Full System Snapshot**: Esportazione e importazione dell'intero stato applicativo (impostazioni LocalStorage, vele, località personalizzate + voli e tracce IndexedDB) in un singolo file `.json`. Opzioni di ripristino: *Sovrascrittura Completa* (Reconstruct) o *Unione Non Distruttiva* (Smart Merge senza duplicati).
  - **Backup & Restore Modulare del Logbook**: Esportazione e ripristino dedicati e indipendenti per il solo libretto di volo (metadati e tracce IGC), per consentire al pilota di archiviare o trasferire i propri voli separatamente dalle preferenze dell'app.
  - **Auto-Sync & Dirty Tracking**: Rilevamento in memoria delle modifiche pendenti non archiviate (`syncDirtyTracker`), promemoria periodico discreto di backup (se trascorsi >14 giorni o $\ge 3$ nuovi voli) e predisposizione architetturale per adapter di cloud sync (Google Drive / remote folder).

### Phase 7: 3D Flight Replay with Synced Telemetry (Dual-Engine Architecture)
- [ ] Implement `ui/views/FlightReplayView.js`:
  - **Interfaccia Astratta del Motore 3D (`IReplay3dEngine`)**:
    - Disaccoppiamento totale tra controller UI, controlli playback (play, pause, scrub, velocità 1x-20x, camera follow modes) e rendering 3D.
    - Telemetry strip 2D sincronizzata a 60 FPS su Canvas 2D (altitudine, vario con decimazione LTTB) autonoma rispetto al rendering del terreno.
  - **Engine Primario**: MapLibre GL 3D + Three.js CustomLayer (conforme a `geodesy_webgl_3d_spec.md` con decodifica DEM Terrarium e modello parapendio `.glb` in `data/models/`).
  - **Engine di Fallback Consolidato**: CesiumJS (con coordinate cartesiane WGS84 native, come empiricamente verificato nei test ParaMeteo), pronto a intervenire senza riscritture dell'interfaccia o della telemetria in caso di anomalie sul layer MapLibre.

### Phase 8: PWA, Multilingual (i18n) & Offline Hardening
- [ ] Service worker (`sw.js`) con cache-first per asset statici locali e modalità pass-through trasparente per tile cartografiche esterne (AWS S3 Terrarium, OpenTopoMap) per prevenire quote exceeded.
- [ ] Web App Manifest (`manifest.json`) con icone ad alto contrasto per installazione standalone.
- [ ] Supporto i18n per 4 lingue (Italiano, Inglese, Francese, Tedesco) con dizionari iniettati come dipendenze pure.
- [ ] Audit di accessibilità WCAG 2.1 AA e verifica leggibilità outdoor sotto luce solare diretta.

---

## 5. Verification & Ground-Truth Protocol

In accordance with `anti_sycophancy_integrity.md`:
1. **No Faux Testing**: Every algorithm must be verified with real recorded flight data (e.g. valid IGC files and real Open-Meteo JSON responses).
2. **Visual Verification**: Every view will be visually inspected on simulated mobile viewports ($390 \times 844\text{ px}$) using headless browser screenshots.
3. **Ergonomic Verification**: Verify touch target hitboxes ($\ge 44\text{px}$) and ensure zero horizontal scrolling across all screens.
