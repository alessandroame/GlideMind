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
- [x] Configure `.agents/skills` with domain knowledge (`flyability-evaluator`, `open-meteo-integration`, `ai-briefing-gemini`, `geodesy-webgl-3d`) and global plugins (`ux-outdoor-and-field-ergonomics`).
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

### Phase 4-bis: Live Real Data Ingestion & Network Cache Sync (ForecastView & HomeDashboardView)
- [ ] Implement live background data fetching in `ForecastView.js`:
  - **Pattern Stale-While-Revalidate (0ms Latency)**: Rendering istantaneo all'apertura o cambio spot/data con dati da cache in-memory; lancio asincrono non bloccante di `fetchWeatherData(coords, { targetDate, weatherModel })` in background.
  - **Idratazione Reattiva dello Store**: Al ricevimento del payload HTTP reale da Open-Meteo, aggiornamento di `store.weatherData`, arricchimento EDR/Deardorff/sounding e re-render trasparente senza reload o flicker.
  - **Fallback Robusto & Offline Resilience**: In caso di assenza di rete, timeout (>5s) o HTTP 429/5xx, fallback automatico alla cache locale o al generatore sintetico con marcatore `isOfflineFallback: true`.
- [ ] Implement live spot synchronization in `HomeDashboardView.js`:
  - Caricamento asincrono del meteo reale per il comprensorio selezionato/primario e aggiornamento della classifica di volabilità dei comprensori in base alle condizioni effettive.
- [ ] Indicatore di Stato Rete & Freschezza Dati (Laws of UX & Doherty Threshold):
  - Badge discreto e accessibile nella barra superiore:
    - 🟢 *Live Open-Meteo (DWD ICON / ECMWF)* con indicazione temporale (`aggiornato 14 min fa`).
    - 🟡 *In aggiornamento...* (indicatore non bloccante senza spinner a schermo intero).
    - ⚪ *Modalità Offline / Stime* (in assenza di segnale).
- [ ] Isolamento Headless & Preservazione Test:
  - Condizionamento del fetch di rete a `typeof window !== 'undefined' && typeof window.fetch === 'function'`. I test in Node.js puro mantengono esecuzione deterministica a 0ms senza dipendenza da internet.
- [ ] **Quality Gate 4-bis**: 100% test passanti con `node --test` e verifica end-to-end con dati reali nel browser su `http://localhost:3000`.

### Phase 5: Spot Map & Mappa della Volabilità ("Dove Volare Oggi")
- [ ] Implement `ui/views/SpotMapView.js`:
  - **Architettura a Due Livelli di Zoom con Idratazione Progressiva**:
    - **Livello Macro (Zoom 5 – 8.9 - Panoramica Regionale)**:
      - Ingestione batch circoscritta alla macro-regione focale (Nord-Ovest, Nord-Est, Centro, Sud/Isole o raggio 100 km dal pilota, max 25-30 comprensori per blocco) per garantire payload $< 500\text{ KB}$ e URL HTTP $< 800$ caratteri (zero errori `414 URI Too Long`).
      - Rendering ad aureole semitrasparenti di bacino aerologico (raggio 8-12 km) con codifica semantica a 4 colori (🟢 Volabile, 🟡 Cautela, 🔴 Chiuso, ⚡ Severo) calcolata deterministicamente con `evaluateComprensorio`.
    - **Livello Micro (Zoom >= 9 - Dettaglio di Valle & Decollo)**:
      - **Zero Chiamate di Rete Aggiuntive**: riuso istantaneo in memoria RAM delle 168 ore già scaricate per il comprensorio.
      - Sblocco vettoriale ad alta fedeltà: cono azimutale del decollo primario ($T_{\text{best}}$), freccia del vento reale calcolata a quota decollo, linea geodetica verso l'atterraggio sicuro ($L_{\text{safe}}$) e cono di planata aerodinamica ($E_{\text{richiesta}} \le E_{\text{glider}}$) calibrato sull'ala attiva del pilota.
  - **Cache Entity-Centric (`spotId`) & Anti-Deadlock Rete**:
    - Indicizzazione della cache per ID comprensorio univoco (TTL 30 min), mai per coordinate arbitrarie di bounding box.
    - Filtro a differenza insiemistica: $\text{SpotsDaScaricare} = \text{SpotsNelRaggio} \setminus \text{SpotsInCache}$. Debounce di 400ms su `moveend` per azzerare il consumo quote e prevenire HTTP 429.
  - **Headless Map Adapter Pattern (`IMapEngine`)**:
    - Disaccoppiamento totale tra controller vista e libreria cartografica: implementazione `LeafletMapEngine` (o MapLibre) nel browser e `HeadlessMockMapEngine` nei test Node.js, garantendo 100% testabilità senza DOM/Canvas polyfill.
  - **Ergonomia Outdoor & Timeline Integrata**:
    - Slider orario compatto (09:00 - 18:00) fluttuante nella Thumb Zone inferiore, con margine di sicurezza $\ge 24\text{px}$ sopra `#bottom-nav-bar` e proprietà `touch-action: pan-x`.
    - Ricalcolo istantaneo in RAM di tutti i comprensori visibili in $< 20\text{ms}$ a ogni step orario.
  - **Scheda Rapida Comprensorio (Bottom Sheet)**:
    - Tap sull'aureola o marker: apertura drawer non bloccante (`SheetManager.js`) con metriche essenziali di sicurezza e CTA diretto a `ForecastView.js`.

### Phase 6: Flight Logbook & Telemetry Module
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

### Phase 6-bis: Backup, Auto-Sync & Restore Engine
- [ ] Implement `core/backupManager.js` & `core/syncDirtyTracker.js`:
  - **Full System Snapshot**: Esportazione e importazione dell'intero stato applicativo (impostazioni LocalStorage, vele, località personalizzate + voli e tracce IndexedDB) in un singolo file `.json`. Opzioni di ripristino: *Sovrascrittura Completa* (Reconstruct) o *Smart Merge Non Distruttivo* guidato dal timestamp `updatedAt` (Last-Write-Wins).
  - **Prevenzione Quota Memory Blob**: Generazione del download tramite `URL.createObjectURL(new Blob([json], { type: 'application/json' }))` con rilascio immediato `URL.revokeObjectURL(url)` per evitare memory leak su backup > 30 MB.
  - **Backup & Restore Modulare del Logbook**: Esportazione e ripristino dedicati e indipendenti per il solo libretto di volo (metadati e tracce IGC), per consentire al pilota di archiviare o trasferire i propri voli separatamente dalle preferenze dell'app.
  - **Auto-Sync & Dirty Tracking**: Rilevamento in memoria delle modifiche pendenti non archiviate (`syncDirtyTracker`), banner di notifica discreto nella Thumb Zone (se trascorsi >14 giorni o $\ge 3$ nuovi voli) e predisposizione architetturale per adapter di cloud sync (Google Drive / remote folder).

### Phase 7: 3D Flight Replay with Synced Telemetry (Dual-Engine Architecture)
- [ ] Implement `ui/views/FlightReplayView.js`:
  - **Interfaccia Astratta del Motore 3D (`IReplay3dEngine`)**:
    - Disaccoppiamento totale tra controller UI, controlli playback (play, pause, scrub, velocità 1x-20x, camera follow modes) e rendering 3D.
    - **Telemetria 2D Indipendente su Canvas**: HUD e strip del profilo/variometro (gradiente FAI e decimazione LTTB) renderizzati su `HTMLCanvasElement` 2D separato e reattivo a 60 FPS, totalmente autonomo dal motore WebGL.
    - **Degradazione Spaziale Antigravità**: In caso di assenza di rete per le tile DEM o mancato supporto WebGL, fallback a rendering vettoriale 3D spaziale su griglia geometrica senza crash.
  - **Engine Primario**: MapLibre GL 3D + Three.js CustomLayer (conforme a `geodesy_webgl_3d_spec.md` con decodifica DEM Terrarium e modello parapendio `.glb` in `data/models/`).
  - **Engine di Fallback Consolidato**: CesiumJS (con coordinate cartesiane WGS84 native, come empiricamente verificato nei test ParaMeteo), pronto a intervenire senza riscritture dell'interfaccia o della telemetria in caso di anomalie sul layer MapLibre.

### Phase 8: PWA, Multilingual (i18n) & Offline Hardening
- [ ] Service worker (`sw.js`) con architettura di caching a isolamento:
  - `Cache-First` rigoroso per asset statici applicativi locali (`index.html`, `css/theme.css`, file JS, catalogo comprensori, icone).
  - `Network-Only` (pass-through trasparente non intercettato) per le tile cartografiche esterne (OpenTopoMap, DEM raster RGB) per prevenire categoricamente errori di quota storage esaurita (`QuotaExceededError`).
- [ ] Web App Manifest (`manifest.json`) con icone ad alto contrasto per installazione standalone.
- [ ] Supporto i18n per 4 lingue (Italiano, Inglese, Francese, Tedesco) con dizionari iniettati come dipendenze pure.
- [ ] Audit di accessibilità WCAG 2.1 AA e verifica leggibilità outdoor sotto luce solare diretta con palette ad alto contrasto su entrambi i temi.

### Phase 8-bis: Settings View, Glider Hangar & Dual Theme Engine (Sunlight Light Mode)
- [ ] Implement `ui/views/SettingsView.js`:
  - **Selettore Tema Visivo**: Selezione a 3 vie (`Scuro (Cockpit)`, `Chiaro (Luce Solare / Sunlight)`, `Automatico (OS)`) con commutazione dinamica istantanea senza ricaricamento di pagina (<50ms).
  - **Gestore Profilo Pilota & Hangar Vele**: Selezione dell'ala attiva (classe EN-A, EN-B, EN-C, EN-D) e parametri aerodinamici ($v_{\text{trim}}$, $AR$, efficienza max $E_{\text{glider}}$) come SSOT per le formule fisiche di volabilità e coni di planata verso l'atterraggio sicuro (zero selettori soggettivi di "livello pilota", conforme a `MEMORY.md` #13).
  - **Preferenze Unità di Misura**: Configurazione reattiva delle unità aeronautiche nello store (Velocità: km/h vs nodi; Quota: metri vs piedi; Variometro: m/s vs ft/min).
  - **Pannello Backup & Ripristino Dati**: Interfaccia grafica di esportazione/importazione JSON guidata da `core/backupManager.js` (Fase 6-bis) con supporto a Snapshot Globale o archivio modulare del Logbook.
- [ ] Dual-Theme Architecture in `css/theme.css`:
  - **Specifiche Sunlight Light Mode**: Progettato per eliminare i riflessi a specchio su display OLED/LCD sotto irraggiamento solare diretto zenitale sui decolli. Fondo primario bianco ottico/slate chiaro (`--gm-bg-base: #f8fafc`, `--gm-bg-card: #ffffff`, `--gm-bg-elevated: #f1f5f9`), testi ad altissimo contrasto (`--gm-text-primary: #0a0c10`, `--gm-text-secondary: #334155`), bordi definiti (`--gm-border: rgba(15, 23, 42, 0.12)`).
  - **Ricalibrazione WCAG 2.1 AA dei Codici di Volabilità**: Adattamento dei 4 colori di stato (🟢 Volabile, 🟡 Cautela, 🔴 Chiuso, ⚫ Severo) per garantire contrasto $\ge 4.5:1$ rispetto al fondo chiaro (verde aeronautico `#15803d`, ambra `#b45309`, rosso `#b91c1c`, nero profondo `#09090b`).
  - **Adattamento Elementi Grafici & Mappe**: Sincronizzazione dell'inversione di colore per i tracciati telemetrici Canvas 2D (variometro, radiosondaggi Skew-T / LCL) e commutazione automatica del layer cartografico in `SpotMapView.js` (tile chiare per la modalità luce solare).
- [ ] Runtime Theme Controller in `core/store.js` & `ui/app.js`:
  - Metodo `store.setTheme(mode)` con persistenza in `localStorage`.
  - Mutazione immediata dell'attributo radice `document.documentElement.dataset.theme = effectiveTheme`.
  - Aggiornamento dinamico del meta tag `<meta name="theme-color" content="...">` per le barre di stato mobile di iOS e Android.
  - Listener reattivo su `window.matchMedia('(prefers-color-scheme: dark)')` per la modalità `system`.


---

## 5. Verification & Ground-Truth Protocol

In accordance with `anti_sycophancy_integrity.md`:
1. **No Faux Testing**: Every algorithm must be verified with real recorded flight data (e.g. valid IGC files and real Open-Meteo JSON responses).
2. **Visual Verification**: Every view will be visually inspected on simulated mobile viewports ($390 \times 844\text{ px}$) using headless browser screenshots.
3. **Ergonomic Verification**: Verify touch target hitboxes ($\ge 44\text{px}$) and ensure zero horizontal scrolling across all screens.
