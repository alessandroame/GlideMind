# Worklog: Flight Detail UX/UI Audit, Prominent Flight Number & Terminology Standardization

- **Data**: 2026-10-12
- **Ambito**: UI / FlightDetailSheet / LogbookView / ReplayView / Design System
- **Autore**: Antigravity

## Contesto & Obiettivi
A seguito di revisione critica e feedback utente sulla vista di dettaglio volo (`FlightDetailSheet.js`), sono state evidenziate tre necessità prioritarie:
1. **Audit Euristico UI/UX Completo**: Valutazione sistematica della vista di dettaglio rispetto alle 30 Laws of UX con matrice di prioritizzazione (P0-P3).
2. **Standardizzazione Terminologica ("Libretto" -> "Flight Log" / "Log")**: Bonifica di tutti i residui terminologici del termine colloquiale "Libretto" in favore della denominazione aeronautica standard ("Flight Log" / "Log") nelle intestazioni, nei pulsanti di ritorno, nei tab di navigazione e nei dialoghi.
3. **Visibilità Marcata del Numero Progressivo di Volo**: Il numero del volo (es. `#12`, `VOLO #12`) non era esposto nella schermata di dettaglio, privando il pilota del contesto cronologico e della correlazione immediata con il feed del logbook.

## Modifiche Architetturali ed Ergonomiche

### 1. Risoluzione & Esposizione del Flight Number
- In `FlightDetailSheet.js`:
  - `openFlightDetailView` risolve in modo deterministico `flightNumber`: prioritizza `options.flightNumber`, `bundle.meta.flightNumber`, o ricerca l'indice progressivo nello store dei voli (`state.flights.length - index`) e nei fallback seed.
  - Nella topbar: introdotto il badge mono ad alto contrasto `.gm-flight-number-badge-detail` affiancato al titolo del sito (`#12`).
  - Nella card hero principale: introdotto il blocco aeronautico `.gm-flight-hero-num-box` con etichetta `VOLO` e numero gigante `#12` in font mono.
- In `LogbookView.js`:
  - `handleOpenFlightDetail` estrae il numero progressivo dal feed (`flight.flightNumber || (totalCount - index)`) e lo passa esplicitamente a `openFlightDetailSheet`.

### 2. Bonifica Terminologica Globale ("Libretto" -> "Flight Log")
- `FlightDetailSheet.js`: `aria-label="Torna al Flight Log"` e testo `<span>Flight Log</span>` nel pulsante back della topbar.
- `LogbookView.js`: titolo principale commutato in `Flight Log`, landmark `aria-label="Flight Log e Telemetria"`, segmented control `aria-label="Sezioni del Flight Log"`, empty state `Nessun volo memorizzato nel Flight Log`.
- `FlightReplayView.js`: pulsante di ritorno commutato in `aria-label="Torna al Flight Log"` con `<span>Flight Log</span>`.
- `index.html`: barra di navigazione inferiore aggiornata con `aria-label="Flight Log"` e `<span>Flight Log</span>`.
- `ui/router.js`: segnaposto di rotta aggiornato in `Flight Log & Telemetria`.
- `ImportFlightSheet.js`: etichette di ritorno e messaggi di riepilogo sincronizzati con `Flight Log`.

### 3. De-cluttering Cognitivo del Debriefing Didattico
- Il testo didattico generato dall'Istruttore Guido è stato parzializzato (chunked) in schede semantiche individuali `.gm-debrief-callout`, dotate di bordo di enfasi ad alto contrasto, eliminando il blocco monolitico di testo non formattato.

### 4. Azioni Rapide Ergonomiche nella Thumb Zone
- Ridisegnata la sticky bottom bar con pulsanti provvisti di icone funzionali vettoriali SVG per `Visualizza Replay 3D` (Play 3D), `Setup Traccia` (Sliders/Gear) e `Scarica Traccia IGC (FAI)` (Download).

## Test Suite & Validazione
- Aggiornati i test di regressione in `tests/flightDetailView.test.js` e `tests/ui/logbookView.test.mjs`.
- Aggiunti nuovi test in `tests/ui/flightDetailSheet.test.mjs` per la verifica deterministica del flight number in topbar e hero box, dell'accessibilità del pulsante back e delle card `.gm-debrief-callout`.
- Esecuzione `npm test`: 673 superati, 0 falliti.
