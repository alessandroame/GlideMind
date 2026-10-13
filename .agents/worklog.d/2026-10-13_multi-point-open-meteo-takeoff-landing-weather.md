# Worklog: Campionamento Meteo Multi-Punto Open-Meteo (Decollo vs Atterraggio) e Disaccoppiamento Maniche a Vento

- **Data**: 2026-10-13
- **Ambito**: `core/openMeteoApi.js`, `core/comprensorio.js`, `ui/views/ForecastView.js`, `ui/map/mapEngineAdapter.js`, `tests/core/openMeteoApi.test.mjs`, `tests/core/comprensorio.test.mjs`
- **Oggetto**: Disaccoppiamento meteorologico tra decollo e atterraggio tramite query multi-location a Open-Meteo, modellazione di strato limite e rotazione brezza per atterraggio, e alimentazione differenziata delle maniche a vento e dei circuiti di atterraggio.

---

## 1. Contesto & Diagnosi

L'utente ha sollevato l'anomalia per cui le maniche a vento di decollo e atterraggio (nella mini-mappa e nell'overlay analitico del comprensorio) mostravano sempre la stessa identica direzione e intensità del vento.

Dall'ispezione della catena dati è emerso che:
1. `ForecastViewController.fetchWeatherDataAsync` richiedeva i dati meteo Open-Meteo unicamente per le coordinate del decollo attivo (`takeoff.coordinates`), omettendo le coordinate dell'atterraggio.
2. `core/comprensorio.js` (`evaluateComprensorio`) riceveva un unico oggetto `weatherData` e restituiva un solo `weatherSnapshot` condiviso.
3. In `ForecastView.js`, sia `takeoffWeather` sia `landingWeather` puntavano a `evalData.weatherSnapshot`.
4. Di conseguenza, i metodi cartografici `renderComprensorioFlightMap` e `updateFlightProcedures` ricevevano identici valori `tDir` e `lDir`, facendo ruotare le due maniche a vento all'unisono.

---

## 2. Decisioni Architetturali & Modifiche

### 2.1 Ingestione Multi-Punto in `core/openMeteoApi.js`
- **Riconoscimento e Normalizzazione Coordinate**: Aggiunte `isCoordinateList(coords)` e `normalizeCoordinateList(coords)` che accettano array di coordinate `[{lat, lon, elev, role}]`, tuple `[[lat, lon, elev]]` o mappe semantiche `{ takeoff, landing }`, supportando alias `elevation`, `altitude` ed `elev`.
- **Query URL Multi-Location**: Aggiornata `buildForecastUrl` per formattare coordinate e quote separate da virgola (es. `latitude=45.83,45.80&longitude=9.30,9.32&elevation=1200,300`), nativamente supportate da Open-Meteo con un array JSON di risposte.
- **Client Headless Multi-Punto (`fetchMultiLocationWeatherData`)**:
  - Supporto per esecuzione offline e test Node.js tramite mock multi-punto.
  - Caching granulare per singolo punto in `InMemoryCache`: ogni location viene memorizzata con la propria chiave geografica, consentendo il riutilizzo incrociato tra richieste singole e comprensoriali.
  - Esecuzione resiliente con backoff esponenziale HTTP 429 e fallback trasparente su modello globale `best_match`.
  - Struttura del payload arricchito: proprietà primarie backward-compatible ereditate dal decollo (punto 0), con campi espliciti `points: [...]`, `takeoffWeather` e `landingWeather`.
- **Modellazione Fisica Sintetica (`generateSyntheticWeather`)**:
  - Introdotto flag `isLanding`: applica fisica realistica di strato limite al suolo vallivo (riduzione del vento del 25%, rotazione direzionale di +25° per flusso di valle, e gradiente termico adiabatico per la quota).

### 2.2 Valutazione Comprensorio in `core/comprensorio.js`
- `evaluateComprensorio` estrae `landingWeather` specifico da `weatherData.landingWeather` o `weatherData.points[1]` per l'ora attiva.
- Restituisce snapshot orari distinti: `takeoffWeather` e `landingWeather`, preservando `weatherSnapshot: takeoffWeather` per retrocompatibilità.

### 2.3 Visualizzazione e Mappe in `ui/views/ForecastView.js` e `ui/map/mapEngineAdapter.js`
- `fetchWeatherDataAsync`: raccoglie le coordinate del decollo attivo e dell'atterraggio attivo e le invia come array `[takeoffCoords, landingCoords]`.
- `getWeatherData`: genera fallback sintetico sia per il decollo sia per l'atterraggio per caricamento istantaneo a 0ms offline.
- `computeParamMetrics`: estrae velocità, raffica e direzione reale dell'atterraggio dai dati orari dell'atterraggio (`landingWeatherSource.hourly`) anziché ricorrere all'euristica statica `0.75 * speed`.
- `setHour`: passa `evaluated.landingWeather` a `miniMapEngine.updateWindsockMarker` quando il sub-spot selezionato è l'atterraggio.
- `HeadlessMockMapEngine`: memorizza `takeoffWeather` e `landingWeather` su `renderComprensorioFlightMap` e `updateFlightProcedures`.

---

## 3. Verifica & Test

- **Test Unitari Open-Meteo**: `tests/core/openMeteoApi.test.mjs` arricchito con 6 nuovi test (normalizzazione liste di coordinate, costruzione URL multi-punto, risposta mock a 2 punti, parsing risposte di rete).
- **Test Comprensorio**: `tests/core/comprensorio.test.mjs` arricchito con test suite dedicata per verificare l'estrazione di `takeoffWeather` e `landingWeather` disaccoppiati e fallback sicuri.
- **Suite Globale**: Eseguito `npm test` su tutti i 732 test del repository (126 suite): **731 passati, 1 ignorato, 0 falliti**.
