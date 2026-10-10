# Worklog: Architettura Espansione Europea Catalogo e Scalabilità Cartografica

- **Data**: 2026-10-10
- **Autore**: Antigravity (Pair Programming Assistant)
- **Contesto**: Valutazione della fattibilità tecnica e impatto di prestazioni per estendere il catalogo delle località di volo a livello pan-europeo (~5.000–12.000 spot), prevenendo il blocco del browser mobile, il rate limit Open-Meteo e il decadimento della sicurezza del volo.

---

## 1. Decisioni Architetturali (ADR)

### ADR 1: Abbandono del File Monolitico a favore di Indice Compatto + Sharding Geografico
- **Problema**: Un singolo `locations.json` con 10.000 comprensori peserebbe 15–25 MB. Su rete mobile in decollo, il tempo di download e parsing violerebbe la soglia di Doherty (<400ms) provocando freeze all'avvio.
- **Decisione**: Separare i dati in due livelli:
  1. `data/locations-index.json`: indice globale leggero (~100 KB) con sole coordinate primarie, nome, id, quota e paese per mappa macro e autocompletamento.
  2. `data/locations/<country>.json`: partizioni nazionali con i dettagli estesi dei comprensori (decolli secondari, atterraggi, pericoli, contatti club, radio), idratati on-demand e salvati in cache IndexedDB.

### ADR 2: Viewport Bounding Box Culling per la Mappa e Chiamate Meteo Batch
- **Problema**: Richiedere e calcolare il meteo per tutti i punti europei simultaneamente provoca errori HTTP 414/429 su Open-Meteo e saturazione CPU durante lo scorrimento dello scrubber orario.
- **Decisione**: Pilotare il download e la valutazione oraria dal riquadro geografico visibile dello schermo (`map.getBounds()`). I siti fuori schermo non generano richieste di rete né elementi grafici.

### ADR 3: Rendering Vettoriale su Canvas 2D per Marker Scalabili
- **Problema**: Migliaia di nodi DOM (`L.divIcon`) causano layout thrashing e blocco della memoria Leaflet su smartphone.
- **Decisione**: Adottare `L.canvas()` con rendering circolare semantico ad alte prestazioni (< 5ms per frame a 60 FPS).

### ADR 4: Tutela della Sicurezza e Scarto Decolli Orfani
- **Problema**: L'estrazione massiva da OSM introduce decolli non ufficiali, privi di atterraggio sicuro o con efficienza richiesta $E > 7$.
- **Decisione**: La pipeline accoppia tassativamente ogni decollo ad almeno un atterraggio raggiungibile ($E \le 7$) e ne verifica la quota DEM, scartando i decolli orfani.

---

## 2. Roadmap di Attuazione
- **Fase 1**: Viewport Bounding Box Culling nel Core e in `SpotMapView.js`
- **Fase 2**: Rendering Canvas Marker ad alte prestazioni in `mapEngineAdapter.js`
- **Fase 3**: Sharding del Catalogo (`locations-index.json` + `locations/<country>.json`)
- **Fase 4**: Pipeline Multi-Country OSM per Svizzera (`CH`), Francia (`FR`), Austria (`AT`), Germania (`DE`)
- **Fase 5**: Spatial Clustering gerarchico a zoom continentale
