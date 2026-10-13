# ADR: Ricostruzione Deterministica della Traccia e Auto-Heal Telemetrico per Voli da Backup

**Data**: 2026-10-13  
**Stato**: Accettato e Implementato  
**Contesto**: `core/flightTrackReconstruction.js`, `core/parameteoImporter.js`, `core/logbookDb.js`, `ui/views/FlightDetailSheet.js`, `css/theme.css`

---

## 1. Contesto e Problema Riscontrato
Il Volo #50 (`fl_excel_1787747985586_10`, Ciavanis -> PeterPan/Baratonga, 01/08/2026, 36 min, Axis Pluto 4) presentava tutte le statistiche di sintesi (quota max 2037m, quota decollo 1777m, quota atterraggio 912m, vario max +2.4 m/s, 3 termiche con raggi e giri, 649 segmenti di fase), ma:
- La "MAPPA 2D TRACCIA" si presentava come un riquadro nero completamente vuoto.
- Il "PROFILO ALTIMETRICO" mostrava il messaggio di fallback *"Tracciato altimetrico non disponibile"*.
- I controlli di zoom, scrubber altimetrico, Replay 3D e download IGC non erano fruibili.

Dall'analisi del file di backup (`parameteo_backup_2026-10-13_1123.json`) è emerso che 39 voli con `hasTrack: true` non avevano l'array di punti GPS grezzi all'interno di `database.flightTracks`, ma contenevano comunque coordinate geodetiche e telemetria dettagliata. All'importazione, `parameteoImporter.js` impostava `decimatedPoints = []` e `rawIgc = null`. Inoltre, in `FlightDetailSheet.js`, un `return` anticipato alla riga `if (!Array.isArray(points) || points.length < 2) return;` abortiva l'inizializzazione del motore cartografico Leaflet, lasciando il canvas disconnesso.

---

## 2. Decisioni Architetturali e Modifiche Implementate

### 2.1 Motore Headless di Ricostruzione Traccia (`core/flightTrackReconstruction.js`)
- Creato un modulo puro in Node.js (zero dipendenze DOM) che sintetizza un tracciato 3D continuo e ad alta fedeltà a partire da:
  - Coordinate e quote di decollo e atterraggio.
  - Statistiche estreme di quota (min, max) e variometro (+max climb, -max sink).
  - Centri geodetici, quote, raggi e numero di giri delle termiche rilevate.
  - Punti geodetici del massimo variometro e della massima quota.
  - Timeline delle fasi di volo (veleggiamento, planata, salita in termica).
- Implementata la funzione `generateIgcFromPoints` che produce un file di testo IGC standard conforme FAI con B-record temporizzati e coordinate DMMmmm.
- Implementata la funzione `formatIgcCoord` per la conversione da gradi decimali a formato IGC.

### 2.2 Ricostruzione all'Importazione (`core/parameteoImporter.js`)
- In `convertParaMeteoFlight`: quando `rawPoints` e `rawIgc` sono assenti ma il volo ha coordinate o telemetria, invoca `reconstructTrackFromFlightMetadata`.
- Popola `decimatedPoints`, `originalPoints`, `rawIgc`, `sparklineSvgPoints`, `takeoffLat/Lon`, `landingLat/Lon` e imposta il flag `isReconstructed: true` sia in `meta` che in `raw`.

### 2.3 Auto-Heal Dinamico nel Database Locale (`core/logbookDb.js`)
- In `LogbookManager.prototype.getFlightDetail`: se un volo già presente in IndexedDB non dispone di `decimatedPoints` ed è privo di tracciato IGC, la traccia viene ricostruita al volo in memoria a partire dai metadati/telemetria esistenti, aggiornando il bundle e salvandolo in background nel database. In questo modo l'utente visualizza immediatamente la traccia anche per i voli già caricati in precedenza, senza dover re-importare il file di backup.

### 2.4 Inizializzazione Difensiva e Badge UI (`ui/views/FlightDetailSheet.js` & `css/theme.css`)
- Rimosso l'abort anticipato in `attachInteractiveFlightChart`: la mappa 2D viene sempre inizializzata e mostra i marker di decollo e atterraggio anche in assenza di punti intermedi.
- Resi attivi i pulsanti di cambio layer e Replay 3D.
- Aggiunto il badge di trasparenza semantica `<span class="gm-status-pill gm-status-pill-sky">Telemetria Ricostruita</span>` nel riquadro di testata del volo quando `meta.isReconstructed === true`.
- Definito il token visuale `.gm-status-pill-sky` in `css/theme.css` per temi scuro e chiaro conforme a WCAG 2.1 AA.

---

## 3. Impatto e Verifica
- **Test Unitari Ricostruzione**: 4/4 test passati in `tests/core/flightTrackReconstruction.test.mjs`.
- **Test Unitari Importer & Auto-Heal**: 21/21 test passati in `tests/core/parameteoImporter.test.mjs`.
- **Test Unitari Scheda Dettaglio**: 36/36 test passati in `tests/ui/flightDetailSheet.test.mjs`.
- **Test Suite Globale**: 764/764 test passati su 131 suite in Node.js nativo (`npm test`), 0 falliti.
- **Shift-Left Quality Gates**: Tutti i 5 Gate superati al 100%.
