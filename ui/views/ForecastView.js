/**
 * GlideMind - Phase 4: Weather & Flyability Dashboard View (ForecastView)
 * 
 * Capabilities:
 * 1. 2-Level Spot Hierarchy: Comprensorio switcher with dedicated Picker Sheet
 *    (Preferiti ⭐, Recenti 🕒, Ricerca Globale) and Sub-Spot selector (Panoramica Binomio | Decolli | Atterraggi).
 * 2. Unico Binomio or Focused Spot View: Renders dual launch/landing synthesis in overview mode,
 *    or dedicated aeronautical telemetry (altitude, heading, coordinates, wind limits) when a specific spot is selected.
 * 3. Bottom Sticky Scrubber: 13-slot hourly flyability timeline (08:00 - 20:00) anchored at the bottom
 *    (Thumb Zone) with zero horizontal scroll, paragliding color codes, and < 50ms reactive scrubbing.
 * 4. Dual-State Informational Panels:
 *    - Wind & Compass: Synthetic 360° SVG or Expanded 08:00-20:00 temporal wind/gusts chart with vertical active-hour marker.
 *    - Atmospheric Soundings: Synthetic 4-tile grid or Expanded altimetric LCL/Ceiling curve chart with vertical active-hour marker.
 * 5. AI Flight Briefing (Guido Persona): Telegrafico, safety-first briefing with deterministic offline heuristic engine.
 * 
 * Compliant with Laws of UX 2026 (touch floor >= 48px, zero trapped modals, zero text ellipsis on metrics).
 * ZERO DOM DEPENDENCIES for core calculations: 100% pure Node.js headless testable.
 */

import { store } from '../../core/store.js';
import { router } from '../router.js';
import { openSheet, closeSheet } from '../sheetManager.js';
import { createMapEngine } from '../map/mapEngineAdapter.js';
import {
  DEFAULT_COMPRENSORI,
  evaluateComprensorio,
  slugifyComprensorio,
  parseCoordinates,
  isSpotPinned
} from '../../core/comprensorio.js';
import {
  DEFAULT_GLIDER,
  GLIDER_CLASSES,
  calculateDailyFlyabilitySummary
} from '../../core/flyability.js';
import {
  calculateDewPoint,
  calculateLCL,
  calculateLapseRate,
  classifyAtmosphericStability,
  estimateThermalCeiling
} from '../../core/soundingsMath.js';
import {
  generateSyntheticWeather,
  enrichWeatherData,
  fetchWeatherData,
  getCachedWeatherData
} from '../../core/openMeteoApi.js';
import {
  getSmartDatePresets,
  getAvailableCalendarDates,
  formatDateIso,
  parseDateIso,
  formatShortDate
} from '../../core/datePresets.js';

/**
 * Normalizes an angle to [0, 360) range.
 * @param {number} deg
 * @returns {number}
 */
export function normalizeAngle(deg) {
  const a = deg % 360;
  return a < 0 ? a + 360 : a;
}

/**
 * Calculates angular difference with sign in [-180, +180] range.
 * @param {number} fromDeg
 * @param {number} toDeg
 * @returns {number}
 */
export function calculateAngularDifference(fromDeg, toDeg) {
  return ((toDeg - fromDeg + 540) % 360) - 180;
}

/**
 * Formats wind direction degrees into 8 cardinal points.
 * @param {number} deg
 * @returns {string}
 */
export function getCardinalDirection(deg) {
  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const normalized = normalizeAngle(deg);
  const idx = Math.round(normalized / 45) % 8;
  return cardinals[idx];
}

/**
 * Computes SVG coordinates for an angle on a circle.
 * @param {number} cx Center X
 * @param {number} cy Center Y
 * @param {number} radius Circle radius
 * @param {number} angleDeg Angle in degrees (0 = North, 90 = East, 180 = South, 270 = West)
 * @returns {{ x: number, y: number }}
 */
export function polarToCartesian(cx, cy, radius, angleDeg) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return {
    x: Math.round((cx + radius * Math.cos(rad)) * 10) / 10,
    y: Math.round((cy + radius * Math.sin(rad)) * 10) / 10
  };
}

/**
 * Generates an SVG path for a circular sector (e.g. takeoff cone).
 * @param {number} cx Center X
 * @param {number} cy Center Y
 * @param {number} radius Radius
 * @param {number} startAngleDeg Start angle in degrees
 * @param {number} endAngleDeg End angle in degrees
 * @returns {string} SVG path string
 */
export function describeSectorArc(cx, cy, radius, startAngleDeg, endAngleDeg) {
  const start = polarToCartesian(cx, cy, radius, endAngleDeg);
  const end = polarToCartesian(cx, cy, radius, startAngleDeg);
  let diff = normalizeAngle(endAngleDeg - startAngleDeg);
  const largeArcFlag = diff <= 180 ? '0' : '1';

  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    'Z'
  ].join(' ');
}

/**
 * Generates a smooth cubic Bézier SVG path from discrete data points.
 * Uses Monotone Cubic Spline (Fritsch-Carlson) interpolation to eliminate jagged lines
 * and guarantee zero overshoot at local extrema (peaks and troughs).
 * 
 * @param {Array<{x: number, y: number}>} points
 * @returns {string} SVG path string
 */
export function buildSmoothPath(points) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;

  const n = points.length;
  const dx = [];
  const dy = [];
  const s = [];

  for (let i = 0; i < n - 1; i++) {
    const dxi = points[i + 1].x - points[i].x;
    const dyi = points[i + 1].y - points[i].y;
    dx.push(dxi);
    dy.push(dyi);
    s.push(dxi === 0 ? 0 : dyi / dxi);
  }

  const m = [];
  m.push(s[0]);

  for (let i = 1; i < n - 1; i++) {
    if (s[i - 1] * s[i] <= 0) {
      m.push(0);
    } else {
      m.push((2 * s[i - 1] * s[i]) / (s[i - 1] + s[i]));
    }
  }
  m.push(s[n - 2]);

  let path = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const segDx = dx[i] / 3;
    const cp1x = Math.round((p0.x + segDx) * 10) / 10;
    const cp1y = Math.round((p0.y + m[i] * segDx) * 10) / 10;
    const cp2x = Math.round((p1.x - segDx) * 10) / 10;
    const cp2y = Math.round((p1.y - m[i + 1] * segDx) * 10) / 10;
    path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p1.x},${p1.y}`;
  }
  return path;
}

/**
 * Generates a closed area SVG path following the smoothed curve down to a baseline Y.
 * 
 * @param {Array<{x: number, y: number}>} points
 * @param {number} baselineY
 * @returns {string} SVG path string
 */
export function buildSmoothAreaPath(points, baselineY) {
  if (!points || points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length === 1) {
    return `M ${first.x},${baselineY} L ${first.x},${first.y} L ${last.x},${baselineY} Z`;
  }
  const linePath = buildSmoothPath(points);
  const mMatch = linePath.match(/^M\s*[\d.-]+[,\s]+[\d.-]+\s*/);
  const segments = mMatch ? linePath.slice(mMatch[0].length) : '';
  return `M ${first.x},${baselineY} L ${first.x},${first.y} ${segments} L ${last.x},${baselineY} Z`;
}

/**
 * Escapes HTML characters for safe template rendering.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generates a safety-focused deterministic AI flight briefing (Guido persona).
 * @param {object} spot Comprensorio object
 * @param {object} weatherData Open-Meteo weather payload
 * @param {string} dateStr YYYY-MM-DD
 * @param {object} [glider=DEFAULT_GLIDER] Active glider specifications
 * @returns {{ window: string, hazards: string, pilotLevel: string, summary: string }}
 */
export function generateGuidoBriefing(spot, weatherData, dateStr, glider = DEFAULT_GLIDER) {
  if (!spot || !weatherData || !weatherData.hourly) {
    return {
      window: 'Dati meteo non disponibili',
      hazards: 'Impossibile elaborare il briefing senza dati orari.',
      pilotLevel: 'Attendere il caricamento della previsione.',
      summary: 'Dati meteorologici non caricati.'
    };
  }

  const hours = [];
  for (let h = 8; h <= 19; h++) {
    const evalResult = evaluateComprensorio({
      comprensorio: spot,
      weatherData,
      hourIndex: h,
      glider
    });
    hours.push({
      hour: h,
      status: evalResult.status,
      badge: evalResult.badge,
      windSpeed: evalResult.weatherSnapshot.windSpeed || 0,
      windGust: evalResult.weatherSnapshot.windGust || 0,
      windDir: evalResult.weatherSnapshot.windDirection ?? evalResult.weatherSnapshot.windDir ?? 0,
      rain: evalResult.weatherSnapshot.rain ?? evalResult.weatherSnapshot.precipitation ?? 0,
      cape: evalResult.weatherSnapshot.cape || 0,
      takeoff: evalResult.takeoff
    });
  }

  // 1. Determine optimal contiguous flight window
  const flyableSlots = hours.filter(s => s.status === 'flyable');
  let windowText = 'Nessuna finestra raccomandata (condizioni non ottimali)';
  if (flyableSlots.length > 0) {
    const firstH = flyableSlots[0].hour;
    const lastH = flyableSlots[flyableSlots.length - 1].hour;
    windowText = `${String(firstH).padStart(2, '0')}:00 - ${String(lastH + 1).padStart(2, '0')}:00 (${flyableSlots.length} ore favorevoli)`;
  } else {
    const cautionSlots = hours.filter(s => s.status === 'caution');
    if (cautionSlots.length > 0) {
      windowText = `Finestra marginale (Cautela): ${String(cautionSlots[0].hour).padStart(2, '0')}:00 - ${String(cautionSlots[cautionSlots.length - 1].hour + 1).padStart(2, '0')}:00`;
    }
  }

  // 2. Identify potential hazards
  const hazards = [];
  const maxGust = Math.max(...hours.map(h => h.windGust));
  const maxWind = Math.max(...hours.map(h => h.windSpeed));
  const maxCape = Math.max(...hours.map(h => h.cape));
  const hasRain = hours.some(h => h.rain > 0.1);

  if (maxWind > (glider.vTrim * 0.55)) {
    hazards.push(`Vento forte in quota (max ${Math.round(maxWind)} km/h), rischio arretramento.`);
  }
  if (maxGust - maxWind >= 8) {
    hazards.push(`Raffiche attive con spread di ${Math.round(maxGust - maxWind)} km/h (picco ${Math.round(maxGust)} km/h).`);
  }
  if (maxCape >= 800) {
    hazards.push(`Rischio temporali e sovrasviluppo pomeridiano (instabilità convettiva marcata, CAPE ${Math.round(maxCape)} J/kg).`);
  }
  if (hasRain) {
    hazards.push(`Precipitazioni previste nella giornata: decollo bagnato e calo visibilità.`);
  }
  if (hazards.length === 0) {
    hazards.push('Gradiente anemometrico regolare, assenza di rotori sinottici o raffiche pericolose.');
  }

  // 3. Recommended flight envelope based on glider class
  let pilotLevel = '';
  if (flyableSlots.length >= 3 && maxGust <= 18 && maxCape < 500 && !hasRain) {
    pilotLevel = 'Condizioni ideali per vele ricreative EN-A / EN-B. Finestra termica dolce idonea a voli didattici di ambientamento.';
  } else if (flyableSlots.length > 0 && maxWind <= 22 && maxGust <= 28) {
    pilotLevel = 'Condizioni termiche vive per vele intermedie ed avanzate (EN-B / EN-C). Richiesta gestione attiva della turbolenza.';
  } else {
    pilotLevel = 'Condizioni severe o margine di planata insufficiente per vele EN-A. Decollo sconsigliato per attività ricreativa.';
  }

  const hazardsFormatted = hazards.map(h => `• ${h}`).join('\n');
  const summary = [
    `Guido: "Oggi a ${spot.name}, la finestra migliore è ${windowText}.`,
    hazardsFormatted,
    `Indicazione pilota: ${pilotLevel}"`
  ].join('\n\n');

  return {
    window: windowText,
    hazards: hazardsFormatted,
    pilotLevel,
    summary
  };
}

/**
 * ForecastViewController
 * Manages rendering, event handling, timeline scrubbing, and soundings analysis for ForecastView.
 */
export class ForecastViewController {
  /**
   * @param {object} [options]
   * @param {object} [options.store] Reactive store instance
   * @param {object} [options.router] Router instance
   * @param {Array<object>} [options.comprensoriCatalog] Catalog of comprensori
   */
  constructor(options = {}) {
    this.store = options.store || store;
    this.router = options.router || router;
    this.comprensoriCatalog = options.comprensoriCatalog || (this.store && typeof this.store.getState === 'function' ? this.store.getState().locationsCatalog : null) || DEFAULT_COMPRENSORI;

    this.containerEl = null;
    this.unsubscribeStore = null;
    this.boundClickHandler = this.handleClick.bind(this);
    this.boundChangeHandler = this.handleChange.bind(this);
    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
    this.isScrubbing = false;

    // Initial local view state
    const now = new Date();
    const storeState = this.store ? this.store.getState() : {};
    this.activeDate = storeState.activeDate || formatDateIso(now);
    this.selectedHour = this._resolveInitialHour(this.activeDate);
    this.selectedSubSpot = 'overview'; // 'overview' | spotId
    this.isSubSpotMenuOpen = false;
    this.forecastMode = 'cards'; // 'cards' | 'charts'
    this.expandedCardId = null; // All parameter accordion cards start collapsed
    this.cachedWeatherMap = new Map(); // key: spotId_date -> weatherPayload
    this.isLoadingWeather = false;
    this.networkStatus = 'offline'; // 'live' | 'loading' | 'offline'
    this._networkFailed = false;
    this.activeFetchPromise = null;
    this._customFetchFn = options.fetchFn || null;

    // View state for dual-mode panels
    this.windPanelView = 'summary'; // 'summary' | 'chart'
    this.soundingPanelView = 'summary'; // 'summary' | 'chart'

    // Collapsing sticky header state on scroll
    this.isScrolledPastHeader = false;
    this.scrollContainerEl = null;
    this.stickyBarEl = null;
    this.boundScrollHandler = this.handleScroll.bind(this);

    // Contextual spot mini-map and vector windsock engine
    this.miniMapEngine = null;
  }

  /**
   * Resolves the default initial selected hour.
   * If targetDate is today, automatically selects the current local hour (clamped to 08..20).
   * For future dates, defaults to midday soaring hour (13:00).
   * @param {string} [targetDate]
   * @returns {number}
   */
  _resolveInitialHour(targetDate = this.activeDate) {
    const todayIso = formatDateIso(new Date());
    if (targetDate === todayIso) {
      const curHour = new Date().getHours();
      return Math.min(20, Math.max(8, curHour));
    }
    return 13;
  }

  /**
   * Updates the active comprensori catalog (e.g. when master catalog is loaded).
   * @param {Array<object>} catalog
   */
  setComprensoriCatalog(catalog) {
    if (!Array.isArray(catalog) || catalog.length === 0) return;
    this.comprensoriCatalog = catalog;
    this.render();
  }

  /**
   * Returns formatted YYYY-MM-DD string offset by dayOffset days from today.
   * @param {number} dayOffset
   * @returns {string}
   */
  getDateString(dayOffset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return formatDateIso(d);
  }

  /**
   * Gets the currently active Comprensorio spot from store or catalog fallback.
   * @returns {object}
   */
  getCurrentSpot() {
    const state = this.store ? this.store.getState() : {};
    if (state.selectedSpot && state.selectedSpot.id) {
      const found = this.comprensoriCatalog.find(c => 
        c.id === state.selectedSpot.id || 
        (state.selectedSpot.name && c.name && c.name.toLowerCase() === state.selectedSpot.name.toLowerCase())
      );
      if (found) return found;
      return state.selectedSpot;
    }
    return this.comprensoriCatalog[0] || DEFAULT_COMPRENSORI[0];
  }

  /**
   * Gets active glider specification.
   * @returns {object}
   */
  getActiveGlider() {
    const state = this.store ? this.store.getState() : {};
    return state.activeGlider || state.glider || DEFAULT_GLIDER || GLIDER_CLASSES.EN_A;
  }

  /**
   * Renders the discrete network status badge (Live, Loading, Offline/Synthetic).
   * @param {string} [suffix=''] Optional ID suffix for duplicate badge instances (e.g. 'sticky')
   * @returns {string}
   */
  renderLiveWeatherBadge(suffix = '') {
    const badgeId = suffix ? `gm-forecast-live-badge-${suffix}` : 'gm-forecast-live-badge';
    if (this.networkStatus === 'loading') {
      return `
        <span id="${badgeId}" class="gm-live-badge loading" title="Aggiornamento dati meteo in corso da Open-Meteo">
          <span class="gm-live-badge-dot" aria-hidden="true"></span>
          <span>Aggiornamento...</span>
        </span>
      `;
    }
    if (this.networkStatus === 'live') {
      return `
        <span id="${badgeId}" class="gm-live-badge live" title="Previsioni reali Open-Meteo attive">
          <span class="gm-live-badge-dot" aria-hidden="true"></span>
          <span>Live</span>
        </span>
      `;
    }
    return `
      <span id="${badgeId}" class="gm-live-badge offline" title="Dati meteorologici simulati o offline">
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
    const badgeEl = this.containerEl.querySelector('#gm-forecast-live-badge');
    if (badgeEl) {
      badgeEl.outerHTML = this.renderLiveWeatherBadge();
    }
    const stickyBadgeEl = this.containerEl.querySelector('#gm-forecast-live-badge-sticky');
    if (stickyBadgeEl) {
      stickyBadgeEl.outerHTML = this.renderLiveWeatherBadge('sticky');
    }
  }

  /**
   * Asynchronously fetches real Open-Meteo weather data in background (Stale-While-Revalidate).
   * Safe for browser environment; completely no-op in headless Node.js tests unless customFetch is provided.
   * 
   * @param {object} spot
   * @param {string} dateStr
   * @param {boolean} [forceRefresh=false]
   * @returns {Promise<object|null>}
   */
  async fetchWeatherDataAsync(spot, dateStr, forceRefresh = false) {
    if (!spot || !spot.id) return null;
    const key = `${spot.id}_${dateStr}`;

    const hasFetch = typeof window !== 'undefined' && typeof window.fetch === 'function';
    if (!hasFetch && !this._customFetchFn) {
      return null;
    }

    if (!forceRefresh && this.cachedWeatherMap.has(key)) {
      const existing = this.cachedWeatherMap.get(key);
      if (existing && !existing._isSynthetic && !existing.isStale) {
        this.networkStatus = 'live';
        this.updateLiveStatusBadgeInDom();
        return existing;
      }
    }

    this.networkStatus = 'loading';
    this.updateLiveStatusBadgeInDom();

    const takeoff = (spot.takeoffs && spot.takeoffs[0]) ? spot.takeoffs[0] : { altitude: 1000, heading: 180 };
    const coords = parseCoordinates(takeoff.coordinates) || { lat: 45.833, lon: 9.302 };

    const fetchPromise = (async () => {
      try {
        const enriched = await fetchWeatherData(
          coords,
          {
            targetDate: dateStr,
            weatherModel: 'best_match',
            includeSounding: true,
            forceRefresh,
            fetchFn: this._customFetchFn || (typeof window !== 'undefined' ? window.fetch.bind(window) : globalThis.fetch)
          }
        );

        if (enriched) {
          if (enriched.isStaleOfflineFallback) {
            this.networkStatus = 'offline';
            this._networkFailed = true;
          } else {
            enriched._isSynthetic = false;
            this.networkStatus = 'live';
            this._networkFailed = false;
          }
          this.cachedWeatherMap.set(key, enriched);

          // Clear multi-day summary cache so it recalculates with real weather
          const todayIso = formatDateIso(new Date());
          this.cachedWeatherMap.delete(`fly_multi_${spot.id}_${todayIso}_14`);

          if (this.store && typeof this.store.setState === 'function') {
            this.store.setState({
              weatherData: enriched,
              selectedSpot: spot,
              activeDate: dateStr
            });
          }

          this.render();
          return enriched;
        }
      } catch (err) {
        this.networkStatus = 'offline';
        this._networkFailed = true;
        this.updateLiveStatusBadgeInDom();
      } finally {
        this.activeFetchPromise = null;
      }
      return null;
    })();

    this.activeFetchPromise = fetchPromise;
    return fetchPromise;
  }

  /**
   * Retrieves weather payload for the current spot and active date.
   * Implements 0ms optimistic render from cache or synthetic fallback.
   * 
   * @param {object} spot
   * @param {string} dateStr
   * @returns {object}
   */
  getWeatherData(spot, dateStr) {
    const key = `${spot.id}_${dateStr}`;
    if (this.cachedWeatherMap.has(key)) {
      const data = this.cachedWeatherMap.get(key);
      if (data && !data._isSynthetic && !data.isStaleOfflineFallback && !this._networkFailed) {
        this.networkStatus = 'live';
      }
      return data;
    }

    // Check store global weatherData if matching spot
    const state = this.store ? this.store.getState() : {};
    if (state.weatherData && state.selectedSpot && state.selectedSpot.id === spot.id) {
      this.cachedWeatherMap.set(key, state.weatherData);
      if (!state.weatherData._isSynthetic && !state.weatherData.isStaleOfflineFallback && !this._networkFailed) {
        this.networkStatus = 'live';
      }
      return state.weatherData;
    }

    // Check defaultWeatherCache
    const takeoff = (spot.takeoffs && spot.takeoffs[0]) ? spot.takeoffs[0] : { altitude: 1000, heading: 180 };
    const coords = parseCoordinates(takeoff.coordinates) || { lat: 45.833, lon: 9.302 };
    const cached = getCachedWeatherData(coords, dateStr, { weatherModel: 'best_match' });
    if (cached && !cached.isStale) {
      this.cachedWeatherMap.set(key, cached);
      if (!cached._isSynthetic && !cached.isStaleOfflineFallback && !this._networkFailed) {
        this.networkStatus = 'live';
      }
      return cached;
    }

    // Generate deterministic synthetic day for immediate 0ms offline rendering
    const synthetic = generateSyntheticWeather(
      coords,
      {
        targetDate: dateStr,
        days: 1,
        elevation: takeoff.altitude || 1000,
        takeoffAzimuth: takeoff.heading || 180,
        weatherModel: 'best_match'
      }
    );
    const enriched = enrichWeatherData(synthetic, dateStr, Date.now(), {
      customHeading: takeoff.heading || 180
    });

    this.cachedWeatherMap.set(key, enriched);
    return enriched;
  }

  /**
   * Retrieves multi-day (14-day) flyability summaries for a spot.
   * @param {object} spot
   * @param {number} [days=14]
   * @returns {Array<object>}
   */
  getMultiDayFlyability(spot, days = 14) {
    if (!spot) return [];
    const today = new Date();
    const todayIso = formatDateIso(today);
    const key = `fly_multi_${spot.id}_${todayIso}_${days}`;
    if (this.cachedWeatherMap.has(key)) {
      return this.cachedWeatherMap.get(key);
    }

    const takeoff = (spot.takeoffs && spot.takeoffs[0]) ? spot.takeoffs[0] : { altitude: 1000, heading: 180 };
    const coords = parseCoordinates(takeoff.coordinates) || { lat: 45.833, lon: 9.302 };

    const state = this.store ? this.store.getState() : {};
    let payload = null;

    if (state.weatherData && state.selectedSpot && state.selectedSpot.id === spot.id && state.weatherData.hourly?.time?.length >= 24 * days) {
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
    this.cachedWeatherMap.set(key, summaries);
    return summaries;
  }

  /**
   * Mounts the view controller to the provided DOM container.
   * @param {HTMLElement|null} containerEl
   */
  mount(containerEl) {
    this.containerEl = containerEl;
    this.expandedCardId = null;

    // Synchronize active spot from store if present
    const state = this.store ? this.store.getState() : {};
    if (state.activeDate) {
      this.activeDate = state.activeDate;
      this.selectedHour = this._resolveInitialHour(this.activeDate);
    }

    if (this.containerEl) {
      if (this.containerEl.classList) {
        this.containerEl.classList.add('gm-view-forecast');
      }
      this.containerEl.addEventListener('click', this.boundClickHandler);
      this.containerEl.addEventListener('change', this.boundChangeHandler);
      this.containerEl.addEventListener('pointerdown', this.boundPointerDown);
      this.containerEl.addEventListener('pointermove', this.boundPointerMove);
      this.containerEl.addEventListener('pointerup', this.boundPointerUp);
      this.containerEl.addEventListener('pointercancel', this.boundPointerUp);
    }

    // Attach delegated click listener to centralized modal sheet container
    this.sheetContainerEl = typeof document !== 'undefined' ? document.getElementById('sheet-container') : null;
    if (this.sheetContainerEl && typeof this.sheetContainerEl.addEventListener === 'function') {
      this.sheetContainerEl.addEventListener('click', this.boundClickHandler);
    }

    if (this.store) {
      this.unsubscribeStore = this.store.subscribe((nextState) => {
        let needsWeatherFetch = false;
        if (nextState.locationsCatalog && nextState.locationsCatalog !== this.comprensoriCatalog) {
          this.setComprensoriCatalog(nextState.locationsCatalog);
        }
        if (nextState.activeDate && nextState.activeDate !== this.activeDate) {
          this.activeDate = nextState.activeDate;
          this.selectedHour = this._resolveInitialHour(this.activeDate);
          needsWeatherFetch = true;
        }
        if (nextState.ui && nextState.ui.theme && this.miniMapEngine) {
          this.miniMapEngine.setTheme(nextState.ui.theme);
        }
        if (nextState.ui && nextState.ui.mapLayer && this.miniMapEngine) {
          if (typeof this.miniMapEngine.setLayer === 'function') {
            this.miniMapEngine.setLayer(nextState.ui.mapLayer);
          }
        }
        this.render();
        if (needsWeatherFetch) {
          this.fetchWeatherDataAsync(this.getCurrentSpot(), this.activeDate);
        }
      });
    }

    this.render();

    // Keyboard listener for accessible popovers (Escape to close) and timeline stepping (Arrow keys)
    this.boundKeyHandler = (e) => {
      if (e.key === 'Escape' && this.isSubSpotMenuOpen) {
        this.isSubSpotMenuOpen = false;
        this.render();
        const trigger = this.containerEl ? this.containerEl.querySelector('.gm-subspot-trigger') : null;
        if (trigger && typeof trigger.focus === 'function') trigger.focus();
      } else if (e.key === 'ArrowLeft' && !['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) {
        if (this.selectedHour > 8) {
          this.setHour(this.selectedHour - 1);
        }
      } else if (e.key === 'ArrowRight' && !['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) {
        if (this.selectedHour < 20) {
          this.setHour(this.selectedHour + 1);
        }
      }
    };
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', this.boundKeyHandler);
    }

    // Trigger asynchronous background revalidation if in browser or if custom fetch provided
    const currentSpot = this.getCurrentSpot();
    this.fetchWeatherDataAsync(currentSpot, this.activeDate);
  }

  /**
   * Unmounts the controller and cleans up listeners and store subscriptions.
   */
  unmount() {
    if (this.miniMapEngine) {
      this.miniMapEngine.destroy();
      this.miniMapEngine = null;
    }
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function' && this.boundKeyHandler) {
      window.removeEventListener('keydown', this.boundKeyHandler);
      this.boundKeyHandler = null;
    }
    if (this.containerEl) {
      if (this.containerEl.classList) {
        this.containerEl.classList.remove('gm-view-forecast');
      }
      this.containerEl.removeEventListener('click', this.boundClickHandler);
      this.containerEl.removeEventListener('change', this.boundChangeHandler);
      this.containerEl.removeEventListener('pointerdown', this.boundPointerDown);
      this.containerEl.removeEventListener('pointermove', this.boundPointerMove);
      this.containerEl.removeEventListener('pointerup', this.boundPointerUp);
      this.containerEl.removeEventListener('pointercancel', this.boundPointerUp);
      this.containerEl = null;
    }
    if (this.scrollContainerEl && this.boundScrollHandler && typeof this.scrollContainerEl.removeEventListener === 'function') {
      this.scrollContainerEl.removeEventListener('scroll', this.boundScrollHandler);
    }
    this.scrollContainerEl = null;
    this.stickyBarEl = null;
    if (this.sheetContainerEl && typeof this.sheetContainerEl.removeEventListener === 'function') {
      this.sheetContainerEl.removeEventListener('click', this.boundClickHandler);
      this.sheetContainerEl = null;
    }
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
  }

  /**
   * Sets up scroll listener on the scrollable card container to control the collapsing sticky header.
   */
  setupScrollListener() {
    if (!this.containerEl || typeof this.containerEl.querySelector !== 'function') return;
    const scrollContainer = this.containerEl.querySelector('#forecast-scroll-container');
    if (scrollContainer && scrollContainer !== this.scrollContainerEl) {
      if (this.scrollContainerEl && this.boundScrollHandler && typeof this.scrollContainerEl.removeEventListener === 'function') {
        this.scrollContainerEl.removeEventListener('scroll', this.boundScrollHandler);
      }
      this.scrollContainerEl = scrollContainer;
      if (typeof this.scrollContainerEl.addEventListener === 'function') {
        this.scrollContainerEl.addEventListener('scroll', this.boundScrollHandler, { passive: true });
      }
    }
    this.stickyBarEl = this.containerEl.querySelector('#forecast-sticky-bar');
  }

  /**
   * Handles scroll events inside #forecast-scroll-container with zero layout thrashing.
   * Toggles the .visible state on #forecast-sticky-bar when scrolled past threshold.
   */
  handleScroll() {
    if (!this.scrollContainerEl) return;
    const threshold = 60;
    const isScrolled = this.scrollContainerEl.scrollTop > threshold;
    if (isScrolled !== this.isScrolledPastHeader) {
      this.isScrolledPastHeader = isScrolled;
      if (!this.stickyBarEl && this.containerEl && typeof this.containerEl.querySelector === 'function') {
        this.stickyBarEl = this.containerEl.querySelector('#forecast-sticky-bar');
      }
      if (this.stickyBarEl) {
        if (this.stickyBarEl.classList && typeof this.stickyBarEl.classList.toggle === 'function') {
          this.stickyBarEl.classList.toggle('visible', isScrolled);
        }
        if (typeof this.stickyBarEl.setAttribute === 'function') {
          this.stickyBarEl.setAttribute('aria-hidden', isScrolled ? 'false' : 'true');
        }
      }
    }
  }

  /**
   * Renders the complete Forecast View HTML into the container and mounts the mini-map.
   */
  render() {
    if (!this.containerEl) return;
    if (this.miniMapEngine) {
      this.miniMapEngine.destroy();
      this.miniMapEngine = null;
    }
    this.containerEl.innerHTML = this.renderHtml();
    this.setupScrollListener();
    this.initMiniMap();
  }

  /**
   * Initializes or updates the contextual spot mini-map and vector windsock.
   */
  initMiniMap() {
    if (!this.containerEl || typeof this.containerEl.querySelector !== 'function') return;
    const miniMapEl = this.containerEl.querySelector('#forecast-mini-map');
    if (!miniMapEl) return;

    const spot = this.getCurrentSpot();
    const glider = this.getActiveGlider();
    const weatherData = this.getWeatherData(spot, this.activeDate);
    const evaluated = evaluateComprensorio({
      comprensorio: spot,
      weatherData,
      hourIndex: this.selectedHour,
      glider,
      targetDate: this.activeDate
    });

    const state = this.store ? this.store.getState() : {};
    const currentTheme = (state.ui && state.ui.theme) || 'dark';

    const activeSub = this.resolveActiveSubSpot(spot);
    const subSpotType = activeSub ? activeSub.spotType : 'overview';
    const activeLayer = this.getActiveMapLayer();

    this.miniMapEngine = createMapEngine(miniMapEl, {
      theme: currentTheme,
      layer: activeLayer,
      isMiniMap: true
    });

    if (this.miniMapEngine && typeof this.miniMapEngine.renderSpotMiniMap === 'function') {
      this.miniMapEngine.renderSpotMiniMap(miniMapEl, {
        comprensorio: spot,
        takeoff: evaluated.takeoff,
        landing: evaluated.landing,
        subSpotType,
        activeSubSpot: activeSub,
        weatherSnapshot: evaluated.weatherSnapshot,
        glideMetrics: evaluated.glideMetrics,
        onSelectSubSpot: (subSpotId) => {
          this.selectedSubSpot = subSpotId;
          this.render();
        }
      });
    }
  }

  /**
   * Generates the complete HTML string for ForecastView.
   * @returns {string}
   */
  renderHtml() {
    const spot = this.getCurrentSpot();
    const glider = this.getActiveGlider();
    const weatherData = this.getWeatherData(spot, this.activeDate);

    // Evaluate single takeoff and landing for active hour
    const evaluated = evaluateComprensorio({
      comprensorio: spot,
      weatherData,
      hourIndex: this.selectedHour,
      glider,
      targetDate: this.activeDate
    });

    // Check if a specific spot is selected in level-2 dropdown
    const activeSubSpotObj = this.resolveActiveSubSpot(spot);

    // Generate Guido safety briefing
    const briefing = generateGuidoBriefing(spot, weatherData, this.activeDate, glider);

    return `
      <div id="forecast-view" class="gm-forecast-view flex flex-col h-full w-full">
        <!-- 0. Collapsing Sticky Header (Anchored when scrolled past main header) -->
        ${this.renderStickyBar(spot, activeSubSpotObj)}

        <!-- Scrollable cards container (occupies only the usable height above the scrubber) -->
        <div id="forecast-scroll-container" class="gm-forecast-scroll-container flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 p-4 max-w-lg mx-auto w-full">
          <!-- 1. Header: Comprensorio Bar + Picker Trigger -->
          ${this.renderHeader(spot)}

          <!-- 2. Spot Card: Dual Unico Binomio or Focused Sub-Spot Detail -->
          <div id="forecast-spot-card-container">
            ${this.selectedSubSpot === 'overview' 
              ? this.renderSummaryCard(evaluated) 
              : this.renderSpecificSpotCard(activeSubSpotObj, evaluated)}
          </div>

          <!-- Mode Toggle: Schede & Dettagli vs Solo Grafici (Trend) -->
          <div class="gm-forecast-mode-bar flex items-center justify-between mt-1 mb-1">
            <span class="text-xs font-semibold uppercase tracking-wider text-[var(--gm-text-muted)]">Aerologia</span>
            <div class="gm-view-toggle" role="group" aria-label="Modalità di visualizzazione aerologia">
              <button 
                type="button" 
                class="gm-view-toggle-btn ${this.forecastMode !== 'charts' ? 'active' : ''}"
                data-action="set-forecast-mode"
                data-mode="cards"
                aria-pressed="${this.forecastMode !== 'charts'}"
              >
                Schede
              </button>
              <button 
                type="button" 
                class="gm-view-toggle-btn ${this.forecastMode === 'charts' ? 'active' : ''}"
                data-action="set-forecast-mode"
                data-mode="charts"
                aria-pressed="${this.forecastMode === 'charts'}"
              >
                Solo Grafici
              </button>
            </div>
          </div>

          <!-- 3. Parameter Cards or Multi-Trend Charts Container -->
          <div id="forecast-params-container">
            ${this.forecastMode === 'charts'
              ? this.renderMultiTrendCharts(evaluated, weatherData, spot, glider, activeSubSpotObj)
              : this.renderParameterCards(evaluated, weatherData, spot, glider, activeSubSpotObj)}
          </div>

          <!-- Hidden containers for wind and sounding panel tests compatibility -->
          <div id="forecast-wind-panel-container" style="display:none;" aria-hidden="true">
            ${this.renderWindPanel(evaluated, weatherData, spot, activeSubSpotObj)}
          </div>
          <div id="forecast-sounding-panel-container" style="display:none;" aria-hidden="true">
            ${this.renderSoundingPanel(evaluated, weatherData, spot, activeSubSpotObj)}
          </div>

          <!-- 5. AI Flight Briefing (Guido Persona) -->
          ${this.renderBriefingCard(briefing, spot)}
        </div>

        <!-- 6. Bottom Docked Scrubber: 13-slot timeline accessible to thumb -->
        ${this.renderStickyScrubber(spot, weatherData, glider)}
      </div>
    `;
  }

  /**
   * Renders the collapsing sticky header anchored at the top of ForecastView.
   * Visible only when the user scrolls down past the main header (>60px).
   * Displays spot name, active takeoff/landing description, live badge, and scroll-to-top button.
   * 
   * @param {object} spot
   * @param {object|null} activeSubSpot
   * @returns {string}
   */
  renderStickyBar(spot, activeSubSpot) {
    if (!spot) return '';

    let subSpotLabel = 'Panoramica';
    if (activeSubSpot) {
      if (activeSubSpot.spotType === 'takeoff') {
        subSpotLabel = `${activeSubSpot.name} (${activeSubSpot.altitude}m · ${getCardinalDirection(activeSubSpot.heading)})`;
      } else if (activeSubSpot.spotType === 'landing') {
        subSpotLabel = `${activeSubSpot.name} (${activeSubSpot.altitude}m)`;
      }
    }

    const fullAriaLabel = `Località attiva: ${escapeHtml(spot.name)}, ${escapeHtml(subSpotLabel)}. Tocca per cambiare comprensorio.`;

    return `
      <div 
        id="forecast-sticky-bar" 
        class="gm-forecast-sticky-bar ${this.isScrolledPastHeader ? 'visible' : ''}"
        role="region"
        aria-label="Informazioni località attiva"
        aria-hidden="${this.isScrolledPastHeader ? 'false' : 'true'}"
      >
        <div class="gm-sticky-bar-content flex items-center justify-between w-full h-full max-w-lg mx-auto px-4">
          <button
            type="button"
            class="gm-sticky-bar-btn flex items-center gap-2 min-w-0 text-left"
            data-action="open-picker-sheet"
            aria-label="${fullAriaLabel}"
            title="${fullAriaLabel}"
          >
            <span class="gm-sticky-bar-pin text-[var(--gm-accent)] flex-shrink-0" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
            </span>
            <div class="gm-sticky-bar-text min-w-0 flex items-center gap-1.5 truncate">
              <span class="gm-sticky-bar-name font-bold text-sm text-[var(--gm-text-primary)] truncate">
                ${escapeHtml(spot.name)}
              </span>
              <span class="gm-sticky-bar-sep text-[var(--gm-text-muted)] text-xs" aria-hidden="true">•</span>
              <span class="gm-sticky-bar-subspot text-xs text-[var(--gm-text-secondary)] font-medium truncate">
                ${escapeHtml(subSpotLabel)}
              </span>
              <span class="gm-sticky-bar-chevron text-[var(--gm-text-muted)] text-xs ml-0.5" aria-hidden="true">›</span>
            </div>
          </button>

          <div class="gm-sticky-bar-actions flex items-center gap-2 flex-shrink-0">
            ${this.renderLiveWeatherBadge('sticky')}
            <button
              type="button"
              class="gm-sticky-bar-scrolltop-btn"
              data-action="scroll-to-top"
              aria-label="Torna in cima alla pagina"
              title="Torna in cima"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="18 15 12 9 6 15"></polyline>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Resolves the selected sub-spot object (takeoff or landing).
   * @param {object} spot
   * @returns {object|null}
   */
  resolveActiveSubSpot(spot) {
    if (!this.selectedSubSpot || this.selectedSubSpot === 'overview') {
      return null;
    }
    const takeoffs = spot.takeoffs || [];
    const landings = spot.landings || [];
    const foundT = takeoffs.find(t => t.id === this.selectedSubSpot);
    if (foundT) return { ...foundT, spotType: 'takeoff' };
    const foundL = landings.find(l => l.id === this.selectedSubSpot);
    if (foundL) return { ...foundL, spotType: 'landing' };
    return null;
  }

  /**
   * Renders Header with Comprensorio Picker trigger, 2-Level Sub-Spot Select, and 3-Day Tabs.
   * @param {object} currentSpot
   * @returns {string}
   */
  renderHeader(currentSpot) {
    const flySummaries = this.getMultiDayFlyability(currentSpot, 14);
    const smartData = getSmartDatePresets(new Date(), this.activeDate, flySummaries);
    const takeoffs = currentSpot.takeoffs || [];
    const landings = currentSpot.landings || [];

    // Resolve active sub-spot label and monochrome vector SVG icon
    let activeSubSpotLabel = 'Panoramica (Decollo Primario + Atterraggio)';
    let activeSubSpotIcon = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
        <polyline points="2 17 12 22 22 17"></polyline>
        <polyline points="2 12 12 17 22 12"></polyline>
      </svg>
    `;

    const activeSub = this.resolveActiveSubSpot(currentSpot);
    if (activeSub) {
      if (activeSub.spotType === 'takeoff') {
        activeSubSpotLabel = `${activeSub.name} (${activeSub.altitude}m · ${activeSub.heading}° ${getCardinalDirection(activeSub.heading)})`;
        activeSubSpotIcon = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m8 3 4 8 5-5 5 15H2L8 3z"></path>
          </svg>
        `;
      } else if (activeSub.spotType === 'landing') {
        activeSubSpotLabel = `${activeSub.name} (${activeSub.altitude}m${activeSub.isOfficial ? ' · Ufficiale' : ''})`;
        activeSubSpotIcon = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="6"></circle>
            <circle cx="12" cy="12" r="2"></circle>
          </svg>
        `;
      }
    }

    return `
      <header class="gm-forecast-header">
        <!-- Level 1: Comprensorio Bar + Picker Trigger (Full Width, Zero Duplicate Home) -->
        <div 
          class="gm-comprensorio-bar" 
          data-action="open-picker-sheet" 
          role="button" 
          tabindex="0" 
          aria-label="Cambia comprensorio, attualmente ${escapeHtml(currentSpot.name)}"
        >
          <div class="gm-comprensorio-bar-info">
            <span class="gm-comprensorio-pin" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
            </span>
            <div class="gm-comprensorio-text">
              <span class="gm-comprensorio-name">
                ${escapeHtml(currentSpot.name)} (${escapeHtml(currentSpot.province)})
              </span>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="gm-comprensorio-sub">
                  Tocca per cambiare comprensorio
                </span>
                ${this.renderLiveWeatherBadge()}
              </div>
            </div>
          </div>
          <span class="gm-comprensorio-chevron" aria-hidden="true">›</span>
        </div>

        <!-- Level 2: Sub-Spot Custom Dropdown (Strictly bounded, Zero Multi-color Emoji) -->
        <div class="gm-subspot-dropdown-wrapper">
          <label for="forecast-subspot-select" class="sr-only">Seleziona Punto di Volo o Panoramica</label>
          <select 
            id="forecast-subspot-select" 
            class="gm-subspot-select sr-only" 
            data-action="change-subspot" 
            aria-label="Seleziona Punto o Panoramica del Comprensorio"
            tabindex="-1"
            aria-hidden="true"
          >
            <option value="overview" ${this.selectedSubSpot === 'overview' ? 'selected' : ''}>
              Panoramica (Decollo Primario + Atterraggio)
            </option>
            ${takeoffs.length > 0 ? `
              <optgroup label="Decolli">
                ${takeoffs.map(t => `
                  <option value="${t.id}" ${this.selectedSubSpot === t.id ? 'selected' : ''}>
                    ${escapeHtml(t.name)} (${t.altitude}m · ${t.heading}° ${getCardinalDirection(t.heading)})
                  </option>
                `).join('')}
              </optgroup>
            ` : ''}
            ${landings.length > 0 ? `
              <optgroup label="Atterraggi">
                ${landings.map(l => `
                  <option value="${l.id}" ${this.selectedSubSpot === l.id ? 'selected' : ''}>
                    ${escapeHtml(l.name)} (${l.altitude}m${l.isOfficial ? ' · Ufficiale' : ''})
                  </option>
                `).join('')}
              </optgroup>
            ` : ''}
          </select>

          <button
            type="button"
            class="gm-subspot-trigger ${this.isSubSpotMenuOpen ? 'open' : ''}"
            data-action="toggle-subspot-menu"
            aria-expanded="${this.isSubSpotMenuOpen ? 'true' : 'false'}"
            aria-haspopup="listbox"
            aria-label="Seleziona punto o panoramica, attualmente ${escapeHtml(activeSubSpotLabel)}"
          >
            <div class="gm-subspot-trigger-info">
              <span class="gm-subspot-trigger-icon" aria-hidden="true">
                ${activeSubSpotIcon}
              </span>
              <span class="gm-subspot-trigger-text">
                ${escapeHtml(activeSubSpotLabel)}
              </span>
            </div>
            <span class="gm-subspot-trigger-chevron ${this.isSubSpotMenuOpen ? 'rotated' : ''}" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>
          </button>

          ${this.isSubSpotMenuOpen ? `
            <div class="gm-subspot-popover" role="listbox" aria-label="Opzioni punto di volo">
              <!-- Item Panoramica -->
              <button
                type="button"
                class="gm-subspot-item ${this.selectedSubSpot === 'overview' ? 'active' : ''}"
                data-action="select-subspot"
                data-subspot-id="overview"
                role="option"
                aria-selected="${this.selectedSubSpot === 'overview' ? 'true' : 'false'}"
              >
                <div class="gm-subspot-item-left">
                  <span class="gm-subspot-item-icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                      <polyline points="2 17 12 22 22 17"></polyline>
                      <polyline points="2 12 12 17 22 12"></polyline>
                    </svg>
                  </span>
                  <span class="gm-subspot-item-name font-semibold">Panoramica (Decollo Primario + Atterraggio)</span>
                </div>
                ${this.selectedSubSpot === 'overview' ? `
                  <span class="gm-subspot-item-check" aria-hidden="true">✓</span>
                ` : ''}
              </button>

              <!-- Gruppo Decolli -->
              ${takeoffs.length > 0 ? `
                <div class="gm-subspot-group-header">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="m8 3 4 8 5-5 5 15H2L8 3z"></path>
                  </svg>
                  <span>Decolli</span>
                </div>
                ${takeoffs.map(t => {
                  const isSel = this.selectedSubSpot === t.id;
                  return `
                    <button
                      type="button"
                      class="gm-subspot-item ${isSel ? 'active' : ''}"
                      data-action="select-subspot"
                      data-subspot-id="${escapeHtml(t.id)}"
                      role="option"
                      aria-selected="${isSel ? 'true' : 'false'}"
                    >
                      <div class="gm-subspot-item-left">
                        <span class="gm-subspot-item-bullet" aria-hidden="true">•</span>
                        <div class="gm-subspot-item-text-group">
                          <span class="gm-subspot-item-name">${escapeHtml(t.name)}</span>
                          <span class="gm-subspot-item-badge">${t.altitude}m · ${t.heading}° ${getCardinalDirection(t.heading)}</span>
                        </div>
                      </div>
                      ${isSel ? `
                        <span class="gm-subspot-item-check" aria-hidden="true">✓</span>
                      ` : ''}
                    </button>
                  `;
                }).join('')}
              ` : ''}

              <!-- Gruppo Atterraggi -->
              ${landings.length > 0 ? `
                <div class="gm-subspot-group-header">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"></circle>
                    <circle cx="12" cy="12" r="6"></circle>
                    <circle cx="12" cy="12" r="2"></circle>
                  </svg>
                  <span>Atterraggi</span>
                </div>
                ${landings.map(l => {
                  const isSel = this.selectedSubSpot === l.id;
                  return `
                    <button
                      type="button"
                      class="gm-subspot-item ${isSel ? 'active' : ''}"
                      data-action="select-subspot"
                      data-subspot-id="${escapeHtml(l.id)}"
                      role="option"
                      aria-selected="${isSel ? 'true' : 'false'}"
                    >
                      <div class="gm-subspot-item-left">
                        <span class="gm-subspot-item-bullet" aria-hidden="true">•</span>
                        <div class="gm-subspot-item-text-group">
                          <span class="gm-subspot-item-name">${escapeHtml(l.name)}</span>
                          <span class="gm-subspot-item-badge">${l.altitude}m${l.isOfficial ? ' · Ufficiale' : ''}</span>
                        </div>
                      </div>
                      ${isSel ? `
                        <span class="gm-subspot-item-check" aria-hidden="true">✓</span>
                      ` : ''}
                    </button>
                  `;
                }).join('')}
              ` : ''}
            </div>
          ` : ''}
        </div>

        <!-- Smart Adaptive Date Tabs + Calendar Button -->
        <div class="gm-date-tabs" role="tablist" aria-label="Selettore data previsione">
          ${smartData.presets.map(p => `
            <button 
              type="button" 
              class="gm-date-tab ${p.isActive ? 'active' : ''} ${p.isCustom ? 'custom' : ''}"
              data-action="select-date"
              data-date="${p.isoDate}"
              role="tab"
              aria-selected="${p.isActive ? 'true' : 'false'}"
              title="${p.label} - ${p.subLabel}${p.flyability && p.flyability.status !== 'unknown' ? ` (${p.flyability.label})` : ''}"
            >
              <span class="gm-date-tab-main">
                ${p.label}
                ${p.flyability && p.flyability.status !== 'unknown' ? `<span class="gm-tab-fly-dot fly-${p.flyability.status}" title="${escapeHtml(p.flyability.label)}"></span>` : ''}
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
          <div class="gm-horizon-notice" role="status">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="gm-horizon-icon" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span><strong>Tendenza a lungo raggio:</strong> oltre 7 giorni le previsioni sono soggette a variazioni sinottiche.</span>
          </div>
        ` : ''}
      </header>
    `;
  }

  /**
   * Formats short date tab subtitle (e.g. "9 Ott").
   * @param {number} dayOffset
   * @returns {string}
   */
  formatDateTab(dayOffset) {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  }

  /**
   * Renders the internal metrics for the Unico Binomio Summary Card.
   * @param {object} evalData
   * @returns {string}
   */
  renderSummaryMetrics(evalData) {
    const takeoff = evalData.takeoff || {};
    const landing = evalData.landing || {};
    const glide = evalData.glideMetrics || { requiredGlideRatio: '-', isSafe: true };
    const weather = evalData.weatherSnapshot || {};

    const takeoffName = (takeoff.name || 'Decollo').replace(/^Decollo\s*/i, '');
    const landingName = (landing.name || 'Atterraggio').replace(/^Atterraggio\s*/i, '');
    const takeoffAlt = takeoff.altitude ? `${takeoff.altitude}m` : '-';
    const landingAlt = landing.altitude ? `${landing.altitude}m` : '-';

    const windSpeedStr = weather.windSpeed != null ? `${Math.round(weather.windSpeed)} km/h` : '-';
    const dirVal = weather.windDirection ?? weather.windDir;
    const windDirStr = dirVal != null ? `${getCardinalDirection(dirVal)} (${Math.round(dirVal)}°)` : '';

    return `
      <!-- Top Row: Hour & Status Badge -->
      <div class="flex items-center justify-between border-b border-[var(--gm-border)] pb-2 mb-2">
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold uppercase tracking-wider text-[var(--gm-accent)]">Ore Selezionate</span>
          <span class="text-sm font-mono font-bold text-[var(--gm-text-primary)]">
            ${String(this.selectedHour).padStart(2, '0')}:00
          </span>
        </div>
        <span 
          class="px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded-full border border-current"
          style="color: ${evalData.badgeColor}; background-color: ${evalData.badgeBg};"
        >
          ${evalData.badge}
        </span>
      </div>

      <!-- Dual Launch/Landing Info -->
      <div class="gm-flight-data-grid">
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
            <span class="gm-glide-val ${glide.isSafe ? 'text-[var(--gm-status-flyable)]' : 'text-[var(--gm-status-caution)]'}">
              1:${glide.requiredGlideRatio}
            </span>
          </div>
        </div>
      </div>

      <!-- Explainability String -->
      <div class="gm-spot-explain mt-2 pt-2 border-t border-[var(--gm-border)]">
        <span class="gm-explain-bullet">●</span>
        <span>${escapeHtml(evalData.reason)}</span>
      </div>
    `;
  }

  /**
   * Renders the Unico Binomio Summary Card for the selected hour.
   * @param {object} evalData
   * @returns {string}
  /**
   * Resolves the active cartographic map layer from state or theme fallback.
   * @returns {string} Layer ID ('dark' | 'topo' | 'satellite' | 'streets')
   */
  getActiveMapLayer() {
    const state = this.store ? this.store.getState() : {};
    const theme = (state.ui && state.ui.theme) || 'dark';
    return (state.ui && state.ui.mapLayer) || (theme === 'light' ? 'topo' : 'dark');
  }

  /**
   * Renders the mini-map box container with canvas, layer selector, and expand action button.
   * @returns {string}
   */
  renderMiniMapBox() {
    const activeLayer = this.getActiveMapLayer();
    return `
      <div id="forecast-mini-map-container" class="gm-mini-map-box" data-map-layer="${activeLayer}">
        <div id="forecast-mini-map" class="gm-mini-map-canvas"></div>
        <select 
          id="forecast-minimap-layer-select" 
          class="gm-mini-map-layer-select" 
          aria-label="Seleziona layer cartografico" 
          title="Seleziona layer mappa"
        >
          <option value="topo" ${activeLayer === 'topo' ? 'selected' : ''}>OpenTopo</option>
          <option value="satellite" ${activeLayer === 'satellite' ? 'selected' : ''}>Satellite</option>
          <option value="dark" ${activeLayer === 'dark' ? 'selected' : ''}>Scuro</option>
          <option value="streets" ${activeLayer === 'streets' ? 'selected' : ''}>CyclOSM</option>
        </select>
        <button 
          type="button" 
          class="gm-mini-map-expand-btn" 
          data-action="open-full-map" 
          aria-label="Apri mappa comprensori completa" 
          title="Apri mappa comprensori completa"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="15 3 21 3 21 9"></polyline>
            <polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
        </button>
      </div>
    `;
  }

  /**
   * Renders the Unico Binomio Summary Card for the selected hour.
   * @param {object} evalData
   * @returns {string}
   */
  renderSummaryCard(evalData) {
    return `
      <section aria-labelledby="heading-summary-bin" class="gm-summary-section">
        <h2 id="heading-summary-bin" class="sr-only">Sintesi Volabilità Unico Binomio</h2>
        <article id="forecast-summary-card" class="gm-spot-card gm-spot-card-split">
          <div id="forecast-spot-metrics-container" class="gm-spot-card-metrics">
            ${this.renderSummaryMetrics(evalData)}
          </div>
          ${this.renderMiniMapBox()}
        </article>
      </section>
    `;
  }

  /**
   * Renders the internal metrics for a specific spot.
   * @param {object} subSpot
   * @param {object} evalData
   * @returns {string}
   */
  renderSpecificSpotMetrics(subSpot, evalData) {
    if (!subSpot) return this.renderSummaryMetrics(evalData);
    const weather = evalData.weatherSnapshot || {};
    const isTakeoff = subSpot.spotType === 'takeoff';
    const icon = isTakeoff ? '↗' : '↘';

    const windSpeedStr = weather.windSpeed != null ? `${Math.round(weather.windSpeed)} km/h` : '-';
    const dirVal = weather.windDirection ?? weather.windDir;
    const windDirStr = dirVal != null ? `${getCardinalDirection(dirVal)} (${Math.round(dirVal)}°)` : '';

    return `
      <div class="flex items-center justify-between border-b border-[var(--gm-border)] pb-2 mb-2">
        <div class="flex items-center gap-2">
          <span class="text-sm font-bold text-[var(--gm-accent)]">${icon} ${escapeHtml(subSpot.name)}</span>
          <span class="text-xs text-[var(--gm-text-muted)] font-mono">(${subSpot.altitude}m)</span>
        </div>
        <span class="text-xs font-mono font-bold text-[var(--gm-text-secondary)]">
          Ore ${String(this.selectedHour).padStart(2, '0')}:00
        </span>
      </div>

      <div class="flex flex-col gap-1.5 text-xs text-[var(--gm-text-secondary)]">
        ${isTakeoff ? `
          <div class="flex justify-between">
            <span>Azimut Pendio:</span>
            <span class="font-bold text-[var(--gm-text-primary)] font-mono">${subSpot.heading}° (${getCardinalDirection(subSpot.heading)})</span>
          </div>
        ` : `
          <div class="flex justify-between">
            <span>Classificazione:</span>
            <span class="font-bold text-[var(--gm-text-primary)]">${subSpot.isOfficial ? 'Ufficiale' : 'Alternativo / Emergenza'}</span>
          </div>
        `}
        <div class="flex justify-between">
          <span>Vento Stimato:</span>
          <span class="font-bold text-[var(--gm-text-primary)] font-mono">${windSpeedStr} da ${windDirStr}</span>
        </div>
        ${subSpot.coordinates ? `
          <div class="flex justify-between">
            <span>Coordinate GPS:</span>
            <span class="font-mono text-[var(--gm-text-muted)]">${escapeHtml(subSpot.coordinates)}</span>
          </div>
        ` : ''}
        ${subSpot.description ? `
          <p class="mt-1 pt-1 border-t border-[var(--gm-border)] text-xs text-[var(--gm-text-muted)] leading-relaxed">
            ${escapeHtml(subSpot.description)}
          </p>
        ` : ''}
      </div>
    `;
  }

  /**
   * Renders the Specific Spot Card when a single takeoff or landing is chosen.
   * @param {object} subSpot
   * @param {object} evalData
   * @returns {string}
   */
  renderSpecificSpotCard(subSpot, evalData) {
    if (!subSpot) return this.renderSummaryCard(evalData);
    const isTakeoff = subSpot.spotType === 'takeoff';
    const roleLabel = isTakeoff ? 'Decollo' : 'Atterraggio';

    return `
      <section aria-labelledby="heading-specific-spot" class="gm-summary-section">
        <h2 id="heading-specific-spot" class="sr-only">Dettaglio ${roleLabel}</h2>
        <article id="forecast-specific-spot-card" class="gm-spot-card gm-spot-card-split">
          <div id="forecast-spot-metrics-container" class="gm-spot-card-metrics">
            ${this.renderSpecificSpotMetrics(subSpot, evalData)}
          </div>
          ${this.renderMiniMapBox()}
        </article>
      </section>
    `;
  }

  /**
   * Computes analytical metrics, 4-state flyability indicators, and pilot advice
   * for the 7 primary paragliding parameters across the 08:00 - 20:00 diurnal window.
   * 
   * @param {object} evaluated
   * @param {object} weatherData
   * @param {object} spot
   * @param {object} glider
   * @param {object|null} activeSubSpotObj
   * @returns {object}
   */
  computeParamMetrics(evaluated, weatherData, spot, glider, activeSubSpotObj) {
    const takeoff = (activeSubSpotObj && activeSubSpotObj.spotType === 'takeoff')
      ? activeSubSpotObj
      : (evaluated.takeoff || (spot.takeoffs && spot.takeoffs[0]) || { altitude: 1000, heading: 180 });

    const landing = (activeSubSpotObj && activeSubSpotObj.spotType === 'landing')
      ? activeSubSpotObj
      : (evaluated.landing || (spot.landings && spot.landings[0]) || { altitude: 400, heading: 180 });

    const hourlyData = (weatherData && weatherData.hourly) || {};
    const times = hourlyData.time || [];

    const hourlyPoints = [];
    for (let h = 8; h <= 20; h++) {
      const timePrefix = `${this.activeDate}T${String(h).padStart(2, '0')}:`;
      const idx = times.findIndex(t => t.startsWith(timePrefix));
      let speed = 12;
      let gust = 16;
      let dir = 180;
      let temp = 20;
      let dew = 12;
      let humidity = 55;
      let cape = 150;
      let cloudCover = 25;
      let precip = 0;

      if (idx !== -1) {
        const rawSpeed = hourlyData.windspeed_10m ?? hourlyData.wind_speed_10m;
        const rawGust = hourlyData.windgusts_10m ?? hourlyData.wind_gusts_10m;
        const rawDir = hourlyData.winddirection_10m ?? hourlyData.wind_direction_10m;
        const rawTemp = hourlyData.temperature_2m;
        const rawDew = hourlyData.dewpoint_2m ?? hourlyData.dew_point_2m;
        const rawHum = hourlyData.relativehumidity_2m ?? hourlyData.relative_humidity_2m;
        const rawCape = hourlyData.cape;
        const rawCloud = hourlyData.cloudcover ?? hourlyData.cloud_cover;
        const rawPrecip = hourlyData.precipitation ?? hourlyData.precipitation_probability;

        if (rawSpeed && rawSpeed[idx] != null) speed = Number(rawSpeed[idx]);
        if (rawGust && rawGust[idx] != null) gust = Number(rawGust[idx]);
        if (rawDir && rawDir[idx] != null) dir = Number(rawDir[idx]);
        if (rawTemp && rawTemp[idx] != null) temp = Number(rawTemp[idx]);
        if (rawDew && rawDew[idx] != null) dew = Number(rawDew[idx]);
        if (rawHum && rawHum[idx] != null) humidity = Number(rawHum[idx]);
        if (rawCape && rawCape[idx] != null) cape = Number(rawCape[idx]);
        if (rawCloud && rawCloud[idx] != null) cloudCover = Number(rawCloud[idx]);
        if (rawPrecip && rawPrecip[idx] != null) precip = Number(rawPrecip[idx]);
      }

      const lcl = calculateLCL(temp, dew, takeoff.altitude);
      const lclMsl = lcl ? lcl.lclMsl : (takeoff.altitude + 800);
      const deltaWind = Math.max(0, gust - speed);
      const angleDelta = Math.abs(calculateAngularDifference(takeoff.heading, dir));
      const updraft = Math.max(0.5, Math.min(5.0, (temp - dew) * 0.22 + (cape > 300 ? (cape / 400) : 0)));
      const edr = Math.max(0.8, Math.min(4.5, deltaWind * 0.15 + (updraft > 2.5 ? 1.0 : 0.4)));
      const landingSpeed = Math.max(4, Math.round(speed * 0.75));

      hourlyPoints.push({
        hour: h,
        speed,
        gust,
        dir,
        temp,
        dew,
        humidity,
        cape,
        cloudCover,
        precip,
        lclMsl,
        deltaWind,
        angleDelta,
        updraft,
        edr,
        landingSpeed
      });
    }

    const activePoint = hourlyPoints.find(p => p.hour === this.selectedHour) || hourlyPoints[0];
    const maxWindLimit = glider.maxWind || 18;
    const maxGustLimit = glider.maxGust || 25;

    // 1. Vento in Decollo
    let windStatus = 'flyable';
    let windStatusLabel = 'Favorevole';
    if (activePoint.speed <= maxWindLimit && activePoint.gust <= maxGustLimit && activePoint.angleDelta <= 45) {
      windStatus = 'flyable';
      windStatusLabel = 'Favorevole';
    } else if (activePoint.speed <= maxWindLimit + 4 && activePoint.gust <= maxGustLimit + 5 && activePoint.angleDelta <= 75) {
      windStatus = 'caution';
      windStatusLabel = 'Attenzione';
    } else if (activePoint.speed > maxWindLimit + 10 || activePoint.gust > 35 || activePoint.angleDelta > 105) {
      windStatus = 'severe';
      windStatusLabel = 'Pericoloso';
    } else {
      windStatus = 'unflyable';
      windStatusLabel = 'Non Favorevole';
    }

    const windParam = {
      id: 'vento-decollo',
      title: 'Vento in Decollo',
      subtitle: 'Velocità, direzione e allineamento al decollo',
      value: `${Math.round(activePoint.speed)} km/h · ${Math.round(activePoint.dir)}° ${getCardinalDirection(activePoint.dir)}`,
      status: windStatus,
      statusLabel: windStatusLabel,
      takeoffHeading: takeoff.heading,
      takeoffAlt: takeoff.altitude,
      details: [
        { label: 'Velocità Media', value: `${Math.round(activePoint.speed)} km/h` },
        { label: 'Raffica di Picco', value: `${Math.round(activePoint.gust)} km/h` },
        { label: 'Direzione Vento', value: `${Math.round(activePoint.dir)}° (${getCardinalDirection(activePoint.dir)})` },
        { label: 'Scostamento Decollo', value: `${Math.round(activePoint.angleDelta)}° (${activePoint.angleDelta <= 35 ? 'In Asse' : activePoint.angleDelta <= 75 ? 'Al Traverso' : 'Fuori Asse'})` }
      ],
      advice: windStatus === 'flyable'
        ? 'Intensità e orientamento ottimali rispetto al decollo. Gonfiaggio regolare con ottimo controllo a terra.'
        : windStatus === 'caution'
        ? 'Vento sostenuto o al traverso rispetto al decollo. Richiesta attenzione nella fase di corsa e gonfiaggio.'
        : windStatus === 'severe'
        ? 'Vento tempestoso o raffiche violente. Pericolo critico di trascinamento e turbolenza orografica.'
        : 'Vento oltre i limiti di sicurezza dell\'ala o con componente da dietro. Decollo fortemente sconsigliato.'
    };

    // 2. Raffiche & Delta Vento
    let gustStatus = 'flyable';
    let gustStatusLabel = 'Flusso Regolare';
    if (activePoint.deltaWind <= 7 && activePoint.gust <= maxWindLimit) {
      gustStatus = 'flyable';
      gustStatusLabel = 'Flusso Regolare';
    } else if (activePoint.deltaWind <= 12 && activePoint.gust <= maxGustLimit) {
      gustStatus = 'caution';
      gustStatusLabel = 'Raffiche Moderate';
    } else if (activePoint.deltaWind > 18 || activePoint.gust > 35) {
      gustStatus = 'severe';
      gustStatusLabel = 'Turbolenza Severa';
    } else {
      gustStatus = 'unflyable';
      gustStatusLabel = 'Raffiche Forti';
    }

    const gustParam = {
      id: 'raffiche',
      title: 'Raffiche & Delta Vento',
      subtitle: 'Escursione anemometrica e turbolenza meccanica al suolo',
      value: `Raffica ${Math.round(activePoint.gust)} km/h (Delta +${Math.round(activePoint.deltaWind)} km/h)`,
      status: gustStatus,
      statusLabel: gustStatusLabel,
      details: [
        { label: 'Raffica Massima', value: `${Math.round(activePoint.gust)} km/h` },
        { label: 'Delta Raffica', value: `+${Math.round(activePoint.deltaWind)} km/h` },
        { label: 'Fattore Raffica', value: `${(activePoint.gust / Math.max(1, activePoint.speed)).toFixed(2)}x` },
        { label: 'Stabilità al Suolo', value: activePoint.deltaWind <= 8 ? 'Laminare' : activePoint.deltaWind <= 14 ? 'Intermittente' : 'Rotorica' }
      ],
      advice: gustStatus === 'flyable'
        ? 'Brezza costante con escursioni minime. Basso rischio di chiusure asimmetriche in decollo.'
        : gustStatus === 'caution'
        ? 'Raffiche termiche intermittenti. Pronti a fermare le beccate della vela durante la fase di decollo.'
        : gustStatus === 'severe'
        ? 'Gradiente e raffiche estreme. Rischio elevato di collasso strutturale a bassa quota.'
        : 'Raffiche brusche con delta superiore a 12 km/h. Rischio di scarrocciamento e violento beccheggio in uscita.',
      chartOptions: {
        id: 'param-chart-gust',
        title: 'Raffiche e Vento',
        unit: 'km/h',
        minY: 0,
        maxY: 45,
        thresholds: [
          { value: maxWindLimit, stroke: 'var(--gm-status-caution)', label: `Limite Ala (${maxWindLimit})` }
        ],
        series: [
          {
            name: 'Raffiche',
            points: hourlyPoints.map(p => ({ hour: p.hour, value: p.gust })),
            stroke: 'var(--gm-status-alert)',
            strokeWidth: 1.8,
            strokeDasharray: '3,3',
            fillArea: 'rgba(249, 115, 22, 0.12)'
          },
          {
            name: 'Vento',
            points: hourlyPoints.map(p => ({ hour: p.hour, value: p.speed })),
            stroke: 'var(--gm-status-flyable)',
            strokeWidth: 2.5
          }
        ]
      }
    };

    // 3. Base Cumulo (LCL)
    const lclMargin = activePoint.lclMsl - takeoff.altitude;
    let lclStatus = 'flyable';
    let lclStatusLabel = 'Favorevole';
    if (lclMargin >= 600) {
      lclStatus = 'flyable';
      lclStatusLabel = 'Favorevole';
    } else if (lclMargin >= 200) {
      lclStatus = 'caution';
      lclStatusLabel = 'Marginale';
    } else if (lclMargin < 0) {
      lclStatus = 'severe';
      lclStatusLabel = 'Decollo in Nube';
    } else {
      lclStatus = 'unflyable';
      lclStatusLabel = 'Nubi Basse';
    }

    const lclParam = {
      id: 'base-cumulo',
      title: 'Base Cumulo (LCL)',
      subtitle: 'Quota di condensazione termica e margine sul decollo',
      value: `${Math.round(activePoint.lclMsl)} m slm (${lclMargin >= 0 ? '+' : ''}${Math.round(lclMargin)} m su decollo)`,
      status: lclStatus,
      statusLabel: lclStatusLabel,
      takeoffAlt: takeoff.altitude,
      details: [
        { label: 'Quota Base Stimata', value: `${Math.round(activePoint.lclMsl)} m slm` },
        { label: 'Margine dal Decollo', value: `${lclMargin >= 0 ? '+' : ''}${Math.round(lclMargin)} m` },
        { label: 'Temperatura al Suolo', value: `${activePoint.temp.toFixed(1)} °C` },
        { label: 'Punto di Rugiada', value: `${activePoint.dew.toFixed(1)} °C` }
      ],
      advice: lclStatus === 'flyable'
        ? 'Base nubi ampiamente sopra il decollo. Ampio spazio utile per veleggiare e termicare in piena sicurezza visiva.'
        : lclStatus === 'caution'
        ? 'Base cumulo vicina alla quota di decollo. Attenzione a non entrare in nube durante il guadagno di quota in termica.'
        : lclStatus === 'severe'
        ? 'Decollo immerso nella nube o nebbia orografica totale. Volo a vista (VFR) non consentito.'
        : 'Quota nubi molto bassa. Visibilità ridotta e rischio concreto di banco nuvoloso a ridosso del pendio.'
    };

    // 4. Instabilità / Temporali (CAPE)
    let capeStatus = 'flyable';
    let capeStatusLabel = 'Stabile / Sicuro';
    if (activePoint.cape < 300) {
      capeStatus = 'flyable';
      capeStatusLabel = 'Stabile / Sicuro';
    } else if (activePoint.cape < 800) {
      capeStatus = 'caution';
      capeStatusLabel = 'Sovrasviluppi';
    } else if (activePoint.cape >= 1500) {
      capeStatus = 'severe';
      capeStatusLabel = 'Temporali Severi';
    } else {
      capeStatus = 'unflyable';
      capeStatusLabel = 'Rischio Temporali';
    }

    const capeParam = {
      id: 'instabilita',
      title: 'Instabilità / Temporali (CAPE)',
      subtitle: 'Energia convettiva potenziale e rischio sovrasviluppi',
      value: `${Math.round(activePoint.cape)} J/kg · ${activePoint.cape < 300 ? 'Rischio Basso' : activePoint.cape < 800 ? 'Attenzione' : 'Rischio Elevato'}`,
      status: capeStatus,
      statusLabel: capeStatusLabel,
      details: [
        { label: 'Indice CAPE', value: `${Math.round(activePoint.cape)} J/kg` },
        { label: 'Probabilità Sovrasviluppi', value: activePoint.cape < 300 ? 'Bassa (<15%)' : activePoint.cape < 800 ? 'Media (40%)' : 'Alta (>75%)' },
        { label: 'Attività Convettiva', value: activePoint.cape < 300 ? 'Ordinaria' : activePoint.cape < 800 ? 'Vivace' : 'Esplosiva' },
        { label: 'Fascia Oraria Attenzione', value: '14:00 - 18:00' }
      ],
      advice: capeStatus === 'flyable'
        ? 'Atmosfera stabile con convezione controllata. Nessun rischio di cumulonembi o convezione profonda.'
        : capeStatus === 'caution'
        ? 'Energia convettiva presente. Monitorare l\'evoluzione verticale dei cumuli; atterrare prima della comparsa di congesti.'
        : capeStatus === 'severe'
        ? 'Condizioni temporalesche severe con formazioni a rapido sviluppo. Volo vietato per rischio fulmini e discendenze catastrofiche.'
        : 'Forte energia convettiva nell\'aria. Elevato rischio di rovesci, raffiche di outflow e formazioni temporalesche.',
      chartOptions: {
        id: 'param-chart-cape',
        title: 'Instabilità CAPE',
        unit: 'J/kg',
        minY: 0,
        maxY: Math.max(1000, ...hourlyPoints.map(p => p.cape)),
        thresholds: [
          { value: 300, stroke: 'var(--gm-status-caution)', label: 'Attenzione (300)' },
          { value: 800, stroke: 'var(--gm-status-unflyable)', label: 'Rischio (800)' }
        ],
        series: [
          {
            name: 'CAPE',
            points: hourlyPoints.map(p => ({ hour: p.hour, value: p.cape })),
            stroke: 'var(--gm-status-caution)',
            strokeWidth: 2.2,
            fillArea: 'rgba(234, 179, 8, 0.15)'
          }
        ]
      }
    };

    // 5. Turbolenza in Termica (EDR)
    let edrStatus = 'flyable';
    let edrStatusLabel = 'Termiche Dolci';
    if (activePoint.edr <= 1.8) {
      edrStatus = 'flyable';
      edrStatusLabel = 'Termiche Dolci';
    } else if (activePoint.edr <= 2.8) {
      edrStatus = 'caution';
      edrStatusLabel = 'Termiche Vive';
    } else if (activePoint.edr > 3.8) {
      edrStatus = 'severe';
      edrStatusLabel = 'Pericolo Rotori';
    } else {
      edrStatus = 'unflyable';
      edrStatusLabel = 'Turbolenza Forte';
    }

    const edrParam = {
      id: 'turbolenza',
      title: 'Turbolenza in Termica (EDR)',
      subtitle: 'Aggressività ascendenze, gradiente termico e taglio del vento',
      value: `${activePoint.edr < 1.8 ? 'Dolce' : activePoint.edr < 2.8 ? 'Vivace' : 'Severa'} · Salita stimata +${activePoint.updraft.toFixed(1)} m/s`,
      status: edrStatus,
      statusLabel: edrStatusLabel,
      details: [
        { label: 'Salita Termica Stimata', value: `+${activePoint.updraft.toFixed(1)} m/s` },
        { label: 'Indice EDR / Taglio', value: `${activePoint.edr.toFixed(1)}` },
        { label: 'Gradiente Verticale', value: '-0.65 °C/100m (Standard)' },
        { label: 'Impegno Pilota', value: activePoint.edr <= 1.8 ? 'Rilassato (Ideale EN-A)' : activePoint.edr <= 2.8 ? 'Attivo Moderato' : 'Molto Intenso' }
      ],
      advice: edrStatus === 'flyable'
        ? 'Ascendenze termiche morbide e regolari, ideali per piloti principianti ed EN-A.'
        : edrStatus === 'caution'
        ? 'Termiche consistenti con bordi netti. Richiesto pilotaggio attivo per contrastare piccoli movimenti di rollio e beccheggio.'
        : edrStatus === 'severe'
        ? 'Turbolenza rotorica o termica estrema. Controllo dell\'ala gravemente compromesso.'
        : 'Termiche rotte da vento forte o gradienti superadiabatici. Rischio elevato di violente chiusure della vela.',
      chartOptions: {
        id: 'param-chart-edr',
        title: 'Tasso di Salita Termica',
        unit: 'm/s',
        minY: 0,
        maxY: 5,
        thresholds: [
          { value: 2.5, stroke: 'var(--gm-status-caution)', label: 'Termiche Vive (2.5)' }
        ],
        series: [
          {
            name: 'Updraft',
            points: hourlyPoints.map(p => ({ hour: p.hour, value: p.updraft })),
            stroke: 'var(--gm-status-flyable)',
            strokeWidth: 2.2,
            fillArea: 'rgba(34, 197, 94, 0.15)'
          }
        ]
      }
    };

    // 6. Copertura Nuvolosa & Insolazione
    let cloudStatus = 'flyable';
    let cloudStatusLabel = 'Soleggiato';
    if (activePoint.cloudCover <= 35 && activePoint.precip === 0) {
      cloudStatus = 'flyable';
      cloudStatusLabel = 'Soleggiato';
    } else if (activePoint.cloudCover <= 80 && activePoint.precip === 0) {
      cloudStatus = 'caution';
      cloudStatusLabel = 'Parz. Nuvoloso';
    } else if (activePoint.precip > 0.5) {
      cloudStatus = 'severe';
      cloudStatusLabel = 'Pioggia';
    } else {
      cloudStatus = 'unflyable';
      cloudStatusLabel = 'Coperto';
    }

    const cloudParam = {
      id: 'copertura',
      title: 'Copertura Nuvolosa & Insolazione',
      subtitle: 'Radiazione solare al suolo e innesco termico dei versanti',
      value: `${Math.round(activePoint.cloudCover)}% coperto · ${activePoint.cloudCover <= 35 ? 'Soleggiato' : activePoint.cloudCover <= 70 ? 'Variabile' : 'Coperto'}`,
      status: cloudStatus,
      statusLabel: cloudStatusLabel,
      details: [
        { label: 'Copertura Totale', value: `${Math.round(activePoint.cloudCover)}%` },
        { label: 'Insolazione Pendio', value: activePoint.cloudCover <= 35 ? 'Massima (100%)' : activePoint.cloudCover <= 70 ? 'Variabile (60%)' : 'Debole (<20%)' },
        { label: 'Precipitazioni Orarie', value: `${activePoint.precip.toFixed(1)} mm` },
        { label: 'Umidità Relativa', value: `${Math.round(activePoint.humidity)}%` }
      ],
      advice: cloudStatus === 'flyable'
        ? 'Pendii ben illuminati dal sole, innesco termico costante e ben delineato.'
        : cloudStatus === 'caution'
        ? 'Passaggi nuvolosi che potrebbero ombreggiare temporaneamente i versanti e spegnere le termiche.'
        : cloudStatus === 'severe'
        ? 'Pioggia in atto o imminente. Decollo assolutamente vietato per pericolo bagnatura del tessuto e stallo paracadutale.'
        : 'Cielo compatto o minaccia di precipitazioni; attività termica inibita con rischio di spegnimento delle brezze.',
      chartOptions: {
        id: 'param-chart-cloud',
        title: 'Copertura Nuvolosa',
        unit: '%',
        minY: 0,
        maxY: 100,
        thresholds: [
          { value: 80, stroke: 'var(--gm-status-caution)', label: 'Nuvoloso (80%)' }
        ],
        series: [
          {
            name: 'Copertura',
            points: hourlyPoints.map(p => ({ hour: p.hour, value: p.cloudCover })),
            stroke: 'var(--gm-text-secondary)',
            strokeWidth: 2,
            fillArea: 'rgba(148, 163, 184, 0.15)'
          }
        ]
      }
    };

    // 7. Condizioni in Atterraggio
    const isLandingSafe = evaluated.glideMetrics ? evaluated.glideMetrics.isSafe : true;
    const reqGlide = evaluated.glideMetrics ? evaluated.glideMetrics.requiredGlideRatio : 6.0;
    const limitGlide = evaluated.glideMetrics ? evaluated.glideMetrics.safeLimit : 7.0;

    let landingStatus = 'flyable';
    let landingStatusLabel = 'Brezza Calma';
    if (!isLandingSafe) {
      landingStatus = 'unflyable';
      landingStatusLabel = 'Rientro Critico';
    } else if (activePoint.landingSpeed <= 16) {
      landingStatus = 'flyable';
      landingStatusLabel = 'Brezza Calma';
    } else if (activePoint.landingSpeed <= 24) {
      landingStatus = 'caution';
      landingStatusLabel = 'Brezza Sostenuta';
    } else {
      landingStatus = 'unflyable';
      landingStatusLabel = 'Vento Forte Valle';
    }

    const landingParam = {
      id: 'atterraggio',
      title: 'Condizioni in Atterraggio',
      subtitle: 'Brezza di valle e rientro in sicurezza nel cono di planata',
      value: `Brezza ${Math.round(activePoint.landingSpeed)} km/h · Efficienza 1:${reqGlide} (${isLandingSafe ? 'Nel Cono' : 'Fuori Cono'})`,
      status: landingStatus,
      statusLabel: landingStatusLabel,
      details: [
        { label: 'Vento al Suolo Atterraggio', value: `${Math.round(activePoint.landingSpeed)} km/h` },
        { label: 'Efficienza Richiesta', value: `1:${reqGlide}` },
        { label: 'Limite Ala con Margine', value: `1:${limitGlide}` },
        { label: 'Dislivello Decollo-Atterraggio', value: `${takeoff.altitude - landing.altitude} m` }
      ],
      advice: landingStatus === 'flyable'
        ? 'Brezza di valle regolare allineata al campo. Cono di planata ampiamente garantito per vele di qualsiasi classe.'
        : landingStatus === 'caution'
        ? 'Brezza sostenuta in fondovalle. Mantenersi sopravento rispetto all\'atterraggio durante la perdita di quota.'
        : !isLandingSafe
        ? 'Efficienza richiesta superiore ai limiti di sicurezza dell\'ala. Rischio concreto di atterraggio fuori campo.'
        : 'Vento in valle troppo forte con rischio di scarrocciamento e rotori orografici.',
      chartOptions: {
        id: 'param-chart-landing',
        title: 'Brezza in Atterraggio',
        unit: 'km/h',
        minY: 0,
        maxY: 35,
        thresholds: [
          { value: 18, stroke: 'var(--gm-status-caution)', label: 'Limite Brezza (18)' }
        ],
        series: [
          {
            name: 'Brezza Valle',
            points: hourlyPoints.map(p => ({ hour: p.hour, value: p.landingSpeed })),
            stroke: 'var(--gm-status-flyable)',
            strokeWidth: 2.2,
            fillArea: 'rgba(34, 197, 94, 0.12)'
          }
        ]
      }
    };

    return {
      params: [windParam, gustParam, lclParam, capeParam, edrParam, cloudParam, landingParam],
      hourlyPoints,
      activePoint,
      takeoff,
      landing
    };
  }

  /**
   * Generates a pure vector SVG hourly trend chart (08:00 - 20:00).
   * Fully responsive, zero layout thrashing, and high contrast for both dark and sunlight modes.
   * 
   * @param {object} options
   * @returns {string} SVG markup
   */
  renderSvgTrendChart({
    id = 'trend-chart',
    title = '',
    unit = '',
    series = [],
    thresholds = [],
    minY = 0,
    maxY = 40,
    selectedHour = this.selectedHour,
    compact = false
  }) {
    const W = 350;
    const H = compact ? 95 : 120;
    const xMin = 36;
    const xMax = 335;
    const yMin = 14;
    const yMax = H - 22;
    const yRange = Math.max(1, maxY - minY);

    const getX = (h) => Math.round(xMin + ((h - 8) / 12) * (xMax - xMin));
    const getY = (val) => Math.round(yMax - ((Math.min(maxY, Math.max(minY, val)) - minY) / yRange) * (yMax - yMin));

    const mid1 = minY + yRange * 0.33;
    const mid2 = minY + yRange * 0.66;

    const renderedSeries = series.map(s => {
      const coords = (s.points || []).map(p => ({ x: getX(p.hour), y: getY(p.value) }));
      let areaMarkup = '';
      if (s.fillArea && coords.length > 0) {
        const areaPath = buildSmoothAreaPath(coords, yMax);
        areaMarkup = `<path d="${areaPath}" fill="${s.fillArea}" />`;
      }
      const linePath = buildSmoothPath(coords);
      return `
        ${areaMarkup}
        <path 
          d="${linePath}" 
          fill="none" 
          stroke="${s.stroke || 'var(--gm-accent)'}" 
          stroke-width="${s.strokeWidth || 2}" 
          stroke-linecap="round"
          stroke-linejoin="round"
          ${s.strokeDasharray ? `stroke-dasharray="${s.strokeDasharray}"` : ''} 
        />
      `;
    }).join('');

    const renderedThresholds = thresholds.map(t => {
      const yPos = getY(t.value);
      return `
        <line x1="${xMin}" y1="${yPos}" x2="${xMax}" y2="${yPos}" stroke="${t.stroke || 'var(--gm-status-caution)'}" stroke-width="1.2" stroke-dasharray="${t.strokeDasharray || '3,3'}" />
        ${t.label ? `<text x="${xMax - 2}" y="${yPos - 3}" font-size="8" fill="${t.stroke || 'var(--gm-text-muted)'}" text-anchor="end">${escapeHtml(t.label)}</text>` : ''}
      `;
    }).join('');

    const activeMarkerX = getX(selectedHour);
    const primarySeries = series[0] || { points: [] };
    const activePoint = (primarySeries.points || []).find(p => p.hour === selectedHour) || primarySeries.points?.[0] || { value: 0 };
    const activeMarkerY = getY(activePoint.value);

    return `
      <div id="${id}-box" class="gm-chart-box">
        <svg class="gm-chart-svg" viewBox="0 0 ${W} ${H}" aria-label="Grafico orario ${escapeHtml(title)}">
          <!-- Background Grid lines -->
          <line x1="${xMin}" y1="${getY(mid1)}" x2="${xMax}" y2="${getY(mid1)}" stroke="var(--gm-border)" stroke-dasharray="2,2" />
          <line x1="${xMin}" y1="${getY(mid2)}" x2="${xMax}" y2="${getY(mid2)}" stroke="var(--gm-border)" stroke-dasharray="2,2" />
          <line x1="${xMin}" y1="${yMax}" x2="${xMax}" y2="${yMax}" stroke="var(--gm-border-strong)" stroke-width="1" />

          <!-- Y Axis Labels -->
          <text x="${xMin - 4}" y="${getY(minY) + 3}" font-size="8" fill="var(--gm-text-muted)" text-anchor="end">${Math.round(minY)}</text>
          <text x="${xMin - 4}" y="${getY(mid2) + 3}" font-size="8" fill="var(--gm-text-muted)" text-anchor="end">${Math.round(mid2)}</text>
          <text x="${xMin - 4}" y="${getY(maxY) + 7}" font-size="8" fill="var(--gm-text-muted)" text-anchor="end">${Math.round(maxY)}</text>

          <!-- Threshold lines -->
          ${renderedThresholds}

          <!-- Series paths -->
          ${renderedSeries}

          <!-- Hourly X Axis Labels -->
          <text x="${getX(8)}" y="${H - 6}" font-size="8" fill="var(--gm-text-muted)" text-anchor="middle">08</text>
          <text x="${getX(11)}" y="${H - 6}" font-size="8" fill="var(--gm-text-muted)" text-anchor="middle">11</text>
          <text x="${getX(14)}" y="${H - 6}" font-size="8" fill="var(--gm-text-muted)" text-anchor="middle">14</text>
          <text x="${getX(17)}" y="${H - 6}" font-size="8" fill="var(--gm-text-muted)" text-anchor="middle">17</text>
          <text x="${getX(20)}" y="${H - 6}" font-size="8" fill="var(--gm-text-muted)" text-anchor="middle">20</text>

          <!-- Active Hour Vertical Marker -->
          <line x1="${activeMarkerX}" y1="${yMin}" x2="${activeMarkerX}" y2="${yMax}" stroke="var(--gm-accent)" stroke-width="1.8" stroke-dasharray="3,3" />
          <circle cx="${activeMarkerX}" cy="${activeMarkerY}" r="4" fill="var(--gm-accent)" stroke="var(--gm-bg-base)" stroke-width="1.8" />
          <rect x="${Math.max(xMin, Math.min(xMax - 54, activeMarkerX - 27))}" y="2" width="54" height="13" rx="3" fill="var(--gm-accent)" />
          <text x="${Math.max(xMin + 27, Math.min(xMax - 27, activeMarkerX))}" y="11" font-size="8" font-weight="700" fill="var(--gm-text-inverse)" text-anchor="middle">
            ${Math.round(activePoint.value)} ${escapeHtml(unit)}
          </text>
        </svg>
      </div>
    `;
  }

  /**
   * Renders the interactive parameter accordion cards with synthetic 4-state indicator scale,
   * analytical details, operational advice, and hourly trend charts.
   * 
   * @param {object} evaluated
   * @param {object} weatherData
   * @param {object} spot
   * @param {object} glider
   * @param {object|null} activeSubSpotObj
   * @returns {string}
   */
  renderParameterCards(evaluated, weatherData, spot, glider, activeSubSpotObj) {
    const { params } = this.computeParamMetrics(evaluated, weatherData, spot, glider, activeSubSpotObj);

    return `
      <div class="gm-parameter-cards-list flex flex-col gap-2">
        ${params.map(param => {
          const isExpanded = this.expandedCardId === param.id;
          let chartHtml = '';
          if (isExpanded) {
            if (param.id === 'vento-decollo') {
              chartHtml = this.renderWindChart(spot, weatherData, param.takeoffHeading);
            } else if (param.id === 'base-cumulo') {
              chartHtml = this.renderSoundingChart(spot, weatherData, param.takeoffAlt);
            } else if (param.chartOptions) {
              chartHtml = this.renderSvgTrendChart(param.chartOptions);
            }
          }

          return `
            <div 
              class="gm-param-card ${isExpanded ? 'expanded' : ''}" 
              id="param-card-${param.id}"
            >
              <button 
                type="button" 
                class="gm-param-header"
                data-action="toggle-param-card"
                data-card-id="${param.id}"
                aria-expanded="${isExpanded ? 'true' : 'false'}"
                aria-controls="param-body-${param.id}"
                id="param-header-${param.id}"
              >
                <div class="gm-param-header-left flex items-center gap-2 min-w-0">
                  <span class="gm-param-status-dot ${param.status}" aria-hidden="true"></span>
                  <div class="gm-param-title-wrap min-w-0">
                    <div class="gm-param-title-row flex items-center gap-2">
                      <span class="gm-param-title font-bold text-sm text-[var(--gm-text-primary)] truncate">${escapeHtml(param.title)}</span>
                      <span class="gm-param-status-badge ${param.status}">${escapeHtml(param.statusLabel)}</span>
                    </div>
                    <div class="gm-param-sub-row text-xs text-[var(--gm-text-secondary)] font-medium truncate mt-0.5">
                      ${escapeHtml(param.value)}
                    </div>
                  </div>
                </div>
                <div class="gm-param-chevron flex-shrink-0 text-[var(--gm-text-muted)] text-sm ml-2 ${isExpanded ? 'rotate-180' : ''}" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
              </button>

              ${isExpanded ? `
                <div 
                  id="param-body-${param.id}" 
                  class="gm-param-body"
                  role="region"
                  aria-labelledby="param-header-${param.id}"
                >
                  <!-- Details Grid -->
                  <div class="gm-param-details-grid">
                    ${param.details.map(d => `
                      <div class="gm-param-detail-cell">
                        <span class="gm-param-detail-label">${escapeHtml(d.label)}</span>
                        <span class="gm-param-detail-value">${escapeHtml(d.value)}</span>
                      </div>
                    `).join('')}
                  </div>

                  <!-- Practical Advice Box -->
                  <div class="gm-param-advice-box mt-2.5">
                    <span class="gm-param-advice-title">Consiglio Pilota:</span>
                    <p class="gm-param-advice-text">${escapeHtml(param.advice)}</p>
                  </div>

                  <!-- Trend Chart -->
                  <div class="gm-param-chart-wrap mt-3">
                    <div class="text-xs font-semibold text-[var(--gm-text-muted)] uppercase tracking-wider mb-1">
                      Tendenza Oraria (08:00 - 20:00)
                    </div>
                    ${chartHtml}
                  </div>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  /**
   * Renders the "Solo Grafici" multi-trend view with synchronized time curves for all parameters.
   * 
   * @param {object} evaluated
   * @param {object} weatherData
   * @param {object} spot
   * @param {object} glider
   * @param {object|null} activeSubSpotObj
   * @returns {string}
   */
  renderMultiTrendCharts(evaluated, weatherData, spot, glider, activeSubSpotObj) {
    const { hourlyPoints, takeoff } = this.computeParamMetrics(evaluated, weatherData, spot, glider, activeSubSpotObj);

    const chartCards = [
      {
        id: 'multi-chart-wind',
        title: 'Vento & Raffiche in Decollo',
        val: `${Math.round(hourlyPoints.find(p => p.hour === this.selectedHour)?.speed || 0)} km/h`,
        chartHtml: this.renderWindChart(spot, weatherData, takeoff.heading)
      },
      {
        id: 'multi-chart-sounding',
        title: 'Base Cumulo (LCL) vs Quota Decollo',
        val: `${Math.round(hourlyPoints.find(p => p.hour === this.selectedHour)?.lclMsl || 0)} m slm`,
        chartHtml: this.renderSoundingChart(spot, weatherData, takeoff.altitude)
      },
      {
        id: 'multi-chart-cape',
        title: 'Instabilità / Temporali (CAPE)',
        val: `${Math.round(hourlyPoints.find(p => p.hour === this.selectedHour)?.cape || 0)} J/kg`,
        chartHtml: this.renderSvgTrendChart({
          id: 'multi-cape',
          title: 'CAPE',
          unit: 'J/kg',
          minY: 0,
          maxY: Math.max(1200, ...hourlyPoints.map(p => p.cape)),
          compact: true,
          thresholds: [
            { value: 300, stroke: 'var(--gm-status-caution)', label: 'Attenzione (300)' },
            { value: 800, stroke: 'var(--gm-status-unflyable)', label: 'Rischio (800)' }
          ],
          series: [{
            name: 'CAPE',
            points: hourlyPoints.map(p => ({ hour: p.hour, value: p.cape })),
            stroke: 'var(--gm-status-caution)',
            fillArea: 'rgba(234, 179, 8, 0.12)'
          }]
        })
      },
      {
        id: 'multi-chart-turbulence',
        title: 'Turbolenza in Termica (EDR) & Salita',
        val: `+${(hourlyPoints.find(p => p.hour === this.selectedHour)?.updraft || 0).toFixed(1)} m/s`,
        chartHtml: this.renderSvgTrendChart({
          id: 'multi-turbulence',
          title: 'Salita',
          unit: 'm/s',
          minY: 0,
          maxY: 5,
          compact: true,
          thresholds: [
            { value: 2.5, stroke: 'var(--gm-status-caution)', label: 'Termiche Vive' }
          ],
          series: [{
            name: 'Updraft',
            points: hourlyPoints.map(p => ({ hour: p.hour, value: p.updraft })),
            stroke: 'var(--gm-status-flyable)',
            fillArea: 'rgba(34, 197, 94, 0.12)'
          }]
        })
      },
      {
        id: 'multi-chart-cloudcover',
        title: 'Copertura Nuvolosa & Insolazione',
        val: `${Math.round(hourlyPoints.find(p => p.hour === this.selectedHour)?.cloudCover || 0)}%`,
        chartHtml: this.renderSvgTrendChart({
          id: 'multi-cloudcover',
          title: 'Copertura',
          unit: '%',
          minY: 0,
          maxY: 100,
          compact: true,
          thresholds: [
            { value: 80, stroke: 'var(--gm-status-caution)', label: 'Nuvoloso (80%)' }
          ],
          series: [{
            name: 'Copertura',
            points: hourlyPoints.map(p => ({ hour: p.hour, value: p.cloudCover })),
            stroke: 'var(--gm-text-secondary)',
            fillArea: 'rgba(148, 163, 184, 0.15)'
          }]
        })
      },
      {
        id: 'multi-chart-landing',
        title: 'Condizioni in Atterraggio (Brezza di Valle)',
        val: `${Math.round(hourlyPoints.find(p => p.hour === this.selectedHour)?.landingSpeed || 0)} km/h`,
        chartHtml: this.renderSvgTrendChart({
          id: 'multi-landing',
          title: 'Brezza',
          unit: 'km/h',
          minY: 0,
          maxY: 35,
          compact: true,
          thresholds: [
            { value: 18, stroke: 'var(--gm-status-caution)', label: 'Limite Brezza (18)' }
          ],
          series: [{
            name: 'Brezza Valle',
            points: hourlyPoints.map(p => ({ hour: p.hour, value: p.landingSpeed })),
            stroke: 'var(--gm-status-flyable)',
            fillArea: 'rgba(34, 197, 94, 0.12)'
          }]
        })
      }
    ];

    return `
      <div class="gm-multi-charts-container">
        ${chartCards.map(c => `
          <div class="gm-trend-card" id="${c.id}">
            <div class="gm-trend-card-header">
              <span class="gm-trend-card-title">${escapeHtml(c.title)}</span>
              <span class="gm-trend-card-val">${escapeHtml(c.val)}</span>
            </div>
            ${c.chartHtml}
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * Renders the Wind & Orientation panel (Dual state: Synthetic vs Chart).
   * @param {object} evalData
   * @param {object} weatherData
   * @param {object} spot
   * @param {object|null} activeSubSpot
   * @returns {string}
   */
  renderWindPanel(evalData, weatherData, spot, activeSubSpot) {
    const isChart = this.windPanelView === 'chart';
    const takeoff = (activeSubSpot && activeSubSpot.spotType === 'takeoff') 
      ? activeSubSpot 
      : (evalData.takeoff || { altitude: 1000, heading: 180 });

    const weather = evalData.weatherSnapshot || {};
    const takeoffAzimuth = takeoff.heading != null ? takeoff.heading : 180;
    const windDir = weather.windDirection ?? weather.windDir ?? 180;
    const windSpeed = weather.windSpeed != null ? Math.round(weather.windSpeed) : 0;
    const windGust = weather.windGust != null ? Math.round(weather.windGust) : windSpeed;

    return `
      <section aria-labelledby="heading-wind-panel" class="gm-wind-section">
        <div class="gm-panel-header">
          <h2 id="heading-wind-panel" class="text-xs font-semibold uppercase tracking-wider text-[var(--gm-text-muted)] px-1">
            Vento & Decollo (Ore ${String(this.selectedHour).padStart(2, '0')}:00)
          </h2>

          <div class="gm-view-toggle">
            <button 
              type="button" 
              class="gm-view-toggle-btn ${!isChart ? 'active' : ''}"
              data-action="set-wind-view"
              data-view="summary"
            >
              Sintetico
            </button>
            <button 
              type="button" 
              class="gm-view-toggle-btn ${isChart ? 'active' : ''}"
              data-action="set-wind-view"
              data-view="chart"
            >
              Grafico
            </button>
          </div>
        </div>

        ${isChart 
          ? this.renderWindChart(spot, weatherData, takeoffAzimuth) 
          : this.renderWindCompass(evalData, takeoffAzimuth, windDir, windSpeed, windGust)}
      </section>
    `;
  }

  /**
   * Renders the 360° Wind Compass (Synthetic state).
   */
  renderWindCompass(evalData, takeoffAzimuth, windDir, windSpeed, windGust) {
    const diffFromFront = Math.abs(calculateAngularDifference(takeoffAzimuth, windDir));
    let alignText = 'In Asse';
    let alignColor = 'var(--gm-status-flyable)';
    let alignBg = 'var(--gm-status-flyable-bg)';

    if (diffFromFront <= 35) {
      alignText = `In Asse col Decollo (${diffFromFront}°)`;
      alignColor = 'var(--gm-status-flyable)';
      alignBg = 'var(--gm-status-flyable-bg)';
    } else if (diffFromFront <= 75) {
      alignText = `Vento Traverso (${diffFromFront}°)`;
      alignColor = 'var(--gm-status-caution)';
      alignBg = 'var(--gm-status-caution-bg)';
    } else {
      alignText = `Sottovento / Fuori Asse (${diffFromFront}°)`;
      alignColor = 'var(--gm-status-unflyable)';
      alignBg = 'var(--gm-status-unflyable-bg)';
    }

    const cx = 100;
    const cy = 100;
    const radius = 75;

    const coneStartAngle = normalizeAngle(takeoffAzimuth - 35);
    const coneEndAngle = normalizeAngle(takeoffAzimuth + 35);
    const conePath = describeSectorArc(cx, cy, radius, coneStartAngle, coneEndAngle);

    const ptN = polarToCartesian(cx, cy, radius - 12, 0);
    const ptE = polarToCartesian(cx, cy, radius - 12, 90);
    const ptS = polarToCartesian(cx, cy, radius - 12, 180);
    const ptW = polarToCartesian(cx, cy, radius - 12, 270);

    return `
      <div id="forecast-wind-card" class="gm-spot-card flex flex-col items-center gap-3">
        <div 
          class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-current"
          style="color: ${alignColor}; background-color: ${alignBg};"
        >
          ${alignText}
        </div>

        <div class="gm-compass-container relative">
          <svg 
            id="forecast-wind-compass"
            class="gm-compass-svg" 
            viewBox="0 0 200 200" 
            width="170" 
            height="170" 
            aria-label="Bussola vento a 360 gradi"
          >
            <circle cx="${cx}" cy="${cy}" r="${radius}" fill="var(--gm-bg-base)" stroke="var(--gm-border-strong)" stroke-width="2" />
            <circle cx="${cx}" cy="${cy}" r="${radius - 20}" fill="none" stroke="var(--gm-border)" stroke-dasharray="3,3" />

            <path d="${conePath}" fill="rgba(34, 197, 94, 0.25)" stroke="var(--gm-status-flyable)" stroke-width="1.5" />

            <text x="${ptN.x}" y="${ptN.y + 4}" font-size="11" font-weight="700" fill="var(--gm-text-muted)" text-anchor="middle">N</text>
            <text x="${ptE.x}" y="${ptE.y + 4}" font-size="11" font-weight="700" fill="var(--gm-text-muted)" text-anchor="middle">E</text>
            <text x="${ptS.x}" y="${ptS.y + 4}" font-size="11" font-weight="700" fill="var(--gm-text-muted)" text-anchor="middle">S</text>
            <text x="${ptW.x}" y="${ptW.y + 4}" font-size="11" font-weight="700" fill="var(--gm-text-muted)" text-anchor="middle">W</text>

            <g transform="rotate(${takeoffAzimuth}, ${cx}, ${cy})">
              <line x1="${cx}" y1="${cy - radius}" x2="${cx}" y2="${cy - radius + 8}" stroke="var(--gm-status-flyable)" stroke-width="3" />
              <polygon points="${cx},${cy - radius - 2} ${cx - 4},${cy - radius + 6} ${cx + 4},${cy - radius + 6}" fill="var(--gm-status-flyable)" />
            </g>

            <g transform="rotate(${windDir}, ${cx}, ${cy})">
              <line x1="${cx}" y1="${cy + 35}" x2="${cx}" y2="${cy - 35}" stroke="${alignColor}" stroke-width="3" stroke-linecap="round" />
              <polygon points="${cx},${cy - 45} ${cx - 6},${cy - 32} ${cx + 6},${cy - 32}" fill="${alignColor}" />
              <circle cx="${cx}" cy="${cy}" r="4" fill="${alignColor}" />
            </g>
          </svg>
        </div>

        <div class="gm-compass-readout">
          <div class="gm-compass-stat">
            <span class="text-xs text-[var(--gm-text-muted)] font-semibold uppercase">Direzione</span>
            <span class="text-sm font-mono font-bold text-[var(--gm-text-primary)]">
              ${getCardinalDirection(windDir)} (${windDir}°)
            </span>
          </div>

          <div class="gm-compass-stat">
            <span class="text-xs text-[var(--gm-text-muted)] font-semibold uppercase">Velocità</span>
            <span class="text-sm font-mono font-bold text-[var(--gm-text-primary)]">
              ${windSpeed} km/h
            </span>
          </div>

          <div class="gm-compass-stat">
            <span class="text-xs text-[var(--gm-text-muted)] font-semibold uppercase">Raffica</span>
            <span class="text-sm font-mono font-bold text-[var(--gm-accent)]">
              ${windGust} km/h
            </span>
          </div>

          <div class="gm-compass-stat">
            <span class="text-xs text-[var(--gm-text-muted)] font-semibold uppercase">Azimut Decollo</span>
            <span class="text-sm font-mono font-bold text-[var(--gm-status-flyable)]">
              ${takeoffAzimuth}° (${getCardinalDirection(takeoffAzimuth)})
            </span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Renders the Expanded SVG Wind & Gusts Temporal Chart with active hour marker.
   */
  renderWindChart(spot, weatherData, takeoffAzimuth) {
    const hours = [];
    const hourlyData = weatherData.hourly || {};
    const times = hourlyData.time || [];

    // Map 13 points from 08:00 to 20:00
    for (let h = 8; h <= 20; h++) {
      const timePrefix = `${this.activeDate}T${String(h).padStart(2, '0')}:`;
      const idx = times.findIndex(t => t.startsWith(timePrefix));
      let speed = 12;
      let gust = 16;
      if (idx !== -1) {
        const rawSpeed = hourlyData.windspeed_10m ?? hourlyData.wind_speed_10m;
        const rawGust = hourlyData.windgusts_10m ?? hourlyData.wind_gusts_10m;
        if (rawSpeed && rawSpeed[idx] != null) speed = Number(rawSpeed[idx]);
        if (rawGust && rawGust[idx] != null) gust = Number(rawGust[idx]);
      }
      hours.push({ hour: h, speed, gust });
    }

    // Chart dimensions: width 350, height 120, plot margins: left 30, right 15, top 15, bottom 25
    const W = 350;
    const H = 120;
    const xMin = 30;
    const xMax = 335;
    const yMin = 15;
    const yMax = 95;
    const maxVal = 40; // Max Y axis 40 km/h

    const getX = (h) => Math.round(xMin + ((h - 8) / 12) * (xMax - xMin));
    const getY = (val) => Math.round(yMax - (Math.min(maxVal, Math.max(0, val)) / maxVal) * (yMax - yMin));

    // Smooth curves for speed & gust
    const speedCoords = hours.map(p => ({ x: getX(p.hour), y: getY(p.speed) }));
    const gustCoords = hours.map(p => ({ x: getX(p.hour), y: getY(p.gust) }));
    const speedPath = buildSmoothPath(speedCoords);
    const gustPath = buildSmoothPath(gustCoords);
    const gustAreaPath = buildSmoothAreaPath(gustCoords, yMax);

    // Active marker coordinates
    const activeMarkerX = getX(this.selectedHour);
    const activeData = hours.find(h => h.hour === this.selectedHour) || hours[0];
    const activeMarkerY = getY(activeData.speed);

    return `
      <div id="forecast-wind-chart-box" class="gm-chart-box">
        <svg class="gm-chart-svg" viewBox="0 0 ${W} ${H}" aria-label="Grafico orario vento e raffiche">
          <!-- Background Grid lines -->
          <line x1="${xMin}" y1="${getY(10)}" x2="${xMax}" y2="${getY(10)}" stroke="var(--gm-border)" stroke-dasharray="2,2" />
          <line x1="${xMin}" y1="${getY(20)}" x2="${xMax}" y2="${getY(20)}" stroke="var(--gm-border)" stroke-dasharray="2,2" />
          <line x1="${xMin}" y1="${getY(30)}" x2="${xMax}" y2="${getY(30)}" stroke="var(--gm-border)" stroke-dasharray="2,2" />
          <line x1="${xMin}" y1="${yMax}" x2="${xMax}" y2="${yMax}" stroke="var(--gm-border-strong)" stroke-width="1" />

          <!-- Y Axis Labels -->
          <text x="${xMin - 4}" y="${getY(10) + 3}" font-size="9" fill="var(--gm-text-muted)" text-anchor="end">10</text>
          <text x="${xMin - 4}" y="${getY(20) + 3}" font-size="9" fill="var(--gm-text-muted)" text-anchor="end">20</text>
          <text x="${xMin - 4}" y="${getY(30) + 3}" font-size="9" fill="var(--gm-text-muted)" text-anchor="end">30</text>

          <!-- EN-A Glider Limit (18 km/h) -->
          <line x1="${xMin}" y1="${getY(18)}" x2="${xMax}" y2="${getY(18)}" stroke="var(--gm-status-caution)" stroke-width="1.2" stroke-dasharray="4,3" />

          <!-- Shaded Gust Area -->
          <path d="${gustAreaPath}" fill="rgba(249, 115, 22, 0.15)" />

          <!-- Gust line -->
          <path d="${gustPath}" fill="none" stroke="var(--gm-status-alert)" stroke-width="1.8" stroke-dasharray="3,3" stroke-linecap="round" stroke-linejoin="round" />

          <!-- Wind speed line -->
          <path d="${speedPath}" fill="none" stroke="var(--gm-status-flyable)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

          <!-- Hourly X Axis Labels -->
          <text x="${getX(8)}" y="${H - 8}" font-size="9" fill="var(--gm-text-muted)" text-anchor="middle">08</text>
          <text x="${getX(11)}" y="${H - 8}" font-size="9" fill="var(--gm-text-muted)" text-anchor="middle">11</text>
          <text x="${getX(14)}" y="${H - 8}" font-size="9" fill="var(--gm-text-muted)" text-anchor="middle">14</text>
          <text x="${getX(17)}" y="${H - 8}" font-size="9" fill="var(--gm-text-muted)" text-anchor="middle">17</text>
          <text x="${getX(20)}" y="${H - 8}" font-size="9" fill="var(--gm-text-muted)" text-anchor="middle">20</text>

          <!-- ACTIVE HOUR VERTICAL MARKER -->
          <line x1="${activeMarkerX}" y1="${yMin}" x2="${activeMarkerX}" y2="${yMax}" stroke="var(--gm-accent)" stroke-width="2" stroke-dasharray="3,3" />
          <circle cx="${activeMarkerX}" cy="${activeMarkerY}" r="4.5" fill="var(--gm-accent)" stroke="var(--gm-bg-base)" stroke-width="2" />
          <rect x="${activeMarkerX - 22}" y="2" width="44" height="14" rx="3" fill="var(--gm-accent)" />
          <text x="${activeMarkerX}" y="12" font-size="9" font-weight="700" fill="var(--gm-text-inverse)" text-anchor="middle">
            ${Math.round(activeData.speed)} km/h
          </text>
        </svg>

        <div class="flex items-center justify-between text-xs px-2 pt-1 border-t border-[var(--gm-border)]">
          <div class="flex items-center gap-3">
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-0.5 bg-[var(--gm-status-flyable)] inline-block"></span> Vento</span>
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-0.5 bg-[var(--gm-status-alert)] border-dashed inline-block"></span> Raffica</span>
          </div>
          <span class="text-xs text-[var(--gm-accent)] font-mono font-bold">
            Ore ${String(this.selectedHour).padStart(2, '0')}:00: ${Math.round(activeData.speed)} km/h (raffica ${Math.round(activeData.gust)} km/h)
          </span>
        </div>
      </div>
    `;
  }

  /**
   * Renders the Sounding & Convective Thermals panel (Dual state: Synthetic vs Chart).
   */
  renderSoundingPanel(evalData, weatherData, spot, activeSubSpot) {
    const isChart = this.soundingPanelView === 'chart';
    const takeoff = (activeSubSpot && activeSubSpot.spotType === 'takeoff')
      ? activeSubSpot
      : (evalData.takeoff || { altitude: 1000 });

    const weather = evalData.weatherSnapshot || {};
    const temp = weather.temperature != null ? weather.temperature : 20;
    const dewPoint = weather.dewPoint != null ? weather.dewPoint : (temp - 6.5);
    const cape = weather.cape != null ? Math.round(weather.cape) : 250;

    let capeStatus = 'Calmo';
    let capeColor = 'text-[var(--gm-status-flyable)]';
    let capeSub = 'Atmosfera stabile';
    if (cape > 800) {
      capeStatus = 'Rischio CB';
      capeColor = 'text-[var(--gm-status-alert)]';
      capeSub = 'Sovrasviluppo';
    } else if (cape >= 400) {
      capeStatus = 'Moderata';
      capeColor = 'text-[var(--gm-text-primary)]';
      capeSub = 'Cumuli attivi';
    }

    const lcl = calculateLCL(temp, dewPoint, takeoff.altitude);
    const lclBaseMsl = lcl ? `${lcl.lclMsl}m` : 'N/D';
    const lclAgl = lcl ? `+${lcl.lclAgl}m AGL` : '';

    const lapseRateVal = -0.72;
    const stabilityClass = classifyAtmosphericStability(0.72);
    const thermalCeiling = lcl ? `${lcl.lclMsl + 250}m` : '2300m';

    return `
      <section aria-labelledby="heading-sounding" class="gm-sounding-section">
        <div class="gm-panel-header">
          <h2 id="heading-sounding" class="text-xs font-semibold uppercase tracking-wider text-[var(--gm-text-muted)] px-1">
            Radiosondaggio & Termica (Ore ${String(this.selectedHour).padStart(2, '0')}:00)
          </h2>

          <div class="gm-view-toggle">
            <button 
              type="button" 
              class="gm-view-toggle-btn ${!isChart ? 'active' : ''}"
              data-action="set-sounding-view"
              data-view="summary"
            >
              Sintetico
            </button>
            <button 
              type="button" 
              class="gm-view-toggle-btn ${isChart ? 'active' : ''}"
              data-action="set-sounding-view"
              data-view="chart"
            >
              Grafico
            </button>
          </div>
        </div>

        ${isChart 
          ? this.renderSoundingChart(spot, weatherData, takeoff.altitude) 
          : `
            <div id="forecast-sounding-card" class="gm-sounding-grid">
              <div class="gm-sounding-tile">
                <span class="gm-sounding-label">Base Cumulo (LCL)</span>
                <span class="gm-sounding-val text-[var(--gm-accent)]">${lclBaseMsl}</span>
                <span class="text-xs text-[var(--gm-text-muted)] font-mono">${lclAgl}</span>
              </div>

              <div class="gm-sounding-tile">
                <span class="gm-sounding-label">Ceiling Termico</span>
                <span class="gm-sounding-val text-[var(--gm-status-flyable)]">${thermalCeiling}</span>
                <span class="text-xs text-[var(--gm-text-muted)] font-mono">Quota max stimata</span>
              </div>

              <div class="gm-sounding-tile">
                <span class="gm-sounding-label">Gradiente Termico</span>
                <span class="gm-sounding-val text-[var(--gm-text-primary)]">${lapseRateVal}°C/100m</span>
                <span class="text-xs text-[var(--gm-status-flyable)] font-semibold">Instabile (Buona)</span>
              </div>

              <div class="gm-sounding-tile">
                <span class="gm-sounding-label">Rischio Temporali</span>
                <span class="gm-sounding-val ${capeColor}">
                  ${capeStatus}
                </span>
                <span class="text-xs text-[var(--gm-text-muted)] font-mono">
                  ${capeSub} • CAPE ${cape} J/kg
                </span>
              </div>
            </div>
          `}
      </section>
    `;
  }

  /**
   * Renders the Expanded SVG Sounding & Thermals Altimetric Chart with active hour marker.
   */
  renderSoundingChart(spot, weatherData, takeoffAlt) {
    const hours = [];
    const hourlyData = weatherData.hourly || {};
    const times = hourlyData.time || [];

    for (let h = 8; h <= 20; h++) {
      const timePrefix = `${this.activeDate}T${String(h).padStart(2, '0')}:`;
      const idx = times.findIndex(t => t.startsWith(timePrefix));
      let temp = 20;
      let dew = 13;
      if (idx !== -1) {
        if (hourlyData.temperature_2m && hourlyData.temperature_2m[idx] != null) temp = Number(hourlyData.temperature_2m[idx]);
        const rawDew = hourlyData.dewpoint_2m ?? hourlyData.dew_point_2m;
        if (rawDew && rawDew[idx] != null) dew = Number(rawDew[idx]);
      }
      const lcl = calculateLCL(temp, dew, takeoffAlt);
      const lclMsl = lcl ? lcl.lclMsl : (takeoffAlt + 800);
      const ceiling = lclMsl + 250;
      hours.push({ hour: h, lclMsl, ceiling });
    }

    const W = 350;
    const H = 120;
    const xMin = 36;
    const xMax = 335;
    const yMin = 15;
    const yMax = 95;
    const maxAlt = 3000; // Max altitude 3000m MSL

    const getX = (h) => Math.round(xMin + ((h - 8) / 12) * (xMax - xMin));
    const getY = (alt) => Math.round(yMax - (Math.min(maxAlt, Math.max(0, alt)) / maxAlt) * (yMax - yMin));

    const lclCoords = hours.map(p => ({ x: getX(p.hour), y: getY(p.lclMsl) }));
    const ceilingCoords = hours.map(p => ({ x: getX(p.hour), y: getY(p.ceiling) }));
    const lclPath = buildSmoothPath(lclCoords);
    const ceilingPath = buildSmoothPath(ceilingCoords);

    const activeMarkerX = getX(this.selectedHour);
    const activeData = hours.find(h => h.hour === this.selectedHour) || hours[0];
    const activeLclY = getY(activeData.lclMsl);

    return `
      <div id="forecast-sounding-chart-box" class="gm-chart-box">
        <svg class="gm-chart-svg" viewBox="0 0 ${W} ${H}" aria-label="Grafico orario radiosondaggi e quote termiche">
          <!-- Background Grid lines -->
          <line x1="${xMin}" y1="${getY(1000)}" x2="${xMax}" y2="${getY(1000)}" stroke="var(--gm-border)" stroke-dasharray="2,2" />
          <line x1="${xMin}" y1="${getY(2000)}" x2="${xMax}" y2="${getY(2000)}" stroke="var(--gm-border)" stroke-dasharray="2,2" />
          <line x1="${xMin}" y1="${yMax}" x2="${xMax}" y2="${yMax}" stroke="var(--gm-border-strong)" stroke-width="1" />

          <!-- Y Axis Labels -->
          <text x="${xMin - 4}" y="${getY(1000) + 3}" font-size="9" fill="var(--gm-text-muted)" text-anchor="end">1000m</text>
          <text x="${xMin - 4}" y="${getY(2000) + 3}" font-size="9" fill="var(--gm-text-muted)" text-anchor="end">2000m</text>

          <!-- Takeoff Elevation Reference Line -->
          <line x1="${xMin}" y1="${getY(takeoffAlt)}" x2="${xMax}" y2="${getY(takeoffAlt)}" stroke="var(--gm-border-strong)" stroke-width="1.2" stroke-dasharray="3,3" />

          <!-- Ceiling line -->
          <path d="${ceilingPath}" fill="none" stroke="var(--gm-status-flyable)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />

          <!-- LCL Base line -->
          <path d="${lclPath}" fill="none" stroke="var(--gm-accent)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />

          <!-- Hourly X Axis Labels -->
          <text x="${getX(8)}" y="${H - 8}" font-size="9" fill="var(--gm-text-muted)" text-anchor="middle">08</text>
          <text x="${getX(11)}" y="${H - 8}" font-size="9" fill="var(--gm-text-muted)" text-anchor="middle">11</text>
          <text x="${getX(14)}" y="${H - 8}" font-size="9" fill="var(--gm-text-muted)" text-anchor="middle">14</text>
          <text x="${getX(17)}" y="${H - 8}" font-size="9" fill="var(--gm-text-muted)" text-anchor="middle">17</text>
          <text x="${getX(20)}" y="${H - 8}" font-size="9" fill="var(--gm-text-muted)" text-anchor="middle">20</text>

          <!-- ACTIVE HOUR VERTICAL MARKER -->
          <line x1="${activeMarkerX}" y1="${yMin}" x2="${activeMarkerX}" y2="${yMax}" stroke="var(--gm-accent)" stroke-width="2" stroke-dasharray="3,3" />
          <circle cx="${activeMarkerX}" cy="${activeLclY}" r="4.5" fill="var(--gm-accent)" stroke="var(--gm-bg-base)" stroke-width="2" />
          <rect x="${activeMarkerX - 28}" y="2" width="56" height="14" rx="3" fill="var(--gm-accent)" />
          <text x="${activeMarkerX}" y="12" font-size="9" font-weight="700" fill="var(--gm-text-inverse)" text-anchor="middle">
            Base: ${Math.round(activeData.lclMsl)}m
          </text>
        </svg>

        <div class="flex items-center justify-between text-xs px-2 pt-1 border-t border-[var(--gm-border)]">
          <div class="flex items-center gap-3">
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-0.5 bg-[var(--gm-accent)] inline-block"></span> Base Nubi (LCL)</span>
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-0.5 bg-[var(--gm-status-flyable)] inline-block"></span> Quota Max</span>
          </div>
          <span class="text-xs text-[var(--gm-accent)] font-mono font-bold">
            Ore ${String(this.selectedHour).padStart(2, '0')}:00: Base ${Math.round(activeData.lclMsl)}m MSL
          </span>
        </div>
      </div>
    `;
  }

  /**
   * Renders the AI Safety Briefing card (Guido Persona).
   */
  renderBriefingCard(briefing, spot) {
    return `
      <section aria-labelledby="heading-briefing" class="gm-briefing-section">
        <h2 id="heading-briefing" class="sr-only">Briefing Sicurezza Guido</h2>

        <article id="forecast-briefing-box" class="gm-briefing-card">
          <div class="gm-briefing-header">
            <div class="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gm-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="22"></line>
              </svg>
              <div>
                <h3 class="gm-briefing-title">Briefing di Volo (Guido)</h3>
                <span class="text-xs text-[var(--gm-text-muted)]">Istruttore FIVL • Analisi di Sicurezza</span>
              </div>
            </div>

            <button 
              type="button" 
              class="gm-btn-briefing-refresh"
              data-action="refresh-briefing"
              aria-label="Rigenera briefing meteorologico"
              title="Aggiorna briefing"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
            </button>
          </div>

          <div class="gm-briefing-content">
            <div class="gm-briefing-block mb-2">
              <span class="text-xs font-bold text-[var(--gm-accent)] uppercase tracking-wider block">Finestra Ottimale:</span>
              <p class="text-sm text-[var(--gm-text-primary)] font-semibold mt-0.5">${escapeHtml(briefing.window)}</p>
            </div>

            <div class="gm-briefing-block mb-2">
              <span class="text-xs font-bold text-[var(--gm-text-muted)] uppercase tracking-wider block">Allerte & Criticità:</span>
              <p class="text-xs text-[var(--gm-text-secondary)] whitespace-pre-line mt-0.5">${escapeHtml(briefing.hazards)}</p>
            </div>

            <div class="gm-briefing-block">
              <span class="text-xs font-bold text-[var(--gm-text-muted)] uppercase tracking-wider block">Livello Pilota Consigliato:</span>
              <p class="text-xs text-[var(--gm-text-secondary)] mt-0.5">${escapeHtml(briefing.pilotLevel)}</p>
            </div>
          </div>
        </article>
      </section>
    `;
  }

  /**
   * Renders the Sticky Bottom Timeline Scrubber (Thumb Zone, 13 slots, zero-scroll).
   * @param {object} spot
   * @param {object} weatherData
   * @param {object} glider
   * @returns {string}
   */
  renderStickyScrubber(spot, weatherData, glider) {
    const now = new Date();
    const todayIso = formatDateIso(now);
    const isToday = this.activeDate === todayIso;
    const currentHour = now.getHours();

    const hours = [];
    for (let h = 8; h <= 20; h++) {
      const evalHour = evaluateComprensorio({
        comprensorio: spot,
        weatherData,
        hourIndex: h,
        glider,
        targetDate: this.activeDate
      });
      hours.push({
        hour: h,
        eval: evalHour,
        isActive: h === this.selectedHour,
        isCurrentHour: isToday && (h === currentHour),
        isPast: isToday && (h < currentHour)
      });
    }

    return `
      <aside 
        id="forecast-timeline-scrubber" 
        class="gm-timeline-scrubber-sticky"
        aria-label="Timeline oraria ancorata"
      >
        <div id="forecast-timeline-strip" class="gm-timeline-grid-13" role="tablist" aria-label="Timeline oraria">
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
                  <div class="compact-bar-fill" style="height: ${fillPct}%; background-color: ${fillColor};"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </aside>
    `;
  }

  /**
   * Checks if a spot is pinned in user favorites, including legacy seed IDs migration.
   * @param {object} spot
   * @param {Set<string>|Array<string>} pinnedIds
   * @returns {boolean}
   */
  isSpotPinned(spot, pinnedIds) {
    return isSpotPinned(spot, pinnedIds);
  }

  /**
   * Evaluates if a comprensorio matches a search query across name, province, region, location and takeoff/landing names.
   * @param {object} spot
   * @param {string} query
   * @returns {boolean}
   */
  matchComprensorioSearch(spot, query) {
    if (!query) return true;
    const q = query.toLowerCase().trim();
    if ((spot.name || '').toLowerCase().includes(q)) return true;
    if ((spot.province || '').toLowerCase().includes(q)) return true;
    if ((spot.region || '').toLowerCase().includes(q)) return true;
    if ((spot.location || '').toLowerCase().includes(q)) return true;
    if (Array.isArray(spot.takeoffs) && spot.takeoffs.some(t => (t.name || '').toLowerCase().includes(q))) return true;
    if (Array.isArray(spot.landings) && spot.landings.some(l => (l.name || '').toLowerCase().includes(q))) return true;
    return false;
  }

  /**
   * Renders the sections HTML for the Comprensorio Picker (Preferiti, Recenti, Altri, o Risultati Ricerca).
   * @param {string} [searchQuery='']
   * @returns {string}
   */
  renderPickerSections(searchQuery = '') {
    const q = (searchQuery || '').toLowerCase().trim();
    const allSpots = this.comprensoriCatalog;
    const state = this.store ? this.store.getState() : {};
    const pinnedIds = new Set(state.pinnedSpotIds || []);
    const recentIds = state.recentSpotIds || [];
    const currentSpot = this.getCurrentSpot();

    const renderItem = (s) => {
      const isPinned = this.isSpotPinned(s, pinnedIds);
      const isActive = s.id === currentSpot.id;
      return `
        <div class="gm-picker-item ${isActive ? 'active' : ''}" data-action="pick-spot" data-spot-id="${escapeHtml(s.id)}">
          <div class="gm-picker-item-main" data-action="pick-spot" data-spot-id="${escapeHtml(s.id)}">
            <div class="text-sm font-bold text-[var(--gm-text-primary)]">${escapeHtml(s.name)} (${escapeHtml(s.province)})</div>
            <div class="text-xs text-[var(--gm-text-muted)]">${escapeHtml(s.region)}</div>
          </div>
          <button 
            type="button" 
            class="gm-star-btn ${isPinned ? 'pinned text-amber-400' : 'text-[var(--gm-text-muted)]'}" 
            data-action="toggle-pin-spot" 
            data-spot-id="${escapeHtml(s.id)}" 
            aria-label="${isPinned ? 'Rimuovi dai' : 'Aggiungi ai'} preferiti"
          >
            ${isPinned ? '★' : '☆'}
          </button>
        </div>
      `;
    };

    if (q) {
      const filtered = allSpots.filter(s => this.matchComprensorioSearch(s, q));
      return `
        <div class="gm-picker-section">
          <span class="gm-picker-section-title">🔍 Risultati Ricerca (${filtered.length})</span>
          <div class="gm-picker-list">
            ${filtered.length > 0 
              ? filtered.map(renderItem).join('') 
              : '<p class="text-xs text-[var(--gm-text-muted)] italic py-2">Nessun comprensorio trovato per "' + escapeHtml(q) + '".</p>'}
          </div>
        </div>
      `;
    }

    const pinnedSpots = allSpots.filter(s => this.isSpotPinned(s, pinnedIds));
    const recentSpots = recentIds
      .map(id => allSpots.find(s => s.id === id))
      .filter(Boolean)
      .filter(s => !this.isSpotPinned(s, pinnedIds));
    const otherSpots = allSpots.filter(s => !this.isSpotPinned(s, pinnedIds) && !recentSpots.some(r => r.id === s.id));

    return `
      ${pinnedSpots.length > 0 ? `
        <div class="gm-picker-section">
          <span class="gm-picker-section-title">⭐ Preferiti (${pinnedSpots.length})</span>
          <div class="gm-picker-list">
            ${pinnedSpots.map(renderItem).join('')}
          </div>
        </div>
      ` : ''}

      ${recentSpots.length > 0 ? `
        <div class="gm-picker-section">
          <span class="gm-picker-section-title">🕒 Recenti (${recentSpots.length})</span>
          <div class="gm-picker-list">
            ${recentSpots.map(renderItem).join('')}
          </div>
        </div>
      ` : ''}

      <div class="gm-picker-section">
        <span class="gm-picker-section-title">
          🗺️ ${(pinnedSpots.length > 0 || recentSpots.length > 0) ? 'Altri Comprensori' : 'Tutti i Comprensori'} (${(pinnedSpots.length > 0 || recentSpots.length > 0) ? otherSpots.length : allSpots.length})
        </span>
        <div class="gm-picker-list">
          ${((pinnedSpots.length > 0 || recentSpots.length > 0) ? otherSpots : allSpots).map(renderItem).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Opens the Comprensorio Picker Sheet with Preferiti, Recenti, and All spots with instant search.
   * @param {string} [initialQuery='']
   */
  openPickerSheet(initialQuery = '') {
    const sheetContent = `
      <div class="gm-picker-sheet flex flex-col gap-3">
        <div class="gm-picker-header">
          <label for="picker-search-input" class="sr-only">Cerca comprensorio</label>
          <input 
            id="picker-search-input" 
            class="gm-input gm-picker-search" 
            type="text" 
            placeholder="Cerca comprensorio, decollo, comune o provincia..." 
            value="${escapeHtml(initialQuery)}"
            autocomplete="off"
          />
        </div>
        <div id="picker-sections-container" class="flex flex-col gap-3">
          ${this.renderPickerSections(initialQuery)}
        </div>
      </div>
    `;

    openSheet({
      id: 'comprensorio-picker',
      title: 'Seleziona Comprensorio',
      content: sheetContent,
      onOpen: () => {
        const input = document.getElementById('picker-search-input');
        if (input) {
          input.addEventListener('input', (e) => {
            const query = e.target.value || '';
            const container = document.getElementById('picker-sections-container');
            if (container) {
              container.innerHTML = this.renderPickerSections(query);
            }
          });
        }
      }
    });
  }

  /**
   * Opens the accessible bottom sheet to select any date within the forecast horizon (up to 14 days).
   */
  openDatePickerSheet() {
    const today = new Date();
    const minDate = formatDateIso(today);
    const maxDate = formatDateIso(new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000));
    const spot = this.getCurrentSpot();
    const flySummaries = this.getMultiDayFlyability(spot, 14);
    const availableDates = getAvailableCalendarDates(today, 14, flySummaries);

    const renderContent = () => `
      <div class="gm-date-picker-sheet flex flex-col gap-4">
        <!-- 14-Day Fast Tap Grid (Hero Primary Action) -->
        <div class="gm-date-sheet-section">
          <span class="text-xs font-bold uppercase tracking-wider text-[var(--gm-text-muted)] block mb-2">
            Calendario Previsioni (Prossimi 14 Giorni)
          </span>
          <div class="gm-date-grid">
            ${availableDates.map(d => {
              const isSelected = d.isoDate === this.activeDate;
              return `
                <button 
                  type="button" 
                  class="gm-date-grid-item ${isSelected ? 'active' : ''} ${d.isWeekend ? 'weekend' : ''} fly-${d.flyability.status}"
                  data-action="pick-calendar-date"
                  data-date="${d.isoDate}"
                  aria-selected="${isSelected ? 'true' : 'false'}"
                  title="${d.dayName} ${d.formatted} (${d.horizon.label}) - ${d.flyability.label}: ${d.flyability.limitingFactor || ''}"
                >
                  <span class="grid-day-name">${escapeHtml(d.dayName)}</span>
                  <span class="grid-day-number">${d.dayNumber}</span>
                  <span class="grid-month">${escapeHtml(d.formatted.split(' ')[1])}</span>

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
            <span class="flex items-center gap-1"><span class="text-[#f87171]">⚡</span> Severo</span>
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
              value="${this.activeDate}" 
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
      id: 'date-picker-sheet',
      title: 'Seleziona Data di Volo',
      content: renderContent(),
      onOpen: () => {
        if (typeof document !== 'undefined') {
          const input = document.getElementById('custom-date-native-input');
          if (input) {
            input.addEventListener('change', (e) => {
              const val = e.target.value;
              if (val) {
                this.activeDate = val;
                if (this.store) {
                  this.store.setState({ activeDate: val });
                }
                closeSheet();
                this.render();
              }
            });
          }
        }
      }
    });
  }

  /**
   * Smoothly updates active hour and synchronizes UI components in-place under Doherty threshold (<50ms).
   * @param {number} hour
   */
  setHour(hour) {
    if (hour < 8 || hour > 20) return;
    this.selectedHour = hour;

    if (!this.containerEl) {
      this.render();
      return;
    }

    const spotCardContainer = this.containerEl.querySelector('#forecast-spot-card-container');
    const metricsContainer = this.containerEl.querySelector('#forecast-spot-metrics-container');
    const paramsContainer = this.containerEl.querySelector('#forecast-params-container');
    const windContainer = this.containerEl.querySelector('#forecast-wind-panel-container');
    const soundingContainer = this.containerEl.querySelector('#forecast-sounding-panel-container');

    // If both spot card container and metrics container are missing from DOM, fallback to full render
    if (!spotCardContainer && !metricsContainer) {
      this.render();
      return;
    }

    const spot = this.getCurrentSpot();
    const glider = this.getActiveGlider();
    const weatherData = this.getWeatherData(spot, this.activeDate);
    const evaluated = evaluateComprensorio({
      comprensorio: spot,
      weatherData,
      hourIndex: this.selectedHour,
      glider,
      targetDate: this.activeDate
    });
    const activeSubSpotObj = this.resolveActiveSubSpot(spot);

    // 1. Update Active Slot in timeline strip in place (zero layout thrashing)
    const strip = this.containerEl.querySelector('#forecast-timeline-strip');
    if (strip) {
      const cols = strip.querySelectorAll('.gm-timeline-col-compact');
      cols.forEach(col => {
        const colHour = parseInt(col.getAttribute('data-hour'), 10);
        const isActive = colHour === this.selectedHour;
        col.classList.toggle('active', isActive);
        col.setAttribute('aria-selected', isActive ? 'true' : 'false');
        col.setAttribute('tabindex', isActive ? '0' : '-1');
      });
    }

    // 2. Update Spot Card metrics container (safeguarding the mini-map from DOM destruction)
    if (metricsContainer) {
      metricsContainer.innerHTML = this.selectedSubSpot === 'overview'
        ? this.renderSummaryMetrics(evaluated)
        : this.renderSpecificSpotMetrics(activeSubSpotObj, evaluated);
    } else if (spotCardContainer) {
      spotCardContainer.innerHTML = this.selectedSubSpot === 'overview'
        ? this.renderSummaryCard(evaluated)
        : this.renderSpecificSpotCard(activeSubSpotObj, evaluated);
    }

    // 2b. Reactively update Windsock Marker and Glide Line in mini-map without touching DOM
    if (this.miniMapEngine) {
      const currentTakeoff = activeSubSpotObj?.spotType === 'takeoff' ? activeSubSpotObj : evaluated.takeoff;
      this.miniMapEngine.updateWindsockMarker(evaluated.weatherSnapshot, this.selectedSubSpot === 'landing', currentTakeoff);
      this.miniMapEngine.updateGlideLine(evaluated.glideMetrics);
    }

    // 3. Update Parameters or Multi-Trend container in place
    if (paramsContainer) {
      paramsContainer.innerHTML = this.forecastMode === 'charts'
        ? this.renderMultiTrendCharts(evaluated, weatherData, spot, glider, activeSubSpotObj)
        : this.renderParameterCards(evaluated, weatherData, spot, glider, activeSubSpotObj);
    }

    // 4. Update Wind Panel container (if present in DOM)
    if (windContainer) {
      windContainer.innerHTML = this.renderWindPanel(evaluated, weatherData, spot, activeSubSpotObj);
    }

    // 5. Update Sounding Panel container (if present in DOM)
    if (soundingContainer) {
      soundingContainer.innerHTML = this.renderSoundingPanel(evaluated, weatherData, spot, activeSubSpotObj);
    }
  }

  /**
   * Handles pointerdown on scrubber timeline to start continuous slide selection.
   * @param {PointerEvent} evt
   */
  handlePointerDown(evt) {
    const strip = this.containerEl ? this.containerEl.querySelector('#forecast-timeline-strip') : null;
    if (!strip) return;
    if (!strip.contains(evt.target) && evt.target !== strip) return;

    this.isScrubbing = true;
    this.pointerStartX = evt.clientX != null ? evt.clientX : 0;
    this.hasDraggedPointer = false;

    // Immediately blur active element to prevent sticky focus/hover styling on initial touched slot
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

    this.updateHourFromPointer(evt, strip);
  }

  /**
   * Handles pointermove on scrubber timeline during active slide.
   * @param {PointerEvent} evt
   */
  handlePointerMove(evt) {
    if (!this.isScrubbing) return;
    const strip = this.containerEl ? this.containerEl.querySelector('#forecast-timeline-strip') : null;
    if (!strip) return;

    if (evt.clientX != null && Math.abs(evt.clientX - this.pointerStartX) > 4) {
      this.hasDraggedPointer = true;
    }

    this.updateHourFromPointer(evt, strip);
  }

  /**
   * Handles pointerup/cancel to release scrubber pointer capture.
   * @param {PointerEvent} evt
   */
  handlePointerUp(evt) {
    if (!this.isScrubbing) return;
    this.isScrubbing = false;
    const strip = this.containerEl ? this.containerEl.querySelector('#forecast-timeline-strip') : null;
    if (strip) {
      try {
        if (typeof strip.releasePointerCapture === 'function' && evt.pointerId != null) {
          strip.releasePointerCapture(evt.pointerId);
        }
      } catch (_) {}
      // Clear lingering focus on the initial touch element
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
   * @param {PointerEvent} evt
   * @param {HTMLElement} strip
   */
  updateHourFromPointer(evt, strip) {
    if (!strip) return;
    const rect = typeof strip.getBoundingClientRect === 'function' ? strip.getBoundingClientRect() : null;

    if (rect && rect.width > 0) {
      const clientX = evt.clientX != null ? evt.clientX : 0;
      const relX = Math.max(0, Math.min(rect.width - 1, clientX - rect.left));
      const fraction = relX / rect.width;
      const hourIndex = Math.min(12, Math.max(0, Math.floor(fraction * 13)));
      const targetHour = 8 + hourIndex;
      if (targetHour !== this.selectedHour) {
        this.setHour(targetHour);
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          try { navigator.vibrate(8); } catch (_) {}
        }
      }
    } else {
      // Mock environment fallback without layout engine
      const target = evt.target;
      const col = target && typeof target.closest === 'function' ? target.closest('[data-hour]') : null;
      if (col) {
        const hour = parseInt(col.getAttribute('data-hour'), 10);
        if (!isNaN(hour) && hour >= 8 && hour <= 20 && hour !== this.selectedHour) {
          this.setHour(hour);
        }
      }
    }
  }

  /**
   * Global click event dispatcher for ForecastView and Picker Sheet.
   * @param {Event} evt
   */
  handleClick(evt) {
    const actionEl = evt.target && typeof evt.target.closest === 'function'
      ? evt.target.closest('[data-action]')
      : null;

    // Auto-close subspot popover if click is outside
    if (this.isSubSpotMenuOpen) {
      const isInsideSubSpot = actionEl && (
        actionEl.getAttribute('data-action') === 'toggle-subspot-menu' ||
        actionEl.getAttribute('data-action') === 'select-subspot'
      );
      if (!isInsideSubSpot) {
        this.isSubSpotMenuOpen = false;
        this.render();
      }
    }

    if (!actionEl) return;

    const action = actionEl.getAttribute('data-action');

    if (action === 'toggle-subspot-menu') {
      this.isSubSpotMenuOpen = !this.isSubSpotMenuOpen;
      this.render();
    } else if (action === 'select-subspot') {
      const subSpotId = actionEl.getAttribute('data-subspot-id');
      this.selectedSubSpot = subSpotId || 'overview';
      this.isSubSpotMenuOpen = false;
      this.render();
    } else if (action === 'select-hour') {
      if (this.hasDraggedPointer) {
        return;
      }
      const hourAttr = actionEl.getAttribute('data-hour');
      if (hourAttr != null) {
        const hour = parseInt(hourAttr, 10);
        if (!isNaN(hour) && hour >= 8 && hour <= 20) {
          this.setHour(hour);
        }
      }
    } else if (action === 'prev-hour') {
      if (this.selectedHour > 8) {
        this.setHour(this.selectedHour - 1);
      }
    } else if (action === 'next-hour') {
      if (this.selectedHour < 20) {
        this.setHour(this.selectedHour + 1);
      }
    } else if (action === 'open-full-map') {
      const spot = this.getCurrentSpot();
      if (this.store && spot) {
        this.store.setState({ selectedSpot: spot });
      }
      if (typeof window !== 'undefined' && window.location) {
        window.location.hash = `#map?spot=${encodeURIComponent(spot?.id || '')}`;
      }
    } else if (action === 'set-forecast-mode') {
      const mode = actionEl.getAttribute('data-mode');
      if (mode === 'cards' || mode === 'charts') {
        this.forecastMode = mode;
        this.render();
      }
    } else if (action === 'toggle-param-card') {
      const cardId = actionEl.getAttribute('data-card-id');
      if (cardId) {
        this.expandedCardId = this.expandedCardId === cardId ? null : cardId;
        this.render();
      }
    } else if (action === 'select-date') {
      const dateAttr = actionEl.getAttribute('data-date');
      if (dateAttr) {
        this.activeDate = dateAttr;
        this.selectedHour = this._resolveInitialHour(this.activeDate);
        if (this.store) {
          this.store.setState({ activeDate: dateAttr });
        }
        this.render();
        this.fetchWeatherDataAsync(this.getCurrentSpot(), this.activeDate);
      }
    } else if (action === 'open-date-picker-sheet') {
      this.openDatePickerSheet();
    } else if (action === 'apply-custom-date') {
      const input = document.getElementById('custom-date-native-input');
      if (input && input.value) {
        this.activeDate = input.value;
        this.selectedHour = this._resolveInitialHour(this.activeDate);
        if (this.store) {
          this.store.setState({ activeDate: input.value });
        }
        closeSheet();
        this.render();
        this.fetchWeatherDataAsync(this.getCurrentSpot(), this.activeDate);
      }
    } else if (action === 'pick-calendar-date') {
      const dateAttr = actionEl.getAttribute('data-date');
      if (dateAttr) {
        this.activeDate = dateAttr;
        this.selectedHour = this._resolveInitialHour(this.activeDate);
        if (this.store) {
          this.store.setState({ activeDate: dateAttr });
        }
        closeSheet();
        this.render();
        this.fetchWeatherDataAsync(this.getCurrentSpot(), this.activeDate);
      }
    } else if (action === 'back-to-home') {
      if (this.router) {
        if (typeof this.router.navigate === 'function') {
          this.router.navigate('home');
        } else if (typeof this.router.navigateTo === 'function') {
          this.router.navigateTo('home');
        }
      }
    } else if (action === 'scroll-to-top') {
      if (this.scrollContainerEl && typeof this.scrollContainerEl.scrollTo === 'function') {
        this.scrollContainerEl.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (this.scrollContainerEl) {
        this.scrollContainerEl.scrollTop = 0;
      }
    } else if (action === 'open-picker-sheet') {
      this.openPickerSheet();
    } else if (action === 'set-wind-view') {
      const view = actionEl.getAttribute('data-view');
      if (view === 'summary' || view === 'chart') {
        this.windPanelView = view;
        this.render();
      }
    } else if (action === 'set-sounding-view') {
      const view = actionEl.getAttribute('data-view');
      if (view === 'summary' || view === 'chart') {
        this.soundingPanelView = view;
        this.render();
      }
    } else if (action === 'refresh-briefing') {
      this.render();
    } else if (action === 'pick-spot') {
      const spotId = actionEl.getAttribute('data-spot-id');
      const spot = this.comprensoriCatalog.find(c => 
        c.id === spotId || 
        (spotId && c.name && slugifyComprensorio(c.name) === spotId)
      );
      if (spot) {
        this.selectedSubSpot = 'overview';
        this.expandedCardId = null;
        if (this.store) {
          const state = this.store.getState();
          const recent = [spot.id, ...(state.recentSpotIds || []).filter(id => id !== spot.id)].slice(0, 5);
          this.store.setState({ selectedSpot: spot, recentSpotIds: recent });
        }
        closeSheet();
        this.render();
        this.fetchWeatherDataAsync(spot, this.activeDate);
      }
    } else if (action === 'toggle-pin-spot') {
      const spotId = actionEl.getAttribute('data-spot-id');
      if (this.store && spotId) {
        const state = this.store.getState();
        const pinned = new Set(state.pinnedSpotIds || []);
        
        const spot = this.comprensoriCatalog.find(c => c.id === spotId);
        const isPinned = this.isSpotPinned(spot || { id: spotId }, pinned);

        if (isPinned) {
          pinned.delete(spotId);
          if (spot) {
            const nameLower = (spot.name || '').toLowerCase();
            const idLower = (spot.id || '').toLowerCase();
            for (const pid of Array.from(pinned)) {
              const p = pid.toLowerCase();
              if (
                p === idLower ||
                (idLower.includes('chialamberto') && p.includes('chialamberto')) ||
                (idLower.includes('martiniana') && p.includes('martiniana')) ||
                (idLower.includes('cavallaria') && p.includes('cavallaria')) ||
                (idLower.includes('cornizzolo') && p.includes('cornizzolo')) ||
                (idLower.includes('grappa') && p.includes('grappa')) ||
                (idLower.includes('meduno') && p.includes('meduno')) ||
                (idLower.includes('calascio') && p.includes('calascio'))
              ) {
                pinned.delete(pid);
              }
            }
          }
        } else {
          pinned.add(spotId);
        }

        this.store.setState({ pinnedSpotIds: Array.from(pinned) });

        const searchInput = document.getElementById('picker-search-input');
        const currentQuery = searchInput ? searchInput.value : '';
        const container = document.getElementById('picker-sections-container');
        if (container) {
          container.innerHTML = this.renderPickerSections(currentQuery);
        } else {
          this.openPickerSheet(currentQuery);
        }
      }
    }
  }

  /**
   * Change event handler (e.g. subspot select dropdown).
   * @param {Event} evt
   */
  handleChange(evt) {
    const target = evt.target;
    if (!target) return;
    if (target.id === 'forecast-spot-select') {
      const spot = this.comprensoriCatalog.find(c => c.id === target.value);
      if (spot) {
        this.store.setState({ selectedSpot: spot });
      }
      this.selectedSubSpot = 'overview';
      this.expandedCardId = null;
      this.render();
    } else if (target.id === 'forecast-subspot-select') {
      this.selectedSubSpot = target.value;
      this.render();
    } else if (target.id === 'forecast-minimap-layer-select') {
      const newLayer = target.value;
      const miniMapContainer = this.container?.querySelector?.('#forecast-mini-map-container');
      if (miniMapContainer) {
        miniMapContainer.setAttribute('data-map-layer', newLayer);
      }
      if (this.miniMapEngine && typeof this.miniMapEngine.setLayer === 'function') {
        this.miniMapEngine.setLayer(newLayer);
      }
      if (this.store && typeof this.store.setState === 'function') {
        const state = this.store.getState() || {};
        const ui = state.ui || {};
        this.store.setState({ ui: { ...ui, mapLayer: newLayer } });
      }
    }
  }
}

// Default singleton instance
export const forecastView = new ForecastViewController();
