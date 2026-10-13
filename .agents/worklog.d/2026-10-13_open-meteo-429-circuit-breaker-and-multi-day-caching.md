# Worklog: Risoluzione Tempesta HTTP 429 Open-Meteo, Circuit Breaker e Multi-Day Cache

- **Data**: 2026-10-13
- **Autore**: Antigravity Pair Programmer
- **Stato**: Completato
- **Ambito**: Weather API & Forecasting Engine (`core/openMeteoApi.js`, `ui/views/ForecastView.js`, `css/theme.css`, `tests/`)

## 1. Contesto & Diagnosi Root Cause (RCA)
Durante l'uso dell'applicazione (specialmente al cambio rapido di date o al caricamento iniziale della vista previsioni `ForecastView`), la console registrava ripetute sequenze di errori critici `HTTP 429 (Too Many Requests)` verso l'endpoint `https://api.open-meteo.com/v1/forecast`:
- **RCA 1 (Assenza di In-Flight Deduplication / Pooling)**: Se l'utente cliccava più volte la barra delle date o se il ciclo di montaggio del router lanciava richieste simultanee, venivano generate multiple chiamate di rete identiche in parallelo, bruciando istantaneamente il rate limit Open-Meteo per minuto.
- **RCA 2 (Spreco Multi-Day Forecast)**: Open-Meteo restituisce di default 8 giorni di previsioni orarie (`start_date` a `end_date`), ma il client memorizzava in cache solo la specifica `targetDate`. Ogni click sui tab data successivi ("Domani", "Dopodomani") provocava un cache-miss totale e una nuova costosa chiamata HTTP.
- **RCA 3 (Loop di Retry Aggressivo su 429)**: Il meccanismo di retry rieseguiva il fetch dopo soli 500ms. A fronte di un blocco quota per minuto su Open-Meteo, tutti i retry fallivano sistematicamente e moltiplicavano il carico di richieste.
- **RCA 4 (Assenza di Circuit Breaker)**: Nessun meccanismo intercettava il 429 per sospendere le chiamate di rete. Successivi click continuavano a martellare l'API esterna senza concedere la finestra di cooldown.

## 2. Soluzione Ingegneristica & Architettura

### A. Pooling di Richieste In-Flight (`core/openMeteoApi.js`)
- Implementato `fetchWithDeduplication(url, fetchFn)`: gestisce una Map `inFlightRequests` indicizzata dall'URL canonico.
- Se una richiesta per lo stesso URL è già in corso, tutte le chiamate concorrenti condividono la medesima `Promise`, azzerando i duplicati a livello di rete.

### B. Popolazione Multi-Day della Cache (`core/openMeteoApi.js`)
- Nei metodi `fetchMultiLocationWeatherData` e `fetchWeatherData`, quando l'API restituisce il blocco orario esteso (8 giorni), il payload viene scansionato per estrarre tutte le date distinte `YYYY-MM-DD`.
- Il dizionario meteo arricchito viene memorizzato per ciascuna data in `weatherCache`.
- Il cambio data sui tab della barra previsioni diventa un'operazione istantanea ($0\text{ms}$) a zero impatto di rete.

### C. Rate Limit Cooldown & Circuit Breaker (`core/openMeteoApi.js`)
- Aggiunto stato reattivo del circuit breaker: `rateLimitCooldownUntil`, `rateLimitReason`, con getter `getRateLimitStatus()`, reset `resetRateLimitCooldown()` e conteggio `getInFlightRequestsCount()`.
- Se si riceve un HTTP 429 (dopo backoff esponenziale o header `Retry-After`), il circuit breaker entra in cooldown (predefinito 60s).
- All'ingresso di qualsiasi fetch meteo, se il cooldown è attivo, la chiamata di rete viene bypassata immediatamente: viene servito il dato memorizzato in cache (anche se stale) oppure il fallback sintetico arricchito con `isRateLimited: true, isSynthetic: true`.

### D. Guardia View & Badge di Stato (`ui/views/ForecastView.js`, `css/theme.css`)
- In `ForecastView.fetchWeatherDataAsync`:
  - Aggiunta guardia di deduplicazione in-flight sul componente (`activeFetchPromise`, `activeFetchKey`).
  - Prevenzione click ridondanti sul tab data già attiva in `handleClick` (`select-date`, `apply-custom-date`, `pick-calendar-date`).
- In `renderLiveWeatherBadge`:
  - Se `enriched.isRateLimited` è true, lo stato di rete commuta a `'rate_limit'`, visualizzando il badge compatto ad alto contrasto: `<span class="gm-live-badge rate-limit">Quota API (429)</span>`.
  - Stile dedicato aggiunto in `css/theme.css` con colore ambra di avviso conforme al design system.

## 3. Validazione Automatizzata
- `tests/core/openMeteoApi.test.mjs`:
  - Testato in-flight Promise pooling (4 chiamate concorrenti $\to$ 1 sola chiamata di rete).
  - Testata popolazione cache multi-day (1 chiamata $\to$ 8 date servite a 0ms senza rete).
  - Testato circuit breaker: all'attivazione del 429, successive chiamate ritornano `isRateLimited: true` senza toccare la rete.
- `tests/ui/liveWeatherDataIngestion.test.mjs`:
  - Verificato rendering badge `Quota API (429)` in caso di rate limit.
  - Verificata deduplicazione delle chiamate asincrone in `ForecastView`.
- Suite globale:
  - `npm test`: 780 test passati, 132 suite, 0 fallimenti, 0 regressioni.
