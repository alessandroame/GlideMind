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
  isSpotPinned
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
  fetchBatchComprensoriWeather
} from '../../core/openMeteoApi.js';
import {
  calculatePilotPeriodMetrics,
  createFlightLogEntry,
  DEFAULT_SEED_FLIGHTS
} from '../../core/logbook.js';
import { parseIgc } from '../../core/igcParser.js';
import { openSheet, closeSheet } from '../sheetManager.js';
import {
  getSmartDatePresets,
  getAvailableCalendarDates,
  getPastDatePresets,
  formatDateIso
} from '../../core/datePresets.js';
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
    this.networkStatus = 'offline'; // 'live' | 'loading' | 'offline'
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
      return `
        <span id="gm-home-live-badge" class="gm-live-badge live" title="Previsioni reali Open-Meteo attive">
          <span class="gm-live-badge-dot" aria-hidden="true"></span>
          <span>Live</span>
        </span>
      `;
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
      const listContainer = this.containerEl.querySelector('section[aria-labelledby="heading-comprensori"]');
      if (listContainer) {
        const evaluatedList = this.getEvaluatedComprensori();
        const countBadge = listContainer.querySelector('#home-spots-count') || listContainer.querySelector('.flex.items-center.justify-between.text-xs span:last-child');
        if (countBadge) countBadge.textContent = `${evaluatedList.length} siti`;
        const existingList = listContainer.querySelector('#home-spots-list') || listContainer.querySelector('.flex.flex-col.gap-2');
        if (existingList) {
          existingList.outerHTML = this.renderComprensoriList(evaluatedList);
        }
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
          themeChanged
        ) {
          if (state.locationsCatalog && state.locationsCatalog !== this.comprensoriCatalog) {
            this.setComprensoriCatalog(state.locationsCatalog);
          } else {
            this.render();
          }
          if (!themeChanged && (state.activeDate !== prev?.activeDate || state.locationsCatalog !== prev?.locationsCatalog)) {
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
   * Evaluates comprensori and sorts them dynamically by flyability.
   * @returns {Array<object>}
   */
  getEvaluatedComprensori() {
    const state = this.store ? this.store.getState() : {};
    const weatherData = state.weatherData || null;
    const activeGlider = state.activeGlider || DEFAULT_GLIDER;
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
      if (dateKey && this.cachedWeatherMap.has(dateKey)) {
        spotWeather = this.cachedWeatherMap.get(dateKey);
      } else if (this.cachedWeatherMap.has(comprensorio.id)) {
        const candidate = this.cachedWeatherMap.get(comprensorio.id);
        if (!targetDate || !candidate.hourly?.time || candidate.hourly.time.some(t => typeof t === 'string' && t.startsWith(`${targetDate}T`))) {
          spotWeather = candidate;
        }
      } else if (weatherData && (!state.selectedSpot || state.selectedSpot.id === comprensorio.id)) {
        if (!targetDate || !weatherData.hourly?.time || weatherData.hourly.time.some(t => typeof t === 'string' && t.startsWith(`${targetDate}T`)) || weatherData.hourly?.time?.length <= 24) {
          spotWeather = weatherData;
        }
      }

      const result = evaluateComprensorio({
        comprensorio,
        weatherData: spotWeather,
        glider: activeGlider,
        targetDate,
        allowSynthetic: false
      });

      evaluated.push(result);
    }

    return sortEvaluatedComprensori(evaluated);
  }

  /**
   * Generates the entire HTML string for the Home Dashboard.
   * @returns {string}
   */
  renderHtml() {
    const state = this.store ? this.store.getState() : {};
    const evaluatedList = this.getEvaluatedComprensori();
    const currentTheme = (state.ui && state.ui.theme) || 'dark';
    const themeMeta = {
      light: { label: 'Chiaro', icon: '☀️' },
      dark: { label: 'Scuro', icon: '🌙' },
      auto: { label: 'Auto', icon: '⚙️' }
    };
    const currentThemeMeta = themeMeta[currentTheme] || themeMeta.dark;

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
                  <span class="gm-theme-item-icon" aria-hidden="true">☀️</span>
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
                  <span class="gm-theme-item-icon" aria-hidden="true">🌙</span>
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
                  <span class="gm-theme-item-icon" aria-hidden="true">⚙️</span>
                  <span class="gm-theme-item-text">Auto</span>
                  ${currentTheme === 'auto' ? '<span class="gm-theme-item-check" aria-hidden="true">✓</span>' : ''}
                </button>
              </div>
            </div>
          </div>
        </header>

        <!-- SEZIONE 1: Stato Attività Pilota (Prima Sezione) -->
        <section aria-labelledby="heading-pilot-currency" class="flex flex-col gap-2">
          <h2 id="heading-pilot-currency" class="sr-only">Attività Pilota</h2>
          ${this.renderPilotCurrencyBlock(state)}
        </section>

        <!-- SEZIONE 2: Volabilità SITI (Con ricerca sotto il titolo) -->
        <section aria-labelledby="heading-comprensori" class="flex flex-col gap-2 pt-1 border-t border-[var(--gm-border)]">
          <div class="flex items-center justify-between text-xs text-[var(--gm-text-muted)] font-bold uppercase tracking-wider px-0.5">
            <h2 id="heading-comprensori">Volabilità</h2>
            <div class="flex items-center gap-2">
              ${this.renderLiveWeatherBadge()}
              <span id="home-spots-count" aria-live="polite">${evaluatedList.length} siti</span>
            </div>
          </div>

          <!-- Smart Date Selector for Comprensori Flyability (Weekend & Quick Presets) -->
          ${this.renderDateBar(state)}

          <!-- Compact Search Bar (Sotto il titolo Volabilità) -->
          <div class="gm-search-wrapper">
            <svg class="gm-search-icon" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2" aria-hidden="true">
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

    const today = new Date();
    const todayIso = formatDateIso(today);
    const key = `fly_home_multi_${targetSpot.id}_${todayIso}_${days}`;
    if (this._homeFlyCache && this._homeFlyCache[key]) {
      return this._homeFlyCache[key];
    }
    if (!this._homeFlyCache) this._homeFlyCache = {};

    const takeoff = (targetSpot.takeoffs && targetSpot.takeoffs[0]) ? targetSpot.takeoffs[0] : { altitude: 1000, heading: 180 };
    const coords = parseCoordinates(takeoff.coordinates) || { lat: 45.833, lon: 9.302 };
    let payload = null;

    if (state.weatherData && state.weatherData.hourly?.time?.length >= 24 * days) {
      payload = state.weatherData;
    } else {
      const synthetic = generateSyntheticWeather(
        coords,
        {
          targetDate: todayIso,
          days,
          elevation: takeoff.altitude || 1000,
          takeoffAzimuth: takeoff.heading || 180,
          weatherModel: 'best_match'
        }
      );
      payload = enrichWeatherData(synthetic, todayIso, Date.now(), {
        customHeading: takeoff.heading || 180
      });
    }

    const summaries = calculateDailyFlyabilitySummary(payload, takeoff, null, days);
    this._homeFlyCache[key] = summaries;
    return summaries;
  }

  /**
   * Renders the Smart Date Bar for comprensori flyability filtering.
   * @param {object} state
   * @returns {string}
   */
  renderDateBar(state) {
    const activeDate = state.activeDate || formatDateIso(new Date());
    const smartData = getSmartDatePresets(new Date(), activeDate);

    return `
      <div class="gm-date-tabs mb-1" role="tablist" aria-label="Selettore data previsioni">
        ${smartData.presets.map(p => `
          <button 
            type="button" 
            class="gm-date-tab ${p.isActive ? 'active' : ''} ${p.isCustom ? 'custom' : ''}" 
            data-action="select-date" 
            data-date="${p.isoDate}" 
            role="tab" 
            aria-selected="${p.isActive ? 'true' : 'false'}" 
            title="${p.label} - ${p.subLabel}"
          >
            <span class="gm-date-tab-main">
              ${p.label}
            </span>
            <span class="gm-date-tab-sub">${p.subLabel}</span>
          </button>
        `).join('')}

        <button 
          type="button" 
          class="gm-date-tab-calendar ${smartData.isCustomActive ? 'active' : ''}" 
          data-action="open-date-picker-sheet" 
          role="tab" 
          aria-selected="${smartData.isCustomActive ? 'true' : 'false'}"
          aria-label="Scegli data dal calendario" 
          title="Scegli altra data"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        </button>
      </div>
      ${smartData.activeHorizon && smartData.activeHorizon.isSynoptic ? `
        <div class="gm-horizon-notice mb-1" role="status">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="gm-horizon-icon" aria-hidden="true">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span><strong>Tendenza a lungo raggio:</strong> oltre 7 giorni le previsioni sono indicative.</span>
        </div>
      ` : ''}
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
          <div class="gm-skeleton" style="height: 72px;"></div>
          <div class="gm-skeleton" style="height: 72px;"></div>
          <div class="gm-skeleton" style="height: 72px;"></div>
        </div>
      `;
    }

    if (evaluatedList.length === 0) {
      if (this.searchQuery) {
        return `
          <div id="home-spots-list" class="gm-spot-card text-center py-4 px-3 flex flex-col items-center gap-2">
            <div class="text-xs font-semibold text-[var(--gm-text-primary)]">
              Nessuna località trovata per "${escapeHtml(this.searchQuery)}"
            </div>
            <p class="text-xs text-[var(--gm-text-muted)] max-w-xs">
              Verifica i termini digitati o ripristina la visualizzazione completa.
            </p>
            <button 
              type="button" 
              class="gm-btn-compact-accent mt-1" 
              data-action="clear-search"
            >
              Azzera ricerca
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
            Aggiungi le tue località dai dettagli in Previsioni per visualizzarle rapidamente nella panoramica.
          </p>
          <button 
            type="button" 
            class="gm-btn-compact-primary mt-1" 
            data-action="go-to-forecast"
          >
            Vai a Previsioni
          </button>
        </div>
      `;
    }

    return `
      <div id="home-spots-list" class="flex flex-col gap-2">
        ${evaluatedList.map(item => this.renderComprensorioCard(item)).join('')}
      </div>
    `;
  }

  /**
   * Renders an individual compact glanceable Comprensorio Card.
   * Entire card is clickable to view forecast.
   * @param {object} item - Evaluated comprensorio
   * @returns {string}
   */
  renderComprensorioCard(item) {
    const takeoff = item.takeoff || item.bestTakeoff || {};
    const landing = item.landing || item.safeLanding || {};
    const glide = item.glideMetrics || { requiredGlideRatio: '-', isSafe: true };
    const weather = item.weatherSnapshot || {};

    const rawTakeoffName = takeoff.name || 'Decollo';
    const takeoffName = rawTakeoffName.replace(/^Decollo\s*/i, '').replace(/Col Campeggia\s*\/\s*/i, '');
    const landingName = (landing.name || 'Atterraggio').replace(/^Atterraggio\s*/i, '');
    const takeoffAlt = takeoff.altitude ? `${takeoff.altitude}m` : '-';
    const landingAlt = landing.altitude ? `${landing.altitude}m` : '-';
    const isUnavailable = item.status === 'unavailable';
    const windSpeedStr = (!isUnavailable && weather.windSpeed != null) ? `${weather.windSpeed} km/h` : '-- km/h';
    const windDirStr = (!isUnavailable && weather.windDir != null) ? `${getCardinalDirection(weather.windDir)} (${weather.windDir}°)` : '';

    let badgeClass = 'gm-badge-flyable';
    if (item.status === 'caution') badgeClass = 'gm-badge-caution';
    else if (item.status === 'unflyable') badgeClass = 'gm-badge-unflyable';
    else if (isUnavailable) badgeClass = 'gm-badge-nd';

    return `
      <article 
        class="gm-spot-card ${isUnavailable ? 'gm-spot-card-unavailable' : ''}" 
        data-comprensorio-id="${escapeHtml(item.comprensorioId)}"
        data-action="view-forecast"
        data-id="${escapeHtml(item.comprensorioId)}"
        role="button"
        tabindex="0"
        aria-label="${escapeHtml(item.name)}, stato ${escapeHtml(item.badge)}"
      >
        <!-- Line 1: Spot Name + Province + Live Flyability Badge + Navigation Affordance -->
        <div class="gm-spot-header">
          <div class="gm-spot-title-group">
            <span class="gm-spot-name">${escapeHtml(item.name)}</span>
            ${item.province ? `<span class="gm-spot-prov">${escapeHtml(item.province)}</span>` : ''}
          </div>
          <div class="flex items-center gap-2">
            <span class="gm-badge ${badgeClass}">
              ${escapeHtml(item.badge)}
            </span>
            <svg class="gm-spot-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        </div>

        <!-- Line 2: Dual Launch & Landing Rows -->
        <div class="gm-spot-flight-row">
          <div class="gm-flight-stat-row">
            <div class="gm-flight-label">
              <span class="gm-flight-icon">↗</span>
              <span class="gm-flight-target">${escapeHtml(takeoffName)}</span>
              <span class="gm-flight-alt">(${takeoffAlt})</span>
            </div>
            <div class="gm-flight-data">
              <span class="gm-flight-wind">${windSpeedStr}</span>
              ${windDirStr ? `<span class="gm-flight-dir">da ${windDirStr}</span>` : ''}
            </div>
          </div>

          <div class="gm-flight-stat-row">
            <div class="gm-flight-label">
              <span class="gm-flight-icon">↘</span>
              <span class="gm-flight-target">${escapeHtml(landingName)}</span>
              <span class="gm-flight-alt">(${landingAlt})</span>
            </div>
            <div class="gm-flight-data">
              <span class="gm-glide-label">Efficienza</span>
              <span class="gm-glide-val ${isUnavailable ? 'text-[var(--gm-text-muted)]' : (glide.isSafe ? 'text-[var(--gm-status-flyable)]' : 'text-[var(--gm-status-caution)]')}">
                1:${glide.requiredGlideRatio}
              </span>
            </div>
          </div>
        </div>

        <!-- Line 3: Explainability String (Direct physical reason) -->
        <div class="gm-spot-explain ${isUnavailable ? 'text-[var(--gm-text-muted)]' : ''}">
          <span class="gm-explain-bullet">${isUnavailable ? '○' : '●'}</span>
          <span>${escapeHtml(item.reason)}</span>
        </div>
      </article>
    `;
  }

  /**
   * Renders Block 2: Pilot Currency, Flight Metrics & Flight Log Action.
   * @param {object} state
   * @returns {string}
   */
  renderPilotCurrencyBlock(state) {
    const flights = state.flights || DEFAULT_SEED_FLIGHTS;
    const activeDate = state.activeDate || new Date().toISOString().split('T')[0];
    const metrics = calculatePilotPeriodMetrics({
      flights,
      period: this.pilotPeriod,
      referenceDate: activeDate
    });
    const activeGlider = state.activeGlider || state.glider || DEFAULT_GLIDER;

    const isMonth = this.pilotPeriod === 'month';
    const badgeClass = metrics.isCurrent ? 'gm-badge-flyable' : 'gm-badge-caution';

    return `
      <div class="gm-pilot-card">
        <!-- Header: Title, Status Badge & Period Toggle -->
        <div class="gm-pilot-header">
          <div class="gm-pilot-title-group">
            <span class="gm-pilot-title">Attività Pilota</span>
            <span class="gm-badge ${badgeClass}" style="padding: 1px 6px; font-size: 0.68rem;">
              ${metrics.currencyLabel}
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
            aria-label="Cambia classe vela attiva, attualmente ${escapeHtml(activeGlider.name || activeGlider.category)}"
          >
            <span class="gm-glider-pill-badge ${escapeHtml(activeGlider.category ? activeGlider.category.toLowerCase() : 'en-a')}">
              ${escapeHtml(activeGlider.category || 'EN-A')}
            </span>
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
            aria-label="Aggiungi nuovo log di volo nel libretto"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Registra Volo</span>
          </button>

          <div>
            <input type="file" id="home-igc-file-input" accept=".igc" class="hidden" style="display: none;" />
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
    const defaultDate = state.activeDate || new Date().toISOString().split('T')[0];
    
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
              <button type="button" class="gm-past-preset-btn" data-action="set-flight-date" data-date="${p.isoDate}">
                ${p.label} (${p.subLabel})
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
          <span class="text-xs text-[var(--gm-text-muted)]" style="font-size: 0.72rem; margin-top: 3px; display: block;">
            Le attività (termica ed esercizi) e la durata vengono dedotte in automatico dalla traccia.
          </span>
        </div>

        <div class="gm-form-field">
          <label for="flight-notes-input" class="gm-form-label">Note & Debriefing (Opzionale)</label>
          <textarea id="flight-notes-input" class="gm-form-control" rows="2" placeholder="Note sul volo (es. quota raggiunta, veleggiato, manovre provate...)"></textarea>
        </div>

        <div class="gm-form-actions">
          <button type="button" class="gm-btn-compact-accent" id="btn-cancel-flight-log">Annulla</button>
          <button type="submit" class="gm-btn-compact-primary" id="btn-save-flight-log">Salva nel Libretto</button>
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
                  console.warn('Errore lettura traccia IGC:', err);
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
              <span class="gm-glider-badge ${catClass}">${escapeHtml(glider.category)}</span>
              <div class="flex flex-col text-left">
                <span class="font-bold text-sm text-[var(--gm-text)]">${escapeHtml(glider.brand)} ${escapeHtml(glider.model)}</span>
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
   * Opens the accessible bottom sheet to select the active glider / wing brand and model.
   */
  openGliderSheet() {
    const state = this.store ? this.store.getState() : {};
    const currentGlider = state.activeGlider || state.glider || DEFAULT_GLIDER;
    const currentCategory = currentGlider.category || 'EN-A';
    const classes = Object.values(GLIDER_CLASSES);

    const contentHtml = `
      <div class="gm-glider-sheet flex flex-col gap-3">
        <p class="text-xs text-[var(--gm-text-muted)] leading-relaxed">
          Seleziona la tua vela per marca e modello o per classe di omologazione. Le velocità di trim, accelerata e l'efficienza limite di rientro verso l'atterraggio sicuro vengono personalizzate per il tuo inviluppo di volo.
        </p>

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
                      <span class="font-bold text-sm text-[var(--gm-text)]">${escapeHtml(cls.name)}</span>
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
   */
  openDatePickerSheet() {
    const state = this.store ? this.store.getState() : {};
    const activeDate = state.activeDate || formatDateIso(new Date());
    const today = new Date();
    const minDate = formatDateIso(today);
    const maxDate = formatDateIso(new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000));
    const availableDates = getAvailableCalendarDates(today, 14, null);

    const renderContent = () => `
      <div class="gm-date-picker-sheet flex flex-col gap-4">
        <!-- 14-Day Fast Tap Grid (Hero Primary Action) -->
        <div class="gm-date-sheet-section">
          <span class="text-xs font-bold uppercase tracking-wider text-[var(--gm-text-muted)] block mb-2">
            Calendario Previsioni (Prossimi 14 Giorni)
          </span>
          <div class="gm-date-grid">
            ${availableDates.map(d => {
              const isSelected = d.isoDate === activeDate;
              return `
                <button 
                  type="button" 
                  class="gm-date-grid-item ${isSelected ? 'active' : ''} ${d.isWeekend ? 'weekend' : ''}"
                  data-action="pick-calendar-date"
                  data-date="${d.isoDate}"
                  aria-selected="${isSelected ? 'true' : 'false'}"
                  title="${d.dayName} ${d.formatted} (${d.horizon.label})"
                >
                  <span class="grid-day-name">${escapeHtml(d.dayName)}</span>
                  <span class="grid-day-number">${d.dayNumber}</span>
                  <span class="grid-month">${escapeHtml(d.formatted.split(' ')[1])}</span>

                  ${d.horizon.isSynoptic ? `<span class="grid-synoptic-dot" title="Tendenza sinottica (attendibilità indicativa)">●</span>` : ''}
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Secondary Native Input -->
        <div class="gm-form-field pt-2 border-t border-[var(--gm-border)]">
          <label for="custom-date-native-input" class="gm-form-label font-bold text-xs uppercase tracking-wider text-[var(--gm-text-muted)] block mb-1">
            Oppure specifica altra data:
          </label>
          <div class="flex items-center gap-2">
            <input 
              type="date" 
              id="custom-date-native-input" 
              class="gm-form-control flex-1 font-mono text-sm" 
              min="${minDate}" 
              max="${maxDate}" 
              value="${activeDate}" 
              aria-label="Data personalizzata"
            />
            <button 
              type="button" 
              class="gm-btn gm-btn-primary px-3 py-2 font-bold text-xs" 
              data-action="apply-custom-date"
            >
              Conferma
            </button>
          </div>
        </div>
      </div>
    `;

    openSheet({
      id: 'home-date-picker-sheet',
      title: 'Seleziona Data Previsioni',
      content: renderContent(),
      onOpen: () => {
        if (typeof document !== 'undefined') {
          const input = document.getElementById('custom-date-native-input');
          if (input) {
            input.addEventListener('change', (e) => {
              const val = e.target.value;
              if (val && this.store) {
                this.store.setState({ activeDate: val });
                closeSheet();
                if (!this.storeUnsubscribe) {
                  this.render();
                }
              }
            });
          }
        }
      }
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
      const listContainer = this.containerEl.querySelector('section[aria-labelledby="heading-comprensori"]');
      if (listContainer) {
        const evaluatedList = this.getEvaluatedComprensori();
        const countBadge = listContainer.querySelector('#home-spots-count') || listContainer.querySelector('.flex.items-center.justify-between.text-xs span:last-child');
        if (countBadge) countBadge.textContent = `${evaluatedList.length} siti`;
        const existingList = listContainer.querySelector('#home-spots-list') || listContainer.querySelector('.flex.flex-col.gap-2');
        if (existingList) {
          existingList.outerHTML = this.renderComprensoriList(evaluatedList);
        }
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
    } else if (action === 'select-date') {
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
    } else if (action === 'apply-custom-date') {
      const input = document.getElementById('custom-date-native-input');
      if (input && input.value && this.store) {
        this.store.setState({ activeDate: input.value });
        closeSheet();
        if (!this.storeUnsubscribe) {
          this.render();
          this.fetchBatchWeatherAsync();
        }
      }
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
    } else if (action === 'go-to-forecast') {
      this.navigateTo('forecast');
    } else if (action === 'view-forecast') {
      const comprensorio = this.comprensoriCatalog.find(c => c.id === id || (c.name && id && c.name.toLowerCase() === id.toLowerCase()));
      if (this.store && comprensorio) {
        this.store.setState({ selectedSpot: comprensorio });
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
      
      if (this.containerEl) {
        const clearBtn = this.containerEl.querySelector('#home-search-clear-btn');
        if (clearBtn && typeof clearBtn.classList?.toggle === 'function') {
          clearBtn.classList.toggle('hidden', !this.searchQuery);
        }
      }

      const listContainer = this.containerEl ? this.containerEl.querySelector('section[aria-labelledby="heading-comprensori"]') : null;
      if (listContainer) {
        const evaluatedList = this.getEvaluatedComprensori();
        const countBadge = listContainer.querySelector('#home-spots-count') || listContainer.querySelector('.flex.items-center.justify-between.text-xs span:last-child');
        if (countBadge) countBadge.textContent = `${evaluatedList.length} siti`;
        
        const existingList = listContainer.querySelector('#home-spots-list') || listContainer.querySelector('.flex.flex-col.gap-2');
        if (existingList) {
          existingList.outerHTML = this.renderComprensoriList(evaluatedList);
        }
      } else {
        this.render();
      }
    }
  }

  /**
   * Handles IGC file selection from hidden input.
   * Automatically parses track, deduces thermals and exercises, and logs flight.
   * @param {Event} evt
   */
  handleFileInput(evt) {
    const input = evt.target;
    if (input && input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const igcText = e.target.result;
          const parsed = parseIgc(igcText, this.comprensoriCatalog);
          const flightDate = (parsed.metadata && parsed.metadata.date) || new Date().toISOString().split('T')[0];
          const duration = (parsed.statistics && parsed.statistics.durationMinutes) || 45;
          const site = parsed.takeoffName || parsed.siteTitle || 'Spot da IGC';

          const newEntry = createFlightLogEntry({
            date: flightDate,
            site: site,
            durationMinutes: duration,
            trackPoints: parsed.points,
            notes: `Traccia IGC: ${file.name}`
          });

          if (this.store) {
            const currentFlights = this.store.getState().flights || [];
            this.store.setState({
              flights: [newEntry, ...currentFlights]
            });
          }

          this.render();
        } catch (err) {
          console.warn('Errore lettura traccia IGC:', err);
          this.navigateTo('logbook');
        }
      };
      reader.readAsText(file);
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
