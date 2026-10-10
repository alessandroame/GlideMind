# Correzione Cambio Layer Cartografico e Disaccoppiamento Tema (Anti-Reset)

- **Data**: 2026-10-10
- **Autore**: Alessandro Amé
- **Ambito**: Cartografia, UI Shell, State Management (`ui/views/SpotMapView.js`, `ui/views/ForecastView.js`, `ui/map/mapEngineAdapter.js`, `tests/ui/spotMapView.test.mjs`)

---

## 1. Diagnosi dell'Anomalia e Root Cause Analysis (RCA)

L'utente ha segnalato che alla selezione di un layer alternativo (es. OpenTopo, Satellite, CyclOSM) dal selettore flottante `#gm-map-layer-select`, la mappa non aggiornava le tile cartografiche rimanendo bloccata sul layer `Scuro` (CartoDB Dark).

### Catena Causale
1. L'evento `change` sul `<select id="gm-map-layer-select">` invocava correttamente:
   - `this.activeLayer = newLayer;`
   - `this.mapEngine.setLayer(newLayer);`
   - `store.setState({ ui: { ...ui, mapLayer: newLayer } });`
2. L'invocazione di `store.setState()` notificava tutti i subscriber dello store.
3. Nel subscriber di `SpotMapView`, il controllo del tema era incondizionato:
   ```javascript
   if (s.ui && s.ui.theme && this.mapEngine) {
     this.mapEngine.setTheme(s.ui.theme);
   }
   ```
   Poiché `s.ui.theme` era `'dark'`, veniva invocato `mapEngine.setTheme('dark')`.
4. Nel motore di mappa (`LeafletMapEngine` e `HeadlessMockMapEngine`), `setTheme` reimpostava forzatamente il layer di default:
   ```javascript
   setTheme(theme) {
     this.theme = theme === 'light' ? 'light' : 'dark';
     this.setLayer(this.theme === 'light' ? 'topo' : 'dark');
   }
   ```
   Questo sovrascriveva immediatamente la tile layer appena impostata (riportandola a `'dark'`).
5. Successivamente, la guardia `if (s.ui.mapLayer !== this.activeLayer)` risultava falsa (in quanto `this.activeLayer` era già stato impostato a `newLayer` dall'handler del click), impedendo al subscriber di ripristinare il layer richiesto.
6. Risultato: il `<select>` mostrava il nome del layer scelto ("OpenTopo"), ma la mappa Leaflet era forzata a visualizzare il layer `Scuro`.

---

## 2. Interventi Architetturali Risolutivi

1. **Idempotenza di `setTheme` nel Map Adapter (`ui/map/mapEngineAdapter.js`)**:
   - Inserita una guardia di invarianza in `LeafletMapEngine.setTheme` e `HeadlessMockMapEngine.setTheme`:
     ```javascript
     const newTheme = theme === 'light' ? 'light' : 'dark';
     if (this.theme === newTheme && this.tileLayer) return;
     this.theme = newTheme;
     this.setLayer(this.theme === 'light' ? 'topo' : 'dark');
     ```
   - Se il tema non è effettivamente cambiato, `setTheme` non esegue alcuna operazione e non resetta il layer dell'utente.

2. **Guardia sull'Invarianza del Tema nei Controller (`SpotMapView.js` e `ForecastView.js`)**:
   - Tracciamento esplicito di `this.activeTheme` inizializzato da store in `mount()`.
   - Nel subscriber, `mapEngine.setTheme()` viene invocato esclusivamente se `s.ui.theme !== this.activeTheme`:
     ```javascript
     if (s.ui && s.ui.theme && s.ui.theme !== this.activeTheme && this.mapEngine) {
       this.activeTheme = s.ui.theme;
       this.mapEngine.setTheme(this.activeTheme);
       this.activeLayer = (this.mapEngine.currentLayerId) || (this.activeTheme === 'light' ? 'topo' : 'dark');
       const select = this.container?.querySelector('#gm-map-layer-select');
       if (select) select.value = this.activeLayer;
     }
     ```

3. **Verifica End-to-End su Tutti i 4 Layer Cartografici**:
   - Eseguito collaudo automatico su browser reale Headless Chrome:
     - `OpenTopo`: tile topografiche con curve di livello caricate con successo (`map_opentopo_390.png`).
     - `Satellite`: ortofoto Esri World Imagery caricate con successo (`map_satellite_390.png`).
     - `CyclOSM`: cartografia outdoor e sentieri caricata con successo (`map_streets_390.png`).
     - `Scuro`: dark canvas di default ripristinata con successo (`map_dark_390.png`).

---

## 3. Test di Regressione

- Aggiunto test unitario in `tests/ui/spotMapView.test.mjs`: `should switch map layer and keep engine and store in sync without theme revert`.
- `npm test`: **447/447 test passati con successo su 61 test suite** (0 errori, 0 skipped).
- Registrata la Lezione Appresa #85 in `MEMORY.md`.
