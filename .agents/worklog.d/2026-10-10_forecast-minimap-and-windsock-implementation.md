# Scheda Intervento: Integrazione Mini Mappa & Manica a Vento Vettoriale

- **Data**: 2026-10-10
- **Modulo**: Core Headless (`core/windsock.js`), Adapter Cartografico (`ui/map/mapEngineAdapter.js`), Controller Previsioni (`ui/views/ForecastView.js`), Stili (`css/theme.css`), Test (`tests/core/windsock.test.mjs`, `tests/ui/forecastView.test.mjs`)
- **Stato**: 🟢 Completato

---

## 1. Contesto & Obiettivo
A valle dell'audit architetturale su `docs/FORECAST_MINIMAP_AND_WINDSOCK_PLAN.md`, è stata implementata la mini-mappa orografica contestuale con la manica a vento aerodinamica a 12 segmenti nella scheda spot di `ForecastView.js`. L'obiettivo era garantire un feedback visivo immediato a colpo d'occhio sul decollo e sull'atterraggio, con aggiornamento a 60 FPS durante lo scrubbing orario continuo (08:00 - 20:00), eliminando ogni rischio di layout thrashing, flickering dei tile o distruzione del DOM Leaflet.

---

## 2. Decisioni Architetturali & Modifiche Eseguite

1. **Modulo Headless Puro `core/windsock.js` (Conforme a Shift-Left Gate 1)**:
   - Implementazione della cinematica dei 12 segmenti articolati a bande alternate (Rosso/Arancione avionico `#ef4444` e Bianco `#ffffff`).
   - Calcolo della frequenza di oscillazione (flutter period), ampiezza angolare d'imbardata (whip wave), allungamento dinamico sotto raffica (`stretchScale`) e classificazione aeronautica per l'inviluppo EN-A (`getWindsockElevationStage`).
   - Generazione di markup SVG puro con CSS Custom Properties e animazioni scoped.
   - Zero riferimenti a nodi DOM, `window`, `document` o `HTMLElement`.

2. **Estensione Adapter Cartografico (`ui/map/mapEngineAdapter.js`)**:
   - Aggiunta di `renderSpotMiniMap(containerEl, spotData, options)` sia su `LeafletMapEngine` sia su `HeadlessMockMapEngine`.
   - Disattivazione di tutte le interazioni touch parassite (`dragging: false`, `touchZoom: false`, `scrollWheelZoom: false`, ecc.) per prevenire il blocco dello scroll verticale mobile.
   - Metodi di mutazione chirurgica a 0ms `updateWindsockMarker(weatherSnapshot, isLanding)` e `updateGlideLine(glideMetrics)`.
   - Salvaguardia `invalidateSize()` con `requestAnimationFrame` per evitare tile grigie o dimensioni non computate.
   - Pulizia rigorosa delle istanze in `destroy()`.

3. **Disaccoppiamento Strutturale DOM in `ui/views/ForecastView.js`**:
   - Suddivisione della card dello spot in due sub-container: `#forecast-spot-metrics-container` (aggiornato via `innerHTML`) e `#forecast-mini-map-container` (persistente).
   - In `setHour(hour)`: aggiornamento esclusivo del contenitore metriche e mutazione reattiva della manica a vento tramite l'adapter, preservando l'istanza Leaflet senza ricreare il DOM.
   - Supporto all'azione 1-tap `open-full-map` per espandere lo spot sulla mappa globale (`#map?spot=...`).
   - Sincronizzazione reattiva del tema tile (`dark` vs `light`) via `store.subscribe`.

4. **Token Grafici e Regole CSS (`css/theme.css`)**:
   - Dichiarazione di `.gm-mini-map-box` con altezza fissa 170px su mobile, `touch-action: pan-y`, e layout split a 2 colonne su desktop (`@media (min-width: 768px)`).
   - Stili del pulsante d'angolo `⤢` conforme al floor Fitts di 44x44px con supporto al doppio tema ad alto contrasto.

---

## 3. Verifiche & Risultati Test
- **Unit test dedicati `tests/core/windsock.test.mjs`**: 100% passati (5/5 suite, 11 asserzioni su cinematica, angoli, tapering e SVG).
- **Quality Gate `tests/ui/shiftLeftGovernance.test.mjs`**: 100% superato (Gate 1 verifica zero DOM in `core/`).
- **Integration test `tests/ui/forecastView.test.mjs`**: 100% passati (33/33 test, inclusa verifica preservazione istanza miniMapEngine in `setHour`).
- **Regressione Globale**: `npm test` eseguito con successo su tutte le 57 suite (393/393 test passati, 0 fallimenti).
