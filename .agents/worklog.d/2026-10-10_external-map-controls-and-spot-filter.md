# External Map Controls Bar & Two-Way Locality Filter

## Context & Objectives
- In `SpotMapView`, the controls bar containing the macro-region filter, layer selector, network badge, and top spot button was rendered as an absolute overlay (`position: absolute; top: ...`) directly on top of the Leaflet map canvas.
- This occluded northern European and Alpine map tiles (Switzerland, France, Northern Italy) and caused visual interference with map markers located near the top edge.
- Furthermore, users lacked a direct dropdown filter to choose a specific locality/comprensorio within the active macro-region, requiring continuous manual panning and zooming.

## Key Changes
1. **In-Flow Solid Top Header (`.gm-map-top-bar`)**:
   - Converted `.gm-map-top-bar` from absolute overlay to natural in-flow block element (`position: relative; width: 100%; flex-shrink: 0; pointer-events: auto`).
   - Styled with dual-theme surface colors (`var(--gm-bg-surface)` in dark, `#ffffff` in light) and elevation shadow (`box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25)`).

2. **Decoupled Map Canvas Wrapper (`.gm-map-canvas-wrapper`)**:
   - Introduced `.gm-map-canvas-wrapper` (`flex: 1 1 0%; min-height: 0; width: 100%; overflow: hidden; position: relative`).
   - The Leaflet map canvas (`#gm-map-canvas`) starts strictly below the external header in natural document flow, completely un-occluding northern map tiles and labels.
   - Added `#main-view.gm-view-map, #main-view:has(.gm-map-view)` rules in `css/theme.css` to zero outer container padding and prevent double scrollbars.
   - Added `invalidateSize()` to both `HeadlessMockMapEngine` and `LeafletMapEngine` in `ui/map/mapEngineAdapter.js`, called during view mount to calibrate Leaflet's geometry accurately.

3. **Two-Way Locality Dropdown Selector (`#gm-map-spot-select`)**:
   - Implemented `renderSpotSelectOptions()` and `updateSpotSelectOptions()` in `ui/views/SpotMapView.js`.
   - Populates dynamically with all comprensori in the active macro-region, sorted alphabetically with elevation and province/country.
   - **Forward Binding**: Selecting a locality in the dropdown flies/pans the map to the takeoff coordinates, focuses the spot, and opens the aeronautical speech bubble (`L.popup`).
   - **Reverse Binding**: Clicking any marker on the map updates `#gm-map-spot-select.value` to match the selected spot and syncs `store.setState({ selectedSpotId })`.
   - Switching macro-regions automatically refreshes the spot dropdown options for that region.

4. **Timeline Scrubber Placement**:
   - Anchored `.gm-map-scrubber-container` at `bottom: 16px;` inside `.gm-map-canvas-wrapper`, positioning it cleanly above the bottom navigation bar.

5. **Testing & Verification**:
   - Updated mock element helper in `tests/ui/spotMapView.test.mjs` to parse nested DOM structure.
   - Added tests verifying in-flow top bar mounting, spot dropdown generation, spot selection flying/popup opening, and macro-region switching.
   - All 436 tests passing across 61 test suites (`npm test`).
