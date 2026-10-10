# Scheda Intervento: Sostituzione Provider Tile con Esri ArcGIS Keyless (Dark Gray & World Topo)

- **Data**: 2026-10-10
- **Modulo**: Adapter Cartografico (`ui/map/mapEngineAdapter.js`), Foglio di Stile (`css/theme.css`), Memoria di Progetto (`MEMORY.md`)
- **Stato**: 🟢 Completato

---

## 1. Contesto & Diagnosi
Sulla mini-mappa orografica della vista Previsioni e sulla mappa generale dei comprensori, i tile di sfondo mostravano una filigrana diagonale con la dicitura `API KEY REQUIRED carto.com/basemaps/apikey`. 
La causa radice risiede nella decisione di CARTO di dismettere l'accesso anonimo e gratuito senza token sugli endpoint `basemaps.cartocdn.com` (`dark_all` e `voyager`).

---

## 2. Soluzione Tecnica & Modifiche Eseguite

1. **Adozione Endpoint Keyless Esri ArcGIS Online (`ui/map/mapEngineAdapter.js`)**:
   - Configurato `MAP_THEMES.dark` con Esri Dark Gray Base:
     `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`
     (`maxZoom: 19`, `maxNativeZoom: 16`).
   - Configurato `MAP_THEMES.light` con Esri World Topo Map:
     `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`
     (`maxZoom: 19`, `maxNativeZoom: 19`).
   - Gestito l'ordine dei parametri ArcGIS `{z}/{y}/{x}` e il parametro `maxNativeZoom` in Leaflet `L.tileLayer`, consentendo il dimensionamento CSS fluido dei tile scuri oltre il livello nativo 16 senza errori di rete.

2. **Integrazione Sincrona Colore Base Canvas (`css/theme.css`)**:
   - Aggiunta la regola `.leaflet-container { background-color: var(--gm-bg-card, #12161f); }` per azzerare flash chiari o asincronie visive prima dell'arrivo del primo tile in modalità scura.

---

## 3. Verifiche & Risultati
- **Verifica Diretta Rete HTTP**: Download e ispezione dei tile Esri Dark Gray e World Topo (`200 OK`, `Access-Control-Allow-Origin: *`, `Cache-Control: max-age=86400`, nessuna filigrana).
- **Test Automatizzati**: Suite completa eseguita (`npm test`), con 393/393 test superati con successo (zero regressioni).
