# ADR: Architettura Previsioni a Due Livelli: Macro Overview di Comprensorio e Micro Aerologia Disaccoppiata di Spot (Opzione A)

**Data**: 2026-10-13  
**Stato**: Accettato e Implementato  
**Contesto**: `ui/views/ForecastView.js`, `tests/ui/forecastView.test.mjs`

---

## 1. Contesto e Problema Riscontrato
L'utente ha sollevato due questioni critiche di architettura informativa ed ergonomia in `ForecastView`:
1. **Sovraccarico in Overview**: In vista Panoramica (`selectedSubSpot === 'overview'`), la presenza contemporanea della Summary Card ($T_{\text{best}} + L_{\text{safe}}$), delle 4 Finestre di Volo (Evoluzione Giornaliera), di 7 schede accordion parametriche e dello scrubber orario creava oltre 2.500px di scroll verticale ridondante.
2. **Dati Anemometrici Confliggenti o Indistinti nei Sub-Spot**: Selezionando un decollo o un atterraggio specifico, le schede mostravano metriche identiche. `computeParamMetrics` estraeva i dati orari esclusivamente da `weatherData.hourly` (stazione in quota del decollo), costringendo l'atterraggio a mostrare i 1000m di quota anziché la brezza di valle a 260m, e il decollo a mostrare schede di atterraggio spurie.

L'utente ha approvato l'approccio **Opzione A**:
- **Overview = Macro Sintesi Pulita** (Summary Card + Evoluzione Giornaliera + Briefing + Scrubber; zero schede accordion o toggle di modo).
- **Sub-Spot Specifico = Micro Analisi Mirata** (Decollo: 6 parametri di decollo; Atterraggio: 5 parametri di atterraggio con brezza di valle e cono di planata).

---

## 2. Decisioni Architetturali e Modifiche Implementate

### 2.1 Segregazione Visiva in `renderHtml`
- In modalità Panoramica (`this.selectedSubSpot === 'overview'`):
  - Viene renderizzata la Summary Card unificata con mini-mappa a maniche a vento disaccoppiate e quote/dislivello/efficienza.
  - Viene renderizzato il blocco delle Finestre di Volo (`renderFlightWindows`).
  - `.gm-forecast-mode-bar` e `#forecast-params-container` vengono rimossi/nascosti (`display: none;`), azzerando l'ingombro visivo.
- In modalità Sub-Spot specifico (`this.selectedSubSpot !== 'overview'`):
  - Viene renderizzata la `renderSpecificSpotCard` con dati e coordinate del punto selezionato.
  - Le Finestre di Volo vengono omesse.
  - Compare la barra di modo con intestazione contestuale `Aerologia Decollo` o `Aerologia Atterraggio`.
  - `#forecast-params-container` ospita le schede analitiche mirate o lo stack multi-trend dedicato.

### 2.2 Disaccoppiamento Metriche in `computeParamMetrics`
- Rilevazione del tipo di punto tramite `activeSubSpotObj.spotType === 'landing'`.
- Per l'atterraggio (`isLanding`):
  - Estrazione dei dati orari dalla sorgente `weatherData.landingWeather` (brezza e raffiche a quota suolo).
  - Generazione di 5 schede parametriche dedicate: `param-card-brezza-valle`, `param-card-raffiche`, `param-card-cono-planata`, `param-card-copertura`, `param-card-temperatura`.
  - In modalità "Solo Grafici", renderizzazione dello stack di grafici multi-trend: `multi-chart-wind` (Brezza valle), `multi-chart-landing` (Cono di planata), `multi-chart-cloudcover`, `multi-chart-precipitation`.
- Per il decollo (`!isLanding`):
  - Estrazione dei dati orari da `weatherData.hourly` (quota di decollo).
  - Generazione di 6 schede parametriche dedicate: `param-card-vento-decollo`, `param-card-raffiche`, `param-card-base-cumulo`, `param-card-instabilita`, `param-card-turbolenza`, `param-card-copertura`.
  - In modalità "Solo Grafici", rimozione di qualsiasi grafico o scheda di atterraggio spuria.

### 2.3 Aggiornamento Dinamico In-Place (`updateHourlyInPlace`)
- Aggiunta guardia su `selectedSubSpot`: se `'overview'`, `#forecast-params-container` viene svuotato e mantenuto nascosto con `paramsContainer.style.display = 'none'`.
- Se in Sub-Spot specifico, rigenerazione fluida a 60fps delle sole card o grafici del punto attivo.
- Aggiunte guardie difensive `if (paramsContainer.style)` per compatibilità completa sia con DOM reale che con mock di test headless.

---

## 3. Impatto e Verifica
- **Test Unitari**: `tests/ui/forecastView.test.mjs` (75/75 test passati).
- **Test Suite Completa**: `npm test` (753/753 test passati, 129 suite, 0 fallimenti).
- **Shift-Left Quality Gates**: Tutti i 5 Gate superati al 100%.
