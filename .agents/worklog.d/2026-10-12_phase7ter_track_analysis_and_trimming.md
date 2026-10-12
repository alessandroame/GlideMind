# Fase 7-ter: Analisi Tracce IGC Avanzata, Trimming e Visualizzazione Volo ParaMeteo

**Data**: 2026-10-12  
**Ambito**: `core/flightTrimming.js`, `core/flightTelemetry.js`, `core/logbookDb.js`, `core/parameteoImporter.js`, `ui/3d/models/paragliderModel.js`, `ui/3d/ReplayTelemetryCanvas.js`, `ui/views/FlightReplayView.js`, `ui/views/FlightDetailSheet.js`, `tests/`  
**Tipo**: Feature Migration & Ergonomic Integration (ParaMeteo Track Analysis & Replay Parity)  

---

### 1. Contesto & Obiettivi
Integrazione e porting completo delle funzionalità di analisi delle tracce IGC e visualizzazione del volo da ParaMeteo in GlideMind:
1. Riconoscimento e salvataggio per ogni traccia delle fasi di volo (`takeoff`, `thermal`, `soaring`, `glide`, `descent`, `maneuver`, `landing`) ed eventi salienti.
2. Trimming non distruttivo della traccia al decollo e all'atterraggio per eliminare i tempi a terra e ricalcolare statistiche reali (durata, guadagno, dislivello).
3. Replica ad alta fedeltà dell'avatar 3D del parapendio (profilo competition Enzo 3 a 54 cassoni, centine chiuse, 2-liner Kevlar, imbrago cocoon pod e pilota reclinato con visiera).
4. Visualizzazione della barra telemetrica avionica completa (prua con bussola ad ago rotante, vario FAI, velocità, quote MSL/AGL) con chip eventi interattivi e click-to-seek.

---

### 2. Moduli e Interventi Implementati

1. **Motore Headless di Trimming (`core/flightTrimming.js`)**:
   - Algoritmo deterministico `detectTrimPoints(points)` con stima soglie cinetiche (velocità al suolo e gradiente altimetrico) e buffer di transizione (2 punti pre-decollo e post-touchdown).
   - Taglio tracciato `applyTrackTrim(points, start, end)` con ricalcolo cumulativo dei tempi (`timeSeconds`).
   - Pipeline di ricalcolo olistico `recalculateFlightAfterTrim(bundle, start, end)` che rianalizza telemetria, fasi, termiche, manovre ed estrae gli eventi salienti.
   - Conservazione non distruttiva e funzione `restoreUntrimmedFlight(bundle)`.

2. **Analisi Telemetria & Milestone Events (`core/flightTelemetry.js`)**:
   - Implementazione di `extractFlightEvents(flight)`: estrae eventi ordinati (`takeoff`, `thermal`, `soaring`, `max_alt`, `max_climb`, `maneuver`, `landing`) con progress, etichette e colori dedicati.
   - Integrazione rilevamento manovre in `analyzeFlightTelemetry(points)` e segmentazione fasi.

3. **Storage a Due Livelli & Persistenza (`core/logbookDb.js` & `core/parameteoImporter.js`)**:
   - Preservazione dell'array originale `originalPoints` in `flights_raw` durante l'importazione IGC e l'ingestione ParaMeteo.
   - Aggiunta dei metodi `trimFlightTrack(flightId, takeoffIndex, landingIndex)` e `resetFlightTrim(flightId)` in `LogbookManager` con aggiornamento reattivo dello store SSOT.

4. **Avatar Parapendio 3D Competition (`ui/3d/models/paragliderModel.js`)**:
   - Modellazione procedurale conforme a Enzo 3: 54 cassoni, allungamento AR ~7.6, shark-nose, curvature ellittiche, tip alari chiuse stagne (water-tight).
   - Fascio funicolare 2-liner competition in Kevlar/Technora con bretelle e nodi di raccordo.
   - Imbrago cocoon pod carenato con cockpit portastrumenti e pilota reclinato con casco profilato e visiera fumé.
   - Rigenerazione dell'asset binario `data/models/paraglider.glb` tramite `scripts/generate_3d_models.js`.

5. **HUD Replay & Scrubber Bimodale (`ui/3d/ReplayTelemetryCanvas.js` & `ui/views/FlightReplayView.js`)**:
   - Barra telemetrica con indicatore variometrico FAI graduato, quota MSL/AGL, velocità suolo, tempo volo e rosa della bussola con ago magnetico orientato in tempo reale.
   - Timeline scrubber bimodale con tick marker degli eventi di volo.
   - Barra chip interattiva `#replay-3d-events-strip` con click-to-seek playback.

6. **Strumento di Trimming Interattivo (`ui/views/FlightDetailSheet.js`)**:
   - Sezione `#gm-flight-trimming-section` con slider per punto di decollo e atterraggio, badge di stato traccia trimmata, pulsante di auto-rilevamento, applicazione e ripristino traccia nativa.
   - Rispetto rigoroso delle Laws of UX: target touch $\ge 48\text{px}$, zero emoji decorative, microcopy aeronautica pulita.

---

### 3. Esito della Verifica
- **Suite di Test**: 115 suite eseguite con **658 test superati, 0 fallimenti, 1 saltato**.
- Copertura aggiuntiva dedicata in `tests/core/flightTrimming.test.mjs` e `tests/ui/flightDetailSheet.test.mjs`.
