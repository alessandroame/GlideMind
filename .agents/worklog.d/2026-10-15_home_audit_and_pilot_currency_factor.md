# 2026-10-15 - Refactoring Home Above-the-Fold, Simmetria Calendario 14gg, Sheet Unificato Flight Log e Fattore Opzionale Allenamento/Esperienza Pilota

## 1. Contesto e Obiettivo
- **Problema**:
  1. Nella vista `HomeDashboardView.js`, il blocco a 4 righe `Attività Pilota` (`.gm-pilot-card`, ~165px verticali) precedeva la sezione `Volabilità`, sottraendo spazio vitale Above-the-Fold su mobile (360-390px) dove il 90% delle aperture ha come obiettivo immediato il triage meteorologico dei comprensori.
  2. Il selettore del profilo vela attiva (`activeGlider`) risiedeva dentro `.gm-pilot-card`, e la vista `SettingsView.js` rimandava l'utente a `#home` per cambiare vela invece di aprire direttamente lo sheet del catalogo vele.
  3. Il selettore calendario a 14 giorni in `HomeDashboardView.js` passava `null` come terzo argomento a `getAvailableCalendarDates(today, 14, null)`, rendendo i 14 giorni visivamente neutri e privi dei badge semantici a 4 stati presenti in `ForecastView.js`.
  4. Nel `Flight Log`, la registrazione manuale di un volo senza traccia GPS era rimasta isolata nella vecchia card Home, mentre `LogbookView.js` esponeva un singolo bottone di importazione file.
  5. Lo stato di allenamento del pilota (freschezza / giorni dall'ultimo volo) e l'esperienza complessiva (numero di voli a libretto) non potevano essere opzionalmente integrati come margine prudenziale nel calcolo della volabilità.

## 2. Decisioni Architetturali (ADR)
1. **Home Above-the-Fold 100% Meteo-Centrica (`ui/views/HomeDashboardView.js`)**:
   - Rimossa la card a 4 righe `.gm-pilot-card` dalla Home. La sezione `Volabilità` appare immediatamente sotto l'header.
   - Integrata la pillola compatta della vela attiva (`#btn-home-select-glider`, `[EN-A · Modello ▾]`) direttamente all'estremità destra della riga dei chip di filtro rapido (`.gm-filter-chips-right`) a costo verticale `0px`.
   - **Avviso Condizionale di Continuità (Opzione B)**: quando il pilota è in stato `active` ($\le 35\text{gg}$), la Home non mostra alcun badge aggiuntivo (`0px`); solo in stato `reentry` ($36\text{–}90\text{gg}$), `lapsed` ($> 90\text{gg}$) o `no_flights` compare il badge compatto `#home-pilot-currency-alert` accanto alla pillola della vela.
2. **Spostamento Toggle `30 Giorni | Anno` e Unificazione CTA `Flight Log` (`ui/views/LogbookStatsView.js`, `ui/views/LogbookView.js`, `ui/views/ImportFlightSheet.js`)**:
   - Arricchita la card `"Valuta & Continuità Pilota"` nel tab `Flight Log -> Statistiche` con lo switch interattivo `30 Giorni | Anno` (`data-action="set-pilot-period"`).
   - Mantenuto l'unico pulsante primario nell'header del `Flight Log`, estendendo `ImportFlightSheet.js` con la sezione collassabile `"Registra Volo Manualmente (Senza Traccia)"` (`#gm-manual-flight-details` / `#gm-manual-flight-form`) accanto alla dropzone `.IGC / .JSON`.
3. **Simmetria Calendario 14 Giorni in Home (`ui/views/HomeDashboardView.js`)**:
   - `openDatePickerSheet()` in `HomeDashboardView.js` invoca `this.getMultiDayFlyability(null, 14)` e renderizza le classi semantiche `fly-${d.flyability.status}`, il badge `grid-fly-status` e la legenda `.gm-date-sheet-legend`, in totale simmetria con `ForecastView.js`.
4. **Fattore Opzionale di Prudenza "Allenamento & Esperienza Pilota" (`core/logbook.js`, `core/flyability.js`, `core/comprensorio.js`, `core/store.js`)**:
   - Introdotta la chiave persistita `usePilotCurrencyFactor: false` (opt-in) in `core/store.js`, commutabile sia dallo sheet di selezione vela (`openGliderSheet`) sia da `SettingsView.js` (`data-action="toggle-pilot-currency-factor"`).
   - Implementata la funzione pura headless `calculatePilotSafetyFactor({ flights, referenceDate, enabled })` in `core/logbook.js`:
     - Moltiplicatore **mai $> 1.0$** (nessun rilassamento dei limiti fisici della vela anche per piloti con centinaia di voli).
     - `1.0x` (`optimal`): $\le 35\text{gg}$ dall'ultimo volo e $\ge 15\text{ voli}$ registrati.
     - `0.85x` (`-15%`, `reentry` / `low_experience`): $36\text{–}90\text{gg}$ di stop oppure $< 15\text{ voli}$ a libretto.
     - `0.75x` (`-25%`, `lapsed`): $> 90\text{gg}$ dall'ultimo volo.
   - In `core/flyability.js`: il coefficiente riduce **esclusivamente le soglie di gestione attiva** ($\Delta\text{Gust}$, brezza gialla di lancio, turbolenza EDR, CAPE convettivo e cono di vento traverso in decollo), mantenendo **invariati i limiti fisici di penetrazione** (`windRed`, `windNoFly` legati a $V_{\text{trim}}$) e l'efficienza di planata verso l'atterraggio (`safeLimit`).
   - In `core/comprensorio.js`: quando un comprensorio scende da `Volabile` a `Cautela` (o `Non Volabile`) per effetto del fattore pilota, la stringa `reason` esplicita la distinzione tra fisica della vela e prudenza pilota (`"Meteo favorevole per la vela • [reasonTag]"`).
5. **Pannelli di Warning Floating Ancorati in Basso con Pulsante Chiudi (`css/theme.css`, `HomeDashboardView.js`, `ForecastView.js`, `SpotMapView.js`, `LogbookView.js`)**:
   - Convertiti `.gm-horizon-notice`, `.gm-storage-warning-banner`, `.gm-logbook-undo-banner` e `.gm-import-summary-banner` in pannelli floating (`position: fixed; z-index: 950`) ancorati in basso sopra la barra di navigazione (e sopra la timeline scrubber in `ForecastView` e `SpotMapView`), eliminando qualsiasi scatto verticale del layout (CLS).
   - Dotati tutti i pannelli di warning del pulsante di chiusura `.gm-warning-close-btn` (`✕`) con target Fitts $\ge 48 \times 48\text{px}$.
6. **Barra Simbiotica a Riga Singola e Card Comprensorio Espressiva a 2 Righe con Timeline Diurna (`ui/views/HomeDashboardView.js`, `css/theme.css`)**:
   - Unificati campo di ricerca, singolo toggle di filtro volabilità (`#btn-home-fly-filter-toggle`, `Tutti` $\leftrightarrow$ `Volabili`) e selettore vela attiva su un'unica riga (`#home-symbiotic-toolbar`), nascondendo automaticamente il toggle di filtro durante la digitazione.
   - Sostituite le 3 righe di testo secondario della card comprensorio con la **Timeline Diurna di Volabilità** (`.gm-home-timeline`, dall'alba al tramonto tramite `resolveDaylightHours`), affiancata da una micro-causa sintetica nell'header (`.gm-spot-micro-reason`) e dal deep-linking orario a 1-tap (`data-action="view-forecast-hour"`).

## 3. File Modificati
- `core/store.js`
- `core/logbook.js`
- `core/flyability.js`
- `core/comprensorio.js`
- `ui/views/HomeDashboardView.js`
- `ui/views/ForecastView.js`
- `ui/views/SpotMapView.js`
- `ui/views/LogbookView.js`
- `ui/views/LogbookStatsView.js`
- `ui/views/ImportFlightSheet.js`
- `ui/views/SettingsView.js`
- `css/theme.css`
- `tests/core/flyability.test.mjs`
- `tests/ui/homeDashboardView.test.mjs`
- `tests/ui/offlineWeatherUX.test.mjs`
- `tests/ui/uiIntegrityAudit.test.mjs`
- `tests/ui/logbookView.test.mjs`
- `tests/ui/settingsView.test.mjs`

