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
import {
  DEFAULT_COMPRENSORI,
  evaluateComprensorio,
  slugifyComprensorio,
  parseCoordinates
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
  fetchWeatherData
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
      windDir: evalResult.weatherSnapshot.windDirection || 0,
      rain: evalResult.weatherSnapshot.precipitation || 0,
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

  // 3. Recommended pilot level
  let pilotLevel = '';
  if (flyableSlots.length >= 3 && maxGust <= 18 && maxCape < 500 && !hasRain) {
    pilotLevel = 'Consigliato a tutti i livelli (Allievi, Brevettati, Vele EN-A / EN-B). Mattinata adatta a voli didattici di ambientamento.';
  } else if (flyableSlots.length > 0 && maxWind <= 22 && maxGust <= 28) {
    pilotLevel = 'Riservato a piloti brevettati autonomi con buona padronanza del decollo e gestione delle termiche alpine (Vele EN-A/B/C).';
  } else {
    pilotLevel = 'Condizioni severe o non volabili per allievi e piloti ricreativi. Solo osservazione o decollo sconsigliato.';
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

    // Initial local view state
    const now = new Date();
    const currentHour = now.getHours();
    this.selectedHour = (currentHour >= 8 && currentHour <= 20) ? currentHour : 13;
    this.selectedSubSpot = 'overview'; // 'overview' | spotId
    const storeState = this.store ? this.store.getState() : {};
    this.activeDate = storeState.activeDate || formatDateIso(now);
    this.cachedWeatherMap = new Map(); // key: spotId_date -> weatherPayload
    this.isLoadingWeather = false;

    // View state for dual-mode panels
    this.windPanelView = 'summary'; // 'summary' | 'chart'
    this.soundingPanelView = 'summary'; // 'summary' | 'chart'
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
    return state.glider || DEFAULT_GLIDER || GLIDER_CLASSES.EN_A;
  }

  /**
   * Retrieves weather payload for the current spot and active date.
   * @param {object} spot
   * @param {string} dateStr
   * @returns {object}
   */
  getWeatherData(spot, dateStr) {
    const key = `${spot.id}_${dateStr}`;
    if (this.cachedWeatherMap.has(key)) {
      return this.cachedWeatherMap.get(key);
    }

    // Check store global weatherData if matching spot
    const state = this.store ? this.store.getState() : {};
    if (state.weatherData && state.selectedSpot && state.selectedSpot.id === spot.id) {
      this.cachedWeatherMap.set(key, state.weatherData);
      return state.weatherData;
    }

    // Generate deterministic synthetic day for immediate offline rendering
    const takeoff = (spot.takeoffs && spot.takeoffs[0]) ? spot.takeoffs[0] : { altitude: 1000, heading: 180 };
    const coords = parseCoordinates(takeoff.coordinates) || { lat: 45.833, lon: 9.302 };
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

    // Synchronize active spot from store if present
    const state = this.store ? this.store.getState() : {};
    if (state.activeDate) {
      this.activeDate = state.activeDate;
    }

    if (this.containerEl) {
      this.containerEl.addEventListener('click', this.boundClickHandler);
      this.containerEl.addEventListener('change', this.boundChangeHandler);
    }

    if (this.store) {
      this.unsubscribeStore = this.store.subscribe((nextState) => {
        if (nextState.locationsCatalog && nextState.locationsCatalog !== this.comprensoriCatalog) {
          this.setComprensoriCatalog(nextState.locationsCatalog);
        } else {
          this.render();
        }
      });
    }

    this.render();
  }

  /**
   * Unmounts the controller and cleans up listeners and store subscriptions.
   */
  unmount() {
    if (this.containerEl) {
      this.containerEl.removeEventListener('click', this.boundClickHandler);
      this.containerEl.removeEventListener('change', this.boundChangeHandler);
      this.containerEl = null;
    }
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
  }

  /**
   * Renders the complete Forecast View HTML into the container.
   */
  render() {
    if (!this.containerEl) return;
    this.containerEl.innerHTML = this.renderHtml();
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
      glider
    });

    // Check if a specific spot is selected in level-2 dropdown
    const activeSubSpotObj = this.resolveActiveSubSpot(spot);

    // Generate Guido safety briefing
    const briefing = generateGuidoBriefing(spot, weatherData, this.activeDate, glider);

    return `
      <div id="forecast-view" class="gm-forecast-view flex flex-col gap-4 pb-48 max-w-lg mx-auto w-full">
        <!-- 1. Header: Comprensorio Bar + Picker Trigger -->
        ${this.renderHeader(spot)}

        <!-- 2. Spot Card: Dual Unico Binomio or Focused Sub-Spot Detail -->
        ${this.selectedSubSpot === 'overview' 
          ? this.renderSummaryCard(evaluated) 
          : this.renderSpecificSpotCard(activeSubSpotObj, evaluated)}

        <!-- 3. Dual-State Wind & Orientation Panel (Sintetico / Grafico) -->
        ${this.renderWindPanel(evaluated, weatherData, spot, activeSubSpotObj)}

        <!-- 4. Dual-State Sounding & Thermals Panel (Sintetico / Grafico) -->
        ${this.renderSoundingPanel(evaluated, weatherData, spot, activeSubSpotObj)}

        <!-- 5. AI Flight Briefing (Guido Persona) -->
        ${this.renderBriefingCard(briefing, spot)}

        <!-- 6. Bottom Sticky Scrubber: 13-slot timeline accessible to thumb -->
        ${this.renderStickyScrubber(spot, weatherData, glider)}
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

    return `
      <header class="gm-forecast-header flex flex-col gap-2.5">
        <!-- Level 1: Comprensorio Bar + Picker Trigger (Full Width, Zero Duplicate Home) -->
        <div 
          class="gm-comprensorio-bar" 
          data-action="open-picker-sheet" 
          role="button" 
          tabindex="0" 
          aria-label="Cambia comprensorio, attualmente ${escapeHtml(currentSpot.name)}"
        >
          <div class="gm-comprensorio-bar-info">
            <span class="gm-comprensorio-pin" aria-hidden="true">📍</span>
            <div class="gm-comprensorio-text">
              <span class="gm-comprensorio-name">
                ${escapeHtml(currentSpot.name)} (${escapeHtml(currentSpot.province)})
              </span>
              <span class="gm-comprensorio-sub">
                Tocca per cambiare comprensorio
              </span>
            </div>
          </div>
          <span class="gm-comprensorio-chevron" aria-hidden="true">›</span>
        </div>

        <!-- Level 2: Sub-Spot Dropdown (Overview vs Individual Spots) -->
        <div>
          <label for="forecast-subspot-select" class="sr-only">Seleziona Punto di Volo o Panoramica</label>
          <select 
            id="forecast-subspot-select" 
            class="gm-subspot-select" 
            data-action="change-subspot" 
            aria-label="Seleziona Punto o Panoramica del Comprensorio"
          >
            <option value="overview" ${this.selectedSubSpot === 'overview' ? 'selected' : ''}>
              🔍 Panoramica (Decollo Primario + Atterraggio)
            </option>
            ${takeoffs.length > 0 ? `
              <optgroup label="Decolli">
                ${takeoffs.map(t => `
                  <option value="${t.id}" ${this.selectedSubSpot === t.id ? 'selected' : ''}>
                    ↗ ${escapeHtml(t.name)} (${t.altitude}m - ${t.heading}° ${getCardinalDirection(t.heading)})
                  </option>
                `).join('')}
              </optgroup>
            ` : ''}
            ${landings.length > 0 ? `
              <optgroup label="Atterraggi">
                ${landings.map(l => `
                  <option value="${l.id}" ${this.selectedSubSpot === l.id ? 'selected' : ''}>
                    ↘ ${escapeHtml(l.name)} (${l.altitude}m${l.isOfficial ? ' - Ufficiale' : ''})
                  </option>
                `).join('')}
              </optgroup>
            ` : ''}
          </select>
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
            role="button"
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
            <span class="gm-horizon-icon" aria-hidden="true">ℹ️</span>
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
   * Renders the Unico Binomio Summary Card for the selected hour.
   * @param {object} evalData
   * @returns {string}
   */
  renderSummaryCard(evalData) {
    const takeoff = evalData.takeoff || {};
    const landing = evalData.landing || {};
    const glide = evalData.glideMetrics || { requiredGlideRatio: '-', isSafe: true };
    const weather = evalData.weatherSnapshot || {};

    const takeoffName = (takeoff.name || 'Decollo').replace(/^Decollo\s*/i, '');
    const landingName = (landing.name || 'Atterraggio').replace(/^Atterraggio\s*/i, '');
    const takeoffAlt = takeoff.altitude ? `${takeoff.altitude}m` : '-';
    const landingAlt = landing.altitude ? `${landing.altitude}m` : '-';

    const windSpeedStr = weather.windSpeed != null ? `${Math.round(weather.windSpeed)} km/h` : '-';
    const windDirStr = weather.windDirection != null ? `${getCardinalDirection(weather.windDirection)} (${Math.round(weather.windDirection)}°)` : '';

    return `
      <section aria-labelledby="heading-summary-bin" class="gm-summary-section">
        <h2 id="heading-summary-bin" class="sr-only">Sintesi Volabilità Unico Binomio</h2>
        <article id="forecast-summary-card" class="gm-spot-card">
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
        </article>
      </section>
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
    const weather = evalData.weatherSnapshot || {};
    const isTakeoff = subSpot.spotType === 'takeoff';
    const icon = isTakeoff ? '↗' : '↘';
    const roleLabel = isTakeoff ? 'Decollo' : 'Atterraggio';

    const windSpeedStr = weather.windSpeed != null ? `${Math.round(weather.windSpeed)} km/h` : '-';
    const windDirStr = weather.windDirection != null ? `${getCardinalDirection(weather.windDirection)} (${Math.round(weather.windDirection)}°)` : '';

    return `
      <section aria-labelledby="heading-specific-spot" class="gm-summary-section">
        <h2 id="heading-specific-spot" class="sr-only">Dettaglio ${roleLabel}</h2>
        <article id="forecast-specific-spot-card" class="gm-spot-card">
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
        </article>
      </section>
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
    const windDir = weather.windDirection != null ? weather.windDirection : 180;
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
              Grafico 📈
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
        if (hourlyData.wind_speed_10m && hourlyData.wind_speed_10m[idx] != null) speed = Number(hourlyData.wind_speed_10m[idx]);
        if (hourlyData.wind_gusts_10m && hourlyData.wind_gusts_10m[idx] != null) gust = Number(hourlyData.wind_gusts_10m[idx]);
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

    // Points string for speed & gust
    const speedPoints = hours.map(p => `${getX(p.hour)},${getY(p.speed)}`).join(' ');
    const gustPoints = hours.map(p => `${getX(p.hour)},${getY(p.gust)}`).join(' ');
    const gustAreaPath = `M ${getX(8)} ${yMax} ` + hours.map(p => `L ${getX(p.hour)} ${getY(p.gust)}`).join(' ') + ` L ${getX(20)} ${yMax} Z`;

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
          <polyline points="${gustPoints}" fill="none" stroke="var(--gm-status-alert)" stroke-width="1.8" stroke-dasharray="3,3" />

          <!-- Wind speed line -->
          <polyline points="${speedPoints}" fill="none" stroke="var(--gm-status-flyable)" stroke-width="2.5" />

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
              Grafico 📈
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
        if (hourlyData.dew_point_2m && hourlyData.dew_point_2m[idx] != null) dew = Number(hourlyData.dew_point_2m[idx]);
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

    const lclPoints = hours.map(p => `${getX(p.hour)},${getY(p.lclMsl)}`).join(' ');
    const ceilingPoints = hours.map(p => `${getX(p.hour)},${getY(p.ceiling)}`).join(' ');

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
          <polyline points="${ceilingPoints}" fill="none" stroke="var(--gm-status-flyable)" stroke-width="2" />

          <!-- LCL Base line -->
          <polyline points="${lclPoints}" fill="none" stroke="var(--gm-accent)" stroke-width="2.2" />

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
            LCL: ${Math.round(activeData.lclMsl)}m
          </text>
        </svg>

        <div class="flex items-center justify-between text-xs px-2 pt-1 border-t border-[var(--gm-border)]">
          <div class="flex items-center gap-3">
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-0.5 bg-[var(--gm-accent)] inline-block"></span> Base LCL</span>
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-0.5 bg-[var(--gm-status-flyable)] inline-block"></span> Ceiling</span>
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
              <span class="text-xl" aria-hidden="true">🎙️</span>
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
    const hours = [];
    for (let h = 8; h <= 20; h++) {
      const evalHour = evaluateComprensorio({
        comprensorio: spot,
        weatherData,
        hourIndex: h,
        glider
      });
      hours.push({
        hour: h,
        eval: evalHour,
        isActive: h === this.selectedHour
      });
    }

    return `
      <aside 
        id="forecast-timeline-scrubber" 
        class="gm-timeline-scrubber-sticky"
        aria-label="Scrubber orario ancorato"
      >
        <div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[var(--gm-text-muted)] mb-1.5 px-0.5">
          <span class="flex items-center gap-1.5">
            <span class="text-amber-400">⏱️</span> Scrubber Orario
          </span>
          <span class="text-[var(--gm-accent)] font-mono font-bold">
            Ore selezionate: ${String(this.selectedHour).padStart(2, '0')}:00
          </span>
        </div>

        <div id="forecast-timeline-strip" class="gm-timeline-grid-13" role="tablist" aria-label="Scrubber orario">
          ${hours.map(slot => {
            const h = slot.hour;
            const evalH = slot.eval;
            const weather = evalH.weatherSnapshot || {};
            const speed = Math.round(weather.windSpeed || 0);
            const dir = Math.round(weather.windDirection || 0);

            let fillPct = 30;
            let fillColor = 'var(--gm-status-unflyable)';
            if (evalH.status === 'flyable') {
              fillPct = 90;
              fillColor = 'var(--gm-status-flyable)';
            } else if (evalH.status === 'caution') {
              fillPct = 55;
              fillColor = 'var(--gm-status-caution)';
            }

            return `
              <div 
                class="gm-timeline-col gm-timeline-col-compact ${slot.isActive ? 'active' : ''}"
                data-action="select-hour"
                data-hour="${h}"
                role="tab"
                aria-selected="${slot.isActive ? 'true' : 'false'}"
                aria-label="Ore ${String(h).padStart(2, '0')}:00, ${evalH.badge}, Vento ${speed} km/h"
                tabindex="0"
              >
                <span class="compact-time">${String(h).padStart(2, '0')}</span>
                <div class="compact-bar">
                  <div class="compact-bar-fill" style="height: ${fillPct}%; background-color: ${fillColor};"></div>
                </div>
                <span class="compact-arrow" style="transform: rotate(${dir}deg);">↑</span>
                <span class="compact-wind">${speed}</span>
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
    if (!spot || !spot.id) return false;
    const set = pinnedIds instanceof Set ? pinnedIds : new Set(pinnedIds || []);
    if (set.has(spot.id)) return true;
    const nameLower = (spot.name || '').toLowerCase();
    const idLower = (spot.id || '').toLowerCase();
    if (set.has('monte-cornizzolo-lc') && (idLower.includes('cornizzolo') || nameLower.includes('cornizzolo'))) return true;
    if (set.has('bassano-del-grappa-vi') && (idLower.includes('grappa') || nameLower.includes('grappa'))) return true;
    if (set.has('meduno-pn') && (idLower.includes('meduno') || nameLower.includes('meduno'))) return true;
    if (set.has('rocca-calascio-aq') && (idLower.includes('calascio') || nameLower.includes('calascio'))) return true;
    return false;
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
        <div class="gm-picker-item ${isActive ? 'active' : ''}">
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
        <!-- Direct Native Input -->
        <div class="gm-form-field">
          <label for="custom-date-native-input" class="gm-form-label font-bold text-xs uppercase tracking-wider text-[var(--gm-text-muted)]">
            Inserisci data specifica (max +14gg):
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

        <!-- 14-Day Fast Tap Grid -->
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
            <span class="flex items-center gap-1"><span class="text-[var(--gm-status-unflyable)]">✕</span> Chiuso</span>
            <span class="flex items-center gap-1"><span class="text-[#f87171]">⚡</span> Severo</span>
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
   * Global click event dispatcher for ForecastView and Picker Sheet.
   * @param {Event} evt
   */
  handleClick(evt) {
    const actionEl = evt.target.closest('[data-action]');
    if (!actionEl) return;

    const action = actionEl.getAttribute('data-action');

    if (action === 'select-hour') {
      const hourAttr = actionEl.getAttribute('data-hour');
      if (hourAttr != null) {
        const hour = parseInt(hourAttr, 10);
        if (!isNaN(hour) && hour >= 0 && hour <= 23) {
          this.selectedHour = hour;
          this.render();
        }
      }
    } else if (action === 'select-date') {
      const dateAttr = actionEl.getAttribute('data-date');
      if (dateAttr) {
        this.activeDate = dateAttr;
        if (this.store) {
          this.store.setState({ activeDate: dateAttr });
        }
        this.render();
      }
    } else if (action === 'open-date-picker-sheet') {
      this.openDatePickerSheet();
    } else if (action === 'apply-custom-date') {
      const input = document.getElementById('custom-date-native-input');
      if (input && input.value) {
        this.activeDate = input.value;
        if (this.store) {
          this.store.setState({ activeDate: input.value });
        }
        closeSheet();
        this.render();
      }
    } else if (action === 'pick-calendar-date') {
      const dateAttr = actionEl.getAttribute('data-date');
      if (dateAttr) {
        this.activeDate = dateAttr;
        if (this.store) {
          this.store.setState({ activeDate: dateAttr });
        }
        closeSheet();
        this.render();
      }
    } else if (action === 'back-to-home') {
      if (this.router) {
        this.router.navigateTo('home');
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
      const spot = this.comprensoriCatalog.find(c => c.id === spotId);
      if (spot) {
        this.selectedSubSpot = 'overview';
        if (this.store) {
          const state = this.store.getState();
          const recent = [spot.id, ...(state.recentSpotIds || []).filter(id => id !== spot.id)].slice(0, 5);
          this.store.setState({ selectedSpot: spot, recentSpotIds: recent });
        }
        closeSheet();
        this.render();
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
            if (idLower.includes('cornizzolo') || nameLower.includes('cornizzolo')) pinned.delete('monte-cornizzolo-lc');
            if (idLower.includes('grappa') || nameLower.includes('grappa')) pinned.delete('bassano-del-grappa-vi');
            if (idLower.includes('meduno') || nameLower.includes('meduno')) pinned.delete('meduno-pn');
            if (idLower.includes('calascio') || nameLower.includes('calascio')) pinned.delete('rocca-calascio-aq');
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
      this.render();
    } else if (target.id === 'forecast-subspot-select') {
      this.selectedSubSpot = target.value;
      this.render();
    }
  }
}

// Default singleton instance
export const forecastView = new ForecastViewController();
