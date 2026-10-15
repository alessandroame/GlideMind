# 2026-10-16 - Riprogettazione Date Picker Compatto con Stepper Prev/Next e Griglia Calendario a 7 Colonne

## Contesto e Motivazione
Il precedente selettore di data (`.gm-date-tabs` e `.gm-date-picker-sheet`) presentava tre limiti ergonomici rilevanti su dispositivi mobili:
1. **Ingombro verticale e overflow orizzontale**: i tab `.gm-date-tab` a 2 righe (`48px` di altezza visiva, `min-width: 68px`) occupavano spazio verticale prezioso e, quando veniva selezionata una data fuori dai preset (aggiungendo un 5° chip `.custom` più il bottone calendario), provocavano scorrimento orizzontale sui viewport da `360px–390px`.
2. **Assenza di navigazione sequenziale (`Prev / Next`)**: per avanzare o retrocedere di un singolo giorno era necessario aprire ogni volta il bottom sheet del calendario.
3. **Calendario bottom sheet dispersivo**: la griglia a 3/4 colonne con card alte `64px` e il blocco secondario ridondante (`<input type="date">` nativo + pulsante `Conferma`) allungavano lo sheet a oltre `420px`.

## Decisioni Architetturali e UX (Opzioni A1 + A2)
1. **Barra Date Compatta Monoriga (`36px`) con Stepper Integrato + Quick Chips (Opzione A1)**:
   - A sinistra, il gruppo `.gm-date-stepper` integra in un'unica pillola:
     - Pulsante `‹` (`button.gm-date-step-btn[data-action="prev-date"]`, disabilitato quando `activeDate <= todayIso`).
     - Pillola centrale `button.gm-date-tab-calendar[data-action="open-date-picker-sheet"]` che mostra sempre la data attiva corrente (`activeDisplayLabel`, es. `Oggi · 16 Ott`, `Dom · 17 Ott` o `Mer 21 Ott`), eventuale dot semaforico di volabilità e indicatore `▾`.
     - Pulsante `›` (`button.gm-date-step-btn[data-action="next-date"]`, disabilitato oltre l'orizzonte `+13gg`).
   - A destra, `.gm-date-quick-chips` espone le scorciatoie rapide monoriga (`Oggi`, `Dom`, `Sab`, `Dom` via `shortLabel` e `quickPresets`), senza mai iniettare un 5° chip custom nella barra quando si naviga su date intermedie.
   - Tutti i controlli mantengono un'altezza visiva compatta (`28px–34px` dentro barra da `36px`) preservando il target di tocco Fitts $\ge 48\text{px}$ tramite pseudo-elemento `::before`.
2. **Bottom Sheet Calendario a 7 Colonne (`Lun–Dom`) per 2 Settimane (Opzione A2)**:
   - Intestazione fissa a 7 colonne `.gm-date-weekday-header` (`WEEKDAY_HEADERS_MON`: `Lun..Dom`).
   - Griglia `.gm-date-grid` a 7 colonne (`grid-template-columns: repeat(7, 1fr)`) con celle di allineamento iniziali `.gm-date-grid-spacer` calcolate deterministicamente tramite `weekdayIndexMonday = (dayOfWeek + 6) % 7`.
   - Celle `.gm-date-grid-item` compatte (`min-height: 48px`) con barra inferiore e icona semantica a 4 colori (`Volabile`, `Cautela`, `Non Volabile`, `Severo`) e rimozione del blocco ridondante `<input type="date">` nativo + pulsante `Conferma`.

## File Modificati
- `core/datePresets.js`: arricchito `getSmartDatePresets` (`shortLabel`, `quickPresets`, `prevDate`, `nextDate`, `canPrev`, `canNext`, `activeDisplayLabel`, `activeFlyability`) e `getAvailableCalendarDates` (`weekdayIndexMonday`, `isToday`, `shortMonth`, costante `WEEKDAY_HEADERS_MON`).
- `ui/views/HomeDashboardView.js`, `ui/views/ForecastView.js`, `ui/views/SpotMapView.js`: aggiornati `renderDateBar`/`renderHeader`, `openDatePickerSheet` e `handleClick` (`prev-date`, `next-date`).
- `css/theme.css`: rifattorizzati gli stili `.gm-date-tabs`, `.gm-date-stepper`, `.gm-date-step-btn`, `.gm-date-quick-chips`, `.gm-date-tab`, `.gm-date-tab-calendar`, `.gm-date-weekday-header`, `.gm-date-grid` (7 colonne) e `.gm-date-grid-spacer`.
- `tests/core/datePresets.test.mjs`, `tests/ui/homeDashboardView.test.mjs`, `tests/ui/forecastView.test.mjs`, `tests/ui/spotMapView.test.mjs`: aggiunti test per stepper `prev-date`/`next-date`, `weekdayIndexMonday` e griglia a 7 colonne (157/157 test verdi nelle 4 suite).
