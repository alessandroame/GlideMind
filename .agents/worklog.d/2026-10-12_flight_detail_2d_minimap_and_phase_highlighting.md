# Worklog: 2026-10-12 - Mini Mappa 2D Traccia & Sincronizzazione Fasi di Volo con Grafico Altimetrico

## Contesto & Obiettivo
Su richiesta dell'utente ("vorrei una mini mappa 2d nella pagina del volo sopra il grafico altimetrico e vorrei che si vedesse la traccia colata col variometro e che selezionado sul grafico una fase del volo venga mostrato la porzione di volo relativa nella mappa"), implementare nella pagina di dettaglio volo (`FlightDetailSheet.js`):
1. Una mini mappa 2D cartografica posizionata direttamente sopra il profilo altimetrico.
2. Traccia GPS del volo con colorazione multi-segmento continua basata sui valori del variometro FAI (discesa marcata, planata, salita debole, salita forte).
3. Selezione interattiva bidirezionale delle fasi di volo (termiche `T1, T2...`, inversioni di rollio, sondaggi 360°): cliccando sul grafico o sulle schede analitiche, la porzione corrispondente viene evidenziata sulla mappa con un alone luminoso (halo), mentre il resto della traccia viene attenuato (dimmed) e la mappa esegue il fit bounds automatico sul tratto selezionato.
4. Cursore sincronizzato in tempo reale (crosshair scrubbing): muovendo il puntatore o il dito sul grafico altimetrico, un marker a impulsi si sposta istantaneamente lungo la traccia 2D sulla mappa.
5. Pulsante di toggle layer rapido (`OpenTopo` / `Satellite`) integrato nell'HUD della mini mappa e sincronizzato con `store.ui.mapLayer`.

---

## Modifiche Implementate

### 1. `ui/map/mapEngineAdapter.js`
- Importata funzione di colorazione `sampleVarioRgb` da `core/flightTelemetry.js`.
- Esteso `HeadlessMockMapEngine`:
  - Aggiunti e allineati metodi `renderFlightTrack(containerEl, trackData, options)`, `highlightFlightTrackRange(startIndex, endIndex, options)`, `setFlightTrackCursor(index)` e pulizia in `destroy()`.
  - Normalizzato `setLayer(layerId)` per impostare sia `this.currentLayerId` sia `this.activeLayer`.
- Esteso `LeafletMapEngine`:
  - Aggiunti campi di stato nel costruttore (`flightTrackLayerGroup`, `flightTrackPolylines`, `phaseHighlightGroup`, `cursorMarker`, `flightTrackPoints`).
  - Implementato `renderFlightTrack`:
    - Raggruppamento dei segmenti consecutivi per fascia cromatica variometrica (`sampleVarioRgb`) per minimizzare il numero di polyline Leaflet e garantire 60 FPS.
    - Marcatori speciali per Decollo (pin verde 'D') e Atterraggio (pin rosso 'A').
    - Auto-adattamento visuale `fitBounds` con padding.
  - Implementato `highlightFlightTrackRange`:
    - Se invocato con indici validi, genera una polyline halo spessa (`#38bdf8`, opacità 0.9, blur halo) per il segmento selezionato.
    - Posiziona un pin informativo con badge (`.gm-flight-phase-map-pin`) sul punto medio della fase.
    - Attenua i segmenti non selezionati (`opacity: 0.25`) per dare risalto massimo alla fase.
    - Esegue `fitBounds` sul tratto di fase con padding e maxZoom di sicurezza.
    - Se invocato con `null`, ripristina la visualizzazione completa dell'intera traccia e opacità piena.
  - Implementato `setFlightTrackCursor`:
    - Aggiorna istantaneamente le coordinate di un marker circolare con anello a impulsi (`.gm-flight-track-cursor`) lungo la traccia, o lo rimuove se nullo.
  - Gestione pulizia in `clearFlightTrackLayers()` e `destroy()`.

### 2. `css/theme.css`
- Aggiunti token e classi per:
  - Box contenitore e canvas mini-mappa: `.gm-flight-minimap-box`, `.gm-flight-map-canvas`.
  - HUD overlay legend e controlli: `.gm-flight-map-hud-legend`, `.gm-flight-map-phase-pill`, `.gm-flight-map-reset-btn`.
  - Pin decollo/atterraggio e pin fase: `.gm-flight-map-pin`, `.gm-flight-phase-map-pin`.
  - Cursore telemetrico reattivo con micro-animazione pulse: `.gm-flight-track-cursor`, `@keyframes gm-pulse-ring`.
  - Supporto sunlight mode (`[data-theme="light"]`) ad alto contrasto per tutti i componenti HUD e pin.

### 3. `ui/views/FlightDetailSheet.js`
- Esportate utility e riferimenti: `getActiveFlightDetailMapEngine()`.
- Aggiornato `generateExpandedSvgChart`:
  - Aggiunti attributi di fase `data-phase-type`, `data-phase-label`, `data-start-index`, `data-end-index` su bande termiche, marker di rollio e sondaggi.
  - Supportata opzione `selectedPhase` per renderizzare l'overlay a rettangolo tratteggiato `.gm-chart-phase-selected-rect`.
- Aggiornato `renderFlightDetailHtml`:
  - Inserita la sezione 2D Mini-Mappa (`#flight-detail-map-container`, `#flight-detail-map-canvas`, `#flight-detail-map-legend`, `#flight-detail-map-layer-toggle`, `#gm-flight-map-phase-badge`, `#btn-flight-map-reset-selection`) direttamente sopra il profilo altimetrico.
  - Aggiunti `data-action="select-phase"` su tutte le schede termiche (`.gm-thermal-card`) e schede manovre (`.gm-maneuver-card`).
- Aggiornato `attachInteractiveFlightChart`:
  - Inizializzazione `flightDetailMapEngine` tramite `createMapEngine` con coordinate sicure di fallback.
  - Implementate funzioni `selectPhase` e `clearPhaseSelection` con aggiornamento bidirezionale (badge fase, pulsante Mostra Tutto, halo su mappa 2D e re-render SVG chart).
  - Sincronizzazione cursore su mappa durante scrub/hover su grafico altimetrico (`pointerdown`, `pointermove`, `pointerleave`).
  - Toggle rapido del layer cartografico (`OpenTopo` / `Satellite`) con persistenza reattiva in `store.ui.mapLayer`.
- Aggiornato `closeFlightDetailView`: distruzione e dereferenziazione di `flightDetailMapEngine`.

### 4. `tests/ui/flightDetailSheet.test.mjs`
- Aggiunta suite dedicata `2D Flight Track Mini-Map & Altimetric Chart Synchronization` con 3 test automatici:
  1. Verifica del rendering del markup mini mappa, canvas, legend, pulsanti e attributi `data-action="select-phase"`.
  2. Verifica del rendering dell'evidenziazione di fase nel grafico altimetrico SVG (`gm-chart-phase-selected-rect`).
  3. Verifica del ciclo di vita completo del motore mappa headless (rendering traccia, sincronizzazione cursore su pointerdown/up/leave, selezione fase da click su card, toggle layer cartografico, reset selezione e pulizia su chiusura vista).

---

## Risultati di Verifica
- Esecuzione `node --test tests/ui/flightDetailSheet.test.mjs`: **29/29 test passati** (0 fallimenti).
- Esecuzione `npm test` sull'intero repository: **696 test passati, 0 fallimenti, 1 skipped** su 122 suite.
- Superamento di tutti i 5 Gate del protocollo Shift-Left Quality Gate.
