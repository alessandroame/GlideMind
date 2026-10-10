# Multi-Takeoff & Multi-Landing Subspot Selection & Overview Card Synchronization

**Data**: 2026-10-10  
**Autore**: GlideMind Agent  
**Ambito**: `core/comprensorio.js`, `core/store.js`, `ui/views/ForecastView.js`, `css/theme.css`, `tests/`

---

## 1. Contesto & Requisiti Utente
1. *"nella scheda previsioni dalla lista degli spot voglio poter selezionare se ce n'è più di uno decollo e atterraggio"* (Nel tab previsioni, consentire la selezione del decollo e dell'atterraggio specifico se il comprensorio ne possiede più di uno).
2. *"quando seleziono un docollo o atterraggio mi aspetto che sia quello usato nella scheda dell'overview del comprensorio"* (Quando seleziono un decollo o atterraggio, deve essere quello utilizzato e visualizzato nella scheda dell'overview del comprensorio `#forecast-summary-card`).

---

## 2. Decisioni Architetturali & Implementazione

### 2.1 Headless Core (`core/comprensorio.js`)
- Firma estesa di `evaluateComprensorio`:
  ```javascript
  evaluateComprensorio({
    comprensorio,
    weatherData,
    hourIndex = 12,
    glider = null,
    targetDate = null,
    allowSynthetic = false,
    takeoffId = null,
    landingId = null
  })
  ```
- **Risoluzione Decollo**: Se `takeoffId` è fornito ed esiste nel comprensorio, viene valutato esattamente quel decollo. Se differisce dal primario, viene impostato `isTakeoffOverridden: true` con nota descrittiva `takeoffOverrideReason: "Decollo manuale: <Nome>"`.
- **Risoluzione Atterraggio**: Se `landingId` è fornito ed esiste, viene valutato esattamente quell'atterraggio calcolando il cono di planata e la severità aerodinamica (`calculateGlideToLanding(selectedTakeoff, explicitLanding)`).
- **Fallback Deterministico**: Se `takeoffId` o `landingId` non vengono passati o non esistono, il sistema esegue il fallback conservativo trasparente ($T_{\text{best}}$ e $L_{\text{safe}}$).
- **Supporto Offline**: Anche in assenza di dati meteo, `evaluateComprensorio` risolve `explicitTakeoff` e `explicitLanding` senza crash.

### 2.2 Reattività & Stato (`core/store.js`)
- Aggiunti `activeTakeoffId: null` e `activeLandingId: null` a `DEFAULT_INITIAL_STATE`.
- Inseriti i campi nel set `persistedKeys` per salvaguardare la selezione tra sessioni e ricaricamenti.

### 2.3 Livello UI & Sincronizzazione Card Overview (`ui/views/ForecastView.js`)
- **Cardine Unico della Scheda Overview (`#forecast-summary-card`)**:
  - Il contenitore `#forecast-spot-card-container` renderizza costantemente la scheda di sintesi del comprensorio (`renderSummaryCard(evaluated)`), alimentata dai parametri `takeoffId` e `landingId` effettivi.
  - La card mostra sempre il binomio decollo + atterraggio selezionato: quota decollo, azimut pendio, velocità e scostamento vento, quota atterraggio ed efficienza di planata 1:G con explainability testuale.
- **Spot Picker Sheet (`renderPickerSections`)**:
  - Rimossa l'istruzione inline `onclick="event.stopPropagation();"` che bloccava la propagazione degli eventi nei browser reali.
  - Disaccoppiata la riga principale del comprensorio (`.gm-picker-item-main` con `data-action="pick-spot"`) dalla sezione di selezione sub-spot (`.gm-picker-subselection`).
  - Per comprensori con sub-spot multipli, inseriti chip di selezione (`pick-spot-takeoff`, `pick-spot-landing`) con floor touch $\ge 48\text{px}$ e pulsante di applicazione esplicito `pick-spot-apply`.
  - Cliccando su un chip di decollo o atterraggio per il comprensorio attivo, lo stato e lo store vengono aggiornati immediatamente. Cliccando su applica o su un comprensorio, `activeTakeoffId` e `activeLandingId` vengono commessi nello store e la card overview viene aggiornata.
- **Header Forecast View (`renderHeader`)**:
  - Pill a riga singola con scorrimento orizzontale (`.gm-spot-subselection-container`, `.gm-spot-pill`) per commutare istantaneamente il decollo (`set-active-takeoff`) e l'atterraggio attivo (`set-active-landing`).
  - Dropdown di secondo livello (`forecast-subspot-select`) e popover custom (`select-subspot`): la selezione di un decollo o atterraggio aggiorna `activeTakeoffId` / `activeLandingId`, mantiene la modalità overview e aggiorna la label dinamica `Panoramica (<Decollo> • <Atterraggio>)`.
- **Mini-Mappa Contestuale (`initMiniMap`)**:
  - Il tap sui pin della mini-mappa (`onSelectSubSpot`) aggiorna `activeTakeoffId` o `activeLandingId` e mantiene la modalità overview, riflettendo la selezione direttamente sulla card di sintesi.
- **Ciclo di Vita & Sincronizzazione Store (`mount`, `store.subscribe`)**:
  - `mount()` idrata `activeTakeoffId` e `activeLandingId` dallo store.
  - La sottoscrizione dello store reagisce alle variazioni di `activeTakeoffId` rieseguendo il fetch dei dati meteorologici per le coordinate e la quota del decollo specifico.

### 2.4 Ergonomia Outdoor & Design System (`css/theme.css`)
- Dichiarati stili per `.gm-picker-subselection`, `.gm-picker-chip`, `.gm-picker-apply-btn`, `.gm-spot-pill`.
- Floor ergonomico garantito con `min-height: var(--gm-touch-min, 48px)`.
- Navigazione orizzontale sicura con `touch-action: pan-x`.
- Contrasto e accessibilità WAI-ARIA garantiti con stati `.active`, `aria-checked` e `aria-pressed`.

---

## 3. Test & Verifica
- 32 test unitari in `tests/core/comprensorio.test.mjs` (inclusi 6 per pinning esplicito decolli/atterraggi).
- 51 test di integrazione UI in `tests/ui/forecastView.test.mjs` (inclusi test per la sincronizzazione della card overview da pill, picker sheet, dropdown Livello 2 e mini-mappa).
- Esecuzione completa della suite del progetto (`npm test`): **486 test passati su 70 suite, 0 falliti**.
