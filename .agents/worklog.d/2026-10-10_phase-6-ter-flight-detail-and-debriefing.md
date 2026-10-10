# Phase 6-ter: Flight Detail Sheet, Thermals Breakdown & Educational Debriefing

**Data**: 2026-10-10  
**Autore**: GlideMind Agent  
**Ambito**: `core/logbookDb.js`, `ui/views/FlightDetailSheet.js`, `ui/views/LogbookView.js`, `ui/app.js`, `css/theme.css`, `tests/`

---

## 1. Contesto & Requisiti

Durante la revisione post-Fase 6 è emersa l'assenza nel piano originario di una scheda/schermata di dettaglio per il singolo volo, presente invece nel sistema legacy ParaMeteo (`Flight Report Modal`).
Per evitare di costringere il pilota ad avviare un pesante contesto grafico WebGL 3D (Fase 7) solo per consultare la telemetria o prendere appunti, è stata progettata e implementata la **Fase 6-ter**: uno Sheet a piena altezza (`100dvh`) con `sheetManager` dedicato all'ispezione analitica, al debriefing di sicurezza e alle note personali.

---

## 2. Decisioni Architetturali & Dettagli Implementativi

### 2.1 Headless Core & Storage Layer (`core/logbookDb.js`)
- **Metodi di Aggiornamento Metadata & Note**:
  - `updateFlightMeta(flightId, partialMeta)`: implementato sia nel driver in-memory (`createMemoryDbAdapter`) sia su IndexedDB (`createIndexedDbAdapter`).
  - `updateFlightNotes(flightId, notes)`: persiste le annotazioni dell'utente in `flights_meta` e aggiorna lo store reattivo (`store.flights`).
  - `getFlightDetail(flightId)`: carica il bundle (`meta` + `raw`) e, se la telemetria non è già presente nella cache grezza, ricalcola automaticamente l'analisi completa con `analyzeFlightTelemetry()`.
- **Inclusione Telemetria in Ingestione**:
  - `importIgcTrack()` ora salva l'intero oggetto `telemetry` (termiche, deriva vento, fasi, manovre) dentro `flights_raw.telemetry`.

### 2.2 Componente UI `ui/views/FlightDetailSheet.js`
- **Bottom Sheet 100dvh via `sheetManager`**:
  - Apertura e chiusura non bloccanti con supporto Escape e tocco su backdrop, conforme alle regole anti-nested modals.
- **Profilo Altimetrico Vettoriale SVG**:
  - Grafico altimetrico responsive (`0 0 500 120`) con quote chiave (Max, Min, Decollo, Atterraggio) e riempimento semitrasparente.
  - Barra orizzontale a gradienti FAI o delle fasi di volo (`generateFlightPhaseGradient()`) con legenda discreta a 6 colori.
- **Griglia KPI & Cinematica**:
  - 6 metriche ad alto contrasto (Quota Max, Guadagno Max, Salita Max, Discesa Max, Dislivello Totale, Distanza GPS).
  - Vettore di deriva del vento termico calcolato in spirale (`dominantWindDrift`: velocità in km/h, gradi e punto cardinale).
- **Analisi Tabellare Termiche**:
  - Elenco strutturato di ciascuna termica agganciata: quota ingresso $\to$ uscita, guadagno netto ($+\Delta h$ m), durata, rateo medio di salita ($V_z$ m/s), numero di giri, senso di rotazione (Orario/Antiorario) e % di tempo in salita.
- **Riconoscimento Manovre ed Esercizi**:
  - Identificazione da `core/flightManeuvers.js` (360° continui, spirali, wingover) con quota e durata.
- **Debriefing Didattico di Sicurezza (Istruttore Guido)**:
  - Generazione immediata a 0ms di un debriefing analitico basato sui dati reali del volo, orientato alle caratteristiche della vela (`novice-pilot-auditor`) con alert su vento sostenuto e deriva sottovento.
- **Note Personali del Pilota**:
  - Area di testo interattiva per annotazioni di volo con pulsante "Salva Note" persistito su IndexedDB.
- **Dispatch Verso Replay 3D & Export FAI**:
  - Pulsante primario per impostare `activeReplayFlightId` e avviare il Replay 3D (Fase 7).
  - Pulsante per esportare la traccia IGC autentica con firma crittografica FAI G-record.

### 2.3 Integrazione Logbook View & Shell (`ui/views/LogbookView.js`, `ui/app.js`)
- Il tocco sulla testata della card o sulla sparkline altimetrica, oppure il click sul pulsante "Dettagli & Debriefing", apre lo sheet `FlightDetailSheet`.
- Registrazione di `openFlightDetailSheet` nell'interfaccia globale `window.__GLIDEMIND__`.
- Nuove classi CSS responsive in `css/theme.css`.

---

## 3. Test & Validazione

- `tests/core/logbookDb.test.mjs`: aggiunti test per `updateFlightMeta`, `updateFlightNotes`, `getFlightDetail` (17/17 passati).
- `tests/ui/flightDetailSheet.test.mjs`: 8 test dedicati (generazione SVG, debriefing formativo, render HTML, rispetto Fitts >= 48px, zero emoji decorative, integrazione `openFlightDetailSheet`).
- `npm test`: 74 suite su 74 superate con successo (509 test totali, 0 fallimenti).
