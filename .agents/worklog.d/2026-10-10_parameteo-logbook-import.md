# Scheda Intervento: Ingestione e Importazione Logbook da Export ParaMeteo

- **Data**: 2026-10-10
- **Ambito**: Core Headless / Logbook / UI Presentation Layer
- **Contesto**: Richiesta utente di importare i log di volo e le tracce GPS da esportazioni e backup generati dall'applicazione ParaMeteo ("vorrei poter importare i log di volo dall'export di parameteo").

---

## 1. Diagnosi e Analisi dei Formati ParaMeteo

Dall'ispezione della base di codice di ParaMeteo (`js/backupManager.js` e `js/logbookDb.js`) sono emersi tre formati canonici di esportazione:
1. **V2 Full Backup Package (`parameteo_backup_*.json`)**:
   - Oggetto contenitore con `app: 'ParaMeteo'`, `version: 2`, `database: { flights: [...], flightTracks: [...] }`.
   - Le tracce GPS complete risiedono nello store `flightTracks` indicizzato per `flightId` oppure come array incorporati dentro ciascun volo (`flight.trackPoints` o `flight.track`).
2. **V1 Logbook JSON Export (`parameteo_logbook_*.json`)**:
   - Oggetto radice con `version: 1` e array `flights` con tracce incorporate.
3. **Bare Flights Array (`[ { id, date, ... }, ... ]`)**:
   - Formato grezzo per migrazioni dirette o dump puntuali.

Nel formato ParaMeteo, le attrezzature possono essere memorizzate sia come stringa semplice (`glider`) sia come oggetto (`gear: { glider: '...' }`), con durate espresse in minuti o secondi e timestamp di aggiornamento ISO (`updatedAt`).

---

## 2. Decisioni Architetturali & Implementazione

### A. Modulo Headless Indipendente: `core/parameteoImporter.js`
- **Isolamento Gate 1**: Modulo 100% headless senza riferimenti a `window`, `document` o oggetti DOM.
- **`parseParaMeteoBackup(jsonContent)`**:
  - Validazione deterministica e riconoscimento polimorfico dei tre formati.
  - Filtro automatico dei record cancellati logicamente (`isDeleted: true`).
  - Mappatura consolidata `tracksMap` (`flightId -> { trackPoints, telemetry }`).
- **`convertParaMeteoFlight(flight, trackData, options)`**:
  - Mappatura bidirezionale verso la persistenza a due livelli di GlideMind:
    - `flights_meta`: ID univoco, date, orari, durata normalizzata, sito (`site`, `siteName`, `takeoffLocationName`, `landingLocationName`), pilota, vela e classe certificata (`deduceGliderClass`), 6 KPI di cinematica, sparkline SVG a 60 campioni e note personali del pilota.
    - `flights_raw`: Traccia decimata a 1.500 campioni LTTB (`lttbDecimate`), telemetria analitica (termiche, derive vento in quota, manovre) e metadati di frequenza.
- **`importParaMeteoData(jsonContent, logbookManager, options)`**:
  - Strategia **Smart Merge** (default): verifica di idempotenza Last-Write-Wins. Il record viene aggiornato se e solo se `incomingUpdated > existingUpdated` oppure se l'export fornisce una traccia GPS assente nel database locale (`!existingHasTrack && incomingHasTrack`). I record identici vengono scartati con conteggio trasparente (`skippedFlightsCount`).
  - Strategia **Overwrite**: sovrascrittura incondizionata su richiesta esplicita.
  - Sincronizzazione atomica con lo store reattivo SSOT (`store.setState({ flights: allMetas })`).

### B. Integrazione nel Singleton `core/logbookDb.js`
- Aggiunto metodo `logbookManager.importParaMeteoBackup(jsonContent, options)` con import dinamico asincrono per prevenire dipendenze circolari e mantenere il file al di sotto della soglia vincolante di 1.000 righe (994 righe).
- Re-export convenienza delle funzioni dell'importer.

### C. Integrazione Interfaccia Utente (`ui/views/LogbookView.js` & `css/theme.css`)
- **Dropzone & File Input**: Esteso `accept=".igc,.json,application/json"` per permettere la selezione unificata di file IGC e JSON di backup.
- **Pipeline di Ingestione**: In `processUploadedFiles()`, rilevamento automatico del formato (IGC vs JSON), barra di avanzamento e notifica con banner informativo (`.gm-import-summary-banner`) con conteggio voli e tracce GPS importate.

---

## 3. Validazione e Qualità Shift-Left

- **Suite di Test Dedicata**: Creata suite `tests/core/parameteoImporter.test.mjs` con 16 test unitari e di integrazione (validazione schemi, conversioni, deduzione classi vele, merge Last-Write-Wins, overwrite e sincronizzazione store).
- **Test UI LogbookView**: Aggiornata la suite `tests/ui/logbookView.test.mjs` con test dell'upload di backup ParaMeteo e della gestione del banner.
- **Verifica Globale**: `npm test` ha superato con successo 526 test su 526 in 84 suite con 0 errori.
