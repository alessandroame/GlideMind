/**
 * GlideMind - Pilot Statistics & Currency View Controller (UI Layer)
 * Renders pilot currency, career KPIs, personal records, and flight distributions.
 * 
 * Complies with:
 *  - Laws of UX (Miller's Law, Gestalt Common Region, Doherty <400ms).
 *  - Engineering Sobriety (Zero decorative emojis, clean typography, WCAG AA contrast).
 *  - Novice Pilot Spec & Safety (Currency tiers: Active, Reentry, Lapsed).
 */

import {
  calculatePilotPeriodMetrics,
  calculateMonthlyFlightActivity,
  PILOT_CURRENCY_STATUS
} from '../../core/logbook.js';

/**
 * Escapes HTML characters safely.
 * @param {string|number|null|undefined} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Renders the Monthly Flight Activity SVG Bar Chart.
 * Generates lightweight, zero-dependency SVG markup compliant with outdoor contrast tokens.
 * @param {Object} monthlyActivity - Aggregated monthly activity object from core/logbook.js
 * @param {'hours'|'flights'} [metric='hours'] - Active metric mode
 * @returns {string} HTML string
 */
export function renderMonthlyActivityChartHtml(monthlyActivity, metric = 'hours') {
  if (!monthlyActivity || !Array.isArray(monthlyActivity.months)) {
    return '';
  }

  const isHours = metric !== 'flights';
  const months = monthlyActivity.months;
  const maxVal = isHours ? (monthlyActivity.maxMonthlyHours || 0) : (monthlyActivity.maxMonthlyFlights || 0);

  // Ergonomic scale ceiling calculation
  let ceiling;
  if (maxVal <= 2) {
    ceiling = 2;
  } else if (maxVal <= 4) {
    ceiling = 4;
  } else if (maxVal <= 6) {
    ceiling = 6;
  } else if (maxVal <= 10) {
    ceiling = 10;
  } else {
    ceiling = Math.ceil(maxVal / 5) * 5;
  }
  const midVal = isHours ? (Math.round((ceiling / 2) * 10) / 10) : Math.round(ceiling / 2);

  // SVG Coordinate Geometry: viewBox="0 0 360 148"
  // Chart area: left=32, right=352 (width=320), top=18, baseline=112 (height=94)
  const chartLeft = 32;
  const chartWidth = 320;
  const baselineY = 112;
  const chartHeight = 94;
  const slotWidth = chartWidth / Math.max(1, months.length);
  const barWidth = 14;

  const barsMarkup = months.map((m, index) => {
    const slotLeft = chartLeft + index * slotWidth;
    const barX = (slotLeft + (slotWidth - barWidth) / 2).toFixed(1);
    const textX = (slotLeft + slotWidth / 2).toFixed(1);

    const val = isHours ? m.totalHours : m.flightCount;
    const barHeight = ceiling > 0 ? (val / ceiling) * chartHeight : 0;
    const barY = (baselineY - barHeight).toFixed(1);

    const valText = isHours
      ? (val >= 10 ? String(Math.round(val)) : String(val))
      : String(val);

    let barElement = '';
    if (val > 0) {
      const fillOpacity = m.isCurrentMonth ? '1' : '0.55';
      const strokeWidth = m.isCurrentMonth ? '1.5' : '0';
      const textFill = m.isCurrentMonth ? 'var(--gm-accent)' : 'var(--gm-text-secondary)';
      const fontWeight = m.isCurrentMonth ? '700' : '600';
      const textY = Math.max(14, barY - 4).toFixed(1);

      barElement = `
        <rect
          x="${barX}"
          y="${barY}"
          width="${barWidth}"
          height="${barHeight.toFixed(1)}"
          rx="3"
          ry="3"
          fill="var(--gm-accent)"
          fill-opacity="${fillOpacity}"
          stroke="var(--gm-accent)"
          stroke-width="${strokeWidth}"
        />
        <text
          x="${textX}"
          y="${textY}"
          text-anchor="middle"
          font-size="8"
          font-family="monospace"
          font-weight="${fontWeight}"
          fill="${textFill}"
        >${escapeHtml(valText)}</text>
      `;
    } else {
      barElement = `
        <rect
          x="${barX}"
          y="${baselineY - 2}"
          width="${barWidth}"
          height="2"
          rx="1"
          fill="var(--gm-border-strong)"
          fill-opacity="0.4"
        />
      `;
    }

    const labelFill = m.isCurrentMonth ? 'var(--gm-accent)' : 'var(--gm-text-muted)';
    const labelWeight = m.isCurrentMonth ? '700' : '500';
    const monthLabel = `
      <text
        x="${textX}"
        y="126"
        text-anchor="middle"
        font-size="9"
        fill="${labelFill}"
        font-weight="${labelWeight}"
      >${escapeHtml(m.label)}</text>
      ${m.isCurrentMonth ? `<circle cx="${textX}" cy="134" r="2" fill="var(--gm-accent)" />` : ''}
    `;

    return barElement + monthLabel;
  }).join('');

  const ariaLabel = isHours
    ? `Attività mensile ultimi 12 mesi: ${monthlyActivity.formattedHours}, picco mensile ${monthlyActivity.maxMonthlyHours} ore.`
    : `Attività mensile ultimi 12 mesi: ${monthlyActivity.totalFlights} voli, picco mensile ${monthlyActivity.maxMonthlyFlights} voli.`;

  const totalSummary = isHours
    ? `${escapeHtml(monthlyActivity.formattedHours)} negli ultimi 12 mesi`
    : `${escapeHtml(monthlyActivity.totalFlights)} ${monthlyActivity.totalFlights === 1 ? 'volo' : 'voli'} negli ultimi 12 mesi`;

  return `
    <section class="gm-stats-section" aria-labelledby="heading-monthly-activity">
      <div class="gm-chart-header">
        <div class="gm-chart-title-group">
          <h3 id="heading-monthly-activity" class="gm-stats-section-title">Attività Mensile</h3>
          <span class="text-xs text-[var(--gm-text-muted)] font-mono">
            ${totalSummary}
          </span>
        </div>

        <div class="gm-chart-toggle-group" role="group" aria-label="Visualizzazione attività">
          <button
            type="button"
            class="gm-chart-toggle-btn ${isHours ? 'active' : ''}"
            data-action="toggle-stats-metric"
            data-metric="hours"
            aria-pressed="${isHours}"
          >
            Ore
          </button>
          <button
            type="button"
            class="gm-chart-toggle-btn ${!isHours ? 'active' : ''}"
            data-action="toggle-stats-metric"
            data-metric="flights"
            aria-pressed="${!isHours}"
          >
            Voli
          </button>
        </div>
      </div>

      <div class="gm-chart-card">
        <div class="gm-chart-svg-wrap">
          <svg
            class="gm-chart-svg"
            viewBox="0 0 360 148"
            width="100%"
            height="auto"
            role="img"
            aria-label="${escapeHtml(ariaLabel)}"
          >
            <!-- Background Grid Lines -->
            <line x1="32" y1="18" x2="352" y2="18" stroke="var(--gm-border)" stroke-dasharray="2,2" stroke-width="1" />
            <line x1="32" y1="65" x2="352" y2="65" stroke="var(--gm-border)" stroke-dasharray="2,2" stroke-width="1" />
            <line x1="32" y1="112" x2="352" y2="112" stroke="var(--gm-border-strong)" stroke-width="1" />

            <!-- Y-Axis Value Labels -->
            <text x="26" y="21" text-anchor="end" font-size="9" fill="var(--gm-text-muted)" font-family="monospace">${ceiling}</text>
            <text x="26" y="68" text-anchor="end" font-size="9" fill="var(--gm-text-muted)" font-family="monospace">${midVal}</text>
            <text x="26" y="115" text-anchor="end" font-size="9" fill="var(--gm-text-muted)" font-family="monospace">0</text>

            <!-- 12 Monthly Bars & Labels -->
            ${barsMarkup}
          </svg>
        </div>
      </div>
    </section>
  `;
}

/**
 * Renders the Pilot Statistics & Currency tab content.
 * @param {Array<Object>} flights
 * @param {Object} [options={}]
 * @param {'hours'|'flights'} [options.metric='hours']
 * @param {Date|string} [options.referenceDate=new Date()]
 * @returns {string} HTML string
 */
export function renderLogbookStatsHtml(flights = [], options = {}) {
  const safeFlights = Array.isArray(flights) ? flights : [];
  const metric = (options && options.metric === 'flights') ? 'flights' : 'hours';
  const referenceDate = (options && options.referenceDate) || new Date();

  // Compute period metrics via headless core
  const periodMetrics = calculatePilotPeriodMetrics({
    flights: safeFlights,
    referenceDate
  });

  // Compute 12-month activity via headless core
  const monthlyActivity = calculateMonthlyFlightActivity(safeFlights, {
    monthsCount: 12,
    referenceDate
  });

  // Calculate career aggregates & personal records
  let totalMinutes = 0;
  let totalThermals = 0;
  let totalManeuvers = 0;
  let maxAlt = 0;
  let maxAltSite = '';
  let maxGain = 0;
  let maxGainSite = '';
  let maxDurationMin = 0;
  let maxDist = 0;

  const siteCounts = new Map();
  const gliderCounts = new Map();

  for (const f of safeFlights) {
    const dur = Number(f.durationMinutes) || 0;
    totalMinutes += dur;
    if (dur > maxDurationMin) maxDurationMin = dur;

    const alt = Number(f.maxAltMsl) || 0;
    if (alt > maxAlt) {
      maxAlt = alt;
      maxAltSite = f.siteName || f.site || '';
    }

    const gain = Number(f.maxGainMeters) || 0;
    if (gain > maxGain) {
      maxGain = gain;
      maxGainSite = f.siteName || f.site || '';
    }

    const dist = Number(f.distanceKm) || 0;
    if (dist > maxDist) maxDist = dist;

    const thermals = Number(f.thermalsCount) || 0;
    totalThermals += thermals;

    const maneuvers = Number(f.maneuversCount) || 0;
    totalManeuvers += maneuvers;

    // Site aggregation
    const siteKey = f.siteName || f.site || 'Altro';
    siteCounts.set(siteKey, (siteCounts.get(siteKey) || 0) + 1);

    // Glider aggregation
    const gliderKey = f.glider || 'Parapendio';
    gliderCounts.set(gliderKey, (gliderCounts.get(gliderKey) || 0) + 1);
  }

  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
  const formattedHours = totalHours >= 10 ? `${Math.round(totalHours)} h` : `${totalHours} h`;

  // Sort sites and gliders by frequency
  const sortedSites = Array.from(siteCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const sortedGliders = Array.from(gliderCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  // Currency status badge classes
  let currencyBadgeClass = 'gm-currency-neutral';
  if (periodMetrics.currencyStatus === PILOT_CURRENCY_STATUS.ACTIVE) {
    currencyBadgeClass = 'gm-currency-active';
  } else if (periodMetrics.currencyStatus === PILOT_CURRENCY_STATUS.REENTRY) {
    currencyBadgeClass = 'gm-currency-reentry';
  } else if (periodMetrics.currencyStatus === PILOT_CURRENCY_STATUS.LAPSED) {
    currencyBadgeClass = 'gm-currency-lapsed';
  }

  return `
    <div class="gm-stats-container" role="region" aria-label="Statistiche di Carriera e Valuta Pilota">
      <!-- Pilot Currency Card -->
      <section class="gm-currency-card" aria-labelledby="heading-pilot-currency">
        <div class="gm-currency-card-header">
          <div class="flex items-center gap-2">
            <h3 id="heading-pilot-currency" class="font-bold text-sm text-[var(--gm-text-primary)]">
              Valuta &amp; Continuità Pilota
            </h3>
            <span class="gm-currency-badge ${currencyBadgeClass}">
              ${escapeHtml(periodMetrics.currencyLabel)}
            </span>
          </div>
          <span class="text-xs text-[var(--gm-text-muted)] font-mono">
            ${periodMetrics.daysSinceLastFlight != null ? `${periodMetrics.daysSinceLastFlight} gg fa` : '--'}
          </span>
        </div>

        <p class="gm-currency-desc text-xs text-[var(--gm-text-secondary)]">
          ${escapeHtml(periodMetrics.currencyDescription)}
        </p>

        <div class="gm-currency-period-grid">
          <div class="gm-currency-period-item">
            <span class="gm-currency-period-num">${escapeHtml(periodMetrics.totalSessions)}</span>
            <span class="gm-currency-period-label">Voli (ultimi 30 gg)</span>
          </div>
          <div class="gm-currency-period-item">
            <span class="gm-currency-period-num">${escapeHtml(periodMetrics.formattedHours)}</span>
            <span class="gm-currency-period-label">Ore (ultimi 30 gg)</span>
          </div>
          <div class="gm-currency-period-item">
            <span class="gm-currency-period-num">${escapeHtml(periodMetrics.thermalSessions)}</span>
            <span class="gm-currency-period-label">Sessioni Termiche</span>
          </div>
          <div class="gm-currency-period-item">
            <span class="gm-currency-period-num">${escapeHtml(periodMetrics.exerciseSessions)}</span>
            <span class="gm-currency-period-label">Sessioni Esercizi</span>
          </div>
        </div>
      </section>

      <!-- Monthly Flight Activity Bar Chart -->
      ${renderMonthlyActivityChartHtml(monthlyActivity, metric)}

      <!-- Cumulative Career Grid -->
      <section class="gm-stats-section" aria-labelledby="heading-career-totals">
        <h3 id="heading-career-totals" class="gm-stats-section-title">Totali di Carriera</h3>
        <div class="gm-stats-grid">
          <div class="gm-stats-metric-card">
            <span class="gm-stats-metric-val">${escapeHtml(formattedHours)}</span>
            <span class="gm-stats-metric-label">Ore Totali</span>
          </div>
          <div class="gm-stats-metric-card">
            <span class="gm-stats-metric-val">${escapeHtml(safeFlights.length)}</span>
            <span class="gm-stats-metric-label">Voli Totali</span>
          </div>
          <div class="gm-stats-metric-card">
            <span class="gm-stats-metric-val">${escapeHtml(totalThermals)}</span>
            <span class="gm-stats-metric-label">Termiche Agganciate</span>
          </div>
          <div class="gm-stats-metric-card">
            <span class="gm-stats-metric-val">${escapeHtml(totalManeuvers)}</span>
            <span class="gm-stats-metric-label">Manovre Eseguite</span>
          </div>
        </div>
      </section>

      <!-- Personal Records Grid -->
      <section class="gm-stats-section" aria-labelledby="heading-records">
        <h3 id="heading-records" class="gm-stats-section-title">Migliori Prestazioni Personali</h3>
        <div class="gm-stats-grid">
          <div class="gm-stats-metric-card">
            <span class="gm-stats-metric-val">${maxAlt > 0 ? `${escapeHtml(maxAlt)} m` : '--'}</span>
            <span class="gm-stats-metric-label">Quota Max MSL</span>
            ${maxAltSite ? `<span class="gm-stats-metric-sub truncate" title="${escapeHtml(maxAltSite)}">${escapeHtml(maxAltSite)}</span>` : ''}
          </div>
          <div class="gm-stats-metric-card">
            <span class="gm-stats-metric-val">${maxGain > 0 ? `+${escapeHtml(maxGain)} m` : '--'}</span>
            <span class="gm-stats-metric-label">Maggior Guadagno</span>
            ${maxGainSite ? `<span class="gm-stats-metric-sub truncate" title="${escapeHtml(maxGainSite)}">${escapeHtml(maxGainSite)}</span>` : ''}
          </div>
          <div class="gm-stats-metric-card">
            <span class="gm-stats-metric-val">${maxDurationMin > 0 ? `${escapeHtml(maxDurationMin)} min` : '--'}</span>
            <span class="gm-stats-metric-label">Volo Più Lungo</span>
          </div>
          <div class="gm-stats-metric-card">
            <span class="gm-stats-metric-val">${maxDist > 0 ? `${escapeHtml(maxDist)} km` : '--'}</span>
            <span class="gm-stats-metric-label">Distanza Massima</span>
          </div>
        </div>
      </section>

      <!-- Frequented Sites & Gliders -->
      <div class="gm-stats-distribution-grid">
        <section class="gm-stats-section" aria-labelledby="heading-top-sites">
          <h3 id="heading-top-sites" class="gm-stats-section-title">Decolli Più Frequentati</h3>
          ${sortedSites.length === 0 ? `
            <div class="text-xs text-[var(--gm-text-muted)] py-2">Nessun dato registrato</div>
          ` : `
            <div class="gm-dist-list">
              ${sortedSites.map(([siteName, count]) => {
                const pct = safeFlights.length > 0 ? Math.round((count / safeFlights.length) * 100) : 0;
                return `
                  <div class="gm-dist-row">
                    <div class="gm-dist-info">
                      <span class="gm-dist-name truncate" title="${escapeHtml(siteName)}">${escapeHtml(siteName)}</span>
                      <span class="gm-dist-count">${escapeHtml(count)} ${count === 1 ? 'volo' : 'voli'} (${pct}%)</span>
                    </div>
                    <div class="gm-dist-bar-bg">
                      <div class="gm-dist-bar-fill" style="width: ${pct}%;"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </section>

        <section class="gm-stats-section" aria-labelledby="heading-top-gliders">
          <h3 id="heading-top-gliders" class="gm-stats-section-title">Vele Utilizzate</h3>
          ${sortedGliders.length === 0 ? `
            <div class="text-xs text-[var(--gm-text-muted)] py-2">Nessun dato registrato</div>
          ` : `
            <div class="gm-dist-list">
              ${sortedGliders.map(([gliderName, count]) => {
                const pct = safeFlights.length > 0 ? Math.round((count / safeFlights.length) * 100) : 0;
                return `
                  <div class="gm-dist-row">
                    <div class="gm-dist-info">
                      <span class="gm-dist-name truncate" title="${escapeHtml(gliderName)}">${escapeHtml(gliderName)}</span>
                      <span class="gm-dist-count">${escapeHtml(count)} ${count === 1 ? 'volo' : 'voli'} (${pct}%)</span>
                    </div>
                    <div class="gm-dist-bar-bg">
                      <div class="gm-dist-bar-fill" style="width: ${pct}%;"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </section>
      </div>
    </div>
  `;
}
