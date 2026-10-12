# Aggiunta Record Personali: Termiche Max, Max Vario e Min Vario

## Contesto & Motivazione
L'utente ha richiesto di estendere il pannello dei record personali ("Migliori Prestazioni Personali") e la visualizzazione del dettaglio volo con:
1. Numero massimo di termiche agganciate in un singolo volo (`Termiche Max`).
2. Massimo rateo di salita variometrico (`Max Vario`, $+X.X\text{ m/s}$).
3. Minimo rateo variometrico / massimo sprofondamento (`Min Vario`, $-X.X\text{ m/s}$).

## Decisioni Architetturali & Modifiche

### 1. Headless Domain Core (`core/logbook.js`)
- Aggiornato `calculatePersonalRecords(flights)`:
  - `maxThermals`: calcola il massimo numero di termiche dedotto da `thermalsCount` o dall'array `telemetry.thermals`.
  - `maxClimbRate` (con alias `maxVario`): calcola il picco positivo di salita (`f.maxClimbRate || f.maxClimb || f.maxVario`).
  - `maxSinkRate` (con alias `minVario`): calcola il picco di sprofondamento / discesa come valore negativo con segno (`sinkVal = -Math.abs(rawSink)`), confrontando `sinkVal < records.maxSinkRate.val`.
- Aggiornato `checkFlightRecordFlags(flightMeta, careerRecords)`:
  - Aggiunti i flag `isMaxThermals`, `isMaxClimbRate` (`isMaxVario`), `isMaxSinkRate` (`isMinVario`).
  - Aggiornato `hasAnyRecord` includendo i nuovi flag.
- Test unitari aggiornati in `tests/core/logbook.test.mjs` (17/17 passanti).

### 2. UI Statistiche Pilota (`ui/views/LogbookStatsView.js`)
- Nella sezione "Migliori Prestazioni Personali", aggiunte 3 nuove card responsive:
  - **Termiche Max**: mostra il numero di termiche e il badge volo `#N`.
  - **Max Vario**: mostra $+X.X\text{ m/s}$ e il badge volo `#N`.
  - **Min Vario**: mostra $-X.X\text{ m/s}$ e il badge volo `#N`.
- Tutte le card sono provviste di classe `.gm-stats-record-clickable`, attributo `data-action="open-flight-detail"`, `data-flight-id`, `role="button"`, `tabindex="0"` e `aria-label` accessibile.
- Test UI aggiornati in `tests/ui/logbookStatsView.test.mjs` (6/6 passanti).

### 3. Dettaglio Volo (`ui/views/FlightDetailSheet.js`)
- Nella griglia telemetrica cinematica:
  - Card "Termiche Agganciate": applicata la classe `.gm-flight-metric-card-record` e il badge `<span class="gm-record-badge">Record</span>` quando `recordFlags.isMaxThermals` è vero.
  - Card "Salita Massima (Vario)": applicata la classe `.gm-flight-metric-card-record` e il badge `<span class="gm-record-badge">Record</span>` quando `recordFlags.isMaxClimbRate` è vero.
  - Card "Discesa Massima": applicata la classe `.gm-flight-metric-card-record` e il badge `<span class="gm-record-badge">Record</span>` quando `recordFlags.isMaxSinkRate` è vero.
- Test UI aggiornati in `tests/ui/flightDetailSheet.test.mjs` (29/29 passanti).

## Punti di Verifica & Risultati
- `npm test`: 699 test eseguiti (122 suite), 698 passati, 0 falliti, 1 skipped.
- Shift-Left Quality Gate superato al 100%.
