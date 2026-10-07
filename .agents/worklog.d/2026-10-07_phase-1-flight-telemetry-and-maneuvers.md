# [2026-10-07] ADR: Estrazione e Decoupling Headless di flightTelemetry.js e flightManeuvers.js

## Contesto & Motivazione
Nel legacy ParaMeteo, l'elaborazione cinematica e la classificazione aerobica/termica del tracciato di volo (IGC) erano frammentate tra moduli grafici e dipendenze dirette dalla vista Leaflet e Canvas.
Per soddisfare le specifiche di Fase 1 di [MASTER_PLAN.md](file:///c:/github/GlideMind/MASTER_PLAN.md) e [DESIDERATA.md](file:///c:/github/GlideMind/DESIDERATA.md), è stato necessario implementare i motori puri headless `core/flightTelemetry.js` e `core/flightManeuvers.js`, garantendo:
1. Zero dipendenze da DOM, Window o Canvas.
2. Decimazione LTTB (Largest-Triangle-Three-Buckets) ad alta velocità (<10ms per 10k punti) per garantire 60 FPS nei canvas e chart di visualizzazione.
3. Rilevamento deterministico delle termiche con baricentro pesato sul climb rate, calcolo dell'efficienza termica e della deriva del vento.
4. Rilevamento delle manovre acrobatiche (wingover, spirale rapida con rateo > 7 m/s, 360° singolo, 2x 360°, circuito a 8, orecchie con pilotaggio asimmetrico) con soppressione automatica in fase di atterraggio.
5. Piena retrocompatibilità per il merge idempotente dei tag utente tramite `mergeManeuversPreservingExisting`.

## Decisioni Architetturali
- **Calcolo Delta Angolare con Segno**:
  A differenza del calcolo geodetico standard che restituisce angoli assoluti $[0, 180]^\circ$, la cinematica di volo richiede un delta angolare con segno $[-180, +180]^\circ$ per distinguere rotazioni orarie (CW) e antiorarie (CCW) ed evitare cancellazioni fittizie nelle spirali e oscillazioni. È stata definita la funzione pura `calculateAngularDelta(b1, b2) = ((b2 - b1 + 540) % 360) - 180`.
- **Decimazione Adattiva LTTB**:
  Implementazione standalone dell'algoritmo *Largest-Triangle-Three-Buckets* per la riduzione del numero di punti del tracciato salvaguardando i picchi locali altimetrici e variometrici.
- **Filtraggio e Smussamento Altimetrico**:
  Calcolo del moving average simmetrico preservando le quote di estremità (decollo e atterraggio), separando il guadagno di quota in termica rispetto al veleggiamento dinamico (ridge soaring) con soglia di reiezione rumore di 0.2m.
- **Integrazione Cablata con `igcParser.js`**:
  `parseIgc` invoca `analyzeFlightTelemetry` come motore di default se non diversamente specificato, mantenendo opzionale il bypass via `skipTelemetry: true` o l'iniezione personalizzata via `telemetryAnalyzer`.

## Impatto e Conseguenze
- Nuovi moduli headless creati:
  - [`core/flightTelemetry.js`](file:///c:/github/GlideMind/core/flightTelemetry.js)
  - [`core/flightManeuvers.js`](file:///c:/github/GlideMind/core/flightManeuvers.js)
- Suite di test automatizzate native Node.js (`node --test`):
  - [`tests/core/flightTelemetry.test.mjs`](file:///c:/github/GlideMind/tests/core/flightTelemetry.test.mjs): 21/21 test superati.
  - [`tests/core/flightManeuvers.test.mjs`](file:///c:/github/GlideMind/tests/core/flightManeuvers.test.mjs): 17/17 test superati.
  - Aggiornamento di [`tests/core/igcParser.test.mjs`](file:///c:/github/GlideMind/tests/core/igcParser.test.mjs): 22/22 test superati.
- Test suite totale di regressione: 124/124 test superati con successo in < 500ms.
