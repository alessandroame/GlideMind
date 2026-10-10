# Multi-Takeoff & Multi-Landing Subspot Selection in Forecast & Spot Picker

**Data**: 2026-10-10  
**Autore**: GlideMind Agent  
**Ambito**: `core/comprensorio.js`, `core/store.js`, `ui/views/ForecastView.js`, `css/theme.css`, `tests/`

---

## 1. Contesto & Requisito Utente
- **Richiesta**: *"nella scheda previsioni dalla lista degli spot voglio poter selezionare se ce n'è più di uno decollo e atterraggio"* (Nel tab previsioni, consentire la selezione del decollo e dell'atterraggio specifico se il comprensorio ne possiede più di uno).
- **Contesto Operativo**: L'architettura comprensorio-centrica raggruppa decolli e atterraggi all'interno della medesima località (es. Monte Cornizzolo ha Decollo Risparmio e Decollo Centrale; Meduno ha 4 decolli e 3 atterraggi). Precedentemente `evaluateComprensorio` valutava sempre l'accoppiata automatica $T_{\text{best}}$ + $L_{\text{safe}}$.

---

## 2. Decisioni Architetturali & Implementazione

### 2.1 Headless Core (`core/comprensorio.js`)
- Arricchita la firma di `evaluateComprensorio`:
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

### 2.3 Livello UI (`ui/views/ForecastView.js`)
- **Spot Picker Sheet (`renderPickerSections`)**:
  - Per comprensori con `takeoffs.length > 1` o `landings.length > 1`, inserito container `.gm-picker-subselection` con chip di scelta rapida (`.gm-picker-chip[data-action="pick-spot-takeoff"]` e `.gm-picker-chip[data-action="pick-spot-landing"]`).
  - Aggiunto badge conteggio (`.gm-picker-badge-count`, es. `2 decolli · 1 atterraggio`).
  - Aggiunto pulsante esplicito `Visualizza Previsioni ›` (`.gm-picker-apply-btn[data-action="pick-spot-apply"]`).
  - Per comprensori con 1 decollo e 1 atterraggio, nessun chip o badge viene renderizzato (Occam's razor).
- **Header Forecast View (`renderHeader`)**:
  - Quando il comprensorio selezionato ha sub-spot multipli, l'header mostra pill a riga singola con scorrimento orizzontale (`.gm-spot-subselection-container`, `.gm-spot-pill`) per commutare istantaneamente il decollo e l'atterraggio attivo.
- **Gestione Eventi (`handleClick` & `handleChange`)**:
  - Gestiti `pick-spot-takeoff` e `pick-spot-landing` per aggiornare lo stato del card nel picker prima del commit.
  - Risolto un bug critico in cui la variabile evento era erroneamente referenziata come `e` anziché `evt`.
  - Gestito `pick-spot-apply` per commettere nello store `selectedSpot`, `activeTakeoffId`, `activeLandingId` e chiudere il foglio.
  - Gestiti `set-active-takeoff` e `set-active-landing` per aggiornare lo stato in tempo reale dall'header della vista.

### 2.4 Ergonomia Outdoor & Design System (`css/theme.css`)
- Dichiarati stili per `.gm-picker-subselection`, `.gm-picker-chip`, `.gm-picker-apply-btn`, `.gm-spot-pill`.
- Floor ergonomico garantito con `min-height: var(--gm-touch-min, 48px)`.
- Navigazione orizzontale sicura con `touch-action: pan-x`.
- Contrasto e accessibilità WAI-ARIA garantiti con stati `.active`, `aria-checked` e `aria-pressed`.

---

## 3. Test & Verifica
- Aggiunti 6 test unitari in `tests/core/comprensorio.test.mjs` (totale suite: 32 test, 0 fallimenti).
- Aggiunti 3 test di integrazione UI in `tests/ui/forecastView.test.mjs` (totale suite: 49 test, 0 fallimenti).
- Eseguita l'intera suite del progetto (`npm test`): **457 test passati su 62 suite, 0 falliti**.
