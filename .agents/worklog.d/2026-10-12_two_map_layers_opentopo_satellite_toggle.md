# Worklog: Unificazione Cartografia Mappe sui Due Layer OpenTopo e Satellite con Controllo Toggle Iconico

**Data**: 2026-10-12  
**Autore**: Antigravity  
**Ambito**: Cartografia, Map Controls, Ergonomia Outdoor (HMI)

---

## 1. Contesto & Obiettivo
In conformità alla richiesta utente ("su tutte le mappe voglio solo i due layer opentopo e satellite e voglio che il controllo sia un toggle con due icone diverse in base al layer"), tutti i controlli mappa dell'applicazione sono stati razionalizzati:
1. Riduzione della matrice dei layer cartografici a soli due layer canonici:
   - `topo`: **OpenTopo** (curve di livello a 20m, toponomastica orografica e quote altimetriche).
   - `satellite`: **Satellite** (ortofoto HD Esri World Imagery per ispezione fotografica di creste e decolli).
   - Rimozione dei layer ridondanti `dark` e `streets` (CyclOSM) da tutte le viste e motori.
2. Sostituzione dei vecchi selettori a tendina (`<select>`) con controlli a pulsante singolo **Toggle ad alta ergonomia**, che alternano istantaneamente tra OpenTopo e Satellite.
3. Adozione di due icone SVG funzionali distinte e auto-esplicative:
   - **OpenTopo**: Icona montagna con curva di livello orografica (`renderLayerToggleIcon('topo')`).
   - **Satellite**: Icona satellite con pannelli solari e vettore radio (`renderLayerToggleIcon('satellite')`).

---

## 2. Componenti e Mappe Aggiornate

### A. Adattatore Cartografico & Iconografia (`ui/map/mapEngineAdapter.js`)
- `MAP_LAYERS`: Ristretto esclusivamente a `satellite` e `topo`.
- `MAP_THEMES`: Mappato a `dark: MAP_LAYERS.satellite` e `light: MAP_LAYERS.topo`.
- Introdotte ed esportate le funzioni pure condivise:
  - `renderLayerToggleIcon(layerId, size = 16)`: Genera il markup SVG vettoriale pulito privo di emoji e privo di dipendenze runtime.
  - `getNextMapLayer(currentLayer)`: Risolve il layer opposto per il ciclo toggle binario.
  - `getMapLayerLabel(layerId)`: Restituisce l'etichetta localizzata (`'OpenTopo'` / `'Satellite'`).

### B. Mappa Comprensori Principale (`ui/views/SpotMapView.js`)
- Rimosso il selettore `#gm-map-layer-select`.
- Inserito il controllo toggle unificato `#gm-map-layer-toggle` con classe `.gm-map-ctrl-btn.gm-map-layer-toggle`.
- Implementato `updateLayerToggleUi()` per la sincronizzazione reattiva dello stato visivo con il reactive store `ui.mapLayer`.

### C. Mini-Mappa e Overlay Analisi di Volo (`ui/views/ForecastView.js`)
- Mini-mappa di testata: Sostituito `#forecast-minimap-layer-select` con il micro-capsule toggle `#forecast-minimap-layer-toggle`.
- Overlay 100dvh di analisi volo: Sostituita la select con `#forecast-flight-analysis-layer-toggle`.
- Aggiunti i metodi reattivi `updateMiniMapToggleUi(newLayer)` e `updateFlightAnalysisToggleUi(newLayer)`.

### D. Replay Traccia 3D (`ui/views/FlightReplayView.js`)
- Sostituito il dropdown `#gm-replay-layer-select` con `#gm-replay-layer-toggle`.
- Integrata la sincronizzazione bidirezionale con lo store `ui.mapLayer` e il motore 3D `MapLibreThreeEngine.setMapLayer()`.

### E. Impostazioni & Preferenze Sistema (`ui/views/SettingsView.js`)
- `SETTINGS_MAP_LAYERS`: Ristretto a soli `topo` e `satellite`.
- `getActiveMapLayer()` e `setMapLayer()`: Normalizzazione reattiva e salvataggio persistente in `storageAdapter`.

### F. Single Source of Truth (`core/store.js`)
- `DEFAULT_INITIAL_STATE.ui.mapLayer` impostato a `'topo'`.
- Sanitizzazione automatica in `loadPersistedState()`: se il layer memorizzato in sessioni passate è `dark` o `streets`, viene automaticamente sanificato a `'topo'`.

### G. Design System & CSS (`css/theme.css`)
- Dichiarati gli stili per `.gm-map-layer-toggle`, `.gm-mini-map-layer-toggle`, `.gm-replay-layer-toggle`, `.gm-layer-icon`, `.gm-layer-toggle-label`.
- Preservato il pavimento ergonomico di tocco $\ge 48\times 48\text{px}$ tramite pseudo-elemento invisibile `::before`.
- Garantito il supporto dual-theme Dark/Light con contrasto WCAG 2.1 AA.

---

## 3. Verifica e Governance
- Suite di test aggiornate:
  - `tests/ui/spotMapView.test.mjs`
  - `tests/ui/forecastView.test.mjs`
  - `tests/ui/settingsView.test.mjs`
  - `tests/ui/mapLibreThreeEngine.test.mjs`
- Test suite globale (`npm test`): **119 suite eseguite, 686 test superati, 0 fallimenti**.
