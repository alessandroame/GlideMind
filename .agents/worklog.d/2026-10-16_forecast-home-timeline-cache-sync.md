# 2026-10-16 - Allineamento Cache Multi-Chiave e Timeline Meteo tra Home e Previsioni

## Contesto e Segnalazione Utente
L'utente ha segnalato che, selezionando il comprensorio `Chialamberto` per `Domenica 18 Ottobre`:
1. Nella vista `HomeDashboardView` tutte le ore della timeline diurna risultavano `Non Volabile` (rosse), mentre entrando in `ForecastView` comparivano slot verdi/gialli nella `Timeline Volabilità` e in `Evoluzione Giornaliera`.
2. In particolare, l'utente ha osservato che in `ForecastView` il pallino del giorno `Dom 18 Ott` e il verdetto erano `Non Volabile`, ma la `Timeline Volabilità` sottostante continuava a mostrare ore verdi e gialle (*"forse solo la timeline è sbagliata"*).

## Analisi delle Cause Radice (RCA)
1. **Stale Synthetic Cache sulla Chiave Composita (`ForecastView.js`)**:
   - Al primo render sincrono a `0ms` di `ForecastView`, `getWeatherData()` genera un payload sintetico (`isSynthetic: true`) e lo memorizza sia sotto `baseKey` (`${spot.id}_${dateStr}`) sia sotto `compositeKey` (`${spot.id}_${takeoff.id}_${landing.id}_${dateStr}`).
   - Quando `fetchWeatherDataAsync()` completava il download reale da Open-Meteo (dove Domenica 18 Ottobre aveva pioggia `1.4 mm` tutto il giorno), aggiornava `state.weatherData` e `baseKey`, ma **non invalidava né aggiornava `compositeKey`**.
   - Di conseguenza:
     - `getMultiDayFlyability()` leggeva `state.weatherData` (reale, con pioggia) $\to$ pallino **Rosso** su `Dom 18 Ott`.
     - `getWeatherData()` continuava a colpire `this.weatherCache.get(compositeKey)` restituendo il **meteo sintetico iniziale** (sereno al mattino e alla sera, vento forte alle `15:00`), lasciando la `Timeline Volabilità` e `Evoluzione Giornaliera` disallineate rispetto ai dati live.
2. **Inquinamento di `landingWeather` Sintetico su Payload Reali (`ensureLandingWeather` in `ForecastView.js`)**:
   - Quando un payload meteo reale non aveva ancora in cache un `landingWeather` separato per la data target, `ensureLandingWeather` attaccava un `landingWeather` sintetico (`generateSyntheticWeatherData`), le cui raffiche pomeridiane fisse (`26 km/h`) degradavano erroneamente a `NON VOLABILE` anche giornate reali a vento calmo.
3. **Nome Proprietà Vento e Allineamento Timeline Diurna (`HomeDashboardView.js`)**:
   - In `getEvaluatedComprensori`, il controllo di validità del meteo usava `spotWeather.hourly?.wind_speed_10m` anziché `windspeed_10m ?? wind_speed_10m`, impedendo il ricalcolo dell'allineamento tra il badge della card e la `buildDiurnalTimeline` sui payload Open-Meteo reali e omettendo `takeoffId: activeTakeoffId`.
4. **Calcolo Giorni Multi-Day in `fetchBatchComprensoriWeather` (`core/openMeteoApi.js` & `HomeDashboardView.js`)**:
   - Il calcolo di `forecastDays` con `new Date(dateStr)` (mezzanotte UTC) poteva sottostimare di 1 giorno l'orizzonte richiesto in fuso locale (`Europe/Rome`), e `fetchBatchWeatherAsync` popolava solo la chiave della data attiva anziché tutte le date presenti nel payload multi-day.

## Interventi Eseguiti
- **[`ui/views/ForecastView.js`](file:///c:/github/GlideMind/ui/views/ForecastView.js)**:
  - In `fetchWeatherDataAsync`: rimozione di tutte le entry `isSynthetic` o obsolete con prefisso `${spot.id}_` e suffisso `_${dStr}` e scrittura sincronizzata sia su `baseKey` sia su `compositeKey`.
  - In `getWeatherData`: priorità ai payload reali (`!isSynthetic`) rispetto ai fallback sintetici a `0ms` e verifica esplicita che `state.weatherData` copra `dateStr` (`coversTargetDate`).
  - In `ensureLandingWeather`: inibita l'iniezione di `landingWeather` sintetico dentro un payload `mainWeather` reale (`!mainWeather.isSynthetic`).
- **[`ui/views/HomeDashboardView.js`](file:///c:/github/GlideMind/ui/views/HomeDashboardView.js)**:
  - Supporto sia a `windspeed_10m` sia a `wind_speed_10m` in `getEvaluatedComprensori`, passaggio di `takeoffId: activeTakeoffId` a `evaluateComprensorio`, popolamento multi-day di `this.weatherCache` in `fetchBatchWeatherAsync` e fallback alla cache condivisa `getCachedWeatherData`.
- **[`core/openMeteoApi.js`](file:///c:/github/GlideMind/core/openMeteoApi.js)**:
  - Calcolo di `forecastDays` in ora locale (minimo `3` giorni) in `fetchBatchComprensoriWeather` e popolamento di `defaultWeatherCache` per tutte le date restituite nel payload orario.
- **[`tests/ui/forecastView.test.mjs`](file:///c:/github/GlideMind/tests/ui/forecastView.test.mjs) & [`tests/ui/homeDashboardView.test.mjs`](file:///c:/github/GlideMind/tests/ui/homeDashboardView.test.mjs)**:
  - Aggiunti test di regressione che verificano la sovrascrittura della cache sintetica sulla chiave composita e la coerenza tra `HomeDashboardView` e `ForecastView`.
