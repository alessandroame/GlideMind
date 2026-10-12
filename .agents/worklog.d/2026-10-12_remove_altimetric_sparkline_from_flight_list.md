# Worklog: Rimozione del Grafico Altimetrico dall'Elenco Voli

- **Data**: 2026-10-12
- **Ambito**: `ui/views/LogbookView.js`, `tests/ui/logbookView.test.mjs`

## Contesto & Diagnosi
Nell'elenco dei voli (`LogbookView.js`), ciascuna card (`.gm-flight-card-compact`) conteneva un piccolo grafico SVG del profilo altimetrico (sparkline) compresso tra i metadati del decollo/vela e la riga con le 3 metriche sintetiche (Tempo, Quota MSL, Guadagno).
Su schermi mobile e outdoor tale grafico compresso risultava ridondante rispetto al grafico telemetrico dettagliato e interattivo a pieno schermo disponibile all'interno del dettaglio del volo (`FlightDetailSheet.js`). La sua presenza appesantiva verticalmente le schede, riducendo il numero di voli visualizzabili contemporaneamente nel feed.

## Intervento Eseguito
1. **`ui/views/LogbookView.js`**:
   - Rimosso il calcolo e il rendering dell'elemento SVG `.gm-flight-sparkline-wrap` e della polilinea altimetrica in `renderFlightCard()`.
   - Rimossi identificatori e variabili non utilizzate (`climbRate`, `thermals`).
   - Aggiornata la documentazione JSDoc per riflettere l'altezza snella delle card (~85px).
2. **`tests/ui/logbookView.test.mjs`**:
   - Aggiornato il test della lista voli per verificare che non vengano renderizzate classi o contenitori `.gm-flight-sparkline` o `.gm-flight-sparkline-wrap` nelle card dell'elenco voli.

## Verifica
- Esecuzione test unitari `tests/ui/logbookView.test.mjs`: superati 8/8 test.
- Esecuzione intera test suite `npm test`: superati 681/681 test (0 fallimenti).
- Shift-Left Quality Gate superati con successo (11/11 gate).
