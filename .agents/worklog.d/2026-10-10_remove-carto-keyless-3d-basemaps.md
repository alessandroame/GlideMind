# Scheda Intervento: Eliminazione Watermark "API KEY REQUIRED" nel Rendering 3D e Selettore Multi-Layer Keyless

- **Data**: 2026-10-10
- **Autore**: Alessandro Amè & Pair Programmer
- **Tipo**: Bug Fix / Cartografia 3D / Resilienza Basemap / UI Replay
- **Stato**: Completato

---

## 1. Contesto & Diagnosi

L'utente ha segnalato la presenza di un watermark fastidioso sul terreno 3D durante la riproduzione del volo:
*"Nel rendering 3d vedo alle Key required"*

### Causa Radice:
1. **Politica di Autenticazione CARTO**: A partire da settembre 2025/2026, CARTO ha reso obbligatoria la chiave API su tutti gli endpoint raster di `basemaps.cartocdn.com` (`dark_all`, `rastertiles/voyager`), restituendo tile degradate con filigrana diagonale *"API KEY REQUIRED"* su qualsiasi richiesta anonima priva di parametro `api_key`.
2. **Hardcoding CARTO in `MapLibreThreeEngine.js`**: In `ui/3d/MapLibreThreeEngine.js` (righe 160–168), lo stile MapLibre predefinito utilizzava `https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`. Poiché GlideMind adotta di default il tema Dark Cockpit, ogni sessione di 3D Flight Replay richiedeva tile a CARTO, mostrando il watermark sovraimpresso al DEM Terrarium.
3. **Mancanza di Selettore Layer nel Replay 3D**: La vista `FlightReplayView` non esponeva controlli per selezionare basemap alternativi (Satellite, Topo, Streets) e non leggeva `store.getState().ui?.mapLayer`, a differenza delle viste 2D (`ForecastView` e `SpotMapView`).

---

## 2. Azioni Eseguite

1. **Definizione e Adozione dei Basemap Raster Keyless (`ui/3d/MapLibreThreeEngine.js`)**:
   - Definito e reso pubblico l'oggetto `BASEMAP_LAYERS_3D` con 4 configurazioni ad alta affidabilità su CDN globali prive di autenticazione:
     - `dark`: Esri World Dark Gray Base (`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`)
     - `satellite`: Esri World Imagery (`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`)
     - `topo`: OpenTopoMap (`https://a.tile.opentopomap.org/{z}/{x}/{y}.png`)
     - `streets`: OpenStreetMap (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`)
   - Eliminato qualsiasi riferimento a domini `cartocdn.com` nel motore 3D.
   - Accettato `options.mapLayer` nel costruttore per inizializzare dinamicamente lo stile di MapLibre con la configurazione scelta.
   - Implementato il metodo `setMapLayer(layerId)` con preservazione dei layer Three.js e MapLibre custom (`threejs-flight-layer`, `terrain-source`).

2. **Integrazione Selettore Layer in `FlightReplayView.js`**:
   - Inizializzato `this.activeLayer` sincronizzandolo con `store.getState().ui?.mapLayer || 'dark'`.
   - Inserito il dropdown compatto `#gm-replay-layer-select` nella barra in alto a destra (`.gm-replay-top-right`) a fianco dei controlli della telecamera.
   - Collegato l'evento `change` a `handleLayerChange(layerId)` per aggiornare contestualmente `this.engine.setMapLayer(layerId)` e persistere su `store.setState({ ui: { ...ui, mapLayer: layerId } })`.
   - Bonificato il ciclo di vita in `unmount()` con rimozione ordinata dei listener.

3. **Stilizzazione Frosted Glass Avionica (`css/theme.css`)**:
   - Definite le classi `.gm-replay-top-right`, `.gm-replay-layer-wrap` e `.gm-replay-layer-select`.
   - Aspetto visivo compatto con sfumatura semitrasparente ad alto contrasto, bordo sottile, padding ergonomico e chevron SVG integrato.

4. **Suite di Test Unitari e di Regressione (`tests/ui/mapLibreThreeEngine.test.mjs`)**:
   - Aggiunto test che verifica che tutti i 4 layer in `BASEMAP_LAYERS_3D` siano privi di token `cartocdn.com` e non richiedano chiavi (`key=`, `token=`).
   - Aggiunto test per la commutazione dinamica del layer tramite `setMapLayer()`.

---

## 3. Risultati della Verifica

- **Test Suite 3D Engine**: 12/12 passati in `tests/ui/mapLibreThreeEngine.test.mjs`.
- **Test Suite Globale**: 630/630 test passati su 107 suite native (`npm test`). Zero errori o warning.
- **Watermark Eliminato**: I tile serviti da Esri ArcGIS Online e OpenTopoMap sono 100% puliti da qualsiasi filigrana.
- **Registrata Lezione #113 in MEMORY.md**: Standard di eliminazione dei tile server con API key mandatorie e selettore multi-layer per motori 3D.
