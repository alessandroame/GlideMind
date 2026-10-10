# Piano di Espansione Europea e Scalabilità Cartografica GlideMind

- **Data**: 2026-10-10
- **Autori**: Antigravity Pair Programming & Alessandro Amè
- **Stato**: Approvato - In Inizio Lavorazione (Fase 1)
- **Obiettivo**: Estendere la copertura dei siti di volo all'intero territorio europeo (~5.000–12.000 comprensori qualificati) preservando l'ergonomia outdoor, le prestazioni mobile a 60 FPS, la soglia di reattività di Doherty (<400ms) e la rigorosa tutela della sicurezza del pilota novizio/intermedio (binomio decollo-atterraggio $E \le 7$).

---

## 1. Diagnosi delle Sfide Tecniche a Scala Continentale

1. **Collasso del DOM Cartografico**:
   - Con 5.000+ comprensori, l'allocazione di singoli elementi HTML DOM (`L.divIcon`) provoca un consumo di memoria >500 MB e il blocco del browser mobile su dispositivi touch.
2. **Saturazione Rete & Rate Limiting Open-Meteo**:
   - Richiedere il meteo per migliaia di siti contemporaneamente sfora i limiti di batch di Open-Meteo, innescando errori HTTP 414 (URL troppo lunga) o HTTP 429 (Too Many Requests).
3. **Inquinamento Visivo & Sovrapposizione Marker (Pill Pileup)**:
   - A zoom continentale (zoom 4–6), i marker individuali collassano in una massa indecifrabile che occulta l'orografia del terreno.
4. **Tutela della Sicurezza nel Catalogo Grezzo OSM**:
   - I database aperti presentano migliaia di decolli "orfani" (privi di atterraggio sicuro raggiungibile, abbandonati o con efficienza richiesta $E > 7$ incompatibile con ali EN-A/EN-B). È obbligatorio filtrare solo i comprensori dotati di binomio verificato.

---

## 2. Architettura di Scalabilità in 5 Fasi

```
+---------------------------------------------------------------------------------+
|                       ARCHITETTURA DI SCALABILITÀ CONTINENTALE                  |
+---------------------------------------------------------------------------------+
| LIVELLO 1: VIEWPORT BOUNDING BOX CULLING (SpotMapView + mapDataPartition)       |
| -> Elabora e richiede meteo solo per i comprensori compresi in map.getBounds()  |
| -> Riduce N da 10.000 a 20-50 spot a schermo                                    |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
| LIVELLO 2: RENDERING SU CANVAS 2D (LeafletMapEngine)                            |
| -> Sostituzione elementi DOM con L.canvas() / L.circleMarker                    |
| -> Tempo di rendering per frame < 5ms a 60 FPS                                  |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
| LIVELLO 3: SHARDING DEL CATALOGO (locations-index.json + locations/<country>.json)|
| -> Indice compatto in RAM per ricerca globale e mappa (~100 KB)                 |
| -> Idratazione on-demand dei dettagli del comprensorio con cache IndexedDB      |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
| LIVELLO 4: PIPELINE MULTI-COUNTRY DI HARVESTING & VALIDAZIONE SICUREZZA         |
| -> Overpass API per codici ISO3166-1 (CH, FR, AT, DE, ES, IT, ecc.)             |
| -> Pre-filtro geometrico: accoppiamento decollo-atterraggio E <= 7 + DEM        |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
| LIVELLO 5: SPATIAL CLUSTERING & SPOT SENTINELLA                                 |
| -> Aggregazione gerarchica k-d tree a zoom macro (< 7.5)                        |
| -> Sintesi di volabilità del cluster (percentuale o spot di riferimento)        |
+---------------------------------------------------------------------------------+
```

---

## 3. Dettaglio delle Fasi Operative

### Fase 1: Viewport Bounding Box Culling & Dynamic Spatial Filtering (In Corso)
- **Moduli Coinvolti**: [core/mapDataPartition.js](file:///core/mapDataPartition.js), [ui/views/SpotMapView.js](file:///ui/views/SpotMapView.js), [tests/core/mapDataPartition.test.mjs](file:///tests/core/mapDataPartition.test.mjs).
- **Azione**:
  1. Implementazione di `filterComprensoriByBoundingBox(catalog, bbox)` nel Core headless.
  2. Aggancio degli eventi `moveend` e `zoomend` di Leaflet in `SpotMapView.js`.
  3. Il batch meteo background scarica esclusivamente i siti visibili a schermo con TTL di 30 minuti, prevenendo rate limit e memory leak.

### Fase 2: Rendering Marker ad Alte Prestazioni su Canvas 2D
- **Moduli Coinvolti**: [ui/map/mapEngineAdapter.js](file:///ui/map/mapEngineAdapter.js).
- **Azione**:
  1. Estensione di `LeafletMapEngine` con modalità canvas (`window.L.canvas()`).
  2. Disegno vettoriale ad alta efficienza per i marker semantici a 4 colori.
  3. Mantenimento dell'affordance touch e del fumetto contestuale al tocco (`gm-map-spot-popup`).

### Fase 3: Sharding del Catalogo Dati & IndexedDB Cache
- **Moduli Coinvolti**: [scripts/shard-locations-catalog.mjs](file:///scripts/shard-locations-catalog.mjs), [core/comprensorio.js](file:///core/comprensorio.js), [ui/app.js](file:///ui/app.js).
- **Azione**:
  1. Creazione dell'indice globale leggero `data/locations-index.json` (~100 KB).
  2. Segmentazione dei file di dettaglio per Paese in `data/locations/<country>.json`.
  3. Idratazione progressiva e storage locale in IndexedDB.

### Fase 4: Pipeline Multi-Country OSM & Validazione Geometrica
- **Moduli Coinvolti**: [scripts/harvest-osm.mjs](file:///scripts/harvest-osm.mjs), [scripts/geo-cluster-filter.mjs](file:///scripts/geo-cluster-filter.mjs), [scripts/build-locations-catalog.mjs](file:///scripts/build-locations-catalog.mjs).
- **Azione**:
  1. Estrazione OpenStreetMap per le nazioni dell'arco alpino (`CH`, `FR`, `AT`, `DE`).
  2. Scarto automatico dei decolli privi di atterraggio sicuro ($E > 7$).
  3. Validazione DEM Copernicus e report di attendibilità.

### Fase 5: Clustering Gerarchico a Zoom Macro & Rete Sentinelle
- **Moduli Coinvolti**: [core/mapDataPartition.js](file:///core/mapDataPartition.js), [ui/map/mapEngineAdapter.js](file:///ui/map/mapEngineAdapter.js).
- **Azione**:
  1. Clustering con $k\text{-d tree}$ a zoom macro (< 7.5).
  2. Mostra di badge sintetici con conteggio e rapporto di volabilità per massiccio montuoso.
