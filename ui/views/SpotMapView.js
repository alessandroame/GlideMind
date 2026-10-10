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
    this.hoursRange = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    this.isScrubbing = false;
    this.pointerStartX = 0;
    this.hasDraggedPointer = false;
    this.activeScrubStrip = null;
    this.isAimMenuOpen = false;

    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
    this.boundTouchStart = (e) => this.handlePointerDown(e);
    this.boundTouchMove = (e) => this.handlePointerMove(e);
    this.boundTouchEnd = (e) => this.handlePointerUp(e);
    this.boundDocumentClick = (e) => this.handleDocumentClick(e);
    this.boundDocumentKey = (e) => this.handleDocumentKey(e);
  }

  /**
   * Updates the master locations catalog.
   * @param {Array<object>} catalog
   */
  setComprensoriCatalog(catalog) {
    if (Array.isArray(catalog) && catalog.length > 0) {
      this.comprensoriCatalog = catalog;
      if (this.container) {
        this.updateSpotSelectOptions();
        this.renderMapContent();
      }
    }
  }

  /**
   * Generates options HTML for the spot/locality selector dropdown based on active macro-region.
   * @returns {string}
   */
  renderSpotSelectOptions() {
    const spots = filterComprensoriByMacroRegion(this.comprensoriCatalog, this.activeMacroRegion);
    const sorted = [...spots].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it', { sensitivity: 'base' }));
    const defaultLabel = `Tutte le località (${sorted.length})`;
    const options = [
      `<option value="" ${!this.focusedSpotId ? 'selected' : ''}>${defaultLabel}</option>`
    ];
    for (const spot of sorted) {
      const isSelected = this.focusedSpotId === spot.id;
      const sub = spot.region || spot.country || '';
      const label = sub ? `${spot.name} (${sub})` : spot.name;
      options.push(`<option value="${spot.id}" ${isSelected ? 'selected' : ''}>${cleanUserText(label)}</option>`);
    }
    return options.join('');
  }

  /**
   * Refreshes the spot/locality selector options in DOM.
   */
  updateSpotSelectOptions() {
    if (!this.container) return;
    const select = this.container.querySelector('#gm-map-spot-select');
    if (select) {
      select.innerHTML = this.renderSpotSelectOptions();
      if (this.focusedSpotId) {
        select.value = this.focusedSpotId;
      } else {
        select.value = '';
      }
      if (select.selectedIndex === -1 && select.options.length > 0) {
        select.selectedIndex = 0;
      }
    }
  }

  /**
   * Retrieves the currently focused spot or fallback to top spot / first comprensorio.
   * @returns {object|null}
   */
  getFocusedSpot() {
    if (this.focusedSpotId) {
      const spot = this.comprensoriCatalog.find(s => s.id === this.focusedSpotId);
      if (spot) return spot;
    }
    return this.topSpot?.comprensorio || this.topSpot || this.comprensoriCatalog[0] || null;
  }

  /**
   * Gets display title for the currently focused spot in scrubber header.
   * @returns {string}
   */
  getFocusedSpotTitle() {
    const spot = this.getFocusedSpot();
    if (spot) {
      let weather = this.cachedWeatherMap.get(spot.id)?.weatherData;
      if (!weather) {
        const coords = getComprensorioCoordinates(spot);
        if (coords) {
          weather = generateSyntheticWeather({ lat: coords.lat, lon: coords.lon }, { days: 1, targetDate: this.activeDate });
        }
      }
      const evalSpot = evaluateComprensorio({
        comprensorio: spot,
        weatherData: weather,
        hourIndex: this.activeHour,
        glider: store.getState().activeGlider,
        allowSynthetic: true,
        targetDate: this.activeDate
      });
      return `${spot.name} (${evalSpot?.badge || 'N/D'})`;
    }
    return 'Osservazione Spot';
  }

  /**
   * Gets status color for the currently focused spot in scrubber header.
   * @returns {string}
   */
  getFocusedSpotStatusColor() {
    const spot = this.getFocusedSpot();
    if (spot) {
      let weather = this.cachedWeatherMap.get(spot.id)?.weatherData;
      if (!weather) {
        const coords = getComprensorioCoordinates(spot);
        if (coords) {
          weather = generateSyntheticWeather({ lat: coords.lat, lon: coords.lon }, { days: 1, targetDate: this.activeDate });
        }
      }
      const evalSpot = evaluateComprensorio({
        comprensorio: spot,
        weatherData: weather,
        hourIndex: this.activeHour,
        glider: store.getState().activeGlider,
        allowSynthetic: true,
        targetDate: this.activeDate
      });
      return STATUS_COLORS[evalSpot?.status]?.fill || 'var(--gm-text-secondary)';
    }
    return 'var(--gm-text-secondary)';
  }

  /**
   * Renders the continuous 13-hour timeline strip (08:00 - 20:00) with flyability indicators.
   * Matches ForecastView and Comprensorio Flight Analysis overlay specification.
   * 
   * @param {object|null} spot
   * @param {object|null} weatherData
   * @param {object} glider
   * @param {string} [stripId='map-timeline-strip']
   * @returns {string}
   */
  renderTimelineGrid(spot, weatherData, glider, stripId = 'map-timeline-strip') {
    const now = new Date();
    const todayIso = formatDateIso(now);
    const isToday = this.activeDate === todayIso;
    const currentHour = now.getHours();

    const hours = [];
    for (let h = 8; h <= 20; h++) {
      let evalHour = { status: 'unflyable', badge: 'Non Volabile' };
      if (spot) {
        evalHour = evaluateComprensorio({
          comprensorio: spot,
          weatherData,
          hourIndex: h,
          glider,
          targetDate: this.activeDate,
          allowSynthetic: true
        });
      }
      hours.push({
        hour: h,
        eval: evalHour,
        isActive: h === this.activeHour,
        isCurrentHour: isToday && (h === currentHour),
        isPast: isToday && (h < currentHour)
      });
    }

    return `
      <div id="${stripId}" class="gm-timeline-grid-13 gm-map-scrubber-slots" role="tablist" aria-label="Timeline oraria">
        ${hours.map(slot => {
          const h = slot.hour;
          const evalH = slot.eval;
          const weather = evalH.weatherSnapshot || {};
          const speed = Math.round(weather.windSpeed || 0);

          let fillPct = 35;
          let fillColor = 'var(--gm-status-unflyable)';
          let slotBgColor = 'var(--gm-status-unflyable-bg)';
          if (evalH.status === 'flyable') {
            fillPct = 100;
            fillColor = 'var(--gm-status-flyable)';
            slotBgColor = 'var(--gm-status-flyable-bg)';
          } else if (evalH.status === 'caution') {
            fillPct = 65;
            fillColor = 'var(--gm-status-caution)';
            slotBgColor = 'var(--gm-status-caution-bg)';
          }

          const stateClasses = [
            'gm-timeline-col gm-timeline-col-compact',
            slot.isActive ? 'active' : '',
            slot.isCurrentHour ? 'is-now' : '',
            slot.isPast ? 'is-past' : ''
          ].filter(Boolean).join(' ');

          return `
            <div 
              class="${stateClasses}"
              data-action="select-hour"
              data-hour="${h}"
              role="tab"
              aria-selected="${slot.isActive ? 'true' : 'false'}"
              aria-label="Ore ${String(h).padStart(2, '0')}:00, ${evalH.badge}, Vento ${speed} km/h${slot.isCurrentHour ? ' (Ora attuale)' : ''}"
              tabindex="${slot.isActive ? '0' : '-1'}"
            >
              ${slot.isCurrentHour ? '<span class="compact-now-badge" aria-label="Ora attuale">ORA</span>' : ''}
              <span class="compact-time">${String(h).padStart(2, '0')}</span>
              <div class="compact-bar" style="background-color: ${slotBgColor};">
                <div class="compact-bar-fill" data-slot-hour="${h}" style="height: ${fillPct}%; background-color: ${fillColor};"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  /**
   * Normalizes clientX coordinate across PointerEvents, MouseEvents, and TouchEvents.
   * @param {PointerEvent|TouchEvent|MouseEvent} evt
   * @returns {number}
   */
  getClientX(evt) {
    if (evt.clientX != null) return evt.clientX;
    if (evt.touches && evt.touches.length > 0) return evt.touches[0].clientX;
    if (evt.changedTouches && evt.changedTouches.length > 0) return evt.changedTouches[0].clientX;
    return 0;
  }

  /**
   * Handles pointerdown / touchstart on scrubber timeline to start continuous slide selection.
   * @param {PointerEvent|TouchEvent} evt
   */
  handlePointerDown(evt) {
    const strip = evt.target?.closest ? evt.target.closest('.gm-timeline-grid-13') : this.container?.querySelector('#map-timeline-strip');
    if (!strip) return;
    if (!strip.contains(evt.target) && evt.target !== strip) return;

    this.activeScrubStrip = strip;
    this.isScrubbing = true;
    this.pointerStartX = this.getClientX(evt);
    this.hasDraggedPointer = false;

    if (typeof document !== 'undefined' && document.activeElement && strip.contains(document.activeElement)) {
      try {
        document.activeElement.blur();
      } catch (_) {}
    }

    try {
      if (typeof strip.setPointerCapture === 'function' && evt.pointerId != null) {
        strip.setPointerCapture(evt.pointerId);
      }
    } catch (_) {}

    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', this.boundPointerMove, { passive: false });
      window.addEventListener('pointerup', this.boundPointerUp);
      window.addEventListener('pointercancel', this.boundPointerUp);
      window.addEventListener('touchmove', this.boundTouchMove, { passive: false });
      window.addEventListener('touchend', this.boundTouchEnd);
      window.addEventListener('touchcancel', this.boundTouchEnd);
    }

    this.updateHourFromPointer(evt, strip);
  }

  /**
   * Handles pointermove / touchmove on scrubber timeline during active slide.
   * @param {PointerEvent|TouchEvent} evt
   */
  handlePointerMove(evt) {
    if (!this.isScrubbing || !this.activeScrubStrip) return;
    if (evt && typeof evt.preventDefault === 'function' && evt.cancelable) {
      evt.preventDefault();
    }

    const curX = this.getClientX(evt);
    if (Math.abs(curX - this.pointerStartX) > 3) {
      this.hasDraggedPointer = true;
    }

    this.updateHourFromPointer(evt, this.activeScrubStrip);
  }

  /**
   * Handles pointerup/cancel to release scrubber pointer capture and window listeners.
   * @param {PointerEvent|TouchEvent} evt
   */
  handlePointerUp(evt) {
    if (!this.isScrubbing) return;
    this.isScrubbing = false;
    const strip = this.activeScrubStrip;
    this.activeScrubStrip = null;

    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', this.boundPointerMove);
      window.removeEventListener('pointerup', this.boundPointerUp);
      window.removeEventListener('pointercancel', this.boundPointerUp);
      window.removeEventListener('touchmove', this.boundTouchMove);
      window.removeEventListener('touchend', this.boundTouchEnd);
      window.removeEventListener('touchcancel', this.boundTouchEnd);
    }

    if (strip) {
      try {
        if (typeof strip.releasePointerCapture === 'function' && evt?.pointerId != null) {
          strip.releasePointerCapture(evt.pointerId);
        }
      } catch (_) {}
      if (typeof document !== 'undefined' && document.activeElement && strip.contains(document.activeElement)) {
        try {
          document.activeElement.blur();
        } catch (_) {}
      }
    }
    if (this.hasDraggedPointer) {
      setTimeout(() => {
        this.hasDraggedPointer = false;
      }, 100);
    }
  }

  /**
   * Computes the target hour from horizontal pointer coordinate and updates state.
   * @param {PointerEvent|TouchEvent} evt
   * @param {HTMLElement} strip
   */
  updateHourFromPointer(evt, strip) {
    if (!strip) return;
    const rect = typeof strip.getBoundingClientRect === 'function' ? strip.getBoundingClientRect() : null;

    if (rect && rect.width > 0) {
      const clientX = this.getClientX(evt);
      const relX = Math.max(0, Math.min(rect.width - 1, clientX - rect.left));
      const fraction = relX / rect.width;
      const hourIndex = Math.min(12, Math.max(0, Math.floor(fraction * 13)));
      const targetHour = 8 + hourIndex;
      if (targetHour !== this.activeHour) {
        this.setActiveHour(targetHour, true);
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          try { navigator.vibrate(8); } catch (_) {}
        }
      }
    } else {
      const target = evt.target;
      const col = target && typeof target.closest === 'function' ? target.closest('[data-hour]') : null;
      if (col) {
        const hour = parseInt(col.getAttribute('data-hour'), 10);
        if (!isNaN(hour) && hour >= 8 && hour <= 20 && hour !== this.activeHour) {
          this.setActiveHour(hour, true);
        }
      }
    }
  }

  /**
   * Mounts the Spot Map view into the specified container element.
   * @param {HTMLElement} containerEl
   * @param {object} [params]
   */
  mount(containerEl, params = {}) {
    this.container = containerEl;
    if (!this.container) return;

    if (this.container.classList) {
      this.container.classList.add('gm-view-map');
    }

    // Synchronize initial state from store
    const state = store.getState();
    if (Array.isArray(state.locationsCatalog) && state.locationsCatalog.length > 0) {
      this.comprensoriCatalog = state.locationsCatalog;
    }
    this.activeDate = state.activeDate || formatDateIso(new Date());
    if (typeof state.activeHourIndex === 'number' && state.activeHourIndex >= 8 && state.activeHourIndex <= 20) {
      this.activeHour = state.activeHourIndex;
    } else {
      this.activeHour = 12;
    }

    this.activeLayer = (state.ui && state.ui.mapLayer) || 'dark';
    this.activeTheme = (state.ui && state.ui.theme) || 'dark';
    this.focusedSpotId = state.selectedSpotId || null;

    if (params && params.macroRegion) {
      this.activeMacroRegion = params.macroRegion;
    }

    const activeGlider = state.activeGlider;
    const initialSpot = (this.focusedSpotId && this.comprensoriCatalog.find(s => s.id === this.focusedSpotId))
      || this.comprensoriCatalog[0]
      || null;
    let initialWeather = initialSpot ? this.cachedWeatherMap.get(initialSpot.id)?.weatherData : null;
    if (initialSpot && !initialWeather) {
      const coords = getComprensorioCoordinates(initialSpot);
      if (coords) {
        initialWeather = generateSyntheticWeather({ lat: coords.lat, lon: coords.lon }, { days: 1, targetDate: this.activeDate });
      }
    }

    // Build DOM structure with external top bar placed outside and above map canvas
    this.container.innerHTML = `
      <section class="gm-map-view" aria-label="Mappa Comprensori e Volabilità">
        <!-- Top External Filter Bar (Single compact row, strictly outside and above map canvas) -->
        <header class="gm-map-top-bar" role="toolbar" aria-label="Filtri mappa e comprensori">
          <div class="gm-map-top-bar-inner">
            <!-- Macro-Region Selector -->
            <div class="gm-map-region-wrap">
              <select id="gm-map-macro-region-select" class="gm-map-select" aria-label="Seleziona macro-regione">
                ${Object.values(MACRO_REGIONS).map(r => `
                  <option value="${r.id}" ${r.id === this.activeMacroRegion ? 'selected' : ''}>
                    ${r.name}
                  </option>
                `).join('')}
              </select>
            </div>

            <!-- Locality / Spot Direct Filter & Jump Selector -->
            <div class="gm-map-spot-wrap">
              <select id="gm-map-spot-select" class="gm-map-select" aria-label="Filtro e selezione località di volo">
                ${this.renderSpotSelectOptions()}
              </select>
            </div>

            <!-- Discrete Live Weather Status Badge -->
            <span id="gm-map-network-badge" class="gm-badge gm-badge-flyable" title="Stato connessione dati meteorologici Open-Meteo">
              Live
            </span>
          </div>
        </header>

        <!-- Map Canvas Wrapper (Positioned below top bar, fills remaining height) -->
        <div class="gm-map-canvas-wrapper">
          <!-- Map Canvas Mount Target -->
          <div id="gm-map-canvas" class="gm-map-canvas-container" role="application" aria-label="Cartografia interattiva decolli e comprensori"></div>

          <!-- Floating Map Controls (Inside Map Canvas, harmonized with Flight Analysis Overlay) -->
          <div class="gm-map-canvas-controls" role="toolbar" aria-label="Controlli mappa">
            <div class="gm-map-controls-left">
              <select id="gm-map-layer-select" class="gm-map-ctrl-select" aria-label="Seleziona layer cartografico">
                <option value="dark" ${this.activeLayer === 'dark' ? 'selected' : ''}>Scuro</option>
                <option value="topo" ${this.activeLayer === 'topo' ? 'selected' : ''}>OpenTopo</option>
                <option value="satellite" ${this.activeLayer === 'satellite' ? 'selected' : ''}>Satellite</option>
                <option value="streets" ${this.activeLayer === 'streets' ? 'selected' : ''}>CyclOSM</option>
              </select>
            </div>
            <div class="gm-map-controls-right">
              <div class="gm-aim-menu-wrap" id="gm-map-aim-wrap">
                <button 
                  type="button" 
                  id="gm-map-aim-trigger"
                  class="gm-map-ctrl-btn gm-aim-menu-trigger" 
                  data-action="toggle-aim-menu"
                  aria-haspopup="menu"
                  aria-expanded="false"
                  aria-label="Opzioni di puntamento"
                  title="Opzioni di puntamento e centratura mappa"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="8"></circle>
                    <line x1="12" y1="2" x2="12" y2="6"></line>
                    <line x1="12" y1="18" x2="12" y2="22"></line>
                    <line x1="2" y1="12" x2="6" y2="12"></line>
                    <line x1="18" y1="12" x2="22" y2="12"></line>
                    <circle cx="12" cy="12" r="2" fill="currentColor"></circle>
                  </svg>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="gm-aim-chevron" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>

                <div id="gm-map-aim-dropdown" class="gm-aim-dropdown hidden" role="menu" aria-label="Opzioni di puntamento">
                  <button 
                    type="button" 
                    id="gm-map-top-spot-btn" 
                    class="gm-aim-menu-item" 
                    data-action="center-comprensorio" 
                    role="menuitem"
                    title="Centra sul comprensorio o decollo"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                    </svg>
                    <span id="gm-top-spot-name">Comprensorio</span>
                  </button>

                  <button 
                    type="button" 
                    id="gm-map-gps-btn" 
                    class="gm-aim-menu-item" 
                    data-action="center-gps" 
                    role="menuitem"
                    title="Centra sulla tua posizione GPS attuale"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10"></circle>
                      <circle cx="12" cy="12" r="3"></circle>
                      <line x1="12" y1="2" x2="12" y2="6"></line>
                      <line x1="12" y1="18" x2="12" y2="22"></line>
                      <line x1="2" y1="12" x2="6" y2="12"></line>
                      <line x1="18" y1="12" x2="22" y2="12"></line>
                    </svg>
                    <span>Posizione GPS</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Bottom External Timeline Scrubber (Anchored below and strictly outside map canvas) -->
        <footer class="gm-map-scrubber-container" role="region" aria-label="Selettore orario volabilità">
          <div class="gm-map-scrubber-inner">
            <div class="gm-map-scrubber-header">
              <div class="gm-map-scrubber-title-group">
                <span class="gm-map-scrubber-title">Timeline Volabilità</span>
                <span id="gm-map-scrubber-spot-pill" class="gm-map-scrubber-spot-pill" title="Tocca per aprire la scheda spot" style="color: ${this.getFocusedSpotStatusColor()};">
                  ${this.getFocusedSpotTitle()}
                </span>
              </div>
              <div class="gm-map-scrubber-hour-display">
                <span id="gm-map-active-hour-label" class="gm-flight-alt">Ore ${String(this.activeHour).padStart(2, '0')}:00</span>
              </div>
            </div>

            ${this.renderTimelineGrid(initialSpot, initialWeather, activeGlider, 'map-timeline-strip')}
          </div>
        </footer>
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

    if (this.mapEngine && typeof this.mapEngine.invalidateSize === 'function') {
      setTimeout(() => {
        if (this.mapEngine) this.mapEngine.invalidateSize();
      }, 50);
    }

    // Bind UI Event Listeners
    this.bindEvents();

    // Subscribe to store updates
    if (typeof store.subscribe === 'function') {
      this.storeUnsub = store.subscribe(() => {
        const s = store.getState();
        // Check theme change (only when theme actually changes)
        if (s.ui && s.ui.theme && s.ui.theme !== this.activeTheme && this.mapEngine) {
          this.activeTheme = s.ui.theme;
          this.mapEngine.setTheme(this.activeTheme);
          this.activeLayer = (this.mapEngine.currentLayerId) || (this.activeTheme === 'light' ? 'topo' : 'dark');
          const select = this.container?.querySelector('#gm-map-layer-select');
          if (select) select.value = this.activeLayer;
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
          const spotSelect = this.container?.querySelector('#gm-map-spot-select');
          if (spotSelect && spotSelect.value !== s.selectedSpotId) {
            spotSelect.value = s.selectedSpotId;
          }
          this.renderMapContent();
        }
        // Check date change
        if (s.activeDate && s.activeDate !== this.activeDate) {
          this.activeDate = s.activeDate;
          this.renderMapContent();
        }
        // Check hour change
        if (typeof s.activeHourIndex === 'number' && s.activeHourIndex !== this.activeHour && s.activeHourIndex >= 8 && s.activeHourIndex <= 20) {
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
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', this.boundPointerMove);
      window.removeEventListener('pointerup', this.boundPointerUp);
      window.removeEventListener('pointercancel', this.boundPointerUp);
      window.removeEventListener('touchmove', this.boundTouchMove);
      window.removeEventListener('touchend', this.boundTouchEnd);
      window.removeEventListener('touchcancel', this.boundTouchEnd);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('click', this.boundDocumentClick);
      document.removeEventListener('keydown', this.boundDocumentKey);
    }
    if (this.container && this.container.classList) {
      this.container.classList.remove('gm-view-map');
    }
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

    // Locality / Spot direct selector
    const spotSelect = this.container.querySelector('#gm-map-spot-select');
    if (spotSelect) {
      if (this.focusedSpotId) {
        spotSelect.value = this.focusedSpotId;
      } else {
        spotSelect.value = '';
      }
      if (spotSelect.selectedIndex === -1 && spotSelect.options.length > 0) {
        spotSelect.selectedIndex = 0;
      }

      spotSelect.addEventListener('change', (e) => {
        const spotId = e.target.value;
        if (!spotId) {
          this.focusedSpotId = null;
          const regionConfig = Object.values(MACRO_REGIONS).find(r => r.id === this.activeMacroRegion) || MACRO_REGIONS.ALL;
          if (this.mapEngine) {
            this.mapEngine.setView(regionConfig.defaultCenter, regionConfig.defaultZoom);
          }
          this.renderMapContent();
          return;
        }

        const spot = this.comprensoriCatalog.find(s => s.id === spotId);
        if (spot) {
          this.focusedSpotId = spot.id;
          const coords = getComprensorioCoordinates(spot);
          if (coords && this.mapEngine) {
            this.mapEngine.flyTo(coords, 12);
            this.handleSpotFocus(spot);
            if (typeof this.mapEngine.openSpotPopup === 'function') {
              setTimeout(() => {
                this.mapEngine.openSpotPopup(spot.id);
              }, 300);
            }
          }
        }
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

    // Aim menu dropdown toggle
    const aimTrigger = this.container.querySelector('#gm-map-aim-trigger');
    if (aimTrigger) {
      aimTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleAimMenu();
      });
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('click', this.boundDocumentClick);
      document.addEventListener('keydown', this.boundDocumentKey);
    }

    // Top spot focus button
    const topSpotBtn = this.container.querySelector('#gm-map-top-spot-btn');
    if (topSpotBtn) {
      topSpotBtn.addEventListener('click', () => {
        this.closeAimMenu();
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

    // GPS location center button
    const gpsBtn = this.container.querySelector('#gm-map-gps-btn');
    if (gpsBtn) {
      gpsBtn.addEventListener('click', () => {
        this.closeAimMenu();
        this.centerOnUserLocation();
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

    // Timeline scrubber continuous drag & touch swipe
    const strip = this.container.querySelector('#map-timeline-strip') || this.container.querySelector('.gm-timeline-grid-13');
    if (strip) {
      strip.addEventListener('pointerdown', this.boundPointerDown);
      strip.addEventListener('touchstart', this.boundTouchStart, { passive: false });
      strip.addEventListener('click', (e) => {
        if (this.hasDraggedPointer) return;
        const col = e.target?.closest ? e.target.closest('[data-hour]') : null;
        if (col) {
          const hour = parseInt(col.getAttribute('data-hour'), 10);
          if (!isNaN(hour) && hour >= 8 && hour <= 20) {
            this.setActiveHour(hour, true);
          }
        }
      });
    }

    // Keep backwards compatibility for stepper buttons if present
    const prevBtn = this.container.querySelector('#gm-map-prev-hour-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.activeHour > 8) {
          this.setActiveHour(this.activeHour - 1, true);
        }
      });
    }

    const nextBtn = this.container.querySelector('#gm-map-next-hour-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (this.activeHour < 20) {
          this.setActiveHour(this.activeHour + 1, true);
        }
      });
    }
  }

  /**
   * Centers the map on the user's current GPS position.
   * @returns {SpotMapView}
   */
  centerOnUserLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return this;
    }
    const gpsBtn = this.container?.querySelector('#gm-map-gps-btn');
    if (gpsBtn) {
      gpsBtn.classList.add('loading');
      gpsBtn.setAttribute('aria-busy', 'true');
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (gpsBtn) {
          gpsBtn.classList.remove('loading');
          gpsBtn.removeAttribute('aria-busy');
        }
        const { latitude, longitude } = pos.coords;
        if (this.mapEngine && typeof this.mapEngine.showUserLocation === 'function') {
          this.mapEngine.showUserLocation(latitude, longitude);
        }
        if (this.mapEngine && typeof this.mapEngine.flyTo === 'function') {
          this.mapEngine.flyTo({ lat: latitude, lon: longitude }, 12);
        }
      },
      (err) => {
        if (gpsBtn) {
          gpsBtn.classList.remove('loading');
          gpsBtn.removeAttribute('aria-busy');
        }
        console.warn('[GlideMind Map] Geolocation error:', err?.message || err);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
    return this;
  }

  /**
   * Handles document click to close aim dropdown when clicking outside.
   * @param {MouseEvent} e
   */
  handleDocumentClick(e) {
    if (!this.isAimMenuOpen) return;
    const wrap = this.container?.querySelector('#gm-map-aim-wrap');
    if (wrap && !wrap.contains(e.target)) {
      this.closeAimMenu();
    }
  }

  /**
   * Handles document keydown (Escape) to close aim dropdown.
   * @param {KeyboardEvent} e
   */
  handleDocumentKey(e) {
    if (e.key === 'Escape' && this.isAimMenuOpen) {
      this.closeAimMenu();
    }
  }

  /**
   * Toggles or sets aim sub-menu open state.
   * @param {boolean} [forceOpen]
   */
  toggleAimMenu(forceOpen) {
    const wrap = this.container?.querySelector('#gm-map-aim-wrap');
    const trigger = this.container?.querySelector('#gm-map-aim-trigger');
    const dropdown = this.container?.querySelector('#gm-map-aim-dropdown');
    if (!dropdown || !trigger) return;

    const nextState = typeof forceOpen === 'boolean' ? forceOpen : !this.isAimMenuOpen;
    this.isAimMenuOpen = nextState;

    trigger.setAttribute('aria-expanded', String(nextState));
    trigger.classList.toggle('active', nextState);
    dropdown.classList.toggle('hidden', !nextState);
    if (wrap) {
      wrap.classList.toggle('active', nextState);
    }
  }

  /**
   * Closes aim sub-menu if open.
   */
  closeAimMenu() {
    if (!this.isAimMenuOpen) return;
    this.toggleAimMenu(false);
  }

  /**
   * Changes the active macro-region, re-centering the map and fetching data if needed.
   * @param {string} regionId
   */
  setMacroRegion(regionId) {
    this.activeMacroRegion = regionId;
    this.focusedSpotId = null;
    const regionConfig = Object.values(MACRO_REGIONS).find(r => r.id === regionId) || MACRO_REGIONS.ALL;

    if (this.mapEngine) {
      this.mapEngine.setView(regionConfig.defaultCenter, regionConfig.defaultZoom);
    }

    this.updateSpotSelectOptions();
    this.renderMapContent();
    this.syncMacroRegionWeather(regionId);
  }

  /**
   * Updates the selected hour index and triggers fast in-memory re-evaluation.
   * @param {number} hour
   * @param {boolean} [updateStore=true]
   */
  setActiveHour(hour, updateStore = true) {
    if (hour < 8 || hour > 20) return;
    if (this.activeHour === hour) return;
    this.activeHour = hour;

    if (updateStore && typeof store.setState === 'function') {
      store.setState({ activeHourIndex: hour });
    }

    if (this.container) {
      const activeLabel = this.container.querySelector('#gm-map-active-hour-label');
      if (activeLabel) activeLabel.textContent = `Ore ${String(hour).padStart(2, '0')}:00`;

      const prevBtn = this.container.querySelector('#gm-map-prev-hour-btn');
      if (prevBtn) prevBtn.disabled = hour <= 8;

      const nextBtn = this.container.querySelector('#gm-map-next-hour-btn');
      if (nextBtn) nextBtn.disabled = hour >= 20;

      const strip = this.container.querySelector('#map-timeline-strip') || this.container.querySelector('.gm-timeline-grid-13');
      if (strip) {
        const cols = strip.querySelectorAll ? strip.querySelectorAll('.gm-timeline-col-compact') : [];
        cols.forEach(col => {
          const colHour = parseInt(col.getAttribute('data-hour'), 10);
          const isActive = colHour === hour;
          col.classList.toggle('active', isActive);
          col.setAttribute('aria-selected', isActive ? 'true' : 'false');
          col.setAttribute('tabindex', isActive ? '0' : '-1');
        });
      }
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

    if (this.container) {
      const topNameEl = this.container.querySelector('#gm-top-spot-name');
      if (topNameEl) {
        topNameEl.textContent = this.topSpot?.name || 'Top Spot';
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
    let weather = this.cachedWeatherMap.get(spot.id)?.weatherData;
    if (!weather) {
      const coords = getComprensorioCoordinates(spot);
      if (coords) {
        weather = generateSyntheticWeather({ lat: coords.lat, lon: coords.lon }, { days: 1, targetDate: this.activeDate });
      }
    }
    const activeGlider = store.getState().activeGlider;

    const strip = this.container.querySelector('#map-timeline-strip') || this.container.querySelector('.gm-timeline-grid-13');
    if (strip) {
      this.hoursRange.forEach(h => {
        const col = strip.querySelector(`[data-hour="${h}"]`);
        if (col) {
          const evalAtH = evaluateComprensorio({
            comprensorio: spot,
            weatherData: weather,
            hourIndex: h,
            glider: activeGlider,
            allowSynthetic: true,
            targetDate: this.activeDate
          });
          let fillPct = 35;
          let fillColor = 'var(--gm-status-unflyable)';
          let slotBgColor = 'var(--gm-status-unflyable-bg)';
          if (evalAtH.status === 'flyable') {
            fillPct = 100;
            fillColor = 'var(--gm-status-flyable)';
            slotBgColor = 'var(--gm-status-flyable-bg)';
          } else if (evalAtH.status === 'caution') {
            fillPct = 65;
            fillColor = 'var(--gm-status-caution)';
            slotBgColor = 'var(--gm-status-caution-bg)';
          }

          const bar = col.querySelector('.compact-bar');
          const fill = col.querySelector('.compact-bar-fill');
          if (bar) bar.style.backgroundColor = slotBgColor;
          if (fill) {
            fill.style.height = `${fillPct}%`;
            fill.style.backgroundColor = fillColor;
          }

          const speed = Math.round(evalAtH.weatherSnapshot?.windSpeed || 0);
          col.setAttribute('aria-label', `Ore ${String(h).padStart(2, '0')}:00, ${evalAtH.badge}, Vento ${speed} km/h`);
        }
      });
    }

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
      badge.textContent = 'Sync...';
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
        badge.textContent = 'Live';
        badge.className = 'gm-badge gm-badge-flyable';
      }

      this.renderMapContent();
    } catch (err) {
      console.warn('[GlideMind Map] Background weather batch fetch error:', err);
      if (badge) {
        badge.textContent = 'Offline';
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
    if (spotId) {
      this.focusedSpotId = spotId;
      if (typeof store.setState === 'function') {
        if (store.getState().selectedSpotId !== spotId) {
          store.setState({ selectedSpotId: spotId });
        }
      }
    }
    if (this.container) {
      const spotSelect = this.container.querySelector('#gm-map-spot-select');
      if (spotSelect && spotId && spotSelect.value !== spotId) {
        spotSelect.value = spotId;
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
            <strong>Pericoli:</strong> ${cleanUserText(takeoff.hazards)}
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
