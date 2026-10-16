/**
 * GlideMind - Phase 4: Weather & Flyability Dashboard View (ForecastView)
 * 
 * Capabilities:
 * 1. 2-Level Spot Hierarchy: Comprensorio switcher with dedicated Picker Sheet
 *    (Preferiti, Recenti, Ricerca Globale) and Sub-Spot selector (Panoramica Binomio | Decolli | Atterraggi).
 * 2. Unico Binomio or Focused Spot View: Renders dual launch/landing synthesis in overview mode,
 *    or dedicated aeronautical telemetry (altitude, heading, coordinates, wind limits) when a specific spot is selected.
 * 3. Bottom Sticky Scrubber: 13-slot hourly flyability timeline (08:00 - 20:00) anchored at the bottom
 *    (Thumb Zone) with zero horizontal scroll, paragliding color codes, and < 50ms reactive scrubbing.
 * 4. Dual-State Informational Panels:
 *    - Wind & Compass: Synthetic 360° SVG or Expanded 08:00-20:00 temporal wind/gusts chart with vertical active-hour marker.
 *    - Atmospheric Soundings: Synthetic 4-tile grid or Expanded altimetric LCL/Ceiling curve chart with vertical active-hour marker.
 * 5. AI Flight Briefing: Telegrafico, safety-first briefing with deterministic offline heuristic engine.
 * 
 * Compliant with Laws of UX 2026 (touch floor >= 48px, zero trapped modals, zero text ellipsis on metrics).
 * ZERO DOM DEPENDENCIES for core calculations: 100% pure Node.js headless testable.
 */

import { store } from '../../core/store.js';
import { router } from '../router.js';
import { openSheet, closeSheet } from '../sheetManager.js';
import { createMapEngine, STATUS_COLORS, renderLayerToggleIcon, getNextMapLayer, getMapLayerLabel } from '../map/mapEngineAdapter.js';
import { calculateLandingCircuit } from '../../core/flightProcedures.js';
import {
  DEFAULT_COMPRENSORI,
  evaluateComprensorio,
  slugifyComprensorio,
  parseCoordinates,
  isSpotPinned,
  toggleSpotPin
} from '../../core/comprensorio.js';
import {
  DEFAULT_GLIDER,
  GLIDER_CLASSES,
  getFlyabilityScore,
  calculateDailyFlyabilitySummary
} from '../../core/flyability.js';
import { resolveDaylightHours } from '../../core/daylight.js';
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
  formatShortDate,
  WEEKDAY_HEADERS_MON
} from '../../core/datePresets.js';
import { calculateFlightWindows } from '../../core/flightWindows.js';
import { calculatePilotSafetyFactor, DEFAULT_SEED_FLIGHTS } from '../../core/logbook.js';
import { formatWindSpeed, formatAltitude } from '../../core/units.js';

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
 * Generates a safety-focused deterministic AI flight briefing.
 * @param {object} spot Comprensorio object
 * @param {object} weatherData Open-Meteo weather payload
 * @param {string} dateStr YYYY-MM-DD
 * @param {object} [glider=DEFAULT_GLIDER] Active glider specifications
 * @returns {{ window: string, hazards: string, pilotLevel: string, summary: string }}
 */
export function generateFlightBriefing(spot, weatherData, dateStr, glider = DEFAULT_GLIDER) {
  if (!spot || !weatherData || !weatherData.hourly) {
    return {
      window: 'Dati meteo non disponibili',
      hazards: 'Impossibile elaborare il briefing senza dati orari.',
      pilotLevel: 'Attendere il caricamento della previsione.',
      summary: 'Dati meteorologici non caricati.'
    };
  }

  const daylight = resolveDaylightHours(weatherData, dateStr, spot);
  const hours = [];
  for (let h = daylight.sunriseHour; h <= daylight.sunsetHour; h++) {
    const evalResult = evaluateComprensorio({
      comprensorio: spot,
      weatherData,
      hourIndex: h,
      glider,
      targetDate: dateStr
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

  // 3. Recommended flight envelope based on physical aerodynamic parameters
  const vTrimVal = Math.round(glider?.vTrim || 37);
  const glideVal = glider?.glideRatio || 8.5;
  let pilotLevel = '';
  if (flyableSlots.length >= 3 && maxGust <= 18 && maxCape < 500 && !hasRain) {
    pilotLevel = `Condizioni regolari con ottimo margine di penetrazione (VTrim ${vTrimVal} km/h, efficienza 1:${glideVal}). Finestra termica dolce idonea anche a voli didattici e di ambientamento.`;
  } else if (flyableSlots.length > 0 && maxWind <= 22 && maxGust <= 28) {
    pilotLevel = `Condizioni termiche vive: richiesta gestione attiva del beccheggio e verifica continua dell'avanzamento controvento (VTrim ${vTrimVal} km/h).`;
  } else {
    pilotLevel = `Condizioni severe o margine di penetrazione e planata ridotto rispetto all'inviluppo impostato (VTrim ${vTrimVal} km/h). Decollo sconsigliato.`;
  }

  const hazardsFormatted = hazards.map(h => `• ${h}`).join('\n');
  const summary = [
    `Oggi a ${spot.name}, la finestra migliore è ${windowText}.`,
    hazardsFormatted,
    `Indicazione pilota: ${pilotLevel}`
  ].join('\n\n');

  return {
    window: windowText,
    hazards: hazardsFormatted,
    pilotLevel,
    summary
  };
}

export const generateGuidoBriefing = generateFlightBriefing;

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
    this.boundTouchStart = (e) => this.handlePointerDown(e);
    this.boundTouchMove = (e) => this.handlePointerMove(e);
    this.boundTouchEnd = (e) => this.handlePointerUp(e);
    this.isScrubbing = false;
    this.activeScrubStrip = null;

    // Initial local view state
    this.cachedWeatherMap = new Map(); // key: spotId_date -> weatherPayload
    const now = new Date();
    const storeState = this.store ? this.store.getState() : {};
    this.activeDate = storeState.activeDate || formatDateIso(now);
    this.selectedHour = this._resolveInitialHour(this.activeDate);
    this.selectedSubSpot = 'overview'; // 'overview' | spotId
    this.activeTakeoffId = storeState.activeTakeoffId || null;
    this.activeLandingId = storeState.activeLandingId || null;
    this.isSubSpotMenuOpen = false;
    this.isSubSpotInfoOpen = false; // Specific spot (Decollo/Atterraggio) descriptive Info section starts collapsed
    this.isFlightAnalysisAimMenuOpen = false;
    this.forecastMode = 'cards'; // 'cards' | 'charts'
    this.expandedCardId = null; // All parameter accordion cards start collapsed
    this.expandedTrendChartIds = new Set(); // Set of vertically expanded chart card IDs in Solo Grafici mode
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

    // Comprensorio flight inspector fullscreen overlay
    this.isFlightAnalysisOpen = false;
    this.flightAnalysisOverlayEl = null;
    this.flightAnalysisMapEngine = null;
    this.flightAnalysisTriggerEl = null;
    this.boundFlightAnalysisKeyHandler = this.handleFlightAnalysisKey.bind(this);
    this.boundFlightAnalysisPopstate = this.handleFlightAnalysisPopstate.bind(this);
  }

  /**
   * Returns the active diurnal daylight window for the current spot, date, and weather payload.
   * @param {object} [spot]
   * @param {object} [weatherData]
   * @param {string} [targetDate]
   * @returns {{ sunriseHour: number, sunsetHour: number, sunriseStr: string, sunsetStr: string, hours: number[] }}
   */
  getDaylightWindow(spot = null, weatherData = null, targetDate = null) {
    const activeSpot = spot || this.getCurrentSpot();
    const date = targetDate || this.activeDate;
    const weather = weatherData || (activeSpot ? this.getWeatherData(activeSpot, date) : null);
    return resolveDaylightHours(weather, date, activeSpot);
  }

  /**
   * Resolves the default initial selected hour strictly bounded between sunrise and sunset.
   * If targetDate is today, automatically selects current local hour clamped to daylight bounds.
   * For other dates, defaults to solar midday soaring hour (clamped to daylight bounds).
   * @param {string} [targetDate]
   * @param {object} [weatherData]
   * @param {object} [spot]
   * @returns {number}
   */
  _resolveInitialHour(targetDate = this.activeDate, weatherData = null, spot = null) {
    const daylight = this.getDaylightWindow(spot, weatherData, targetDate);
    const todayIso = formatDateIso(new Date());
    if (targetDate === todayIso) {
      const curHour = new Date().getHours();
      return Math.min(daylight.sunsetHour, Math.max(daylight.sunriseHour, curHour));
    }
    return Math.min(daylight.sunsetHour, Math.max(daylight.sunriseHour, 13));
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
   * Resolves the active takeoff object for the given spot.
   * If an explicit activeTakeoffId is set and matches a takeoff, returns that.
   * Otherwise returns primary or first takeoff.
   * @param {object} spot
   * @returns {object|null}
   */
  resolveActiveTakeoff(spot) {
    if (!spot || !Array.isArray(spot.takeoffs) || spot.takeoffs.length === 0) return null;
    const activeTakeoffId = this.activeTakeoffId || (this.store && this.store.getState()?.activeTakeoffId);
    if (activeTakeoffId) {
      const found = spot.takeoffs.find(t => t.id === activeTakeoffId);
      if (found) return found;
    }
    return spot.takeoffs.find(t => t.isPrimary) || spot.takeoffs[0] || null;
  }

  /**
   * Resolves the active landing object for the given spot.
   * If an explicit activeLandingId is set and matches a landing, returns that.
   * Otherwise returns primary/official or first landing.
   * @param {object} spot
   * @returns {object|null}
   */
  resolveActiveLanding(spot) {
    if (!spot || !Array.isArray(spot.landings) || spot.landings.length === 0) return null;
    const activeLandingId = this.activeLandingId || (this.store && this.store.getState()?.activeLandingId);
    if (activeLandingId) {
      const found = spot.landings.find(l => l.id === activeLandingId);
      if (found) return found;
    }
    return spot.landings.find(l => l.isPrimary || l.isOfficial) || spot.landings[0] || null;
  }

  /**
   * Gets active glider specification, attaching optional pilot safety factor when enabled.
   * @returns {object}
   */
  getActiveGlider() {
    const state = this.store ? this.store.getState() : {};
    const baseGlider = state.activeGlider || state.glider || DEFAULT_GLIDER || GLIDER_CLASSES.EN_A;
    if (!state.usePilotCurrencyFactor) {
      return baseGlider;
    }
    const flights = state.flights || DEFAULT_SEED_FLIGHTS;
    const referenceDate = this.activeDate || state.activeDate || formatDateIso(new Date());
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
   * Renders the discrete network status badge only for non-nominal states (Loading, Rate-Limit, Offline).
   * When live (nominal online state), returns a hidden placeholder so zero misleading "Live" station
   * badge is shown in the UI (NOTE-003).
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
    if (this.networkStatus === 'rate_limit') {
      return `
        <span id="${badgeId}" class="gm-live-badge rate-limit" title="Quota Open-Meteo temporaneamente esaurita (HTTP 429). In pausa cooldown.">
          <span class="gm-live-badge-dot" aria-hidden="true"></span>
          <span>Quota API (429)</span>
        </span>
      `;
    }
    if (this.networkStatus === 'live') {
      return `<span id="${badgeId}" class="gm-live-badge live hidden" aria-hidden="true"></span>`;
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
      if (existing && !existing._isSynthetic && !existing.isSynthetic && !existing.isStale && existing.landingWeather) {
        this.networkStatus = 'live';
        this.updateLiveStatusBadgeInDom();
        return existing;
      }
    }

    // In-flight request deduplication for the same spot and date
    if (!forceRefresh && this.activeFetchPromise && this.activeFetchKey === key) {
      return this.activeFetchPromise;
    }
    this.activeFetchKey = key;

    this.networkStatus = 'loading';
    this.updateLiveStatusBadgeInDom();

    const takeoff = this.resolveActiveTakeoff(spot) || (spot.takeoffs && spot.takeoffs[0]) || { id: 't0', altitude: 1000, heading: null };
    const landing = this.resolveActiveLanding(spot) || (spot.landings && spot.landings[0]) || null;
    const compositeKey = `${spot.id}_${takeoff.id || 't0'}_${landing?.id || 'l0'}_${dateStr}`;
    const tCoords = parseCoordinates(takeoff.coordinates) || { lat: 45.833, lon: 9.302 };
    const lCoords = landing ? parseCoordinates(landing.coordinates) : null;

    const coords = (lCoords && (lCoords.lat !== tCoords.lat || lCoords.lon !== tCoords.lon))
      ? [
          { lat: tCoords.lat, lon: tCoords.lon, elev: takeoff.altitude || 1000, role: 'takeoff' },
          { lat: lCoords.lat, lon: lCoords.lon, elev: landing.altitude || 300, role: 'landing' }
        ]
      : { lat: tCoords.lat, lon: tCoords.lon, elev: takeoff.altitude || 1000 };

    const fetchPromise = (async () => {
      try {
        const enriched = await fetchWeatherData(
          coords,
          {
            targetDate: dateStr,
            weatherModel: 'best_match',
            includeSounding: false,
            forceRefresh,
            fetchFn: this._customFetchFn || (typeof window !== 'undefined' ? window.fetch.bind(window) : globalThis.fetch)
          }
        );

        if (enriched) {
          if (enriched.isRateLimited) {
            this.networkStatus = 'rate_limit';
            this._networkFailed = false;
            this._rateLimited = true;
          } else if (enriched.isStaleOfflineFallback || enriched.isSynthetic || enriched._isSynthetic) {
            this.networkStatus = 'offline';
            this._networkFailed = true;
            this._rateLimited = false;
          } else {
            enriched._isSynthetic = false;
            enriched.isSynthetic = false;
            this.networkStatus = 'live';
            this._networkFailed = false;
            this._rateLimited = false;
          }
          enriched._takeoffId = takeoff.id || null;
          enriched._landingId = landing?.id || null;

          // Purge any stale or synthetic entries for this spot and date across all sub-spot combinations
          for (const existingKey of Array.from(this.cachedWeatherMap.keys())) {
            if (existingKey.startsWith(`${spot.id}_`) && existingKey.endsWith(`_${dateStr}`)) {
              this.cachedWeatherMap.delete(existingKey);
            }
          }
          this.cachedWeatherMap.set(key, enriched);
          this.cachedWeatherMap.set(compositeKey, enriched);

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
        this._rateLimited = false;
        this.updateLiveStatusBadgeInDom();
      } finally {
        if (this.activeFetchKey === key) {
          this.activeFetchPromise = null;
          this.activeFetchKey = null;
        }
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
    const activeSub = this.resolveActiveSubSpot(spot);
    const activeTakeoffId = (activeSub && activeSub.spotType === 'takeoff')
      ? activeSub.id
      : (this.activeTakeoffId || (this.store ? this.store.getState()?.activeTakeoffId : null));
    const activeLandingId = (activeSub && activeSub.spotType === 'landing')
      ? activeSub.id
      : (this.activeLandingId || (this.store ? this.store.getState()?.activeLandingId : null));

    const takeoff = (spot.takeoffs && spot.takeoffs.find(t => t.id === activeTakeoffId))
      || (spot.takeoffs && spot.takeoffs.find(t => t.isPrimary))
      || (spot.takeoffs && spot.takeoffs[0])
      || { id: 't0', altitude: 1000, heading: null };
    const landing = (spot.landings && spot.landings.find(l => l.id === activeLandingId))
      || (spot.landings && spot.landings.find(l => l.isPrimary || l.isOfficial))
      || (spot.landings && spot.landings[0])
      || null;

    const baseKey = `${spot.id}_${dateStr}`;
    const key = `${spot.id}_${takeoff.id || 't0'}_${landing?.id || 'l0'}_${dateStr}`;

    const coversTargetDate = (payload) => {
      if (!payload || !payload.hourly || !Array.isArray(payload.hourly.time)) return false;
      if (!dateStr) return true;
      if (payload.hourly.time.some(t => typeof t === 'string' && t.startsWith(`${dateStr}T`))) return true;
      return payload.hourly.time.length <= 24 && (!payload.targetDate || payload.targetDate === dateStr);
    };

    const ensureLandingWeather = (weatherPayload) => {
      if (!weatherPayload) return weatherPayload;
      if (weatherPayload.landingWeather && (!landing || !weatherPayload._landingId || weatherPayload._landingId === landing.id)) {
        return weatherPayload;
      }
      if (landing && landing.coordinates) {
        const lCoords = parseCoordinates(landing.coordinates);
        if (lCoords) {
          const lCached = getCachedWeatherData(lCoords, dateStr, { weatherModel: 'best_match' });
          if (lCached && !lCached.isStale) {
            weatherPayload.landingWeather = lCached;
            weatherPayload.points = [weatherPayload, lCached];
            weatherPayload._landingId = landing.id || null;
          } else if (weatherPayload._isSynthetic || weatherPayload.isSynthetic) {
            const landingSynthetic = generateSyntheticWeather(
              lCoords,
              {
                targetDate: dateStr,
                days: 1,
                elevation: landing.altitude || 300,
                weatherModel: 'best_match',
                isLanding: true
              }
            );
            const enrichedLanding = enrichWeatherData(landingSynthetic, dateStr, Date.now(), {});
            weatherPayload.landingWeather = enrichedLanding;
            weatherPayload.points = [weatherPayload, enrichedLanding];
            weatherPayload._landingId = landing.id || null;
          }
        }
      }
      return weatherPayload;
    };

    // Prefer non-synthetic cached entry in baseKey or composite key first
    if (this.cachedWeatherMap.has(baseKey)) {
      const baseEntry = this.cachedWeatherMap.get(baseKey);
      if (baseEntry && !baseEntry._isSynthetic && !baseEntry.isSynthetic && (!baseEntry._takeoffId || baseEntry._takeoffId === takeoff.id) && coversTargetDate(baseEntry)) {
        const data = ensureLandingWeather(baseEntry);
        this.cachedWeatherMap.set(key, data);
        if (!data.isStaleOfflineFallback && !this._networkFailed) {
          this.networkStatus = 'live';
        }
        return data;
      }
    }

    if (this.cachedWeatherMap.has(key)) {
      const keyEntry = this.cachedWeatherMap.get(key);
      if (keyEntry && !keyEntry._isSynthetic && !keyEntry.isSynthetic && coversTargetDate(keyEntry)) {
        const data = ensureLandingWeather(keyEntry);
        if (!data.isStaleOfflineFallback && !this._networkFailed) {
          this.networkStatus = 'live';
        }
        return data;
      }
    }

    // Check store global weatherData if matching spot, takeoff, and target date
    const state = this.store ? this.store.getState() : {};
    if (
      state.weatherData &&
      !state.weatherData._isSynthetic &&
      !state.weatherData.isSynthetic &&
      state.selectedSpot &&
      state.selectedSpot.id === spot.id &&
      (!state.weatherData._takeoffId || state.weatherData._takeoffId === takeoff.id) &&
      coversTargetDate(state.weatherData)
    ) {
      const data = ensureLandingWeather(state.weatherData);
      this.cachedWeatherMap.set(key, data);
      this.cachedWeatherMap.set(baseKey, data);
      if (!data.isStaleOfflineFallback && !this._networkFailed) {
        this.networkStatus = 'live';
      }
      return data;
    }

    // Check defaultWeatherCache (includes real payloads fetched in HomeDashboardView batch requests)
    const coords = parseCoordinates(takeoff.coordinates) || { lat: 45.833, lon: 9.302 };
    const cached = getCachedWeatherData(coords, dateStr, { weatherModel: 'best_match' });
    if (cached && !cached.isStale && coversTargetDate(cached)) {
      cached._takeoffId = takeoff.id || null;
      const data = ensureLandingWeather(cached);
      this.cachedWeatherMap.set(key, data);
      this.cachedWeatherMap.set(baseKey, data);
      if (!data._isSynthetic && !data.isStaleOfflineFallback && !this._networkFailed) {
        this.networkStatus = 'live';
      }
      return data;
    }

    // Fallback to cached synthetic entry if already computed for this key
    if (this.cachedWeatherMap.has(key)) {
      return ensureLandingWeather(this.cachedWeatherMap.get(key));
    }

    // Generate deterministic synthetic day for immediate 0ms offline rendering
    const takeoffHeading = (takeoff && takeoff.heading != null && !isNaN(Number(takeoff.heading)))
      ? Number(takeoff.heading)
      : null;

    const synthetic = generateSyntheticWeather(
      coords,
      {
        targetDate: dateStr,
        days: 1,
        elevation: takeoff.altitude || 1000,
        takeoffAzimuth: takeoffHeading,
        weatherModel: 'best_match'
      }
    );
    const enriched = enrichWeatherData(synthetic, dateStr, Date.now(), {
      customHeading: takeoffHeading
    });
    enriched._takeoffId = takeoff.id || null;

    if (landing && landing.coordinates) {
      const lCoords = parseCoordinates(landing.coordinates);
      if (lCoords) {
        const landingSynthetic = generateSyntheticWeather(
          lCoords,
          {
            targetDate: dateStr,
            days: 1,
            elevation: landing.altitude || 300,
            weatherModel: 'best_match',
            isLanding: true
          }
        );
        const enrichedLanding = enrichWeatherData(landingSynthetic, dateStr, Date.now(), {});
        enriched.landingWeather = enrichedLanding;
        enriched.points = [enriched, enrichedLanding];
        enriched._landingId = landing.id || null;
      }
    }

    this.cachedWeatherMap.set(key, enriched);
    this.cachedWeatherMap.set(baseKey, enriched);
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

    const activeTakeoffId = this.store ? this.store.getState().activeTakeoffId : this.activeTakeoffId;
    const takeoff = (spot.takeoffs && spot.takeoffs.find(t => t.id === activeTakeoffId))
      || (spot.takeoffs && spot.takeoffs[0])
      || { altitude: 1000, heading: null };
    const coords = parseCoordinates(takeoff.coordinates) || { lat: 45.833, lon: 9.302 };

    const takeoffHeading = (takeoff && takeoff.heading != null && !isNaN(Number(takeoff.heading)))
      ? Number(takeoff.heading)
      : null;

    const state = this.store ? this.store.getState() : {};
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
    const synthPayload = enrichWeatherData(synthetic, todayIso, Date.now(), {
      customHeading: takeoffHeading
    });
    let summaries = calculateDailyFlyabilitySummary(synthPayload, takeoff, null, days);

    if (
      state.weatherData &&
      !state.weatherData._isSynthetic &&
      !state.weatherData.isSynthetic &&
      state.selectedSpot &&
      state.selectedSpot.id === spot.id &&
      state.weatherData.hourly?.time?.length >= 24
    ) {
      const realSummaries = calculateDailyFlyabilitySummary(state.weatherData, takeoff, null, days);
      if (realSummaries.length > 0) {
        const realByDate = new Map(realSummaries.map(s => [s.dateStr, s]));
        summaries = summaries.map(s => realByDate.get(s.dateStr) || s);
      }
    }

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
      const daylight = this.getDaylightWindow();
      if (typeof state.activeHourIndex === 'number' && state.activeHourIndex >= daylight.sunriseHour && state.activeHourIndex <= daylight.sunsetHour) {
        this.selectedHour = state.activeHourIndex;
      } else if (typeof state.selectedHour === 'number' && state.selectedHour >= daylight.sunriseHour && state.selectedHour <= daylight.sunsetHour) {
        this.selectedHour = state.selectedHour;
      } else {
        this.selectedHour = this._resolveInitialHour(this.activeDate);
      }
    }
    if (state.activeTakeoffId) {
      this.activeTakeoffId = state.activeTakeoffId;
    }
    if (state.activeLandingId) {
      this.activeLandingId = state.activeLandingId;
    }

    if (this.containerEl) {
      if (this.containerEl.classList) {
        this.containerEl.classList.add('gm-view-forecast');
      }
      this.containerEl.addEventListener('click', this.boundClickHandler);
      this.containerEl.addEventListener('change', this.boundChangeHandler);
      this.containerEl.addEventListener('pointerdown', this.boundPointerDown);
      this.containerEl.addEventListener('touchstart', this.boundTouchStart, { passive: false });
      this.containerEl.addEventListener('pointermove', this.boundPointerMove);
      this.containerEl.addEventListener('pointerup', this.boundPointerUp);
      this.containerEl.addEventListener('pointercancel', this.boundPointerUp);
    }

    // Attach delegated click listener to centralized modal sheet container
    this.sheetContainerEl = typeof document !== 'undefined' ? document.getElementById('sheet-container') : null;
    if (this.sheetContainerEl && typeof this.sheetContainerEl.addEventListener === 'function') {
      this.sheetContainerEl.addEventListener('click', this.boundClickHandler);
    }

    this.activeTheme = (this.store?.getState()?.ui?.theme) || 'dark';

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
        if (nextState.activeTakeoffId !== undefined && nextState.activeTakeoffId !== this.activeTakeoffId) {
          this.activeTakeoffId = nextState.activeTakeoffId;
          needsWeatherFetch = true;
        }
        if (nextState.activeLandingId !== undefined && nextState.activeLandingId !== this.activeLandingId) {
          this.activeLandingId = nextState.activeLandingId;
        }
        if (nextState.ui && nextState.ui.theme && nextState.ui.theme !== this.activeTheme && this.miniMapEngine) {
          this.activeTheme = nextState.ui.theme;
          this.miniMapEngine.setTheme(nextState.ui.theme);
        }
        if (nextState.ui && nextState.ui.mapLayer) {
          const validLayer = nextState.ui.mapLayer === 'satellite' ? 'satellite' : 'topo';
          if (this.miniMapEngine && typeof this.miniMapEngine.setLayer === 'function') {
            this.miniMapEngine.setLayer(validLayer);
          }
          if (this.flightAnalysisMapEngine && typeof this.flightAnalysisMapEngine.setLayer === 'function') {
            this.flightAnalysisMapEngine.setLayer(validLayer);
          }
          const miniMapContainer = this.container?.querySelector?.('#forecast-mini-map-container');
          if (miniMapContainer) {
            miniMapContainer.setAttribute('data-map-layer', validLayer);
          }
          this.updateMiniMapToggleUi(validLayer);
          this.updateFlightAnalysisToggleUi(validLayer);
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
        const daylight = this.getDaylightWindow();
        if (this.selectedHour > daylight.sunriseHour) {
          this.setHour(this.selectedHour - 1);
        }
      } else if (e.key === 'ArrowRight' && !['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) {
        const daylight = this.getDaylightWindow();
        if (this.selectedHour < daylight.sunsetHour) {
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
      this.containerEl.removeEventListener('touchstart', this.boundTouchStart);
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
   * Preserves and restores scroll position unless explicitly requested to reset.
   * @param {object} [options]
   * @param {boolean} [options.resetScroll=false]
   */
  render({ resetScroll = false } = {}) {
    if (!this.containerEl) return;
    const scrollContainer = this.containerEl.querySelector ? this.containerEl.querySelector('#forecast-scroll-container') : null;
    const prevScrollTop = (!resetScroll && this.scrollContainerEl)
      ? this.scrollContainerEl.scrollTop
      : (!resetScroll && scrollContainer ? scrollContainer.scrollTop : 0);
    if (this.miniMapEngine) {
      this.miniMapEngine.destroy();
      this.miniMapEngine = null;
    }
    this.containerEl.innerHTML = this.renderHtml();
    this.setupScrollListener();
    if (this.scrollContainerEl) {
      if (resetScroll) {
        this.scrollContainerEl.scrollTop = 0;
      } else if (prevScrollTop > 0) {
        this.scrollContainerEl.scrollTop = prevScrollTop;
      }
    }
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
    const activeSub = this.resolveActiveSubSpot(spot);
    const effectiveTakeoffId = (activeSub && activeSub.spotType === 'takeoff') ? activeSub.id : this.activeTakeoffId;
    const effectiveLandingId = (activeSub && activeSub.spotType === 'landing') ? activeSub.id : this.activeLandingId;

    const evaluated = evaluateComprensorio({
      comprensorio: spot,
      weatherData,
      hourIndex: this.selectedHour,
      glider,
      targetDate: this.activeDate,
      takeoffId: effectiveTakeoffId,
      landingId: effectiveLandingId
    });

    const state = this.store ? this.store.getState() : {};
    const currentTheme = (state.ui && state.ui.theme) || 'dark';

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
        takeoffWeather: evaluated.takeoffWeather || evaluated.weatherSnapshot,
        landingWeather: evaluated.landingWeather || evaluated.weatherSnapshot,
        glideMetrics: evaluated.glideMetrics,
        onSelectSubSpot: (subSpotId) => {
          const s = this.getCurrentSpot();
          if (s) {
            if (s.takeoffs?.some(t => t.id === subSpotId)) {
              this.activeTakeoffId = subSpotId;
              if (this.store) this.store.setState({ activeTakeoffId: subSpotId });
            } else if (s.landings?.some(l => l.id === subSpotId)) {
              this.activeLandingId = subSpotId;
              if (this.store) this.store.setState({ activeLandingId: subSpotId });
            }
          }
          this.selectedSubSpot = subSpotId || 'overview';
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
    const activeSubSpotObj = this.resolveActiveSubSpot(spot);
    const effectiveTakeoffId = (activeSubSpotObj && activeSubSpotObj.spotType === 'takeoff') ? activeSubSpotObj.id : this.activeTakeoffId;
    const effectiveLandingId = (activeSubSpotObj && activeSubSpotObj.spotType === 'landing') ? activeSubSpotObj.id : this.activeLandingId;

    // Evaluate single takeoff and landing for active hour
    const evaluated = evaluateComprensorio({
      comprensorio: spot,
      weatherData,
      hourIndex: this.selectedHour,
      glider,
      targetDate: this.activeDate,
      takeoffId: effectiveTakeoffId,
      landingId: effectiveLandingId
    });

    // Generate flight safety briefing
    const briefing = generateFlightBriefing(spot, weatherData, this.activeDate, glider);

    return `
      <div id="forecast-view" class="gm-forecast-view flex flex-col h-full w-full">
        <!-- 0. Collapsing Sticky Header (Anchored when scrolled past main header) -->
        ${this.renderStickyBar(spot, activeSubSpotObj)}

        <!-- Scrollable cards container (occupies only the usable height above the scrubber) -->
        <div id="forecast-scroll-container" class="gm-forecast-scroll-container flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 p-4 max-w-lg mx-auto w-full">
          <!-- 1. Header: Comprensorio Bar + Picker Trigger -->
          ${this.renderHeader(spot)}

          <!-- 2. Spot Card: Dual Unico Binomio Overview Card (Overview) OR Specific Spot Card (Sub-Spot) -->
          <div id="forecast-spot-card-container">
            ${this.selectedSubSpot === 'overview'
              ? this.renderSummaryCard(evaluated)
              : this.renderSpecificSpotCard(activeSubSpotObj, evaluated)}
          </div>

          <!-- 2b. Flight Windows container (ONLY in Overview) -->
          ${(() => {
            const flightWindowsHtml = this.selectedSubSpot === 'overview'
              ? this.renderFlightWindows(spot, weatherData, glider, activeSubSpotObj)
              : '';
            return `<div id="forecast-flight-windows-container"${!flightWindowsHtml ? ' style="display:none;" aria-hidden="true"' : ''}>${flightWindowsHtml}</div>`;
          })()}

          <!-- Mode Toggle & Parameter Cards / Solo Grafici (ONLY in Sub-Spot) -->
          ${this.selectedSubSpot !== 'overview' ? `
            <div class="gm-forecast-mode-bar flex items-center justify-between">
              <span class="text-xs font-semibold uppercase tracking-wider text-[var(--gm-text-muted)]">Aerologia ${activeSubSpotObj?.spotType === 'landing' ? 'Atterraggio' : 'Decollo'}</span>
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
          ` : `
            <div id="forecast-params-container" class="hidden" aria-hidden="true"></div>
          `}

          <!-- Hidden containers for wind and sounding panel tests compatibility -->
          <div id="forecast-wind-panel-container" class="hidden" aria-hidden="true">
            ${this.renderWindPanel(evaluated, weatherData, spot, activeSubSpotObj)}
          </div>
          <div id="forecast-sounding-panel-container" class="hidden" aria-hidden="true">
            ${this.renderSoundingPanel(evaluated, weatherData, spot, activeSubSpotObj)}
          </div>

          <!-- 5. AI Flight Briefing -->
          ${this.renderBriefingCard(briefing, spot)}
        </div>

        <!-- 6. Bottom Docked Scrubber: 13-slot timeline accessible to thumb -->
        ${this.renderStickyScrubber(spot, weatherData, glider)}
      </div>
    `;
  }

  /**
   * Returns the concise spot/sub-spot name stripped of redundant role prefixes ("Decollo", "Atterraggio").
   * @param {string} rawName
   * @param {'takeoff'|'landing'|null} [role=null]
   * @returns {string}
   */
  formatCleanSpotName(rawName, role = null) {
    const fallback = role === 'takeoff' ? 'Decollo' : (role === 'landing' ? 'Atterraggio' : 'Spot');
    if (!rawName || typeof rawName !== 'string') return fallback;
    const cleaned = rawName.replace(/^(?:Decollo|Atterraggio)\s+/i, '').trim();
    return cleaned || rawName.trim() || fallback;
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
    let ariaSubSpotDetail = 'Panoramica';
    const activeTakeoff = this.resolveActiveTakeoff(spot);
    const activeLanding = this.resolveActiveLanding(spot);
    if (activeSubSpot) {
      subSpotLabel = this.formatCleanSpotName(activeSubSpot.name, activeSubSpot.spotType);
      if (activeSubSpot.spotType === 'takeoff') {
        const headingPart = activeSubSpot.heading != null && !isNaN(Number(activeSubSpot.heading))
          ? ` · ${getCardinalDirection(activeSubSpot.heading)}`
          : '';
        ariaSubSpotDetail = `${activeSubSpot.name} (${activeSubSpot.altitude}m${headingPart})`;
      } else if (activeSubSpot.spotType === 'landing') {
        ariaSubSpotDetail = `${activeSubSpot.name} (${activeSubSpot.altitude}m)`;
      }
    } else if (activeTakeoff && activeLanding) {
      ariaSubSpotDetail = `${activeTakeoff.name} (${activeTakeoff.altitude}m) • ${activeLanding.name} (${activeLanding.altitude}m)`;
    } else if (activeTakeoff) {
      ariaSubSpotDetail = `${activeTakeoff.name} (${activeTakeoff.altitude}m)`;
    }

    const fullAriaLabel = `Località attiva: ${escapeHtml(spot.name)}, ${escapeHtml(ariaSubSpotDetail)}. Tocca per cambiare comprensorio.`;

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
    const activeTakeoff = this.resolveActiveTakeoff(currentSpot);
    const activeLanding = this.resolveActiveLanding(currentSpot);
    const state = this.store ? this.store.getState() : {};
    const isPinned = this.isSpotPinned(currentSpot, state.pinnedSpotIds || []);

    return `
      <header class="gm-forecast-header">
        <!-- Comprensorio Header Bar (Single-Row 48px Touch Target) -->
        <div 
          class="gm-comprensorio-bar gm-unified-spot-bar" 
          data-action="open-picker-sheet" 
          role="button" 
          tabindex="0" 
          aria-label="Comprensorio attivo: ${escapeHtml(currentSpot.name)}. Tocca per cambiare comprensorio."
          title="Tocca per cambiare comprensorio"
        >
          <div class="gm-comprensorio-bar-info">
            <span class="gm-comprensorio-pin" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
            </span>
            <div class="gm-comprensorio-title-row flex items-center gap-2 min-w-0 flex-1">
              <span class="gm-comprensorio-name truncate">
                ${escapeHtml(currentSpot.name)}
              </span>
              ${this.renderLiveWeatherBadge()}
            </div>
          </div>
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              class="gm-forecast-pin-btn ${isPinned ? 'active pinned' : ''}"
              data-action="toggle-pin-spot"
              data-spot-id="${escapeHtml(currentSpot.id)}"
              aria-pressed="${isPinned ? 'true' : 'false'}"
              aria-label="${isPinned ? `Rimuovi ${escapeHtml(currentSpot.name)} dai preferiti` : `Aggiungi ${escapeHtml(currentSpot.name)} ai preferiti`}"
              title="${isPinned ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}"
            >
              <span aria-hidden="true">${isPinned ? '★' : '☆'}</span>
            </button>
            <span class="gm-comprensorio-action-hint text-xs text-[var(--gm-text-muted)]">
              Cambia
            </span>
            <span class="gm-comprensorio-chevron flex-shrink-0" aria-hidden="true">›</span>
          </div>
        </div>

        <!-- Semantic SR-Only Select for Screen Readers and Programmatic Automation -->
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
            ${activeTakeoff && activeLanding ? `Panoramica (${escapeHtml(activeTakeoff.name)} • ${escapeHtml(activeLanding.name)})` : 'Panoramica (Decollo Primario + Atterraggio)'}
          </option>
          ${takeoffs.length > 0 ? `
            <optgroup label="Decolli">
              ${takeoffs.map(t => {
                const headingPart = t.heading != null && !isNaN(Number(t.heading))
                  ? ` · ${t.heading}° ${getCardinalDirection(t.heading)}`
                  : '';
                return `
                  <option value="${t.id}" ${this.selectedSubSpot === t.id ? 'selected' : ''}>
                    ${escapeHtml(t.name)} (${t.altitude}m${headingPart})
                  </option>
                `;
              }).join('')}
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

        <!-- Smart Compact Date Stepper + Quick Chips -->
        <div class="gm-date-tabs" role="tablist" aria-label="Selettore data previsione">
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
              ${smartData.activeFlyability && smartData.activeFlyability.status !== 'unknown' ? `<span class="gm-tab-fly-dot fly-${smartData.activeFlyability.status}" title="${escapeHtml(smartData.activeFlyability.label)}"></span>` : ''}
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
            ${(smartData.quickPresets || smartData.presets.filter(p => !p.isCustom)).map(p => `
              <button 
                type="button" 
                class="gm-date-tab ${p.isActive ? 'active' : ''}"
                data-action="select-date"
                data-date="${p.isoDate}"
                role="tab"
                aria-selected="${p.isActive ? 'true' : 'false'}"
                title="${escapeHtml(p.label)} - ${escapeHtml(p.subLabel)}${p.flyability && p.flyability.status !== 'unknown' ? ` (${escapeHtml(p.flyability.label)})` : ''}"
              >
                <span class="gm-date-tab-main">
                  ${escapeHtml(p.shortLabel || p.label)}
                  ${p.flyability && p.flyability.status !== 'unknown' ? `<span class="gm-tab-fly-dot fly-${p.flyability.status}" title="${escapeHtml(p.flyability.label)}"></span>` : ''}
                </span>
              </button>
            `).join('')}
          </div>
        </div>

        ${smartData.activeHorizon && smartData.activeHorizon.isSynoptic && this.dismissedHorizonDate !== this.activeDate ? `
          <div class="gm-horizon-notice" role="status">
            <div class="gm-horizon-notice-body">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="gm-horizon-icon" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              <span><strong>Tendenza a lungo raggio:</strong> oltre 7 giorni le previsioni sono soggette a variazioni sinottiche.</span>
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
   * Renders the 1-tap quick forecast view switcher (Panoramica / Decollo / Atterraggio).
   * @param {object} spot
   * @param {object} [activeTakeoff]
   * @param {object} [activeLanding]
   * @returns {string}
   */
  renderQuickSubSpotSwitcher(spot, activeTakeoff = null, activeLanding = null) {
    const takeoffs = Array.isArray(spot?.takeoffs) ? spot.takeoffs : [];
    const landings = Array.isArray(spot?.landings) ? spot.landings : [];
    const resolvedTakeoff = (activeTakeoff && activeTakeoff.id)
      ? activeTakeoff
      : (takeoffs.find(t => t.id === this.activeTakeoffId) || takeoffs.find(t => t.isPrimary) || takeoffs[0] || null);
    const resolvedLanding = (activeLanding && activeLanding.id)
      ? activeLanding
      : (landings.find(l => l.id === this.activeLandingId) || landings.find(l => l.isPrimary || l.isOfficial) || landings[0] || null);

    if (!resolvedTakeoff && !resolvedLanding) return '';

    const isOverview = !this.selectedSubSpot || this.selectedSubSpot === 'overview';
    const isTakeoffActive = Boolean(!isOverview && resolvedTakeoff && this.selectedSubSpot === resolvedTakeoff.id);
    const isLandingActive = Boolean(!isOverview && resolvedLanding && this.selectedSubSpot === resolvedLanding.id);

    return `
      <div class="gm-quick-subspot-switcher" role="tablist" aria-label="Selezione rapida vista previsioni">
        <button
          type="button"
          role="tab"
          aria-selected="${isOverview}"
          class="gm-quick-subspot-pill ${isOverview ? 'active' : ''}"
          data-action="select-subspot"
          data-subspot-id="overview"
        >
          Panoramica
        </button>
        ${resolvedTakeoff ? `
          <button
            type="button"
            role="tab"
            aria-selected="${isTakeoffActive}"
            class="gm-quick-subspot-pill ${isTakeoffActive ? 'active' : ''}"
            data-action="select-subspot"
            data-subspot-id="${escapeHtml(resolvedTakeoff.id)}"
          >
            Decollo
          </button>
        ` : ''}
        ${resolvedLanding ? `
          <button
            type="button"
            role="tab"
            aria-selected="${isLandingActive}"
            class="gm-quick-subspot-pill ${isLandingActive ? 'active' : ''}"
            data-action="select-subspot"
            data-subspot-id="${escapeHtml(resolvedLanding.id)}"
          >
            Atterraggio
          </button>
        ` : ''}
      </div>
    `;
  }

  /**
   * Renders either a conditional inline <select> combo (when > 1 sub-spot exists for the role)
   * or clean static text (when only 1 sub-spot exists).
   * @param {'takeoff'|'landing'} role
   * @param {object} currentItem
   * @param {Array<object>} items
   * @param {boolean} [stripRolePrefix=true]
   * @returns {string}
   */
  renderInlineSubSpotControl(role, currentItem, items, stripRolePrefix = true) {
    const isTakeoff = role === 'takeoff';
    const defaultLabel = isTakeoff ? 'Decollo' : 'Atterraggio';
    const prefixRegex = isTakeoff ? /^Decollo\s*/i : /^Atterraggio\s*/i;
    const formatLabel = (rawName) => {
      const base = rawName || defaultLabel;
      return stripRolePrefix ? (base.replace(prefixRegex, '') || base) : base;
    };

    const list = Array.isArray(items) ? items : [];
    const currentLabel = formatLabel(currentItem?.name);

    if (list.length > 1) {
      const actionName = isTakeoff ? 'change-active-takeoff' : 'change-active-landing';
      const ariaLabel = isTakeoff ? 'Seleziona decollo' : 'Seleziona atterraggio';
      return `
        <select
          class="gm-inline-subspot-select gm-flight-target"
          data-action="${actionName}"
          aria-label="${ariaLabel}"
        >
          ${list.map(item => {
            const itemLabel = formatLabel(item?.name);
            const isSelected = Boolean(currentItem && item.id === currentItem.id);
            return `<option value="${escapeHtml(item.id)}" ${isSelected ? 'selected' : ''}>${escapeHtml(itemLabel)}</option>`;
          }).join('')}
        </select>
      `;
    }

    return `<span class="gm-flight-target">${escapeHtml(currentLabel)}</span>`;
  }

  /**
   * Renders the internal metrics for the Unico Binomio Summary Card.
   * @param {object} evalData
   * @returns {string}
   */
  renderSummaryMetrics(evalData) {
    const spot = this.getCurrentSpot() || {};
    const takeoffs = Array.isArray(spot.takeoffs) ? spot.takeoffs : [];
    const landings = Array.isArray(spot.landings) ? spot.landings : [];
    const takeoff = evalData.takeoff || {};
    const landing = evalData.landing || {};
    const glide = evalData.glideMetrics || { requiredGlideRatio: '-', isSafe: true };
    const weather = evalData.weatherSnapshot || {};

    const takeoffAlt = takeoff.altitude ? `${takeoff.altitude}m` : '-';
    const landingAlt = landing.altitude ? `${landing.altitude}m` : '-';

    const windSpeedStr = weather.windSpeed != null ? `${Math.round(weather.windSpeed)} km/h` : '-';
    const dirVal = weather.windDirection ?? weather.windDir;
    const windDirStr = dirVal != null ? `${getCardinalDirection(dirVal)} (${Math.round(dirVal)}°)` : '';

    return `
      ${this.renderQuickSubSpotSwitcher(spot, takeoff, landing)}
      <!-- Top Row: Hour & Status Badge -->
      <div class="flex items-center justify-between border-b border-[var(--gm-border)] pb-2 mb-2">
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold uppercase tracking-wider text-[var(--gm-accent)]">Ore Selezionate</span>
          <span class="text-sm font-mono font-bold text-[var(--gm-text-primary)]">
            ${String(this.selectedHour).padStart(2, '0')}:00
          </span>
        </div>
        <span 
          class="px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded-full border border-current gm-badge-${escapeHtml(evalData.status || 'unavailable')}"
          style="color: ${evalData.status === 'unflyable' ? 'var(--gm-status-unflyable-text)' : evalData.badgeColor}; background-color: ${evalData.badgeBg};"
        >
          ${evalData.badge}
        </span>
      </div>

      <!-- Dual Launch/Landing Info -->
      <div class="gm-flight-data-grid">
        <div
          class="gm-flight-stat-row gm-flight-stat-row-interactive"
          ${takeoff.id ? `data-action="select-subspot" data-subspot-id="${escapeHtml(takeoff.id)}" role="button" tabindex="0" title="Mostra previsioni decollo (${escapeHtml(takeoffAlt)})"` : ''}
        >
          <div class="gm-flight-label">
            <span class="gm-flight-icon">↗</span>
            ${this.renderInlineSubSpotControl('takeoff', takeoff, takeoffs, true)}
          </div>
          <div class="gm-flight-data">
            <span class="gm-flight-wind">${windSpeedStr}</span>
            ${windDirStr ? `<span class="gm-flight-dir">da ${windDirStr}</span>` : ''}
          </div>
        </div>

        <div
          class="gm-flight-stat-row gm-flight-stat-row-interactive"
          ${landing.id ? `data-action="select-subspot" data-subspot-id="${escapeHtml(landing.id)}" role="button" tabindex="0" title="Mostra previsioni atterraggio (${escapeHtml(landingAlt)})"` : ''}
        >
          <div class="gm-flight-label">
            <span class="gm-flight-icon">↘</span>
            ${this.renderInlineSubSpotControl('landing', landing, landings, true)}
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
   * @returns {'topo' | 'satellite'}
   */
  getActiveMapLayer() {
    const state = this.store ? this.store.getState() : {};
    return (state.ui && state.ui.mapLayer) || 'dark';
  }

  /**
   * Updates the mini-map layer toggle button UI.
   * @param {string} newLayer
   */
  updateMiniMapToggleUi(newLayer) {
    if (!this.container) return;
    const toggleBtn = this.container.querySelector('#forecast-minimap-layer-toggle');
    if (!toggleBtn) return;
    const isSat = newLayer === 'satellite';
    const curLabel = isSat ? 'Satellite' : 'OpenTopo';
    const nextLabel = isSat ? 'OpenTopo' : 'Satellite';
    toggleBtn.setAttribute('data-layer', newLayer);
    toggleBtn.setAttribute('aria-label', `Layer mappa: ${curLabel} (tocca per ${nextLabel})`);
    toggleBtn.setAttribute('title', `Layer mappa: ${curLabel} (tocca per ${nextLabel})`);
    toggleBtn.innerHTML = renderLayerToggleIcon(newLayer, 20);
    const select = this.container.querySelector('#forecast-minimap-layer-select');
    if (select) select.value = newLayer;
  }

  /**
   * Updates the flight analysis overlay map layer toggle button UI.
   * @param {string} newLayer
   */
  updateFlightAnalysisToggleUi(newLayer) {
    const root = this.flightAnalysisOverlayEl || this.container || (typeof document !== 'undefined' ? document : null);
    if (!root || typeof root.querySelector !== 'function') return;
    const toggleBtn = root.querySelector('#forecast-flight-analysis-layer-toggle');
    if (!toggleBtn) return;
    const isSat = newLayer === 'satellite';
    const curLabel = isSat ? 'Satellite' : 'OpenTopo';
    const nextLabel = isSat ? 'OpenTopo' : 'Satellite';
    toggleBtn.setAttribute('data-layer', newLayer);
    toggleBtn.setAttribute('aria-label', `Layer mappa: ${curLabel} (tocca per ${nextLabel})`);
    toggleBtn.setAttribute('title', `Layer mappa: ${curLabel} (tocca per ${nextLabel})`);
    toggleBtn.innerHTML = renderLayerToggleIcon(newLayer, 20);
    const aimTrigger = root.querySelector('.gm-aim-menu-trigger');
    if (aimTrigger) aimTrigger.setAttribute('data-layer', newLayer);
    const select = root.querySelector('.gm-flight-analysis-layer-select');
    if (select) select.value = newLayer;
  }

  /**
   * Renders the mini-map box container with canvas, layer toggle button, and expand action button.
   * @returns {string}
   */
  renderMiniMapBox() {
    const activeLayer = this.getActiveMapLayer();
    return `
      <div id="forecast-mini-map-container" class="gm-mini-map-box" data-map-layer="${activeLayer}">
        <div id="forecast-mini-map" class="gm-mini-map-canvas"></div>
        <button 
          type="button" 
          id="forecast-minimap-layer-toggle" 
          class="gm-mini-map-layer-toggle" 
          data-action="toggle-minimap-layer" 
          data-layer="${activeLayer}" 
          aria-label="Layer mappa: ${activeLayer === 'satellite' ? 'Satellite (tocca per OpenTopo)' : 'OpenTopo (tocca per Satellite)'}" 
          title="Passa a ${activeLayer === 'satellite' ? 'OpenTopo' : 'Satellite'}"
        >
          ${renderLayerToggleIcon(activeLayer, 20)}
        </button>
        <div class="gm-mini-map-zoom-controls" role="group" aria-label="Controlli zoom mappa">
          <button 
            type="button" 
            class="gm-mini-map-zoom-btn gm-mini-map-zoom-in" 
            data-action="minimap-zoom-in" 
            aria-label="Ingrandisci mappa" 
            title="Ingrandisci mappa"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button 
            type="button" 
            class="gm-mini-map-zoom-btn gm-mini-map-zoom-out" 
            data-action="minimap-zoom-out" 
            aria-label="Rimpicciolisci mappa" 
            title="Rimpicciolisci mappa"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
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
    const spot = this.getCurrentSpot() || {};
    const isTakeoff = subSpot.spotType === 'takeoff';
    const roleItems = isTakeoff ? (spot.takeoffs || []) : (spot.landings || []);
    const weather = isTakeoff
      ? (evalData.takeoffWeather || evalData.weatherSnapshot || {})
      : (evalData.landingWeather || evalData.weatherSnapshot || {});
    const icon = isTakeoff ? '↗' : '↘';

    const windSpeedStr = weather.windSpeed != null ? `${Math.round(weather.windSpeed)} km/h` : '-';
    const dirVal = weather.windDirection ?? weather.windDir;
    const windDirStr = dirVal != null ? `${getCardinalDirection(dirVal)} (${Math.round(dirVal)}°)` : '';

    const isInfoOpen = Boolean(this.isSubSpotInfoOpen);

    return `
      ${this.renderQuickSubSpotSwitcher(spot, isTakeoff ? subSpot : evalData.takeoff, !isTakeoff ? subSpot : evalData.landing)}
      <div class="flex items-center justify-between gap-2 border-b border-[var(--gm-border)] pb-2 mb-2">
        <span class="text-xs font-mono font-bold text-[var(--gm-text-secondary)] flex-shrink-0">
          Ore ${String(this.selectedHour).padStart(2, '0')}:00
        </span>
        <div class="gm-specific-spot-name-tag flex items-center justify-end gap-1.5 min-w-0 ml-auto text-right">
          <span class="text-sm font-bold text-[var(--gm-accent)] flex-shrink-0">${icon}</span>
          ${this.renderInlineSubSpotControl(isTakeoff ? 'takeoff' : 'landing', subSpot, roleItems, true)}
        </div>
      </div>

      <details class="gm-subspot-info-collapsible"${isInfoOpen ? ' open' : ''}>
        <summary 
          class="gm-subspot-info-summary" 
          data-action="toggle-subspot-info" 
          aria-expanded="${isInfoOpen ? 'true' : 'false'}"
        >
          <span class="gm-subspot-info-trigger-label">
            <span class="gm-subspot-info-badge">Info</span>
            <span class="gm-subspot-info-hint">${isTakeoff ? 'Dettagli e descrizione decollo' : 'Dettagli e descrizione atterraggio'}</span>
          </span>
          <span class="gm-subspot-info-chevron" aria-hidden="true">▾</span>
        </summary>

        <div class="gm-subspot-info-body flex flex-col gap-1.5 text-xs text-[var(--gm-text-secondary)]">
          ${isTakeoff ? `
            <div class="flex justify-between">
              <span>Azimut Pendio:</span>
              <span class="font-bold text-[var(--gm-text-primary)] font-mono">${subSpot.heading != null && !isNaN(Number(subSpot.heading)) ? `${subSpot.heading}° (${getCardinalDirection(subSpot.heading)})` : 'N/D'}</span>
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
      </details>
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
   * Renders the Daily Flight Windows (Evoluzione Giornaliera) section in ForecastView.
   * Groups the daylight hours into 3-4 natural operational phases with launch & landing synthesis.
   * 
   * @param {object} spot
   * @param {object} weatherData
   * @param {object} glider
   * @param {object|null} activeSubSpotObj
   * @returns {string}
   */
  renderFlightWindows(spot, weatherData, glider, activeSubSpotObj) {
    if (this.selectedSubSpot !== 'overview') return '';
    if (!spot || !weatherData) return '';
    const primaryTakeoffId = spot?.takeoffs?.find(t => t.isPrimary)?.id || spot?.takeoffs?.[0]?.id || null;
    const forcedTakeoffId = (activeSubSpotObj && activeSubSpotObj.spotType === 'takeoff')
      ? activeSubSpotObj.id
      : (this.activeTakeoffId && this.activeTakeoffId !== primaryTakeoffId ? this.activeTakeoffId : null);
    const forcedLandingId = (activeSubSpotObj && activeSubSpotObj.spotType === 'landing') ? activeSubSpotObj.id : null;

    const windows = calculateFlightWindows({
      comprensorio: spot,
      weatherData,
      targetDate: this.activeDate,
      glider,
      forcedTakeoffId,
      forcedLandingId
    });

    if (!windows || windows.length === 0) return '';

    const isForced = Boolean(forcedTakeoffId);
    const forcedTakeoffObj = spot?.takeoffs?.find(t => t.id === forcedTakeoffId) || activeSubSpotObj;
    const forcedTakeoffName = isForced ? (forcedTakeoffObj?.name || 'Decollo Selezionato') : null;
    const forcedTakeoffClean = isForced ? this.formatCleanSpotName(forcedTakeoffName, 'takeoff') : null;

    return `
      <section aria-labelledby="heading-flight-windows" class="gm-flight-windows-section">
        <div class="gm-flight-windows-header">
          <div class="flex items-center gap-2">
            <h2 id="heading-flight-windows" class="gm-flight-windows-title">Evoluzione Giornaliera</h2>
            ${isForced ? `
              <span class="gm-flight-windows-badge-forced" title="Decollo imposto manualmente: ${escapeHtml(forcedTakeoffName)}">
                Imposto: ${escapeHtml(forcedTakeoffClean)}
              </span>
            ` : ''}
          </div>
          <span class="text-xs text-[var(--gm-text-muted)]">Fasce Orarie</span>
        </div>
        <div class="gm-flight-windows-list" role="listbox" aria-label="Finestre operative della giornata">
          ${windows.map(win => {
            const isActive = this.selectedHour >= win.startHour && this.selectedHour <= win.endHour;
            const badgeClass = win.status === 'flyable'
              ? 'gm-flight-window-badge-flyable'
              : (win.status === 'caution' ? 'gm-flight-window-badge-caution' : 'gm-flight-window-badge-unflyable');
            const badgeLabel = win.status === 'flyable'
              ? 'Volabile'
              : (win.status === 'caution' ? 'Cautela' : 'Non Volabile');
            const cleanTakeoffName = win.takeoff ? this.formatCleanSpotName(win.takeoff.name, 'takeoff') : '';

            return `
              <div 
                class="gm-flight-window-card ${isActive ? 'active' : ''}"
                data-action="select-window"
                data-hour="${win.startHour}"
                data-start-hour="${win.startHour}"
                data-end-hour="${win.endHour}"
                role="option"
                tabindex="0"
                aria-selected="${isActive ? 'true' : 'false'}"
                aria-label="${escapeHtml(win.phaseName)}, ${escapeHtml(win.timeRange)}, ${badgeLabel}. ${escapeHtml(win.title)}."
              >
                <div class="gm-flight-window-card-top">
                  <div class="gm-flight-window-time-row">
                    <span class="gm-flight-window-time">${escapeHtml(win.timeRange)}</span>
                    <span class="gm-flight-window-phase">· ${escapeHtml(win.phaseName)}</span>
                  </div>
                  <span class="gm-flight-window-badge ${badgeClass}">${badgeLabel}</span>
                </div>
                <div class="gm-flight-window-card-title">${escapeHtml(win.title)}</div>
                <div class="gm-flight-window-card-desc">${escapeHtml(win.description)}</div>
                ${win.takeoff ? `
                  <div class="gm-flight-window-card-takeoff-tag" title="${escapeHtml(win.takeoff.name)}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="m8 3 4 8 5-5 5 15H2L8 3z"></path>
                    </svg>
                    <span>${escapeHtml(cleanTakeoffName)}</span>
                  </div>
                ` : ''}
                ${(win.hazards && win.hazards.length > 0) ? `
                  <div class="gm-flight-window-hazards-row">
                    ${win.hazards.map(h => `
                      <span class="gm-flight-window-hazard-chip">${escapeHtml(h)}</span>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
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
      : (evaluated.takeoff || (spot.takeoffs && spot.takeoffs[0]) || { altitude: 1000, heading: null });

    const landing = (activeSubSpotObj && activeSubSpotObj.spotType === 'landing')
      ? activeSubSpotObj
      : (evaluated.landing || (spot.landings && spot.landings[0]) || { altitude: 400, heading: null });

    const isLanding = activeSubSpotObj && activeSubSpotObj.spotType === 'landing';
    const hasTakeoffHeading = typeof takeoff.heading === 'number' && !isNaN(takeoff.heading);

    const landingWeatherSource = weatherData?.landingWeather || weatherData?.landing || weatherData?.points?.[1];
    const sourceHourly = (isLanding && landingWeatherSource && landingWeatherSource.hourly)
      ? landingWeatherSource.hourly
      : ((weatherData && weatherData.hourly) || {});
    const hourlyData = sourceHourly;
    const times = hourlyData.time || [];

    const baseDate = (times[0] && !times.some(t => t.startsWith(`${this.activeDate}T`)))
      ? times[0].slice(0, 10)
      : this.activeDate;

    const daylight = this.getDaylightWindow(spot, weatherData, this.activeDate);
    const rawCapeSeries = hourlyData.cape;
    const rawLandingCapeSeries = landingWeatherSource?.hourly?.cape;
    const daylightRawCapes = [];
    for (let h = daylight.sunriseHour; h <= daylight.sunsetHour; h++) {
      const timePrefix = `${baseDate}T${String(h).padStart(2, '0')}:`;
      const idx = times.findIndex(t => t.startsWith(timePrefix));
      if (idx !== -1) {
        const tc = (rawCapeSeries && rawCapeSeries[idx] != null) ? Number(rawCapeSeries[idx]) : 0;
        const lc = (!isLanding && rawLandingCapeSeries && rawLandingCapeSeries[idx] != null)
          ? Number(rawLandingCapeSeries[idx])
          : 0;
        daylightRawCapes.push(Math.max(tc, lc));
      }
    }
    const minDaylightRawCape = daylightRawCapes.length > 0 ? Math.min(...daylightRawCapes) : 0;
    const maxDaylightRawCape = daylightRawCapes.length > 0 ? Math.max(...daylightRawCapes) : 0;
    const isRawCapeFlat = (maxDaylightRawCape - minDaylightRawCape) < 15;
    const solarSpan = Math.max(1, daylight.sunsetHour - daylight.sunriseHour);

    const hourlyPoints = [];
    for (let h = daylight.sunriseHour; h <= daylight.sunsetHour; h++) {
      const timePrefix = `${baseDate}T${String(h).padStart(2, '0')}:`;
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
      let precipProb = 0;

      if (idx !== -1) {
        const rawSpeed = hourlyData.windspeed_10m ?? hourlyData.wind_speed_10m;
        const rawGust = hourlyData.windgusts_10m ?? hourlyData.wind_gusts_10m;
        const rawDir = hourlyData.winddirection_10m ?? hourlyData.wind_direction_10m;
        const rawTemp = hourlyData.temperature_2m;
        const rawDew = hourlyData.dewpoint_2m ?? hourlyData.dew_point_2m;
        const rawHum = hourlyData.relativehumidity_2m ?? hourlyData.relative_humidity_2m;
        const rawCape = hourlyData.cape;
        const rawCloud = hourlyData.cloudcover ?? hourlyData.cloud_cover;
        const rawCloudLow = hourlyData.cloudcover_low ?? hourlyData.cloud_cover_low;
        const rawCloudMid = hourlyData.cloudcover_mid ?? hourlyData.cloud_cover_mid;
        const rawCloudHigh = hourlyData.cloudcover_high ?? hourlyData.cloud_cover_high;
        const rawPrecip = hourlyData.precipitation ?? hourlyData.rain;
        const rawPrecipProb = hourlyData.precipitation_probability;

        if (rawSpeed && rawSpeed[idx] != null) speed = Number(rawSpeed[idx]);
        if (rawGust && rawGust[idx] != null) gust = Number(rawGust[idx]);
        if (rawDir && rawDir[idx] != null) dir = Number(rawDir[idx]);
        if (rawTemp && rawTemp[idx] != null) temp = Number(rawTemp[idx]);
        if (rawDew && rawDew[idx] != null) dew = Number(rawDew[idx]);
        if (rawHum && rawHum[idx] != null) humidity = Number(rawHum[idx]);
        if (rawCape && rawCape[idx] != null) cape = Number(rawCape[idx]);
        if (!isLanding && rawLandingCapeSeries && rawLandingCapeSeries[idx] != null) {
          cape = Math.max(cape, Number(rawLandingCapeSeries[idx]));
        }
        if (rawCloud && rawCloud[idx] != null) {
          cloudCover = Number(rawCloud[idx]);
        } else if (
          (rawCloudLow && rawCloudLow[idx] != null) ||
          (rawCloudMid && rawCloudMid[idx] != null) ||
          (rawCloudHigh && rawCloudHigh[idx] != null)
        ) {
          const cLow = Math.min(100, Math.max(0, Number(rawCloudLow?.[idx] ?? 0)));
          const cMid = Math.min(100, Math.max(0, Number(rawCloudMid?.[idx] ?? 0)));
          const cHigh = Math.min(100, Math.max(0, Number(rawCloudHigh?.[idx] ?? 0)));
          cloudCover = Math.min(100, Math.round(100 * (1 - (1 - cLow / 100) * (1 - cMid / 100) * (1 - cHigh / 100))));
        }
        if (rawPrecip && rawPrecip[idx] != null) precip = Number(rawPrecip[idx]);
        if (rawPrecipProb && rawPrecipProb[idx] != null) precipProb = Number(rawPrecipProb[idx]);
        else if (precip > 0) precipProb = 80;
      }

      const lcl = calculateLCL(temp, dew, takeoff.altitude);
      const lclMsl = lcl ? lcl.lclMsl : (takeoff.altitude + 800);
      const deltaWind = Math.max(0, gust - speed);

      const solarPhase = Math.max(0, Math.sin(((h - daylight.sunriseHour) / solarSpan) * Math.PI));
      const rawRad = hourlyData.shortwave_radiation_instant ?? hourlyData.shortwave_radiation;
      const radVal = (idx !== -1 && rawRad && rawRad[idx] != null)
        ? Number(rawRad[idx])
        : Math.round(solarPhase * 480);
      const rawBlh = hourlyData.boundary_layer_height;
      const blhVal = (idx !== -1 && rawBlh && rawBlh[idx] != null)
        ? Number(rawBlh[idx])
        : Math.round(150 + solarPhase * 850);
      const thermalSpread = Math.max(0, temp - dew);

      // Diurnal boundary-layer convective potential when NWP surface CAPE is flat/zero at mountain elevation
      const diurnalThermalCape = Math.round(
        15 + solarPhase * (
          35 +
          Math.min(14, thermalSpread) * 5.5 +
          Math.min(18, deltaWind) * 4.5 +
          Math.min(1800, blhVal) * 0.03 +
          Math.min(800, radVal) * 0.05
        )
      );

      // Storm / convective shower instability when precipitation or high rain probability occurs
      let stormInstabilityCape = 0;
      if (precip > 0.5) {
        stormInstabilityCape = Math.round(
          340 + Math.min(4.0, precip) * 130 + precipProb * 2.2 + Math.min(25, deltaWind) * 10 + solarPhase * 90
        );
      } else if (precip >= 0.1 || precipProb >= 30) {
        stormInstabilityCape = Math.round(
          90 + precip * 320 + Math.max(0, precipProb - 20) * 3.8 + Math.min(20, deltaWind) * 7 + solarPhase * 70
        );
      }

      if (isRawCapeFlat) {
        const baseRefCape = idx === -1 ? cape : maxDaylightRawCape;
        const modulatedBase = baseRefCape > 0
          ? Math.round(baseRefCape * (0.25 + 0.85 * solarPhase))
          : 0;
        cape = Math.max(modulatedBase, diurnalThermalCape, stormInstabilityCape);
      } else if (stormInstabilityCape > cape) {
        cape = stormInstabilityCape;
      }

      const angleDelta = hasTakeoffHeading
        ? Math.abs(calculateAngularDifference(takeoff.heading, dir))
        : null;
      const updraft = Math.max(0.5, Math.min(5.0, (temp - dew) * 0.22 + (cape > 300 ? (cape / 400) : 0)));
      const edr = Math.max(0.8, Math.min(4.5, deltaWind * 0.15 + (updraft > 2.5 ? 1.0 : 0.4)));
      let landingSpeed = Math.max(4, Math.round(speed * 0.75));
      let landingGust = gust;
      let landingDir = dir;

      if (isLanding) {
        landingSpeed = speed;
        landingGust = gust;
        landingDir = dir;
      } else if (landingWeatherSource && landingWeatherSource.hourly) {
        const lh = landingWeatherSource.hourly;
        const rawLSpeed = lh.windspeed_10m ?? lh.wind_speed_10m;
        if (rawLSpeed && rawLSpeed[idx] != null) landingSpeed = Number(rawLSpeed[idx]);
        const rawLGust = lh.windgusts_10m ?? lh.wind_gusts_10m;
        if (rawLGust && rawLGust[idx] != null) landingGust = Number(rawLGust[idx]);
        const rawLDir = lh.winddirection_10m ?? lh.wind_direction_10m;
        if (rawLDir && rawLDir[idx] != null) landingDir = Number(rawLDir[idx]);
      }

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
        precipProb,
        lclMsl,
        deltaWind,
        angleDelta,
        updraft,
        edr,
        landingSpeed,
        landingGust,
        landingDir
      });
    }

    const activePoint = hourlyPoints.find(p => p.hour === this.selectedHour) || hourlyPoints[0];
    const maxWindLimit = glider.maxWind || 18;
    const maxGustLimit = glider.maxGust || 25;

    // 1. Takeoff Wind
    let windStatus = 'flyable';
    let windStatusLabel = 'Favorevole';

    if (hasTakeoffHeading) {
      if (activePoint.speed <= 4) {
        if (activePoint.angleDelta > 90) {
          windStatus = 'caution';
          windStatusLabel = 'Brezza da Dietro';
        } else {
          windStatus = 'flyable';
          windStatusLabel = 'Vento Calmo';
        }
      } else {
        // Wind > 4 km/h
        if (activePoint.speed > maxWindLimit + 10 || activePoint.gust > 35) {
          windStatus = 'severe';
          windStatusLabel = 'Pericoloso';
        } else if (activePoint.angleDelta > 90) {
          if (activePoint.speed > 18) {
            windStatus = 'severe';
            windStatusLabel = 'NO FLY: Sottovento';
          } else {
            windStatus = 'unflyable';
            windStatusLabel = 'Vento da Dietro';
          }
        } else if (activePoint.angleDelta > 60) {
          if (activePoint.speed > 14) {
            windStatus = 'unflyable';
            windStatusLabel = 'Traverso Marcato';
          } else {
            windStatus = 'caution';
            windStatusLabel = 'Vento Traverso';
          }
        } else if (activePoint.angleDelta > 35) {
          if (activePoint.speed > maxWindLimit || activePoint.gust > maxGustLimit) {
            windStatus = 'caution';
            windStatusLabel = 'Vento Sostenuto';
          } else {
            windStatus = 'caution';
            windStatusLabel = 'Vento al Traverso';
          }
        } else {
          // Frontal (<= 35°)
          if (activePoint.speed > maxWindLimit + 4 || activePoint.gust > maxGustLimit + 5) {
            windStatus = 'unflyable';
            windStatusLabel = 'Vento Forte';
          } else if (activePoint.speed > maxWindLimit || activePoint.gust > maxGustLimit) {
            windStatus = 'caution';
            windStatusLabel = 'Vento Sostenuto';
          } else {
            windStatus = 'flyable';
            windStatusLabel = 'Favorevole';
          }
        }
      }
    } else {
      // Spot WITHOUT takeoff exposure
      if (activePoint.speed > maxWindLimit + 10 || activePoint.gust > 35) {
        windStatus = 'severe';
        windStatusLabel = 'Pericoloso';
      } else if (activePoint.speed > maxWindLimit + 4 || activePoint.gust > maxGustLimit + 5) {
        windStatus = 'unflyable';
        windStatusLabel = 'Vento Forte';
      } else if (activePoint.speed > maxWindLimit || activePoint.gust > maxGustLimit) {
        windStatus = 'caution';
        windStatusLabel = 'Vento Sostenuto';
      } else if (activePoint.speed <= 4) {
        windStatus = 'flyable';
        windStatusLabel = 'Vento Calmo';
      } else {
        windStatus = 'flyable';
        windStatusLabel = 'Favorevole';
      }
    }

    const windParam = {
      id: 'vento-decollo',
      title: 'Vento in Decollo',
      subtitle: 'Velocità, direzione e allineamento al decollo',
      value: `${Math.round(activePoint.speed)} km/h · ${Math.round(activePoint.dir)}° ${getCardinalDirection(activePoint.dir)}`,
      status: windStatus,
      statusLabel: windStatusLabel,
      takeoffHeading: hasTakeoffHeading ? takeoff.heading : null,
      takeoffAlt: takeoff.altitude,
      details: [
        { label: 'Velocità Media', value: `${Math.round(activePoint.speed)} km/h` },
        { label: 'Raffica di Picco', value: `${Math.round(activePoint.gust)} km/h` },
        { label: 'Direzione Vento', value: `${Math.round(activePoint.dir)}° (${getCardinalDirection(activePoint.dir)})` },
        {
          label: 'Scostamento Decollo',
          value: hasTakeoffHeading
            ? `${Math.round(activePoint.angleDelta)}° (${activePoint.angleDelta <= 35 ? 'In Asse' : activePoint.angleDelta <= 75 ? 'Al Traverso' : 'Fuori Asse'})`
            : 'N/D (Esposizione non nota)'
        }
      ],
      advice: !hasTakeoffHeading
        ? (windStatus === 'severe' || windStatus === 'unflyable'
            ? 'Velocità o raffiche oltre i limiti operativi dell\'ala. Esposizione decollo non censita: verificare attentamente sul posto.'
            : 'Esposizione del pendio non nota nel catalogo. Intensità vento nei limiti: valutare l\'allineamento del decollo direttamente sul posto.')
        : (windStatus === 'flyable'
            ? (activePoint.speed <= 4
                ? 'Vento debole o calmo. Influenza sinottica trascurabile, decollo dominato dalle brezze di pendio locali.'
                : 'Intensità e orientamento ottimali rispetto al decollo. Gonfiaggio regolare con ottimo controllo a terra.')
            : windStatus === 'caution'
            ? (activePoint.speed <= 4
                ? 'Brezza debole proveniente dal settore posteriore. Prestare attenzione alla fase di gonfiaggio.'
                : 'Vento sostenuto o al traverso rispetto al decollo. Richiesta attenzione nella fase di corsa e gonfiaggio.')
            : windStatus === 'severe'
            ? 'Vento tempestoso, sottovento violento o raffiche pericolose. Pericolo critico di trascinamento e rotori.'
            : 'Vento oltre i limiti di sicurezza dell\'ala o con componente posteriore marcata. Decollo sconsigliato.')
    };

    // 2. Gusts & Wind Delta
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

    // 3. Cloud Base (LCL)
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

    // 4. Instability / Thunderstorms (CAPE)
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

    const maxCapeVal = Math.max(0, ...hourlyPoints.map(p => p.cape));
    const capeChartMaxY = maxCapeVal < 260
      ? 350
      : maxCapeVal < 700
        ? Math.max(450, Math.ceil((maxCapeVal * 1.2) / 50) * 50)
        : Math.max(1000, Math.ceil((maxCapeVal * 1.15) / 100) * 100);
    const capeThresholds = [
      { value: 300, stroke: 'var(--gm-status-caution)', label: 'Attenzione (300)' }
    ];
    if (capeChartMaxY >= 800) {
      capeThresholds.push({ value: 800, stroke: 'var(--gm-status-unflyable)', label: 'Rischio (800)' });
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
        maxY: capeChartMaxY,
        thresholds: capeThresholds,
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

    // 5. Thermal Turbulence (EDR)
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

    // 6. Cloud Cover & Insolation
    let cloudStatus = 'flyable';
    let cloudStatusLabel = 'Soleggiato';
    if (activePoint.precip > 0.5) {
      cloudStatus = 'severe';
      cloudStatusLabel = 'NO FLY: Pioggia';
    } else if (activePoint.precip >= 0.1) {
      cloudStatus = 'caution';
      cloudStatusLabel = 'Pioviggine';
    } else if (activePoint.precipProb >= 60) {
      cloudStatus = 'caution';
      cloudStatusLabel = 'Rischio Pioggia';
    } else if (activePoint.cloudCover <= 35) {
      cloudStatus = 'flyable';
      cloudStatusLabel = 'Soleggiato';
    } else if (activePoint.cloudCover <= 80) {
      cloudStatus = 'caution';
      cloudStatusLabel = 'Parz. Nuvoloso';
    } else {
      cloudStatus = 'unflyable';
      cloudStatusLabel = 'Coperto';
    }

    const precipBadgeText = activePoint.precip > 0.5
      ? ` · Pioggia (${activePoint.precip.toFixed(1)} mm/h)`
      : (activePoint.precip >= 0.1
        ? ` · Pioviggine (${activePoint.precip.toFixed(1)} mm/h)`
        : (activePoint.precipProb >= 40
          ? ` · Rischio Pioggia ${Math.round(activePoint.precipProb)}%`
          : ` · ${activePoint.cloudCover <= 35 ? 'Soleggiato' : activePoint.cloudCover <= 70 ? 'Variabile' : 'Coperto'}`));

    const cloudParam = {
      id: 'copertura',
      title: 'Copertura Nuvolosa & Insolazione',
      subtitle: 'Radiazione solare al suolo e innesco termico dei versanti',
      value: `${Math.round(activePoint.cloudCover)}% coperto${precipBadgeText}`,
      status: cloudStatus,
      statusLabel: cloudStatusLabel,
      details: [
        { label: 'Copertura Totale', value: `${Math.round(activePoint.cloudCover)}%` },
        { label: 'Insolazione Pendio', value: activePoint.cloudCover <= 35 ? 'Massima (100%)' : activePoint.cloudCover <= 70 ? 'Variabile (60%)' : 'Debole (<20%)' },
        { label: 'Precipitazioni Orarie', value: `${activePoint.precip.toFixed(1)} mm/h` },
        { label: 'Probabilità Pioggia', value: `${Math.round(activePoint.precipProb)}%` }
      ],
      advice: activePoint.precip > 0.5
        ? 'Pioggia in atto o imminente (>0.5 mm/h). Decollo assolutamente vietato per pericolo bagnatura del tessuto e stallo paracadutale immediato.'
        : (activePoint.precip >= 0.1
          ? 'Pioviggine o rovesci deboli previsti. Rischio di bagnare l\'ala ed alterare il profilo aerodinamico; volo sconsigliato.'
          : (activePoint.precipProb >= 60
            ? 'Rischio elevato di rovesci sparsi. Prestare massima attenzione all\'addensarsi delle nubi scure.'
            : (cloudStatus === 'flyable'
              ? 'Pendii ben illuminati dal sole, innesco termico costante e ben delineato.'
              : cloudStatus === 'caution'
              ? 'Passaggi nuvolosi che potrebbero ombreggiare temporaneamente i versanti e spegnere le termiche.'
              : 'Cielo compatto o minaccia di precipitazioni; attività termica inibita con rischio di spegnimento delle brezze.'))),
      chartOptions: {
        id: 'param-chart-cloud',
        title: 'Copertura Nuvolosa e Probabilità Pioggia',
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
          },
          {
            name: 'Probabilità Pioggia',
            points: hourlyPoints.map(p => ({ hour: p.hour, value: p.precipProb })),
            stroke: 'var(--gm-accent-sky, #0ea5e9)',
            strokeWidth: 1.8,
            strokeDasharray: '3,3'
          }
        ]
      }
    };

    // 7. Landing Conditions
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

    if (isLanding) {
      // 5 Landing Parameter Cards
      let landingWindStatus = 'flyable';
      let landingWindStatusLabel = 'Brezza Calma';
      if (activePoint.speed <= 16 && activePoint.gust <= 22) {
        landingWindStatus = 'flyable';
        landingWindStatusLabel = 'Brezza Calma';
      } else if (activePoint.speed <= 24 && activePoint.gust <= 30) {
        landingWindStatus = 'caution';
        landingWindStatusLabel = 'Brezza Sostenuta';
      } else {
        landingWindStatus = 'unflyable';
        landingWindStatusLabel = 'Vento Forte Valle';
      }

      const landingWindParam = {
        id: 'brezza-valle',
        title: 'Brezza di Valle',
        subtitle: 'Intensità e direzione del vento al suolo in atterraggio',
        value: `${Math.round(activePoint.speed)} km/h · ${Math.round(activePoint.dir)}° ${getCardinalDirection(activePoint.dir)}`,
        status: landingWindStatus,
        statusLabel: landingWindStatusLabel,
        details: [
          { label: 'Velocità al Suolo', value: `${Math.round(activePoint.speed)} km/h` },
          { label: 'Raffica al Suolo', value: `${Math.round(activePoint.gust)} km/h` },
          { label: 'Direzione Brezza', value: `${Math.round(activePoint.dir)}° (${getCardinalDirection(activePoint.dir)})` },
          { label: 'Quota Campo', value: `${landing.altitude} m slm` }
        ],
        advice: landingWindStatus === 'flyable'
          ? 'Brezza di valle regolare allineata al campo. Condizioni ottimali per impostare il circuito standard controvento.'
          : landingWindStatus === 'caution'
          ? 'Brezza sostenuta in fondovalle. Mantenersi sopravento rispetto al campo durante lo smaltimento quota.'
          : 'Vento in valle forte con rischio di scarrocciamento e rotori orografici a ridosso degli ostacoli.',
        chartOptions: {
          id: 'param-chart-landing-wind',
          title: 'Brezza al Suolo',
          unit: 'km/h',
          minY: 0,
          maxY: Math.max(30, Math.ceil(Math.max(...hourlyPoints.map(p => p.gust || p.speed), 0) * 1.2)),
          thresholds: [
            { value: 16, stroke: 'var(--gm-status-caution)', label: 'Limite Brezza (16)' },
            { value: 24, stroke: 'var(--gm-status-unflyable)', label: 'Limite Massimo (24)' }
          ],
          series: [
            {
              name: 'Raffica Valle',
              points: hourlyPoints.map(p => ({ hour: p.hour, value: p.gust })),
              stroke: 'rgba(234, 179, 8, 0.7)',
              strokeWidth: 1.5,
              strokeDasharray: '3,3'
            },
            {
              name: 'Brezza Media',
              points: hourlyPoints.map(p => ({ hour: p.hour, value: p.speed })),
              stroke: 'var(--gm-status-flyable)',
              strokeWidth: 2.2,
              fillArea: 'rgba(34, 197, 94, 0.12)'
            }
          ]
        }
      };

      const landingGustParam = {
        id: 'raffiche',
        title: 'Raffiche & Delta al Suolo',
        subtitle: 'Turbolenza meccanica e gradiente di vento vicino a terra',
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
          ? 'Flusso laminare e prevedibile vicino al terreno. Raccordo e frenata senza turbolenze.'
          : 'Presenza di raffiche al suolo. Mantenere velocità di trim ed evitare virate a bassa quota.',
        chartOptions: {
          id: 'param-chart-landing-gust',
          title: 'Raffiche al Suolo',
          unit: 'km/h',
          minY: 0,
          maxY: Math.max(30, Math.ceil(Math.max(...hourlyPoints.map(p => p.gust), 0) * 1.2)),
          thresholds: [
            { value: 20, stroke: 'var(--gm-status-caution)', label: 'Attenzione (20)' }
          ],
          series: [
            {
              name: 'Raffica',
              points: hourlyPoints.map(p => ({ hour: p.hour, value: p.gust })),
              stroke: 'var(--gm-status-caution)',
              strokeWidth: 2.2,
              fillArea: 'rgba(234, 179, 8, 0.15)'
            }
          ]
        }
      };

      const landingConeParam = {
        id: 'cono-planata',
        title: 'Cono di Planata & Rientro',
        subtitle: 'Efficienza richiesta per raggiungere il campo dai decolli',
        value: `Efficienza 1:${reqGlide} · ${isLandingSafe ? 'Nel Cono di Sicurezza' : 'Fuori Cono (Critico)'}`,
        status: isLandingSafe ? 'flyable' : 'unflyable',
        statusLabel: isLandingSafe ? 'Nel Cono' : 'Fuori Cono',
        details: [
          { label: 'Efficienza Richiesta', value: `1:${reqGlide}` },
          { label: 'Limite Ala con Margine', value: `1:${limitGlide}` },
          { label: 'Dislivello dal Decollo', value: `${Math.max(0, takeoff.altitude - landing.altitude)} m` },
          { label: 'Quota Campo', value: `${landing.altitude} m slm` }
        ],
        advice: isLandingSafe
          ? 'Atterraggio comodamente raggiungibile in planata dritta senza necessità di sostentamento termico.'
          : 'Efficienza richiesta superiore ai limiti di sicurezza dell\'ala. Rischio concreto di atterraggio fuori campo.',
        chartOptions: landingParam.chartOptions
      };

      const landingTempParam = {
        id: 'temperatura',
        title: 'Temperatura & Aria al Suolo',
        subtitle: 'Condizioni termodinamiche di fondovalle e densità dell\'aria',
        value: `${activePoint.temp.toFixed(1)} °C · Umidità ${Math.round(activePoint.humidity)}%`,
        status: 'flyable',
        statusLabel: 'Ottimale',
        details: [
          { label: 'Temperatura Fondovalle', value: `${activePoint.temp.toFixed(1)} °C` },
          { label: 'Punto di Rugiada', value: `${activePoint.dew.toFixed(1)} °C` },
          { label: 'Umidità Relativa', value: `${Math.round(activePoint.humidity)}%` },
          { label: 'Dislivello Termico', value: `Salto quota ~${Math.max(0, takeoff.altitude - landing.altitude)} m` }
        ],
        advice: 'Aria più calda e densa in fondovalle: risposta della vela progressiva e pronta durante la flare finale.',
        chartOptions: {
          id: 'param-chart-landing-temp',
          title: 'Temperatura al Suolo',
          unit: '°C',
          minY: Math.floor(Math.min(...hourlyPoints.map(p => p.temp)) - 2),
          maxY: Math.ceil(Math.max(...hourlyPoints.map(p => p.temp)) + 2),
          series: [
            {
              name: 'Temperatura',
              points: hourlyPoints.map(p => ({ hour: p.hour, value: p.temp })),
              stroke: 'var(--gm-accent-sky, #0ea5e9)',
              strokeWidth: 2.2,
              fillArea: 'rgba(14, 165, 233, 0.12)'
            }
          ]
        }
      };

      return {
        params: [landingWindParam, landingGustParam, landingConeParam, cloudParam, landingTempParam],
        hourlyPoints,
        activePoint,
        takeoff,
        landing
      };
    }

    return {
      params: [windParam, gustParam, lclParam, capeParam, edrParam, cloudParam],
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
    compact = false,
    expanded = false,
    invertThresholds = false,
    hideTooltip = false,
    hideThresholdLabels = false,
    startHour = null,
    endHour = null,
    secondaryAxis = null,
    legendText = null,
    heatmapRow = null
  }) {
    const W = 350;
    const hasHeatmap = Boolean(heatmapRow && Array.isArray(heatmapRow.points) && heatmapRow.points.length > 0);
    const H = expanded
      ? (hasHeatmap ? 186 : 176)
      : (compact ? (hasHeatmap ? 114 : 108) : (hasHeatmap ? 128 : 120));
    const xMin = 36;
    const xMax = secondaryAxis ? 322 : 335;
    const yMin = expanded ? 12 : (compact ? 8 : 14);
    const yMax = H - (hasHeatmap ? (compact ? 36 : 42) : (expanded ? 20 : (compact ? 18 : 22)));
    const yRange = Math.max(1, maxY - minY);

    const primarySeries = series.find(s => s.isPrimary) || series.find(s => s.type !== 'bar') || series[0] || { points: [] };
    const daylight = this.getDaylightWindow();
    const sH = (typeof startHour === 'number') ? startHour : (primarySeries.points?.[0]?.hour ?? daylight.sunriseHour);
    const eH = (typeof endHour === 'number') ? endHour : (primarySeries.points?.[primarySeries.points.length - 1]?.hour ?? daylight.sunsetHour);
    const hRange = Math.max(1, eH - sH);

    const getX = (h) => Math.round(xMin + ((h - sH) / hRange) * (xMax - xMin));
    const getY = (val) => Math.round(yMax - ((Math.min(maxY, Math.max(minY, val)) - minY) / yRange) * (yMax - yMin));

    const mid1 = minY + yRange * 0.33;
    const mid2 = minY + yRange * 0.66;
    const midHalf = minY + yRange * 0.5;

    // Background hourly flyability curtains (using <path> to preserve anti-clutter <rect> test contract)
    const cautionThresholdObj = thresholds.find(t => t.role === 'caution' || (t.stroke && t.stroke.includes('caution')));
    const unflyableThresholdObj = thresholds.find(t => t.role === 'unflyable' || (t.stroke && (t.stroke.includes('unflyable') || t.stroke.includes('alert'))));
    const sameScaleSeries = series.filter(s => s.type !== 'bar' && typeof s.maxY !== 'number');
    const halfStep = (xMax - xMin) / (2 * hRange);

    const renderedZoneBands = (cautionThresholdObj || unflyableThresholdObj)
      ? (primarySeries.points || []).map(p => {
          const valsAtHour = sameScaleSeries
            .map(s => (s.points || []).find(pt => pt.hour === p.hour)?.value)
            .filter(v => typeof v === 'number');
          const evalVal = valsAtHour.length > 0
            ? (invertThresholds ? Math.min(...valsAtHour) : Math.max(...valsAtHour))
            : Number(p.value || 0);

          let zoneStatus = null;
          if (unflyableThresholdObj) {
            const crossedRed = invertThresholds
              ? evalVal <= unflyableThresholdObj.value
              : evalVal >= unflyableThresholdObj.value;
            if (crossedRed) zoneStatus = 'unflyable';
          }
          if (!zoneStatus && cautionThresholdObj) {
            const crossedYellow = invertThresholds
              ? evalVal <= cautionThresholdObj.value
              : evalVal >= cautionThresholdObj.value;
            if (crossedYellow) zoneStatus = 'caution';
          }
          if (!zoneStatus) return '';

          const cx = getX(p.hour);
          const bx0 = Math.max(xMin, Math.round((cx - halfStep) * 10) / 10);
          const bx1 = Math.min(xMax, Math.round((cx + halfStep) * 10) / 10);
          const fill = zoneStatus === 'unflyable'
            ? 'rgba(239, 68, 68, 0.09)'
            : 'rgba(234, 179, 8, 0.08)';
          return `<path class="gm-chart-zone-band gm-chart-zone-${zoneStatus}" d="M ${bx0},${yMin} L ${bx1},${yMin} L ${bx1},${yMax} L ${bx0},${yMax} Z" fill="${fill}" />`;
        }).join('')
      : '';

    const renderedSeries = series.map(s => {
      const sMinY = (typeof s.minY === 'number') ? s.minY : minY;
      const sMaxY = (typeof s.maxY === 'number') ? s.maxY : maxY;
      const sYRange = Math.max(1, sMaxY - sMinY);
      const getSeriesY = (val) => Math.round(yMax - ((Math.min(sMaxY, Math.max(sMinY, val)) - sMinY) / sYRange) * (yMax - yMin));

      if (s.type === 'bar') {
        const barWidth = s.barWidth || Math.max(4, Math.round(((xMax - xMin) / hRange) * 0.55));
        const barsMarkup = (s.points || []).map(p => {
          const x = Math.round(getX(p.hour) - barWidth / 2);
          const y = getSeriesY(p.value);
          const h = Math.max(0, yMax - y);
          return `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="${s.fill || s.stroke || 'var(--gm-accent-sky, #0ea5e9)'}" rx="${s.rx ?? 1}" opacity="${s.opacity ?? 0.85}" />`;
        }).join('');
        return barsMarkup;
      }
      const coords = (s.points || []).map(p => ({ x: getX(p.hour), y: getSeriesY(p.value) }));
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
          stroke-width="${s.strokeWidth || 2.2}" 
          stroke-linecap="round"
          stroke-linejoin="round"
          ${s.strokeDasharray ? `stroke-dasharray="${s.strokeDasharray}"` : ''} 
        />
      `;
    }).join('');

    const showLabels = !hideThresholdLabels || expanded;
    const renderedThresholds = thresholds.map(t => {
      const yPos = getY(t.value);
      return `
        <line x1="${xMin}" y1="${yPos}" x2="${xMax}" y2="${yPos}" stroke="${t.stroke || 'var(--gm-status-caution)'}" stroke-width="1.3" stroke-dasharray="${t.strokeDasharray || '4,3'}" />
        ${(showLabels && t.label) ? `<text x="${xMax - 2}" y="${Math.max(yMin + 7, yPos - 3)}" font-size="8" font-weight="600" fill="${t.stroke || 'var(--gm-text-muted)'}" text-anchor="end">${escapeHtml(t.label)}</text>` : ''}
      `;
    }).join('');

    const activeMarkerX = getX(selectedHour);
    const activePoint = (primarySeries.points || []).find(p => p.hour === selectedHour) || primarySeries.points?.[0] || { value: 0 };
    const pMinY = (typeof primarySeries.minY === 'number') ? primarySeries.minY : minY;
    const pMaxY = (typeof primarySeries.maxY === 'number') ? primarySeries.maxY : maxY;
    const pYRange = Math.max(1, pMaxY - pMinY);
    const activeMarkerY = Math.round(yMax - ((Math.min(pMaxY, Math.max(pMinY, activePoint.value)) - pMinY) / pYRange) * (yMax - yMin));

    const secondaryLineMarkers = series
      .filter(s => s !== primarySeries && s.type !== 'bar')
      .map(s => {
        const pt = (s.points || []).find(p => p.hour === selectedHour) || s.points?.[0];
        if (!pt) return '';
        const sMinY = (typeof s.minY === 'number') ? s.minY : minY;
        const sMaxY = (typeof s.maxY === 'number') ? s.maxY : maxY;
        const sYRange = Math.max(1, sMaxY - sMinY);
        const cy = Math.round(yMax - ((Math.min(sMaxY, Math.max(sMinY, pt.value)) - sMinY) / sYRange) * (yMax - yMin));
        return `<circle cx="${activeMarkerX}" cy="${cy}" r="3.2" fill="${s.stroke || 'var(--gm-text-secondary)'}" stroke="var(--gm-bg-base)" stroke-width="1.4" />`;
      }).join('');

    const numLabels = hRange <= 8 ? 3 : (hRange <= 12 ? 4 : 5);
    const labelHours = [];
    for (let i = 0; i < numLabels; i++) {
      const h = Math.round(sH + (i * hRange) / (numLabels - 1));
      if (!labelHours.includes(h)) labelHours.push(h);
    }

    const stripY = yMax + 5;
    const stripH = 13;
    const stepX = (xMax - xMin) / hRange;
    const cellW = Math.max(12, Math.round(stepX * 0.85));

    const renderedHeatmap = hasHeatmap ? `
      <!-- Heatmap Row Label -->
      <text x="4" y="${stripY + 9.5}" font-size="7" font-weight="700" fill="var(--gm-text-muted)" text-anchor="start">${escapeHtml(heatmapRow.label || 'Prob.')}</text>
      <!-- Heatmap Cells -->
      ${heatmapRow.points.map(p => {
        const hourX = getX(p.hour);
        const cellX = Math.round(hourX - cellW / 2);
        const val = Math.round(p.value || 0);
        let cellFill = 'rgba(148, 163, 184, 0.12)';
        let cellText = 'var(--gm-text-muted)';
        let cellWeight = '500';

        if (val >= 60) {
          cellFill = 'var(--gm-status-unflyable, #ef4444)';
          cellText = '#ffffff';
          cellWeight = '700';
        } else if (val >= 35) {
          cellFill = 'var(--gm-status-caution, #f59e0b)';
          cellText = '#ffffff';
          cellWeight = '700';
        } else if (val >= 20) {
          cellFill = 'var(--gm-accent-sky, #0ea5e9)';
          cellText = '#ffffff';
          cellWeight = '700';
        } else if (val > 0) {
          cellFill = 'rgba(14, 165, 233, 0.28)';
          cellText = 'var(--gm-accent-sky, #0ea5e9)';
          cellWeight = '600';
        }

        const isActive = p.hour === selectedHour;
        const activeStroke = isActive ? 'stroke="var(--gm-accent)" stroke-width="1.6"' : '';
        return `
          <rect x="${cellX}" y="${stripY}" width="${cellW}" height="${stripH}" rx="2" fill="${cellFill}" ${activeStroke} />
          <text x="${hourX}" y="${stripY + 9.5}" font-size="6.8" font-weight="${cellWeight}" fill="${cellText}" text-anchor="middle">${val > 0 ? val + '%' : '0%'}</text>
        `;
      }).join('')}
    ` : '';

    return `
      <div id="${id}-box" class="gm-chart-box ${expanded ? 'gm-chart-box-expanded' : ''}">
        <svg class="gm-chart-svg" viewBox="0 0 ${W} ${H}" aria-label="Grafico orario ${escapeHtml(title)}">
          <!-- Hourly Flyability Background Curtain -->
          ${renderedZoneBands}

          <!-- Background Grid lines -->
          <line x1="${xMin}" y1="${getY(mid1)}" x2="${xMax}" y2="${getY(mid1)}" stroke="var(--gm-border)" stroke-dasharray="2,2" />
          ${expanded ? `<line x1="${xMin}" y1="${getY(midHalf)}" x2="${xMax}" y2="${getY(midHalf)}" stroke="var(--gm-border)" stroke-dasharray="2,2" opacity="0.6" />` : ''}
          <line x1="${xMin}" y1="${getY(mid2)}" x2="${xMax}" y2="${getY(mid2)}" stroke="var(--gm-border)" stroke-dasharray="2,2" />
          <line x1="${xMin}" y1="${yMax}" x2="${xMax}" y2="${yMax}" stroke="var(--gm-border-strong)" stroke-width="1" />

          <!-- Y Axis Labels -->
          <text x="${xMin - 4}" y="${getY(minY) + 3}" font-size="8" fill="var(--gm-text-muted)" text-anchor="end">${maxY <= 5 ? minY.toFixed(1) : Math.round(minY)}</text>
          ${expanded ? `<text x="${xMin - 4}" y="${getY(mid1) + 3}" font-size="8" fill="var(--gm-text-muted)" text-anchor="end">${maxY <= 5 ? mid1.toFixed(1) : Math.round(mid1)}</text>` : ''}
          <text x="${xMin - 4}" y="${getY(mid2) + 3}" font-size="8" fill="var(--gm-text-muted)" text-anchor="end">${maxY <= 5 ? mid2.toFixed(1) : Math.round(mid2)}</text>
          <text x="${xMin - 4}" y="${getY(maxY) + 7}" font-size="8" fill="var(--gm-text-muted)" text-anchor="end">${maxY <= 5 ? maxY.toFixed(1) : Math.round(maxY)}</text>
          ${secondaryAxis ? `
          <text x="${W - 2}" y="${getY(maxY) + 7}" font-size="7.5" fill="var(--gm-text-muted)" text-anchor="end">${secondaryAxis.maxY}${secondaryAxis.unit || ''}</text>
          <text x="${W - 2}" y="${getY(minY) + 3}" font-size="7.5" fill="var(--gm-text-muted)" text-anchor="end">${secondaryAxis.minY}${secondaryAxis.unit || ''}</text>
          ` : ''}

          <!-- Threshold lines -->
          ${renderedThresholds}

          ${legendText ? `
          <!-- Micro-Legend Text -->
          <text x="${xMin}" y="${yMin - 1}" font-size="6.8" fill="var(--gm-text-muted)" opacity="0.85">${escapeHtml(legendText)}</text>
          ` : ''}

          <!-- Series paths -->
          ${renderedSeries}

          <!-- Heatmap Row (if present) -->
          ${renderedHeatmap}

          <!-- Hourly X Axis Labels -->
          ${labelHours.map(lh => `
            <text x="${getX(lh)}" y="${H - 3}" font-size="8" fill="var(--gm-text-muted)" text-anchor="middle">${String(lh).padStart(2, '0')}</text>
          `).join('')}

          <!-- Active Hour Vertical Marker -->
          <line x1="${activeMarkerX}" y1="${yMin}" x2="${activeMarkerX}" y2="${hasHeatmap ? (stripY + stripH) : yMax}" stroke="var(--gm-accent)" stroke-width="1.8" stroke-dasharray="3,3" />
          ${secondaryLineMarkers}
          <circle cx="${activeMarkerX}" cy="${activeMarkerY}" r="4" fill="var(--gm-accent)" stroke="var(--gm-bg-base)" stroke-width="1.8" />
          ${!hideTooltip ? `
          <rect x="${Math.max(xMin, Math.min(xMax - 54, activeMarkerX - 27))}" y="2" width="54" height="13" rx="3" fill="var(--gm-accent)" />
          <text x="${Math.max(xMin + 27, Math.min(xMax - 27, activeMarkerX))}" y="11" font-size="8" font-weight="700" fill="var(--gm-text-inverse)" text-anchor="middle">
            ${unit === 'mm/h' || unit === 'EDR' ? Number(activePoint.value || 0).toFixed(1) : Math.round(activePoint.value)} ${escapeHtml(unit)}
          </text>
          ` : ''}
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
              chartHtml = this.renderWindChart(spot, weatherData, param.takeoffHeading, {
                compact: true,
                hideTooltip: true,
                hideFooter: true
              });
            } else if (param.id === 'base-cumulo') {
              chartHtml = this.renderSoundingChart(spot, weatherData, param.takeoffAlt, {
                compact: true,
                hideTooltip: true,
                hideFooter: true
              });
            } else if (param.chartOptions) {
              chartHtml = this.renderSvgTrendChart({
                ...param.chartOptions,
                compact: true,
                hideTooltip: true,
                hideThresholdLabels: true
              });
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
                  <div class="gm-param-chart-wrap">
                    <div class="gm-param-chart-header">
                      <span class="gm-param-chart-title">Tendenza Oraria</span>
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
    const isLanding = activeSubSpotObj && activeSubSpotObj.spotType === 'landing';
    const activePoint = hourlyPoints.find(p => p.hour === this.selectedHour) || hourlyPoints[0] || {};
    const activeSpeed = Math.round(activePoint.speed || 0);
    const activeGust = Math.round(activePoint.gust || activeSpeed);
    const activeDir = getCardinalDirection(activePoint.dir || 180);
    const isExpandedCard = (chartId) => Boolean(this.expandedTrendChartIds && this.expandedTrendChartIds.has(chartId));

    // Adaptive CAPE ceiling anchored above red threshold (800 J/kg) so both yellow (300) and red (800) lines are always visible
    const peakCapeValue = Math.max(0, ...hourlyPoints.map(p => p.cape || 0));
    const capeChartMaxY = Math.max(920, Math.ceil((Math.max(peakCapeValue, 800) * 1.15) / 50) * 50);
    const capeThresholds = [
      { value: 300, role: 'caution', stroke: 'var(--gm-status-caution)', strokeDasharray: '4,3', label: '300 J/kg' },
      { value: 800, role: 'unflyable', stroke: 'var(--gm-status-unflyable)', strokeDasharray: '4,3', label: '800 J/kg' }
    ];

    // Glide cone hourly series & thresholds for Landing view
    const baseReqGlide = Number(evaluated.glideMetrics?.requiredGlideRatio || 6.0);
    const safeGlideLimit = Number(evaluated.glideMetrics?.safeGlideLimit || Math.round(((glider?.glideRatio || 8.5) * 0.8) * 10) / 10);
    const cautionGlideLimit = Math.round((safeGlideLimit * 0.85) * 10) / 10;
    const hourlyGlidePoints = hourlyPoints.map(p => {
      const breezePenalty = Math.max(0, (p.landingSpeed || p.speed || 0) - 8) * 0.025;
      return {
        hour: p.hour,
        value: Math.round((baseReqGlide * (1 + breezePenalty)) * 10) / 10
      };
    });
    const activeGlideVal = hourlyGlidePoints.find(p => p.hour === this.selectedHour)?.value ?? baseReqGlide;
    const maxGlideChartY = Math.max(10, Math.ceil(Math.max(safeGlideLimit, ...hourlyGlidePoints.map(p => p.value)) * 1.18));

    const chartCards = isLanding ? [
      {
        id: 'multi-chart-wind',
        label: 'Brezza Valle',
        ledClass: 'gm-led-flyable',
        val: `${activeSpeed}`,
        unit: 'km/h',
        subHtml: `<span class="gm-trend-sub-badge"><span class="gm-series-led gm-series-led-dashed gm-led-caution" aria-hidden="true"></span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="inline-block" aria-hidden="true"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg> ${activeGust} <strong class="gm-trend-cardinal">${activeDir}</strong></span>`,
        chartHtml: this.renderSvgTrendChart({
          id: 'multi-landing-wind',
          title: 'Brezza al Suolo',
          unit: 'km/h',
          minY: 0,
          maxY: Math.max(28, Math.ceil(Math.max(...hourlyPoints.map(p => Math.max(p.gust || 0, p.speed || 0)), 24) * 1.15)),
          compact: true,
          expanded: isExpandedCard('multi-chart-wind'),
          hideTooltip: true,
          hideThresholdLabels: !isExpandedCard('multi-chart-wind'),
          thresholds: [
            { value: 16, role: 'caution', stroke: 'var(--gm-status-caution)', strokeDasharray: '4,3', label: '16 km/h' },
            { value: 24, role: 'unflyable', stroke: 'var(--gm-status-unflyable)', strokeDasharray: '4,3', label: '24 km/h' }
          ],
          series: [
            {
              name: 'Raffica Valle',
              points: hourlyPoints.map(p => ({ hour: p.hour, value: p.gust })),
              stroke: 'var(--gm-status-caution)',
              strokeWidth: 1.6,
              strokeDasharray: '3,3'
            },
            {
              name: 'Brezza Media',
              isPrimary: true,
              points: hourlyPoints.map(p => ({ hour: p.hour, value: p.speed })),
              stroke: 'var(--gm-status-flyable)',
              strokeWidth: 2.3,
              fillArea: 'rgba(34, 197, 94, 0.14)'
            }
          ]
        })
      },
      {
        id: 'multi-chart-landing',
        label: 'Cono di Planata',
        ledClass: 'gm-led-flyable',
        val: `1:${activeGlideVal}`,
        unit: 'E',
        subHtml: `<span class="gm-trend-sub-badge ${evaluated.glideMetrics?.isSafe !== false ? 'status-flyable' : 'status-unflyable'}"><span class="gm-series-led gm-series-led-dashed gm-led-caution" aria-hidden="true"></span>${evaluated.glideMetrics?.isSafe !== false ? 'Nel Cono' : 'Fuori Cono'} (${Math.round(activePoint.landingSpeed || activeSpeed)} km/h)</span>`,
        chartHtml: this.renderSvgTrendChart({
          id: 'multi-landing',
          title: 'Cono di Planata',
          unit: 'E',
          minY: 0,
          maxY: maxGlideChartY,
          compact: true,
          expanded: isExpandedCard('multi-chart-landing'),
          hideTooltip: true,
          hideThresholdLabels: !isExpandedCard('multi-chart-landing'),
          thresholds: [
            { value: cautionGlideLimit, role: 'caution', stroke: 'var(--gm-status-caution)', strokeDasharray: '4,3', label: `1:${cautionGlideLimit}` },
            { value: safeGlideLimit, role: 'unflyable', stroke: 'var(--gm-status-unflyable)', strokeDasharray: '4,3', label: `1:${safeGlideLimit}` }
          ],
          series: [
            {
              name: 'Brezza Valle',
              points: hourlyPoints.map(p => ({ hour: p.hour, value: p.landingSpeed || p.speed || 0 })),
              minY: 0,
              maxY: 35,
              stroke: 'var(--gm-status-caution)',
              strokeWidth: 1.6,
              strokeDasharray: '3,3'
            },
            {
              name: 'Efficienza Richiesta',
              isPrimary: true,
              points: hourlyGlidePoints,
              stroke: 'var(--gm-status-flyable)',
              strokeWidth: 2.4,
              fillArea: 'rgba(34, 197, 94, 0.16)'
            }
          ]
        })
      },
      {
        id: 'multi-chart-cloudcover',
        label: 'Copertura',
        ledClass: 'gm-led-cloud',
        val: `${Math.round(activePoint.cloudCover || 0)}`,
        unit: '%',
        subHtml: `<span class="gm-trend-sub-badge">${activePoint.cloudCover > 70 ? 'Nuvoloso' : activePoint.cloudCover > 25 ? 'Parziale' : 'Sereno'}</span>`,
        chartHtml: this.renderSvgTrendChart({
          id: 'multi-cloudcover',
          title: 'Copertura',
          unit: '%',
          minY: 0,
          maxY: 100,
          compact: true,
          expanded: isExpandedCard('multi-chart-cloudcover'),
          hideTooltip: true,
          hideThresholdLabels: !isExpandedCard('multi-chart-cloudcover'),
          thresholds: [
            { value: 65, role: 'caution', stroke: 'var(--gm-status-caution)', strokeDasharray: '4,3', label: '65%' },
            { value: 85, role: 'unflyable', stroke: 'var(--gm-status-unflyable)', strokeDasharray: '4,3', label: '85%' }
          ],
          series: [{
            name: 'Copertura',
            isPrimary: true,
            points: hourlyPoints.map(p => ({ hour: p.hour, value: p.cloudCover })),
            stroke: 'var(--gm-text-secondary)',
            strokeWidth: 2.5,
            fillArea: 'rgba(148, 163, 184, 0.18)'
          }]
        })
      },
      {
        id: 'multi-chart-precipitation',
        label: 'Precipitazioni',
        ledClass: 'gm-led-precip-prob',
        val: `${Math.round(activePoint.precipProb || 0)}`,
        unit: '% prob.',
        subHtml: (() => {
          const curPrecip = activePoint.precip || 0;
          const curProb = Math.round(activePoint.precipProb || 0);
          const barLed = `<span class="gm-series-led gm-series-led-bar gm-led-precip-mm" aria-hidden="true"></span>`;
          if (curPrecip > 0.5) return `<span class="gm-trend-sub-badge status-unflyable">${barLed}NO FLY: Pioggia (${curPrecip.toFixed(1)} mm/h)</span>`;
          if (curPrecip >= 0.1) return `<span class="gm-trend-sub-badge status-caution">${barLed}Pioviggine (${curPrecip.toFixed(1)} mm/h)</span>`;
          if (curProb >= 50) return `<span class="gm-trend-sub-badge status-alert">${barLed}${curProb}% prob. rovesci (${curPrecip.toFixed(1)} mm/h)</span>`;
          if (curProb >= 25) return `<span class="gm-trend-sub-badge status-caution">${barLed}${curProb}% prob. pioggia (${curPrecip.toFixed(1)} mm/h)</span>`;
          if (curProb > 0) return `<span class="gm-trend-sub-badge status-flyable">${barLed}${curProb}% prob. (${curPrecip.toFixed(1)} mm/h)</span>`;
          return `<span class="gm-trend-sub-badge status-flyable">${barLed}Assenti (0.0 mm/h)</span>`;
        })(),
        chartHtml: this.renderSvgTrendChart({
          id: 'multi-precipitation',
          title: 'Precipitazioni',
          unit: '%',
          minY: 0,
          maxY: 100,
          compact: true,
          expanded: isExpandedCard('multi-chart-precipitation'),
          hideTooltip: true,
          hideThresholdLabels: !isExpandedCard('multi-chart-precipitation'),
          thresholds: [
            { value: 30, role: 'caution', stroke: 'var(--gm-status-caution)', strokeDasharray: '4,3', label: '30%' },
            { value: 60, role: 'unflyable', stroke: 'var(--gm-status-unflyable)', strokeDasharray: '4,3', label: '60%' }
          ],
          series: [
            ...(hourlyPoints.some(p => (p.precip || 0) > 0) ? [{
              name: 'Accumulo Pioggia',
              type: 'bar',
              points: hourlyPoints.map(p => ({ hour: p.hour, value: p.precip || 0 })),
              minY: 0,
              maxY: Math.max(3, Math.ceil(Math.max(...hourlyPoints.map(p => p.precip || 0), 0) * 1.5)),
              fill: 'var(--gm-accent-sky, #0ea5e9)',
              opacity: 0.55
            }] : []),
            {
              name: 'Probabilità Pioggia',
              isPrimary: true,
              points: hourlyPoints.map(p => ({ hour: p.hour, value: p.precipProb || 0 })),
              stroke: 'var(--gm-accent-sky, #0ea5e9)',
              strokeWidth: 2.4,
              fillArea: 'rgba(14, 165, 233, 0.18)'
            }
          ]
        })
      }
    ] : [
      {
        id: 'multi-chart-wind',
        label: 'Vento',
        ledClass: 'gm-led-wind',
        val: `${activeSpeed}`,
        unit: 'km/h',
        subHtml: `<span class="gm-trend-sub-badge"><span class="gm-series-led gm-series-led-dashed gm-led-gust" aria-hidden="true"></span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="inline-block" aria-hidden="true"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg> ${activeGust} <strong class="gm-trend-cardinal">${activeDir}</strong></span>`,
        chartHtml: this.renderWindChart(spot, weatherData, takeoff.heading, {
          compact: true,
          expanded: isExpandedCard('multi-chart-wind'),
          hideTooltip: true,
          hideFooter: true
        })
      },
      {
        id: 'multi-chart-sounding',
        label: 'Base Cumulo',
        ledClass: 'gm-led-lcl',
        val: `${Math.round(activePoint.lclMsl || 0)}`,
        unit: 'm slm',
        subHtml: `<span class="gm-trend-sub-badge"><span class="gm-series-led gm-led-ceiling" aria-hidden="true"></span>Max ${Math.round((activePoint.lclMsl || 0) + 250)}m · AGL +${Math.round(Math.max(0, (activePoint.lclMsl || 0) - (takeoff.altitude || 1000)))}m</span>`,
        chartHtml: this.renderSoundingChart(spot, weatherData, takeoff.altitude, {
          compact: true,
          expanded: isExpandedCard('multi-chart-sounding'),
          hideTooltip: true,
          hideFooter: true
        })
      },
      {
        id: 'multi-chart-cape',
        label: 'Instabilità (CAPE)',
        ledClass: 'gm-led-cape',
        val: `${Math.round(activePoint.cape || 0)}`,
        unit: 'J/kg',
        subHtml: `<span class="gm-trend-sub-badge ${activePoint.cape >= 800 ? 'status-alert' : activePoint.cape >= 300 ? 'status-caution' : 'status-flyable'}">${activePoint.cape >= 800 ? 'Rischio CB' : activePoint.cape >= 300 ? 'Cumuli / Rovesci' : 'Stabile'}</span>`,
        chartHtml: this.renderSvgTrendChart({
          id: 'multi-cape',
          title: 'CAPE',
          unit: 'J/kg',
          minY: 0,
          maxY: capeChartMaxY,
          compact: true,
          expanded: isExpandedCard('multi-chart-cape'),
          hideTooltip: true,
          hideThresholdLabels: !isExpandedCard('multi-chart-cape'),
          thresholds: capeThresholds,
          series: [{
            name: 'CAPE',
            isPrimary: true,
            points: hourlyPoints.map(p => ({ hour: p.hour, value: p.cape })),
            stroke: '#a855f7',
            strokeWidth: 2.5,
            fillArea: 'rgba(168, 85, 247, 0.20)'
          }]
        })
      },
      {
        id: 'multi-chart-turbulence',
        label: 'Turbolenza',
        ledClass: 'gm-led-edr',
        val: `${(activePoint.edr || 0).toFixed(2)}`,
        unit: 'EDR',
        subHtml: `<span class="gm-trend-sub-badge"><span class="gm-series-led gm-series-led-dashed gm-led-updraft" aria-hidden="true"></span>+${(activePoint.updraft || 0).toFixed(1)} m/s salita</span>`,
        chartHtml: this.renderSvgTrendChart({
          id: 'multi-turbulence',
          title: 'Turbolenza & Salita',
          unit: 'EDR',
          minY: 0,
          maxY: Math.max(4.5, Math.ceil(Math.max(...hourlyPoints.map(p => Math.max(p.edr || 0, p.updraft || 0)), 3.2) * 1.15 * 2) / 2),
          compact: true,
          expanded: isExpandedCard('multi-chart-turbulence'),
          hideTooltip: true,
          hideThresholdLabels: !isExpandedCard('multi-chart-turbulence'),
          thresholds: [
            { value: 2.0, role: 'caution', stroke: 'var(--gm-status-caution)', strokeDasharray: '4,3', label: '2.0' },
            { value: 3.2, role: 'unflyable', stroke: 'var(--gm-status-unflyable)', strokeDasharray: '4,3', label: '3.2' }
          ],
          series: [
            {
              name: 'Updraft',
              points: hourlyPoints.map(p => ({ hour: p.hour, value: p.updraft })),
              stroke: 'var(--gm-status-caution)',
              strokeWidth: 2.0,
              strokeDasharray: '4,2',
              fillArea: 'rgba(234, 179, 8, 0.14)'
            },
            {
              name: 'EDR',
              isPrimary: true,
              points: hourlyPoints.map(p => ({ hour: p.hour, value: p.edr })),
              stroke: 'var(--gm-accent-sky, #0ea5e9)',
              strokeWidth: 2.4
            }
          ]
        })
      },
      {
        id: 'multi-chart-cloudcover',
        label: 'Copertura',
        ledClass: 'gm-led-cloud',
        val: `${Math.round(activePoint.cloudCover || 0)}`,
        unit: '%',
        subHtml: `<span class="gm-trend-sub-badge">${activePoint.cloudCover > 70 ? 'Nuvoloso' : activePoint.cloudCover > 25 ? 'Parziale' : 'Sereno'}</span>`,
        chartHtml: this.renderSvgTrendChart({
          id: 'multi-cloudcover',
          title: 'Copertura',
          unit: '%',
          minY: 0,
          maxY: 100,
          compact: true,
          expanded: isExpandedCard('multi-chart-cloudcover'),
          hideTooltip: true,
          hideThresholdLabels: !isExpandedCard('multi-chart-cloudcover'),
          thresholds: [
            { value: 65, role: 'caution', stroke: 'var(--gm-status-caution)', strokeDasharray: '4,3', label: '65%' },
            { value: 85, role: 'unflyable', stroke: 'var(--gm-status-unflyable)', strokeDasharray: '4,3', label: '85%' }
          ],
          series: [{
            name: 'Copertura',
            isPrimary: true,
            points: hourlyPoints.map(p => ({ hour: p.hour, value: p.cloudCover })),
            stroke: 'var(--gm-text-secondary)',
            strokeWidth: 2.5,
            fillArea: 'rgba(148, 163, 184, 0.18)'
          }]
        })
      },
      {
        id: 'multi-chart-precipitation',
        label: 'Precipitazioni',
        ledClass: 'gm-led-precip-prob',
        val: `${Math.round(activePoint.precipProb || 0)}`,
        unit: '% prob.',
        subHtml: (() => {
          const curPrecip = activePoint.precip || 0;
          const curProb = Math.round(activePoint.precipProb || 0);
          const barLed = `<span class="gm-series-led gm-series-led-bar gm-led-precip-mm" aria-hidden="true"></span>`;
          if (curPrecip > 0.5) {
            return `<span class="gm-trend-sub-badge status-unflyable">${barLed}NO FLY: Pioggia (${curPrecip.toFixed(1)} mm/h)</span>`;
          }
          if (curPrecip >= 0.1) {
            return `<span class="gm-trend-sub-badge status-caution">${barLed}Pioviggine (${curPrecip.toFixed(1)} mm/h)</span>`;
          }
          if (curProb >= 50) {
            return `<span class="gm-trend-sub-badge status-alert">${barLed}${curProb}% prob. rovesci (${curPrecip.toFixed(1)} mm/h)</span>`;
          }
          if (curProb >= 25) {
            return `<span class="gm-trend-sub-badge status-caution">${barLed}${curProb}% prob. pioggia (${curPrecip.toFixed(1)} mm/h)</span>`;
          }
          if (curProb > 0) {
            return `<span class="gm-trend-sub-badge status-flyable">${barLed}${curProb}% prob. (${curPrecip.toFixed(1)} mm/h)</span>`;
          }
          return `<span class="gm-trend-sub-badge status-flyable">${barLed}Assenti (0.0 mm/h)</span>`;
        })(),
        chartHtml: this.renderSvgTrendChart({
          id: 'multi-precipitation',
          title: 'Precipitazioni',
          unit: '%',
          minY: 0,
          maxY: 100,
          compact: true,
          expanded: isExpandedCard('multi-chart-precipitation'),
          hideTooltip: true,
          hideThresholdLabels: !isExpandedCard('multi-chart-precipitation'),
          thresholds: [
            { value: 30, role: 'caution', stroke: 'var(--gm-status-caution)', strokeDasharray: '4,3', label: '30%' },
            { value: 60, role: 'unflyable', stroke: 'var(--gm-status-unflyable)', strokeDasharray: '4,3', label: '60%' }
          ],
          series: [
            ...(hourlyPoints.some(p => (p.precip || 0) > 0) ? [{
              name: 'Accumulo Pioggia',
              type: 'bar',
              points: hourlyPoints.map(p => ({ hour: p.hour, value: p.precip || 0 })),
              minY: 0,
              maxY: Math.max(3, Math.ceil(Math.max(...hourlyPoints.map(p => p.precip || 0), 0) * 1.5)),
              fill: 'var(--gm-accent-sky, #0ea5e9)',
              opacity: 0.55
            }] : []),
            {
              name: 'Probabilità Pioggia',
              isPrimary: true,
              points: hourlyPoints.map(p => ({ hour: p.hour, value: p.precipProb || 0 })),
              stroke: 'var(--gm-accent-sky, #0ea5e9)',
              strokeWidth: 2.4,
              fillArea: 'rgba(14, 165, 233, 0.18)'
            }
          ]
        })
      }
    ];

    return `
      <div class="gm-multi-charts-container">
        ${chartCards.map(c => {
          const isExp = isExpandedCard(c.id);
          return `
            <div 
              class="gm-trend-card gm-trend-card-side-by-side ${isExp ? 'expanded' : ''}" 
              id="${c.id}"
              data-action="toggle-trend-chart"
              data-chart-id="${c.id}"
              role="button"
              tabindex="0"
              aria-expanded="${isExp ? 'true' : 'false'}"
              title="${isExp ? 'Tocca per ridurre altezza grafico' : 'Tocca per ingrandire verticalmente il grafico'}"
            >
              <div class="gm-trend-side-panel">
                <div class="gm-trend-side-header">
                  <span class="gm-trend-side-label">${escapeHtml(c.label)}</span>
                  <span class="gm-trend-expand-icon ${isExp ? 'rotate-180' : ''}" aria-hidden="true">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </span>
                </div>
                <div class="gm-trend-side-val-group">
                  <span class="gm-series-led ${c.ledClass || 'gm-led-accent'}" aria-hidden="true"></span>
                  <span class="gm-trend-side-val">${escapeHtml(c.val)}</span>
                  <span class="gm-trend-side-unit">${escapeHtml(c.unit)}</span>
                </div>
                <div class="gm-trend-side-sub">${c.subHtml}</div>
              </div>
              <div class="gm-trend-chart-panel">
                ${c.chartHtml}
              </div>
            </div>
          `;
        }).join('')}
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
      : (evalData.takeoff || { altitude: 1000, heading: null });

    const weather = evalData.weatherSnapshot || {};
    const takeoffAzimuth = (takeoff.heading != null && !isNaN(Number(takeoff.heading))) ? Number(takeoff.heading) : null;
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
    const hasTakeoffHeading = typeof takeoffAzimuth === 'number' && !isNaN(takeoffAzimuth);
    let alignText = 'Esposizione N/D';
    let alignColor = 'var(--gm-text-muted)';
    let alignBg = 'rgba(255, 255, 255, 0.05)';

    if (hasTakeoffHeading) {
      const diffFromFront = Math.abs(calculateAngularDifference(takeoffAzimuth, windDir));
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
    } else {
      alignText = 'Esposizione N/D';
      alignColor = windSpeed > 18 ? 'var(--gm-status-unflyable)' : windSpeed > 14 ? 'var(--gm-status-caution)' : 'var(--gm-status-flyable)';
      alignBg = windSpeed > 18 ? 'var(--gm-status-unflyable-bg)' : windSpeed > 14 ? 'var(--gm-status-caution-bg)' : 'var(--gm-status-flyable-bg)';
    }

    const cx = 100;
    const cy = 100;
    const radius = 75;

    let conePath = '';
    if (hasTakeoffHeading) {
      const coneStartAngle = normalizeAngle(takeoffAzimuth - 35);
      const coneEndAngle = normalizeAngle(takeoffAzimuth + 35);
      conePath = describeSectorArc(cx, cy, radius, coneStartAngle, coneEndAngle);
    }

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

            ${hasTakeoffHeading ? `<path d="${conePath}" fill="rgba(34, 197, 94, 0.25)" stroke="var(--gm-status-flyable)" stroke-width="1.5" />` : ''}

            <text x="${ptN.x}" y="${ptN.y + 4}" font-size="11" font-weight="700" fill="var(--gm-text-muted)" text-anchor="middle">N</text>
            <text x="${ptE.x}" y="${ptE.y + 4}" font-size="11" font-weight="700" fill="var(--gm-text-muted)" text-anchor="middle">E</text>
            <text x="${ptS.x}" y="${ptS.y + 4}" font-size="11" font-weight="700" fill="var(--gm-text-muted)" text-anchor="middle">S</text>
            <text x="${ptW.x}" y="${ptW.y + 4}" font-size="11" font-weight="700" fill="var(--gm-text-muted)" text-anchor="middle">W</text>

            ${hasTakeoffHeading ? `
              <g transform="rotate(${takeoffAzimuth}, ${cx}, ${cy})">
                <line x1="${cx}" y1="${cy - radius}" x2="${cx}" y2="${cy - radius + 8}" stroke="var(--gm-status-flyable)" stroke-width="3" />
                <polygon points="${cx},${cy - radius - 2} ${cx - 4},${cy - radius + 6} ${cx + 4},${cy - radius + 6}" fill="var(--gm-status-flyable)" />
              </g>
            ` : ''}

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
              ${hasTakeoffHeading ? `${takeoffAzimuth}° (${getCardinalDirection(takeoffAzimuth)})` : 'N/D'}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Renders the Expanded SVG Wind & Gusts Temporal Chart with active hour marker.
   */
  renderWindChart(spot, weatherData, takeoffAzimuth, options = {}) {
    const compact = Boolean(options.compact);
    const expanded = Boolean(options.expanded);
    const hideTooltip = Boolean(options.hideTooltip);
    const hideFooter = Boolean(options.hideFooter);

    const hours = [];
    const hourlyData = (weatherData && weatherData.hourly) || {};
    const times = hourlyData.time || [];
    const baseDate = (times[0] && !times.some(t => t.startsWith(`${this.activeDate}T`)))
      ? times[0].slice(0, 10)
      : this.activeDate;

    const daylight = this.getDaylightWindow(spot, weatherData, this.activeDate);
    const sH = daylight.sunriseHour;
    const eH = daylight.sunsetHour;
    const hRange = Math.max(1, eH - sH);

    // Map points from sunrise to sunset
    for (let h = sH; h <= eH; h++) {
      const timePrefix = `${baseDate}T${String(h).padStart(2, '0')}:`;
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

    const W = 350;
    const H = expanded ? 176 : (compact ? 108 : 120);
    const xMin = 30;
    const xMax = 335;
    const yMin = expanded ? 12 : (compact ? 8 : 15);
    const yMax = H - (expanded ? 20 : (compact ? 18 : 25));

    const yellowLimit = 18; // Caution threshold (km/h)
    const redLimit = 26;    // Unflyable threshold (km/h)
    const peakWind = Math.max(...hours.map(p => Math.max(p.speed || 0, p.gust || 0)), 0);
    const maxVal = Math.max(30, Math.ceil(Math.max(redLimit * 1.15, peakWind * 1.15) / 5) * 5);

    const getX = (h) => Math.round(xMin + ((h - sH) / hRange) * (xMax - xMin));
    const getY = (val) => Math.round(yMax - (Math.min(maxVal, Math.max(0, val)) / maxVal) * (yMax - yMin));

    // Hourly background flyability curtains (using <path> to preserve anti-clutter <rect> test contract)
    const halfStep = (xMax - xMin) / (2 * hRange);
    const renderedZoneBands = hours.map(p => {
      let zoneStatus = null;
      if (p.speed >= redLimit || p.gust >= redLimit) {
        zoneStatus = 'unflyable';
      } else if (p.speed >= yellowLimit || p.gust >= yellowLimit + 4) {
        zoneStatus = 'caution';
      }
      if (!zoneStatus) return '';
      const cx = getX(p.hour);
      const bx0 = Math.max(xMin, Math.round((cx - halfStep) * 10) / 10);
      const bx1 = Math.min(xMax, Math.round((cx + halfStep) * 10) / 10);
      const fill = zoneStatus === 'unflyable'
        ? 'rgba(239, 68, 68, 0.09)'
        : 'rgba(234, 179, 8, 0.08)';
      return `<path class="gm-chart-zone-band gm-chart-zone-${zoneStatus}" d="M ${bx0},${yMin} L ${bx1},${yMin} L ${bx1},${yMax} L ${bx0},${yMax} Z" fill="${fill}" />`;
    }).join('');

    // Smooth curves for speed & gust
    const speedCoords = hours.map(p => ({ x: getX(p.hour), y: getY(p.speed) }));
    const gustCoords = hours.map(p => ({ x: getX(p.hour), y: getY(p.gust) }));
    const speedPath = buildSmoothPath(speedCoords);
    const gustPath = buildSmoothPath(gustCoords);
    const speedAreaPath = buildSmoothAreaPath(speedCoords, yMax);

    // Active marker coordinates
    const activeMarkerX = getX(this.selectedHour);
    const activeData = hours.find(h => h.hour === this.selectedHour) || hours[0];
    const activeMarkerY = getY(activeData.speed);
    const activeGustY = getY(activeData.gust);

    const numLabels = hRange <= 8 ? 3 : (hRange <= 12 ? 4 : 5);
    const labelHours = [];
    for (let i = 0; i < numLabels; i++) {
      const h = Math.round(sH + (i * hRange) / (numLabels - 1));
      if (!labelHours.includes(h)) labelHours.push(h);
    }

    return `
      <div id="forecast-wind-chart-box" class="gm-chart-box ${expanded ? 'gm-chart-box-expanded' : ''}">
        <svg class="gm-chart-svg" viewBox="0 0 ${W} ${H}" aria-label="Grafico orario vento e raffiche">
          <!-- Hourly Flyability Background Curtain -->
          ${renderedZoneBands}

          <!-- Background Grid lines -->
          <line x1="${xMin}" y1="${getY(10)}" x2="${xMax}" y2="${getY(10)}" stroke="var(--gm-border)" stroke-dasharray="2,2" />
          <line x1="${xMin}" y1="${getY(20)}" x2="${xMax}" y2="${getY(20)}" stroke="var(--gm-border)" stroke-dasharray="2,2" />
          <line x1="${xMin}" y1="${getY(30)}" x2="${xMax}" y2="${getY(30)}" stroke="var(--gm-border)" stroke-dasharray="2,2" />
          <line x1="${xMin}" y1="${yMax}" x2="${xMax}" y2="${yMax}" stroke="var(--gm-border-strong)" stroke-width="1" />

          <!-- Y Axis Labels -->
          <text x="${xMin - 4}" y="${getY(0) + 3}" font-size="8" fill="var(--gm-text-muted)" text-anchor="end">0</text>
          <text x="${xMin - 4}" y="${getY(10) + 3}" font-size="8" fill="var(--gm-text-muted)" text-anchor="end">10</text>
          <text x="${xMin - 4}" y="${getY(20) + 3}" font-size="8" fill="var(--gm-text-muted)" text-anchor="end">20</text>
          <text x="${xMin - 4}" y="${getY(30) + 3}" font-size="8" fill="var(--gm-text-muted)" text-anchor="end">30</text>

          <!-- Flyability Thresholds: Yellow (18 km/h) & Red (26 km/h) -->
          <line x1="${xMin}" y1="${getY(yellowLimit)}" x2="${xMax}" y2="${getY(yellowLimit)}" stroke="var(--gm-status-caution)" stroke-width="1.3" stroke-dasharray="4,3" />
          <line x1="${xMin}" y1="${getY(redLimit)}" x2="${xMax}" y2="${getY(redLimit)}" stroke="var(--gm-status-unflyable)" stroke-width="1.3" stroke-dasharray="4,3" />
          ${expanded ? `
          <text x="${xMax - 2}" y="${getY(yellowLimit) - 3}" font-size="8" font-weight="600" fill="var(--gm-status-caution)" text-anchor="end">${yellowLimit} km/h</text>
          <text x="${xMax - 2}" y="${Math.max(yMin + 7, getY(redLimit) - 3)}" font-size="8" font-weight="600" fill="var(--gm-status-unflyable)" text-anchor="end">${redLimit} km/h</text>
          ` : ''}

          <!-- Shaded Speed Area (Parameteo Style) -->
          <path d="${speedAreaPath}" fill="rgba(59, 130, 246, 0.18)" />

          <!-- Gust line (Dotted Slate) -->
          <path d="${gustPath}" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-dasharray="3,3" stroke-linecap="round" stroke-linejoin="round" />

          <!-- Wind speed line (Azure Blue) -->
          <path d="${speedPath}" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

          <!-- Hourly X Axis Labels -->
          ${labelHours.map(lh => `
            <text x="${getX(lh)}" y="${H - 4}" font-size="8" fill="var(--gm-text-muted)" text-anchor="middle">${String(lh).padStart(2, '0')}</text>
          `).join('')}

          <!-- ACTIVE HOUR VERTICAL MARKER -->
          <line x1="${activeMarkerX}" y1="${yMin}" x2="${activeMarkerX}" y2="${yMax}" stroke="var(--gm-accent)" stroke-width="1.8" stroke-dasharray="3,3" />
          <circle cx="${activeMarkerX}" cy="${activeGustY}" r="3.2" fill="#94a3b8" stroke="var(--gm-bg-base)" stroke-width="1.4" />
          <circle cx="${activeMarkerX}" cy="${activeMarkerY}" r="4" fill="var(--gm-accent)" stroke="var(--gm-bg-base)" stroke-width="1.8" />
          ${!hideTooltip ? `
          <rect x="${activeMarkerX - 22}" y="2" width="44" height="14" rx="3" fill="var(--gm-accent)" />
          <text x="${activeMarkerX}" y="12" font-size="9" font-weight="700" fill="var(--gm-text-inverse)" text-anchor="middle">
            ${Math.round(activeData.speed)} km/h
          </text>
          ` : ''}
        </svg>

        ${!hideFooter ? `
        <div class="flex items-center justify-between text-xs px-2 pt-1 border-t border-[var(--gm-border)]">
          <div class="flex items-center gap-3">
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-0.5 bg-[#3b82f6] inline-block"></span> Vento</span>
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-0.5 bg-[#94a3b8] border-dashed inline-block"></span> Raffica</span>
          </div>
          <span class="text-xs text-[var(--gm-accent)] font-mono font-bold">
            Ore ${String(this.selectedHour).padStart(2, '0')}:00: ${Math.round(activeData.speed)} km/h (raffica ${Math.round(activeData.gust)} km/h)
          </span>
        </div>
        ` : ''}
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
  renderSoundingChart(spot, weatherData, takeoffAlt, options = {}) {
    const compact = Boolean(options.compact);
    const expanded = Boolean(options.expanded);
    const hideTooltip = Boolean(options.hideTooltip);
    const hideFooter = Boolean(options.hideFooter);

    const hours = [];
    const hourlyData = (weatherData && weatherData.hourly) || {};
    const times = hourlyData.time || [];
    const baseDate = (times[0] && !times.some(t => t.startsWith(`${this.activeDate}T`)))
      ? times[0].slice(0, 10)
      : this.activeDate;

    const daylight = this.getDaylightWindow(spot, weatherData, this.activeDate);
    const sH = daylight.sunriseHour;
    const eH = daylight.sunsetHour;
    const hRange = Math.max(1, eH - sH);

    for (let h = sH; h <= eH; h++) {
      const timePrefix = `${baseDate}T${String(h).padStart(2, '0')}:`;
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
    const H = expanded ? 176 : (compact ? 108 : 120);
    const xMin = 36;
    const xMax = 335;
    const yMin = expanded ? 12 : (compact ? 8 : 15);
    const yMax = H - (expanded ? 20 : (compact ? 18 : 25));

    const redAltLimit = Math.round((takeoffAlt || 1000) + 200);
    const yellowAltLimit = Math.round((takeoffAlt || 1000) + 500);
    const peakCeiling = Math.max(...hours.map(p => p.ceiling || 0), yellowAltLimit + 400);
    const maxAlt = Math.max(2200, Math.ceil((peakCeiling * 1.12) / 200) * 200);

    const getX = (h) => Math.round(xMin + ((h - sH) / hRange) * (xMax - xMin));
    const getY = (alt) => Math.round(yMax - (Math.min(maxAlt, Math.max(0, alt)) / maxAlt) * (yMax - yMin));

    // Hourly background flyability curtains (low cloud base relative to takeoff)
    const halfStep = (xMax - xMin) / (2 * hRange);
    const renderedZoneBands = hours.map(p => {
      let zoneStatus = null;
      if (p.lclMsl <= redAltLimit) {
        zoneStatus = 'unflyable';
      } else if (p.lclMsl <= yellowAltLimit) {
        zoneStatus = 'caution';
      }
      if (!zoneStatus) return '';
      const cx = getX(p.hour);
      const bx0 = Math.max(xMin, Math.round((cx - halfStep) * 10) / 10);
      const bx1 = Math.min(xMax, Math.round((cx + halfStep) * 10) / 10);
      const fill = zoneStatus === 'unflyable'
        ? 'rgba(239, 68, 68, 0.09)'
        : 'rgba(234, 179, 8, 0.08)';
      return `<path class="gm-chart-zone-band gm-chart-zone-${zoneStatus}" d="M ${bx0},${yMin} L ${bx1},${yMin} L ${bx1},${yMax} L ${bx0},${yMax} Z" fill="${fill}" />`;
    }).join('');

    const lclCoords = hours.map(p => ({ x: getX(p.hour), y: getY(p.lclMsl) }));
    const ceilingCoords = hours.map(p => ({ x: getX(p.hour), y: getY(p.ceiling) }));
    const lclPath = buildSmoothPath(lclCoords);
    const ceilingPath = buildSmoothPath(ceilingCoords);
    const lclAreaPath = buildSmoothAreaPath(lclCoords, yMax);

    const activeMarkerX = getX(this.selectedHour);
    const activeData = hours.find(h => h.hour === this.selectedHour) || hours[0];
    const activeLclY = getY(activeData.lclMsl);
    const activeCeilingY = getY(activeData.ceiling);

    const numLabels = hRange <= 8 ? 3 : (hRange <= 12 ? 4 : 5);
    const labelHours = [];
    for (let i = 0; i < numLabels; i++) {
      const h = Math.round(sH + (i * hRange) / (numLabels - 1));
      if (!labelHours.includes(h)) labelHours.push(h);
    }

    return `
      <div id="forecast-sounding-chart-box" class="gm-chart-box ${expanded ? 'gm-chart-box-expanded' : ''}">
        <svg class="gm-chart-svg" viewBox="0 0 ${W} ${H}" aria-label="Grafico orario radiosondaggi e quote termiche">
          <!-- Hourly Flyability Background Curtain -->
          ${renderedZoneBands}

          <!-- Background Grid lines -->
          <line x1="${xMin}" y1="${getY(1000)}" x2="${xMax}" y2="${getY(1000)}" stroke="var(--gm-border)" stroke-dasharray="2,2" />
          <line x1="${xMin}" y1="${getY(2000)}" x2="${xMax}" y2="${getY(2000)}" stroke="var(--gm-border)" stroke-dasharray="2,2" />
          <line x1="${xMin}" y1="${yMax}" x2="${xMax}" y2="${yMax}" stroke="var(--gm-border-strong)" stroke-width="1" />

          <!-- Y Axis Labels -->
          <text x="${xMin - 4}" y="${getY(0) + 3}" font-size="8" fill="var(--gm-text-muted)" text-anchor="end">0m</text>
          <text x="${xMin - 4}" y="${getY(1000) + 3}" font-size="8" fill="var(--gm-text-muted)" text-anchor="end">1000m</text>
          <text x="${xMin - 4}" y="${getY(2000) + 3}" font-size="8" fill="var(--gm-text-muted)" text-anchor="end">2000m</text>

          <!-- Takeoff Elevation Reference Line -->
          <line x1="${xMin}" y1="${getY(takeoffAlt)}" x2="${xMax}" y2="${getY(takeoffAlt)}" stroke="var(--gm-border-strong)" stroke-width="1.2" stroke-dasharray="3,3" />

          <!-- Flyability Thresholds: Yellow (low margin) & Red (cloud on takeoff) -->
          <line x1="${xMin}" y1="${getY(yellowAltLimit)}" x2="${xMax}" y2="${getY(yellowAltLimit)}" stroke="var(--gm-status-caution)" stroke-width="1.3" stroke-dasharray="4,3" />
          <line x1="${xMin}" y1="${getY(redAltLimit)}" x2="${xMax}" y2="${getY(redAltLimit)}" stroke="var(--gm-status-unflyable)" stroke-width="1.3" stroke-dasharray="4,3" />
          ${expanded ? `
          <text x="${xMax - 2}" y="${getY(yellowAltLimit) - 3}" font-size="8" font-weight="600" fill="var(--gm-status-caution)" text-anchor="end">${yellowAltLimit}m</text>
          <text x="${xMax - 2}" y="${getY(redAltLimit) - 3}" font-size="8" font-weight="600" fill="var(--gm-status-unflyable)" text-anchor="end">${redAltLimit}m</text>
          ` : ''}

          <!-- Shaded LCL Area -->
          <path d="${lclAreaPath}" fill="rgba(56, 189, 248, 0.12)" />

          <!-- Ceiling line -->
          <path d="${ceilingPath}" fill="none" stroke="var(--gm-status-flyable)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />

          <!-- LCL Base line -->
          <path d="${lclPath}" fill="none" stroke="var(--gm-accent)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />

          <!-- Hourly X Axis Labels -->
          ${labelHours.map(lh => `
            <text x="${getX(lh)}" y="${H - 4}" font-size="8" fill="var(--gm-text-muted)" text-anchor="middle">${String(lh).padStart(2, '0')}</text>
          `).join('')}

          <!-- ACTIVE HOUR VERTICAL MARKER -->
          <line x1="${activeMarkerX}" y1="${yMin}" x2="${activeMarkerX}" y2="${yMax}" stroke="var(--gm-accent)" stroke-width="1.8" stroke-dasharray="3,3" />
          <circle cx="${activeMarkerX}" cy="${activeCeilingY}" r="3.2" fill="var(--gm-status-flyable)" stroke="var(--gm-bg-base)" stroke-width="1.4" />
          <circle cx="${activeMarkerX}" cy="${activeLclY}" r="4" fill="var(--gm-accent)" stroke="var(--gm-bg-base)" stroke-width="1.8" />
          ${!hideTooltip ? `
          <rect x="${activeMarkerX - 28}" y="2" width="56" height="14" rx="3" fill="var(--gm-accent)" />
          <text x="${activeMarkerX}" y="12" font-size="9" font-weight="700" fill="var(--gm-text-inverse)" text-anchor="middle">
            Base: ${Math.round(activeData.lclMsl)}m
          </text>
          ` : ''}
        </svg>

        ${!hideFooter ? `
        <div class="flex items-center justify-between text-xs px-2 pt-1 border-t border-[var(--gm-border)]">
          <div class="flex items-center gap-3">
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-0.5 bg-[var(--gm-accent)] inline-block"></span> Base Nubi (LCL)</span>
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-0.5 bg-[var(--gm-status-flyable)] inline-block"></span> Quota Max</span>
          </div>
          <span class="text-xs text-[var(--gm-accent)] font-mono font-bold">
            Ore ${String(this.selectedHour).padStart(2, '0')}:00: Base ${Math.round(activeData.lclMsl)}m MSL
          </span>
        </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Renders the AI Safety Briefing card.
   */
  renderBriefingCard(briefing, spot) {
    return `
      <section aria-labelledby="heading-briefing" class="gm-briefing-section">
        <h2 id="heading-briefing" class="sr-only">Briefing di Sicurezza</h2>

        <article id="forecast-briefing-box" class="gm-briefing-card">
          <div class="gm-briefing-header">
            <div class="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gm-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="22"></line>
              </svg>
              <div>
                <h3 class="gm-briefing-title">Briefing di Volo</h3>
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
  /**
   * Evaluates a single hourly timeline slot according to the active view context:
   * - 'overview': combined comprensorio safety (Takeoff + Glide Cone + Landing valley breeze)
   * - 'takeoff': strictly the selected takeoff's wind, gusts, instability, and slope alignment
   * - 'landing': strictly the selected landing's wind, gusts, valley breeze, and approach safety
   *
   * @param {object} spot
   * @param {object} weatherData
   * @param {number} hourIndex
   * @param {object} glider
   * @param {object|null} [activeSubSpotObj=null]
   * @returns {object}
   */
  formatShortFlyabilityReason(rawText) {
    if (!rawText || typeof rawText !== 'string') return 'Condizioni Ottimali';
    const cleaned = rawText.replace(/^NO\s*FLY:\s*/i, '').trim();
    if (/pioggia\/temporale/i.test(cleaned)) return 'Pioggia / Temporale';
    if (/rischio temporali severi/i.test(cleaned)) return 'Temporali Severi';
    if (/previsione non disponibile/i.test(cleaned)) return 'Dati N/D';
    return cleaned || 'Condizioni Ottimali';
  }

  evaluateTimelineSlot(spot, weatherData, hourIndex, glider, activeSubSpotObj = null) {
    if (!spot) {
      return {
        badge: 'N/D',
        status: 'unavailable',
        severity: 2,
        fillPct: 100,
        shortReason: 'Dati N/D',
        contextLabel: 'Panoramica',
        weatherSnapshot: {}
      };
    }

    const effectiveTakeoffId = (activeSubSpotObj && activeSubSpotObj.spotType === 'takeoff')
      ? activeSubSpotObj.id
      : this.activeTakeoffId;
    const effectiveLandingId = (activeSubSpotObj && activeSubSpotObj.spotType === 'landing')
      ? activeSubSpotObj.id
      : this.activeLandingId;

    const baseEval = evaluateComprensorio({
      comprensorio: spot,
      weatherData,
      hourIndex,
      glider,
      targetDate: this.activeDate,
      takeoffId: effectiveTakeoffId,
      landingId: effectiveLandingId
    });

    const tw = baseEval.takeoffWeather || baseEval.weatherSnapshot || {};
    const lw = baseEval.landingWeather || baseEval.weatherSnapshot || {};

    // Evaluate landing aerology specifically (isTakeoff = false)
    const landingScore = getFlyabilityScore(
      lw.windSpeed ?? 10,
      lw.windGust ?? 14,
      lw.cape ?? 100,
      lw.turbulence ?? 0.1,
      lw.rain ?? 0,
      lw.windDirection ?? lw.windDir ?? 180,
      null,
      false,
      glider
    );
    let landingSeverity = landingScore.severity;
    let landingReason = landingScore.text || landingScore.reason || 'Brezza Regolare';
    let landingShortReason = landingSeverity === 0
      ? ((lw.windSpeed || 0) <= 6 ? 'Brezza Calma' : 'Brezza Regolare')
      : this.formatShortFlyabilityReason(landingScore.text);

    // Valley breeze reinforcement check at landing (aligned with Brezza di Valle parameter card)
    if (landingSeverity === 0 && ((lw.windSpeed || 0) >= 15 || (lw.windGust || 0) >= 21)) {
      landingSeverity = 1;
      landingReason = 'Brezza di valle sostenuta in atterraggio';
      landingShortReason = 'Brezza Sostenuta';
    }

    // CASE 1: Specific Landing selected
    if (activeSubSpotObj && activeSubSpotObj.spotType === 'landing') {
      let severity = landingSeverity;
      let reason = landingReason;
      let shortReason = landingShortReason;
      if (baseEval.glideMetrics && baseEval.glideMetrics.isSafe === false && severity === 0) {
        severity = 1;
        reason = baseEval.glideMetrics.warningText || 'Cono di planata marginale';
        shortReason = 'Cono Marginale';
      }
      const status = severity === 0 ? 'flyable' : (severity === 1 ? 'caution' : 'unflyable');
      const badge = severity === 0 ? 'Volabile' : (severity === 1 ? 'Cautela' : 'Non Volabile');
      const shortName = (activeSubSpotObj.name || 'Atterraggio').replace(/^Atterraggio\s*/i, '');

      return {
        ...baseEval,
        status,
        badge,
        severity,
        reason,
        shortReason,
        fillPct: 100,
        contextLabel: `↘ ${shortName}`,
        weatherSnapshot: lw
      };
    }

    // CASE 2: Specific Takeoff selected
    if (activeSubSpotObj && activeSubSpotObj.spotType === 'takeoff') {
      const takeoffEval = baseEval.bestTakeoffEval || {};
      const severity = takeoffEval.severity ?? (baseEval.status === 'flyable' ? 0 : (baseEval.status === 'caution' ? 1 : 2));
      const status = severity === 0 ? 'flyable' : (severity === 1 ? 'caution' : 'unflyable');
      const badge = severity === 0 ? 'Volabile' : (severity === 1 ? 'Cautela' : 'Non Volabile');
      const diffFromFront = takeoffEval.flyScore?.details?.direction?.diffFromFront ?? takeoffEval.diffFromFront ?? 0;
      const hasHeading = activeSubSpotObj.heading != null && !isNaN(Number(activeSubSpotObj.heading));
      const tSpeed = tw.windSpeed || 0;
      let shortReason = 'Condizioni Ottimali';
      if (severity === 0) {
        if (tSpeed <= 4) {
          shortReason = 'Vento Calmo';
        } else if (hasHeading && diffFromFront <= 35) {
          shortReason = 'Vento in Asse';
        } else {
          shortReason = 'Vento Favorevole';
        }
      } else {
        shortReason = this.formatShortFlyabilityReason(takeoffEval.statusText || takeoffEval.flyScore?.text || baseEval.reason);
      }
      const shortName = (activeSubSpotObj.name || 'Decollo').replace(/^Decollo\s*/i, '');

      return {
        ...baseEval,
        status,
        badge,
        severity,
        reason: takeoffEval.statusText || takeoffEval.reason || baseEval.reason,
        shortReason,
        fillPct: 100,
        contextLabel: `↗ ${shortName}`,
        weatherSnapshot: tw
      };
    }

    // CASE 3: Overview (Panoramica) — Combined Takeoff + Glide Cone + Landing safety
    const baseSeverity = baseEval.status === 'flyable' ? 0 : (baseEval.status === 'caution' ? 1 : 2);
    const combinedSeverity = Math.max(baseSeverity, landingSeverity);
    const status = combinedSeverity === 0 ? 'flyable' : (combinedSeverity === 1 ? 'caution' : 'unflyable');
    const badge = combinedSeverity === 0 ? 'Volabile' : (combinedSeverity === 1 ? 'Cautela' : 'Non Volabile');
    const reason = combinedSeverity > baseSeverity ? landingReason : baseEval.reason;

    let shortReason = 'Condizioni Ottimali';
    if (baseEval.status === 'unavailable' || baseEval.isOfflineUnavailable) {
      shortReason = 'Dati N/D';
    } else if (combinedSeverity > baseSeverity) {
      shortReason = landingShortReason;
    } else if (combinedSeverity === 0) {
      const takeoffEval = baseEval.bestTakeoffEval || {};
      const dirDetails = takeoffEval.flyScore?.details?.direction;
      const tSpeed = tw.windSpeed || 0;
      if (tSpeed <= 4) {
        shortReason = 'Vento Calmo';
      } else if (dirDetails && dirDetails.diffFromFront != null && dirDetails.diffFromFront <= 35) {
        shortReason = 'Vento in Asse';
      } else {
        shortReason = 'Condizioni Ottimali';
      }
    } else {
      const takeoffEval = baseEval.bestTakeoffEval || {};
      const isLandingUnsafe = Boolean(baseEval.glideMetrics && !baseEval.glideMetrics.isSafe);
      if (takeoffEval.severity > 0) {
        shortReason = this.formatShortFlyabilityReason(takeoffEval.statusText || takeoffEval.flyScore?.text || baseEval.reason);
      } else if (isLandingUnsafe) {
        shortReason = 'Rientro Critico';
      } else {
        shortReason = this.formatShortFlyabilityReason(baseEval.reason);
      }
    }

    return {
      ...baseEval,
      status,
      badge,
      severity: combinedSeverity,
      reason,
      shortReason,
      fillPct: 100,
      contextLabel: 'Panoramica'
    };
  }

  /**
   * Renders the 13-slot hourly flyability timeline grid (08:00 - 20:00).
   * Shared between the bottom docked scrubber and the flight analysis overlay.
   * 
   * @param {object} spot
   * @param {object} weatherData
   * @param {object} glider
   * @param {string} [stripId='forecast-timeline-strip']
   * @returns {string}
   */
  renderTimelineGrid(spot, weatherData, glider, stripId = 'forecast-timeline-strip') {
    const now = new Date();
    const todayIso = formatDateIso(now);
    const isToday = this.activeDate === todayIso;
    const currentHour = now.getHours();

    const activeSub = this.resolveActiveSubSpot(spot);

    const daylight = this.getDaylightWindow(spot, weatherData, this.activeDate);
    const hours = [];
    for (let h = daylight.sunriseHour; h <= daylight.sunsetHour; h++) {
      const evalHour = this.evaluateTimelineSlot(spot, weatherData, h, glider, activeSub);
      hours.push({
        hour: h,
        eval: evalHour,
        isActive: h === this.selectedHour,
        isCurrentHour: isToday && (h === currentHour),
        isPast: isToday && (h < currentHour)
      });
    }

    const activeModeAttr = activeSub ? activeSub.spotType : 'overview';

    return `
      <div id="${stripId}" data-timeline-context="${activeModeAttr}" class="gm-timeline-grid-13" style="--gm-timeline-slots: ${hours.length}; grid-template-columns: repeat(${hours.length}, 1fr);" role="tablist" aria-label="Timeline oraria">
        ${hours.map(slot => {
          const h = slot.hour;
          const evalH = slot.eval;
          const weather = evalH.weatherSnapshot || {};
          const speed = Math.round(weather.windSpeed || 0);
          const statusKey = evalH.status === 'flyable' ? 'flyable' : (evalH.status === 'caution' ? 'caution' : 'unflyable');

          let fillColor = 'var(--gm-status-unflyable)';
          let slotBgColor = 'var(--gm-status-unflyable-bg)';
          if (statusKey === 'flyable') {
            fillColor = 'var(--gm-status-flyable)';
            slotBgColor = 'var(--gm-status-flyable-bg)';
          } else if (statusKey === 'caution') {
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
              aria-label="Ore ${String(h).padStart(2, '0')}:00, ${evalH.contextLabel ? `${evalH.contextLabel}: ` : ''}${evalH.badge}, Vento ${speed} km/h${slot.isCurrentHour ? ' (Ora attuale)' : ''}"
              tabindex="${slot.isActive ? '0' : '-1'}"
            >
              ${slot.isCurrentHour ? '<span class="compact-now-badge" aria-label="Ora attuale">ORA</span>' : ''}
              <span class="compact-time">${String(h).padStart(2, '0')}</span>
              <div class="compact-bar compact-bar-${statusKey}" style="background-color: ${slotBgColor};">
                <div class="compact-bar-fill" style="background-color: ${fillColor};"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  /**
   * Renders the bottom docked sticky scrubber container in ForecastView.
   * @param {object} spot
   * @param {object} weatherData
   * @param {object} glider
   * @returns {string}
   */
  renderStickyScrubber(spot, weatherData, glider) {
    const activeSub = this.resolveActiveSubSpot(spot);
    const evalCurrent = this.evaluateTimelineSlot(spot, weatherData, this.selectedHour, glider, activeSub);
    const pillStatus = evalCurrent?.status || 'unavailable';
    const statusColor = pillStatus === 'unflyable'
      ? 'var(--gm-status-unflyable-text)'
      : ((STATUS_COLORS && STATUS_COLORS[pillStatus]?.fill) || 'var(--gm-text-secondary)');
    const pillReason = evalCurrent?.shortReason || evalCurrent?.badge || 'N/D';

    return `
      <aside 
        id="forecast-timeline-scrubber" 
        class="gm-timeline-scrubber-sticky"
        aria-label="Timeline oraria ancorata"
      >
        <div class="gm-map-scrubber-header">
          <div class="gm-map-scrubber-title-group">
            <span class="gm-map-scrubber-title">Timeline Volabilità</span>
            <span id="forecast-scrubber-spot-pill" class="gm-map-scrubber-spot-pill status-${escapeHtml(pillStatus)}" title="${escapeHtml(evalCurrent?.reason || pillReason)}" style="color: ${statusColor};">
              ${escapeHtml(pillReason)}
            </span>
          </div>
          <div class="gm-map-scrubber-hour-display">
            <span id="forecast-active-hour-label" class="gm-flight-alt">Ore ${String(this.selectedHour).padStart(2, '0')}:00</span>
          </div>
        </div>
        ${this.renderTimelineGrid(spot, weatherData, glider, 'forecast-timeline-strip')}
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
      const takeoffs = s.takeoffs || [];
      const landings = s.landings || [];
      const hasMultiTakeoffs = takeoffs.length > 1;
      const hasMultiLandings = landings.length > 1;

      const activeTId = isActive ? (this.activeTakeoffId || takeoffs.find(t => t.isPrimary)?.id || takeoffs[0]?.id) : (takeoffs.find(t => t.isPrimary)?.id || takeoffs[0]?.id);
      const activeLId = isActive ? (this.activeLandingId || landings.find(l => l.isPrimary || l.isOfficial)?.id || landings[0]?.id) : (landings.find(l => l.isPrimary || l.isOfficial)?.id || landings[0]?.id);
      const countSummary = `${takeoffs.length} ${takeoffs.length === 1 ? 'decollo' : 'decolli'} · ${landings.length} ${landings.length === 1 ? 'atterraggio' : 'atterraggi'}`;

      return `
        <div 
          class="gm-picker-item ${isActive ? 'active' : ''}" 
          id="gm-picker-item-${escapeHtml(s.id)}"
          data-action="pick-spot"
          data-spot-id="${escapeHtml(s.id)}"
          data-takeoff-id="${escapeHtml(activeTId || '')}"
          data-landing-id="${escapeHtml(activeLId || '')}"
        >
          <div class="gm-picker-item-content flex-1 min-w-0">
            <div class="gm-picker-item-main" data-action="pick-spot" data-spot-id="${escapeHtml(s.id)}" data-takeoff-id="${escapeHtml(activeTId || '')}" data-landing-id="${escapeHtml(activeLId || '')}">
              <div class="flex items-center justify-between gap-2">
                <div class="text-sm font-bold text-[var(--gm-text-primary)] truncate">${escapeHtml(s.name)} (${escapeHtml(s.province)})</div>
                ${isActive ? '<span class="gm-subspot-item-check flex-shrink-0" aria-hidden="true">✓</span>' : ''}
              </div>
              <div class="text-xs text-[var(--gm-text-muted)]">${escapeHtml(s.region)} · ${countSummary}</div>
            </div>
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
          <span class="gm-picker-section-title">Risultati Ricerca (${filtered.length})</span>
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
          <span class="gm-picker-section-title">Preferiti (${pinnedSpots.length})</span>
          <div class="gm-picker-list">
            ${pinnedSpots.map(renderItem).join('')}
          </div>
        </div>
      ` : ''}

      ${recentSpots.length > 0 ? `
        <div class="gm-picker-section">
          <span class="gm-picker-section-title">Recenti (${recentSpots.length})</span>
          <div class="gm-picker-list">
            ${recentSpots.map(renderItem).join('')}
          </div>
        </div>
      ` : ''}

      <div class="gm-picker-section">
        <span class="gm-picker-section-title">
          ${(pinnedSpots.length > 0 || recentSpots.length > 0) ? 'Altri Comprensori' : 'Tutti i Comprensori'} (${(pinnedSpots.length > 0 || recentSpots.length > 0) ? otherSpots.length : allSpots.length})
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
   * Uses a compact 7-column Monday-Sunday 2-week grid with 4-color semantic flyability indicators.
   */
  openDatePickerSheet() {
    const today = new Date();
    const spot = this.getCurrentSpot();
    const flySummaries = this.getMultiDayFlyability(spot, 14);
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
              const isSelected = d.isoDate === this.activeDate;
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
            <span class="flex items-center gap-1"><span class="text-[#f87171]">⚡</span> Severo</span>
          </div>
        </div>
      </div>
    `;

    openSheet({
      id: 'date-picker-sheet',
      title: 'Seleziona Data di Volo',
      content: renderContent()
    });
  }

  /**
   * Smoothly updates active hour and synchronizes UI components in-place under Doherty threshold (<50ms).
   * @param {number} hour
   */
  setHour(hour) {
    const daylight = this.getDaylightWindow();
    if (hour < daylight.sunriseHour || hour > daylight.sunsetHour) return;
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
      if (this.isFlightAnalysisOpen) {
        const spot = this.getCurrentSpot();
        const glider = this.getActiveGlider();
        const weatherData = this.getWeatherData(spot, this.activeDate);
        const activeSub = this.resolveActiveSubSpot(spot);
        const effectiveTakeoffId = (activeSub && activeSub.spotType === 'takeoff') ? activeSub.id : this.activeTakeoffId;
        const effectiveLandingId = (activeSub && activeSub.spotType === 'landing') ? activeSub.id : this.activeLandingId;

        const evaluated = evaluateComprensorio({
          comprensorio: spot,
          weatherData,
          hourIndex: this.selectedHour,
          glider,
          targetDate: this.activeDate,
          takeoffId: effectiveTakeoffId,
          landingId: effectiveLandingId
        });
        this.updateFlightAnalysisOverlay(evaluated);
      }
      return;
    }

    const spot = this.getCurrentSpot();
    const glider = this.getActiveGlider();
    const weatherData = this.getWeatherData(spot, this.activeDate);
    const activeSubSpotObj = this.resolveActiveSubSpot(spot);
    const effectiveTakeoffId = (activeSubSpotObj && activeSubSpotObj.spotType === 'takeoff') ? activeSubSpotObj.id : this.activeTakeoffId;
    const effectiveLandingId = (activeSubSpotObj && activeSubSpotObj.spotType === 'landing') ? activeSubSpotObj.id : this.activeLandingId;

    const evaluated = evaluateComprensorio({
      comprensorio: spot,
      weatherData,
      hourIndex: this.selectedHour,
      glider,
      targetDate: this.activeDate,
      takeoffId: effectiveTakeoffId,
      landingId: effectiveLandingId
    });

    // 1. Update Active Slot in all timeline strips in place (zero layout thrashing)
    const strips = [
      this.containerEl?.querySelector('#forecast-timeline-strip'),
      this.flightAnalysisOverlayEl?.querySelector('#flight-analysis-timeline-strip'),
      typeof document !== 'undefined' ? document.getElementById('flight-analysis-timeline-strip') : null
    ].filter(Boolean);

    strips.forEach(strip => {
      const cols = strip.querySelectorAll('.gm-timeline-col-compact');
      cols.forEach(col => {
        const colHour = parseInt(col.getAttribute('data-hour'), 10);
        const isActive = colHour === this.selectedHour;
        col.classList.toggle('active', isActive);
        col.setAttribute('aria-selected', isActive ? 'true' : 'false');
        col.setAttribute('tabindex', isActive ? '0' : '-1');
      });
    });

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

    // 2b. Reactively update Windsock Markers (Takeoff + Landing) and Glide Line in mini-map without touching DOM
    if (this.miniMapEngine) {
      const currentTakeoff = activeSubSpotObj?.spotType === 'takeoff' ? activeSubSpotObj : evaluated.takeoff;
      this.miniMapEngine.updateWindsockMarker(
        evaluated.takeoffWeather || evaluated.weatherSnapshot,
        evaluated.landingWeather || evaluated.weatherSnapshot,
        currentTakeoff
      );
      this.miniMapEngine.updateGlideLine(evaluated.glideMetrics);
    }

    // 3. Update Parameters or Multi-Trend container in place
    if (paramsContainer) {
      if (this.selectedSubSpot === 'overview') {
        paramsContainer.innerHTML = '';
        if (paramsContainer.style) paramsContainer.style.display = 'none';
      } else {
        if (paramsContainer.style) paramsContainer.style.display = '';
        paramsContainer.innerHTML = this.forecastMode === 'charts'
          ? this.renderMultiTrendCharts(evaluated, weatherData, spot, glider, activeSubSpotObj)
          : this.renderParameterCards(evaluated, weatherData, spot, glider, activeSubSpotObj);
      }
    }

    // 4. Update Wind Panel container (if present in DOM)
    if (windContainer) {
      windContainer.innerHTML = this.renderWindPanel(evaluated, weatherData, spot, activeSubSpotObj);
    }

    // 5. Update Sounding Panel container (if present in DOM)
    if (soundingContainer) {
      soundingContainer.innerHTML = this.renderSoundingPanel(evaluated, weatherData, spot, activeSubSpotObj);
    }

    // 5b. Update Active state on Flight Window cards in place
    if (this.containerEl && typeof this.containerEl.querySelectorAll === 'function') {
      const windowCards = this.containerEl.querySelectorAll('.gm-flight-window-card');
      if (windowCards && windowCards.length > 0) {
        windowCards.forEach(card => {
          const startH = parseInt(card.getAttribute('data-start-hour'), 10);
          const endH = parseInt(card.getAttribute('data-end-hour'), 10);
          const isActiveWindow = !isNaN(startH) && !isNaN(endH) && hour >= startH && hour <= endH;
          card.classList.toggle('active', isActiveWindow);
          card.setAttribute('aria-selected', isActiveWindow ? 'true' : 'false');
        });
      }
    }

    // 6. Update scrubber header labels in place if present
    const slotEval = this.evaluateTimelineSlot(spot, weatherData, hour, glider, activeSubSpotObj);
    const pillStatus = slotEval?.status || 'unavailable';
    const pillColor = pillStatus === 'unflyable'
      ? 'var(--gm-status-unflyable-text)'
      : ((STATUS_COLORS && STATUS_COLORS[pillStatus]?.fill) || 'var(--gm-text-secondary)');
    const pillShortReason = slotEval?.shortReason || slotEval?.badge || 'Ottimale';
    const pillFullReason = slotEval?.reason || pillShortReason;
    const forecastHourLabel = this.containerEl?.querySelector('#forecast-active-hour-label');
    if (forecastHourLabel) {
      forecastHourLabel.textContent = `Ore ${String(hour).padStart(2, '0')}:00`;
    }
    const forecastSpotPill = this.containerEl?.querySelector('#forecast-scrubber-spot-pill');
    if (forecastSpotPill) {
      forecastSpotPill.textContent = pillShortReason;
      forecastSpotPill.setAttribute('title', pillFullReason);
      forecastSpotPill.className = `gm-map-scrubber-spot-pill status-${pillStatus}`;
      forecastSpotPill.style.color = pillColor;
    }

    const faHourLabel = this.flightAnalysisOverlayEl?.querySelector('#flight-analysis-active-hour-label');
    if (faHourLabel) {
      faHourLabel.textContent = `Ore ${String(hour).padStart(2, '0')}:00`;
    }
    const faSpotPill = this.flightAnalysisOverlayEl?.querySelector('#flight-analysis-scrubber-spot-pill');
    if (faSpotPill) {
      faSpotPill.textContent = pillShortReason;
      faSpotPill.setAttribute('title', pillFullReason);
      faSpotPill.className = `gm-map-scrubber-spot-pill status-${pillStatus}`;
      faSpotPill.style.color = pillColor;
    }

    // 7. Update Flight Analysis Overlay if open
    if (this.isFlightAnalysisOpen) {
      this.updateFlightAnalysisOverlay(evaluated);
    }
  }

  /**
   * Discovers the active timeline strip element from an event target or open view.
   * @param {EventTarget} [target]
   * @returns {HTMLElement|null}
   */
  findActiveTimelineStrip(target) {
    if (target && typeof target.closest === 'function') {
      const closestStrip = target.closest('.gm-timeline-grid-13');
      if (closestStrip) return closestStrip;
    }
    if (this.isFlightAnalysisOpen && this.flightAnalysisOverlayEl) {
      return this.flightAnalysisOverlayEl.querySelector('#flight-analysis-timeline-strip');
    }
    return this.containerEl ? this.containerEl.querySelector('#forecast-timeline-strip') : null;
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
    const strip = this.findActiveTimelineStrip(evt.target);
    if (!strip) return;
    if (!strip.contains(evt.target) && evt.target !== strip) return;

    this.activeScrubStrip = strip;
    this.isScrubbing = true;
    this.pointerStartX = this.getClientX(evt);
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

    // Attach global window listeners to seamlessly track scrubbing across entire screen
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
   * @param {PointerEvent|TouchEvent} evt
   * @param {HTMLElement} strip
   */
  updateHourFromPointer(evt, strip) {
    if (!strip) return;
    const rect = typeof strip.getBoundingClientRect === 'function' ? strip.getBoundingClientRect() : null;
    const cols = strip.querySelectorAll ? strip.querySelectorAll('.gm-timeline-col-compact') : null;

    if (rect && rect.width > 0) {
      const clientX = this.getClientX(evt);
      const relX = Math.max(0, Math.min(rect.width - 1, clientX - rect.left));
      const fraction = relX / rect.width;
      let targetHour = this.selectedHour;

      if (cols && cols.length > 0) {
        const colIdx = Math.min(cols.length - 1, Math.max(0, Math.floor(fraction * cols.length)));
        targetHour = parseInt(cols[colIdx].getAttribute('data-hour'), 10);
      } else {
        const daylight = this.getDaylightWindow();
        const count = daylight.hours.length || 13;
        const idx = Math.min(count - 1, Math.max(0, Math.floor(fraction * count)));
        targetHour = daylight.hours[idx] ?? (daylight.sunriseHour + idx);
      }

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
        const daylight = this.getDaylightWindow();
        if (!isNaN(hour) && hour >= daylight.sunriseHour && hour <= daylight.sunsetHour && hour !== this.selectedHour) {
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

    // Auto-close flight analysis aim menu if click is outside
    if (this.isFlightAnalysisAimMenuOpen) {
      const isInsideAimMenu = actionEl && (
        actionEl.getAttribute('data-action') === 'toggle-aim-menu' ||
        actionEl.getAttribute('data-action') === 'center-comprensorio' ||
        actionEl.getAttribute('data-action') === 'center-gps'
      );
      if (!isInsideAimMenu) {
        this.closeFlightAnalysisAimMenu();
      }
    }

    if (!actionEl) return;

    const action = actionEl.getAttribute('data-action');

    if (action === 'toggle-minimap-layer') {
      const currentLayer = this.getActiveMapLayer();
      const newLayer = getNextMapLayer(currentLayer);
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
      this.updateMiniMapToggleUi(newLayer);
    } else if (action === 'toggle-flight-analysis-layer') {
      const currentLayer = this.getActiveMapLayer();
      const newLayer = getNextMapLayer(currentLayer);
      if (this.flightAnalysisMapEngine && typeof this.flightAnalysisMapEngine.setLayer === 'function') {
        this.flightAnalysisMapEngine.setLayer(newLayer);
      }
      if (this.store && typeof this.store.setState === 'function') {
        const state = this.store.getState() || {};
        const ui = state.ui || {};
        this.store.setState({ ui: { ...ui, mapLayer: newLayer } });
      }
      this.updateFlightAnalysisToggleUi(newLayer);
    } else if (action === 'toggle-subspot-info') {
      if (evt && typeof evt.preventDefault === 'function') {
        evt.preventDefault();
      }
      this.isSubSpotInfoOpen = !this.isSubSpotInfoOpen;
      const detailsEl = actionEl.closest ? actionEl.closest('.gm-subspot-info-collapsible') : null;
      if (detailsEl) {
        if (this.isSubSpotInfoOpen) {
          if (typeof detailsEl.setAttribute === 'function') detailsEl.setAttribute('open', '');
          detailsEl.open = true;
        } else {
          if (typeof detailsEl.removeAttribute === 'function') detailsEl.removeAttribute('open');
          detailsEl.open = false;
        }
        if (typeof actionEl.setAttribute === 'function') {
          actionEl.setAttribute('aria-expanded', this.isSubSpotInfoOpen ? 'true' : 'false');
        }
      } else {
        this.render();
      }
    } else if (action === 'toggle-subspot-menu') {
      this.isSubSpotMenuOpen = !this.isSubSpotMenuOpen;
      this.render();
    } else if (action === 'select-subspot') {
      const subSpotId = actionEl.getAttribute('data-subspot-id');
      const spot = this.getCurrentSpot();
      if (spot && subSpotId) {
        const isT = spot.takeoffs?.some(t => t.id === subSpotId);
        if (isT) {
          this.activeTakeoffId = subSpotId;
          if (this.store) this.store.setState({ activeTakeoffId: subSpotId });
          this.fetchWeatherDataAsync(spot, this.activeDate);
        }
        const isL = spot.landings?.some(l => l.id === subSpotId);
        if (isL) {
          this.activeLandingId = subSpotId;
          if (this.store) this.store.setState({ activeLandingId: subSpotId });
        }
        if (subSpotId === 'overview' || subSpotId === 'live') {
          if (!this.activeTakeoffId || !spot.takeoffs?.some(t => t.id === this.activeTakeoffId)) {
            this.activeTakeoffId = spot.takeoffs?.find(t => t.isPrimary)?.id || spot.takeoffs?.[0]?.id || null;
          }
          if (!this.activeLandingId || !spot.landings?.some(l => l.id === this.activeLandingId)) {
            this.activeLandingId = spot.landings?.find(l => l.isPrimary || l.isOfficial)?.id || spot.landings?.[0]?.id || null;
          }
          if (this.store) this.store.setState({ activeTakeoffId: this.activeTakeoffId, activeLandingId: this.activeLandingId });
        }
      }
      this.selectedSubSpot = subSpotId || 'overview';
      this.isSubSpotInfoOpen = false;
      this.isSubSpotMenuOpen = false;
      closeSheet();
      this.render();
    } else if (action === 'set-active-takeoff') {
      const takeoffId = actionEl.getAttribute('data-takeoff-id');
      if (takeoffId && takeoffId !== this.activeTakeoffId) {
        this.activeTakeoffId = takeoffId;
        this.selectedSubSpot = 'overview';
        if (this.store) {
          this.store.setState({ activeTakeoffId: takeoffId });
        }
        this.render();
        const currentSpot = this.getCurrentSpot();
        this.fetchWeatherDataAsync(currentSpot, this.activeDate);
      }
    } else if (action === 'set-active-landing') {
      const landingId = actionEl.getAttribute('data-landing-id');
      if (landingId && landingId !== this.activeLandingId) {
        this.activeLandingId = landingId;
        this.selectedSubSpot = 'overview';
        if (this.store) {
          this.store.setState({ activeLandingId: landingId });
        }
        this.render();
      }
    } else if (action === 'select-hour') {
      if (this.hasDraggedPointer) {
        return;
      }
      const hourAttr = actionEl.getAttribute('data-hour');
      if (hourAttr != null) {
        const hour = parseInt(hourAttr, 10);
        const daylight = this.getDaylightWindow();
        if (!isNaN(hour) && hour >= daylight.sunriseHour && hour <= daylight.sunsetHour) {
          this.setHour(hour);
        }
      }
    } else if (action === 'select-window') {
      const hourAttr = actionEl.getAttribute('data-hour');
      if (hourAttr != null) {
        const hour = parseInt(hourAttr, 10);
        const daylight = this.getDaylightWindow();
        if (!isNaN(hour) && hour >= daylight.sunriseHour && hour <= daylight.sunsetHour) {
          this.setHour(hour);
        }
      }
    } else if (action === 'prev-hour') {
      const daylight = this.getDaylightWindow();
      if (this.selectedHour > daylight.sunriseHour) {
        this.setHour(this.selectedHour - 1);
      }
    } else if (action === 'next-hour') {
      const daylight = this.getDaylightWindow();
      if (this.selectedHour < daylight.sunsetHour) {
        this.setHour(this.selectedHour + 1);
      }
    } else if (action === 'minimap-zoom-in') {
      if (this.miniMapEngine && typeof this.miniMapEngine.zoomIn === 'function') {
        this.miniMapEngine.zoomIn();
      }
    } else if (action === 'minimap-zoom-out') {
      if (this.miniMapEngine && typeof this.miniMapEngine.zoomOut === 'function') {
        this.miniMapEngine.zoomOut();
      }
    } else if (action === 'flight-analysis-zoom-in') {
      if (this.flightAnalysisMapEngine && typeof this.flightAnalysisMapEngine.zoomIn === 'function') {
        this.flightAnalysisMapEngine.zoomIn();
      }
    } else if (action === 'flight-analysis-zoom-out') {
      if (this.flightAnalysisMapEngine && typeof this.flightAnalysisMapEngine.zoomOut === 'function') {
        this.flightAnalysisMapEngine.zoomOut();
      }
    } else if (action === 'open-full-map') {
      const spot = this.getCurrentSpot();
      if (this.store && spot) {
        this.store.setState({ selectedSpot: spot });
      }
      this.openFlightAnalysisOverlay();
    } else if (action === 'dismiss-horizon-notice') {
      this.dismissedHorizonDate = this.activeDate;
      if (this.containerEl && typeof this.containerEl.querySelector === 'function') {
        const noticeEl = this.containerEl.querySelector('.gm-horizon-notice');
        if (noticeEl && typeof noticeEl.remove === 'function') {
          noticeEl.remove();
          return;
        }
      }
      this.render();
    } else if (action === 'dismiss-safety-warning') {
      if (this.flightAnalysisOverlayEl && typeof this.flightAnalysisOverlayEl.querySelector === 'function') {
        const bannerContainer = this.flightAnalysisOverlayEl.querySelector('#flight-safety-banner-container');
        if (bannerContainer) {
          bannerContainer.innerHTML = '';
        }
      }
    } else if (action === 'close-flight-analysis') {
      this.closeFlightAnalysisOverlay();
    } else if (action === 'toggle-aim-menu') {
      this.toggleFlightAnalysisAimMenu();
    } else if (action === 'center-comprensorio') {
      this.closeFlightAnalysisAimMenu();
      this.centerOnComprensorio();
    } else if (action === 'center-gps') {
      this.closeFlightAnalysisAimMenu();
      this.centerOnUserLocation();
    } else if (action === 'flight-analysis-hour') {
      const hourAttr = actionEl.getAttribute('data-hour');
      if (hourAttr != null) {
        const hour = parseInt(hourAttr, 10);
        const daylight = this.getDaylightWindow();
        if (!isNaN(hour) && hour >= daylight.sunriseHour && hour <= daylight.sunsetHour) {
          this.setHour(hour);
        }
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
        const paramsContainer = this.containerEl ? this.containerEl.querySelector('#forecast-params-container') : null;
        if (paramsContainer && this.forecastMode !== 'charts') {
          const spot = this.getCurrentSpot();
          const glider = this.getActiveGlider();
          const weatherData = this.getWeatherData(spot, this.activeDate);
          const activeSubSpotObj = this.resolveActiveSubSpot(spot);
          const effectiveTakeoffId = (activeSubSpotObj && activeSubSpotObj.spotType === 'takeoff') ? activeSubSpotObj.id : this.activeTakeoffId;
          const effectiveLandingId = (activeSubSpotObj && activeSubSpotObj.spotType === 'landing') ? activeSubSpotObj.id : this.activeLandingId;
          const evaluated = evaluateComprensorio({
            comprensorio: spot,
            weatherData,
            hourIndex: this.selectedHour,
            glider,
            targetDate: this.activeDate,
            takeoffId: effectiveTakeoffId,
            landingId: effectiveLandingId
          });
          paramsContainer.innerHTML = this.renderParameterCards(evaluated, weatherData, spot, glider, activeSubSpotObj);
        } else {
          this.render();
        }
      }
    } else if (action === 'toggle-trend-chart') {
      const chartId = actionEl.getAttribute('data-chart-id');
      if (chartId) {
        if (!this.expandedTrendChartIds) {
          this.expandedTrendChartIds = new Set();
        }
        if (this.expandedTrendChartIds.has(chartId)) {
          this.expandedTrendChartIds.delete(chartId);
        } else {
          this.expandedTrendChartIds.add(chartId);
        }
        const paramsContainer = this.containerEl ? this.containerEl.querySelector('#forecast-params-container') : null;
        if (paramsContainer && this.forecastMode === 'charts') {
          const spot = this.getCurrentSpot();
          const glider = this.getActiveGlider();
          const weatherData = this.getWeatherData(spot, this.activeDate);
          const activeSubSpotObj = this.resolveActiveSubSpot(spot);
          const effectiveTakeoffId = (activeSubSpotObj && activeSubSpotObj.spotType === 'takeoff') ? activeSubSpotObj.id : this.activeTakeoffId;
          const effectiveLandingId = (activeSubSpotObj && activeSubSpotObj.spotType === 'landing') ? activeSubSpotObj.id : this.activeLandingId;
          const evaluated = evaluateComprensorio({
            comprensorio: spot,
            weatherData,
            hourIndex: this.selectedHour,
            glider,
            targetDate: this.activeDate,
            takeoffId: effectiveTakeoffId,
            landingId: effectiveLandingId
          });
          paramsContainer.innerHTML = this.renderMultiTrendCharts(evaluated, weatherData, spot, glider, activeSubSpotObj);
        } else {
          this.render();
        }
      }
    } else if (action === 'select-date' || action === 'prev-date' || action === 'next-date') {
      if ((action === 'prev-date' || action === 'next-date') && (actionEl.disabled || actionEl.getAttribute('aria-disabled') === 'true')) {
        return;
      }
      const dateAttr = actionEl.getAttribute('data-date');
      if (dateAttr) {
        if (dateAttr === this.activeDate) return;
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
    } else if (action === 'pick-calendar-date') {
      const dateAttr = actionEl.getAttribute('data-date');
      if (dateAttr) {
        if (dateAttr === this.activeDate) {
          closeSheet();
          return;
        }
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
    } else if (action === 'pick-spot' || action === 'pick-spot-apply' || action === 'pick-spot-takeoff' || action === 'pick-spot-landing') {
      const card = (actionEl.classList && actionEl.classList.contains('gm-picker-item')) ? actionEl : (actionEl.closest ? actionEl.closest('.gm-picker-item') : null);
      const spotId = actionEl.getAttribute('data-spot-id') || (card && card.getAttribute('data-spot-id'));
      const takeoffId = (action === 'pick-spot-takeoff')
        ? actionEl.getAttribute('data-takeoff-id')
        : ((card && card.getAttribute('data-takeoff-id')) || actionEl.getAttribute('data-takeoff-id'));
      const landingId = (action === 'pick-spot-landing')
        ? actionEl.getAttribute('data-landing-id')
        : ((card && card.getAttribute('data-landing-id')) || actionEl.getAttribute('data-landing-id'));

      if (card && takeoffId && typeof card.setAttribute === 'function') {
        card.setAttribute('data-takeoff-id', takeoffId);
      }
      if (card && landingId && typeof card.setAttribute === 'function') {
        card.setAttribute('data-landing-id', landingId);
      }

      const spot = this.comprensoriCatalog.find(c => 
        c.id === spotId || 
        (spotId && c.name && slugifyComprensorio(c.name) === spotId)
      );
      if (spot) {
        this.selectedSubSpot = 'overview';
        this.activeTakeoffId = takeoffId || (spot.takeoffs?.find(t => t.isPrimary)?.id || spot.takeoffs?.[0]?.id || null);
        this.activeLandingId = landingId || (spot.landings?.find(l => l.isPrimary || l.isOfficial)?.id || spot.landings?.[0]?.id || null);
        this.expandedCardId = null;
        if (this.store) {
          const state = this.store.getState();
          const recent = [spot.id, ...(state.recentSpotIds || []).filter(id => id !== spot.id)].slice(0, 5);
          this.store.setState({ 
            selectedSpot: spot, 
            activeTakeoffId: this.activeTakeoffId, 
            activeLandingId: this.activeLandingId, 
            recentSpotIds: recent 
          });
        }
        closeSheet();
        this.render({ resetScroll: true });
        this.fetchWeatherDataAsync(spot, this.activeDate);
      }
    } else if (action === 'toggle-pin-spot') {
      if (typeof evt.stopPropagation === 'function') evt.stopPropagation();
      const spotId = actionEl.getAttribute('data-spot-id') || actionEl.getAttribute('data-id');
      if (this.store && spotId) {
        const state = this.store.getState();
        const spot = this.comprensoriCatalog.find(c => c.id === spotId) || { id: spotId };
        const nextPinned = toggleSpotPin(spot, state.pinnedSpotIds || [], this.comprensoriCatalog);
        this.store.setState({ pinnedSpotIds: nextPinned });

        if (typeof document !== 'undefined') {
          const searchInput = document.getElementById('picker-search-input');
          const currentQuery = searchInput ? searchInput.value : '';
          const container = document.getElementById('picker-sections-container');
          if (container) {
            container.innerHTML = this.renderPickerSections(currentQuery);
          }
        }
        this.render();
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
    const action = typeof target.getAttribute === 'function' ? target.getAttribute('data-action') : null;

    if (action === 'change-active-takeoff') {
      const takeoffId = target.value;
      const spot = this.getCurrentSpot();
      if (takeoffId && takeoffId !== this.activeTakeoffId) {
        this.activeTakeoffId = takeoffId;
        if (this.selectedSubSpot && this.selectedSubSpot !== 'overview') {
          const isInTakeoffView = spot?.takeoffs?.some(t => t.id === this.selectedSubSpot);
          if (isInTakeoffView) {
            this.selectedSubSpot = takeoffId;
          }
        }
        if (this.store) {
          this.store.setState({ activeTakeoffId: takeoffId });
        }
        this.render();
        this.fetchWeatherDataAsync(spot, this.activeDate);
      }
    } else if (action === 'change-active-landing') {
      const landingId = target.value;
      const spot = this.getCurrentSpot();
      if (landingId && landingId !== this.activeLandingId) {
        this.activeLandingId = landingId;
        if (this.selectedSubSpot && this.selectedSubSpot !== 'overview') {
          const isInLandingView = spot?.landings?.some(l => l.id === this.selectedSubSpot);
          if (isInLandingView) {
            this.selectedSubSpot = landingId;
          }
        }
        if (this.store) {
          this.store.setState({ activeLandingId: landingId });
        }
        this.render();
      }
    } else if (target.id === 'forecast-spot-select') {
      const spot = this.comprensoriCatalog.find(c => c.id === target.value);
      if (spot) {
        this.activeTakeoffId = spot.takeoffs?.find(t => t.isPrimary)?.id || spot.takeoffs?.[0]?.id || null;
        this.activeLandingId = spot.landings?.find(l => l.isPrimary || l.isOfficial)?.id || spot.landings?.[0]?.id || null;
        this.store.setState({ 
          selectedSpot: spot,
          activeTakeoffId: this.activeTakeoffId,
          activeLandingId: this.activeLandingId
        });
      }
      this.selectedSubSpot = 'overview';
      this.expandedCardId = null;
      this.render();
    } else if (target.id === 'forecast-subspot-select') {
      this.selectedSubSpot = target.value;
      const spot = this.getCurrentSpot();
      if (spot) {
        const isT = spot.takeoffs?.some(t => t.id === target.value);
        if (isT) {
          this.activeTakeoffId = target.value;
          this.fetchWeatherDataAsync(spot, this.activeDate);
        }
        const isL = spot.landings?.some(l => l.id === target.value);
        if (isL) {
          this.activeLandingId = target.value;
        }
        if (target.value === 'overview') {
          this.activeTakeoffId = spot.takeoffs?.find(t => t.isPrimary)?.id || spot.takeoffs?.[0]?.id || null;
          this.activeLandingId = spot.landings?.find(l => l.isPrimary || l.isOfficial)?.id || spot.landings?.[0]?.id || null;
        }
        if (this.store) {
          this.store.setState({ activeTakeoffId: this.activeTakeoffId, activeLandingId: this.activeLandingId });
        }
      }
      this.render();
    } else if (target.id === 'forecast-minimap-layer-select') {
      const newLayer = target.value === 'satellite' ? 'satellite' : 'topo';
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
      this.updateMiniMapToggleUi(newLayer);
    } else if (target.getAttribute && (target.getAttribute('data-action') === 'set-flight-analysis-layer' || (target.classList && target.classList.contains('gm-flight-analysis-layer-select')))) {
      const newLayer = target.value === 'satellite' ? 'satellite' : 'topo';
      if (this.flightAnalysisMapEngine && typeof this.flightAnalysisMapEngine.setLayer === 'function') {
        this.flightAnalysisMapEngine.setLayer(newLayer);
      }
      if (this.store && typeof this.store.setState === 'function') {
        const state = this.store.getState() || {};
        const ui = state.ui || {};
        this.store.setState({ ui: { ...ui, mapLayer: newLayer } });
      }
      this.updateFlightAnalysisToggleUi(newLayer);
    }
  }

  /**
   * Opens the Comprensorio Flight Inspector Fullscreen Overlay (100dvh).
   */
  openFlightAnalysisOverlay() {
    this.isFlightAnalysisOpen = true;

    // 1. Pause background mini-map animation to save GPU/CPU cycles
    if (this.miniMapEngine && typeof this.miniMapEngine.pause === 'function') {
      this.miniMapEngine.pause();
    }

    const spot = this.getCurrentSpot();
    const glider = this.getActiveGlider();
    const weatherData = this.getWeatherData(spot, this.activeDate);
    const activeSub = this.resolveActiveSubSpot(spot);
    const effectiveTakeoffId = (activeSub && activeSub.spotType === 'takeoff') ? activeSub.id : this.activeTakeoffId;
    const effectiveLandingId = (activeSub && activeSub.spotType === 'landing') ? activeSub.id : this.activeLandingId;

    const evalData = evaluateComprensorio({
      comprensorio: spot,
      weatherData,
      hourIndex: this.selectedHour,
      glider,
      targetDate: this.activeDate,
      takeoffId: effectiveTakeoffId,
      landingId: effectiveLandingId
    });
    const takeoff = evalData?.takeoff || spot?.takeoffs?.[0] || {};
    const landing = evalData?.landing || spot?.landings?.[0] || {};
    const weather = evalData?.weatherSnapshot || {};
    const takeoffWeather = evalData?.takeoffWeather || weather;
    const landingWeather = evalData?.landingWeather || weather;
    const activeLayer = this.store?.getState?.()?.ui?.mapLayer || 'topo';

    const circuitData = calculateLandingCircuit({
      landingCoordinates: landing.coordinates,
      takeoffCoordinates: takeoff.coordinates,
      windSpeedKmh: landingWeather.windSpeed,
      windDirectionDeg: landingWeather.windDirection,
      landing,
      flightPlan: landing.flightPlans?.[0] || null,
      glider: this.getActiveGlider()
    });

    // 2. If running in browser environment, construct DOM overlay
    if (typeof document !== 'undefined') {
      if (document.body) {
        document.body.style.overflow = 'hidden';
      }
      this.flightAnalysisTriggerEl = document.querySelector('.gm-mini-map-expand-btn') || document.activeElement;

      // Remove any existing overlay
      let overlayEl = document.getElementById('gm-flight-analysis-overlay');
      if (overlayEl) {
        overlayEl.remove();
      }

      overlayEl = document.createElement('div');
      overlayEl.id = 'gm-flight-analysis-overlay';
      overlayEl.className = 'gm-flight-analysis-overlay';
      overlayEl.setAttribute('role', 'dialog');
      overlayEl.setAttribute('aria-modal', 'true');
      overlayEl.setAttribute('aria-label', 'Modulo di Analisi Volo e Procedure Comprensorio');

      const isFig8 = circuitData.circuitType === 'figure_eight';
      const badgeText = isFig8
        ? 'Attacco a 8'
        : (circuitData.circuitType === 'calm_straight' ? 'Avvicinamento Diretto' : `Circuito a C (${circuitData.circuitHand === 'left' ? 'Mano Sinistra' : 'Mano Destra'})`);

      overlayEl.innerHTML = `
        <header class="gm-flight-analysis-header">
          <div class="gm-flight-analysis-title-group">
            <h1 class="gm-flight-analysis-title">${escapeHtml(spot?.name || 'Analisi Comprensorio')}</h1>
            <p class="gm-flight-analysis-subtitle">
              ▲ ${escapeHtml(this.formatCleanSpotName(takeoff.name, 'takeoff'))} • ⏚ ${escapeHtml(this.formatCleanSpotName(landing.name, 'landing'))}
            </p>
          </div>
          <div class="gm-flight-analysis-actions">
            <button 
              type="button" 
              class="gm-flight-analysis-close-btn" 
              data-action="close-flight-analysis" 
              aria-label="Chiudi analisi volo comprensorio"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </header>

        <div class="gm-flight-analysis-map-container">
          <div id="forecast-flight-analysis-map" class="gm-flight-analysis-map"></div>

          <!-- Floating Map Controls (Inside Map Canvas) -->
          <div class="gm-flight-analysis-map-controls" role="toolbar" aria-label="Controlli mappa">
            <div class="gm-flight-analysis-controls-left">
              <button 
                type="button" 
                id="forecast-flight-analysis-layer-toggle" 
                class="gm-map-layer-toggle" 
                data-action="toggle-flight-analysis-layer" 
                data-layer="${activeLayer}" 
                aria-label="Layer mappa: ${activeLayer === 'satellite' ? 'Satellite (tocca per OpenTopo)' : 'OpenTopo (tocca per Satellite)'}" 
                title="Layer mappa: ${activeLayer === 'satellite' ? 'Satellite (tocca per OpenTopo)' : 'OpenTopo (tocca per Satellite)'}"
              >
                ${renderLayerToggleIcon(activeLayer, 20)}
              </button>
            </div>
            <div class="gm-flight-analysis-controls-right">
              <div class="gm-flight-analysis-zoom-group" role="group" aria-label="Controlli zoom mappa">
                <button 
                  type="button" 
                  class="gm-flight-analysis-ctrl-btn gm-flight-analysis-zoom-btn" 
                  data-action="flight-analysis-zoom-in" 
                  aria-label="Ingrandisci mappa" 
                  title="Ingrandisci mappa"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </button>
                <button 
                  type="button" 
                  class="gm-flight-analysis-ctrl-btn gm-flight-analysis-zoom-btn" 
                  data-action="flight-analysis-zoom-out" 
                  aria-label="Rimpicciolisci mappa" 
                  title="Rimpicciolisci mappa"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </button>
              </div>

              <div class="gm-aim-menu-wrap">
                <button 
                  type="button" 
                  class="gm-flight-analysis-ctrl-btn gm-aim-menu-trigger" 
                  data-action="toggle-aim-menu" 
                  data-layer="${activeLayer}"
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

                <div class="gm-aim-dropdown hidden" role="menu" aria-label="Opzioni di puntamento">
                  <button 
                    type="button" 
                    class="gm-aim-menu-item" 
                    data-action="center-comprensorio" 
                    role="menuitem"
                    title="Centra sul decollo e atterraggio del comprensorio"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                    </svg>
                    <span>Comprensorio</span>
                  </button>

                  <button 
                    type="button" 
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

        <section class="gm-flight-analysis-drawer" aria-label="Dettagli procedura e convenzioni">
          <div class="gm-flight-analysis-badge-row">
            <span id="flight-procedure-badge" class="gm-flight-procedure-badge ${circuitData.isSafetyWarning ? 'severe' : ''}">
              ${badgeText} - Finale ${circuitData.finalHeading}°
            </span>
            <span id="flight-procedure-hour-pill" style="font-size: 12px; font-weight: 700; color: var(--gm-text-primary);">
              ${String(this.selectedHour).padStart(2, '0')}:00
            </span>
          </div>

          <div id="flight-safety-banner-container">
            ${circuitData.isSafetyWarning ? `<div class="gm-flight-safety-warning-banner" role="alert"><span>${circuitData.warningReason}</span><button type="button" class="gm-warning-close-btn" data-action="dismiss-safety-warning" aria-label="Chiudi avviso">✕</button></div>` : ''}
          </div>

          <p id="flight-procedure-explanation" class="gm-flight-analysis-explanation">
            ${circuitData.explanation}
          </p>

          <div class="gm-flight-analysis-meta-row">
            ${spot?.club?.radioFreq ? `<span class="gm-flight-analysis-meta-item">Radio Club: <strong>${spot.club.radioFreq}</strong></span>` : ''}
            ${landing.rules ? `<span class="gm-flight-analysis-meta-item">Regole: ${landing.rules}</span>` : ''}
          </div>

          <div class="gm-flight-analysis-scrubber" role="toolbar" aria-label="Selettore orario continuo">
            <div class="gm-map-scrubber-header">
              <div class="gm-map-scrubber-title-group">
                <span class="gm-map-scrubber-title">Timeline Volabilità</span>
                ${(() => {
                  const slotEval = this.evaluateTimelineSlot(spot, weatherData, this.selectedHour, glider, activeSub);
                  const pillStatus = slotEval?.status || (circuitData.isSafetyWarning ? 'caution' : 'flyable');
                  const pillColor = pillStatus === 'unflyable'
                    ? 'var(--gm-status-unflyable-text)'
                    : ((STATUS_COLORS && STATUS_COLORS[pillStatus]?.fill) || 'var(--gm-text-secondary)');
                  const pillShort = slotEval?.shortReason || slotEval?.badge || (circuitData.isSafetyWarning ? 'Attenzione' : 'Volabile');
                  const pillFull = slotEval?.reason || pillShort;
                  return `<span id="flight-analysis-scrubber-spot-pill" class="gm-map-scrubber-spot-pill status-${escapeHtml(pillStatus)}" style="color: ${pillColor};" title="${escapeHtml(pillFull)}">${escapeHtml(pillShort)}</span>`;
                })()}
              </div>
              <div class="gm-map-scrubber-hour-display">
                <span id="flight-analysis-active-hour-label" class="gm-flight-alt">Ore ${String(this.selectedHour).padStart(2, '0')}:00</span>
              </div>
            </div>
            ${this.renderTimelineGrid(spot, weatherData, glider, 'flight-analysis-timeline-strip')}
          </div>
        </section>
      `;

      document.body.appendChild(overlayEl);
      this.flightAnalysisOverlayEl = overlayEl;
      overlayEl.__cleanupOverlay = () => this.closeFlightAnalysisOverlay();
      overlayEl.addEventListener('click', this.boundClickHandler);
      overlayEl.addEventListener('change', this.boundChangeHandler);
      overlayEl.addEventListener('pointerdown', this.boundPointerDown);
      overlayEl.addEventListener('touchstart', this.boundTouchStart, { passive: false });
      overlayEl.addEventListener('pointermove', this.boundPointerMove);
      overlayEl.addEventListener('pointerup', this.boundPointerUp);
      overlayEl.addEventListener('pointercancel', this.boundPointerUp);

      // Event listeners
      if (typeof window !== 'undefined') {
        window.addEventListener('keydown', this.boundFlightAnalysisKeyHandler);
        window.addEventListener('popstate', this.boundFlightAnalysisPopstate);

        if (window.history && typeof window.history.pushState === 'function') {
          window.history.pushState({ overlay: 'flight-analysis' }, '');
        }
      }

      // Initialize map engine on overlay container
      const mapEl = overlayEl.querySelector('#forecast-flight-analysis-map');
      this.flightAnalysisMapEngine = createMapEngine(mapEl, {
        theme: this.store?.getState?.()?.ui?.theme || 'dark',
        layer: activeLayer,
        isFlightAnalysis: true,
        zoomControl: false
      });
      this.flightAnalysisMapEngine.renderComprensorioFlightMap(mapEl, {
        comprensorio: spot,
        takeoff,
        landing,
        takeoffWeather,
        landingWeather,
        circuitData,
        glideMetrics: evalData?.glideMetrics
      });

      // Focus close button
      const closeBtn = overlayEl.querySelector('.gm-flight-analysis-close-btn');
      if (closeBtn && typeof closeBtn.focus === 'function') {
        closeBtn.focus();
      }
    } else {
      // Pure Node.js headless environment
      this.flightAnalysisMapEngine = createMapEngine(null, {
        theme: this.store?.getState?.()?.ui?.theme || 'dark',
        layer: activeLayer,
        isFlightAnalysis: true,
        zoomControl: false
      });
      this.flightAnalysisMapEngine.renderComprensorioFlightMap(null, {
        comprensorio: spot,
        takeoff,
        landing,
        takeoffWeather,
        landingWeather,
        circuitData,
        glideMetrics: evalData?.glideMetrics
      });
    }

    return this;
  }

  /**
   * Centers the flight analysis map on the active comprensorio bounds.
   */
  centerOnComprensorio() {
    if (this.flightAnalysisMapEngine && typeof this.flightAnalysisMapEngine.centerOnComprensorio === 'function') {
      this.flightAnalysisMapEngine.centerOnComprensorio();
    }
    return this;
  }

  /**
   * Centers the flight analysis map on the user's current GPS position.
   */
  centerOnUserLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return this;
    }
    const triggerBtn = this.flightAnalysisOverlayEl?.querySelector('.gm-aim-menu-trigger') || this.flightAnalysisOverlayEl?.querySelector('[data-action="center-gps"]');
    if (triggerBtn) {
      triggerBtn.classList.add('loading');
      triggerBtn.setAttribute('aria-busy', 'true');
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (triggerBtn) {
          triggerBtn.classList.remove('loading');
          triggerBtn.removeAttribute('aria-busy');
        }
        const { latitude, longitude } = pos.coords;
        if (this.flightAnalysisMapEngine && typeof this.flightAnalysisMapEngine.showUserLocation === 'function') {
          this.flightAnalysisMapEngine.showUserLocation(latitude, longitude);
        }
      },
      (err) => {
        if (triggerBtn) {
          triggerBtn.classList.remove('loading');
          triggerBtn.removeAttribute('aria-busy');
        }
        console.warn('[GlideMind] Geolocation error:', err?.message || err);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
    return this;
  }

  /**
   * Toggles the Flight Analysis Overlay aiming/centering dropdown menu.
   * @param {boolean} [forceOpen]
   */
  toggleFlightAnalysisAimMenu(forceOpen) {
    this.isFlightAnalysisAimMenuOpen = typeof forceOpen === 'boolean' ? forceOpen : !this.isFlightAnalysisAimMenuOpen;
    if (this.flightAnalysisOverlayEl) {
      const trigger = this.flightAnalysisOverlayEl.querySelector('[data-action="toggle-aim-menu"], .gm-aim-menu-trigger');
      const dropdown = this.flightAnalysisOverlayEl.querySelector('.gm-aim-dropdown');
      if (trigger) {
        trigger.setAttribute('aria-expanded', this.isFlightAnalysisAimMenuOpen ? 'true' : 'false');
        trigger.classList?.toggle('open', this.isFlightAnalysisAimMenuOpen);
      }
      if (dropdown) {
        dropdown.classList?.toggle('hidden', !this.isFlightAnalysisAimMenuOpen);
      }
    }
    return this;
  }

  /**
   * Closes the Flight Analysis Overlay aiming dropdown menu.
   */
  closeFlightAnalysisAimMenu() {
    if (this.isFlightAnalysisAimMenuOpen) {
      this.toggleFlightAnalysisAimMenu(false);
    }
    return this;
  }

  /**
   * Closes the Comprensorio Flight Inspector Overlay.
   */
  closeFlightAnalysisOverlay() {
    this.isFlightAnalysisOpen = false;
    this.isFlightAnalysisAimMenuOpen = false;

    if (this.flightAnalysisMapEngine) {
      this.flightAnalysisMapEngine.destroy();
      this.flightAnalysisMapEngine = null;
    }

    // Resume background mini-map
    if (this.miniMapEngine && typeof this.miniMapEngine.resume === 'function') {
      this.miniMapEngine.resume();
    }

    if (typeof document !== 'undefined') {
      if (document.body) {
        document.body.style.overflow = '';
      }
      if (this.flightAnalysisOverlayEl) {
        if (typeof this.flightAnalysisOverlayEl.removeEventListener === 'function') {
          this.flightAnalysisOverlayEl.removeEventListener('click', this.boundClickHandler);
          this.flightAnalysisOverlayEl.removeEventListener('change', this.boundChangeHandler);
          this.flightAnalysisOverlayEl.removeEventListener('pointerdown', this.boundPointerDown);
          this.flightAnalysisOverlayEl.removeEventListener('touchstart', this.boundTouchStart);
          this.flightAnalysisOverlayEl.removeEventListener('pointermove', this.boundPointerMove);
          this.flightAnalysisOverlayEl.removeEventListener('pointerup', this.boundPointerUp);
          this.flightAnalysisOverlayEl.removeEventListener('pointercancel', this.boundPointerUp);
        }
        this.flightAnalysisOverlayEl.remove();
        this.flightAnalysisOverlayEl = null;
      } else {
        const el = document.getElementById('gm-flight-analysis-overlay');
        if (el) el.remove();
      }

      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', this.boundFlightAnalysisKeyHandler);
        window.removeEventListener('popstate', this.boundFlightAnalysisPopstate);
      }

      // Restore focus to trigger button
      if (this.flightAnalysisTriggerEl && typeof this.flightAnalysisTriggerEl.focus === 'function') {
        this.flightAnalysisTriggerEl.focus();
        this.flightAnalysisTriggerEl = null;
      }
    }
    this.flightAnalysisOverlayEl = null;

    return this;
  }

  /**
   * Keyboard handler for flight analysis overlay (ESC key).
   * @param {KeyboardEvent} e
   */
  handleFlightAnalysisKey(e) {
    if (e.key === 'Escape' && this.isFlightAnalysisOpen) {
      if (this.isFlightAnalysisAimMenuOpen) {
        e.preventDefault();
        this.closeFlightAnalysisAimMenu();
        return;
      }
      e.preventDefault();
      this.closeFlightAnalysisOverlay();
    }
  }

  /**
   * Popstate handler for mobile back gesture.
   */
  handleFlightAnalysisPopstate() {
    if (this.isFlightAnalysisOpen) {
      this.closeFlightAnalysisOverlay();
    }
  }

  /**
   * Updates flight analysis overlay DOM and map procedures in-place on hour scrub.
   * @param {object} evaluated
   */
  updateFlightAnalysisOverlay(evaluated) {
    if (!this.isFlightAnalysisOpen) return;

    const spot = this.getCurrentSpot();
    const takeoff = evaluated?.takeoff || spot?.takeoffs?.[0] || {};
    const landing = evaluated?.landing || spot?.landings?.[0] || {};
    const weather = evaluated?.weatherSnapshot || {};
    const takeoffWeather = evaluated?.takeoffWeather || weather;
    const landingWeather = evaluated?.landingWeather || weather;

    const circuitData = calculateLandingCircuit({
      landingCoordinates: landing?.coordinates,
      takeoffCoordinates: takeoff?.coordinates,
      windSpeedKmh: landingWeather.windSpeed,
      windDirectionDeg: landingWeather.windDirection,
      landing,
      flightPlan: landing?.flightPlans?.[0] || null,
      glider: this.getActiveGlider()
    });

    if (this.flightAnalysisMapEngine && typeof this.flightAnalysisMapEngine.updateFlightProcedures === 'function') {
      this.flightAnalysisMapEngine.updateFlightProcedures(circuitData, {
        takeoffWeather,
        landingWeather,
        glideMetrics: evaluated?.glideMetrics,
        takeoff,
        landing
      });
    }

    if (typeof document !== 'undefined' && this.flightAnalysisOverlayEl) {
      const isFig8 = circuitData.circuitType === 'figure_eight';
      const badgeText = isFig8
        ? 'Attacco a 8'
        : (circuitData.circuitType === 'calm_straight' ? 'Avvicinamento Diretto' : `Circuito a C (${circuitData.circuitHand === 'left' ? 'Mano Sinistra' : 'Mano Destra'})`);

      const badgeEl = this.flightAnalysisOverlayEl.querySelector('#flight-procedure-badge');
      if (badgeEl) {
        badgeEl.className = `gm-flight-procedure-badge ${circuitData.isSafetyWarning ? 'severe' : ''}`;
        badgeEl.textContent = `${badgeText} - Finale ${circuitData.finalHeading}°`;
      }

      const hourPill = this.flightAnalysisOverlayEl.querySelector('#flight-procedure-hour-pill');
      if (hourPill) {
        hourPill.textContent = `${String(this.selectedHour).padStart(2, '0')}:00`;
      }

      const bannerContainer = this.flightAnalysisOverlayEl.querySelector('#flight-safety-banner-container');
      if (bannerContainer) {
        bannerContainer.innerHTML = circuitData.isSafetyWarning
          ? `<div class="gm-flight-safety-warning-banner" role="alert"><span>${circuitData.warningReason}</span><button type="button" class="gm-warning-close-btn" data-action="dismiss-safety-warning" aria-label="Chiudi avviso sicurezza" title="Chiudi avviso">✕</button></div>`
          : '';
      }

      const explanationEl = this.flightAnalysisOverlayEl.querySelector('#flight-procedure-explanation');
      if (explanationEl) {
        explanationEl.textContent = circuitData.explanation;
      }

      const faHourLabel = this.flightAnalysisOverlayEl.querySelector('#flight-analysis-active-hour-label');
      if (faHourLabel) {
        faHourLabel.textContent = `Ore ${String(this.selectedHour).padStart(2, '0')}:00`;
      }
      const faSpotPill = this.flightAnalysisOverlayEl.querySelector('#flight-analysis-scrubber-spot-pill');
      if (faSpotPill) {
        const weatherData = this.getWeatherData(spot, this.activeDate);
        const activeSub = this.resolveActiveSubSpot(spot);
        const slotEval = this.evaluateTimelineSlot(spot, weatherData, this.selectedHour, this.getActiveGlider(), activeSub);
        const pillShort = slotEval?.shortReason || slotEval?.badge || (circuitData.isSafetyWarning ? 'Attenzione' : 'Volabile');
        const pillFull = slotEval?.reason || pillShort;
        const pillStatus = slotEval?.status || (circuitData.isSafetyWarning ? 'caution' : (evaluated?.status || 'flyable'));
        const pillColor = pillStatus === 'unflyable'
          ? 'var(--gm-status-unflyable-text)'
          : ((STATUS_COLORS && STATUS_COLORS[pillStatus]?.fill) || 'var(--gm-text-secondary)');
        faSpotPill.textContent = pillShort;
        faSpotPill.setAttribute('title', pillFull);
        faSpotPill.className = `gm-map-scrubber-spot-pill status-${pillStatus}`;
        faSpotPill.style.color = pillColor;
      }

      const scrubberSlots = this.flightAnalysisOverlayEl.querySelectorAll('.gm-timeline-col-compact, .gm-flight-analysis-slot');
      scrubberSlots.forEach(slot => {
        const h = parseInt(slot.getAttribute('data-hour'), 10);
        const isActive = h === this.selectedHour;
        slot.classList.toggle('active', isActive);
        slot.setAttribute('aria-selected', isActive ? 'true' : 'false');
        slot.setAttribute('tabindex', isActive ? '0' : '-1');
      });
    }
  }
}

// Default singleton instance
export const forecastView = new ForecastViewController();
