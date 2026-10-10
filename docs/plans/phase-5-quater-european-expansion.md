# Piano di Espansione Europea e Scalabilità Cartografica GlideMind

> **Fase**: Fase 5-quater  
> **Stato**: 🟢 Completato  
> **Data**: 2026-10-10  
> **Autori**: Antigravity Pair Programming & Alessandro Amè  
> **Obiettivo**: Estendere la copertura dei siti di volo all'intero territorio europeo (~5.000–12.000 comprensori qualificati) preservando l'ergonomia outdoor, le prestazioni mobile a 60 FPS, la soglia di reattività di Doherty (<400ms) e la rigorosa tutela della sicurezza del pilota novizio/intermedio (binomio decollo-atterraggio $E \le 7$).

---

## 1. Diagnosi delle Sfide Tecniche a Scala Continentale

1. **Collasso del DOM Cartografico**:
   - Con 5.000+ comprensori, l'allocazione di singoli elementi HTML DOM (`L.divIcon`) provoca un consumo di memoria elevato su dispositivi touch mobili.
2. **Saturazione Rete & Rate Limiting Open-Meteo**:
   - Richiedere il meteo per migliaia di siti contemporaneamente sfora i limiti di batch di Open-Meteo, innescando errori HTTP 414 o HTTP 429.
3. **Inquinamento Visivo & Sovrapposizione Marker**:
   - A zoom continentale (zoom 4–6), i marker individuali collassano in una massa indecifrabile che occulta l'orografia del terreno.
4. **Tutela della Sicurezza nel Catalogo Grezzo OSM**:
   - I database aperti presentano migliaia di decolli "orfani" (privi di atterraggio sicuro raggiungibile, abbandonati o con efficienza richiesta $E > 7$). È obbligatorio filtrare solo i comprensori dotati di binomio verificato.

---

## 2. Architettura di Scalabilità in 5 Fasi

```
+---------------------------------------------------------------------------------+
| LIVELLO 1: VIEWPORT BOUNDING BOX CULLING (SpotMapView + mapDataPartition)       |
| -> Elabora e richiede meteo solo per i comprensori compresi in map.getBounds()  |
| -> Riduce N da 10.000 a 20-50 spot a schermo                                    |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
+---------------------------------------------------------------------------------+
| LIVELLO 2: RENDERING SU CANVAS 2D (LeafletMapEngine)                            |
| -> Sostituzione elementi DOM con L.canvas() / L.circleMarker                    |
| -> Tempo di rendering per frame < 5ms a 60 FPS                                  |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
+---------------------------------------------------------------------------------+
| LIVELLO 3: SHARDING DEL CATALOGO (locations-index.json + locations/<country>.json)|
| -> Indice compatto in RAM per ricerca globale e mappa (~100 KB)                 |
| -> Idratazione on-demand dei dettagli del comprensorio con cache IndexedDB      |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
+---------------------------------------------------------------------------------+
| LIVELLO 4: PIPELINE MULTI-COUNTRY DI HARVESTING & VALIDAZIONE SICUREZZA         |
| -> Overpass API per codici ISO3166-1 (CH, FR, AT, DE, ES, IT, ecc.)             |
| -> Pre-filtro geometrico: accoppiamento decollo-atterraggio E <= 7 + DEM        |
+---------------------------------------------------------------------------------+
                                      │
                                      ▼
+---------------------------------------------------------------------------------+
| LIVELLO 5: SPATIAL CLUSTERING & MACRO-REGIONI ALPINE                            |
| -> Aggregazione cluster a zoom macro (< 7.5)                                    |
| -> Macro-regioni transfrontaliere (Alpi Ovest, Alpi Est, Italia, Tutta Europa)  |
+---------------------------------------------------------------------------------+
```

---

## 3. Risultati Conseguiti

- Catalogo partizionato in `data/locations/` (IT, FR, CH, AT, DE, SI, HR).
- Indice compatto `data/locations-index.json`.
- Macro-regioni alpine transfrontaliere `ALPS_WEST`, `ALPS_EAST`.
- Clustering a zoom macro (< 7.5) con transizione `fitBounds()` al tocco.
- Due vie di sincronizzazione barra esterna <-> mappa in `SpotMapView.js`.
