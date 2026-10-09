/**
 * GlideMind - Home Dashboard View Controller (ui/views/HomeDashboardView.js)
 * 
 * Aeronautical Glanceable UI (Colpo d'occhio):
 * - Clean high-density list: 3-4 comprensori visible on mobile at first glance
 * - Zero fluff: no decorative badges, no marketing taglines, zero clutter
 * - Zero PIN/favorites: direct meteorological flyability ranking (Aperto -> Cautela -> Chiuso)
 * - T_best (decollo) + L_safe (atterraggio) + Explainability on 3 compact lines per card
 * - Entire card is touch-interactive (Fitts's law >= 48px)
 */

import { store } from '../../core/store.js';
import { router } from '../router.js';
import {
  DEFAULT_COMPRENSORI,
  evaluateComprensorio,
  sortEvaluatedComprensori,
  parseCoordinates
} from '../../core/comprensorio.js';
import {
  DEFAULT_GLIDER,
  calculateDailyFlyabilitySummary
} from '../../core/flyability.js';
import {
  generateSyntheticWeather,
  enrichWeatherData
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
 * HomeDashboardViewController implementation.
 */
export class HomeDashboardViewController {
  constructor(options = {}) {
    this.store = options.store || store;
    this.router = options.router || router;
    this.containerEl = null;
    this.storeUnsubscribe = null;
    this.boundClickHandler = this.handleClick.bind(this);
    this.boundFileInputHandler = this.handleFileInput.bind(this);
    this.boundSearchInputHandler = this.handleSearchInput.bind(this);
    
    this.searchQuery = '';
    this.comprensoriCatalog = options.comprensoriCatalog || [...DEFAULT_COMPRENSORI];
    this.isLoading = false;
    this.pilotPeriod = 'month';
  }

  /**
   * Mounts the view controller into the given DOM container.
   * @param {HTMLElement|null} containerEl
   * @param {object} [params]
   */
  mount(containerEl, params = {}) {
    this.containerEl = containerEl;

    // Subscribe to reactive store changes (weatherData, activeDate, selectedSpot)
    if (this.store && typeof this.store.subscribe === 'function') {
      this.storeUnsubscribe = this.store.subscribe((state, prev) => {
        if (
          !prev ||
          state.weatherData !== prev.weatherData ||
          state.activeDate !== prev.activeDate
        ) {
          this.render();
        }
      });
    }

    this.render();

    // Attach delegated events if in browser/DOM environment
    if (this.containerEl && typeof this.containerEl.addEventListener === 'function') {
      this.containerEl.addEventListener('click', this.boundClickHandler);

      const fileInput = typeof this.containerEl.querySelector === 'function'
        ? this.containerEl.querySelector('#home-igc-file-input')
        : null;
      if (fileInput && typeof fileInput.addEventListener === 'function') {
        fileInput.addEventListener('change', this.boundFileInputHandler);
      }

      const searchInput = typeof this.containerEl.querySelector === 'function'
        ? this.containerEl.querySelector('#home-spot-search')
        : null;
      if (searchInput && typeof searchInput.addEventListener === 'function') {
        searchInput.addEventListener('input', this.boundSearchInputHandler);
      }
    }
  }

  /**
   * Unmounts the view controller, cleans up listeners and store subscriptions.
   */
  unmount() {
    if (typeof this.storeUnsubscribe === 'function') {
      this.storeUnsubscribe();
      this.storeUnsubscribe = null;
    }

    if (this.containerEl && typeof this.containerEl.removeEventListener === 'function') {
      this.containerEl.removeEventListener('click', this.boundClickHandler);
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

    const query = this.searchQuery.trim().toLowerCase();
    const sourceComprensori = query
      ? this.comprensoriCatalog.filter(c => {
          const matchName = (c.name || '').toLowerCase().includes(query);
          const matchProv = (c.province || '').toLowerCase().includes(query);
          const matchLoc = (c.location || '').toLowerCase().includes(query);
          const matchRegion = (c.region || '').toLowerCase().includes(query);
          return matchName || matchProv || matchLoc || matchRegion;
        })
      : this.comprensoriCatalog;

    const evaluated = [];

    for (const comprensorio of sourceComprensori) {
      const result = evaluateComprensorio({
        comprensorio,
        weatherData,
        glider: activeGlider
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
    const activeDate = state.activeDate || new Date().toISOString().split('T')[0];
    const evaluatedList = this.getEvaluatedComprensori();

    return `
      <div class="gm-home-view max-w-4xl mx-auto flex flex-col gap-2">
        <!-- Ultra-Clean Header (Glanceable, Zero Marketing Fluff) -->
        <header class="flex items-center justify-between pb-2 border-b border-[var(--gm-border)]">
          <h1 class="text-base font-bold tracking-tight text-[var(--gm-text-primary)]">GlideMind</h1>
          <span class="text-xs font-mono text-[var(--gm-text-secondary)]">${escapeHtml(activeDate)}</span>
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
            <span>${evaluatedList.length} siti</span>
          </div>

          <!-- Smart Date Selector for Comprensori Flyability (Weekend & Quick Presets) -->
          ${this.renderDateBar(state)}

          <!-- Compact Search Bar (Sotto il titolo Volabilità) -->
          <div class="gm-search-wrapper">
            <svg class="gm-search-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2">
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
            />
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
    const targetSpot = spot || this.comprensoriCatalog[0] || DEFAULT_COMPRENSORI[0];
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

    const state = this.store ? this.store.getState() : {};
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
    const spot = state.selectedSpot || this.comprensoriCatalog[0] || DEFAULT_COMPRENSORI[0];
    const flySummaries = this.getMultiDayFlyability(spot, 14);
    const smartData = getSmartDatePresets(new Date(), activeDate, flySummaries);

    return `
      <div class="gm-date-tabs mb-1" role="tablist" aria-label="Selettore data volabilità">
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
        <div class="gm-horizon-notice mb-1" role="status">
          <span class="gm-horizon-icon" aria-hidden="true">ℹ️</span>
          <span><strong>Tendenza sinottica:</strong> previsione oltre 7 giorni a carattere indicativo.</span>
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
      return `
        <div id="home-spots-list" class="gm-spot-card text-center py-4 px-3 flex flex-col items-center gap-1">
          <div class="text-xs font-semibold text-[var(--gm-text-primary)]">
            Nessun sito trovato per "${escapeHtml(this.searchQuery)}"
          </div>
          <p class="text-xs text-[var(--gm-text-muted)]">
            Verifica il nome inserito o cancella il filtro di ricerca.
          </p>
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
    const windSpeedStr = weather.windSpeed != null ? `${weather.windSpeed} km/h` : '-';
    const windDirStr = weather.windDir != null ? `${weather.windDir}°` : '';

    let badgeClass = 'gm-badge-flyable';
    if (item.status === 'caution') badgeClass = 'gm-badge-caution';
    else if (item.status === 'unflyable') badgeClass = 'gm-badge-unflyable';

    return `
      <article 
        class="gm-spot-card" 
        data-comprensorio-id="${escapeHtml(item.comprensorioId)}"
        data-action="view-forecast"
        data-id="${escapeHtml(item.comprensorioId)}"
        aria-label="${escapeHtml(item.name)}, stato ${escapeHtml(item.badge)}"
      >
        <!-- Line 1: Spot Name + Province + Live Flyability Badge -->
        <div class="gm-spot-header">
          <div class="gm-spot-title-group">
            <span class="gm-spot-name">${escapeHtml(item.name)}</span>
            ${item.province ? `<span class="gm-spot-prov">${escapeHtml(item.province)}</span>` : ''}
          </div>
          <span class="gm-badge ${badgeClass}">
            ${escapeHtml(item.badge)}
          </span>
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
              <span class="gm-glide-val ${glide.isSafe ? 'text-[var(--gm-status-flyable)]' : 'text-[var(--gm-status-caution)]'}">
                1:${glide.requiredGlideRatio}
              </span>
            </div>
          </div>
        </div>

        <!-- Line 3: Explainability String (Direct physical reason) -->
        <div class="gm-spot-explain">
          <span class="gm-explain-bullet">●</span>
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

        // Cancel button
        const cancelBtn = document.getElementById('btn-cancel-flight-log');
        if (cancelBtn) {
          cancelBtn.addEventListener('click', () => closeSheet());
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
   * Opens the accessible bottom sheet to select any date within the forecast horizon (up to 14 days).
   */
  openDatePickerSheet() {
    const state = this.store ? this.store.getState() : {};
    const activeDate = state.activeDate || formatDateIso(new Date());
    const today = new Date();
    const minDate = formatDateIso(today);
    const maxDate = formatDateIso(new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000));
    const spot = state.selectedSpot || this.comprensoriCatalog[0] || DEFAULT_COMPRENSORI[0];
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

        <!-- 14-Day Fast Tap Grid -->
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
      id: 'home-date-picker-sheet',
      title: 'Seleziona Data Volabilità Siti',
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
                this.render();
              }
            });
          }
        }
      }
    });
  }

  /**
   * Handles user clicks within the view via event delegation.
   * @param {MouseEvent} evt
   */
  handleClick(evt) {
    const target = evt.target;
    if (!target) return;

    const actionEl = target.closest('[data-action]');
    if (!actionEl) return;

    const action = actionEl.getAttribute('data-action');
    const id = actionEl.getAttribute('data-id');

    if (action === 'select-date') {
      const dateAttr = actionEl.getAttribute('data-date');
      if (dateAttr && this.store) {
        this.store.setState({ activeDate: dateAttr });
        this.render();
      }
    } else if (action === 'open-date-picker-sheet') {
      this.openDatePickerSheet();
    } else if (action === 'apply-custom-date') {
      const input = document.getElementById('custom-date-native-input');
      if (input && input.value && this.store) {
        this.store.setState({ activeDate: input.value });
        closeSheet();
        this.render();
      }
    } else if (action === 'pick-calendar-date') {
      const dateAttr = actionEl.getAttribute('data-date');
      if (dateAttr && this.store) {
        this.store.setState({ activeDate: dateAttr });
        closeSheet();
        this.render();
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
    } else if (action === 'view-forecast') {
      const comprensorio = this.comprensoriCatalog.find(c => c.id === id);
      if (this.store && comprensorio) {
        this.store.setState({ selectedSpot: comprensorio });
      }
      if (this.router) {
        this.router.navigateTo('forecast');
      }
    } else if (action === 'upload-igc') {
      const fileInput = this.containerEl ? this.containerEl.querySelector('#home-igc-file-input') : null;
      if (fileInput) {
        fileInput.click();
      } else if (this.router) {
        this.router.navigateTo('logbook');
      }
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
      const listContainer = this.containerEl ? this.containerEl.querySelector('section[aria-labelledby="heading-comprensori"]') : null;
      if (listContainer) {
        const evaluatedList = this.getEvaluatedComprensori();
        const countBadge = listContainer.querySelector('.flex.items-center.justify-between.text-xs span:last-child');
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
          if (this.router) {
            this.router.navigateTo('logbook');
          }
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
