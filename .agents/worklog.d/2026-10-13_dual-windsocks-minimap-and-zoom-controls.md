# Worklog: Doppia Manica a Vento su Mini-Mappa, Controlli Zoom Dedicati e Rilocazione Tasto Fullscreen

- **Data**: 2026-10-13
- **Ambito**: `ui/map/mapEngineAdapter.js`, `ui/views/ForecastView.js`, `css/theme.css`, `tests/ui/forecastView.test.mjs`, `tests/ui/mapTakeoffSector.test.mjs`
- **Oggetto**: Visualizzazione contemporanea di entrambe le maniche a vento (decollo e atterraggio) sulla mini-mappa della scheda previsioni anche in modalità non espansa; pulsanti di zoom in/out (`+` e `-`) in alto a destra sia nella mini-mappa che nell'overlay espanso; riposizionamento del pulsante fullscreen in basso a destra.

---

## 1. Contesto & Requisiti Utente

L'utente ha espresso tre requisiti cartografici ed ergonomici per la vista previsioni (`ForecastView`):
1. **Doppia Manica a Vento sulla Mini-Mappa**: visualizzare contemporaneamente e distintamente le due maniche a vento (decollo e atterraggio) anche quando la mini-mappa è nel suo riquadro compatto standard, ciascuna orientata e sagomata in base al vento del rispettivo punto geografico e aggiornata in tempo reale allo scorrimento orario (scrubbing).
2. **Pulsanti di Zoom in Alto a Destra**: aggiungere i controlli di zoom (`+` e `-`) nell'angolo superiore destro sia per la mini-mappa compatta che per l'overlay espanso di analisi volo (`FlightAnalysisOverlay`).
3. **Rilocazione del Tasto Fullscreen**: spostare il pulsante di apertura mappa a tutto schermo / analisi volo (`.gm-mini-map-expand-btn`), precedentemente collocato in alto a destra, in un'altra posizione non interferente (posizionato in basso a destra: `bottom: 8px; right: 8px;`).

---

## 2. Decisioni Architetturali & Modifiche

### 2.1 Adattatore Cartografico (`ui/map/mapEngineAdapter.js`)
- **Metodi Zoom Pubblici**: implementati i metodi `zoomIn(delta = 1)` e `zoomOut(delta = 1)` su `LeafletMapEngine` (con delega diretta all'istanza `L.map`) e su `HeadlessMockMapEngine` (aggiornamento di `this.zoom` e `this.currentZoom` per test headless in Node.js puro).
- **Doppia Manica a Vento in `renderSpotMiniMap`**:
  - `HeadlessMockMapEngine`: traccia `hasTakeoffWindsock`, `hasLandingWindsock`, `takeoffWeather` e `landingWeather`.
  - `LeafletMapEngine`: istanzia e posiziona sia `this.takeoffWindsockMarker` (alle coordinate del decollo `tCoord`, prefisso SVG `miniws-to-`, scala 0.45) sia `this.landingWindsockMarker` (alle coordinate dell'atterraggio `lCoord`, prefisso SVG `miniws-ld-`, scala 0.45). L'atterraggio include inoltre il marker grafico `⏚`.
- **Aggiornamento In-Place allo Scrubbing Orario (`updateWindsockMarker`)**:
  - Firma arricchita per accettare `(takeoffWeather, landingWeather, takeoff)`.
  - Rotazione CSS (`rotate(${rot}deg)`) e aggiornamento dell'SVG eseguiti selettivamente e in-place sui nodi DOM `#miniws-to-wrapper` e `#miniws-ld-wrapper`, senza distruggere né reinizializzare la mappa Leaflet.

### 2.2 Controller Vista Previsioni (`ui/views/ForecastView.js`)
- **Markup Mini-Mappa (`renderMiniMapBox`)**:
  - Aggiunti controlli di zoom `.gm-mini-map-zoom-controls` in alto a destra con `data-action="minimap-zoom-in"` e `data-action="minimap-zoom-out"`.
  - Mantenuto il pulsante fullscreen `.gm-mini-map-expand-btn` con `data-action="open-full-map"`, delegando la posizione al foglio di stile CSS.
- **Markup Overlay Espanso (`openFlightAnalysisOverlay`)**:
  - Integrati i pulsanti `data-action="flight-analysis-zoom-in"` e `data-action="flight-analysis-zoom-out"` all'interno del contenitore `.gm-flight-analysis-controls-right` in alto a destra.
- **Gestione Eventi (`handleClick`)**:
  - Gestione mirata delle 4 azioni di zoom che invocano `zoomIn()` e `zoomOut()` sul motore attivo (`miniMapEngine` o `flightAnalysisMapEngine`).
- **Passaggio Meteo al Rendering e Scrubbing**:
  - In `initMiniMap()`: forniti sia `takeoffWeather` sia `landingWeather`.
  - In `setHour()`: invocato `miniMapEngine.updateWindsockMarker(takeoffWeather, landingWeather, takeoff)` per aggiornare contemporaneamente entrambi i vettori.

### 2.3 Ergonomia e Design System (`css/theme.css`)
- Spostato `.gm-mini-map-expand-btn` da `top: 8px;` a `bottom: 8px; right: 8px;`, assicurando una separazione verticale $> 100\text{px}$ rispetto ai controlli di zoom per eliminare tocchi accidentali (Fitts's Law).
- Definito `.gm-mini-map-zoom-controls` a colonna con `top: 8px; right: 8px; gap: 6px;` e pulsanti compatti da 32×32px provvisti di pseudo-elemento `::before` esteso al pavimento Fitts $\ge 48\text{px}$.
- Definiti i selettori adattivi per tutti i basemap cartografici (`topo`, `streets`, `satellite`, `dark`) e per la modalità ad alta luminosità solare `[data-theme="light"]`.
- Stilizzati i pulsanti di zoom nell'overlay di analisi volo (`.gm-flight-analysis-zoom-group` e `.gm-flight-analysis-zoom-btn`).

---

## 3. Verifica & Test

- **Test Unitari Mini-Mappa e Zoom**: `tests/ui/forecastView.test.mjs` arricchito con verifiche per la presenza dei pulsanti di zoom nel markup, per la rilocazione dell'expand button, per l'inizializzazione di entrambe le maniche a vento (`hasTakeoffWindsock`, `hasLandingWindsock`), e per l'esecuzione di `zoomIn()` e `zoomOut()` al click.
- **Test Motore Cartografico**: `tests/ui/mapTakeoffSector.test.mjs` arricchito con test per la doppia manica a vento disaccoppiata in `LeafletMapEngine` e per i controlli di zoom in `HeadlessMockMapEngine`.
- **Suite Globale**: Eseguito `npm test` su tutti i 734 test del repository (126 suite): **733 passati, 1 ignorato (pre-esistente), 0 falliti**.
