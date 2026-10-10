# ADR & Worklog: Spot Map View Date Picker Integration

- **Data**: 2026-10-10
- **Scope**: `ui/views/SpotMapView.js`, `css/theme.css`, `tests/ui/spotMapView.test.mjs`
- **Autore**: Antigravity

## Contesto & Motivazione
Nella vista Mappa Comprensori (`SpotMapView`) mancava il selettore della data delle previsioni meteorologiche, presente invece sia nella `HomeDashboardView` che nella `ForecastView`. Sebbene il motore computazionale della mappa (`evaluateComprensorio`, `generateSyntheticWeather`, `fetchBatchComprensoriWeather`) fosse già nativamente predisposto per gestire `this.activeDate`, l'interfaccia utente non esponeva i tab di selezione data né il modal sheet del calendario a 14 giorni.

## Decisioni Architetturali & Implementazione
1. **Integrazione Componente Date Picker nella Top Bar (`SpotMapView.js`)**:
   - Inserito il selettore data identico a quello della Home (`#gm-map-date-bar`) all'interno dell'header esterno `.gm-map-top-bar`.
   - Implementato `renderDateBar(state)` con preset smart (`getSmartDatePresets`) e pulsante calendario (`.gm-date-tab-calendar`), conforme alle Laws of UX (touch target floor $\ge 44\text{px}$, scroll orizzontale a riga singola con `touch-action: pan-x`).
   - Integrato il badge informativo sinottico (`.gm-horizon-notice`) per orizzonti previsionali oltre i 7 giorni.
2. **Sheet Calendario a 14 Giorni (`openDatePickerSheet`)**:
   - Integrato `openDatePickerSheet()` collegato a `openSheet()` di `sheetManager.js` con id `map-date-picker-sheet` e titolo "Seleziona Data Previsioni".
   - Griglia di selezione rapida a 14 giorni neutrale (`.gm-date-grid`), highlight del giorno attivo e input nativo secondario con pulsante "Conferma" (`apply-custom-date`).
3. **Gestione Eventi e Sincronizzazione Reattiva SSOT**:
   - Aggiunto handler delegato `handleClick` su `this.container` e su `this.sheetContainerEl` (`#sheet-container`) per intercettare `select-date`, `open-date-picker-sheet`, `apply-custom-date`, e `pick-calendar-date`.
   - Implementato `handleDateChange(newDate)` che aggiorna `store.setState({ activeDate: newDate })`, aggiorna i tab nel DOM via `updateDateBarInDom()`, ricalcola lo stato degli spot via `renderMapContent()` e innesca il fetch batch in background (`syncVisibleSpotsWeather()`).
   - Sottoscrizione alle mutazioni dello store per mantenere sincronizzato il date bar anche in caso di variazioni esterne della data.
4. **Adattamento del Layout CSS (`css/theme.css`)**:
   - Rimosso il vincolo rigido `max-height: 50px` e `align-items: center` da `.gm-map-top-bar`, impostando un layout flessibile verticale a due righe (`flex-direction: column; gap: 6px; padding: 8px 12px 6px;`).
   - Isolato `.gm-map-top-bar-inner` per i selettori di macro-regione, località e live badge, e `.gm-map-date-bar` per la barra delle date.
5. **Suite di Test Automatizzati (`tests/ui/spotMapView.test.mjs`)**:
   - Aggiunti 3 nuovi casi di test a copertura di rendering markup, interazione click / cambio store e apertura del bottom sheet con griglia calendario a 14 giorni.

## Verifica & Shift-Left Pre-Flight
- `npm test`: 538/538 test superati (72 suite su 72).
- Zero DOM leakage nei moduli core, pieno rispetto dei vincoli di ergonomia outdoor e sobrità terminologica.
