# Piano Architetturale: Modulo Logbook di Volo & Gestione Tracciati IGC

> **Fase**: Fase 6  
> **Stato**: 🔴 Prioritario (Prossimo Step Operativo Primario)  
> **Target Repo**: `GlideMind`  
> **Moduli Coinvolti**: `core/logbookDb.js`, `ui/views/LogbookView.js`, `core/igcParser.js`, `core/flightTelemetry.js`, `core/flightManeuvers.js`, `tests/core/logbookDb.test.mjs`, `tests/ui/logbookView.test.mjs`

---

## 1. Visione di Dominio & Obiettivi Sobri

Il Logbook (libretto di volo personale) consente al pilota di archiviare, consultare e analizzare le proprie tracce GPS (file `.igc` registrati da variometri, smartphone o strumenti di volo conformi FAI).

L'audit architetturale ha identificato 5 rischi operativi che questo piano indirizza con guardie sistematiche:
1. **Rischio di Storage Eviction su Browser Mobile**: Cancellazione automatica dei dati IndexedDB su WebKit/iOS o Android per inattività.
2. **Blocco del Thread Principale & Memory Bloat**: Jank o freeze dell'interfaccia (>400ms) durante il caricamento o parsing di file IGC estesi (>20.000 righe).
3. **Regressione Test Node.js (Headless Core)**: Mancanza di `window.indexedDB` nell'ambiente di test nativo Node.js.
4. **Dati Duplicati & Re-import Involontario**: Importazione ripetuta della stessa traccia da file con nomi diversi.
5. **Accoppiamento Monolitico**: Caricamento in RAM dell'intero archivio tracciati durante la consultazione ordinaria dell'elenco voli.

---

## 2. Architettura del Database: Injectable Storage Adapter Pattern (`core/logbookDb.js`)

In conformità al vincolo di **Headless Core** (Gate 2), il database non deve contenere alcun riferimento diretto a `window` o `indexedDB` nel corpo logico principale.

### 2.1. Interfaccia `ILogbookDbAdapter`
```javascript
/**
 * @typedef {Object} ILogbookDbAdapter
 * @property {() => Promise<void>} init
 * @property {(meta: FlightMeta, rawIgc: string) => Promise<string>} saveFlight
 * @property {(flightId: string) => Promise<{ meta: FlightMeta, rawIgc: string } | null>} getFlight
 * @property {() => Promise<FlightMeta[]>} getAllFlightMetas
 * @property {(flightId: string) => Promise<boolean>} deleteFlight
 * @property {(flightId: string) => Promise<string | null>} getRawIgc
 * @property {() => Promise<CareerKpi>} getCareerKpis
 * @property {() => Promise<boolean>} clearAll
 */
```

### 2.2. Due Driver Disaccoppiati
1. **`createMemoryDbAdapter()`**: Driver in-memory puro basato su `Map` JavaScript. Viene utilizzato per tutti i test automatizzati in Node.js puro (`node:test`), garantendo esecuzione a 0ms senza polyfill né dipendenze esterne.
2. **`createIndexedDbAdapter({ dbName = 'glidemind_logbook', version = 1 })`**: Driver per l'ambiente browser reale, montato esclusivamente al bootstrap della UI.

---

## 3. Schema Dati a Due Livelli & Fingerprinting Deterministico

Per prevenire il degrado della memoria heap (Out-Of-Memory su mobile), i dati del volo vengono memorizzati in due Object Store separati:

```
+--------------------------------------------------------------------------+
|                     GLIDEMIND INDEXEDDB STORES                           |
+--------------------------------------------------------------------------+
|  flights_meta (Store leggero per elenco, filtri, grafici sintetici)      |
|  - id: "fl_20261010_142305_a8f3b2" (fingerprint deterministico)         |
|  - date: "2026-10-10"                                                    |
|  - departureTime: "12:15:30Z", arrivalTime: "14:22:10Z"                  |
|  - durationSeconds: 7600                                                 |
|  - siteId: "monte-cavallaria-calea-to-to"                                |
|  - siteName: "Monte Cavallaria"                                          |
|  - takeoffAltMsl: 1420, maxAltMsl: 2180, minAltMsl: 320                  |
|  - maxClimbRate: 3.8, maxSinkRate: -4.2                                  |
|  - thermalsCount: 7, totalThermalGainM: 1840                             |
|  - distanceKm: 34.2                                                      |
|  - gliderModel: "Compact 4", gliderClass: "EN-A"                         |
|  - sparklineSvgPoints: "0,50 10,42 25,18 ... 100,85"                    |
|  - updatedAt: 1775836925000                                              |
+--------------------------------------------------------------------------+
                                    │
                               1-to-1 Key
                                    ▼
+--------------------------------------------------------------------------+
|  flights_raw (Store pesante, caricato ON-DEMAND SOLO per Replay 3D)      |
|  - id: "fl_20261010_142305_a8f3b2"                                       |
|  - rawIgcText: "A... \n H... \n B..." (blob compresso o testo grezzo)    |
|  - sampleIntervalSeconds: 1                                              |
+--------------------------------------------------------------------------+
```

### 3.1. Fingerprinting Deterministico Anti-Duplicati
Il fingerprint del volo viene calcolato tramite hash dei seguenti parametri invarianti:
$$\text{Fingerprint} = \text{Hash}(\text{Data UTC} + \text{Primo B-record} + \text{Ultimo B-record} + \text{Numero record B})$$
Se un file IGC importato genera un fingerprint già presente in `flights_meta`, l'importazione viene considerata idempotente: il sistema notifica l'utente senza duplicare il record o alterare i KPI di carriera.

---

## 4. Pipeline di Ingestione Asincrona Chunkata (Anti-Jank)

Per rispettare la Doherty Threshold (<400ms) durante il caricamento di file da 20.000–30.000 righe:

1. **Chunked Parsing Loop**:
   - La lettura del buffer testuale IGC procede a blocchi di 2.000 righe.
   - Al termine di ogni chunk, il codice invoca `await yieldToMainThread()` (`scheduler.yield()` con fallback a `new Promise(r => setTimeout(r, 0))`).
   - L'interfaccia aggiorna una barra di avanzamento lineare deterministica.
2. **Pre-Decimazione LTTB per Calcolo Manovre**:
   - I campionamenti 1Hz (es. 20.000 punti) vengono decimati a 1.500 punti significativi tramite `decimateLTTB` prima di invocare il rilevamento manovre e virate (`core/flightManeuvers.js`).
   - Questo riduce il tempo di calcolo delle termiche da ~2.200ms a meno di 65ms su CPU mobile.
3. **Rilascio Heap Immediato**:
   - Una volta calcolati i metadati e memorizzato il record in `flights_raw`, l'array esteso dei punti grezzi viene dereferenziato per consentire al Garbage Collector di liberare memoria prima di elaborare il file successivo.

---

## 5. Salvaguardia Anti-Eviction Mobile

All'apertura della vista Logbook o all'inizializzazione del database:
1. Invocazione di `navigator.storage.persist()`:
   ```javascript
   if (navigator.storage && navigator.storage.persist) {
     const isPersisted = await navigator.storage.persist();
     if (!isPersisted) {
       store.dispatch('SET_STORAGE_PERSISTENCE_WARNING', true);
     }
   }
   ```
2. In caso di persistenza non concessa (es. Safari su iOS non in modalità PWA installata), visualizzazione di una scheda di avviso discreta:
   - *"Nota sulla memoria: I tuoi voli sono salvati nella cache del browser. Per proteggerli da cancellazioni automatiche, aggiungi GlideMind alla schermata Home o esegui un backup periodico."*
3. Integrazione diretta con il **Dirty Tracker** (Fase 6-bis) che notifica la raccomandazione di backup se trascorrono >14 giorni o risultano memorizzati $\ge 3$ voli dall'ultimo export.

---

## 6. Progettazione della Vista UI (`ui/views/LogbookView.js`)

Aderenza rigorosa agli standard di **Laws of UX** e **Outdoor Ergonomics**:
1. **Header KPI di Carriera**:
   - 4 riquadri glanceable ad alto contrasto: Ore Volate, Numero Voli, Quota Massima (MSL), Durata Massima.
   - Dati calcolati in tempo reale dall'indice `flights_meta` (<10ms).
2. **Area di Caricamento Primaria (Von Restorff Effect)**:
   - Box di drop drag-and-drop con pulsante touch prominente ($\ge 48\times 48\text{px}$) `+ Importa Traccia IGC`.
   - Supporto nativo per input file multi-selezione (`multiple`).
3. **Elenco Voli Ordinato Cronologicamente Decrescente**:
   - Card di volo responsive al 100% di larghezza.
   - Riga 1: Data, ora decollo, nome decollo (rilevato da `matchFlightSites`) e modello vela.
   - Riga 2: Durata, dislivello, quota max, termiche rilevate con guadagno totale.
   - Profilo altimetrico vettoriale SVG compatto (sparkline) senza numeri isolati.
   - Pulsante secondario `Visualizza Replay 3D` (che predispone il caricamento del tracciato per la Fase 7) e pulsante discreto di eliminazione volo con conferma o Undo.
4. **Stato Vuoto Esplicito (Empty State)**:
   - Se nessun volo è memorizzato, visualizzazione di un box chiaro con istruzioni su come trasferire tracce da XContest, Syride o XCSoar.

---

## 7. Protocollo di Test & Pre-Delivery Gates

1. **Unit Test Headless Core (`tests/core/logbookDb.test.mjs`)**:
   - Test su `createMemoryDbAdapter`: inserimento, recupero, cancellazione, KPI di carriera, deduplicazione deterministica tramite fingerprint.
   - 100% eseguibile in Node.js puro senza JSDOM né browser.
2. **Integration Test Ingestione IGC (`tests/core/logbookIgcPipeline.test.mjs`)**:
   - Parsing di un file IGC reale (`tests/fixtures/sample_flight.igc`).
   - Verifica di segregazione tra `flights_meta` e `flights_raw`.
   - Verifica del matching decollo/atterraggio con il catalogo dei comprensori.
3. **UI Controller Test (`tests/ui/logbookView.test.mjs`)**:
   - Montaggio e smontaggio controllori, visualizzazione KPI, card di volo, touch target $\ge 48\text{px}$ e accessibilità WAI-ARIA.
