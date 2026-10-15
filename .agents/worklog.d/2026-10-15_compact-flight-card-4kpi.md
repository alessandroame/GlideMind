# 2026-10-15 - Refactoring Card Flight Log: Layout Compatto (~74px), Griglia 4-KPI (Termiche), Badge #N Maggiorato e Traccia Inline senza Box

## Contesto & Diagnosi
Nel feed del Flight Log (`ui/views/LogbookView.js`), l'header di ciascuna card (`.gm-flight-card-header`) presentava una saturazione orizzontale critica: il badge `#N` (`0.76rem`, otticamente più piccolo del titolo e dei KPI), il pill testuale `Traccia` (`~74px`, con box e bordo verde in competizione semantica coi semafori di volabilità) e il bottone inline di eliminazione `×` (`~44px`, `min-height: 48px`) sottraevano `~178px` su `330px` utili mobile, costringendo il titolo della rotta (`Decollo -> Atterraggio`) in una colonna di soli `152px` (46% della card). Inoltre mancava il conteggio delle termiche nella vista rapida e il guadagno `0 m` veniva falsamente formattato come `--`.

## Decisioni Architetturali & Interventi
1. **Spostamento Azione Distruttiva nella Scheda Volo (`FlightDetailSheet.js`)**:
   - Rimosso il bottone `×` (`gm-flight-delete-btn`) dalla card del feed (prevenendo tocchi accidentali durante lo scroll, NN/G #5).
   - Integrato il controllo `#btn-delete-from-detail` (`data-action="delete-flight"`, target Fitts `>= 48px`) nella topbar di `FlightDetailSheet.js`, collegato via callback `options.onDelete` a `LogbookViewController.startPendingDeletion(flightId)` per preservare la finestra di grazia di 5 secondi (*Annulla*).
2. **Gerarchia Header (`#N` Maggiorato `0.92rem`) & Traccia Senza Box nella 2ª Riga**:
   - Portato `.gm-flight-number-badge` a `font-size: 0.92rem; padding: 3px 7px;` con contrasto rafforzato per dargli priorità ottica primaria a fianco del titolo (`0.92rem`, `→`).
   - Liberato il **100% della prima riga** per `#N` + `Decollo → Atterraggio`, spostando `.gm-track-badge` in coda alla 2ª riga dei metadati (`2026-10-11 • 16:42 • Axis Pluto 4 • 〰`) e rimuovendo sfondo e bordo verde (`background: transparent; border: none;`, mantenendo `<span class="sr-only">Traccia</span>` per accessibilità).
3. **Compressione Verticale (~74px) e Griglia a 4 KPI con Termiche**:
   - Ridotti `padding: 8px 12px` e `gap: 4px` su `.gm-flight-card` (rimuovendo anche la definizione duplicata legacy di `.gm-flight-card` a riga 1157 di `css/theme.css`).
   - Estesa `.gm-flight-metrics-row` a 4 colonne (`grid-template-columns: repeat(4, minmax(0, 1fr)) auto`): `Tempo`, `Quota MSL`, `Guadagno` (con fix per mostrare `+0 m` quando `maxGainMeters === 0`) e `Termiche` (`thermalsCount` con evidenziazione ambra `.gm-flight-metric-val-thermal` quando `> 0`).

## Verifica
- Aggiornate ed eseguite le suite `tests/ui/logbookView.test.mjs`, `tests/ui/logbookFlightDetailInteraction.test.mjs`, `tests/ui/flightDetailSheet.test.mjs`, `tests/ui/shiftLeftGovernance.test.mjs` e `tests/ui/uiIntegrityAudit.test.mjs` (77/77 test passati, 0 fallimenti).
