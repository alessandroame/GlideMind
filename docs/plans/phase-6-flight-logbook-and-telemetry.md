# Piano Architetturale: Modulo Logbook di Volo & Gestione Tracciati IGC

> **Fase**: Fase 6  
> **Stato**: 🟡 In Lavorazione (Piano Consolidato e Verificato Post-Audit)  
> **Target Repo**: `GlideMind`  
> **Moduli Coinvolti**: `core/logbookDb.js`, `ui/views/LogbookView.js`, `core/igcParser.js`, `core/flightTelemetry.js`, `core/flightManeuvers.js`, `core/store.js`, `ui/views/HomeDashboardView.js`, `tests/core/logbookDb.test.mjs`, `tests/core/logbookIgcPipeline.test.mjs`, `tests/ui/logbookView.test.mjs`

---

## 1. Visione di Dominio & Risoluzione Criticità di Audit

Il Logbook (libretto di volo personale) consente al pilota di archiviare, consultare e analizzare le proprie tracce GPS (file `.igc` registrati da variometri, smartphone o strumenti di volo conformi FAI).

L'audit pre-esecuzione ha identificato 6 rischi architetturali e algoritmici risolti organicamente in questo piano:
1. **Rischio di Storage Eviction su Browser Mobile**: Cancellazione automatica dei dati IndexedDB su WebKit/iOS o Android per inattività o pressione di memoria.
2. **Falso Amico Algoritmico (LTTB vs Rilevamento Manovre)**: La decimazione LTTB prima del calcolo manovre altera i delta angolari orizzontali a quota costante; la cinematica e il rilevamento termiche (`analyzeFlightTelemetry`) devono operare sulla sequenza 1Hz, mentre LTTB va applicato a valle per la visualizzazione.
3. **Doppia Conservazione Tracciato (Raw IGC + Decimated 3D)**: Conservazione di `rawIgc` per garantire integrità FAI, firma crittografica G-record ed esportazione fedele, combinata a `decimatedPoints` (1.500 campioni LTTB) per avvio istantaneo (<10ms) del Replay 3D senza ricalcolo su mobile.
4. **Resilienza Fingerprint Deterministico in Contesti Non Sicuri (HTTP / LAN)**: Sostituzione di `crypto.subtle` (indisponibile su HTTP/LAN) con algoritmo hash sincrono puro in JavaScript (FNV-1a a 64-bit).
5. **Prevenzione Quota Exceeded su `localStorage` & Split-Brain**: IndexedDB è l'unica sorgente di verità persistente su disco. La slice `store.flights` opera come cache reattiva in RAM sincronizzata con il database.
6. **Autonomia Fixture di Test**: Integrazione di `tests/fixtures/sample_flight.igc` direttamente nel repository eliminando dipendenze da path assoluti esterni.

---

## 2. Architettura del Database: Injectable Storage Adapter Pattern (`core/logbookDb.js`)

In conformità al vincolo di **Headless Core** (Gate 2), il modulo `core/logbookDb.js` non contiene riferimenti diretti a `window` o `indexedDB` nel corpo logico principale.

### 2.1. Interfaccia `ILogbookDbAdapter`
```javascript
/**
 * @typedef {Object} FlightMeta
 * @property {string} id - Fingerprint deterministico ("fl_...")
 * @property {string} date - Data volo locale ("YYYY-MM-DD")
 * @property {string} [utcDate] - Data UTC da header HFDTE
 * @property {string} takeoffTime - Ora locale decollo ("HH:MM")
 * @property {string} landingTime - Ora locale atterraggio ("HH:MM")
 * @property {number} durationSeconds - Durata effettiva in secondi
 * @property {number} durationMinutes - Durata in minuti per calcolo currency
 * @property {string} site - Nome decollo o comprensorio abbinato
 * @property {string} siteName - Titolo decollo -> atterraggio
 * @property {string|null} takeoffLocationName - Nome decollo censito
 * @property {string|null} landingLocationName - Nome atterraggio censito
 * @property {string} pilot - Nome pilota da header IGC
 * @property {string} glider - Modello vela (da header o profilo attivo)
 * @property {string} gliderClass - Categoria vela (EN-A, EN-B, EN-C, EN-D)
 * @property {boolean} hasThermals - Flag presenza termiche
 * @property {boolean} hasExercises - Flag presenza manovre/esercizi
 * @property {number} thermalsCount - Numero termiche rilevate
 * @property {number} maneuversCount - Numero manovre rilevate
 * @property {Array<string>} detectedManeuvers - Elenco chiavi manovre rilevate
 * @property {number} takeoffAltMsl - Quota decollo (m slm)
 * @property {number} maxAltMsl - Quota massima raggiunta (m slm)
 * @property {number} minAltMsl - Quota minima registrata (m slm)
 * @property {number} maxGainMeters - Massimo guadagno dal decollo (m)
 * @property {number} maxClimbRate - Massimo rateo di salita (m/s)
 * @property {number} maxSinkRate - Massimo rateo di discesa (m/s)
 * @property {number} accumulatedClimbMeters - Dislivello positivo cumulato (m)
 * @property {number} distanceKm - Distanza orizzontale percorsa (km)
 * @property {string} sparklineSvgPoints - Stringa punti SVG (60-80 campioni)
 * @property {boolean} hasRawIgc - Flag disponibilità traccia grezza
 * @property {boolean} hasDecimatedTrack - Flag disponibilità traccia 3D
 * @property {number} rawFileSizeBytes - Dimensione originale file IGC in byte
 * @property {string} [originalFileName] - Nome file IGC importato
 * @property {number} updatedAt - Timestamp Unix UTC per Last-Write-Wins
 */

/**
 * @typedef {Object} FlightRawRecord
 * @property {string} id - Chiave 1-to-1 corrispondente a FlightMeta.id
 * @property {string} rawIgc - Testo ASCII originale non modificato (FAI conforme)
 * @property {string} originalFileName - Nome originale file IGC
 * @property {Array<Object>} decimatedPoints - 1.500 punti LTTB per Replay 3D
 * @property {number} sampleIntervalSeconds - Intervallo di campionamento stimato
 * @property {number} updatedAt - Timestamp Unix UTC
 */

/**
 * @typedef {Object} ILogbookDbAdapter
 * @property {() => Promise<void>} init
 * @property {(meta: FlightMeta, raw: FlightRawRecord) => Promise<string>} saveFlight
 * @property {(flightId: string) => Promise<{ meta: FlightMeta, raw: FlightRawRecord } | null>} getFlight
 * @property {() => Promise<FlightMeta[]>} getAllFlightMetas
 * @property {(flightId: string) => Promise<FlightRawRecord | null>} getRawFlight
 * @property {(flightId: string) => Promise<string | null>} getRawIgc
 * @property {(flightId: string) => Promise<Array<Object> | null>} getDecimatedTrack
 * @property {(flightId: string) => Promise<boolean>} deleteFlight
 * @property {() => Promise<CareerKpi>} getCareerKpis
 * @property {() => Promise<boolean>} clearAll
 */
```

### 2.2. Due Driver Disaccoppiati
1. **`createMemoryDbAdapter()`**: Driver in-memory puro basato su `Map` JavaScript. Predefinito per tutti i test automatizzati in Node.js puro (`node:test`), garantendo esecuzione a 0ms senza polyfill.
2. **`createIndexedDbAdapter({ dbName = 'glidemind_logbook', version = 1 })`**: Driver per l'ambiente browser reale, montato al bootstrap della UI.

---

## 3. Schema a Due Livelli & Fingerprinting Deterministico

```
+-------------------------------------------------------------------------------+
| Store IndexedDB: flights_meta (Leggero, in RAM all'avvio, ~1.5 KB per volo)   |
| - id: "fl_20261010_142305_a8f3b2" (fingerprint deterministico)                |
| - date, departureTime, durationMinutes, site, siteName, pilot, glider         |
| - stats: { takeoffAltMsl, maxAltMsl, maxClimbRate, distanceKm, etc. }         |
| - sparklineSvgPoints: "0,50 10,42 25,18 ... 100,85" (60-80 punti per card)   |
| - hasRawIgc: true, hasDecimatedTrack: true                                    |
| - rawFileSizeBytes: 345120                                                    |
| - updatedAt: 1775836925000                                                    |
+-------------------------------------------------------------------------------+
                                    │
                                1-to-1 Key
                                    ▼
+-------------------------------------------------------------------------------+
| Store IndexedDB: flights_raw (Caricato ON-DEMAND SOLO per Replay 3D o Export) |
| - id: "fl_20261010_142305_a8f3b2"                                             |
| - rawIgc: string (Testo ASCII originale bit-for-bit con record H, B, G)       |
| - originalFileName: string (es. "2026-07-04-XNA-Ciavanis.igc")                |
| - decimatedPoints: Array<Point> (1.500 punti LTTB per Canvas/WebGL 60 FPS)    |
| - sampleIntervalSeconds: number                                               |
| - updatedAt: 1775836925000                                                    |
+-------------------------------------------------------------------------------+
```

### 3.1. Fingerprinting Deterministico Sincrono (FNV-1a a 64-bit)
Per garantire il corretto funzionamento su qualsiasi contesto (Node.js, HTTPS, HTTP su rete locale mobile):
$$\text{Payload} = \text{Data UTC} + \text{Primo B-record} + \text{Ultimo B-record} + \text{Numero record B}$$
L'hash a 64-bit produce una stringa esadecimale compatta: `fl_YYYYMMDD_HHMMSS_<hash64>`.
Se un file IGC importato genera un fingerprint già presente in `flights_meta`, l'operazione è idempotente: il record viene aggiornato se `updatedAt` è più recente, senza duplicare voli o alterare i KPI di carriera.

---

## 4. Pipeline di Ingestione Asincrona Chunkata (Anti-Jank)

1. **Chunked Parsing Loop**:
   - Lettura del buffer testuale IGC a blocchi di 2.000 righe.
   - Rilascio del thread via `yieldToMainThread()` (`scheduler.yield()` con fallback a `setTimeout(..., 0)`).
   - Aggiornamento della barra di avanzamento lineare per rispettare la Doherty Threshold (<400ms).
2. **Cinematica e Rilevamento Termiche su Sequenza 1Hz**:
   - `trimFlightGroundPoints()` elimina la preparazione al suolo e il ripiegamento in atterraggio.
   - `analyzeFlightTelemetry()` analizza la traccia 1Hz intatta, garantendo il rilevamento corretto di 360°, virate, ratei e termiche.
3. **Decimazione LTTB a Valle**:
   - `decimateLTTB(flightPoints, 1500, 'alt')` produce `decimatedPoints` per il Replay 3D.
   - `decimateLTTB(flightPoints, 60, 'alt')` produce la stringa `sparklineSvgPoints` per la card di consultazione.
4. **Salvataggio Atomico & Rilascio Memoria Heap**:
   - Inserimento coordinato di `FlightMeta` in `flights_meta` e di `FlightRawRecord` in `flights_raw`.
   - Dereferenziazione immediata dell'array 1Hz non compresso dalla memoria heap.

---

## 5. Esportazione, Backup Sincronizzato & Integrazione con Fase 6-bis

1. **Esportazione Singolo Volo IGC**:
   - `exportFlightIgc(flightId)`: recupera `rawIgc` da `flights_raw` e genera il download di un file Blob `.igc` con MIME `application/x-igc`, preservando la firma digitale FAI G-record.
2. **Full Backup & Restore (Fase 6-bis `backupManager.js`)**:
   - Il backup completo include `flights_meta` e `flights_raw` (`rawIgc` + `decimatedPoints`).
   - In caso di ripristino di backup storici privi di `decimatedPoints`, la pipeline rigenera i 1.500 punti LTTB a partire da `rawIgc` in background.
   - Regola Last-Write-Wins basata sul timestamp `updatedAt` durante lo Smart Merge.
3. **Sincronizzazione Reattiva dello Store**:
   - Al termine di ogni inserimento o cancellazione, `logbookManager` emette l'array aggiornato dei metadati verso `store.setState({ flights: updatedMetas })`.
   - `HomeDashboardView` aggiorna istantaneamente la card della Currency Pilota senza richiedere ricaricamenti.

---

## 6. Progettazione della Vista UI (`ui/views/LogbookView.js`)

In conformità agli standard **Laws of UX** e **Outdoor Ergonomics**:
1. **Header KPI di Carriera**:
   - 4 riquadri glanceable ad alto contrasto: Ore Volate, Numero Voli, Quota Massima (MSL), Durata Massima.
   - Dati calcolati in tempo reale dall'indice `flights_meta` (<10ms).
2. **Area di Caricamento Primaria (Von Restorff Effect)**:
   - Box drag-and-drop con pulsante touch prominente ($\ge 48\times 48\text{px}$) `+ Importa Traccia IGC`.
   - Input file multi-selezione (`multiple`) con supporto per file `.igc`.
3. **Elenco Voli Ordinato Cronologicamente Decrescente**:
   - Card di volo responsive al 100% di larghezza utile mobile.
   - Riga 1: Data, orario decollo, nome decollo (abbinato al comprensorio) e classe vela.
   - Riga 2: Durata, dislivello, quota max, termiche rilevate e guadagno totale.
   - Sparkline altimetrica vettoriale SVG ad alta leggibilità outdoor (zero numeri isolati privi di contesto).
   - Pulsante secondario `Visualizza Replay 3D` (predisposizione Fase 7).
   - Pulsante discreto `Scarica IGC` per download del file originale conforme FAI.
   - Azione di eliminazione con finestra di grazia Undo (NN/G Heuristic #3) prima della cancellazione permanente.
4. **Stato Vuoto Esplicito (Empty State)**:
   - Box chiaro con istruzioni su come trasferire tracce da XContest, Syride o XCSoar, privo di emoji decorative.
5. **Salvaguardia Anti-Eviction Mobile**:
   - Invocazione di `navigator.storage.persist()`.
   - In caso di risposta `false`, esposizione di una notifica discreta con raccomandazione di installazione come PWA.

---

## 7. Protocollo di Test & Pre-Delivery Gates

1. **Unit Test Headless Core (`tests/core/logbookDb.test.mjs`)**:
   - Test su `createMemoryDbAdapter`: inserimento, recupero, KPI carriera, deduplicazione deterministica FNV-1a, cancellazione atomica.
   - 100% eseguibile in Node.js puro senza JSDOM né browser a 0ms.
2. **Integration Test Ingestione IGC (`tests/core/logbookIgcPipeline.test.mjs`)**:
   - Ingestione del file reale `tests/fixtures/sample_flight.igc`.
   - Verifica di segregazione: presenza di metadati in `flights_meta` e di testo originale + 1.500 punti LTTB in `flights_raw`.
   - Verifica di matching decollo/atterraggio con il catalogo comprensori.
3. **UI Controller Test (`tests/ui/logbookView.test.mjs`)**:
   - Montaggio e smontaggio controller, rendering 4 KPI carriera, card di volo, touch targets $\ge 48\text{px}$, navigazione e accessibilità WAI-ARIA.
4. **Shift-Left Regression Test**:
   - Esecuzione completa di `npm test`: tutte le suite pre-esistenti (448 test) devono rimanere verdi al 100%.
