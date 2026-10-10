# Piano Architetturale: Analisi Volo Comprensorio & Procedure nella Vista Previsioni

> **Fase**: Fase 5-ter  
> **Stato**: 🟢 Completato *(Rettificato secondo MEMORY.md #79 per rimozione circuiti sintetici e priorità a maniche a vento vettoriali pure)*  
> **Target Repo**: `GlideMind`  
> **Moduli Coinvolti**: `core/flightProcedures.js`, `core/geoSpatialMath.js`, `ui/map/mapEngineAdapter.js`, `ui/views/ForecastView.js`

---

## 1. Obiettivo e Visione Operativa

Riorientare la funzionalità di ingrandimento della mappa nella vista **Previsioni** (`ForecastView.js`):
- **Cosa NON fa**: Non reindirizza alla mappa globale/regionale di tutti i comprensori (`SpotMapView.js`), disperdendo l'attenzione del pilota e azzerando il contesto delle previsioni orarie.
- **Cosa FA**: Apre un modulo dedicato di **Analisi Volo Comprensorio** ad alta risoluzione (overlay a schermo intero `100dvh`), focalizzato esclusivamente sul binomio Decollo-Atterraggio attivo, dotato di:
  1. **Doppia Manica a Vento Vettoriale**: una sul decollo (vento alla quota di lancio) e una sull'atterraggio (vento al suolo a fondo valle).
  2. **Riferimenti Fisici Autentici**: pin compatti con quota per decollo (`▲`) e atterraggio (`⏚`).
  3. **Convenzioni Locali & Frequenze Radio**: note di club e indicazioni di sicurezza integrate nella testata/scheda.
  4. **Scrubber Orario Sincronizzato**: controllo temporale continuo (08:00–20:00) con supporto swipe continuo multi-input (Pointer, Touch, Mouse).

---

## 2. Nota di Bonifica Architetturale (Consolidamento MEMORY.md #79)

> [!NOTE]
> Nel progetto originario era stata implementata la generazione geometrica procedurale di polilinee per circuiti di atterraggio (sottovento marrone, base blu, finale verde, cerchio holding viola, linea di planata tratteggiata).
> A seguito dell'ispezione sul campo e dei test utente, **tutti i disegni vettoriali sintetici sono stati rimossi dall'overlay cartografico**:
> 1. Sovrapporre traiettorie matematiche a priori occlude le curve di livello orografiche reali e genera disordine visivo outdoor.
> 2. I piloti necessitano di cartografia pulita (OpenTopo o Satellite) con la sola indicazione dinamica delle **maniche a vento vettoriali orientate dal meteo live**.
> 3. I vincoli fisici di atterraggio (zone autorizzate e divieti) devono basarsi su confini territoriali autentici (Fase 5-quinquies), non su percorsi geometrici arbitrari.

---

## 3. Architettura dei Componenti

```
+-----------------------------------------------------------------------------------+
|  Headless Core (Pure Node.js, Zero DOM)                                           |
|  - core/geoSpatialMath.js: primitive geodetiche WGS84                             |
|  - core/flightProcedures.js: calcolo orientamento vento decollo/atterraggio       |
|  - core/comprensorio.js: estrazione binomio attivo e normalizzazione              |
|  - core/windsock.js: cinematica manica a vento decollo e atterraggio              |
+-----------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------+
|  Cartography Adapter (ui/map/mapEngineAdapter.js)                                 |
|  - LeafletMapEngine:                                                              |
|    * renderComprensorioFlightMap(): viewport centrato sul binomio attivo          |
|    * Dual Windsock Layer: takeoffMarker + landingMarker                           |
|    * updateFlightProcedures(): riallineamento in-place < 50ms allo scrub orario   |
|    * lifecycle pause/resume: congelamento mini-mappa sottostante durante overlay  |
+-----------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------+
|  UI Shell & View (ui/views/ForecastView.js & css/theme.css)                       |
|  - Comprensorio Flight Inspector Overlay:                                         |
|    * Viewport dinamico 100dvh fisso (z-index: 1050), body scroll lock             |
|    * Header flottante: Comprensorio, decollo, atterraggio, pulsante chiusura 'X'  |
|    * Selettore layer basemap: Topo, Satellite, Scuro, CyclOSM                     |
|    * Scrubber orario dockato in basso con swipe continuo normalizzato             |
+-----------------------------------------------------------------------------------+
```
