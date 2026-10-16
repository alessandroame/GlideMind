# 2026-10-16 - Fix Curva Copertura Nuvolosa Piatta al 25% nei Grafici Previsioni (`core/openMeteoApi.js`, `ui/views/ForecastView.js`)

## Contesto & Diagnosi (Root Cause Analysis)
Nella vista Previsioni (`ForecastView.js`), sia nei grafici singoli (`param-chart-cloud`) sia nella vista `Solo Grafici` (`multi-chart-instability`), la curva della **Copertura Nuvolosa** risultava sempre una linea orizzontale piatta al **25%** su tutte le ore diurne.

L'ispezione del flusso dati (`core/openMeteoApi.js` $\to$ `ui/views/ForecastView.js`) ha isolato tre cause concorrenti:
1. **Omissione di `cloudcover` in `DEFAULT_HOURLY_SURFACE_VARS` ([`core/openMeteoApi.js`](file:///c:/github/GlideMind/core/openMeteoApi.js))**:
   - L'array `DEFAULT_HOURLY_SURFACE_VARS` richiedeva a Open-Meteo `cloudcover_low`, `cloudcover_mid` e `cloudcover_high`, ma ometteva la variabile totale `cloudcover`.
   - Anche quando `fetchBatchComprensoriWeather` pre-popolava la cache con `cloudcover`, l'apertura di `ForecastView` invocava `fetchMultiLocationWeatherData`, che invalidava la cache batch per assenza dei dati termici (`hasThermalData: false`) e sovrascriveva il payload con quello di `DEFAULT_HOURLY_SURFACE_VARS` privo di `hourly.cloudcover`.
2. **Assenza di Fallback sui 3 Livelli Nuvolosi in `computeParamMetrics` ([`ui/views/ForecastView.js`](file:///c:/github/GlideMind/ui/views/ForecastView.js))**:
   - `computeParamMetrics` inizializzava `let cloudCover = 25;` e leggeva esclusivamente `hourlyData.cloudcover ?? hourlyData.cloud_cover`. Essendo `undefined`, non calcolava mai la copertura totale a partire da `cloudcover_low`, `cloudcover_mid` e `cloudcover_high`, lasciando l'intera serie oraria bloccata al valore di default `25%`.
3. **Serie Sintetiche Costanti in `generateSyntheticWeather` ([`core/openMeteoApi.js`](file:///c:/github/GlideMind/core/openMeteoApi.js))**:
   - Il generatore offline/fallback non includeva `hourly.cloudcover` e riempiva `cloudcover_low`/`mid`/`high` con array costanti (`15`, `10`, `20`).

## Decisioni Architetturali & Soluzione Applicata
1. **Inclusione di `cloudcover` e Sintesi Random-Overlap in [`core/openMeteoApi.js`](file:///c:/github/GlideMind/core/openMeteoApi.js)**:
   - Aggiunto `'cloudcover'` a `DEFAULT_HOURLY_SURFACE_VARS`.
   - Aggiornato `enrichWeatherData` affinché, qualora un payload parziale o in cache sia privo di `hourly.cloudcover`, lo sintetizzi da `cloud_cover` oppure combinando `cloudcover_low`, `cloudcover_mid` e `cloudcover_high` secondo la formula meteorologica di sovrapposizione casuale (random overlap):
     $$C_{\text{tot}} = \min\!\left(100,\; \text{round}\!\left(100 \cdot \left[1 - \left(1 - \frac{C_{\text{low}}}{100}\right)\left(1 - \frac{C_{\text{mid}}}{100}\right)\left(1 - \frac{C_{\text{high}}}{100}\right)\right]\right)\right)$$
   - Aggiornato `generateSyntheticWeather` per generare un ciclo diurno realistico di cumuli termici (`cloudcover`, `cloudcover_low`, `cloudcover_mid`, `cloudcover_high`) coerente con il ciclo sinottico multi-giorno.
2. **Fallback stratificato in `computeParamMetrics` ([`ui/views/ForecastView.js`](file:///c:/github/GlideMind/ui/views/ForecastView.js))**:
   - In `computeParamMetrics`, se `hourlyData.cloudcover ?? hourlyData.cloud_cover` non è disponibile all'indice orario `idx`, la copertura viene calcolata con random-overlap da `cloudcover_low`, `cloudcover_mid` e `cloudcover_high` prima di ricorrere al fallback statico `25`.

## Impatto & Verifica
- Aggiunti test di regressione in [`tests/core/openMeteoApi.test.mjs`](file:///c:/github/GlideMind/tests/core/openMeteoApi.test.mjs) e [`tests/ui/forecastView.test.mjs`](file:///c:/github/GlideMind/tests/ui/forecastView.test.mjs).
- Tutte le 140 suite (`832/832` test) passano a zero errori.
