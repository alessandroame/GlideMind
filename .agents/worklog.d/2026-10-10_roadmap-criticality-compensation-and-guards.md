# Worklog: Compensazione Criticità Roadmap & Integrazione Guardie nei Piani di Lavoro

- **Data**: 2026-10-10
- **Tipo**: Governance / Architecture Planning / Critical Scrutiny / Pre-Flight Guards
- **Autore**: Alessandro Amè & Pair Programmer
- **Stato**: Consolidato

---

## 1. Contesto & Motivazione

A seguito dell'audit completo sui piani di lavoro successivi, sono state identificate 5 criticità tecniche ad alto impatto per le Fasi 6, 6-bis, 7 e 8:
1. **Rischio di Storage Eviction su Browser Mobile (IndexedDB)**: cancellazione automatica dei voli da parte di WebKit ITP (iOS Safari) dopo 7 giorni di inattività o su Android in saturazione storage.
2. **Blocco del Thread UI & Rischio OOM su Tracciati IGC Grandi**: file con oltre 20.000 record B che causano freeze della UI (>400ms) o crash della memoria heap.
3. **Perdita di Contesto WebGL & Dipendenza da DEM Remoti nel Replay 3D**: `webglcontextlost` su mobile e assenza di connettività cellulare sui decolli per il download delle tile raster DEM Terrarium.
4. **Saturazione Quota Storage da Tile Cartografiche Raster**: `QuotaExceededError` scatenato da un caching indiscriminato nel Service Worker che blocca le scritture su IndexedDB.
5. **Rischio di Regressione sui 447 Test Headless**: accoppiamento a `window.indexedDB` che rompe l'esecuzione in Node.js puro (`node --test`).

---

## 2. Interventi Applicati

1. **Piano Architetturale di Dettaglio per la Fase 6**:
   - Creato [docs/plans/phase-6-flight-logbook-and-telemetry.md](file:///docs/plans/phase-6-flight-logbook-and-telemetry.md) con specifiche formali per l'Injectable Storage Adapter Pattern (`createMemoryDbAdapter` vs `createIndexedDbAdapter`), lo schema a due livelli (`flights_meta` vs `flights_raw`), il fingerprinting immutabile anti-duplicati, il parsing chunkato asincrono a 2.000 righe e la pre-decimazione LTTB prima del calcolo termiche.
2. **Aggiornamento di MASTER_PLAN.md**:
   - Integrate le guardie formali per la Fase 6, la proattività anti-eviction in Fase 6-bis (`syncDirtyTracker`), il ciclo di vita WebGL e la degradazione offline cartesiana in Fase 7, e la politica `Network-Only` per tile cartografiche esterne in Fase 8.
3. **Allineamento della Matrice DESIDERATA.md**:
   - Aggiornate le descrizioni operative delle Fasi 6, 6-bis, 7 e 8 con le specifiche misure di mitigazione tecnica.
4. **Registrazione dei Vincoli Stabili in MEMORY.md**:
   - Formalizzate le nuove Lezioni Apprese e Pattern Vincolanti:
     - Lezione #87: Salvaguardia da Storage Eviction Mobile & PWA Prompt (IndexedDB Defense).
     - Lezione #88: Prevenzione Thread-Lock & OOM nel Parsing di Tracce IGC Grandi (Chunking & Decimazione Preventiva).
     - Lezione #89: Injectable Storage Adapter Pattern per Database Headless (Node.js Test Isolation).
     - Lezione #90: Gestione WebGL Context Loss & Degradazione Spaziale Vettoriale Offline (Replay 3D Resiliente).
     - Lezione #91: Politica Network-Only Categorica nel Service Worker per Tile Cartografiche (Anti-QuotaExceededError).

---

## 3. Verifica & Integrità

- Eseguita la suite di test completa tramite `npm test`: **447/447 test passanti** con successo in **~4.1 secondi**.
- Zero regressioni architetturali o di layout.
