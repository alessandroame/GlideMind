# Phase 6: Flight Logbook & IGC Telemetry Database Implementation

**Data**: 2026-10-10  
**Autore**: GlideMind Agent  
**Ambito**: `core/logbookDb.js`, `core/flightTelemetry.js`, `ui/views/LogbookView.js`, `ui/views/HomeDashboardView.js`, `ui/app.js`, `css/theme.css`, `tests/`

---

## 1. Contesto & Obiettivi

Implementazione completa della Fase 6 della roadmap di GlideMind ([docs/plans/phase-6-flight-logbook-and-telemetry.md](file:///c:/github/GlideMind/docs/plans/phase-6-flight-logbook-and-telemetry.md)):
1. Database headless locale di memorizzazione e gestione dei voli IGC con architettura Injectable Storage Adapter.
2. Persistenza strutturata a due livelli (`flights_meta` per la navigazione rapida e `flights_raw` per il file IGC autentico e i punti decimati per il Replay 3D).
3. Fingerprinting deterministico sincrono FNV-1a 64-bit per rilevamento duplicati e salvataggio idempotente.
4. Timing rigoroso della decimazione LTTB a valle della cinematica e del rilevamento termiche.
5. Controller UI `LogbookView.js` con griglia KPI di carriera, dropzone upload touch $\ge 48\text{px}$, sparkline altimetriche SVG, download IGC autentico e cancellazione protetta da finestra di Undo (5s).
6. Riconciliazione dell'azione rapida `+ Carica IGC` nella Home Dashboard.

---

## 2. Decisioni Architetturali & Dettagli Implementativi

### 2.1 Modulo Headless `core/logbookDb.js`
- **Injectable Storage Adapter Pattern**:
  - `createMemoryDbAdapter()`: Adapter sincrono in-memory per esecuzione in Node.js puro e test automatici ultra-rapidi a 0ms.
  - `createIndexedDbAdapter(dbName, version)`: Adapter browser su IndexedDB con gestione automatica di transazioni, upgrade di schema (store `flights_meta` con indice `date` e store `flights_raw`) e serializzazione sicura.
- **Fingerprinting Deterministico (FNV-1a 64-bit)**:
  - Funzione pura sincrona `computeFlightFingerprint({ date, takeoffTime, pointsCount, durationMinutes, maxAltMsl })`.
  - Genera identificatori univoci e riproducibili nel formato `fl_YYYYMMDD_HHMMSS_<hexHash>`.
- **Parsing Asincrono Cooperativo**:
  - `yieldToMainThread()` invoca `scheduler.yield()` o `MessageChannel`/`setTimeout(0)` ogni 2.000 righe per preservare la reattività della UI entro la soglia di Doherty (<400ms) durante l'upload di tracce IGC dense (10.000+ punti).
- **Timing LTTB a Valle**:
  - Cinematica, dislivello, velocità verticale e termiche sono calcolate sui dati sequenziali continui a 1Hz dopo il trimming al suolo.
  - La decimazione LTTB (`decimateLTTB`) interviene a valle:
    - 60 punti altimetrici normalizzati per la sparkline SVG in `flights_meta`.
    - 1.500 punti geodetici e cinematici pronti all'uso per il Replay 3D in `flights_raw`.
- **Autenticità IGC & Protezione FAI**:
  - `flights_raw` preserva l'esatto payload ASCII originale del file IGC (`rawIgc`), garantendo integrità dei record H e della firma G-record FAI per download ed esportazione.
- **Idempotenza & Last-Write-Wins**:
  - `saveFlight(flightMeta, rawPayload)` controlla la presenza dell'ID: se già esistente, esegue l'aggiornamento preservando `createdAt` e aggiornando `updatedAt`.
- **Deduzione della Vela e Omologazione**:
  - `deduceGliderClass(gliderName)` analizza suffissi e interroga `POPULAR_GLIDERS` (`core/gliders.js`), assegnando la corretta classe EN-A..EN-D anche in assenza di annotazioni esplicite nel file IGC.
- **Persistenza Storage Garantita**:
  - `requestStoragePersistence()` richiede `navigator.storage.persist()` su WebKit/Chromium per prevenire l'eviction automatica della cache IndexedDB da parte del sistema operativo mobile.

### 2.2 Controller UI `ui/views/LogbookView.js` & Design System
- **Ergonomia Outdoor & Laws of UX**:
  - 4 KPI di carriera calcolati in tempo reale (Ore Totali Volate, Numero Voli, Quota Massima MSL, Distanza Massima).
  - Dropzone touch e pulsante di selezione file con area interattiva $\ge 48\times 48\text{px}$.
  - Progress bar deterministica per upload IGC e messaggistica di errore contestuale.
  - Badge di classe vela responsive con classi semantiche `.en-a`, `.en-b`, `.en-c`, `.en-d`.
  - Sparkline altimetriche SVG responsive (`viewBox="0 0 100 32"`).
  - Banner di salvaguardia Undo (NN/G Euristica #3): timer di 5 secondi con ripristino immediato e commit atomico asincrono.
  - Azione "Visualizza Replay 3D" con navigazione guidata e salvataggio traccia attiva in `store.activeReplayFlightId`.
  - Azione "Scarica IGC" autentico via `Blob` e URL effimero con pulizia automatica via `URL.revokeObjectURL`.

### 2.3 Riconciliazione Home Dashboard (`ui/views/HomeDashboardView.js`)
- L'azione rapida `+ Carica IGC` è stata riconciliata con il singleton `logbookManager`:
  - Lettura e parsing asincrono del file IGC.
  - Salvataggio nel database a 2 livelli.
  - Sincronizzazione atomica con `store.flights`.
  - Re-render immediato della sezione voli recenti.

### 2.4 Registrazione Router & Shell (`ui/app.js`)
- Registrata `logbookView` come vista del tab `#logbook`.
- All'avvio dell'applicazione nel browser, `logbookManager` monta l'adapter `createIndexedDbAdapter` e idrata lo store reattivo (`store.setState({ flights })`), richiedendo la persistenza persistente dello storage.

---

## 3. Test & Validazione

- `tests/fixtures/sample_flight.igc`: Tracciato reale con 73 punti B-record, coordinate del comprensorio di Monte Cornizzolo (Decollo Risparmio -> Atterraggio Suello), spirale termica, planata finale e firma FAI G-record.
- `tests/core/logbookDb.test.mjs`: 15 test unitari (adapter memory, FNV-1a fingerprint, deduzione vele, generazione sparkline, calcolo statistiche carriera, sanitizzazione ID).
- `tests/core/logbookIgcPipeline.test.mjs`: 6 test di integrazione (ingestione duale raw/meta, idempotenza, export G-record, cancellazione atomica, transazioni rollback).
- `tests/ui/logbookView.test.mjs`: 5 test di integrazione UI (rendering KPI e empty state, flight list, ergonomia Fitts >= 48px, WAI-ARIA, banner di Undo 5s, teardown unmount).
- **Copertura Globale**: Tutte le 73 suite di test di GlideMind (497 test totali) risultano completate con successo (0 fallimenti).
