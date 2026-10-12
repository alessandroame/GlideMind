# Worklog: Ingestione FAI IGC da Backup ParaMeteo (_rawIgcText), Auto-Healing e Trasparenza Replay 3D

**Data**: 2026-10-12  
**Autore**: GlideMind Agent  
**Ambito**: `core/parameteoImporter.js`, `core/logbookDb.js`, `ui/views/FlightDetailSheet.js`, `ui/views/FlightReplayView.js`, `tests/core/parameteoImporter.test.mjs`

---

## 1. Contesto e Problema Riscontrato
L'utente ha segnalato due anomalie critiche dopo aver importato il backup recente di ParaMeteo (`parameteo_backup_2026-10-12_1811.json`):
1. **Replay 3D con Traccia Fittizia**: Cliccando su "Anteprima 3D" di un volo reale (es. *Decollo Ciavanis -> Baratonga*), veniva visualizzata una traiettoria inventata (volo simulato a Monte Cornizzolo).
2. **Scheda Dettaglio Volo Invariata**: Nessun tracciato altimetrico visibile ("Tracciato altimetrico non disponibile"), barra delle fasi piatta e assenza dello strumento di trimming.

## 2. Diagnosi e Root Cause Analysis
- **Ispezione Empirica del Backup**:
  Nel backup JSON V2 esportato da ParaMeteo, 10 voli contenevano il tracciato FAI IGC completo e autentico serializzato all'interno della proprietà speciale `flight._rawIgcText` (fino a 35 KB di testo ASCII con B-record GNSS), mentre l'array `flight.trackPoints` risultava indefinito e la tabella `database.flightTracks` non conteneva record.
- **Punto Cieco di Ingestione**:
  In `core/parameteoImporter.js`, `parseParaMeteoBackup` e `convertParaMeteoFlight` cercavano esclusivamente array di punti (`trackPoints`, `track`), ignorando la proprietà `_rawIgcText`. Di conseguenza:
  - `rawPoints` e `points` venivano valutati a `null`.
  - La sparkline altimetrica e la traccia decimata risultavano vuote (`decimatedPoints = []`).
  - `FlightDetailSheet.js` ometteva la sezione `#gm-flight-trimming-section` per via della guardia `sourcePoints.length >= 10`.
  - `FlightReplayView.js`, rilevando `rawPoints.length === 0`, attivava il generatore di traiettoria sintetica di fallback (`_generateFallbackTrackPoints`), posizionando il volo a Monte Cornizzolo.

## 3. Interventi Applicati

### A. Ingestione Avanzata e Parsing On-The-Fly (`core/parameteoImporter.js`)
- Implementata funzione helper `extractEmbeddedTrack(flight)` che riconosce ricorsivamente `_rawIgcText`, `rawIgcText`, `rawIgc`, `igc`, `points` e `decimatedPoints`.
- In `convertParaMeteoFlight`:
  - Se i punti strutturati mancano ma è presente il testo grezzo IGC, viene invocato `parseIgc(rawIgc, catalog)` on-the-fly.
  - Vengono estratti i punti GPS completi, calcolate le quote MSL (`takeoffAltMsl`, `landingAltMsl`, `maxAltMsl`), il dislivello, la distanza orizzontale, la sparkline SVG e la segmentazione telemetrica (termiche e manovre).
  - Memorizzato `rawIgc` nel record persistente `rawRecord.rawIgc`.
- Nella funzione di merge batch `importParaMeteoData`:
  - Aggiunta condizione `addsTrack = !existingHasTrack && incomingHasTrack`: se il volo esistente nel database non ha traccia e quello in arrivo ne è provvisto, il record viene aggiornato e arricchito automaticamente anche con data identica.

### B. Auto-Healing On-The-Fly nel Logbook (`core/logbookDb.js`)
- In `LogbookManager.getFlightDetail(flightId)`: se `raw.decimatedPoints` è vuoto ma è presente `rawIgc` nello storage, viene eseguito il parsing immediato on-demand, riparando il record e salvandolo in background nell'adapter.

### C. Trasparenza e Feedback nel Replay 3D (`ui/views/FlightReplayView.js`)
- Tracciamento della provenienza dei punti con flag booleana `isSimulated: true/false`.
- Aggiunto indicatore visivo semantico `Traccia Simulata` nel sottotitolo della testata 3D quando la traccia visualizzata è un fallback sintetico, eliminando ogni ambiguità per il pilota.

## 4. Verifica e Collaudo
- Testato con successo il file di backup reale `parameteo_backup_2026-10-12_1811.json`:
  - Rilevate ed estratte correttamente tutte le 10 tracce IGC embedded.
  - Volo target `fl_igc_1791731184254_gkpl3z2_36225` ("Decollo Ciavanis"): 660 fix GPS estratti, decollo 1775m, atterraggio 867m, distanza 5.9 km, profilo SVG generato.
- Suite di test automatizzata: 115 suite, 661 test passati su 661 (100% pass rate).
