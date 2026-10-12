# Integrazione Numero di Volo nei Record Personali, Navigazione al Dettaglio ed Evidenziazione Metriche Record

## Contesto & Motivazione
Nelle statistiche di carriera del Flight Log ("Migliori Prestazioni Personali"), l'utente ha richiesto:
1. Mostrare a vista il numero progressivo del volo (`#N`) per ciascuna delle prestazioni record (Quota Max MSL, Maggior Guadagno, Volo Più Lungo, Distanza Massima).
2. Rendere le card dei record interattive: cliccando o toccando una card, si apre direttamente il dettaglio del volo corrispondente (`FlightDetailSheet`).
3. Nella vista di dettaglio del volo, indicare visivamente in modo inequivocabile se uno o più parametri costituiscono un record personale di carriera (badge "Record" e pill "Record Personale").

## Decisioni Architetturali & Modifiche

### 1. Headless Domain Core (`core/logbook.js`)
- Implementato `calculatePersonalRecords(flights)` per estrarre in modo deterministico i record di carriera (`maxAlt`, `maxGain`, `maxDuration`, `maxDistance`, `maxClimbRate`), associando ciascun record a `flightId`, `flightNumber` (risolvendo il numero esplicito o l'indice cronologico inverso `flights.length - index`), `site` e `date`.
- Implementato `checkFlightRecordFlags(flightMeta, careerRecords)` per confrontare le metriche del volo attivo con i record aggregati di carriera, restituendo `{ isMaxAlt, isMaxGain, isMaxDuration, isMaxDistance, isMaxClimbRate, hasAnyRecord }`.
- Suite unitaria completa in `tests/core/logbook.test.mjs` (17 test al 100% passanti).

### 2. UI Statistiche Pilota (`ui/views/LogbookStatsView.js`)
- Importata la funzione `calculatePersonalRecords` dal core.
- Tutte le 4 card dei record visualizzano un badge visibile a colpo d'occhio: `<span class="gm-flight-number-badge">#N</span>`.
- Aggiunta interattività accessibile: classe `.gm-stats-record-clickable`, attributi `data-action="open-flight-detail"`, `data-flight-id`, `role="button"`, `tabindex="0"` e `aria-label` descrittivo.
- Aggiornata la suite `tests/ui/logbookStatsView.test.mjs`.

### 3. Flight Log Controller (`ui/views/LogbookView.js`)
- La delega degli eventi (`handleClick` e `handleKeyDown` per Enter/Space) intercetta `[data-action="open-flight-detail"]` su qualsiasi elemento del tab statistiche o del feed voli.
- In `handleOpenFlightDetail(flightId)` integrata la risoluzione deterministica del `flightNumber` sia dallo store sia da `DEFAULT_SEED_FLIGHTS`.

### 4. Dettaglio Volo (`ui/views/FlightDetailSheet.js`)
- Invocazione di `checkFlightRecordFlags(meta, careerRecords)`.
- Se il volo detiene almeno un record: visualizzazione della pill `<span class="gm-status-pill gm-status-pill-record">Record Personale</span>` nella testata e `<span class="gm-record-badge">Record</span>` accanto alla durata se è il volo più lungo.
- Nella griglia telemetrica cinematica (Quota Max MSL, Guadagno dal Decollo, Salita Massima Vario, Distanza Orizzontale): applicazione della classe `.gm-flight-metric-card-record` (bordo ambra e sfumatura ambra sottile) e del badge `<span class="gm-record-badge">Record</span>`.

### 5. Design System Tokens (`css/theme.css`)
- Definiti token per `.gm-stats-record-clickable`, `.gm-status-pill-record`, `.gm-record-badge` e `.gm-flight-metric-card-record` con supporto dual-theme (cockpit scuro e modalità luce solare `[data-theme="light"]`) nel rispetto di WCAG AA $\ge 4.5:1$ e Fitts floor.

### 6. Test d'Integrazione Headless (`tests/ui/logbookFlightDetailInteraction.test.mjs`)
- Aggiunto test d'integrazione che verifica: passaggio al tab statistiche, presenza delle card cliccabili con badge `#N`, click ed apertura di `FlightDetailSheet`, e navigazione da tastiera via Enter.

## Punti di Verifica & Risultati
- `npm test`: 698 test eseguiti (122 suite), 697 passanti, 0 fallimenti, 1 skipped.
- Shift-Left Quality Gate superato al 100%.
