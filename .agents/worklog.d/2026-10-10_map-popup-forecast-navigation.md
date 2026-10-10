# Worklog: Navigazione Diretta alle Previsioni dal Fumetto Cartografico

- **Data**: 2026-10-10
- **Autore**: Antigravity (Pair Programming con Utente)
- **Stato**: Completato
- **Componenti Impattati**: `ui/map/mapEngineAdapter.js`, `ui/views/SpotMapView.js`, `ui/views/ForecastView.js`, `css/theme.css`, `tests/ui/spotMapView.test.mjs`

---

## 1. Contesto e Requisito

L'utente ha segnalato che dalla pagina mappa (`SpotMapView`) mancava un modo diretto per aprire la pagina delle previsioni (`ForecastView`) con il comprensorio selezionato, richiedendo esplicitamente di posizionare l'azione all'interno del fumetto contestuale del marker cartografico ("lo metterei dentro il fumetto").

---

## 2. Dettaglio delle Modifiche

### 2.1 `ui/map/mapEngineAdapter.js`
- **Markup Popup Unificato**:
  - All'interno del fumetto `.gm-map-spot-popup`, la sezione `.gm-map-popup-actions` include ora due bottoni affiancati:
    1. Pulsante primario di navigazione: `<button class="gm-map-popup-btn gm-map-popup-btn-primary gm-popup-forecast-btn" data-action="open-forecast">Previsioni ›</button>`.
    2. Pulsante secondario di dettaglio: `<button class="gm-map-popup-btn gm-popup-sheet-btn" data-action="open-spot-sheet">Scheda Spot</button>`.
- **Wiring Eventi Leaflet**:
  - Nell'evento `marker.on('popupopen')`, agganciati i gestori di click sia a `.gm-popup-forecast-btn` (`options.onSpotOpenForecast`) sia a `.gm-popup-sheet-btn` (`options.onSpotOpenSheet`).
- **HeadlessMockMapEngine**:
  - Aggiunti i metodi helper `triggerSpotForecast(spotId)` e `triggerSpotOpenSheet(spotId)`.

### 2.2 `ui/views/SpotMapView.js`
- **Metodo Centralizzato `handleOpenForecast(spotEval)`**:
  - Risolve l'oggetto completo del comprensorio dal catalogo.
  - Sincronizza lo stato globale in `store` (`selectedSpot`, `selectedSpotId`, `activeHourIndex`, `activeDate`).
  - Esegue la navigazione verso la vista `forecast` tramite `router.navigate('forecast')`.
- **Integrazione `createMapEngine`**:
  - Passato il callback `onSpotOpenForecast: (spot) => this.handleOpenForecast(spot)`.
- **Delegated Click Handling**:
  - In `handleClick(evt)`, aggiunto il supporto alle azioni `open-forecast` e `open-spot-sheet` con estrazione dell'attributo `data-spot-id`.
- **Refactoring CTA Scheda Spot**:
  - Nel modal sheet di dettaglio, il pulsante primario `Apri Previsioni Dettagliate` delega a `this.handleOpenForecast(spot)`.

### 2.3 `ui/views/ForecastView.js`
- **Sincronizzazione Ora da Mappa**:
  - In `mount()`, legge `state.activeHourIndex` o `state.selectedHour` dal store se presenti, preservando l'ora attiva selezionata sullo scrubber della mappa anziché reimpostarla all'ora iniziale predefinita.

### 2.4 `css/theme.css`
- Aggiornata la larghezza del popup `.gm-leaflet-popup .leaflet-popup-content` a `min-width: 180px; max-width: 240px;`.
- Definite le regole per `.gm-map-popup-actions` (layout flex a due colonne compatte con touch target minimo $\ge 32\text{px}$).
- Definito stile primario ad alto contrasto per `.gm-map-popup-btn-primary` (sfondo ambra aeronautico `var(--gm-accent, #f59e0b)` e testo scuro `#0f172a`).
- Aggiunti stili specifici per la modalità luce `[data-theme="light"]`.

### 2.5 `tests/ui/spotMapView.test.mjs`
- Aggiunta cattura dell'HTML dei popup Leaflet e verifica della presenza dei bottoni "Previsioni ›" e "Scheda Spot".
- Aggiunto test per la navigazione a `forecast` con sincronizzazione dello stato tramite `handleOpenForecast`.
- Aggiunto test per il click delegato su `data-action="open-forecast"`.

---

## 3. Esito della Verifica

- `node --test tests/ui/spotMapView.test.mjs`: 24 test passati su 24.
- `npm test`: 548 test passati su 548 across 87 suites (0 errori, 0 regressioni).
