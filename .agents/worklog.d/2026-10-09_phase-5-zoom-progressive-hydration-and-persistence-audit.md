# Scheda ADR: Idratazione Progressiva Mappa per Livello di Zoom e Salvaguardie di Persistenza

- **Data**: 2026-10-09
- **Autore**: Alessandro Amè & Pair Programmer
- **Fasi Coinvolte**: Fase 5 (Spot Map), Fase 6 (Logbook), Fase 6-bis (Backup & Auto-Sync), Fase 7 (Replay 3D), Fase 8 (PWA)
- **Stato**: Approvato e Integrato nei Documenti di Governance

---

## 1. Contesto & Diagnosi

A seguito dell'audit completo sui lavori pianificati, sono stati affrontati e formalizzati i seguenti aspetti critici:

1. **Gestione del Limite Batch Open-Meteo per Livello di Zoom (Fase 5)**:
   - Richiedere 134 comprensori in un unico batch genera URL > 4.000 caratteri (HTTP 414) e 5-8 MB di payload JSON.
   - Richiedere le coordinate per ogni evento di mappa (`moveend`, `zoomend`) causa un consumo eccessivo di quote API (HTTP 429).
   - È stata definita l'architettura a **Due Livelli di Zoom con Idratazione Progressiva**:
     - *Macro (Zoom 5 - 8.9)*: Batch circoscritto alla sola macro-regione focale (Nord-Ovest, Nord-Est, Centro, Sud/Isole, max 25-30 spot, payload < 500 KB, URL < 800 caratteri). Aureole semitrasparenti di bacino a 4 colori.
     - *Micro (Zoom >= 9)*: Zero chiamate di rete. Riuso immediato dei dati orari in RAM per renderizzare il decollo $T_{\text{best}}$ con cono azimutale, freccia del vento reale a quota decollo, atterraggio sicuro $L_{\text{safe}}$ e cono di planata aerodinamica $E_{\text{richiesta}} \le E_{\text{glider}}$.
     - Cache entity-centric per `spotId` (TTL 30 min) con calcolo a differenza insiemistica dei soli spot mancanti.

2. **Salvaguardia Anti-Eviction Mobile IndexedDB (Fase 6)**:
   - Prevenzione della cancellazione silenziosa dopo 7 giorni su iOS Safari e Android tramite invocazione automatica di `navigator.storage.persist()`.
   - Parsing chunkato asincrono dei tracciati IGC di grandi dimensioni (>30k punti) per garantire conformità alla Doherty Threshold (< 400ms).
   - Deduplicazione deterministica dei voli tramite fingerprint immutabile per impedire duplicati su re-importazioni.

3. **Integrità Backup & Merge Last-Write-Wins (Fase 6-bis)**:
   - Aggiunta del campo `updatedAt` (ISO UTC) nello schema `flights_meta` per consentire risoluzione automatica e deterministica dei conflitti in caso di ripristino non distruttivo (Smart Merge).
   - Download sicuro di blob pesanti (>30 MB) con `URL.createObjectURL` e revoca immediata per prevenire leak di memoria.

4. **Isolamento Telemetria 2D & Degradazione Spaziale Offline (Fase 7)**:
   - HUD e strip altimetrica/variometrica renderizzati a 60 FPS su Canvas 2D disaccoppiato da WebGL.
   - Degradazione a traiettoria spaziale 3D in caso di indisponibilità delle tile DEM o di mancata connettività.

5. **Isolamento Cache Service Worker (Fase 8)**:
   - Esclusione delle tile cartografiche esterne dalla cache locale (`Network-Only` pass-through) per scongiurare categoricamente errori `QuotaExceededError`.

6. **Risoluzione Anomalia Test Classificazione 14 Giorni**:
   - Rettificata la fixture in `tests/core/flyability.test.mjs` che sovrapponeva pioggia a una condizione di severità 2, ripristinando il 100% dei test passanti (241/241).

---

## 2. Decisioni Architetturali (ADR)
- **ADR-018**: Idratazione progressiva a due livelli di zoom e cache entity-centric per la mappa comprensori.
- **ADR-019**: Richiesta persistenza garantita del filesystem client-side via `navigator.storage.persist()`.
- **ADR-020**: Deduplicazione idempotente tramite fingerprinting dei voli e timestamp `updatedAt` per smart merge.

---

## 3. Documenti Aggiornati
- `MASTER_PLAN.md`: Fasi 5, 6, 6-bis, 7 e 8 arricchite con i dettagli architetturali vincolanti.
- `DESIDERATA.md`: Matrice allineata con specifiche dettagliate per Fasi 5-8.
- `MEMORY.md`: Aggiunte le Lezioni Apprese 26 e 27.
