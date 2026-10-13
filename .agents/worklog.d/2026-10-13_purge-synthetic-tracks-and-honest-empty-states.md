# ADR: Divieto Assoluto di Punti Traccia Fittizi, Auto-Purge Database e Gestione Trasparente Voli senza Registrazione GPS

**Data**: 2026-10-13  
**Stato**: Accettato e Implementato  
**Contesto**: `core/flightTrackReconstruction.js`, `core/parameteoImporter.js`, `core/logbookDb.js`, `ui/views/FlightDetailSheet.js`, `ui/views/FlightReplayView.js`, `ui/map/mapEngineAdapter.js`, `tests/`

---

## 1. Contesto e Mandato di Dominio
In seguito all'analisi del Volo #50 (`fl_excel_1787747985586_10`, Ciavanis -> PeterPan/Baratonga, 01/08/2026, 36 min), l'utente ha sollevato un principio insindacabile di veridicità del software:
> *"mi sembra che ti stia inventando i punti della traccia .. devi assolutamente vietarlo .. usa solo i punti veri"*

Nel dominio del volo libero e della sicurezza aeronautica, fabbricare coordinate geografiche o curve altimetriche simulate per mascherare l'assenza di dati GPS B-record reali viola il principio di integrità (`anti_sycophancy_integrity.md`). Se un volo è stato inserito tramite tabella Excel o importazione parziale priva di coordinate GPS secondo per secondo, il sistema deve valorizzare le metriche e statistiche reali verificate (quote di decollo/atterraggio/max, durata, termiche, note), ma dichiarare con assoluta trasparenza l'assenza della traccia registrata.

---

## 2. Decisioni Architetturali e Interventi Eseguiti

### 2.1 Eliminazione Radicale del Modulo di Ricostruzione Fittizia
- Rimosso permanentemente dal repository il file `core/flightTrackReconstruction.js` e la relativa suite `tests/core/flightTrackReconstruction.test.mjs` tramite `git rm -f`.
- Eliminato qualsiasi algoritmo di generazione di sinusoidi, spline o falsi file IGC.

### 2.2 Divieto di Generazione Punti all'Importazione (`core/parameteoImporter.js`)
- Rimosso il blocco di ricostruzione al volo. I voli privi di array di coordinate nel backup mantengono rigidamente:
  - `points: null`, `rawPoints: []`, `decimatedPoints: []`, `rawIgc: null`
  - `hasDecimatedTrack: false`, `isReconstructed: false`

### 2.3 Auto-Purge Attivo nel Database Locale (`core/logbookDb.js`)
- All'apertura del dettaglio volo in `getFlightDetail(flightId)`:
  - Se il volo caricato in precedenza su IndexedDB presenta `raw.isReconstructed === true` o array di punti sintetici residui, questi vengono attivamente cancellati (`decimatedPoints = []`, `originalPoints = []`, `rawIgc = null`, `isReconstructed = false`).
  - La bonifica viene salvata nel database locale in background, garantendo che i dispositivi degli utenti vengano ripuliti da punti artefatti.

### 2.4 Presentazione Trasparente e Veritiera (`ui/views/FlightDetailSheet.js`)
- Rimosso il generatore a 30 punti sinusoidali (`Math.sin(frac * Math.PI)`).
- **Profilo Altimetrico**: Se `!hasValidTrack`, visualizza un contenitore sobrio con messaggio:
  *"Tracciato altimetrico non disponibile (nessuna registrazione di coordinate GPS/IGC per questo volo)"*, preservando visibili e leggibili tutte le metriche reali (Quota Decollo, Quota Max, Quota Atterraggio, Durata, Dislivello).
- **Badge di Testata**: Mostra il badge sobrio `Traccia Non Registrata`.
- **Disabilitazione Controlli**:
  - Pulsante Replay 3D: `disabled aria-disabled="true" title="Replay 3D non disponibile: traccia GPS assente"`.
  - Pulsante Assetto: disabilitato.
  - Pulsante Download IGC: `disabled aria-disabled="true" title="Download IGC non disponibile: nessuna registrazione GPS"`.

### 2.5 Adattatore Cartografico Leaflet Mini-Mappa 2D (`ui/map/mapEngineAdapter.js`)
- In `renderFlightTrack`: se `validPoints.length === 0` ma sono presenti le coordinate di decollo e atterraggio nei metadati, vengono disegnati esclusivamente i pin ufficiali di Decollo ("D") e Atterraggio ("A") inquadrati nei confini, senza tracciare alcuna retta o polyline fittizia tra di essi.

### 2.6 Stato Vuoto e Navigazione con Puntamento nel Replay 3D (`ui/views/FlightReplayView.js`)
- Se l'utente accede direttamente all'URL `#replay?flightId=...` per un volo privo di punti:
  - La vista non va in crash né genera tracce simulate.
  - Visualizza una schermata di avviso dedicata a schermo intero: *"Traccia GPS Non Disponibile: Il volo non contiene una registrazione di coordinate GPS secondo per secondo. Il Replay 3D richiede una traccia reale IGC registrata da strumento o variometro"*.
  - Include un pulsante ad accessibilità touch ($\ge 48\text{px}$) *"Torna al Flight Log"* che reindirizza a `#logbook?focusFlightId=...`.
- Il router (`ui/router.js`) e `LogbookView.js` centrano automaticamente la card del volo nella lista con evidenziazione e animazione a pulsazione (`focusFlight`).

---

## 3. Risultati e Verifica
- **Suite di Test Completa**: 780 test passati su 132 suite (`npm test`), 0 falliti.
- **Shift-Left Quality Gates**: 100% conformità ai 5 Gate di architettura, ergonomia touch e anti-sycophancy.
