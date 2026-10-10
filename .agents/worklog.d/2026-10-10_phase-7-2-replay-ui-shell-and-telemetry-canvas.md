# Fase 7.2: Shell UI Visualizzatore 3D, Canvas Telemetria 2D e Script Loader Asincrono

**Data**: 2026-10-10  
**Autore**: GlideMind Agent  
**Ambito**: Visualizzatore 3D, HMI Outdoor, Canvas 2D, Routing & Disaccoppiamento Architetturale  

---

## 1. Contesto & Motivazione

Per completare la Fase 7 del Visualizzatore 3D Traiettoria (`FlightReplayView`), è necessario predisporre l'interfaccia a schermo intero (`100dvh`) con ergonomia da campo (touch target $\ge 48\text{px}$, controlli thumb-zone, contrasto elevato WCAG AA) e un canvas 2D separato per la telemetria sincronizzata ad alta frequenza (profilo altimetrico, variometro FAI colorato, scrubber touch interattivo), isolando il caricamento asincrono on-demand delle librerie 3D esterne senza appesantire il bundle o violare i vincoli del core headless.

---

## 2. Decisioni & Interventi Architetturali

1. **Canvas Telemetrico 2D Indipendente (`ui/3d/ReplayTelemetryCanvas.js`)**:
   - Disaccoppiato dal loop WebGL: rendering 2D vettoriale leggero via `CanvasRenderingContext2D`.
   - Profilo altimetrico con campionamento a gradiente variometrico FAI (`sampleVarioRgb`).
   - Cursore di riproduzione dinamico, HUD glanceable (quota, velocità orizzontale, variometro).
   - Scrubber interattivo con `setPointerCapture` per scrub fluido con dita/guanti.
   - Gestione `devicePixelRatio` per nitidezza retina e resize observer reattivo.

2. **Controller Vista a Schermo Intero (`ui/views/FlightReplayView.js`)**:
   - Layout `100dvh` conforme a Shift-Left Gate 4 (`gm-flight-replay-fullscreen`).
   - Barra superiore con pulsante di ritorno `← Libretto` ad alta accessibilità ($\ge 48\text{px}$) e selettore chip per le modalità camera (Insegui, Pilota, Libera).
   - Viewport 3D dedicato con placeholder/loading state contestuale.
   - Strip telemetrica HUD e dock controlli nella thumb-zone inferiore (Play/Pausa $\ge 48\text{px}$, selettore velocità 1x-20x, toggle quota terreno AGL/MSL).
   - Integrazione bidirezionale con `core/store.js` e motore di rendering 3D (`IReplay3dEngine`).

3. **Caricatore Dinamico Script (`ui/scriptLoader.js`)**:
   - Caricamento script on-demand con deduplicazione promesse concorrenti e caching.
   - Rigorosamente collocato nel layer `ui/` per salvaguardare la purezza headless del core (Shift-Left Gate 1).

4. **Integrazione Applicativa & Routing (`ui/app.js`, `css/theme.css`)**:
   - Registrazione della vista `'replay'` nel router SPA e montaggio nel container dell'applicazione.
   - Stili completi in `css/theme.css` con variabili tematiche `--gm-*`, contrasto solare, safe areas e touch target minimi conformi a Fitts's Law.

5. **Test Automatizzati**:
   - `tests/ui/flightReplayView.test.mjs` (10 test): ciclo di vita, mounting DOM, pulsanti HUD, cambi di camera, resize e cleanup.
   - `tests/ui/scriptLoader.test.mjs` (3 test): fallback Node.js puro, caricamento asincrono simulato, gestione errori di rete.
   - Suite totale: 604 test passati su 104 suite (100% green).
