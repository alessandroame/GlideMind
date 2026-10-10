# Piano Architetturale: Vista Dettaglio Volo, Analisi Termiche & Debriefing Didattico

> **Fase**: Fase 6-ter  
> **Stato**: 🟡 In Lavorazione  
> **Target Repo**: `GlideMind`  
> **Moduli Coinvolti**: `core/logbookDb.js`, `core/flightTelemetry.js`, `core/flightManeuvers.js`, `ui/views/FlightDetailSheet.js`, `ui/views/LogbookView.js`, `ui/sheetManager.js`, `tests/core/logbookDb.test.mjs`, `tests/ui/flightDetailSheet.test.mjs`

---

## 1. Visione di Dominio & Obiettivi

Nella gestione dei voli in parapendio, la card sintetica del Logbook (Fase 6) offre una panoramica rapida a colpo d'occhio. Tuttavia, per analizzare la qualità della salita, la condotta in virata e le scelte di volo, il pilota necessita di un'analisi telemetrica approfondita senza dover necessariamente inizializzare il contesto WebGL 3D (Fase 7), che richiede risorse grafiche elevate ed è orientato alla visualizzazione spaziale continua.

La **Fase 6-ter** introduce una scheda di dettaglio e debriefing a schermo intero (`100dvh`), montata tramite `sheetManager` conformemente ai principi ergonomici outdoor di GlideMind (zero modali bloccanti, scorrimento verticale naturale, touch target $\ge 48\text{px}$).

### Obiettivi Primari
1. **Analisi Termiche Dettagliata**: Estrazione analitica di ciascuna termica agganciata (quota di ingresso e uscita, guadagno netto in metri, durata in spirale, rateo medio di salita ed efficienza termica).
2. **Deriva del Vento Termico**: Calcolo e visualizzazione del vettore di deriva stimato durante il centramento termico (`dominantWindDrift`), utile per riscontrare la direzione e l'intensità della brezza in quota.
3. **Analisi Manovre & Cinematica di Virata**: Identificazione didattica delle manovre (`core/flightManeuvers.js`: 360° orari e antiorari, spirali, wingover, virate di raccordo) con timestamp e quota.
4. **Note Personali del Pilota**: Sezione per l'inserimento e l'aggiornamento persistente delle annotazioni personali di volo (salvate in `flights_meta` su IndexedDB).
5. **Debriefing Didattico con Guido (AI)**: Integrazione con `ai-briefing-gemini` per la generazione on-demand di un debriefing didattico di sicurezza, orientato alle specificità della vela in uso e conforme ai criteri di `novice-pilot-auditor`.
6. **Hub di Azioni**: Punto di lancio diretto verso il Replay 3D della traiettoria (Fase 7) e download del tracciato IGC autentico con firma FAI.

---

## 2. Architettura dei Dati & Persistenza (`core/logbookDb.js`)

### 2.1. Aggiornamento Schema & Metodi
- **`saveFlightNotes(flightId, notes)`**:
  - Aggiorna il campo `notes` nel record `flights_meta`.
  - Aggiorna il timestamp `updatedAt`.
  - Emette la lista aggiornata dei metadati nello store reattivo (`store.setState({ flights })`).
- **`saveFlightCustomMeta(flightId, patch)`**:
  - Consente l'aggiornamento opzionale di metadati (es. modello vela, note, decollo/atterraggio manuale).
- **Inclusione Telemetria in `flights_raw`**:
  - Durante `importIgcTrack()`, il payload completo `telemetry` (generato da `analyzeFlightTelemetry()`) viene memorizzato in `flights_raw.telemetry`.
  - Se in record pre-esistenti `raw.telemetry` risulta nullo, il modulo ricalcola deterministicamente l'analisi dai `decimatedPoints` o dai punti grezzi senza alcuna perdita di dati.

---

## 3. Componente UI: `ui/views/FlightDetailSheet.js`

Il componente è implementato come modulo disaccoppiato che esporta `openFlightDetailSheet(flightId, options)` e `renderFlightDetailHtml(flightBundle)`.

### 3.1. Struttura dei Contenuti
1. **Header Volo**:
   - Titolo: Binomio decollo $\to$ atterraggio abbinato al comprensorio territoriale.
   - Sottotitolo: Data formattata, orario decollo/atterraggio, durata effettiva, badge vela normalizzato (`.en-a`, `.en-b`, etc.).
2. **Grafico Profilo Altimetrico & Barra Fasi di Volo**:
   - Polilinea SVG dinamica responsive (`viewBox="0 0 500 140"`) con scala altimetrica min/max e marker delle quote chiave.
   - Barra a segmenti colorati orizzontale indicante le fasi di volo (Decollo, Termica, Veleggiamento, Planata, Discesa, Atterraggio) via `generateFlightPhaseGradient()`.
3. **Riepilogo Cinematica & Deriva del Vento**:
   - 4 card metriche: Quota Max MSL, Dislivello Positivo Totale (con distinzione tra quota termica e dinamica di pendio), Salita Massima, Discesa Massima.
   - Card Vento di Deriva Stimato: Direzione cardinale + gradi e velocità stimata durante il termicamento.
4. **Analisi Tabellare Termiche**:
   - Lista delle singole termiche ordinate cronologicamente:
     - Indice e orario di aggancio.
     - Quota ingresso $\to$ Quota uscita.
     - Guadagno netto ($+\Delta h$ m) e durata.
     - Rateo medio di salita ($V_z$ m/s).
5. **Manovre ed Esercizi**:
   - Riconoscimento manovre (360° orario/antiorario, spirali, virate continue).
   - Valutazione della fluidità di virata e debriefing formativo per piloti ricreativi.
6. **Note Personali**:
   - Form compatto per l'inserimento e il salvataggio immediato delle note di volo nel database locale.
7. **Debriefing Didattico di Sicurezza (Guido AI)**:
   - Sintesi didattica generata on-demand con evidenziazione di margini di sicurezza e lezioni apprese.
8. **Barra Azioni**:
   - `Visualizza Replay 3D`: imposta `activeReplayFlightId` e attiva la navigazione al Replay 3D.
   - `Scarica IGC Originale`: esportazione con firma FAI.

---

## 4. Ergonomia Outdoor & Shift-Left Pre-Flight Gates

- **Gate 1**: Touch target $\ge 48\times 48\text{px}$, colori WCAG AA compatibili con tema chiaro/scuro, zero modali annidate.
- **Gate 2**: Disaccoppiamento logico, assenza di riferimenti a `document` o `window` in `core/logbookDb.js`, conformità all'inglese nel codice sorgente.
- **Gate 3**: Suite automatizzata completa con test unitari e test di montaggio UI.
- **Gate 4**: Viewport responsive mobile ($360\text{px} - 390\text{px}$), assenza di overflow orizzontale, scroll nativo a riga singola.
- **Gate 5**: Sobrietà terminologica e assenza di emoji decorative.
