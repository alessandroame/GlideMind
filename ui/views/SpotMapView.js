/**
 * GlideMind - Spot Map View Controller (UI Layer - Phase 5)
 * 
 * Implements the interactive paragliding aerological map:
 * - 3-level progressive marker scaling (dot 14px -> aureole 8-10km -> micro vectors)
 * - 1-tap "Top Spot" auto-focus recommendation
 * - True takeoff altitude wind vectoring and wind-corrected glide cone
 * - Thumb-Zone docked hourly scrubber (09:00 - 18:00) with >=24px navbar clearance
 * - Macro-region partitioning to eliminate HTTP 414 / HTTP 429 errors
 * - Reactive integration with centralized store and SheetManager
 */

import { store } from '../../core/store.js';
import { router } from '../router.js';
import { openSheet, closeSheet } from '../sheetManager.js';
import {
  DEFAULT_COMPRENSORI,
  evaluateComprensorio,
  parseCoordinates,
  cleanUserText
} from '../../core/comprensorio.js';
import {
  MACRO_REGIONS,
  DEFAULT_MACRO_REGION,
  filterComprensoriByMacroRegion,
  filterComprensoriByBoundingBox,
  clusterComprensori,
  getMissingSpots,
  findTopFlyableSpot,
  getComprensorioCoordinates
} from '../../core/mapDataPartition.js';
import { createMapEngine, STATUS_COLORS } from '../map/mapEngineAdapter.js';
import { formatDateIso } from '../../core/datePresets.js';
import { fetchBatchComprensoriWeather, generateSyntheticWeather } from '../../core/openMeteoApi.js';

export class SpotMapView {
  constructor() {
    this.container = null;
    this.mapContainer = null;
    this.mapEngine = null;
    this.comprensoriCatalog = [...DEFAULT_COMPRENSORI];
    this.cachedWeatherMap = new Map(); // spotId -> { fetchedAt: number, weatherData: object }
    this.activeMacroRegion = DEFAULT_MACRO_REGION;
    this.activeHour = 12;
    this.activeDate = formatDateIso(new Date());
    this.activeLayer = 'dark';
    this.focusedSpotId = null;
    this.topSpot = null;
    this.isFetchingWeather = false;
    this.storeUnsub = null;
    this.moveDebounceTimer = null;
    this.hoursRange = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  }

  /**
   * Updates the master locations catalog.
   * @param {Array<object>} catalog
   */
  setComprensoriCatalog(catalog) {
    if (Array.isArray(catalog) && catalog.length > 0) {
      this.comprensoriCatalog = catalog;
      if (this.container) {
        this.renderMapContent();
      }
    }
  }

  /**
   * Gets display title for the currently focused spot in scrubber header.
   * @returns {string}
   */
  getFocusedSpotTitle() {
    if (this.focusedSpotId) {
      const spot = this.comprensoriCatalog.find(s => s.id === this.focusedSpotId);
      if (spot) return spot.name;
    }
    return this.topSpot?.name || 'Osservazione Spot';
  }

  /**
   * Mounts the Spot Map view into the specified container element.
   * @param {HTMLElement} containerEl
   * @param {object} [params]
   */
  mount(containerEl, params = {}) {
    this.container = containerEl;
    if (!this.container) return;

    // Synchronize initial state from store
    const state = store.getState();
    this.activeDate = state.activeDate || formatDateIso(new Date());
    if (typeof state.activeHourIndex === 'number' && state.activeHourIndex >= 9 && state.activeHourIndex <= 18) {
      this.activeHour = state.activeHourIndex;
    } else {
      this.activeHour = 12;
    }

    this.activeLayer = (state.ui && state.ui.mapLayer) || 'dark';
    this.focusedSpotId = state.selectedSpotId || null;

    if (params && params.macroRegion) {
      this.activeMacroRegion = params.macroRegion;
    }

    // Build DOM structure
    this.container.innerHTML = `
      <section class="gm-map-view" aria-label="Mappa Comprensori e Volabilità">
        <!-- Map Canvas Mount Target -->
        <div id="gm-map-canvas" class="gm-map-canvas-container" role="application" aria-label="Cartografia interattiva decolli e comprensori"></div>

        <!-- Top Floating Controls Bar -->
        <header class="gm-map-top-bar" role="toolbar" aria-label="Filtri mappa">
          <div class="gm-map-controls-row">
            <div class="gm-map-group-left">
              <!-- Macro-Region Dropdown Button -->
              <select id="gm-map-macro-region-select" class="gm-map-pill-btn" aria-label="Seleziona macro-regione">
                ${Object.values(MACRO_REGIONS).map(r => `
                  <option value="${r.id}" ${r.id === this.activeMacroRegion ? 'selected' : ''}>
                    ${r.name}
                  </option>
                `).join('')}
              </select>

              <!-- Layer Switcher Dropdown Button -->
              <select id="gm-map-layer-select" class="gm-map-pill-btn" aria-label="Seleziona layer cartografico">
                <option value="dark" ${this.activeLayer === 'dark' ? 'selected' : ''}>Scuro</option>
                <option value="topo" ${this.activeLayer === 'topo' ? 'selected' : ''}>OpenTopo</option>
                <option value="satellite" ${this.activeLayer === 'satellite' ? 'selected' : ''}>Satellite</option>
                <option value="streets" ${this.activeLayer === 'streets' ? 'selected' : ''}>CyclOSM</option>
              </select>
            </div>

            <div class="gm-map-group-right">
              <!-- Live Data Freshness Badge -->
              <span id="gm-map-network-badge" class="gm-badge gm-badge-flyable" style="font-size: 0.72rem; padding: 4px 8px;">
                Live Open-Meteo
              </span>

              <!-- 1-Tap Top Spot Focus Recommendation Pill -->
              <button type="button" id="gm-map-top-spot-btn" class="gm-map-top-spot-btn" aria-label="Centra sullo spot migliore">
                <span class="gm-top-spot-dot">●</span>
                <span class="gm-top-spot-title" id="gm-top-spot-name">Top Spot...</span>
                <span class="gm-top-spot-focus" aria-hidden="true">›</span>
              </button>
            </div>
          </div>
        </header>

        <!-- Bottom Docked Timeline Scrubber (Thumb Zone, Clearance >=24px) -->
        <div class="gm-map-scrubber-container" role="region" aria-label="Selettore orario volabilità">
          <div class="gm-map-scrubber-inner">
            <div class="gm-map-scrubber-header">
              <div class="gm-map-scrubber-title-group">
                <span class="gm-map-scrubber-title">Timeline Volabilità</span>
                <span id="gm-map-scrubber-spot-pill" class="gm-map-scrubber-spot-pill">
                  ${this.getFocusedSpotTitle()}
                </span>
              </div>
              <div class="gm-map-scrubber-hour-display">
                <span id="gm-map-active-hour-label" class="gm-flight-alt">Ore ${String(this.activeHour).padStart(2, '0')}:00</span>
              </div>
            </div>

            <div class="gm-map-scrubber-stepper-row">
              <button
                type="button"
                id="gm-map-prev-hour-btn"
                class="gm-map-stepper-btn"
                aria-label="Ora precedente"
                ${this.activeHour <= 9 ? 'disabled' : ''}
              >
                ‹
              </button>

              <div class="gm-map-scrubber-slots" role="radiogroup" aria-label="Ore disponibili">
                ${this.hoursRange.map(h => `
                  <button
                    type="button"
                    class="gm-map-hour-slot ${h === this.activeHour ? 'active' : ''}"
                    data-hour="${h}"
                    role="radio"
                    aria-checked="${h === this.activeHour ? 'true' : 'false'}"
                    aria-label="Ore ${h}:00"
                  >
                    <span class="gm-hour-text">${String(h).padStart(2, '0')}</span>
                    <span class="gm-hour-fly-bar" data-slot-hour="${h}"></span>
                  </button>
                `).join('')}
              </div>

              <button
                type="button"
                id="gm-map-next-hour-btn"
                class="gm-map-stepper-btn"
                aria-label="Ora successiva"
                ${this.activeHour >= 18 ? 'disabled' : ''}
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </section>
    `;

    // Initialize Map Engine Adapter
    this.mapContainer = this.container.querySelector('#gm-map-canvas');
    const regionConfig = Object.values(MACRO_REGIONS).find(r => r.id === this.activeMacroRegion) || MACRO_REGIONS.ALL;
    const currentTheme = (state.ui && state.ui.theme) || 'dark';

    this.mapEngine = createMapEngine(this.mapContainer, {
      center: regionConfig.defaultCenter,
      zoom: regionConfig.defaultZoom,
      theme: currentTheme,
      layer: this.activeLayer,
      onSpotSelect: (spot) => this.handleSpotFocus(spot),
      onSpotOpenSheet: (spot) => this.handleSpotClick(spot),
      onMoveEnd: (view) => this.handleMapMove(view)
    });

    if (this.mapEngine && typeof this.mapEngine.setLayer === 'function') {
      this.mapEngine.setLayer(this.activeLayer);
    }

    // Bind UI Event Listeners
    this.bindEvents();

    // Subscribe to store updates
    if (typeof store.subscribe === 'function') {
      this.storeUnsub = store.subscribe(() => {
        const s = store.getState();
        // Check theme change
        if (s.ui && s.ui.theme && this.mapEngine) {
          this.mapEngine.setTheme(s.ui.theme);
        }
        // Check map layer change
        if (s.ui && s.ui.mapLayer && s.ui.mapLayer !== this.activeLayer && this.mapEngine) {
          this.activeLayer = s.ui.mapLayer;
          const select = this.container?.querySelector('#gm-map-layer-select');
          if (select) select.value = this.activeLayer;
          if (typeof this.mapEngine.setLayer === 'function') {
            this.mapEngine.setLayer(this.activeLayer);
          }
        }
        // Check selected spot change
        if (s.selectedSpotId && s.selectedSpotId !== this.focusedSpotId) {
          this.focusedSpotId = s.selectedSpotId;
          this.renderMapContent();
        }
        // Check date change
        if (s.activeDate && s.activeDate !== this.activeDate) {
          this.activeDate = s.activeDate;
          this.renderMapContent();
        }
        // Check hour change
        if (typeof s.activeHourIndex === 'number' && s.activeHourIndex !== this.activeHour && s.activeHourIndex >= 9 && s.activeHourIndex <= 18) {
          this.setActiveHour(s.activeHourIndex, false);
        }
      });
    }

    // Trigger initial rendering and background network sync
    this.renderMapContent();
    this.syncMacroRegionWeather(this.activeMacroRegion);
  }

  /**
   * Unbinds listeners and destroys the map engine upon route change.
   */
  unmount() {
    if (this.moveDebounceTimer) {
      clearTimeout(this.moveDebounceTimer);
      this.moveDebounceTimer = null;
    }
    if (this.storeUnsub) {
      this.storeUnsub();
      this.storeUnsub = null;
    }
    if (this.mapEngine) {
      this.mapEngine.destroy();
      this.mapEngine = null;
    }
    this.container = null;
    this.mapContainer = null;
  }

  /**
   * Binds interaction events to top toolbar and bottom scrubber.
   */
  bindEvents() {
    if (!this.container) return;

    // Macro-region selector
    const regionSelect = this.container.querySelector('#gm-map-macro-region-select');
    if (regionSelect) {
      regionSelect.addEventListener('change', (e) => {
        const newRegionId = e.target.value;
        this.setMacroRegion(newRegionId);
      });
    }

    // Layer switcher
    const layerSelect = this.container.querySelector('#gm-map-layer-select');
    if (layerSelect) {
      layerSelect.addEventListener('change', (e) => {
        const newLayer = e.target.value;
        this.activeLayer = newLayer;
        if (this.mapEngine && typeof this.mapEngine.setLayer === 'function') {
          this.mapEngine.setLayer(newLayer);
        }
        if (typeof store.setState === 'function') {
          const ui = (store.getState().ui) || {};
          store.setState({ ui: { ...ui, mapLayer: newLayer } });
        }
      });
    }

    // Top spot focus button
    const topSpotBtn = this.container.querySelector('#gm-map-top-spot-btn');
    if (topSpotBtn) {
      topSpotBtn.addEventListener('click', () => {
        if (this.topSpot) {
          this.focusedSpotId = this.topSpot.id || this.topSpot.comprensorio?.id;
          const coords = getComprensorioCoordinates(this.topSpot.comprensorio || this.topSpot);
          if (coords && this.mapEngine) {
            this.mapEngine.flyTo(coords, 10);
            this.handleSpotFocus(this.topSpot);
            if (typeof this.mapEngine.openSpotPopup === 'function') {
              setTimeout(() => {
                this.mapEngine.openSpotPopup(this.focusedSpotId);
              }, 300);
            }
          }
        }
      });
    }

    // Scrubber header spot pill (tap to open sheet)
    const spotPill = this.container.querySelector('#gm-map-scrubber-spot-pill');
    if (spotPill) {
      spotPill.style.cursor = 'pointer';
      spotPill.addEventListener('click', () => {
        const evaluatedSpots = this.getEvaluatedSpotsForActiveRegion();
        const cur = (this.focusedSpotId && evaluatedSpots.find(s => (s.id || s.comprensorio?.id) === this.focusedSpotId)) || this.topSpot;
        if (cur) {
          this.handleSpotClick(cur);
        }
      });
    }

    // Stepper buttons for 1-hour jump
    const prevBtn = this.container.querySelector('#gm-map-prev-hour-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.activeHour > 9) {
          this.setActiveHour(this.activeHour - 1, true);
        }
      });
    }

    const nextBtn = this.container.querySelector('#gm-map-next-hour-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (this.activeHour < 18) {
          this.setActiveHour(this.activeHour + 1, true);
        }
      });
    }

    // Hourly Scrubber slot buttons
    const scrubberSlots = this.container.querySelectorAll('.gm-map-hour-slot');
    scrubberSlots.forEach(slot => {
      slot.addEventListener('click', () => {
        const hour = parseInt(slot.getAttribute('data-hour'), 10);
        if (!isNaN(hour)) {
          this.setActiveHour(hour, true);
        }
      });
    });
  }

  /**
   * Changes the active macro-region, re-centering the map and fetching data if needed.
   * @param {string} regionId
   */
  setMacroRegion(regionId) {
    this.activeMacroRegion = regionId;
    const regionConfig = Object.values(MACRO_REGIONS).find(r => r.id === regionId) || MACRO_REGIONS.ALL;

    if (this.mapEngine) {
      this.mapEngine.setView(regionConfig.defaultCenter, regionConfig.defaultZoom);
    }

    this.renderMapContent();
    this.syncMacroRegionWeather(regionId);
  }

  /**
   * Updates the selected hour index and triggers fast in-memory re-evaluation.
   * @param {number} hour
   * @param {boolean} [updateStore=true]
   */
  setActiveHour(hour, updateStore = true) {
    if (this.activeHour === hour) return;
    this.activeHour = hour;

    if (updateStore && typeof store.setState === 'function') {
      store.setState({ activeHourIndex: hour });
    }

    if (this.container) {
      const activeLabel = this.container.querySelector('#gm-map-active-hour-label');
      if (activeLabel) activeLabel.textContent = `Ore ${String(hour).padStart(2, '0')}:00`;

      const prevBtn = this.container.querySelector('#gm-map-prev-hour-btn');
      if (prevBtn) prevBtn.disabled = hour <= 9;

      const nextBtn = this.container.querySelector('#gm-map-next-hour-btn');
      if (nextBtn) nextBtn.disabled = hour >= 18;

      const slots = this.container.querySelectorAll('.gm-map-hour-slot');
      slots.forEach(slot => {
        const h = parseInt(slot.getAttribute('data-hour'), 10);
        if (h === hour) {
          slot.classList.add('active');
          slot.setAttribute('aria-checked', 'true');
        } else {
          slot.classList.remove('active');
          slot.setAttribute('aria-checked', 'false');
        }
      });
    }

    // Re-render overlays instantly in RAM (<15ms)
    this.renderMapContent();
  }

  /**
   * Retrieves spots currently visible in the active viewport (or macro-region fallback).
   * @returns {Array<object>}
   */
  getVisibleComprensori() {
    const macroFiltered = filterComprensoriByMacroRegion(this.comprensoriCatalog, this.activeMacroRegion);
    if (this.mapEngine && typeof this.mapEngine.getBounds === 'function') {
      const bounds = this.mapEngine.getBounds();
      if (bounds) {
        return filterComprensoriByBoundingBox(macroFiltered, bounds, { marginRatio: 0.1, maxSpots: 500 });
      }
    }
    return macroFiltered;
  }

  /**
   * Handles map pan and zoom transitions.
   * Filters overlays and debounces network synchronization for newly visible spots.
   * @param {object} view
   */
  handleMapMove(view) {
    if (!this.mapEngine) return;
    const currentZoom = typeof view?.zoom === 'number' ? view.zoom : (this.mapEngine.getView()?.zoom || 7);
    const evaluated = this.getEvaluatedSpotsForActiveRegion(Boolean(view?.bounds));
    const displayOverlays = clusterComprensori(evaluated, currentZoom);
    this.mapEngine.renderOverlays(displayOverlays, currentZoom, store.getState().activeGlider, this.focusedSpotId);

    // Debounced background sync for newly visible spots (400ms)
    if (this.moveDebounceTimer) {
      clearTimeout(this.moveDebounceTimer);
    }
    this.moveDebounceTimer = setTimeout(() => {
      this.syncVisibleSpotsWeather();
    }, 400);
  }

  /**
   * Evaluates flyability in RAM for comprensori in the active macro-region or visible viewport.
   * @param {boolean} [onlyVisible=false]
   * @returns {Array<object>}
   */
  getEvaluatedSpotsForActiveRegion(onlyVisible = false) {
    const spots = onlyVisible ? this.getVisibleComprensori() : filterComprensoriByMacroRegion(this.comprensoriCatalog, this.activeMacroRegion);
    const activeGlider = store.getState().activeGlider;

    return spots.map(spot => {
      let weather = this.cachedWeatherMap.get(spot.id)?.weatherData || null;
      if (!weather) {
        const coords = getComprensorioCoordinates(spot);
        if (coords) {
          weather = generateSyntheticWeather({ lat: coords.lat, lon: coords.lon }, { days: 1, targetDate: this.activeDate });
        }
      }

      return evaluateComprensorio({
        comprensorio: spot,
        weatherData: weather,
        hourIndex: this.activeHour,
        glider: activeGlider,
        allowSynthetic: true,
        targetDate: this.activeDate
      });
    });
  }

  /**
   * Re-evaluates spots in RAM and updates markers and top-spot recommendation.
   */
  renderMapContent() {
    const evaluatedSpots = this.getEvaluatedSpotsForActiveRegion();
    const activeGlider = store.getState().activeGlider;

    // Find and update top-spot recommendation pill
    this.topSpot = findTopFlyableSpot(evaluatedSpots);

    // Default focused spot to top-spot or first spot if not explicitly set
    if (!this.focusedSpotId && this.topSpot) {
      this.focusedSpotId = this.topSpot.id || this.topSpot.comprensorio?.id;
    }

    // Update map overlays with active spot beacon (filtering to visible spots if bounded)
    if (this.mapEngine) {
      const currentView = this.mapEngine.getView();
      const visibleSpots = this.getEvaluatedSpotsForActiveRegion(Boolean(this.mapEngine.getBounds?.()));
      const displayOverlays = clusterComprensori(visibleSpots, currentView.zoom);
      this.mapEngine.renderOverlays(displayOverlays, currentView.zoom, activeGlider, this.focusedSpotId);
    }

    if (this.container && this.topSpot) {
      const topNameEl = this.container.querySelector('#gm-top-spot-name');
      const topDotEl = this.container.querySelector('.gm-top-spot-dot');
      if (topNameEl) {
        topNameEl.textContent = `${this.topSpot.name} (${this.activeHour}:00)`;
      }
      if (topDotEl) {
        const style = STATUS_COLORS[this.topSpot.status] || STATUS_COLORS.flyable;
        topDotEl.style.color = style.fill;
      }
    }

    // Update mini flyability bars on the hourly scrubber slots for the focused spot
    const focusedEval = (this.focusedSpotId && evaluatedSpots.find(s => (s.id || s.comprensorio?.id) === this.focusedSpotId)) || this.topSpot || evaluatedSpots[0];
    this.updateScrubberBars(focusedEval);
  }

  /**
   * Renders color bars on each scrubber hour slot reflecting the spot's daily progression.
   * @param {object} spotEvaluation
   */
  updateScrubberBars(spotEvaluation) {
    if (!this.container || !spotEvaluation || !spotEvaluation.comprensorio) return;
    const spot = spotEvaluation.comprensorio;
    const weather = this.cachedWeatherMap.get(spot.id)?.weatherData;
    const activeGlider = store.getState().activeGlider;

    this.hoursRange.forEach(h => {
      const bar = this.container.querySelector(`[data-slot-hour="${h}"]`);
      if (bar) {
        const evalAtH = evaluateComprensorio({
          comprensorio: spot,
          weatherData: weather,
          hourIndex: h,
          glider: activeGlider,
          allowSynthetic: true,
          targetDate: this.activeDate
        });
        const style = STATUS_COLORS[evalAtH.status] || STATUS_COLORS.unavailable;
        bar.style.backgroundColor = style.fill;
      }
    });

    const spotPill = this.container.querySelector('#gm-map-scrubber-spot-pill');
    if (spotPill) {
      const style = STATUS_COLORS[spotEvaluation.status] || STATUS_COLORS.unavailable;
      spotPill.textContent = `${spot.name || 'Spot'} (${style.badge})`;
      spotPill.style.color = style.fill;
    }
  }

  /**
   * Asynchronously fetches batch Open-Meteo weather for visible spots in viewport.
   */
  async syncVisibleSpotsWeather() {
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
      return; // Headless environment guard
    }

    const spots = this.getVisibleComprensori();
    const missingSpots = getMissingSpots(spots, this.cachedWeatherMap, 1800000); // 30 min TTL
    if (missingSpots.length === 0) return;

    await this.fetchAndCacheSpotsWeather(missingSpots);
  }

  /**
   * Asynchronously fetches batch Open-Meteo weather for the macro-region.
   * @param {string} [regionId]
   */
  async syncMacroRegionWeather(regionId = null) {
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
      return; // Headless environment guard
    }

    const targetRegion = regionId || this.activeMacroRegion;
    const regionSpots = filterComprensoriByMacroRegion(this.comprensoriCatalog, targetRegion);
    const visibleSpots = this.getVisibleComprensori();
    const spotsToSync = visibleSpots.length > 0 ? visibleSpots : regionSpots;
    const missingSpots = getMissingSpots(spotsToSync, this.cachedWeatherMap, 1800000); // 30 min TTL
    if (missingSpots.length === 0) return;

    await this.fetchAndCacheSpotsWeather(missingSpots);
  }

  /**
   * Executes batch Open-Meteo weather fetch and populates cache.
   * @param {Array<object>} spotsToFetch
   */
  async fetchAndCacheSpotsWeather(spotsToFetch) {
    if (!Array.isArray(spotsToFetch) || spotsToFetch.length === 0) return;

    const badge = this.container?.querySelector('#gm-map-network-badge');
    if (badge) {
      badge.textContent = '🟡 Aggiornamento...';
      badge.className = 'gm-badge gm-badge-caution';
    }

    try {
      this.isFetchingWeather = true;
      const batchMap = await fetchBatchComprensoriWeather(spotsToFetch, {
        targetDate: this.activeDate,
        forecastDays: 7
      });

      const now = Date.now();
      if (batchMap && typeof batchMap.entries === 'function') {
        for (const [spotId, weatherData] of batchMap.entries()) {
          this.cachedWeatherMap.set(spotId, {
            fetchedAt: now,
            weatherData
          });
        }
      }

      if (badge) {
        badge.textContent = '🟢 Live Open-Meteo';
        badge.className = 'gm-badge gm-badge-flyable';
      }

      this.renderMapContent();
    } catch (err) {
      console.warn('[GlideMind Map] Background weather batch fetch error:', err);
      if (badge) {
        badge.textContent = '⚪ Modalità Offline';
        badge.className = 'gm-badge gm-badge-unflyable';
      }
    } finally {
      this.isFetchingWeather = false;
    }
  }

  /**
   * Handles spot selection/focus on the map and synchronizes scrubber and store without forcing the sheet.
   * @param {object} spotEval
   */
  handleSpotFocus(spotEval) {
    if (!spotEval) return;
    const spot = spotEval.comprensorio || spotEval;
    const spotId = spot.id || spotEval.id;
    if (spotId && spotId !== this.focusedSpotId) {
      this.focusedSpotId = spotId;
      if (typeof store.setState === 'function') {
        store.setState({ selectedSpotId: spotId });
      }
    }
    this.updateScrubberBars(spotEval);
  }

  /**
   * Opens the contextual Bottom Sheet drawer upon clicking any spot marker.
   * @param {object} spotEval
   */
  handleSpotClick(spotEval) {
    if (!spotEval) return;
    const spot = spotEval.comprensorio || spotEval;
    if (spot.id && spot.id !== this.focusedSpotId) {
      this.handleSpotFocus(spotEval);
    }
    const statusStyle = STATUS_COLORS[spotEval.status] || STATUS_COLORS.unavailable;
    const takeoff = spotEval.takeoff || spot.takeoffs?.[0];
    const landing = spotEval.landing || spot.landings?.[0];
    const glide = spotEval.glideMetrics || { requiredGlideRatio: 5.0, isSafe: true };
    const glideRatioStr = typeof glide.requiredGlideRatio === 'number' ? `1:${glide.requiredGlideRatio}` : '1:5.0';

    const tAlt = takeoff?.altitude ? `${takeoff.altitude}m slm` : 'N/D';
    const lAlt = landing?.altitude ? `${landing.altitude}m slm` : 'N/D';
    const windSpeed = spotEval.weatherSnapshot?.windSpeed != null ? `${Math.round(spotEval.weatherSnapshot.windSpeed)} km/h` : 'N/D';
    const windDir = spotEval.weatherSnapshot?.direction?.cardinal || 'N/D';

    const sheetContent = `
      <div class="gm-spot-detail-sheet" style="display: flex; flex-direction: column; gap: 14px; padding: 4px 0;">
        <!-- Header summary -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
          <div>
            <h4 style="margin: 0; font-size: 1.1rem; font-weight: 700; color: var(--gm-text-primary);">${spot.name || spot.location}</h4>
            <div style="font-size: 0.8rem; color: var(--gm-text-secondary); margin-top: 2px;">
              ${spot.location || ''} ${spot.province ? `(${spot.province})` : ''}
            </div>
          </div>
          <span class="gm-badge" style="background-color: ${statusStyle.fill}; color: #ffffff; font-weight: 700; padding: 4px 10px; border-radius: var(--gm-radius-full); font-size: 0.78rem;">
            ${statusStyle.icon} ${statusStyle.badge}
          </span>
        </div>

        <!-- 2-Row Flight Overview (Decollo & Atterraggio) -->
        <div class="gm-spot-flight-row">
          <div class="gm-flight-stat-row">
            <div class="gm-flight-label">
              <span class="gm-flight-icon">▲</span>
              <span class="gm-flight-target">${takeoff?.name || 'Decollo Principale'}</span>
              <span class="gm-flight-alt">${tAlt}</span>
            </div>
            <div class="gm-flight-data">
              <span class="gm-ind-pill">
                <span class="gm-ind-dot" style="background-color: ${statusStyle.fill};"></span>
                <span>${windSpeed} ${windDir}</span>
              </span>
            </div>
          </div>

          <div class="gm-flight-stat-row">
            <div class="gm-flight-label">
              <span class="gm-flight-icon">⏚</span>
              <span class="gm-flight-target">${landing?.name || 'Atterraggio Sicuro'}</span>
              <span class="gm-flight-alt">${lAlt}</span>
            </div>
            <div class="gm-flight-data">
              <span class="gm-ind-pill">
                <span class="gm-ind-dot" style="background-color: ${glide.isSafe ? '#22c55e' : '#ef4444'};"></span>
                <span>Eff. ${glideRatioStr}</span>
              </span>
            </div>
          </div>
        </div>

        <!-- Physical explainability text -->
        ${spotEval.reason ? `
          <div style="font-size: 0.82rem; color: var(--gm-text-secondary); background: var(--gm-bg-elevated); padding: 8px 12px; border-radius: var(--gm-radius-sm); border-left: 3px solid ${statusStyle.fill};">
            ${spotEval.reason}
          </div>
        ` : ''}

        <!-- Hazards warning if present -->
        ${takeoff?.hazards ? `
          <div style="font-size: 0.76rem; color: #f59e0b; background: rgba(245, 158, 11, 0.08); padding: 6px 10px; border-radius: var(--gm-radius-sm); border: 1px solid rgba(245, 158, 11, 0.2);">
            ⚠️ <strong>Pericoli:</strong> ${cleanUserText(takeoff.hazards)}
          </div>
        ` : ''}

        <!-- Primary CTA to Forecast View -->
        <button type="button" id="gm-map-cta-forecast" class="gm-btn gm-btn-primary" style="min-height: var(--gm-touch-min, 48px); width: 100%; margin-top: 4px; font-weight: 700;">
          Apri Previsioni Dettagliate
        </button>
      </div>
    `;

    openSheet(spot.name || 'Scheda Comprensorio', sheetContent);

    // Bind CTA click
    setTimeout(() => {
      const ctaBtn = document.getElementById('gm-map-cta-forecast');
      if (ctaBtn) {
        ctaBtn.addEventListener('click', () => {
          closeSheet();
          if (typeof store.setState === 'function') {
            store.setState({
              selectedSpotId: spot.id,
              activeHourIndex: this.activeHour
            });
          }
          router.navigate('forecast');
        });
      }
    }, 50);
  }

  /**
   * Formats ISO date string into human-friendly Italian short date.
   * @param {string} isoDate
   * @returns {string}
   */
  formatDateDisplay(isoDate) {
    if (!isoDate) return 'Oggi';
    const today = formatDateIso(new Date());
    if (isoDate === today) return 'Oggi';

    const parts = isoDate.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}`;
    }
    return isoDate;
  }
}

export const spotMapView = new SpotMapView();
