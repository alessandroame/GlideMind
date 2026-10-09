# Scheda ADR: Bonifica Architetturale Piani Futuri (Backup/Auto-Sync, Fallback Cesium, Rimozione Totale Syllabus Peter Pan)

- **Data**: 2026-10-09
- **Autore**: Alessandro Amè & Pair Programmer
- **Fasi Coinvolte**: Fase 5 (Spot Map), Fase 6 (Logbook), Fase 6-bis (Backup & Auto-Sync), Fase 7 (Replay 3D)
- **Stato**: Approvato e Sincronizzato nei Documenti di Governance

---

## 1. Contesto & Motivazione

A seguito dell'audit completo sui lavori pianificati, sono emerse quattro aree di rischio strutturale e debito tecnico:
1. **Omissione del Backup, Auto-Sync & Restore**: Assenza a piano di un modulo critico per la salvaguardia dei dati del pilota contro la storage eviction dei browser mobili.
2. **Fragilità del Motore 3D (MapLibre vs Cesium)**: Le pregresse complessità di sincronizzazione matriciale WebGL e frustum clipping su MapLibre rischiavano di bloccare la Fase 7 in un vicolo cieco.
3. **Complessità Superflua e Scope Creep (Syllabus Peter Pan)**: Inclusione di una matrice addestrativa specialistica di singola scuola che appesantiva lo scope del Logbook e introduceva dipendenze non necessarie.
4. **Rischio Rate Limiting su Mappa (Bounding Box Batch)**: Rischio HTTP 429 su Open-Meteo per query continue su pan/zoom.

---

## 2. Decisioni Architetturali (ADR)

1. **Rimozione Totale del Syllabus Peter Pan**:
   - Eliminato completamente ogni riferimento e requisito legato al Syllabus Peter Pan dallo scope di GlideMind.
   - Il Logbook si concentra esclusivamente sulle funzioni cardine: upload e parsing traccia IGC, card di volo, calcolo currency pilota, rilevamento termiche/manovre e KPI di carriera (ore totali, voli, quota max, durata).

2. **Modulo Indipendente: Backup, Auto-Sync & Restore Engine (`core/backupManager.js`)**:
   - **Full Snapshot**: Export/Import dell'intero stato (LocalStorage config/gliders/spots + IndexedDB voli/tracce) in un singolo file JSON, con supporto per *Overwrite* o *Smart Merge*.
   - **Dedicated Logbook Backup**: Export/Import modulare e separato del solo archivio voli (`flights_meta` + `flights_raw`), garantendo la portabilità indipendente del libretto di volo.
   - **Auto-Sync & Dirty Tracking**: Rilevamento in RAM delle modifiche pendenti non salvate (`syncDirtyTracker`) con notifica non invasiva (>14gg o >=3 nuovi voli non esportati) e predisposizione architetturale per adapter cloud.

3. **Architettura 3D Replay ad Adapter Unificato (`IReplay3dEngine`)**:
   - Disaccoppiamento totale tra controller UI, controlli playback, camera mode e Canvas 2D per il profilo/variometro a 60 FPS (indipendente dal rendering 3D).
   - **Engine Primario**: MapLibre GL 3D + Three.js CustomLayer (conforme a `geodesy_webgl_3d_spec.md`).
   - **Engine di Fallback Provato**: CesiumJS (con coordinate cartesiane WGS84 native, come consolidato nei test storici ParaMeteo). Switch a costo zero di riscrittura in caso di problemi sul primario.

4. **Storage a Due Livelli per il Logbook (`core/logbookDb.js`)**:
   - Separazione tra `flights_meta` (record leggero per consultazione istantanea e calcolo currency) e `flights_raw` (blob IGC e campionamenti GPS 1Hz caricati solo on-demand per il Replay 3D).

5. **Mappa con Batch Statico e Headless Map Adapter**:
   - Ingestione meteo circoscritta all'elenco statico di `locations.json` con cache LRU in memoria (TTL 30 min). Zero query di rete su pan e zoom.
   - Controller cartografico isolato per consentire il testing in Node.js puro senza dipendenze da `window` o `document`.

---

## 3. Impatti sui File di Progetto
- `MASTER_PLAN.md`: Fasi 5, 6, 6-bis, 7 e 8 bonificate con i nuovi vincoli.
- `DESIDERATA.md`: Matrice aggiornata con la nuova voce di Backup & Auto-Sync e specifiche affinate.
- `MEMORY.md`: Aggiunte le lezioni apprese 21, 22, 23 e 24.
