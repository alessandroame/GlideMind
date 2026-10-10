# Architectural Decision Record (ADR): Fase 4-bis - Live Weather Ingestion & Cache Sync (Completamento)

- **Data**: 2026-10-09
- **Stato**: 🟢 Completato
- **Contesto**: Implementazione delle chiamate di rete reali a Open-Meteo per la fruizione di previsioni numeriche live (DWD ICON / ECMWF) nell'interfaccia utente con pattern Stale-While-Revalidate a 0ms e zero-blocking.

---

## 1. Obiettivi & Requisiti Realizzati

1. **Pattern Stale-While-Revalidate a 0ms**:
   - `ForecastView.js` e `HomeDashboardView.js` garantiscono un primo render istantaneo (<50ms nominali, zero spinner modali bloccanti) attingendo alla cache LRU in memoria o a dati sintetici deterministici.
   - In ambiente browser (`typeof window !== 'undefined'`), viene innescato un fetch asincrono in background verso le API reali di Open-Meteo.
2. **Multi-Coordinate Batch Ingestion (`fetchBatchComprensoriWeather`)**:
   - Per la dashboard principale (`HomeDashboardView`), tutte le coordinate dei comprensori caricati (35-50 località) vengono aggregate in un'unica richiesta HTTP (`latitude=lat1,lat2&longitude=lon1,lon2`).
   - Azzerato il rischio di rate limiting (HTTP 429) e ridotta la latenza a un unico roundtrip di rete.
3. **Arricchimento Termodinamico & Radiosondaggio**:
   - In `ForecastView`, il decollo primario riceve i 10 livelli isobarici (1000-500 hPa), consentendo il calcolo istantaneo di turbolenza EDR, ascendenza termica Deardorff ($w^*$) e quota del top termico (MSL/AGL).
4. **Indicatore Discreto di Stato Rete**:
   - Badge compatto (`.gm-live-badge`) non invasivo (Outdoor HMI standard) integrato nella testata di `ForecastView` e accanto al contatore comprensori in `HomeDashboardView`:
     - 🟢 `Live Open-Meteo`: previsioni numeriche aggiornate.
     - 🟡 `Aggiornamento...`: fetch in background attivo con micro-pulse CSS.
     - ⚪ `Offline / Stima`: modalità offline o fallback su dati storici/sintetici.
5. **Timestamp Prefix Resolution per Forecast Multi-Giorno**:
   - In `core/comprensorio.js`, l'indicizzazione delle serie orarie su orizzonti multi-giorno (192 ore) risolve la data corretta tramite matching esplicito `targetDate + 'T' + hour`.

---

## 2. Modifiche ai File

1. `core/comprensorio.js`:
   - Aggiunto parametro `targetDate` a `evaluateComprensorio`.
   - Risoluzione slot orari tramite `timePrefix`.
   - Tolleranza doppia convenzione nomi chiavi Open-Meteo (`windspeed_10m ?? wind_speed_10m`, `dewpoint_2m ?? dew_point_2m`).
   - Inclusione `dewPoint` nello snapshot meteo.
2. `core/openMeteoApi.js`:
   - Normalizzazione coordinate estesa a formati stringa (`"lat, lon"`).
   - Implementazione `fetchBatchComprensoriWeather(comprensori, options)`.
3. `css/theme.css`:
   - Definizione token e stili per `.gm-live-badge` (`.live`, `.loading`, `.offline`) e animazione `@keyframes gm-live-pulse`.
4. `ui/views/ForecastView.js`:
   - Implementazione `fetchWeatherDataAsync(spot, dateStr, forceRefresh)`.
   - Inserimento badge live con metodo `updateLiveStatusBadgeInDom()` per aggiornamenti in-place senza jank.
   - Gestione del flag `_networkFailed` e fallback `isStaleOfflineFallback`.
5. `ui/views/HomeDashboardView.js`:
   - Implementazione `fetchBatchWeatherAsync()` con batching coordinate.
   - Inserimento badge live discreto in Sezione 2 (Volabilità).
6. `tests/ui/liveWeatherDataIngestion.test.mjs`:
   - Suite completa con 7 test di validazione (0ms optimistic render, badge states, Stale-While-Revalidate, offline fallback, batching multi-coordinate, token CSS).

---

## 3. Validazione & Qualità

- **Test Suite**: 293 test passati su 293 (44 suite), 0 fallimenti.
- **Node.js Isolation**: Zero chiamate di rete non mockate in ambiente headless; esecuzione 100% deterministica in ~4.3s.
- **DESIDERATA.md**: Fase 4-bis marcata `🟢 Completato`.
- **MEMORY.md**: Registrata Lezione #39 su batching multi-coordinate, indicizzazione timestamp e resilienza offline.
