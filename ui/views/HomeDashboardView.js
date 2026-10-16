/**
 * GlideMind - Home Dashboard View Controller (ui/views/HomeDashboardView.js)
 * 
 * Aeronautical Glanceable UI (Colpo d'occhio):
 * - Clean high-density list: 3-4 comprensori visible on mobile at first glance
 * - Zero fluff: no decorative badges, no marketing taglines, zero clutter
 * - Zero PIN/favorites: direct meteorological flyability ranking (Volabile -> Cautela -> Non Volabile)
 * - T_best (decollo) + L_safe (atterraggio) + Explainability on 3 compact lines per card
 * - Entire card is touch-interactive (Fitts's law >= 48px)
 */

import { store } from '../../core/store.js';
import { router } from '../router.js';
import {
  DEFAULT_COMPRENSORI,
  evaluateComprensorio,
  sortEvaluatedComprensori,
  parseCoordinates,
  isSpotPinned,
  toggleSpotPin
} from '../../core/comprensorio.js';
import {
  DEFAULT_GLIDER,
  GLIDER_CLASSES,
  calculateDailyFlyabilitySummary,
  getCardinalDirection
} from '../../core/flyability.js';
import {
  PARAGLIDER_BRANDS,
  POPULAR_GLIDERS,
  searchGliders,
  getGliderById,
  createCustomGlider,
  getGliderClassDefaults
} from '../../core/gliders.js';
import {
  generateSyntheticWeather,
  enrichWeatherData,
  fetchBatchComprensoriWeather,
  getCachedWeatherData
} from '../../core/openMeteoApi.js';
import {
  calculatePilotPeriodMetrics,
  calculatePilotSafetyFactor,
  createFlightLogEntry,
  DEFAULT_SEED_FLIGHTS
} from '../../core/logbook.js';
import { parseIgc } from '../../core/igcParser.js';
import { logbookManager } from '../../core/logbookDb.js';
import { openSheet, closeSheet } from '../sheetManager.js';
import {
  getSmartDatePresets,
  getAvailableCalendarDates,
  getPastDatePresets,
  formatDateIso,
  WEEKDAY_HEADERS_MON
} from '../../core/datePresets.js';
import { resolveDaylightHours } from '../../core/daylight.js';
import { getFormattedVersion, getFormattedBuild } from '../../core/version.js';

/**
 * Escapes HTML strings to prevent XSS in view rendering.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Normalizes text for tolerant search matching (Postel's Law: accents, diacritics, case, whitespace).
 * @param {string} str
 * @returns {string}
 */
export function normalizeSearchText(str) {
  if (typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * HomeDashboardViewController implementation.
 */
export class HomeDashboardViewController {
  constructor(options = {}) {
    this.store = options.store || store;
    this.router = options.router || router;
    this.containerEl = null;
    this.storeUnsubscribe = null;
    this.boundClickHandler = this.handleClick.bind(this);
    this.boundKeyDownHandler = this.handleKeyDown.bind(this);
    this.boundFileInputHandler = this.handleFileInput.bind(this);
    this.boundSearchInputHandler = this.handleSearchInput.bind(this);
    this.boundInputHandler = this.handleInput.bind(this);
    this.boundDocumentClickHandler = this.handleDocumentClick.bind(this);
    
    this.isThemeMenuOpen = false;
    this.searchQuery = '';
    this.gliderSearchQuery = '';
    this.gliderSelectedBrand = '';
    this.comprensoriCatalog = options.comprensoriCatalog || (this.store && typeof this.store.getState === 'function' ? this.store.getState().locationsCatalog : null) || [...DEFAULT_COMPRENSORI];
    this.isLoading = false;
    this.pilotPeriod = 'month';
    this.flyabilityFilter = 'all'; // 'all' | 'flyable'
    this.networkStatus = 'offline'; // 'live' | 'loading' | 'offline'
    this.dismissedHorizonDate = null;
    this.cachedWeatherMap = new Map(); // key: spotId -> weatherPayload
    this._customFetchFn = options.fetchFn || null;
  }

  /**
   * Toggles the top bar theme dropdown menu.
   * @param {boolean} [forceOpen]
   */
  toggleThemeMenu(forceOpen) {
    this.isThemeMenuOpen = typeof forceOpen === 'boolean' ? forceOpen : !this.isThemeMenuOpen;
    if (this.containerEl) {
      const trigger = this.containerEl.querySelector('#gm-theme-menu-trigger');
      const dropdown = this.containerEl.querySelector('#gm-theme-menu-dropdown');
      if (trigger) {
        trigger.setAttribute('aria-expanded', this.isThemeMenuOpen ? 'true' : 'false');
      }
      if (dropdown) {
        if (this.isThemeMenuOpen) {
          dropdown.classList.remove('hidden');
        } else {
          dropdown.classList.add('hidden');
        }
      }
    }
  }

  /**
   * Closes the theme dropdown menu if open.
   */
  closeThemeMenu() {
    if (this.isThemeMenuOpen) {
      this.toggleThemeMenu(false);
    }
  }

  /**
   * Global document click handler to close theme menu when clicking outside.
   * @param {MouseEvent} evt
   */
  handleDocumentClick(evt) {
    if (!this.isThemeMenuOpen) return;
    const target = evt.target;
    if (!target) return;
    if (this.containerEl) {
      const menuContainer = this.containerEl.querySelector('.gm-theme-selector');
      if (menuContainer && typeof menuContainer.contains === 'function' && menuContainer.contains(target)) {
        return;
      }
    }
    this.closeThemeMenu();
  }

  /**
   * Safe navigation proxy supporting both router.navigate and router.navigateTo.
   * @param {string} route
   * @param {Object} [params]
   */
  navigateTo(route, params = {}) {
    if (!this.router) return;
    if (typeof this.router.navigate === 'function') {
      this.router.navigate(route, params);
    } else if (typeof this.router.navigateTo === 'function') {
      this.router.navigateTo(route, params);
    }
  }

  /**
   * Renders the discrete network status badge for Home Dashboard.
   * Per NOTE-003, the green "Live" pill only makes sense on an active spot,
   * so in Home Dashboard it remains hidden when live and only surfaces loading/offline states.
   * @returns {string}
   */
  renderLiveWeatherBadge() {
    if (this.networkStatus === 'loading') {
      return `
        <span id="gm-home-live-badge" class="gm-live-badge loading" title="Aggiornamento dati meteo in corso da Open-Meteo">
          <span class="gm-live-badge-dot" aria-hidden="true"></span>
          <span>Aggiornamento...</span>
        </span>
      `;
    }
    if (this.networkStatus === 'live') {
      return `<span id="gm-home-live-badge" class="gm-live-badge hidden" aria-hidden="true"></span>`;
    }
    return `
      <span id="gm-home-live-badge" class="gm-live-badge offline" title="Dati meteorologici simulati o offline">
        <span class="gm-live-badge-dot" aria-hidden="true"></span>
        <span>Offline / Stima</span>
      </span>
    `;
  }

  /**
   * In-place update of the live status badge in DOM to avoid jank.
   */
  updateLiveStatusBadgeInDom() {
    if (!this.containerEl) return;
    const badgeEl = this.containerEl.querySelector('#gm-home-live-badge');
    if (badgeEl) {
      badgeEl.outerHTML = this.renderLiveWeatherBadge();
    }
  }

  /**
   * Asynchronously fetches batch weather data for catalog comprensori in background.
   * Safe for browser environment; completely no-op in headless Node.js tests unless customFetch is provided.
   * @returns {Promise<Map<string, object>|null>}
   */
  async fetchBatchWeatherAsync() {
    const hasFetch = typeof window !== 'undefined' && typeof window.fetch === 'function';
    if (!hasFetch && !this._customFetchFn) {
      return null;
    }

    const state = this.store ? this.store.getState() : {};
    const targetDate = state.activeDate || formatDateIso(new Date());

    const pinnedIds = state.pinnedSpotIds || [];
    const favorites = this.comprensoriCatalog.filter(c => isSpotPinned(c, pinnedIds));
    const targetSpots = favorites.length > 0 ? favorites : this.comprensoriCatalog.slice(0, 30);

    const hasAnyCache = targetSpots.some(s => this.cachedWeatherMap.has(`${s.id}_${targetDate}`));
    if (!hasAnyCache) {
      this.isLoading = true;
      this.render();
    }

    this.networkStatus = 'loading';
    this.updateLiveStatusBadgeInDom();

    try {
      const batchMap = await fetchBatchComprensoriWeather(targetSpots, {
        targetDate,
        weatherModel: 'best_match',
        fetchFn: this._customFetchFn || (typeof window !== 'undefined' ? window.fetch.bind(window) : globalThis.fetch)
      });

      if (batchMap && batchMap.size > 0) {
        for (const [id, payload] of batchMap.entries()) {
          this.cachedWeatherMap.set(`${id}_${targetDate}`, payload);
          this.cachedWeatherMap.set(id, payload);
          if (Array.isArray(payload?.hourly?.time)) {
            const dates = new Set(
              payload.hourly.time
                .filter(t => typeof t === 'string' && t.length >= 10)
                .map(t => t.slice(0, 10))
            );
            for (const d of dates) {
              this.cachedWeatherMap.set(`${id}_${d}`, payload);
            }
          }
        }
        const hasStale = Array.from(batchMap.values()).some(v => v.isStaleOfflineFallback);
        this.networkStatus = hasStale ? 'offline' : 'live';
        return batchMap;
      } else {
        this.networkStatus = 'offline';
      }
    } catch (_) {
      this.networkStatus = 'offline';
    } finally {
      this.isLoading = false;
      this.render();
    }
    return null;
  }

  /**
   * Formats the spots count badge label distinguishing Home spots from active search filter results.
   * @param {Array<object>} evaluatedList
   * @returns {string}
   */
  formatSpotsCountLabel(evaluatedList) {
    const count = Array.isArray(evaluatedList) ? evaluatedList.length : 0;
    const hasSearch = Boolean(this.searchQuery && this.searchQuery.trim().length > 0);
    return hasSearch ? `Filtro: ${count} siti` : `${count} siti`;
  }

  /**
   * Updates only the spots list and count badge inside the DOM without replacing the search input.
   * Falls back to full render() if the section container is not mounted.
   * @returns {boolean} True if updated in-place
   */
  updateSpotsListSectionInDom() {
    if (!this.containerEl || typeof this.containerEl.querySelector !== 'function') {
      this.render();
      return false;
    }
    const listContainer = this.containerEl.querySelector('section[aria-labelledby="heading-comprensori"]');
    if (!listContainer) {
      this.render();
      return false;
    }
    const evaluatedList = this.getEvaluatedComprensori();
    const countBadge = listContainer.querySelector('#home-spots-count') || listContainer.querySelector('.flex.items-center.justify-between.text-xs span:last-child');
    if (countBadge) {
      countBadge.textContent = this.formatSpotsCountLabel(evaluatedList);
    }
    const existingList = listContainer.querySelector('#home-spots-list') || listContainer.querySelector('.flex.flex-col.gap-2');
    if (existingList) {
      existingList.outerHTML = this.renderComprensoriList(evaluatedList);
      return true;
    }
    this.render();
    return false;
  }

  /**
   * Updates the active comprensori catalog (e.g. when master catalog is loaded).
   * @param {Array<object>} catalog
   */
  setComprensoriCatalog(catalog) {
    if (!Array.isArray(catalog) || catalog.length === 0) return;
    this.comprensoriCatalog = catalog;

    // If search input is currently focused by the user, update only the list to avoid losing focus
    const searchInput = this.containerEl ? this.containerEl.querySelector('#home-spot-search') : null;
    const isSearchFocused = Boolean(searchInput && typeof document !== 'undefined' && document.activeElement === searchInput);

    if (isSearchFocused) {
      if (this.updateSpotsListSectionInDom()) {
        return;
      }
    }

    this.render();
  }

  /**
   * Mounts the view controller into the given DOM container.
   * @param {HTMLElement|null} containerEl
   * @param {object} [params]
   */
  mount(containerEl, params = {}) {
    this.containerEl = containerEl;

    // Subscribe to reactive store changes (weatherData, activeDate, selectedSpot, locationsCatalog, theme)
    if (this.store && typeof this.store.subscribe === 'function') {
      this.storeUnsubscribe = this.store.subscribe((state, prev) => {
        const themeChanged = Boolean(state.ui && prev?.ui && state.ui.theme !== prev.ui.theme);
        if (
          !prev ||
          state.weatherData !== prev.weatherData ||
          state.activeDate !== prev.activeDate ||
          state.locationsCatalog !== prev.locationsCatalog ||
          state.pinnedSpotIds !== prev.pinnedSpotIds ||
          state.activeGlider !== prev.activeGlider ||
          state.glider !== prev.glider ||
          state.usePilotCurrencyFactor !== prev.usePilotCurrencyFactor ||
          state.flights !== prev.flights ||
          themeChanged
        ) {
          const onlyPinnedChanged = Boolean(
            prev &&
            state.pinnedSpotIds !== prev.pinnedSpotIds &&
            state.weatherData === prev.weatherData &&
            state.activeDate === prev.activeDate &&
            state.locationsCatalog === prev.locationsCatalog &&
            state.activeGlider === prev.activeGlider &&
            state.glider === prev.glider &&
            state.usePilotCurrencyFactor === prev.usePilotCurrencyFactor &&
            state.flights === prev.flights &&
            !themeChanged
          );
          const hasActiveSearch = Boolean(this.searchQuery && this.searchQuery.trim().length > 0);

          if (state.locationsCatalog && state.locationsCatalog !== this.comprensoriCatalog) {
            this.setComprensoriCatalog(state.locationsCatalog);
          } else if (onlyPinnedChanged && hasActiveSearch) {
            this.updateSpotsListSectionInDom();
          } else {
            this.render();
          }
          if (!themeChanged && (state.activeDate !== prev?.activeDate || state.locationsCatalog !== prev?.locationsCatalog || state.pinnedSpotIds !== prev?.pinnedSpotIds)) {
            this.fetchBatchWeatherAsync();
          }
        }
      });
    }

    this.render();

    // Trigger asynchronous background batch fetch if in browser or customFetch is provided
    this.fetchBatchWeatherAsync();

    // Attach delegated events if in browser/DOM environment
    if (this.containerEl && typeof this.containerEl.addEventListener === 'function') {
      this.containerEl.addEventListener('click', this.boundClickHandler);
      this.containerEl.addEventListener('keydown', this.boundKeyDownHandler);
      this.containerEl.addEventListener('input', this.boundInputHandler);

      const fileInput = typeof this.containerEl.querySelector === 'function'
        ? this.containerEl.querySelector('#home-igc-file-input')
        : null;
      if (fileInput && typeof fileInput.addEventListener === 'function') {
        fileInput.addEventListener('change', this.boundFileInputHandler);
      }
    }

    // Attach delegated click listener to centralized modal sheet container
    this.sheetContainerEl = typeof document !== 'undefined' ? document.getElementById('sheet-container') : null;
    if (this.sheetContainerEl && typeof this.sheetContainerEl.addEventListener === 'function') {
      this.sheetContainerEl.addEventListener('click', this.boundClickHandler);
    }

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('click', this.boundDocumentClickHandler);
    }
  }

  /**
   * Unmounts the view controller, cleans up listeners and store subscriptions.
   */
  unmount() {
    this.closeThemeMenu();
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('click', this.boundDocumentClickHandler);
    }

    if (typeof this.storeUnsubscribe === 'function') {
      this.storeUnsubscribe();
      this.storeUnsubscribe = null;
    }

    if (this.containerEl && typeof this.containerEl.removeEventListener === 'function') {
      this.containerEl.removeEventListener('click', this.boundClickHandler);
      this.containerEl.removeEventListener('keydown', this.boundKeyDownHandler);
      this.containerEl.removeEventListener('input', this.boundInputHandler);
    }
    if (this.sheetContainerEl && typeof this.sheetContainerEl.removeEventListener === 'function') {
      this.sheetContainerEl.removeEventListener('click', this.boundClickHandler);
      this.sheetContainerEl = null;
    }

    this.containerEl = null;
  }

  /**
   * Resolves the effective active glider profile, attaching optional pilot safety factor when enabled.
   * @param {object|null} [state=null]
   * @returns {object}
   */
  getEffectiveGlider(state = null) {
    const st = state || (this.store ? this.store.getState() : {});
    const baseGlider = st.activeGlider || st.glider || DEFAULT_GLIDER;
    const usePilotFactor = Boolean(st.usePilotCurrencyFactor);
    if (!usePilotFactor) return baseGlider;

    const flights = st.flights || DEFAULT_SEED_FLIGHTS;
    const referenceDate = st.activeDate || formatDateIso(new Date());
    const pilotSafetyFactor = calculatePilotSafetyFactor({
      flights,
      referenceDate,
      enabled: true
    });
    return {
      ...baseGlider,
      pilotSafetyFactor
    };
  }

  /**
   * Evaluates comprensori and sorts them dynamically by flyability.
   * @param {boolean} [applyFlyFilter=true]
   * @returns {Array<object>}
   */
  getEvaluatedComprensori(applyFlyFilter = true) {
    const state = this.store ? this.store.getState() : {};
    const weatherData = state.weatherData || null;
    const activeGlider = this.getEffectiveGlider(state);
    const pinnedIds = state.pinnedSpotIds || [];

    // Filter catalog to include ONLY spots pinned as favorites from Forecast view
    const favoriteComprensori = this.comprensoriCatalog.filter(c => isSpotPinned(c, pinnedIds));

    const query = normalizeSearchText(this.searchQuery);
    const sourceComprensori = query
      ? this.comprensoriCatalog.filter(c => {
          const matchName = normalizeSearchText(c.name).includes(query);
          const matchProv = normalizeSearchText(c.province).includes(query);
          const matchLoc = normalizeSearchText(c.location).includes(query);
          const matchRegion = normalizeSearchText(c.region).includes(query);
          const matchTakeoffs = Array.isArray(c.takeoffs) && c.takeoffs.some(t => normalizeSearchText(t.name).includes(query));
          const matchLandings = Array.isArray(c.landings) && c.landings.some(l => normalizeSearchText(l.name).includes(query));
          return matchName || matchProv || matchLoc || matchRegion || matchTakeoffs || matchLandings;
        })
      : favoriteComprensori;

    const evaluated = [];
    const targetDate = state.activeDate || null;

    for (const comprensorio of sourceComprensori) {
      let spotWeather = null;
      const dateKey = targetDate ? `${comprensorio.id}_${targetDate}` : null;
      if (
        weatherData &&
        !weatherData._isSynthetic &&
        !weatherData.isSynthetic &&
        state.selectedSpot &&
        state.selectedSpot.id === comprensorio.id &&
        (!targetDate || !weatherData.hourly?.time || weatherData.hourly.time.some(t => typeof t === 'string' && t.startsWith(`${targetDate}T`)))
      ) {
        spotWeather = weatherData;
      } else if (dateKey && this.cachedWeatherMap.has(dateKey)) {
        const candidate = this.cachedWeatherMap.get(dateKey);
        if (!targetDate || !candidate.hourly?.time || candidate.hourly.time.some(t => typeof t === 'string' && t.startsWith(`${targetDate}T`)) || candidate.hourly.time.length <= 24) {
          spotWeather = candidate;
        }
      }
      if (!spotWeather && this.cachedWeatherMap.has(comprensorio.id)) {
        const candidate = this.cachedWeatherMap.get(comprensorio.id);
        if (!targetDate || !candidate.hourly?.time || candidate.hourly.time.some(t => typeof t === 'string' && t.startsWith(`${targetDate}T`)) || candidate.hourly.time.length <= 24) {
          spotWeather = candidate;
        }
      }
      if (!spotWeather && weatherData && (!state.selectedSpot || state.selectedSpot.id === comprensorio.id)) {
        if (!targetDate || !weatherData.hourly?.time || weatherData.hourly.time.some(t => typeof t === 'string' && t.startsWith(`${targetDate}T`)) || weatherData.hourly?.time?.length <= 24) {
          spotWeather = weatherData;
        }
      }
      if (!spotWeather && targetDate) {
        const primaryTakeoff = (comprensorio.takeoffs && comprensorio.takeoffs.find(t => t.isPrimary))
          || (comprensorio.takeoffs && comprensorio.takeoffs[0])
          || null;
        const tCoords = primaryTakeoff ? parseCoordinates(primaryTakeoff.coordinates) : null;
        if (tCoords) {
          const cached = getCachedWeatherData(tCoords, targetDate, { weatherModel: 'best_match' });
          if (cached && !cached.isStale) {
            spotWeather = cached;
            if (dateKey) this.cachedWeatherMap.set(dateKey, cached);
          }
        }
      }

      const searchMatch = query ? this.resolveSearchMatchContext(comprensorio, query) : null;
      const activeTakeoffId = searchMatch?.takeoffId || null;

      let result = evaluateComprensorio({
        comprensorio,
        weatherData: spotWeather,
        glider: activeGlider,
        pilotSafetyFactor: activeGlider.pilotSafetyFactor || null,
        takeoffId: activeTakeoffId,
        activeTakeoffId,
        targetDate,
        allowSynthetic: false
      });

      const diurnalTimeline = this.buildDiurnalTimeline(comprensorio, spotWeather, activeGlider, targetDate, activeTakeoffId);

      // Align daily card verdict with the diurnal timeline when multi-hour weather is present:
      // if a spot has >= 2 flyable hours during daylight, do not penalize the whole card because 14:00 alone is yellow/red.
      const windSpeedSeries = spotWeather?.hourly?.windspeed_10m ?? spotWeather?.hourly?.wind_speed_10m;
      if (spotWeather && Array.isArray(windSpeedSeries) && windSpeedSeries.length > 1) {
        const flyableSlots = diurnalTimeline.slots.filter(s => s.status === 'flyable');
        const cautionSlots = diurnalTimeline.slots.filter(s => s.status === 'caution');
        if (flyableSlots.length >= 2 && result.status !== 'flyable') {
          const repHour = flyableSlots[Math.floor(flyableSlots.length / 2)].hour;
          result = evaluateComprensorio({
            comprensorio,
            weatherData: spotWeather,
            hourIndex: repHour,
            glider: activeGlider,
            pilotSafetyFactor: activeGlider.pilotSafetyFactor || null,
            takeoffId: activeTakeoffId,
            activeTakeoffId,
            targetDate,
            allowSynthetic: false
          });
        } else if (flyableSlots.length === 0 && cautionSlots.length >= 2 && (result.status === 'unflyable' || result.status === 'severe')) {
          const repHour = cautionSlots[Math.floor(cautionSlots.length / 2)].hour;
          result = evaluateComprensorio({
            comprensorio,
            weatherData: spotWeather,
            hourIndex: repHour,
            glider: activeGlider,
            pilotSafetyFactor: activeGlider.pilotSafetyFactor || null,
            takeoffId: activeTakeoffId,
            activeTakeoffId,
            targetDate,
            allowSynthetic: false
          });
        }
      }

      result.diurnalTimeline = diurnalTimeline;
      result.searchMatch = searchMatch;

      evaluated.push(result);
    }

    const sorted = sortEvaluatedComprensori(evaluated);
    if (applyFlyFilter && this.flyabilityFilter === 'flyable') {
      return sorted.filter(item => item.status === 'flyable' || item.status === 'caution');
    }
    return sorted;
  }

  /**
   * Resolves contextual match information when a search query hits a sub-spot (takeoff/landing)
   * or municipality/region that is not already obvious from the comprensorio name.
   * @param {object} comprensorio
   * @param {string} normalizedQuery
   * @returns {{ type: string, label: string, takeoffId?: string, landingId?: string }|null}
   */
  resolveSearchMatchContext(comprensorio, normalizedQuery) {
    if (!comprensorio || !normalizedQuery) return null;
    const normName = normalizeSearchText(comprensorio.name);
    if (normName.includes(normalizedQuery)) return null;

    if (Array.isArray(comprensorio.takeoffs)) {
      const matchedTakeoffs = comprensorio.takeoffs.filter(t => normalizeSearchText(t.name).includes(normalizedQuery));
      if (matchedTakeoffs.length > 0) {
        const cleanNames = matchedTakeoffs.map(t => (t.name || '').replace(/^Decollo\s*/i, '').trim()).filter(Boolean);
        return {
          type: 'takeoff',
          label: `▲ ${cleanNames.join(' · ')}`,
          takeoffId: matchedTakeoffs[0].id
        };
      }
    }

    if (Array.isArray(comprensorio.landings)) {
      const matchedLandings = comprensorio.landings.filter(l => normalizeSearchText(l.name).includes(normalizedQuery));
      if (matchedLandings.length > 0) {
        const cleanNames = matchedLandings.map(l => (l.name || '').replace(/^Atterraggio\s*/i, '').trim()).filter(Boolean);
        return {
          type: 'landing',
          label: `⏚ ${cleanNames.join(' · ')}`,
          landingId: matchedLandings[0].id
        };
      }
    }

    if (comprensorio.location && normalizeSearchText(comprensorio.location).includes(normalizedQuery)) {
      return {
        type: 'location',
        label: comprensorio.location
      };
    }

    if (comprensorio.region && normalizeSearchText(comprensorio.region).includes(normalizedQuery)) {
      return {
        type: 'region',
        label: comprensorio.region
      };
    }

    return null;
  }

  /**
   * Builds the diurnal hourly flyability timeline (Sunrise -> Sunset) for a comprensorio card.
   * @param {object} comprensorio
   * @param {object|null} spotWeather
   * @param {object} activeGlider
   * @param {string|null} targetDate
   * @returns {{ sunriseHour: number, sunsetHour: number, sunriseStr: string, sunsetStr: string, slots: Array<{ hour: number, status: string, badge: string, reason: string }> }}
   */
  buildDiurnalTimeline(comprensorio, spotWeather, activeGlider, targetDate, activeTakeoffId = null) {
    if (!this._diurnalTimelineCache) {
      this._diurnalTimelineCache = new Map();
    }
    const dateIso = targetDate || (this.store ? this.store.getState().activeDate : null) || formatDateIso(new Date());
    const gliderKey = `${activeGlider?.id || activeGlider?.category || 'EN-A'}_${activeGlider?.pilotSafetyFactor?.multiplier || 1}_${activeTakeoffId || ''}`;
    const windArr = spotWeather?.hourly?.windspeed_10m ?? spotWeather?.hourly?.wind_speed_10m;
    const gustArr = spotWeather?.hourly?.windgusts_10m ?? spotWeather?.hourly?.wind_gusts_10m;
    const weatherTag = spotWeather
      ? `${spotWeather.hourly?.time?.[0] || 'w'}_${spotWeather.fetchTimestamp || ''}_${windArr?.[0] ?? ''}_${gustArr?.[0] ?? ''}`
      : 'offline';
    const cacheKey = `${comprensorio.id}_${dateIso}_${gliderKey}_${weatherTag}`;

    if (this._diurnalTimelineCache.has(cacheKey)) {
      return this._diurnalTimelineCache.get(cacheKey);
    }

    const daylight = resolveDaylightHours(spotWeather, dateIso, comprensorio);

    const slots = daylight.hours.map(hour => {
      if (!spotWeather) {
        return {
          hour,
          status: 'unavailable',
          badge: 'Dati N/D',
          reason: 'Previsione non disponibile offline',
          windSpeed: null
        };
      }
      const effectiveHourIdx = Array.isArray(windArr) && windArr.length <= 24 && windArr[hour] === undefined && windArr.length > 0 ? 0 : hour;
      const hourEval = evaluateComprensorio({
        comprensorio,
        weatherData: spotWeather,
        hourIndex: effectiveHourIdx,
        glider: activeGlider,
        pilotSafetyFactor: activeGlider?.pilotSafetyFactor || null,
        takeoffId: activeTakeoffId,
        activeTakeoffId,
        targetDate: dateIso,
        allowSynthetic: false
      });
      return {
        hour,
        status: hourEval.status || 'unavailable',
        badge: hourEval.badge || 'Dati N/D',
        reason: hourEval.reason || '',
        windSpeed: hourEval.weatherSnapshot?.windSpeed ?? null
      };
    });

    const timeline = {
      sunriseHour: daylight.sunriseHour,
      sunsetHour: daylight.sunsetHour,
      sunriseStr: daylight.sunriseStr,
      sunsetStr: daylight.sunsetStr,
      slots
    };
    this._diurnalTimelineCache.set(cacheKey, timeline);
    return timeline;
  }

  /**
   * Generates the entire HTML string for the Home Dashboard.
   * @returns {string}
   */
  renderHtml() {
    const state = this.store ? this.store.getState() : {};
    const allEvaluated = this.getEvaluatedComprensori(false);
    const evaluatedList = this.flyabilityFilter === 'flyable'
      ? allEvaluated.filter(item => item.status === 'flyable' || item.status === 'caution')
      : allEvaluated;
    const totalCount = allEvaluated.length;
    const flyableCount = allEvaluated.filter(item => item.status === 'flyable' || item.status === 'caution').length;
    const currentTheme = (state.ui && state.ui.theme) || 'dark';
    const themeIcons = {
      light: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`,
      dark: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`,
      auto: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`
    };
    const themeMeta = {
      light: { label: 'Chiaro', icon: themeIcons.light },
      dark: { label: 'Scuro', icon: themeIcons.dark },
      auto: { label: 'Auto', icon: themeIcons.auto }
    };
    const currentThemeMeta = themeMeta[currentTheme] || themeMeta.dark;

    const flights = state.flights || DEFAULT_SEED_FLIGHTS;
    const activeDate = state.activeDate || formatDateIso(new Date());
    const metrics = calculatePilotPeriodMetrics({
      flights,
      period: this.pilotPeriod,
      referenceDate: activeDate
    });
    const activeGlider = state.activeGlider || state.glider || DEFAULT_GLIDER;
    const usePilotFactor = Boolean(state.usePilotCurrencyFactor);
    const safetyFactor = calculatePilotSafetyFactor({
      flights,
      referenceDate: activeDate,
      enabled: usePilotFactor
    });

    let currencyBadgeHtml = '';
    if (metrics.currencyStatus !== 'active') {
      let cBadgeClass = 'gm-badge-nd';
      if (metrics.currencyStatus === 'reentry') {
        cBadgeClass = 'gm-badge-caution';
      } else if (metrics.currencyStatus === 'lapsed') {
        cBadgeClass = 'gm-badge-alert';
      }
      currencyBadgeHtml = `
        <span 
          id="home-pilot-currency-alert" 
          class="gm-badge ${cBadgeClass} gm-filter-currency-badge" 
          title="${escapeHtml(metrics.currencyDescription || metrics.currencyLabel)}"
        >
          ${escapeHtml(metrics.currencyLabel)}
        </span>
      `;
    }

    return `
      <div class="gm-home-view max-w-4xl mx-auto flex flex-col gap-2">
        <!-- Ultra-Clean Header (Glanceable, Version, Build Info & Expandable Theme Selector) -->
        <header class="gm-home-header">
          <div class="gm-header-brand">
            <img src="assets/icons/icon-192.png" alt="" width="22" height="22" class="gm-brand-icon gm-brand-icon-sm">
            <h1 class="gm-header-title">
              GlideMind
              <span class="gm-header-version">${escapeHtml(getFormattedVersion())}</span>
            </h1>
          </div>
          <div class="gm-header-meta">
            <span class="gm-header-build">${escapeHtml(getFormattedBuild())}</span>
            <div class="gm-theme-selector" role="region" aria-label="Selettore tema">
              <button 
                type="button" 
                id="gm-theme-menu-trigger"
                class="gm-theme-menu-trigger" 
                data-action="toggle-theme-menu" 
                aria-haspopup="true"
                aria-expanded="${this.isThemeMenuOpen ? 'true' : 'false'}"
                aria-controls="gm-theme-menu-dropdown"
                title="Cambia tema visivo (attivo: ${currentThemeMeta.label})"
              >
                <span class="gm-theme-trigger-icon" aria-hidden="true">${currentThemeMeta.icon}</span>
                <span class="gm-theme-trigger-label">${currentThemeMeta.label}</span>
                <span class="gm-theme-trigger-chevron" aria-hidden="true">▾</span>
              </button>
              <div 
                id="gm-theme-menu-dropdown" 
                class="gm-theme-dropdown ${this.isThemeMenuOpen ? '' : 'hidden'}" 
                role="menu" 
                aria-label="Opzioni tema visivo"
              >
                <button 
                  type="button" 
                  role="menuitem"
                  class="gm-theme-btn gm-theme-menu-item ${currentTheme === 'light' ? 'active' : ''}" 
                  data-action="set-theme" 
                  data-theme="light"
                  aria-pressed="${currentTheme === 'light' ? 'true' : 'false'}"
                  title="Tema chiaro (alta luminosità)"
                >
                  <span class="gm-theme-item-icon" aria-hidden="true">${themeIcons.light}</span>
                  <span class="gm-theme-item-text">Chiaro</span>
                  ${currentTheme === 'light' ? '<span class="gm-theme-item-check" aria-hidden="true">✓</span>' : ''}
                </button>
                <button 
                  type="button" 
                  role="menuitem"
                  class="gm-theme-btn gm-theme-menu-item ${currentTheme === 'dark' ? 'active' : ''}" 
                  data-action="set-theme" 
                  data-theme="dark"
                  aria-pressed="${currentTheme === 'dark' ? 'true' : 'false'}"
                  title="Tema scuro (antiriflesso)"
                >
                  <span class="gm-theme-item-icon" aria-hidden="true">${themeIcons.dark}</span>
                  <span class="gm-theme-item-text">Scuro</span>
                  ${currentTheme === 'dark' ? '<span class="gm-theme-item-check" aria-hidden="true">✓</span>' : ''}
                </button>
                <button 
                  type="button" 
                  role="menuitem"
                  class="gm-theme-btn gm-theme-menu-item ${currentTheme === 'auto' ? 'active' : ''}" 
                  data-action="set-theme" 
                  data-theme="auto"
                  aria-pressed="${currentTheme === 'auto' ? 'true' : 'false'}"
                  title="Tema automatico (di sistema)"
                >
                  <span class="gm-theme-item-icon" aria-hidden="true">${themeIcons.auto}</span>
                  <span class="gm-theme-item-text">Auto</span>
                  ${currentTheme === 'auto' ? '<span class="gm-theme-item-check" aria-hidden="true">✓</span>' : ''}
                </button>
              </div>
            </div>
          </div>
        </header>

        <!-- SEZIONE PRIMARIA: Volabilità SITI (Triage meteorologico immediato Above-the-Fold) -->
        <section aria-labelledby="heading-comprensori" class="flex flex-col gap-2">
          <div class="flex items-center justify-between text-xs text-[var(--gm-text-muted)] font-bold uppercase tracking-wider px-0.5">
            <h2 id="heading-comprensori">Volabilità</h2>
            <div class="flex items-center gap-2">
              ${this.renderLiveWeatherBadge()}
              <span id="home-spots-count" aria-live="polite">${this.formatSpotsCountLabel(evaluatedList)}</span>
            </div>
          </div>

          <!-- Smart Date Selector for Comprensori Flyability (Weekend & Quick Presets) -->
          ${this.renderDateBar(state)}

          <!-- Symbiotic Single-Row Toolbar: Search + Single Flyability Toggle + Active Glider Pill -->
          <div id="home-symbiotic-toolbar" class="gm-filter-chips gm-symbiotic-toolbar ${this.searchQuery ? 'is-searching' : ''}" role="group" aria-label="Ricerca, filtro volabilità e vela attiva">
            <div class="gm-search-wrapper gm-symbiotic-search">
              <svg class="gm-search-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" aria-hidden="true">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input 
                type="search" 
                id="home-spot-search" 
                class="gm-search-input" 
                placeholder="Ricerca..." 
                value="${escapeHtml(this.searchQuery)}" 
                autocomplete="off" 
                aria-label="Ricerca" 
                aria-controls="home-spots-list"
              />
              <button 
                type="button" 
                id="home-search-clear-btn" 
                class="gm-search-clear ${this.searchQuery ? '' : 'hidden'}" 
                data-action="clear-search" 
                aria-label="Cancella testo di ricerca" 
                title="Cancella ricerca"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <button 
              type="button" 
              id="btn-home-fly-filter-toggle"
              class="gm-filter-chip gm-fly-filter-toggle ${this.flyabilityFilter === 'flyable' ? 'active' : ''} ${this.searchQuery ? 'hidden' : ''}" 
              data-action="toggle-fly-filter" 
              data-filter="${this.flyabilityFilter === 'flyable' ? 'all' : 'flyable'}"
              aria-pressed="${this.flyabilityFilter === 'flyable'}"
              title="${this.flyabilityFilter === 'flyable' ? 'Filtro attivo: solo volabili o in cautela. Tocca per mostrare tutti i siti' : 'Mostra tutti i siti. Tocca per filtrare solo i siti volabili o in cautela'}"
            >
              ${this.flyabilityFilter === 'flyable' ? `Volabili (${flyableCount})` : `Tutti (${totalCount})`}
            </button>

            <div class="gm-filter-chips-right">
              ${currencyBadgeHtml}
              <button 
                type="button" 
                id="btn-home-select-glider"
                class="gm-glider-pill gm-glider-pill-compact" 
                data-action="open-glider-sheet" 
                aria-label="Cambia vela attiva, attualmente ${escapeHtml(activeGlider.name || 'Standard')}${usePilotFactor ? ` (${safetyFactor.shortLabel})` : ''}"
                title="Vela attiva: ${escapeHtml(activeGlider.name || 'Standard')} (VTrim: ${activeGlider.vTrim || 37} km/h · Efficienza: 1:${activeGlider.glideRatio || 8.2})${usePilotFactor ? ` • Prudenza adattata (${safetyFactor.shortLabel})` : ''}"
              >
                <span class="gm-glider-pill-name">
                  ${escapeHtml(activeGlider.name || 'Standard')}
                </span>
                ${usePilotFactor ? `<span class="gm-glider-pill-factor" title="${escapeHtml(safetyFactor.reasonTag || safetyFactor.shortLabel)}">${escapeHtml(safetyFactor.shortLabel)}</span>` : ''}
                <svg class="gm-glider-pill-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>
          </div>

          ${this.renderComprensoriList(evaluatedList)}
        </section>
      </div>
    `;
  }

  /**
   * Retrieves multi-day (14-day) flyability summaries for a reference spot.
   * @param {object|null} [spot=null]
   * @param {number} [days=14]
   * @returns {Array<object>}
   */
  getMultiDayFlyability(spot = null, days = 14) {
    const state = this.store ? this.store.getState() : {};
    const pinnedIds = state.pinnedSpotIds || [];
    const favorites = this.comprensoriCatalog.filter(c => isSpotPinned(c, pinnedIds));
    const targetSpot = spot || favorites[0] || this.comprensoriCatalog[0] || DEFAULT_COMPRENSORI[0];
    if (!targetSpot) return [];

    const effectiveGlider = this.getEffectiveGlider(state);
    const gliderKey = `${effectiveGlider.id || effectiveGlider.category || 'EN-A'}_${state.usePilotCurrencyFactor ? 'pf1' : 'pf0'}`;
    const today = new Date();
    const todayIso = formatDateIso(today);
    const key = `fly_home_multi_${targetSpot.id}_${todayIso}_${days}_${gliderKey}`;
    if (this._homeFlyCache && this._homeFlyCache[key]) {
      return this._homeFlyCache[key];
    }
    if (!this._homeFlyCache) this._homeFlyCache = {};

    const takeoff = (targetSpot.takeoffs && targetSpot.takeoffs[0]) ? targetSpot.takeoffs[0] : { altitude: 1000, heading: null };
    const coords = parseCoordinates(takeoff.coordinates) || { lat: 45.833, lon: 9.302 };
    let payload = null;

    const takeoffHeading = (takeoff && takeoff.heading != null && !isNaN(Number(takeoff.heading)))
      ? Number(takeoff.heading)
      : null;

    if (state.weatherData && state.weatherData.hourly?.time?.length >= 24 * days) {
      payload = state.weatherData;
    } else {
      const synthetic = generateSyntheticWeather(
        coords,
        {
          targetDate: todayIso,
          days,
          elevation: takeoff.altitude || 1000,
          takeoffAzimuth: takeoffHeading,
          weatherModel: 'best_match'
        }
      );
      payload = enrichWeatherData(synthetic, todayIso, Date.now(), {
        customHeading: takeoffHeading
      });
    }

    const summaries = calculateDailyFlyabilitySummary(payload, takeoff, effectiveGlider, days);
    this._homeFlyCache[key] = summaries;
    return summaries;
  }

  /**
   * Renders the compact Smart Date Bar with Prev/Next stepper and 1-line Quick Chips.
   * @param {object} state
   * @returns {string}
   */
  renderDateBar(state) {
    const resolvedState = state || (this.store ? this.store.getState() : {});
    const activeDate = resolvedState.activeDate || formatDateIso(new Date());
    const smartData = getSmartDatePresets(new Date(), activeDate);
    const quickList = smartData.quickPresets || smartData.presets.filter(p => !p.isCustom);

    return `
      <div class="gm-date-tabs mb-1" role="tablist" aria-label="Selettore data previsioni">
        <div class="gm-date-stepper" role="group" aria-label="Navigazione giorno precedente e successivo">
          <button
            type="button"
            class="gm-date-step-btn"
            data-action="prev-date"
            data-date="${smartData.prevDate}"
            ${!smartData.canPrev ? 'disabled aria-disabled="true"' : ''}
            aria-label="Giorno precedente"
            title="Giorno precedente (${smartData.prevDate})"
          >‹</button>

          <button 
            type="button" 
            class="gm-date-tab-calendar ${smartData.isCustomActive ? 'active' : ''}" 
            data-action="open-date-picker-sheet" 
            role="tab" 
            aria-selected="${smartData.isCustomActive ? 'true' : 'false'}"
            aria-label="Scegli data dal calendario (${escapeHtml(smartData.activeDisplayLabel)})" 
            title="Apri calendario 14 giorni (${escapeHtml(smartData.activeDisplayLabel)})"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true" class="gm-date-cal-icon">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <span class="gm-date-active-label">${escapeHtml(smartData.activeDisplayLabel)}</span>
            <span class="gm-date-cal-caret" aria-hidden="true">▾</span>
          </button>

          <button
            type="button"
            class="gm-date-step-btn"
            data-action="next-date"
            data-date="${smartData.nextDate}"
            ${!smartData.canNext ? 'disabled aria-disabled="true"' : ''}
            aria-label="Giorno successivo"
            title="Giorno successivo (${smartData.nextDate})"
          >›</button>
        </div>

        <div class="gm-date-quick-chips">
          ${quickList.map(p => `
            <button 
              type="button" 
              class="gm-date-tab ${p.isActive ? 'active' : ''}" 
              data-action="select-date" 
              data-date="${p.isoDate}" 
              role="tab" 
              aria-selected="${p.isActive ? 'true' : 'false'}" 
              title="${escapeHtml(p.label)} - ${escapeHtml(p.subLabel)}"
            >
              <span class="gm-date-tab-main">${escapeHtml(p.shortLabel || p.label)}</span>
            </button>
          `).join('')}
        </div>
      </div>
      ${smartData.activeHorizon && smartData.activeHorizon.isSynoptic && this.dismissedHorizonDate !== activeDate ? `
        <div class="gm-horizon-notice" role="status">
          <div class="gm-horizon-notice-body">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="gm-horizon-icon" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span><strong>Tendenza a lungo raggio:</strong> oltre 7 giorni le previsioni sono indicative.</span>
          </div>
          <button
            type="button"
            class="gm-warning-close-btn"
            data-action="dismiss-horizon-notice"
            aria-label="Chiudi avviso tendenza a lungo raggio"
            title="Chiudi avviso"
          >✕</button>
        </div>
      ` : ''}
    `;
  }

  /**
   * Renders the active search filter banner when a search query is filtering the catalog.
   * Clearly distinguishes catalog search results from spots genuinely pinned in the Home.
   * @param {Array<object>} evaluatedList
   * @returns {string}
   */
  renderSearchFilterBanner(evaluatedList) {
    const trimmedQuery = (this.searchQuery || '').trim();
    if (!trimmedQuery) return '';

    const state = this.store ? this.store.getState() : {};
    const pinnedIds = state.pinnedSpotIds || [];
    const pinnedInResults = evaluatedList.filter(item =>
      isSpotPinned(item.comprensorio || { id: item.comprensorioId || item.id, name: item.name }, pinnedIds)
    ).length;

    return `
      <div id="home-search-filter-banner" class="gm-search-filter-banner" role="status" aria-live="polite">
        <div class="gm-search-filter-banner-info">
          <span class="gm-search-filter-badge">Filtro ricerca</span>
          <span class="gm-search-filter-summary">
            Catalogo per «<strong>${escapeHtml(trimmedQuery)}</strong>» · ${evaluatedList.length} ${evaluatedList.length === 1 ? 'risultato' : 'risultati'} (${pinnedInResults} in Home)
          </span>
        </div>
        <button
          type="button"
          class="gm-search-filter-reset-btn"
          data-action="clear-search"
          aria-label="Chiudi filtro ricerca e torna ai comprensori della Home"
          title="Torna ai comprensori della Home"
        >
          <span>Torna a Home</span>
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    `;
  }

  /**
   * Renders the list of comprensori or search empty state.
   * @param {Array<object>} evaluatedList
   * @returns {string}
   */
  renderComprensoriList(evaluatedList) {
    if (this.isLoading) {
      return `
        <div id="home-spots-list" class="flex flex-col gap-2">
          <div class="gm-skeleton gm-skeleton-card"></div>
          <div class="gm-skeleton gm-skeleton-card"></div>
          <div class="gm-skeleton gm-skeleton-card"></div>
        </div>
      `;
    }

    const hasSearch = Boolean(this.searchQuery && this.searchQuery.trim().length > 0);
    const searchBannerHtml = hasSearch ? this.renderSearchFilterBanner(evaluatedList) : '';

    if (evaluatedList.length === 0) {
      if (this.searchQuery) {
        return `
          <div id="home-spots-list" class="flex flex-col gap-2 is-search-filtered">
            ${searchBannerHtml}
            <div class="gm-spot-card text-center py-4 px-3 flex flex-col items-center gap-2">
              <div class="text-xs font-semibold text-[var(--gm-text-primary)]">
                Nessuna località trovata per "${escapeHtml(this.searchQuery)}"
              </div>
              <p class="text-xs text-[var(--gm-text-muted)] max-w-xs">
                Verifica i termini digitati o ripristina la visualizzazione dei comprensori nella Home.
              </p>
              <button 
                type="button" 
                class="gm-btn-compact-accent mt-1" 
                data-action="clear-search"
              >
                Azzera ricerca
              </button>
            </div>
          </div>
        `;
      }
      if (this.flyabilityFilter === 'flyable') {
        return `
          <div id="home-spots-list" class="gm-spot-card text-center py-5 px-3 flex flex-col items-center gap-2">
            <div class="text-xs font-semibold text-[var(--gm-text-primary)]">
              Nessun sito attualmente volabile o in cautela
            </div>
            <p class="text-xs text-[var(--gm-text-muted)] max-w-xs">
              Le condizioni meteo per la data selezionata non presentano finestre favorevoli tra i comprensori visualizzati.
            </p>
            <button 
              type="button" 
              class="gm-btn-compact-accent mt-1" 
              data-action="set-fly-filter"
              data-filter="all"
            >
              Mostra tutti i siti
            </button>
          </div>
        `;
      }
      return `
        <div id="home-spots-list" class="gm-spot-card text-center py-6 px-4 flex flex-col items-center gap-2">
          <div class="text-sm font-semibold text-[var(--gm-text-primary)]">
            Nessuna località tra i preferiti
          </div>
          <p class="text-xs text-[var(--gm-text-muted)] max-w-xs">
            Cerca un comprensorio nella barra qui sopra e tocca «+ Home», oppure aggiungilo da Previsioni.
          </p>
          <div class="flex items-center gap-2 mt-1">
            <button 
              type="button" 
              class="gm-btn-compact-accent" 
              data-action="focus-home-search"
            >
              Cerca nel Catalogo
            </button>
            <button 
              type="button" 
              class="gm-btn-compact-primary" 
              data-action="go-to-forecast"
            >
              Vai a Previsioni
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div id="home-spots-list" class="flex flex-col gap-2 ${hasSearch ? 'is-search-filtered' : ''}">
        ${searchBannerHtml}
        ${evaluatedList.map(item => this.renderComprensorioCard(item)).join('')}
      </div>
    `;
  }

  /**
   * Builds the list of expressive determinant factor pills for a comprensorio card ([NOTE-001]).
   * @param {object} item
   * @param {object} timeline
   * @returns {Array<{ label: string, severityClass: string }>}
   */
  buildDeterminantReasonPills(item, timeline) {
    if (!item || item.status === 'unavailable') {
      return [{ label: 'Previsione non disponibile offline', severityClass: 'nd' }];
    }

    const pills = [];
    const w = item.weatherSnapshot || {};
    const windInd = item.indicators?.wind;
    const dirInd = item.indicators?.direction;
    const glideInd = item.indicators?.glide;

    // 1. Best diurnal flyable window pill if any hours are flyable
    if (timeline && Array.isArray(timeline.slots)) {
      const flyHours = timeline.slots.filter(s => s.status === 'flyable').map(s => s.hour);
      if (flyHours.length > 0) {
        const firstH = String(flyHours[0]).padStart(2, '0');
        const lastH = String(flyHours[flyHours.length - 1]).padStart(2, '0');
        const winLabel = flyHours.length === 1 ? `Finestra ${firstH}:00` : `Finestra ${firstH}:00–${lastH}:00`;
        pills.push({ label: winLabel, severityClass: 'flyable' });
      }
    }

    // 2. Rain pill (if precipitation > 0)
    if (typeof w.rain === 'number' && w.rain > 0) {
      pills.push({
        label: `Pioggia ${w.rain.toFixed(1)} mm`,
        severityClass: w.rain >= 0.5 ? 'severe' : 'unflyable'
      });
    }

    // 3. Wind & Gusts pill
    if (windInd && w.windSpeed != null) {
      const windSev = this.getSeverityClass(windInd.severity ?? 0);
      const gustPart = (w.windGust != null && w.windGust > w.windSpeed) ? ` · raff. ${w.windGust} km/h` : '';
      pills.push({
        label: `${windInd.label}: ${w.windSpeed} km/h${gustPart}`,
        severityClass: windSev
      });
    }

    // 4. Direction / Exposure pill
    if (dirInd && dirInd.hasExposure) {
      const dirSev = this.getSeverityClass(dirInd.severity ?? 0);
      pills.push({
        label: `${dirInd.label} (${dirInd.cardinal} ${dirInd.degrees}°)`,
        severityClass: dirSev
      });
    }

    // 5. Turbulence / Instability pill when significant
    if (typeof w.turbulence === 'number' && w.turbulence >= 0.22) {
      pills.push({
        label: `Turbolenza EDR ${w.turbulence.toFixed(2)}`,
        severityClass: w.turbulence >= 0.35 ? 'unflyable' : 'caution'
      });
    }
    if (typeof w.cape === 'number' && w.cape >= 800) {
      pills.push({
        label: `Instabilità CAPE ${Math.round(w.cape)} J/kg`,
        severityClass: w.cape >= 1500 ? 'unflyable' : 'caution'
      });
    }

    // 6. Glide / Landing cone pill
    if (glideInd && glideInd.requiredGlideRatio && glideInd.requiredGlideRatio !== '-') {
      const glideSev = this.getSeverityClass(glideInd.severity ?? 0);
      pills.push({
        label: `${glideInd.label} (1:${glideInd.requiredGlideRatio})`,
        severityClass: glideSev
      });
    }

    // 7. Pilot safety factor derating explanation
    if (item.reason && item.reason.includes('Meteo favorevole per la vela')) {
      pills.push({
        label: item.reason,
        severityClass: 'caution'
      });
    }

    return pills;
  }

  /**
   * Renders an individual compact glanceable Comprensorio Card (Option A: 2-Row Expressive Timeline).
   * Row 1: Spot Name + Province (+ contextual search match if searching sub-spot) | Flyability Badge (tap to expand reason pills) + Chevron
   * Row 2: Diurnal Flyability Timeline (Sunrise -> Sunset) with 1-tap hour deep-linking.
   * Row 3 (Expandable on badge tap): Determinant Factor Pills ([NOTE-001]) + Home Pin management.
   * @param {object} item - Evaluated comprensorio
   * @returns {string}
   */
  renderComprensorioCard(item) {
    const state = this.store ? this.store.getState() : {};
    const takeoff = item.takeoff || item.bestTakeoff || {};
    const landing = item.landing || item.safeLanding || {};
    const rawTakeoffName = takeoff.name || 'Decollo';
    const takeoffName = rawTakeoffName.replace(/^Decollo\s*/i, '').replace(/Col Campeggia\s*\/\s*/i, '');
    const landingName = (landing.name || 'Atterraggio').replace(/^Atterraggio\s*/i, '');
    const isUnavailable = item.status === 'unavailable';
    const timeline = item.diurnalTimeline || this.buildDiurnalTimeline(
      item.comprensorio || { id: item.comprensorioId || item.id, name: item.name, takeoffs: [takeoff], landings: [landing] },
      null,
      this.getEffectiveGlider(),
      state.activeDate || null
    );
    const reasonPills = this.buildDeterminantReasonPills(item, timeline);
    const isReasonsExpanded = Boolean(this.expandedReasonSpotIds && this.expandedReasonSpotIds.has(item.comprensorioId));
    const isPinned = isSpotPinned(
      item.comprensorio || { id: item.comprensorioId || item.id, name: item.name },
      state.pinnedSpotIds || []
    );
    const hasSearch = Boolean(this.searchQuery && this.searchQuery.trim().length > 0);

    let badgeClass = 'gm-badge-flyable';
    let badgeIcon = '✓';
    let badgeTitle = item.badge || 'Volabile';

    if (item.status === 'caution') {
      badgeClass = 'gm-badge-caution';
      badgeIcon = '▲';
    } else if (item.status === 'unflyable') {
      badgeClass = 'gm-badge-unflyable';
      badgeIcon = '✕';
    } else if (item.status === 'severe') {
      badgeClass = 'gm-badge-severe';
      badgeIcon = '⚡';
    } else if (isUnavailable) {
      badgeClass = 'gm-badge-nd';
      badgeIcon = '○';
    }

    return `
      <article 
        class="gm-spot-card gm-spot-card-timeline ${isUnavailable ? 'gm-spot-card-unavailable' : ''} ${isReasonsExpanded ? 'is-reasons-expanded' : ''} ${isPinned ? 'is-pinned-home' : 'is-unpinned-search'} ${hasSearch ? 'is-search-result' : ''}" 
        data-comprensorio-id="${escapeHtml(item.comprensorioId)}"
        data-takeoff-name="${escapeHtml(takeoffName)}"
        data-landing-name="${escapeHtml(landingName)}"
        data-pinned="${isPinned ? 'true' : 'false'}"
        ${item.searchMatch?.takeoffId ? `data-matched-takeoff-id="${escapeHtml(item.searchMatch.takeoffId)}"` : ''}
        data-action="view-forecast"
        data-id="${escapeHtml(item.comprensorioId)}"
        role="button"
        tabindex="0"
        aria-label="${escapeHtml(item.name)}, stato ${escapeHtml(badgeTitle)}, decollo ${escapeHtml(takeoffName)}, atterraggio ${escapeHtml(landingName)}"
      >
        <!-- Line 1: Spot Name + Province (+ Sub-spot Search Match) + Flyability Badge Toggle + Chevron -->
        <div class="gm-spot-header">
          <div class="gm-spot-title-group">
            <span class="gm-spot-name">${escapeHtml(item.name)}</span>
            ${item.province ? `<span class="gm-spot-prov">${escapeHtml(item.province)}</span>` : ''}
            ${hasSearch ? `
              <span class="gm-spot-origin-badge ${isPinned ? 'is-in-home' : 'is-catalog-only'}" title="${isPinned ? 'Comprensorio presente nella tua Home' : 'Risultato del filtro ricerca non presente nella Home'}">
                ${isPinned ? '✓ In Home' : 'Catalogo'}
              </span>
            ` : ''}
            ${item.searchMatch ? `
              <span class="gm-spot-search-match" data-match-type="${escapeHtml(item.searchMatch.type)}" title="Trovato per: ${escapeHtml(item.searchMatch.label)}">
                ${escapeHtml(item.searchMatch.label)}
              </span>
            ` : ''}
          </div>
          <div class="gm-spot-header-right">
            ${hasSearch ? `
              <button
                type="button"
                class="gm-home-pin-btn ${isPinned ? 'is-pinned' : 'is-unpinned'}"
                data-action="toggle-pin-spot"
                data-spot-id="${escapeHtml(item.comprensorioId)}"
                aria-pressed="${isPinned ? 'true' : 'false'}"
                title="${isPinned ? 'Presente nella Home. Tocca per rimuovere dalla Home' : 'Non nella Home. Tocca per aggiungere alla Home'}"
                aria-label="${isPinned ? `Rimuovi ${escapeHtml(item.name)} dalla Home` : `Aggiungi ${escapeHtml(item.name)} alla Home`}"
              >
                <span aria-hidden="true">${isPinned ? '✓' : '+'}</span>
                <span>${isPinned ? 'Home' : 'Home'}</span>
              </button>
            ` : ''}
            <button
              type="button"
              class="gm-spot-accordion-trigger"
              data-action="toggle-spot-reasons"
              data-id="${escapeHtml(item.comprensorioId)}"
              aria-expanded="${isReasonsExpanded ? 'true' : 'false'}"
              title="${escapeHtml(badgeTitle)}: ${escapeHtml(item.reason || 'Tocca per mostrare i fattori determinanti')}"
              aria-label="Stato ${escapeHtml(badgeTitle)}. Tocca per espandere o comprimere i dettagli del comprensorio"
            >
              <span class="gm-badge gm-badge-pill ${badgeClass} gm-spot-badge-toggle">
                <span aria-hidden="true">${badgeIcon}</span>
                <span class="gm-badge-text font-bold">${escapeHtml(badgeTitle)}</span>
              </span>
              <svg class="gm-spot-chevron ${isReasonsExpanded ? 'is-expanded' : ''}" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          </div>
        </div>

        <!-- Line 2: Diurnal Flyability Timeline (Sunrise -> Sunset, pure lightweight bars without hour numbers or selection box) -->
        <div 
          class="gm-home-timeline" 
          role="group" 
          aria-label="Timeline volabilità diurna da ${escapeHtml(timeline.sunriseStr)} a ${escapeHtml(timeline.sunsetStr)}"
        >
          ${timeline.slots.map(slot => `
            <button
              type="button"
              class="gm-home-timeline-slot status-${escapeHtml(slot.status)}"
              data-action="view-forecast-hour"
              data-id="${escapeHtml(item.comprensorioId)}"
              data-hour="${slot.hour}"
              title="${String(slot.hour).padStart(2, '0')}:00 — ${escapeHtml(slot.badge)}${slot.windSpeed != null ? ` (${slot.windSpeed} km/h)` : ''}${slot.reason ? `: ${escapeHtml(slot.reason)}` : ''}"
              aria-label="Ore ${String(slot.hour).padStart(2, '0')}:00, ${escapeHtml(slot.badge)}"
            >
              <span class="gm-home-timeline-bar"></span>
            </button>
          `).join('')}
        </div>

        <!-- Line 3 (Expandable on Badge Tap): Determinant Factor Pills ([NOTE-001]) + Home Pin Toggle -->
        <div 
          class="gm-spot-reasons-drawer gm-spot-explain gm-spot-micro-reason ${isReasonsExpanded ? 'is-expanded' : 'hidden'}"
          role="region"
          aria-label="Fattori determinanti di volabilità per ${escapeHtml(item.name)}"
        >
          ${reasonPills.map(pill => `
            <span class="gm-reason-pill pill-${escapeHtml(pill.severityClass)}">${escapeHtml(pill.label)}</span>
          `).join('')}
          <button
            type="button"
            class="gm-home-drawer-pin-btn ${isPinned ? 'is-pinned' : 'is-unpinned'}"
            data-action="toggle-pin-spot"
            data-spot-id="${escapeHtml(item.comprensorioId)}"
            aria-pressed="${isPinned ? 'true' : 'false'}"
            title="${isPinned ? 'Rimuovi questo comprensorio dalla Home' : 'Aggiungi questo comprensorio alla Home'}"
            aria-label="${isPinned ? `Rimuovi ${escapeHtml(item.name)} dalla Home` : `Aggiungi ${escapeHtml(item.name)} alla Home`}"
          >
            ${isPinned ? '✕ Rimuovi da Home' : '+ Aggiungi a Home'}
          </button>
        </div>
      </article>
    `;
  }

  /**
   * Maps numerical indicator severity to CSS state suffix.
   * @param {number} severity
   * @returns {string}
   */
  getSeverityClass(severity) {
    if (severity === 0) return 'flyable';
    if (severity === 1) return 'caution';
    if (severity === 2) return 'unflyable';
    if (severity === 3) return 'severe';
    return 'neutral';
  }

  /**
   * Renders the minimal traffic-light wind indicator with progressive disclosure.
   * @param {object} item
   * @returns {string}
   */
  renderWindIndicator(item) {
    const ind = item.indicators?.wind;
    if (!ind || ind.severity === -1) {
      return `
        <span class="gm-ind-pill gm-ind-neutral" title="Previsione non disponibile offline">
          <span class="gm-ind-dot" aria-hidden="true"></span>
          <span>Dati N/D</span>
          <span class="gm-ind-micro">-- km/h</span>
        </span>
      `;
    }
    const sevClass = this.getSeverityClass(ind.severity);
    return `
      <span class="gm-ind-pill gm-ind-${sevClass}" title="${escapeHtml(ind.desc || ind.fullText || '')}">
        <span class="gm-ind-dot" aria-hidden="true"></span>
        <span>${escapeHtml(ind.label)}</span>
        <span class="gm-ind-micro">${escapeHtml(ind.speedStr)}</span>
      </span>
    `;
  }

  /**
   * Renders the minimal traffic-light glide indicator with progressive disclosure.
   * @param {object} item
   * @returns {string}
   */
  renderGlideIndicator(item) {
    const ind = item.indicators?.glide;
    if (!ind || ind.severity === -1) {
      return `
        <span class="gm-ind-pill gm-ind-neutral" title="Efficienza non calcolabile">
          <span class="gm-glide-label">Efficienza</span>
          <span class="gm-ind-dot" aria-hidden="true"></span>
          <span>Dati N/D</span>
          <span class="gm-ind-micro">1:-</span>
        </span>
      `;
    }
    const sevClass = this.getSeverityClass(ind.severity);
    return `
      <span class="gm-ind-pill gm-ind-${sevClass}" title="Rapporto planata richiesto: 1:${ind.requiredGlideRatio} (limite sicuro: 1:${ind.safeLimit})">
        <span class="gm-glide-label">Efficienza</span>
        <span class="gm-ind-dot" aria-hidden="true"></span>
        <span>${escapeHtml(ind.label)}</span>
        <span class="gm-ind-micro">1:${escapeHtml(String(ind.requiredGlideRatio))}</span>
      </span>
    `;
  }

  /**
   * Renders Block 2: Pilot Currency, Flight Metrics & Flight Log Action.
   * @param {object} state
   * @returns {string}
   */
  renderPilotCurrencyBlock(state) {
    const flights = state.flights || DEFAULT_SEED_FLIGHTS;
    const activeDate = state.activeDate || formatDateIso(new Date());
    const metrics = calculatePilotPeriodMetrics({
      flights,
      period: this.pilotPeriod,
      referenceDate: activeDate
    });
    const activeGlider = state.activeGlider || state.glider || DEFAULT_GLIDER;

    const isMonth = this.pilotPeriod === 'month';
    let badgeClass = 'gm-badge-nd';
    if (metrics.currencyStatus === 'active') {
      badgeClass = 'gm-badge-flyable';
    } else if (metrics.currencyStatus === 'reentry') {
      badgeClass = 'gm-badge-caution';
    } else if (metrics.currencyStatus === 'lapsed') {
      badgeClass = 'gm-badge-alert';
    } else {
      badgeClass = 'gm-badge-nd';
    }

    return `
      <div class="gm-pilot-card">
        <!-- Header: Title, Status Badge & Period Toggle -->
        <div class="gm-pilot-header">
          <div class="gm-pilot-title-group">
            <span class="gm-pilot-title">Attività Pilota</span>
            <span class="gm-badge ${badgeClass} gm-badge-micro" title="${escapeHtml(metrics.currencyDescription || metrics.currencyLabel)}">
              ${escapeHtml(metrics.currencyLabel)}
            </span>
          </div>

          <!-- Period Toggle: 30 Giorni vs Anno -->
          <div class="gm-period-toggle" role="group" aria-label="Finestra temporale attività">
            <button 
              type="button" 
              class="gm-period-btn ${isMonth ? 'active' : ''}" 
              data-action="set-pilot-period" 
              data-period="month"
              aria-pressed="${isMonth}"
            >
              30 Giorni
            </button>
            <button 
              type="button" 
              class="gm-period-btn ${!isMonth ? 'active' : ''}" 
              data-action="set-pilot-period" 
              data-period="year"
              aria-pressed="${!isMonth}"
            >
              Anno
            </button>
          </div>
        </div>

        <!-- Active Glider Selector Row -->
        <div class="gm-pilot-glider-row">
          <span class="gm-glider-row-label">Vela Attiva</span>
          <button 
            type="button" 
            id="btn-home-select-glider"
            class="gm-glider-pill" 
            data-action="open-glider-sheet" 
            aria-label="Cambia vela attiva, attualmente ${escapeHtml(activeGlider.name || 'Standard')}"
          >
            <span class="gm-glider-pill-name">
              ${escapeHtml(activeGlider.name || 'Standard')}
            </span>
            <svg class="gm-glider-pill-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>

        <!-- 3-Column KPI Micro Grid (Ultra-Clean 2-line Value + Label) -->
        <div class="gm-pilot-kpis">
          <div class="gm-pilot-kpi-tile">
            <span class="gm-kpi-val">${escapeHtml(metrics.formattedHours)}</span>
            <span class="gm-kpi-label">Ore di Volo</span>
          </div>

          <div class="gm-pilot-kpi-tile">
            <span class="gm-kpi-val">${metrics.thermalSessions}</span>
            <span class="gm-kpi-label">Termica</span>
          </div>

          <div class="gm-pilot-kpi-tile">
            <span class="gm-kpi-val">${metrics.exerciseSessions}</span>
            <span class="gm-kpi-label">Esercizi</span>
          </div>
        </div>

        <!-- Actions Row -->
        <div class="gm-pilot-actions">
          <button 
            type="button" 
            id="btn-home-add-flight"
            class="gm-btn-compact-primary"
            data-action="open-add-flight-sheet"
            aria-label="Aggiungi nuovo log di volo nel flight log"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Registra Volo</span>
          </button>

          <div>
            <input type="file" id="home-igc-file-input" accept=".igc" class="hidden" />
            <button 
              type="button" 
              id="btn-home-upload-igc"
              class="gm-btn-compact-accent"
              data-action="upload-igc"
              aria-label="Carica nuova traccia IGC di volo nel logbook"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <span>Traccia IGC</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Opens the accessible bottom sheet to manually log a flight.
   */
  openAddFlightSheet() {
    const state = this.store ? this.store.getState() : {};
    const defaultDate = state.activeDate || formatDateIso(new Date());
    
    // Build select options from catalog
    const siteOptions = this.comprensoriCatalog.map(c => 
      `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)} (${escapeHtml(c.province || '')})</option>`
    ).join('');

    const contentHtml = `
      <form id="gm-add-flight-form" class="gm-log-form">
        <div class="gm-form-field">
          <label for="flight-date-input" class="gm-form-label">Data del Volo</label>
          <input type="date" id="flight-date-input" class="gm-form-control" value="${escapeHtml(defaultDate)}" required />
          <div class="gm-past-presets" role="group" aria-label="Scorciatoie data volo">
            ${getPastDatePresets(new Date()).map(p => `
              <button type="button" class="gm-past-preset-btn" data-action="set-flight-date" data-date="${escapeHtml(p.isoDate)}">
                ${escapeHtml(p.label)} (${escapeHtml(p.subLabel)})
              </button>
            `).join('')}
          </div>
        </div>

        <div class="gm-form-field">
          <label for="flight-site-select" class="gm-form-label">Località / Decollo</label>
          <select id="flight-site-select" class="gm-form-control">
            ${siteOptions}
            <option value="Altro spot">Altro spot / Fuori comprensorio</option>
          </select>
        </div>

        <div class="gm-form-field">
          <label for="flight-duration-input" class="gm-form-label">Durata (minuti)</label>
          <input type="number" id="flight-duration-input" class="gm-form-control" value="45" min="1" max="999" required />
          <div class="gm-duration-presets" role="group" aria-label="Preimpostazioni durata">
            <button type="button" class="gm-preset-btn" data-preset="15">+15m</button>
            <button type="button" class="gm-preset-btn" data-preset="30">+30m</button>
            <button type="button" class="gm-preset-btn" data-preset="45">+45m</button>
            <button type="button" class="gm-preset-btn" data-preset="60">+60m</button>
            <button type="button" class="gm-preset-btn" data-preset="90">+90m</button>
          </div>
        </div>

        <div class="gm-form-field">
          <label for="flight-igc-input" class="gm-form-label">Traccia GPS .igc (Opzionale)</label>
          <input type="file" id="flight-igc-input" accept=".igc" class="gm-form-control" />
          <span class="text-xs text-[var(--gm-text-muted)] block mt-1">
            Le attività (termica ed esercizi) e la durata vengono dedotte in automatico dalla traccia.
          </span>
        </div>

        <div class="gm-form-field">
          <label for="flight-notes-input" class="gm-form-label">Note & Debriefing (Opzionale)</label>
          <textarea id="flight-notes-input" class="gm-form-control" rows="2" placeholder="Note sul volo (es. quota raggiunta, veleggiato, manovre provate...)"></textarea>
        </div>

        <div class="gm-form-actions">
          <button type="button" class="gm-btn-compact-accent" id="btn-cancel-flight-log">Annulla</button>
          <button type="submit" class="gm-btn-compact-primary" id="btn-save-flight-log">Salva nel Flight Log</button>
        </div>
      </form>
    `;

    openSheet({
      id: 'add-flight-log',
      title: 'Nuovo Log di Volo',
      content: contentHtml,
      onOpen: () => {
        if (typeof document === 'undefined') return;
        const form = document.getElementById('gm-add-flight-form');
        if (!form) return;

        const durationInput = document.getElementById('flight-duration-input');
        const igcInput = document.getElementById('flight-igc-input');
        let parsedTrackPoints = null;

        // Past date preset buttons handler
        const pastDateBtns = form.querySelectorAll('.gm-past-preset-btn');
        pastDateBtns.forEach(btn => {
          btn.addEventListener('click', () => {
            const dateAttr = btn.getAttribute('data-date');
            const dateInput = document.getElementById('flight-date-input');
            if (dateInput && dateAttr) {
              dateInput.value = dateAttr;
            }
          });
        });

        // Preset chips handler
        const presetBtns = form.querySelectorAll('.gm-preset-btn');
        presetBtns.forEach(btn => {
          btn.addEventListener('click', () => {
            const val = parseInt(btn.getAttribute('data-preset'), 10);
            if (durationInput && !isNaN(val)) {
              durationInput.value = val;
            }
          });
        });

        // Optional IGC track reader for automated activity deduction
        if (igcInput) {
          igcInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = (readEvt) => {
                try {
                  const parsed = parseIgc(readEvt.target.result, this.comprensoriCatalog);
                  if (parsed) {
                    parsedTrackPoints = parsed.points;
                    const dateInput = document.getElementById('flight-date-input');
                    const durInput = document.getElementById('flight-duration-input');
                    const notesInput = document.getElementById('flight-notes-input');

                    if (dateInput && parsed.metadata && parsed.metadata.date) {
                      dateInput.value = parsed.metadata.date;
                    }
                    if (durInput && parsed.statistics && parsed.statistics.durationMinutes) {
                      durInput.value = parsed.statistics.durationMinutes;
                    }
                    if (notesInput && !notesInput.value) {
                      notesInput.value = `Traccia ${file.name}`;
                    }
                  }
                } catch (err) {
                  console.warn('Error reading IGC track:', err);
                }
              };
              reader.readAsText(file);
            }
          });
        }

        let isDirty = false;
        const markDirty = () => { isDirty = true; };
        const dateInputEl = document.getElementById('flight-date-input');
        const siteSelectEl = document.getElementById('flight-site-select');
        const notesInputEl = document.getElementById('flight-notes-input');
        if (dateInputEl) dateInputEl.addEventListener('change', markDirty);
        if (siteSelectEl) siteSelectEl.addEventListener('change', markDirty);
        if (durationInput) durationInput.addEventListener('input', markDirty);
        if (notesInputEl) notesInputEl.addEventListener('input', markDirty);

        // Cancel button with dirty state guard
        const cancelBtn = document.getElementById('btn-cancel-flight-log');
        if (cancelBtn) {
          cancelBtn.addEventListener('click', () => {
            if (isDirty && typeof window !== 'undefined' && typeof window.confirm === 'function') {
              if (!window.confirm('Ci sono modifiche non salvate nel log di volo. Chiudere comunque?')) {
                return;
              }
            }
            closeSheet();
          });
        }

        // Form submit - automatically deduces activities (thermals & exercises)
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const dateInput = document.getElementById('flight-date-input');
          const siteSelect = document.getElementById('flight-site-select');
          const notesInput = document.getElementById('flight-notes-input');

          const newEntry = createFlightLogEntry({
            date: dateInput ? dateInput.value : defaultDate,
            site: siteSelect ? siteSelect.value : 'Località',
            durationMinutes: durationInput ? parseInt(durationInput.value, 10) : 45,
            trackPoints: parsedTrackPoints,
            notes: notesInput ? notesInput.value : ''
          });

          if (this.store) {
            const currentFlights = this.store.getState().flights || [];
            this.store.setState({
              flights: [newEntry, ...currentFlights]
            });
          }

          if (logbookManager && typeof logbookManager.saveFlight === 'function') {
            logbookManager.saveFlight(
              newEntry,
              parsedTrackPoints ? { id: newEntry.id, decimatedPoints: parsedTrackPoints } : null
            ).catch(() => {});
          }

          closeSheet();
          this.render();
        });
      }
    });
  }

  /**
   * Generates HTML for the paraglider model cards list based on current search & brand filters.
   * @param {object} currentGlider
   * @returns {string}
   */
  renderGliderModelsList(currentGlider = {}) {
    const models = searchGliders({
      query: this.gliderSearchQuery,
      brand: this.gliderSelectedBrand
    });

    if (models.length === 0) {
      return `
        <div class="gm-glider-empty text-center py-4 px-3 text-xs text-[var(--gm-text-muted)]">
          Nessuna vela trovata per "${escapeHtml(this.gliderSearchQuery || this.gliderSelectedBrand)}". Prova a cercare un'altra marca o modello.
        </div>
      `;
    }

    return models.map(glider => {
      const isSelected = (currentGlider.id && currentGlider.id === glider.id) ||
        (currentGlider.brand && currentGlider.model && currentGlider.brand === glider.brand && currentGlider.model === glider.model);
      const catClass = (glider.category || 'en-a').toLowerCase().replace(/[^a-z0-9]/g, '-');

      return `
        <button 
          type="button" 
          class="gm-glider-option-card ${isSelected ? 'active' : ''}" 
          data-action="select-glider-model" 
          data-glider-id="${escapeHtml(glider.id)}"
          role="radio"
          aria-checked="${isSelected}"
        >
          <div class="flex items-center justify-between w-full">
            <div class="flex items-center gap-3">
              <div class="flex flex-col text-left">
                <span class="font-bold text-sm text-[var(--gm-text-primary)]">${escapeHtml(glider.brand)} ${escapeHtml(glider.model)}</span>
                <span class="text-xs text-[var(--gm-text-muted)]">Trim: ${glider.vTrim} km/h • Max: ${glider.vMax} km/h • Efficienza: 1:${glider.glideRatio} • AR: ${glider.ar}</span>
              </div>
            </div>
            <span class="gm-glider-check ${isSelected ? 'selected' : ''}" aria-hidden="true">${isSelected ? '✓' : ''}</span>
          </div>
        </button>
      `;
    }).join('');
  }

  /**
   * Opens the accessible bottom sheet to select the active glider / wing brand and model,
   * and configure the optional Pilot Currency & Experience safety factor.
   */
  openGliderSheet() {
    const state = this.store ? this.store.getState() : {};
    const currentGlider = state.activeGlider || state.glider || DEFAULT_GLIDER;
    const currentCategory = currentGlider.category || 'EN-A';
    const classes = Object.values(GLIDER_CLASSES);
    const flights = state.flights || DEFAULT_SEED_FLIGHTS;
    const activeDate = state.activeDate || formatDateIso(new Date());
    const usePilotFactor = Boolean(state.usePilotCurrencyFactor);
    const safetyFactor = calculatePilotSafetyFactor({
      flights,
      referenceDate: activeDate,
      enabled: usePilotFactor
    });
    const deratingPct = safetyFactor.rawMultiplier < 1.0
      ? `-${Math.round((1 - safetyFactor.rawMultiplier) * 100)}%`
      : '100% (Standard)';

    const contentHtml = `
      <div class="gm-glider-sheet flex flex-col gap-3">
        <p class="text-xs text-[var(--gm-text-muted)] leading-relaxed">
          Seleziona la tua vela per marca e modello o per classe di omologazione. Le velocità di trim, accelerata e l'efficienza limite di rientro verso l'atterraggio sicuro vengono personalizzate per il tuo inviluppo di volo.
        </p>

        <!-- Optional Pilot Currency & Experience Factor Toggle -->
        <button
          type="button"
          id="glider-sheet-currency-factor-card"
          class="gm-glider-option-card ${usePilotFactor ? 'active' : ''}"
          data-action="toggle-pilot-currency-factor"
          role="switch"
          aria-checked="${usePilotFactor ? 'true' : 'false'}"
        >
          <div class="flex items-center justify-between w-full gap-3">
            <div class="flex flex-col text-left">
              <div class="flex items-center gap-2">
                <span class="font-bold text-sm text-[var(--gm-text-primary)]">Adatta prudenza a continuità e storico voli</span>
                <span class="gm-badge ${usePilotFactor ? 'gm-badge-flyable' : 'gm-badge-nd'} text-[0.65rem] px-1.5 py-0.5">
                  ${usePilotFactor ? 'Attivo' : 'Opzionale'}
                </span>
              </div>
              <span class="text-xs text-[var(--gm-text-secondary)] mt-0.5">
                Stato: ${escapeHtml(safetyFactor.currencyLabel)} (${safetyFactor.totalFlights} voli nel Logbook) • Soglie pilotaggio: <strong>${deratingPct}</strong>
              </span>
              <span class="text-[0.68rem] text-[var(--gm-text-muted)] mt-0.5 leading-snug">
                Riduce in modo conservativo i margini su raffiche, turbolenza e vento traverso senza alterare velocità di trim o efficienza planata della vela.
              </span>
            </div>
            <span class="gm-glider-check ${usePilotFactor ? 'selected' : ''}" aria-hidden="true">${usePilotFactor ? '✓' : '○'}</span>
          </div>
        </button>

        <!-- Brand & Model Fast Search -->
        <div class="gm-glider-search-wrap">
          <input 
            type="text" 
            id="glider-search-input" 
            class="gm-glider-search" 
            placeholder="Cerca marca o modello (es. Buzz, Mentor, Iota, Hook...)"
            value="${escapeHtml(this.gliderSearchQuery || '')}"
            autocomplete="off"
            aria-label="Cerca vela per marca o modello"
          />
        </div>

        <!-- Quick Brand Filter Chips -->
        <div class="gm-glider-brand-chips" role="group" aria-label="Filtro per costruttore">
          <button 
            type="button" 
            class="gm-glider-brand-chip ${!this.gliderSelectedBrand ? 'active' : ''}" 
            data-action="filter-glider-brand" 
            data-brand=""
          >
            Tutte (${POPULAR_GLIDERS.length})
          </button>
          ${PARAGLIDER_BRANDS.map(brand => `
            <button 
              type="button" 
              class="gm-glider-brand-chip ${this.gliderSelectedBrand === brand ? 'active' : ''}" 
              data-action="filter-glider-brand" 
              data-brand="${escapeHtml(brand)}"
            >
              ${escapeHtml(brand)}
            </button>
          `).join('')}
        </div>

        <!-- Filtered Models Catalog List -->
        <div id="glider-models-list" class="gm-glider-models-list flex flex-col gap-2" role="radiogroup" aria-label="Modelli a catalogo">
          ${this.renderGliderModelsList(currentGlider)}
        </div>

        <!-- Generic Profile Baseline Selection (EN-A to EN-D) -->
        <div class="gm-glider-section-divider">
          <span class="text-xs font-bold uppercase tracking-wider text-[var(--gm-text-muted)]">Oppure Profilo Generico</span>
        </div>
        <div class="flex flex-col gap-2" role="radiogroup" aria-label="Classe generica vela">
          ${classes.map(cls => {
            const isSelected = cls.category === currentCategory && !currentGlider.brand;
            return `
              <button 
                type="button" 
                class="gm-glider-option-card ${isSelected ? 'active' : ''}" 
                data-action="select-glider" 
                data-category="${cls.category}"
                role="radio"
                aria-checked="${isSelected}"
              >
                <div class="flex items-center justify-between w-full">
                  <div class="flex items-center gap-3">
                    <span class="gm-glider-badge ${cls.category.toLowerCase()}">${cls.category}</span>
                    <div class="flex flex-col text-left">
                      <span class="font-bold text-sm text-[var(--gm-text-primary)]">${escapeHtml(cls.name)}</span>
                      <span class="text-xs text-[var(--gm-text-muted)]">Trim: ${cls.vTrim} km/h • Max: ${cls.vMax} km/h • Efficienza: 1:${cls.glideRatio}</span>
                    </div>
                  </div>
                  <span class="gm-glider-check ${isSelected ? 'selected' : ''}" aria-hidden="true">${isSelected ? '✓' : ''}</span>
                </div>
              </button>
            `;
          }).join('')}
        </div>

        <!-- Custom Glider Manual Configuration Form (Tesler's & Postel's Law) -->
        <details class="gm-glider-custom-details">
          <summary class="text-xs font-semibold text-[var(--gm-text-muted)] cursor-pointer py-1">
            + Configura vela personalizzata non a catalogo
          </summary>
          <div class="gm-glider-custom-form flex flex-col gap-2 mt-2 pt-2 border-t border-[var(--gm-border)]">
            <div class="flex gap-2">
              <input 
                type="text" 
                id="custom-glider-brand" 
                class="gm-form-control flex-1 text-xs" 
                placeholder="Marca (es. Swing)" 
              />
              <input 
                type="text" 
                id="custom-glider-model" 
                class="gm-form-control flex-1 text-xs" 
                placeholder="Modello (es. Nyos 2 RS)" 
              />
            </div>
            <div class="flex items-center gap-2">
              <select id="custom-glider-category" class="gm-form-control text-xs flex-1">
                <option value="EN-A">EN-A (Scuola)</option>
                <option value="EN-B" selected>EN-B (Intermedio)</option>
                <option value="EN-C">EN-C (Sport)</option>
                <option value="EN-D">EN-D / CCC (Competizione)</option>
              </select>
              <button 
                type="button" 
                class="gm-btn-compact-primary" 
                data-action="save-custom-glider"
              >
                Salva Vela
              </button>
            </div>
          </div>
        </details>
      </div>
    `;

    openSheet({
      id: 'select-glider-sheet',
      title: 'Vela Attiva: Marca e Modello',
      content: contentHtml,
      onOpen: () => {
        if (typeof document !== 'undefined') {
          const searchInput = document.getElementById('glider-search-input');
          if (searchInput) {
            searchInput.addEventListener('input', (e) => {
              this.gliderSearchQuery = e.target.value || '';
              const listContainer = document.getElementById('glider-models-list');
              if (listContainer) {
                listContainer.innerHTML = this.renderGliderModelsList(this.store ? this.store.getState().activeGlider : {});
              }
            });
          }
        }
      }
    });
  }

  /**
   * Opens the accessible bottom sheet to select any date within the forecast horizon (up to 14 days).
   * Symmetric with ForecastView: uses a 7-column Monday-Sunday 2-week grid with semantic 4-color legend.
   */
  openDatePickerSheet() {
    const state = this.store ? this.store.getState() : {};
    const activeDate = state.activeDate || formatDateIso(new Date());
    const today = new Date();
    const flySummaries = this.getMultiDayFlyability(null, 14);
    const availableDates = getAvailableCalendarDates(today, 14, flySummaries);
    const leadingSpacers = availableDates.length > 0 ? (availableDates[0].weekdayIndexMonday || 0) : 0;

    const renderContent = () => `
      <div class="gm-date-picker-sheet flex flex-col gap-3">
        <!-- 14-Day 7-Column Calendar Grid (Mon-Sun) -->
        <div class="gm-date-sheet-section">
          <span class="text-xs font-bold uppercase tracking-wider text-[var(--gm-text-muted)] block mb-2">
            Calendario Previsioni (Prossimi 14 Giorni)
          </span>
          <div class="gm-date-weekday-header" aria-hidden="true">
            ${WEEKDAY_HEADERS_MON.map(w => `<span>${w}</span>`).join('')}
          </div>
          <div class="gm-date-grid">
            ${Array.from({ length: leadingSpacers }, () => `<span class="gm-date-grid-spacer" aria-hidden="true"></span>`).join('')}
            ${availableDates.map(d => {
              const isSelected = d.isoDate === activeDate;
              return `
                <button 
                  type="button" 
                  class="gm-date-grid-item ${isSelected ? 'active' : ''} ${d.isToday ? 'today' : ''} ${d.isWeekend ? 'weekend' : ''} fly-${d.flyability.status}"
                  data-action="pick-calendar-date"
                  data-date="${d.isoDate}"
                  aria-selected="${isSelected ? 'true' : 'false'}"
                  title="${escapeHtml(d.dayName)} ${escapeHtml(d.formatted)} (${escapeHtml(d.horizon.label)}) - ${escapeHtml(d.flyability.label)}: ${escapeHtml(d.flyability.limitingFactor || '')}"
                >
                  <span class="grid-day-name">${escapeHtml(d.dayName)}</span>
                  <span class="grid-day-number">${d.dayNumber}</span>
                  <span class="grid-month">${escapeHtml(d.shortMonth || d.formatted.split(' ')[1])}</span>

                  <span class="grid-fly-status ${d.flyability.badgeClass}" title="${escapeHtml(d.flyability.label)}">
                    <span class="grid-fly-icon" aria-hidden="true">${d.flyability.icon}</span>
                    <span class="grid-fly-label">${escapeHtml(d.flyability.label)}</span>
                  </span>

                  ${d.horizon.isSynoptic ? `<span class="grid-synoptic-dot" title="Tendenza sinottica (attendibilità indicativa)">●</span>` : ''}
                </button>
              `;
            }).join('')}
          </div>

          <!-- 4-Color Semantic Legend -->
          <div class="gm-date-sheet-legend flex items-center justify-between text-[0.68rem] px-1 pt-3 text-[var(--gm-text-muted)] border-t border-[var(--gm-border)] mt-3">
            <span class="flex items-center gap-1"><span class="text-[var(--gm-status-flyable)]">●</span> Volabile</span>
            <span class="flex items-center gap-1"><span class="text-[var(--gm-status-caution)]">▲</span> Cautela</span>
            <span class="flex items-center gap-1"><span class="text-[var(--gm-status-unflyable)]">✕</span> Non Volabile</span>
            <span class="flex items-center gap-1"><span class="text-[var(--gm-status-severe-text)]">⚡</span> Severo</span>
          </div>
        </div>
      </div>
    `;

    openSheet({
      id: 'home-date-picker-sheet',
      title: 'Seleziona Data Previsioni',
      content: renderContent()
    });
  }

  /**
   * Handles keyboard navigation and shortcuts (Escape to clear search, Enter/Space to activate).
   * @param {KeyboardEvent} evt
   */
  handleKeyDown(evt) {
    if (!evt || !evt.key) return;

    if (evt.key === 'Escape') {
      if (this.isThemeMenuOpen) {
        this.closeThemeMenu();
        const trigger = this.containerEl ? this.containerEl.querySelector('#gm-theme-menu-trigger') : null;
        if (trigger && typeof trigger.focus === 'function') trigger.focus();
        return;
      }
      if (this.searchQuery) {
        this.clearSearch();
        return;
      }
    }

    if (evt.key !== 'Enter' && evt.key !== ' ') return;
    const target = evt.target;
    if (!target) return;

    const actionEl = typeof target.closest === 'function'
      ? target.closest('[data-action]')
      : (typeof target.getAttribute === 'function' ? target : null);
    if (!actionEl) return;

    // Prevent default scroll when activating cards or buttons via Space
    if (evt.key === ' ') {
      const tagName = (target.tagName || '').toLowerCase();
      if (tagName !== 'input' && tagName !== 'textarea') {
        if (typeof evt.preventDefault === 'function') {
          evt.preventDefault();
        }
      }
    }

    this.handleClick({
      target: actionEl,
      stopPropagation: () => {},
      preventDefault: () => {
        if (typeof evt.preventDefault === 'function') evt.preventDefault();
      }
    });
  }

  /**
   * Clears the active search query and re-renders the spot list.
   */
  clearSearch() {
    this.searchQuery = '';
    if (this.containerEl) {
      const searchInput = this.containerEl.querySelector('#home-spot-search');
      if (searchInput) {
        searchInput.value = '';
        if (typeof searchInput.focus === 'function') searchInput.focus();
      }
      const clearBtn = this.containerEl.querySelector('#home-search-clear-btn');
      if (clearBtn && typeof clearBtn.classList?.add === 'function') {
        clearBtn.classList.add('hidden');
      }
      const toolbar = this.containerEl.querySelector('#home-symbiotic-toolbar');
      if (toolbar && typeof toolbar.classList?.remove === 'function') {
        toolbar.classList.remove('is-searching');
      }
      const flyToggleBtn = this.containerEl.querySelector('#btn-home-fly-filter-toggle');
      if (flyToggleBtn && typeof flyToggleBtn.classList?.remove === 'function') {
        flyToggleBtn.classList.remove('hidden');
      }
      if (this.updateSpotsListSectionInDom()) {
        return;
      }
    }
    this.render();
  }

  /**
   * Handles user clicks within the view via event delegation.
   * @param {MouseEvent} evt
   */
  handleClick(evt) {
    const target = evt.target;
    if (!target) return;

    const actionEl = typeof target.closest === 'function'
      ? target.closest('[data-action]')
      : (typeof target.getAttribute === 'function' ? target : null);
    if (!actionEl) return;

    const action = actionEl.getAttribute('data-action');
    const id = actionEl.getAttribute('data-id');

    if (action === 'clear-search') {
      this.clearSearch();
    } else if (action === 'focus-home-search') {
      const searchInput = this.containerEl ? this.containerEl.querySelector('#home-spot-search') : null;
      if (searchInput && typeof searchInput.focus === 'function') {
        searchInput.focus();
      }
    } else if (action === 'toggle-pin-spot') {
      if (typeof evt.stopPropagation === 'function') evt.stopPropagation();
      const spotId = actionEl.getAttribute('data-spot-id') || id;
      if (this.store && spotId) {
        const state = this.store.getState();
        const spot = this.comprensoriCatalog.find(c => c.id === spotId) || { id: spotId };
        const nextPinned = toggleSpotPin(spot, state.pinnedSpotIds || [], this.comprensoriCatalog);
        this.store.setState({ pinnedSpotIds: nextPinned });
        if (!this.storeUnsubscribe) {
          this.updateSpotsListSectionInDom();
          this.fetchBatchWeatherAsync();
        }
      }
    } else if (action === 'toggle-fly-filter' || action === 'set-fly-filter') {
      const explicitFilter = actionEl.getAttribute('data-filter');
      const nextFilter = explicitFilter || (this.flyabilityFilter === 'flyable' ? 'all' : 'flyable');
      if (this.flyabilityFilter !== nextFilter) {
        this.flyabilityFilter = nextFilter;
        this.render();
      }
    } else if (action === 'toggle-theme-menu') {
      this.toggleThemeMenu();
    } else if (action === 'set-theme') {
      const selectedTheme = actionEl.getAttribute('data-theme');
      this.closeThemeMenu();
      if (selectedTheme === 'light' || selectedTheme === 'dark' || selectedTheme === 'auto') {
        if (this.store) {
          const currentUi = (this.store.getState().ui) || {};
          this.store.setState({
            ui: {
              ...currentUi,
              theme: selectedTheme
            }
          });
        }
        if (!this.storeUnsubscribe) {
          this.render();
        }
      }
    } else if (action === 'dismiss-horizon-notice') {
      const st = this.store ? this.store.getState() : {};
      this.dismissedHorizonDate = st.activeDate || formatDateIso(new Date());
      if (this.containerEl && typeof this.containerEl.querySelector === 'function') {
        const noticeEl = this.containerEl.querySelector('.gm-horizon-notice');
        if (noticeEl && typeof noticeEl.remove === 'function') {
          noticeEl.remove();
          return;
        }
      }
      this.render();
    } else if (action === 'select-date' || action === 'prev-date' || action === 'next-date') {
      if ((action === 'prev-date' || action === 'next-date') && (actionEl.disabled || actionEl.getAttribute('aria-disabled') === 'true')) {
        return;
      }
      const dateAttr = actionEl.getAttribute('data-date');
      if (dateAttr && this.store) {
        this.store.setState({ activeDate: dateAttr });
        if (!this.storeUnsubscribe) {
          this.render();
          this.fetchBatchWeatherAsync();
        }
      }
    } else if (action === 'open-date-picker-sheet') {
      this.openDatePickerSheet();
    } else if (action === 'pick-calendar-date') {
      const dateAttr = actionEl.getAttribute('data-date');
      if (dateAttr && this.store) {
        this.store.setState({ activeDate: dateAttr });
        closeSheet();
        if (!this.storeUnsubscribe) {
          this.render();
          this.fetchBatchWeatherAsync();
        }
      }
    } else if (action === 'set-pilot-period') {
      const period = actionEl.getAttribute('data-period');
      if (period === 'month' || period === 'year') {
        this.pilotPeriod = period;
        if (this.store) {
          this.store.setState({ pilotPeriod: period });
        }
        this.render();
      }
    } else if (action === 'open-add-flight-sheet') {
      this.openAddFlightSheet();
    } else if (action === 'open-glider-sheet') {
      this.openGliderSheet();
    } else if (action === 'toggle-pilot-currency-factor') {
      if (this.store) {
        const nextVal = !Boolean(this.store.getState().usePilotCurrencyFactor);
        this.store.setState({ usePilotCurrencyFactor: nextVal });
        if (typeof document !== 'undefined') {
          const switchCard = document.getElementById('glider-sheet-currency-factor-card');
          if (switchCard) {
            this.openGliderSheet();
          }
        }
        this.render();
      }
    } else if (action === 'filter-glider-brand') {
      const brand = actionEl.getAttribute('data-brand') || '';
      this.gliderSelectedBrand = brand;
      if (typeof document !== 'undefined') {
        const chips = document.querySelectorAll('.gm-glider-brand-chip');
        chips.forEach(c => {
          c.classList.toggle('active', c.getAttribute('data-brand') === brand);
        });
        const listContainer = document.getElementById('glider-models-list');
        if (listContainer) {
          listContainer.innerHTML = this.renderGliderModelsList(this.store ? this.store.getState().activeGlider : {});
        }
      }
    } else if (action === 'select-glider-model') {
      const gliderId = actionEl.getAttribute('data-glider-id');
      const targetGlider = getGliderById(gliderId);
      if (targetGlider && this.store) {
        this.store.setState({
          activeGlider: targetGlider,
          glider: targetGlider
        });
      }
      closeSheet();
      this.render();
    } else if (action === 'save-custom-glider') {
      let brand = actionEl.getAttribute('data-brand') || '';
      let model = actionEl.getAttribute('data-model') || '';
      let category = actionEl.getAttribute('data-category') || 'EN-B';
      if (typeof document !== 'undefined') {
        const brandInput = document.getElementById('custom-glider-brand');
        const modelInput = document.getElementById('custom-glider-model');
        const catSelect = document.getElementById('custom-glider-category');
        if (brandInput && brandInput.value) brand = brandInput.value;
        if (modelInput && modelInput.value) model = modelInput.value;
        if (catSelect && catSelect.value) category = catSelect.value;
      }
      if (brand && model) {
        const customGlider = createCustomGlider({ brand, model, category });
        if (this.store) {
          this.store.setState({
            activeGlider: customGlider,
            glider: customGlider
          });
        }
        closeSheet();
        this.render();
      }
    } else if (action === 'select-glider') {
      const category = actionEl.getAttribute('data-category');
      const targetGlider = Object.values(GLIDER_CLASSES).find(c => c.category === category) || GLIDER_CLASSES.EN_A;
      if (this.store) {
        this.store.setState({
          activeGlider: targetGlider,
          glider: targetGlider
        });
      }
      closeSheet();
      this.render();
    } else if (action === 'toggle-spot-reasons') {
      if (!this.expandedReasonSpotIds) {
        this.expandedReasonSpotIds = new Set();
      }
      if (id) {
        if (this.expandedReasonSpotIds.has(id)) {
          this.expandedReasonSpotIds.delete(id);
        } else {
          this.expandedReasonSpotIds.add(id);
        }
        this.render();
      }
    } else if (action === 'go-to-forecast') {
      this.navigateTo('forecast');
    } else if (action === 'view-forecast-hour') {
      const hourVal = parseInt(actionEl.getAttribute('data-hour'), 10);
      const cardEl = typeof actionEl.closest === 'function' ? actionEl.closest('.gm-spot-card') : null;
      const matchedTakeoffId = cardEl ? cardEl.getAttribute('data-matched-takeoff-id') : null;
      const comprensorio = this.comprensoriCatalog.find(c => c.id === id || (c.name && id && c.name.toLowerCase() === id.toLowerCase()));
      if (this.store) {
        const nextState = {};
        if (comprensorio) nextState.selectedSpot = comprensorio;
        if (matchedTakeoffId) nextState.activeTakeoffId = matchedTakeoffId;
        if (!isNaN(hourVal) && hourVal >= 0 && hourVal <= 23) nextState.selectedHour = hourVal;
        if (Object.keys(nextState).length > 0) {
          this.store.setState(nextState);
        }
      }
      this.navigateTo('forecast');
    } else if (action === 'view-forecast') {
      const matchedTakeoffId = actionEl.getAttribute('data-matched-takeoff-id');
      const comprensorio = this.comprensoriCatalog.find(c => c.id === id || (c.name && id && c.name.toLowerCase() === id.toLowerCase()));
      if (this.store && comprensorio) {
        const nextState = { selectedSpot: comprensorio };
        if (matchedTakeoffId) nextState.activeTakeoffId = matchedTakeoffId;
        this.store.setState(nextState);
      }
      this.navigateTo('forecast');
    } else if (action === 'upload-igc') {
      const fileInput = this.containerEl ? this.containerEl.querySelector('#home-igc-file-input') : null;
      if (fileInput) {
        fileInput.click();
      } else {
        this.navigateTo('logbook');
      }
    }
  }

  /**
   * Delegated input event handler on container element.
   * @param {Event} evt
   */
  handleInput(evt) {
    const target = evt ? evt.target : null;
    if (!target) return;
    if (target.id === 'home-spot-search') {
      this.handleSearchInput(evt);
    }
  }

  /**
   * Handles instant search filter input.
   * @param {Event} evt
   */
  handleSearchInput(evt) {
    const input = evt.target;
    if (input) {
      this.searchQuery = input.value || '';
      const hasSearch = Boolean(this.searchQuery && this.searchQuery.trim().length > 0);
      
      if (this.containerEl) {
        const clearBtn = this.containerEl.querySelector('#home-search-clear-btn');
        if (clearBtn && typeof clearBtn.classList?.toggle === 'function') {
          clearBtn.classList.toggle('hidden', !this.searchQuery);
        }
        const toolbar = this.containerEl.querySelector('#home-symbiotic-toolbar');
        if (toolbar && typeof toolbar.classList?.toggle === 'function') {
          toolbar.classList.toggle('is-searching', hasSearch);
        }
        const flyToggleBtn = this.containerEl.querySelector('#btn-home-fly-filter-toggle');
        if (flyToggleBtn && typeof flyToggleBtn.classList?.toggle === 'function') {
          flyToggleBtn.classList.toggle('hidden', hasSearch);
        }
      }

      this.updateSpotsListSectionInDom();
    }
  }

  /**
   * Handles IGC file selection from hidden input.
   * Automatically parses track, deduces thermals and exercises, and logs flight.
   * @param {Event} evt
   */
  async handleFileInput(evt) {
    const input = evt.target;
    if (input && input.files && input.files[0]) {
      const file = input.files[0];
      try {
        const igcText = await file.text();
        await logbookManager.importIgcTrack(igcText, {
          fileName: file.name,
          spotsCatalog: this.comprensoriCatalog
        });
        this.render();
      } catch (err) {
        console.warn('Error reading IGC track:', err);
        this.navigateTo('logbook');
      }
    }
  }

  /**
   * Renders HTML into the DOM container if present.
   */
  render() {
    if (!this.containerEl) return;
    this.containerEl.innerHTML = this.renderHtml();
  }
}

/**
 * Singleton instance conforming to router lifecycle: { mount, unmount }.
 */
export const homeDashboardView = new HomeDashboardViewController();
