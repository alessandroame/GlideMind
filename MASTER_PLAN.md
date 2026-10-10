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

### Phase 0: Workspace Foundation & Governance (🟢 Completata)
- [x] Configure `.agents/skills` with domain knowledge (`flyability-evaluator`, `open-meteo-integration`, `ai-briefing-gemini`, `geodesy-webgl-3d`) and global plugins (`ux-outdoor-and-field-ergonomics`).
- [x] Configure `.agents/rules` with architectural constraints (`constraints.md`, `ui_layout_spec.md`, `anti_sycophancy_integrity.md`, `geodesy_webgl_3d_spec.md`, `testing_weather_mock_guard.md`).
- [x] Configure global Antigravity plugins (`engineering-sobriety`, `engineering-workflow`, `execution-guard`, `laws-of-ux`, `cognitive-persistence`, `proactive-mentorship`).
- [x] Initialize `package.json`, `.gitignore`, dev server harness (`scripts/serve.js`), and smoke test runner (`node --test`).

### Phase 1: Core Engine Migration & Automated Test Harness (🟢 Completata)
- [x] Extract pure logic modules from `C:\github\ParaMeteo\js\` into `C:\github\GlideMind\core\`:
  - `core/flyability.js` (waterfall algorithm)
  - `core/geoSpatialMath.js` (geodesic formulas)
  - `core/soundingsMath.js` (thermodynamic soundings, LCL cloud base)
  - `core/igcParser.js` (IGC B-record parser)
  - `core/flightTelemetry.js` (LTTB decimation & flight kinematics)
  - `core/flightManeuvers.js` (thermals, spirals, wingovers detector)
  - `core/openMeteoApi.js` (weather client with mock support)
- [x] Implement automated unit test suite in `tests/core/`.
- [x] **Quality Gate 1**: 100% tests passing in Node.js with zero DOM mocks (149/149 pass).

### Phase 2: Design System & Shell Architecture (🟢 Completata)
- [x] Build minimal `index.html` shell (<200 lines, implemented at 108 lines).
- [x] Implement CSS design tokens in `css/theme.css`:
  - High-Contrast Dark palette (`--gm-bg-base: #070d18`, `--gm-bg-card: #0f1c30`, etc.).
  - Fitts's law touch minimums ($\ge 48\text{px}$).
  - Single-row horizontal scroll snap carousels (`.gm-carousel`).
- [x] Implement `core/store.js` (Reactive State Engine with Pub/Sub and injectable storage adapter).
- [x] Implement `ui/router.js` (5-tab navigation manager: Home, Forecast, Map, Logbook, Settings).
- [x] Implement `ui/sheetManager.js` (Full-height drawers and sheets, zero trapped modals).
- [x] **Quality Gate 2**: 100% tests passing in Node.js (173/173 pass across 18 test suites).

### Phase 2-bis: Brand Identity, Icon Bundle & Splash Screen (🟢 Completata)
- [x] Piano architetturale: [docs/plans/phase-2-bis-brand-identity.md](file:///docs/plans/phase-2-bis-brand-identity.md).
- [x] Master vettoriale SVG alare (`assets/icons/glidemind-wing.svg`) e bundle icone PWA (192x192, 512x512, maskable, apple-touch-icon).
- [x] Splash screen antiriflesso a trama carbonio zero-FOUC con transizione Doherty (<400ms).

### Phase 3: Home Dashboard View (🟢 Completata)
- [x] Implement `core/comprensorio.js` (Comprensorio normalization, glide cone to landing $E_{\text{richiesta}}$, dual launch/landing flyability evaluation, and dynamic sorting).
- [x] Implement `ui/views/HomeDashboardView.js`:
  - **Block 1**: Volabilità Comprensori dynamically sorted by flyability descending with $T_{\text{best}}$, $L_{\text{safe}}$, and Explainability reasoning.
  - **Block 2**: Pilot Activity & Currency summary with high-contrast primary CTA `+ Carica Traccia IGC` ($\ge 48\text{px}$).
- [x] **Quality Gate 3**: 100% tests passing in Node.js (191/191 pass across 25 test suites).

### Phase 3-bis: Glider Catalog & Aircraft Hangar (🟢 Completata)
- [x] Catalogo multi-costruttore (`core/gliders.js`) con 55+ modelli EN-A..EN-D e deduzione parametri fisici ($v_{\text{trim}}$, $E$, range velocità).
- [x] Selettore vela reattivo nello store e ricalcolo dinamico dei coni di planata e volabilità.

### Phase 4: Weather & Flyability Dashboard (🟢 Completata)
- [x] Implement `ui/views/ForecastView.js`:
  - **Hourly Flyability Timeline**: Interactive waterfall bars (color-coded, tap to scrub).
  - **360° Windsock & Wind Direction Indicator**: Takeoff azimuth vs hourly wind vector with cross-wind warning cone.
  - **Sounding & Lapse Rate Panel**: Atmospheric temperature vs dew point curves, LCL cloud base, and inversion altitudes.
  - **AI Flight Briefing (Guido)**: 1-click voice/text briefing with concise safety persona.

### Phase 4-bis: Live Real Data Ingestion & Network Cache Sync (🟢 Completata)
- [x] Ingestione asincrona non bloccante Open-Meteo con pattern Stale-While-Revalidate a 0ms di latenza percepita.
- [x] Idratazione reattiva dello store con arricchimento EDR/Deardorff/sounding.
- [x] Fallback offline robusto a cache in memoria o generatore sintetico deterministico.
- [x] Smart Date Selector con preset adattivi (Oggi, Domani, Sab, Dom) e calendar sheet 14gg.

### Phase 5: Spot Map & Mappa della Volabilità (🟢 Completata)
- [x] Implement `ui/views/SpotMapView.js`:
  - Cartografia Leaflet 2D snella con Adapter `IMapEngine` (headless mock per test Node.js a 0ms).
  - Selettore 4 layer raster keyless (Rilievo Topo, Satellite, Cockpit Scuro, Stradale).
  - Barra comandi esterna al canvas in flusso naturale con filtro macro-regione e tendina di selezione diretta spot bi-direzionale (two-way binding).
  - Marker circolari semantici invarianti a tutti i livelli di zoom (26px con hit-target 46px, colori avionici).
  - Fumetto informativo a bolla (`L.popup`) e timeline scrubber orario dockato in Thumb Zone.

### Phase 5-bis: Mini Mappa & Manica a Vento Vettoriale (🟢 Completata)
- [x] Piano architetturale: [docs/plans/phase-5-bis-forecast-minimap.md](file:///docs/plans/phase-5-bis-forecast-minimap.md).
- [x] Modulo headless `core/windsock.js` a 12 segmenti articolati con cinematica aerodinamica e CSS custom properties.
- [x] Mini-mappa Leaflet disaccoppiata nel DOM in `ForecastView.js` con aggiornamento in-place a `<2ms` allo scrubbing.
- [x] Micro-capsule frosted glass adattive con touch target $\ge 44\text{px}$ via `::before`.

### Phase 5-ter: Analisi Volo Comprensorio & Overlay 100dvh (🟢 Completata)
- [x] Piano architetturale: [docs/plans/phase-5-ter-flight-analysis-overlay.md](file:///docs/plans/phase-5-ter-flight-analysis-overlay.md).
- [x] Overlay a schermo intero `100dvh` dedicato all'ispezione analitica del comprensorio (zero redirect a `#map`).
- [x] Doppia manica a vento vettoriale (decollo e atterraggio al suolo) orientata live all'ora dello scrubber.
- [x] Bonifica cartografica dei disegni sintetici procedurali (MEMORY #79) per mantenere la mappa pulita e leggibile.
- [x] Scrubber orario continuo dockato con swipe normalizzato multi-input (Pointer, Touch, Mouse).

### Phase 5-quater: Espansione Pan-Europea & Scalabilità Cartografica (🟢 Completata)
- [x] Piano architetturale: [docs/plans/phase-5-quater-european-expansion.md](file:///docs/plans/phase-5-quater-european-expansion.md).
- [x] Sharding del catalogo geografico (`data/locations-index.json` + `data/locations/<country>.json`) con 176+ comprensori europei verificati.
- [x] Bounding box culling e clustering gerarchico a zoom macro (< 7.5).
- [x] Macro-regioni alpine transfrontaliere (`ALPS_WEST`, `ALPS_EAST`, `ITALY`, `ALL`).

### Phase 5-quinquies: Zonizzazione Club & Vincoli Territoriali (⚪ Pianificato - Static Data)
- [ ] Piano architetturale: [docs/plans/phase-5-quinquies-club-safety-zoning.md](file:///docs/plans/phase-5-quinquies-club-safety-zoning.md).
- [ ] Arricchimento dati in `data/locations/it.json` con perimetri reali (es. Cavallaria: zona atterraggio verde, zone rosse divieto, zona arancione piegaggio).
- [ ] Renderizzazione passiva dei poligoni territoriali nell'overlay `ForecastView.js` senza logica CAD complessa.

### Phase 6: Flight Logbook & Telemetry Module (🔴 Prossimo Step Primario)
- [ ] Implement `core/logbookDb.js`:
  - Storage driver pattern con driver asincrono IndexedDB (`createIndexedDbAdapter`) e driver in-memory (`createMemoryDbAdapter`) per esecuzione headless e test in Node.js.
  - **Salvaguardia Anti-Eviction Mobile**: Richiesta automatica di storage persistente tramite `navigator.storage.persist()` all'inizializzazione del database per impedire la cancellazione automatica dei voli da parte di iOS Safari o Android dopo 7 giorni di inattività.
  - **Schema a Due Livelli Anti-Bloat**:
    - `flights_meta`: record leggero con KPI, metadati sintetici, timestamp deterministico `updatedAt` e fingerprint univoco del volo (deduplicazione idempotente anti-duplicati).
    - `flights_raw`: blob di testo IGC e campionamenti GPS 1Hz, caricati asincronamente on-demand solo per il Replay 3D.
  - **Parsing Chunkato Asincrono**: Elaborazione progressiva dei tracciati IGC di grandi dimensioni (>30.000 record) per preservare la reattività della UI e rispettare la Doherty Threshold (< 400ms).
- [ ] Implement `ui/views/LogbookView.js`:
  - Inserimento traccia IGC con drag-and-drop / file picker e parsing automatico immediato.
  - Card di volo strutturate con profilo altimetrico sintetico, durata, conteggio termiche rilevate e vela associata.
  - Contatori KPI di carriera (ore totali, numero voli, quota massima, durata massima) calcolati istantaneamente da `flights_meta`.

### Phase 6-bis: Backup, Auto-Sync & Restore Engine (⚪ Pianificato)
- [ ] Implement `core/backupManager.js` & `core/syncDirtyTracker.js`:
  - **Full System Snapshot**: Esportazione e importazione dell'intero stato applicativo (impostazioni LocalStorage, vele, località personalizzate + voli e tracce IndexedDB) in un singolo file `.json`. Opzioni di ripristino: *Sovrascrittura Completa* (Reconstruct) o *Smart Merge Non Distruttivo* guidato dal timestamp `updatedAt` (Last-Write-Wins).
  - **Prevenzione Quota Memory Blob**: Generazione del download tramite `URL.createObjectURL(new Blob([json], { type: 'application/json' }))` con rilascio immediato `URL.revokeObjectURL(url)` per evitare memory leak su backup > 30 MB.
  - **Backup & Restore Modulare del Logbook**: Esportazione e ripristino dedicati e indipendenti per il solo libretto di volo (metadati e tracce IGC), per consentire al pilota di archiviare o trasferire i propri voli separatamente dalle preferenze dell'app.
  - **Auto-Sync & Dirty Tracking**: Rilevamento in memoria delle modifiche pendenti non archiviate (`syncDirtyTracker`), banner di notifica discreto nella Thumb Zone (se trascorsi >14 giorni o $\ge 3$ nuovi voli) e predisposizione architetturale per adapter di cloud sync (Google Drive / remote folder).

### Phase 7: 3D Flight Replay with Synced Telemetry (Dual-Engine Architecture) (⚪ Pianificato)
- [ ] Implement `ui/views/FlightReplayView.js`:
  - **Interfaccia Astratta del Motore 3D (`IReplay3dEngine`)**:
    - Disaccoppiamento totale tra controller UI, controlli playback (play, pause, scrub, velocità 1x-20x, camera follow modes) e rendering 3D.
    - **Telemetria 2D Indipendente su Canvas**: HUD e strip del profilo/variometro (gradiente FAI e decimazione LTTB) renderizzati su `HTMLCanvasElement` 2D separato e reattivo a 60 FPS, totalmente autonomo dal motore WebGL.
    - **Degradazione Spaziale Antigravità**: In caso di assenza di rete per le tile DEM o mancato supporto WebGL, fallback a rendering vettoriale 3D spaziale su griglia geometrica senza crash.
  - **Engine Primario**: MapLibre GL 3D + Three.js CustomLayer (conforme a `geodesy_webgl_3d_spec.md` con decodifica DEM Terrarium e modello parapendio `.glb` in `data/models/`).
  - **Engine di Fallback Consolidato**: CesiumJS (con coordinate cartesiane WGS84 native, come empiricamente verificato nei test ParaMeteo), pronto a intervenire senza riscritture dell'interfaccia o della telemetria in caso di anomalie sul layer MapLibre.

### Phase 8: PWA, Multilingual (i18n) & Offline Hardening (⚪ Pianificato)
- [ ] Service worker (`sw.js`) con architettura di caching a isolamento:
  - `Cache-First` rigoroso per asset statici applicativi locali (`index.html`, `css/theme.css`, file JS, catalogo comprensori, icone).
  - `Network-Only` (pass-through trasparente non intercettato) per le tile cartografiche esterne (OpenTopoMap, DEM raster RGB) per prevenire categoricamente errori di quota storage esaurita (`QuotaExceededError`).
- [ ] Web App Manifest (`manifest.webmanifest`) con icone ad alto contrasto per installazione standalone.
- [ ] Supporto i18n per 4 lingue (Italiano, Inglese, Francese, Tedesco) con dizionari iniettati come dipendenze pure.
- [ ] Audit di accessibilità WCAG 2.1 AA e verifica leggibilità outdoor sotto luce solare diretta con palette ad alto contrasto su entrambi i temi.

### Phase 8-bis: Settings View, Glider Hangar & Dual Theme Engine (🟢 Completata)
- [x] Implement `ui/views/SettingsView.js`:
  - Selettore Tema Visivo a 3 vie (`Scuro (Cockpit)`, `Chiaro (Luce Solare / Sunlight)`, `Automatico (OS)`).
  - Gestore Profilo Pilota & Hangar Vele con ala attiva e parametri fisici aerodinamici.
  - Preferenze Unità di Misura aeronautiche nello store.
  - Sincronizzazione e persistenza reattiva del layer cartografico (`store.ui.mapLayer`).
- [x] Dual-Theme Architecture in `css/theme.css` con Sunlight Light Mode calibrato per la luce solare zenitale.
- [x] Runtime Theme Controller in `core/store.js` e `ui/app.js` con persistenza e meta tag dinamico.

### Future Extensions: Motore di Disegno CAD Interattivo & Annotazione Rotte (⚪ Posticipato Post-Fase 7)
- [ ] Specifiche di dettaglio: [docs/plans/future-interactive-drawing-engine.md](file:///docs/plans/future-interactive-drawing-engine.md).
- [ ] Editor touch interattivo per waypoint, spline di Chaikin, box termici e tracciamento rotte con Undo/Redo a 50 stati.


---

## 5. Verification & Ground-Truth Protocol

In accordance with `anti_sycophancy_integrity.md`:
1. **No Faux Testing**: Every algorithm must be verified with real recorded flight data (e.g. valid IGC files and real Open-Meteo JSON responses).
2. **Visual Verification**: Every view will be visually inspected on simulated mobile viewports ($390 \times 844\text{ px}$) using headless browser screenshots.
3. **Ergonomic Verification**: Verify touch target hitboxes ($\ge 44\text{px}$) and ensure zero horizontal scrolling across all screens.
