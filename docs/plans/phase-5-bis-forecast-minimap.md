# Piano Architetturale: Integrazione Mini Mappa e Manica a Vento Vettoriale in ForecastView

> **Fase**: Fase 5-bis  
> **Stato**: 🟢 Completato  
> **Target Repo**: `GlideMind`  
> **Moduli Coinvolti**: `core/windsock.js`, `ui/map/mapEngineAdapter.js`, `ui/views/ForecastView.js`, `css/theme.css`

Questo documento definisce le specifiche tecniche, i contratti architetturali e i requisiti operativi per integrare la mini mappa contestuale e la manica a vento aerodinamica animata nella vista di previsione (`ForecastView.js`).

---

## 1. Obiettivo e Contesto di Dominio

Nel progetto legacy `ParaMeteo`, la scheda di dettaglio dello spot integrava una mini mappa Leaflet con una manica a vento vettoriale animata a 12 segmenti che rifletteva in tempo reale la direzione, intensità, raffiche e turbolenza calcolate da Open-Meteo per l'ora selezionata.

In GlideMind, la vista `ForecastView.js` possiede uno scrubber orario continuo (08:00 - 20:00) e indicatori numerici/grafici, ma era priva del riscontro visivo orografico immediato sul decollo. L'obiettivo completato è stato reintegrare questo componente mantenendo la separazione assoluta tra:
1. **Core Headless (`core/windsock.js`)**: calcolo cinematico puro, deformazione fisica aerodinamica ed emissione SVG string senza alcuna dipendenza DOM (conforme a Shift-Left Gate 1).
2. **Adapter Cartografico (`ui/map/mapEngineAdapter.js`)**: estensione del supporto per mini-mappe su `LeafletMapEngine` e `HeadlessMockMapEngine`, con marker `L.divIcon`, mutazione chirurgica del marker manica a vento e layout timing safe (`invalidateSize`).
3. **Controller UI (`ui/views/ForecastView.js`)**: separazione fisica dei contenitori DOM tra metriche testuali (`#forecast-spot-metrics-container`) e mappa persistente (`#forecast-mini-map-container`), prevenendo la distruzione di Leaflet durante lo scrubbing continuo (<50ms).
4. **Token Grafici & Animazioni Statiche (`css/theme.css`)**: regole `@keyframes` statiche parametrizzate da CSS Custom Properties per zero CSSOM churn a 60 FPS.

---

## 2. Architettura dei Componenti e Flusso Dati

```
+---------------------------------------------------------------------------------+
| UI Presentation (Browser Runtime)                                               |
| - ForecastView.js: scrubber orario (08:00 - 20:00)                              |
| - #forecast-spot-metrics-container: metriche testuali reattive                  |
| - #forecast-mini-map-container: contenitore Leaflet persistente                 |
| - mapEngineAdapter.js: Leaflet / HeadlessMock                                   |
| - Leaflet L.divIcon: marker vettoriale manica a vento                           |
+---------------------------------------------------------------------------------+
                                      ▲
                                      │ snapshot orario & CSS vars
                                      ▼
+---------------------------------------------------------------------------------+
| Core Headless (Pure Node.js)                                                    |
| - core/windsock.js: cinematica, inclinazione droop, whip-wave, SVG generator    |
| - core/comprensorio.js: binomio decollo-atterraggio e planata richiesta         |
| - core/openMeteoApi.js: quote di pressione e vento reale                        |
+---------------------------------------------------------------------------------+
```

---

## 3. Specifiche Tecniche Dettagliate

### 3.1. Modulo Core Headless: `core/windsock.js`
- **Isolamento Headless Assoluto**: zero dipendenze da `window`, `document`, `HTMLElement`, `querySelector` o `Canvas`. 100% testabile ed eseguibile in ambiente Node.js puro (`Shift-Left Gate 1`).
- **Parametri Fisici di Ingresso**:
  - `speed` (number, km/h): velocità nominale del vento a quota decollo (o al suolo per atterraggio).
  - `gust` (number, km/h): velocità massima delle raffiche.
  - `direction` (number, deg $0..360$): azimut di provenienza del vento (la manica si orienta a $\text{direction} + 180^\circ$).
  - `turbulence` (number, $0..1$): coefficiente di turbolenza/EDR derivato da sounding termodinamico.
  - `options` (object): opzioni accessorie (scala grafica, classe CSS di prefisso).
- **Funzioni Esportate**:
  - `calculateWindsockKinematics(speed, gust, direction, turbulence)`:
    - Angolo Base Puntatore: $\theta_{\text{pointing}} = (\text{direction} + 180) \bmod 360$.
    - Inclinazione Droop (Gravità vs Portanza): da floscia ($90^\circ$) a orizzontale ($0^\circ$).
    - Frequenza e Periodo di Oscillazione (Flutter).
    - Ampiezza Angolare di Oscillazione (Whip Wave).
    - Allungamento Longitudinale (Scale Factor).
  - `generateWindsockSvg(speed, gust, direction, turbulence, options)`:
    - Restituisce la stringa SVG pura dei 12 segmenti articolati a bande alternate e del terminale di scarico con CSS Custom Properties.

### 3.2. Estensione Map Engine Adapter: `ui/map/mapEngineAdapter.js`
- `renderSpotMiniMap(containerEl, spotData, options)`
- `updateWindsockMarker(weatherSnapshot, isLanding = false)`
- `updateGlideLine(glideMetrics)`
- `setTheme(theme)` / micro-capsule frosted glass adattive
