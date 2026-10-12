# GlideMind - Fase 7-ter: Analisi Tracce IGC Avanzata, Trimming & Visualizzazione Volo ParaMeteo

## 1. Contesto & Obiettivi

Integrazione delle funzionalità di analisi avanzata del tracciato di volo, estrazione eventi, trimming non distruttivo al decollo e all'atterraggio, avatar 3D competition ad alta fedeltà e cruscotto telemetrico avionico completo per la visualizzazione 3D in GlideMind, mutuati dagli standard sperimentati in ParaMeteo.

### Obiettivi Operativi:
1. **Riconoscimento e Persistenza Fasi di Volo ed Eventi**:
   - `takeoff`: Decollo e fase iniziale di involo.
   - `thermal`: Termiche centrate (salita netta >= 10m, rateo medio, numero di giri, direzione CW/CCW, deriva del vento).
   - `soaring`: Veleggiamento dinamico in costone (Vz > -0.8 m/s, senza cerchi completi).
   - `glide`: Planata in efficienza (-0.8 a -2.5 m/s).
   - `descent`: Discesa rapida (Vz < -2.5 m/s).
   - `maneuvers`: Esercizi e manovre acrobatiche (360°, 2x 360° consecutivi, spirale / vite positiva, wingover, circuito a 8, orecchie con pilotaggio, inversioni di rollio).
   - `landing`: Finale, smaltimento quota, flare e atterraggio.
   - Salvare in `flights_meta` e `flights_raw` sia la sintesi numerica sia la cronologia dettagliata (`telemetry.phases.timeline`, `telemetry.events`).

2. **Trimming Traccia al Decollo e all'Atterraggio**:
   - Modulo headless `core/flightTrimming.js` per rilevamento automatico soglie e applicazione trimming.
   - Trimming manuale/interattivo in `FlightDetailSheet.js` con anteprima in tempo reale e ricalcolo metriche.
   - Persistenza non distruttiva a due livelli in `core/logbookDb.js` con opzione di ripristino ("Ripristina originale").

3. **Avatar 3D Parapendio ad Alta Fedeltà (ParaMeteo Replica)**:
   - Ala ad alto allungamento (AR ~ 7.6, Enzo 3 style), profilo reflex shark-nose a 54 cassoni con rastremazione ellittica, centine visibili, aperture bocche nere e tip chiusi (watertight).
   - Fascio funicolare da competizione a 2 bretelle (file A e B in Kevlar ardesia) e comandi freno sul bordo d'uscita.
   - Imbrago pod carenato aerodinamico (cocoon integrale con deck portastrumenti e pinna gonfiabile posteriore).
   - Pilota reclinato con casco aerodinamico a goccia e visiera fumé scura, braccia protese con maniglie freno reattive.
   - Generazione file binario `data/models/paraglider.glb` e fallback procedurale Three.js identico in `ui/3d/models/paragliderModel.js`.

4. **Cruscotto Telemetrico Avionico e Dati Caratteristici nel Replay 3D**:
   - Barra telemetrica avionica: badge fase colorata, variometro FAI, velocità suolo, quota MSL, quota AGL rispetto al DEM, prua in gradi con ago bussola, orologio locale fix GPS.
   - Striscia eventi di volo (Event Chips Strip): chip interattivi per salto rapido a Decollo, Termiche, Quota Max, Picco Vario, Manovre, Atterraggio.
   - Timeline scrubber a doppio binario: barra colorata fasi di volo + tick marker eventi.

---

## 2. Fasi di Sviluppo

- **Fase 1 (Core Headless)**: `core/flightTrimming.js`, `core/flightTelemetry.js` (estrazione eventi, manovre nelle fasi), `core/logbookDb.js` (metodi di trimming e ripristino), `core/parameteoImporter.js` (auto-trimming su importazione). Test unitari in `tests/core/flightTrimming.test.mjs`.
- **Fase 2 (Avatar 3D)**: `ui/3d/models/paragliderModel.js` a 54 celle con pod cocoon, pilota e visiera. Script `scripts/generate_3d_models.js` e asset `data/models/paraglider.glb`. Test in `tests/ui/paragliderModel.test.mjs`.
- **Fase 3 (Cruscotto Replay 3D)**: `ui/views/FlightReplayView.js` e `ui/3d/ReplayTelemetryCanvas.js` con telemetria avionica, prua con ago bussola, AGL, striscia chip eventi cliccabili e scrubber a doppio binario. Test in `tests/ui/flightReplayView.test.mjs`.
- **Fase 4 (Strumento Trimming UI)**: `ui/views/FlightDetailSheet.js` con sezione interattiva di regolazione e salvataggio decollo/atterraggio. Test in `tests/ui/flightDetailSheet.test.mjs`.
- **Fase 5 (Validazione Finale)**: Esecuzione `npm test` su tutta la suite e verifica shift-left gates.
