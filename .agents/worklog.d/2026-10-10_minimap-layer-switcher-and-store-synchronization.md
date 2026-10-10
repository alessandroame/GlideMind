# Worklog: Selettore Layer Cartografici per la Mini Mappa di ForecastView

- **Data**: 2026-10-10
- **Autore**: AI Assistant (Antigravity)
- **Ambito**: Cartografia, Mini Mappa Previsioni, Gestione Stato, UI/UX

---

## Contesto e Requisiti

L'utente ha espresso la richiesta di poter selezionare il tipo di layer della mappa anche all'interno della Mini Mappa delle Previsioni (`ForecastView.js`), in analogia a quanto già implementato nella vista cartografica globale (`SpotMapView.js`):
- Necessità di commutare liberamente tra il rilievo topografico montano (Esri World Topo con curve di livello), le immagini satellitari ad alta risoluzione (Esri World Imagery), la vista cockpit scuro (Esri Dark Gray Canvas) e la mappa stradale OSM.
- Sincronizzazione persistente della preferenza tramite lo store reattivo (`store.ui.mapLayer`).

---

## Causa Radice

In precedenza, la Mini Mappa di `ForecastView.js` adottava esclusivamente un tile layer derivato passivamente dal tema globale dell'app (`dark` o `light`), priva di un controllo UI sovraimpresso e priva di listener su `change` per aggiornare il layer cartografico o persistere la scelta del pilota nello stato globale.

---

## Interventi Implementati

### 1. Controllo UI Sovraimpresso sulla Mini Mappa (`renderMiniMapBox` in `ForecastView.js`)
- Progettato e montato un componente `<select id="forecast-minimap-layer-select">` posizionato in `top: 8px; left: 8px; z-index: 10` direttamente sopra il canvas della mini-mappa.
- Stile compatto ad alto contrasto con backdrop glassmorphism (`.gm-mini-map-layer-select`), perfettamente integrato sia nel tema Dark Cockpit che in Sunlight Light Mode.
- 4 opzioni concise e ad ingombro ridotto:
  - `topo`: OpenTopo (OpenTopoMap con curve di livello 20m, SRTM e stile alpino IGM)
  - `satellite`: Satellite (Esri World Imagery)
  - `dark`: Scuro (Esri World Dark Gray Canvas)
  - `streets`: CyclOSM (Outdoor/Hiking/Trails cartografia specializzata per Hike & Fly)

### 2. Disaccoppiamento e Inizializzazione Layer nel Map Engine Adapter (`mapEngineAdapter.js`)
- Aggiornati i tile provider in `MAP_LAYERS`:
  - `topo`: endpoint `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png`, subdomains `'abc'`, `maxZoom: 19`, `maxNativeZoom: 17` (upscaling automatico senza errori 404).
  - `streets`: endpoint `https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png`, subdomains `'abc'`, `maxZoom: 19`, `maxNativeZoom: 18`.
- Aggiunta interattività al tocco sui marker di decollo e atterraggio nella mini-mappa con callback `onSelectSubSpot(subSpotId)` per consentire il cambio immediato di sub-spot con un tap sul pin.
- Aggiornato il costruttore di `HeadlessMockMapEngine` per memorizzare `options.layer` come `currentLayerId` iniziale con fallback sul tema.
- Aggiornato il costruttore di `LeafletMapEngine` per applicare `this.setLayer(this.options.layer)` quando fornito nelle opzioni di configurazione.

### 3. Sincronizzazione Reattiva Bi-Direzionale (`ForecastView.js`)
- Aggiunto `getActiveMapLayer()` nel controller per recuperare la preferenza `state.ui.mapLayer` o applicare il fallback semantico coerente con il tema attivo.
- Passato `layer: activeLayer` in `initMiniMap()` alla factory `createMapEngine`.
- Gestita la selezione in `handleChange(evt)`: all'evento `change` su `#forecast-minimap-layer-select`, invoca `this.miniMapEngine.setLayer(newLayer)` e aggiorna `store.setState({ ui: { ...ui, mapLayer: newLayer } })`.
- Aggiornato il listener di `store.subscribe`: allinea sincronicamente `this.miniMapEngine.setLayer(nextState.ui.mapLayer)` e il valore del select al variare dello stato globale.

---

## Verifiche e Test

- Aggiunti 2 nuovi test in `tests/ui/forecastView.test.mjs`:
  1. Verifica del rendering del selettore layer nella mini-mappa con tutte le 4 opzioni e marcatura `selected` coerente con lo stato.
  2. Verifica dell'aggiornamento reattivo di `miniMapEngine.currentLayerId` e della persistenza in `store.ui.mapLayer` sia su evento `change` che su mutazione dello store.
- Eseguito `npm test`: **400/400 test superati** su 58 suite senza errori o regressioni.
