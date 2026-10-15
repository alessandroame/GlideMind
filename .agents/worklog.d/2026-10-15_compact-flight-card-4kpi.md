# 2026-10-15 - Refactoring Card Flight Log: Layout Compatto (~74px), Griglia 4-KPI (Termiche), Badge #N Maggiorato e Traccia Inline senza Box

## Contesto & Diagnosi
Nel feed del Flight Log (`ui/views/LogbookView.js`), l'header di ciascuna card (`.gm-flight-card-header`) presentava una saturazione orizzontale critica: il badge `#N` (`0.76rem`, otticamente più piccolo del titolo e dei KPI), il pill testuale `Traccia` (`~74px`, con box e bordo verde in competizione semantica coi semafori di volabilità) e il bottone inline di eliminazione `×` (`~44px`, `min-height: 48px`) sottraevano `~178px` su `330px` utili mobile, costringendo il titolo della rotta (`Decollo -> Atterraggio`) in una colonna di soli `152px` (46% della card). Inoltre mancava il conteggio delle termiche nella vista rapida e il guadagno `0 m` veniva falsamente formattato come `--`.

## Decisioni Architetturali & Interventi
1. **Spostamento Azione Distruttiva nella Scheda Volo (`FlightDetailSheet.js`)**:
   - Rimosso il bottone `×` (`gm-flight-delete-btn`) dalla card del feed (prevenendo tocchi accidentali durante lo scroll, NN/G #5).
   - Integrato il controllo `#btn-delete-from-detail` (`data-action="delete-flight"`, target Fitts `>= 48px`) nella topbar di `FlightDetailSheet.js`, collegato via callback `options.onDelete` a `LogbookViewController.startPendingDeletion(flightId)` per preservare la finestra di grazia di 5 secondi (*Annulla*).
2. **Simmetria Orizzontale Sinistra ↔ Destra (`justify-between`) & Località Secondaria (`0.78rem`)**:
   - **Riga 1 (`.gm-flight-card-header`)**: ancorato a sinistra `.gm-flight-title-group` (`#N` `0.92rem` + Data/Ora `0.80rem`) e ancorato al margine destro `.gm-flight-header-right` (`margin-left: auto`, con Vela `.gm-flight-glider-text` + icona traccia inline senza box).
   - **Riga 2 (`.gm-flight-route-row`)**: località `Decollo → Atterraggio` a sinistra con peso declassato (`0.78rem`, `font-weight: 500`, `var(--gm-text-secondary)`) e chevron `›` ancorato a destra (al centro verticale della card).
3. **Compressione Verticale (~70px) e Griglia a 4 KPI Edge-to-Edge**:
   - Ridotti `padding: 8px 12px` e `gap: 4px` su `.gm-flight-card` (rimuovendo anche la definizione duplicata legacy di `.gm-flight-card` a riga 1157 di `css/theme.css`).
   - Estesa `.gm-flight-metrics-row` a 4 colonne simmetriche da bordo a bordo (`Tempo` a filo sinistro, `Quota MSL` e `Guadagno` centrati nelle rispettive colonne `.gm-flight-metric-center`, e `Termiche` allineato a filo destro `.gm-flight-metric-end` con evidenziazione ambra `.gm-flight-metric-val-thermal` quando `> 0`).

## Verifica
- Aggiornate ed eseguite le suite `tests/ui/logbookView.test.mjs`, `tests/ui/logbookFlightDetailInteraction.test.mjs`, `tests/ui/flightDetailSheet.test.mjs`, `tests/ui/shiftLeftGovernance.test.mjs` e `tests/ui/uiIntegrityAudit.test.mjs` (77/77 test passati, 0 fallimenti).
