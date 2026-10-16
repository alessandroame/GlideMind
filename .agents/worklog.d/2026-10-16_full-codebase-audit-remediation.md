# 2026-10-16 — Full Codebase Audit & Autonomous 28-Issue Remediation (Core, UI, CSS, PWA & Governance)

## Contesto
A seguito di un audit statico e architetturale completo dell'intero repository GlideMind (`core/`, `ui/`, `css/`, `scripts/`, `index.html`, `tests/`), sono state identificate e risolte 28 criticità distribuite su 6 categorie:
1. **Integrità Dati, Persistenza & SSOT (P0 — Critici)**
2. **Lifecycle DOM, Memory Leaks & Resilienza UI (P1 — Alti)**
3. **Sicurezza (XSS), Accessibilità & Contratti Funzionali UI (P1/P2)**
4. **Architettura CSS, Deduplicazione Selettori & Rimozione Stili Inline Statici (P2)**
5. **PWA Service Worker Offline-First & Allineamento Standard Ingegneristici (P2/P3)**
6. **Allineamento Suite di Test & Gate Shift-Left Automatizzati**

## Interventi Eseguiti

### Fase 1: Integrità Dati, Persistenza & SSOT (P0)
- **Sincronizzazione Bootstrap IndexedDB vs LocalStorage (`ui/app.js` & `core/store.js`)**:
  - In `ui/app.js`, spostata la sincronizzazione di `logbookManager.getAllFlights()` dopo `store.loadPersistedState()` per impedire che uno snapshot obsoleto in `localStorage` sovrascriva l'archivio autorevole di IndexedDB.
  - In `core/store.js` (`persistKeys`), rimosso il salvataggio degli array GPS densi (`points`, `originalPoints`, `uncalibratedOriginalPoints`) quando `flights` viene serializzato in `localStorage`, prevenendo `QuotaExceededError` (limite 5MB).
- **Persistenza Voli Manuali in IndexedDB (`ui/views/ImportFlightSheet.js` & `ui/views/LogbookView.js`)**:
  - Sostituita la mutazione volatile del solo store in memoria in `handleManualSubmit` con il salvataggio persistente su IndexedDB tramite `this.logbookManager.saveFlight(manualFlight)` e sincronizzazione di `store.setState({ flights })`.
- **Preservazione dei 4 Layer Cartografici (`core/store.js`, `ui/views/SettingsView.js`, `ui/map/mapEngineAdapter.js`)**:
  - Estesa la whitelist in `store.loadPersistedState()` a `['topo', 'satellite', 'dark', 'cyclosm']` (prima limitata ai soli `'topo'` e `'satellite'`).
  - Aggiunte le opzioni `Dark Matter (Contrasto)` e `CyclOSM (Sentieri & Rilievo)` al selettore in `SettingsView.js` e sincronizzato `mapEngineAdapter.setLayer()` con `store.setSlice('ui', { mapLayer })`.
- **Pipeline Pre-Chunking IGC & Timezone Locale (`core/logbookDb.js`)**:
  - Corretta la regex di estrazione data pre-chunking in `/H[FC]DTE(?:DATE:)?\s*([0-9]{6,8})/i` per supportare sia `HFDTE150726` sia `HFDTEDATE:150726,01` (XCTrack/Flymaster), evitando collisioni di fingerprint su tracce lunghe.
  - Sostituito `new Date().toISOString().split('T')[0]` con `formatDateIso(new Date())` per eliminare lo slittamento UTC dopo le 22:00.
  - Reso iniettabile `requestStoragePersistence(customStorageManager = null)` per disaccoppiamento headless.
- **Modulo Unità di Misura Headless (`core/units.js`)**:
  - Creato `core/units.js` (`convertWindSpeed`, `formatWindSpeed`, `convertAltitude`, `formatAltitude`, `convertVario`, `formatVario`) e cablato in `HomeDashboardView.js`, `ForecastView.js` e `LogbookView.js` per rispettare `store.getState().ui.units` (`kmh`/`knots`, `m`/`ft`, `ms`/`fpm`).

### Fase 2: Lifecycle DOM, Memory Leaks & Resilienza UI (P1)
- **Prevenzione Listener Duplicati (`ui/views/SettingsView.js`)**:
  - Rimossa la doppia registrazione di `boundChangeHandler` in `render()` (ora registrato solo in `mount()` e rimosso in `unmount()`).
- **Cleanup Controlli Mappa Espansa (`ui/views/ForecastView.js`)**:
  - Salvati gli handler dei pulsanti dell'overlay mappa (`#btn-close-expanded-map`, `#btn-expanded-recenter`, `#btn-expanded-2d3d`, `#btn-expanded-pin-toggle`, `#btn-expanded-voice`) e rimossi deterministicamente in `closeExpandedMap()` e `unmount()`.
- **Cleanup Globale `window` & `ResizeObserver` (`ui/views/FlightReplayView.js`)**:
  - Salvato `this.boundWindowPointerUp` e rimosso in `unmount()`, insieme a `this.baroResizeObserver.disconnect()` e `cancelAnimationFrame(this.baroRafId)`.
- **Tracciamento e Pulizia Listener e Timer (`ui/views/FlightDetailSheet.js` & `ui/views/TrackSetupSheet.js`)**:
  - Aggiunto `cleanupActiveListeners()` in `FlightDetailSheet.js` (incluso cleanup su `onClose` dello sheet) e tracciato `feedbackTimeoutId` in `TrackSetupSheet.js`.
- **Sincronizzazione Router / SheetManager su Cambio Tab (`ui/router.js`, `ui/sheetManager.js`, `ui/app.js`)**:
  - Invocato `sheetManager.closeSheet()` ad ogni cambio rotta (`onRouteChange`), aggiunto hook opzionale `__cleanupOverlay` in `SheetManager.closeSheet()`, e bloccate le scorciatoie da tastiera (`1–5`, `m`, `f`, `l`, `s`) quando un modale/overlay è aperto (`aria-hidden="false"`).
- **Fast-Path `Object.is` nello Store (`core/store.js`)**:
  - Evitata la serializzazione `JSON.stringify` quando il riferimento o primitivo di una chiave non è mutato.

### Fase 3 & 4: Sicurezza XSS, Accessibilità, Deduplicazione CSS & Stili Inline (P1/P2)
- **Sanitizzazione Attributi HTML (`ui/views/HomeDashboardView.js` & `ui/views/ForecastView.js`)**:
  - Introdotto `escapeHtml()` sugli attributi `data-spot-name`, `data-takeoff-name`, `data-landing-name`, `aria-label` e `title`.
- **Deduplicazione Selettori CSS (`css/theme.css`)**:
  - Consolidati tutti i 14 selettori top-level duplicati (`.gm-horizon-notice`, `.gm-spot-header`, `.gm-spot-header-right`, `.gm-spot-badge-toggle`, `.gm-date-tab`, `.gm-date-grid`, `.gm-date-grid-item`, `.gm-date-grid-item.active`, `.gm-date-sheet-legend`, `.gm-glider-sheet-footer`, `.gm-Inline-Currency-Alert`, `.gm-flight-route`, `.gm-chart-summary-pill`, `.gm-sounding-axis-title`) in definizioni singole canoniche.
- **Estrazione Stili Inline Statici (`index.html`, `ui/views/*.js`, `css/theme.css`)**:
  - Estratti oltre 120 attributi `style="..."` statici in classi semantiche riusabili nella Sezione 22 di `css/theme.css`.

### Fase 5 & 6: PWA Service Worker, Inglese nel Codice & Governance Tests (P2/P3)
- **Service Worker Offline-First (`sw.js` & `ui/app.js`)**:
  - Creato `sw.js` con strategia `Cache-First` per gli asset statici della shell e `Pass-Through` per le API esterne (`open-meteo.com`, server tile cartografici, Overpass, Gemini). Registrato in `ui/app.js`.
- **Standard Lingua Inglese e Sobrietà Terminologica**:
  - Sostituito `"Sito strategico"` con `"Sito di riferimento"` in `core/comprensorio.js` e tradotti in inglese i commenti interni e i log CLI in `core/`, `ui/` e `scripts/`.
- **Allineamento ed Espansione Suite di Test (`801/801 PASS`)**:
  - Aggiornato `tests/ui/mapTakeoffSector.test.mjs` al callout a 2 righe `.gm-glide-balloon`.
  - Creata la suite `tests/core/units.test.mjs`.
  - Estesa `tests/ui/shiftLeftGovernance.test.mjs` con i Gate 3 (zero selettori CSS duplicati), Gate 4 (esistenza e registrazione `sw.js`) e Gate 5 (assenza di gergo bandito).
