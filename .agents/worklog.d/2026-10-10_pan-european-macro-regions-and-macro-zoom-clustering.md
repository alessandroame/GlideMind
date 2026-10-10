# Pan-European Macro-Regions & Macro Zoom Clustering Architecture

## Context & Objectives
- Prior to this intervention, the Spot Map defaulted to the `north-west` macro-region (`DEFAULT_MACRO_REGION = 'north-west'`), restricting the initial map view to 51 North-West Italian spots.
- International spots in the catalog (Corsica/FR: 11, Slovenia/SI: 6, Croatia/HR: 6) were only accessible under the filter previously labeled "Tutta Italia", with no dedicated international Alpine partitions.
- To provide pan-European visibility and maintain a responsive 60 FPS frame rate, hierarchical clustering for macro zoom levels (< 7.5) and updated macro-regions were required.

## Key Changes
1. **Pan-European Macro-Regions in `core/mapDataPartition.js`**:
   - Updated `MACRO_REGIONS.ALL`: id `'all'`, label `'Tutta Europa'`, centered on Central Europe (`lat: 46.2, lon: 11.0`, zoom 5).
   - Added `MACRO_REGIONS.ALPS_WEST`: id `'alps-west'`, label `'Francia & Alpi Ovest (FR/CH)'`, matching French and Swiss spots (`countries: ['FR', 'CH']`, `regions: ['Corse', ...]`).
   - Added `MACRO_REGIONS.ALPS_EAST`: id `'alps-east'`, label `'Austria, Slovenia & Balcani (AT/SI/HR)'`, matching Austrian, Slovenian, and Balkan spots (`countries: ['AT', 'SI', 'HR', 'DE']`).
   - Flagged Italian regional partitions with `isSubdivision: true` so country matching does not leak between Italian regions.
   - Set `DEFAULT_MACRO_REGION = 'all'`.

2. **Headless Macro-Zoom Clustering (`clusterComprensori`)**:
   - Implemented `clusterComprensori(evaluatedSpots, zoomLevel, options)` in `core/mapDataPartition.js`.
   - Strictly headless (zero DOM dependencies) operating in $O(N^2)$ space for visible spots with dynamic geographic radius scaling by zoom level (from ~160km at zoom 4 down to ~25km at zoom 7).
   - For `zoomLevel >= 7.5`, returns spots unclustered for high-resolution single-spot inspection.
   - For `zoomLevel < 7.5`, aggregates proximate spots into cluster objects containing:
     - `count`: total spots in the cluster.
     - `coordinates`: centroid latitude and longitude.
     - `bounds`: bounding box enclosing all clustered spots.
     - `status`: synthesized best flyability status (`flyable` > `caution` > `unflyable`).
     - `topSpot`: reference to the highest-scoring spot within the cluster.

3. **Leaflet & Theme Integration**:
   - In `ui/map/mapEngineAdapter.js`, added cluster marker rendering via lightweight `window.L.divIcon` displaying the numerical spot count and semantic flyability badge color.
   - Added 1-tap cluster drill-down: tapping a cluster animates `map.fitBounds(cluster.bounds, { padding: [50, 50], maxZoom: 9 })`, expanding the cluster smoothly.
   - Styled `.gm-map-cluster-marker` in `css/theme.css` with dual-theme contrast, active tap scaling, and zero-FOUC box shadows.
   - Increased viewport culling limit `maxSpots` in `ui/views/SpotMapView.js` to 500 to allow broad continental coverage without thread blocking.

4. **Continental France, Switzerland & European Spot Catalog Enrichment**:
   - Enriched `data/locations.json` with 41 verified paragliding comprensori: 14 in continental France (Annecy, Chamonix, Saint-Hilaire, Passy, etc.), 18 in Switzerland (Interlaken, Grindelwald, Lauterbrunnen, Verbier, etc.), 6 in Austria, and 3 in Germany.
   - Synchronized shards in `data/locations-index.json` (176 total spots) and `data/locations/` (`fr.json`: 25 spots, `ch.json`: 18 spots, `at.json`: 6 spots, `de.json`: 3 spots).
   - Recentered `ALPS_WEST` to `lat: 46.2, lon: 7.2` (Franco-Swiss Alps) delivering 43 total spots in the filter.

5. **Testing & Verification**:
   - Updated and expanded `tests/core/mapDataPartition.test.mjs` and `tests/ui/locationsCatalogHydration.test.mjs` to validate `DEFAULT_MACRO_REGION = 'all'`, Alps West and Alps East filtering, and `clusterComprensori` behavior across zoom levels.
   - Full test suite passing: 435/435 tests across 61 suites (`npm test`).
