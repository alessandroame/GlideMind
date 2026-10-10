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

const DONUT_PALETTE = ['#f59e0b', '#0ea5e9', '#10b981', '#a855f7', '#ec4899', '#64748b'];

/**
 * Renders an SVG Donut Distribution Card with a clean ranked list.
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.title
 * @param {Array<[string, number]>} params.items
 * @param {number} params.totalFlights
 * @param {string} [params.emptyMessage='Nessun dato registrato']
 * @returns {string} HTML string
 */
export function renderDonutDistributionCardHtml({ id, title, items, totalFlights, emptyMessage = 'Nessun dato registrato' }) {
  if (!Array.isArray(items) || items.length === 0 || totalFlights <= 0) {
    return `
      <section class="gm-donut-card" aria-labelledby="${escapeHtml(id)}">
        <h3 id="${escapeHtml(id)}" class="gm-stats-section-title">${escapeHtml(title)}</h3>
        <div class="gm-donut-svg-wrap">
          <svg class="gm-donut-svg" viewBox="0 0 140 140" width="120" height="120" role="img" aria-label="${escapeHtml(title)}: ${escapeHtml(emptyMessage)}">
            <circle cx="70" cy="70" r="44" fill="transparent" stroke="var(--gm-border)" stroke-width="18" />
            <text x="70" y="66" text-anchor="middle" font-size="14" font-weight="700" fill="var(--gm-text-muted)" font-family="monospace">0</text>
            <text x="70" y="79" text-anchor="middle" font-size="8.5" text-transform="uppercase" fill="var(--gm-text-muted)" font-weight="600">voli</text>
          </svg>
        </div>
        <div class="text-xs text-[var(--gm-text-muted)] text-center py-1">${escapeHtml(emptyMessage)}</div>
      </section>
    `;
  }

  // Radius 44 -> Circumference = 2 * PI * 44 = 276.46
  const C = 276.46;
  let accumulatedOffset = 0;
  let topItemsCount = 0;

  const slices = items.map(([name, count], index) => {
    topItemsCount += count;
    const pct = (count / totalFlights) * 100;
    const dashLength = (pct / 100) * C;
    const color = DONUT_PALETTE[index % DONUT_PALETTE.length];

    const circleMarkup = `
      <circle
        cx="70"
        cy="70"
        r="44"
        fill="transparent"
        stroke="${color}"
        stroke-width="18"
        stroke-dasharray="${dashLength.toFixed(2)} ${(C - dashLength).toFixed(2)}"
        stroke-dashoffset="${(-accumulatedOffset).toFixed(2)}"
        transform="rotate(-90 70 70)"
      />
    `;
    accumulatedOffset += dashLength;
    return circleMarkup;
  });

  const remainder = totalFlights - topItemsCount;
  if (remainder > 0 && accumulatedOffset < C - 0.5) {
    const remainderDash = C - accumulatedOffset;
    slices.push(`
      <circle
        cx="70"
        cy="70"
        r="44"
        fill="transparent"
        stroke="#64748b"
        stroke-width="18"
        stroke-dasharray="${remainderDash.toFixed(2)} ${(C - remainderDash).toFixed(2)}"
        stroke-dashoffset="${(-accumulatedOffset).toFixed(2)}"
        transform="rotate(-90 70 70)"
      />
    `);
  }

  const listRows = items.map(([name, count], index) => {
    const pct = Math.round((count / totalFlights) * 100);
    const color = DONUT_PALETTE[index % DONUT_PALETTE.length];
    return `
      <div class="gm-dist-row">
        <div class="gm-dist-info">
          <div class="flex items-center gap-2 min-w-0">
            <span class="gm-donut-bullet" style="background-color: ${color};"></span>
            <span class="gm-dist-name truncate" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
          </div>
          <span class="gm-dist-count shrink-0 font-mono">
            <strong>${escapeHtml(count)}</strong> ${count === 1 ? 'volo' : 'voli'}
            <span class="text-[var(--gm-text-muted)] font-normal">(${pct}%)</span>
          </span>
        </div>
        <div class="gm-dist-bar-bg">
          <div class="gm-dist-bar-fill" style="width: ${pct}%; background-color: ${color};"></div>
        </div>
      </div>
    `;
  });

  if (remainder > 0) {
    const remPct = Math.round((remainder / totalFlights) * 100);
    listRows.push(`
      <div class="gm-dist-row">
        <div class="gm-dist-info">
          <div class="flex items-center gap-2 min-w-0">
            <span class="gm-donut-bullet" style="background-color: #64748b;"></span>
            <span class="gm-dist-name text-[var(--gm-text-secondary)] italic truncate">Altri</span>
          </div>
          <span class="gm-dist-count shrink-0 font-mono text-[var(--gm-text-secondary)]">
            <strong>${escapeHtml(remainder)}</strong> ${remainder === 1 ? 'volo' : 'voli'}
            <span class="text-[var(--gm-text-muted)] font-normal">(${remPct}%)</span>
          </span>
        </div>
        <div class="gm-dist-bar-bg">
          <div class="gm-dist-bar-fill" style="width: ${remPct}%; background-color: #64748b;"></div>
        </div>
      </div>
    `);
  }

  return `
    <section class="gm-donut-card" aria-labelledby="${escapeHtml(id)}">
      <h3 id="${escapeHtml(id)}" class="gm-stats-section-title">${escapeHtml(title)}</h3>
      
      <div class="gm-donut-svg-wrap">
        <svg
          class="gm-donut-svg"
          viewBox="0 0 140 140"
          width="120"
          height="120"
          role="img"
          aria-label="${escapeHtml(title)}: ${totalFlights} voli registrati"
        >
          <!-- Background Track -->
          <circle cx="70" cy="70" r="44" fill="transparent" stroke="var(--gm-border)" stroke-width="18" />
          
          <!-- Colored Donut Slices -->
          ${slices.join('')}

          <!-- Center Hole KPIs -->
          <text x="70" y="66" text-anchor="middle" font-size="15" font-weight="800" font-family="monospace" fill="var(--gm-text-primary)">${totalFlights}</text>
          <text x="70" y="79" text-anchor="middle" font-size="8.5" text-transform="uppercase" fill="var(--gm-text-muted)" font-weight="600">voli</text>
        </svg>
      </div>

      <div class="gm-dist-list">
        ${listRows.join('')}
      </div>
    </section>
  `;
}

/**
 * Renders the Monthly Flight Activity Mixed Chart (Dual Y-Axis).
 * Generates lightweight, zero-dependency SVG markup with:
 *  - Left Y-Axis: Flight hours (Bar Chart)
 *  - Right Y-Axis: Flight counts (Line Chart with points)
 *  - X-Axis: 12 months rolling history
 * @param {Object} monthlyActivity - Aggregated monthly activity object from core/logbook.js
 * @returns {string} HTML string
 */
export function renderMonthlyActivityChartHtml(monthlyActivity) {
  if (!monthlyActivity || !Array.isArray(monthlyActivity.months)) {
    return '';
  }

  const months = monthlyActivity.months;
  const maxHours = monthlyActivity.maxMonthlyHours || 0;
  const maxFlights = monthlyActivity.maxMonthlyFlights || 0;

  // Scale calculations for Left Y-Axis (Hours)
  let ceilingHours;
  if (maxHours <= 2) ceilingHours = 2;
  else if (maxHours <= 4) ceilingHours = 4;
  else if (maxHours <= 6) ceilingHours = 6;
  else if (maxHours <= 10) ceilingHours = 10;
  else ceilingHours = Math.ceil(maxHours / 5) * 5;
  const midHours = Math.round((ceilingHours / 2) * 10) / 10;

  // Scale calculations for Right Y-Axis (Flight Count)
  let ceilingFlights;
  if (maxFlights <= 2) ceilingFlights = 2;
  else if (maxFlights <= 4) ceilingFlights = 4;
  else if (maxFlights <= 6) ceilingFlights = 6;
  else if (maxFlights <= 10) ceilingFlights = 10;
  else if (maxFlights <= 20) ceilingFlights = 20;
  else ceilingFlights = Math.ceil(maxFlights / 5) * 5;
  const midFlights = Math.round(ceilingFlights / 2);

  // Geometry: viewBox="0 0 360 160"
  // Chart Area: left=32, right=328 (width=296), top=24, baseline=120 (height=96)
  const chartLeft = 32;
  const chartWidth = 296;
  const baselineY = 120;
  const chartHeight = 96;
  const slotWidth = chartWidth / Math.max(1, months.length);
  const barWidth = 12;

  // 1. Render Hours Bars
  const barsMarkup = months.map((m, index) => {
    const slotLeft = chartLeft + index * slotWidth;
    const barX = (slotLeft + (slotWidth - barWidth) / 2).toFixed(1);
    const textX = (slotLeft + slotWidth / 2).toFixed(1);

    const h = m.totalHours;
    const barHeight = ceilingHours > 0 ? (h / ceilingHours) * chartHeight : 0;
    const barY = (baselineY - barHeight).toFixed(1);
    const valText = h >= 10 ? String(Math.round(h)) : String(h);

    let barEl = '';
    if (h > 0) {
      const fillOpacity = m.isCurrentMonth ? '0.9' : '0.5';
      const strokeWidth = m.isCurrentMonth ? '1.5' : '0';
      barEl = `
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
          y="${Math.max(16, barY - 4).toFixed(1)}"
          text-anchor="middle"
          font-size="7.5"
          font-family="monospace"
          font-weight="${m.isCurrentMonth ? '700' : '600'}"
          fill="var(--gm-accent)"
        >${escapeHtml(valText)}h</text>
      `;
    } else {
      barEl = `
        <rect
          x="${barX}"
          y="${baselineY - 2}"
          width="${barWidth}"
          height="2"
          rx="1"
          fill="var(--gm-border-strong)"
          fill-opacity="0.3"
        />
      `;
    }

    const labelFill = m.isCurrentMonth ? 'var(--gm-accent)' : 'var(--gm-text-muted)';
    const labelWeight = m.isCurrentMonth ? '700' : '500';
    const monthLabel = `
      <text
        x="${textX}"
        y="136"
        text-anchor="middle"
        font-size="9"
        fill="${labelFill}"
        font-weight="${labelWeight}"
      >${escapeHtml(m.label)}</text>
      ${m.isCurrentMonth ? `<circle cx="${textX}" cy="144" r="2" fill="var(--gm-accent)" />` : ''}
    `;

    return barEl + monthLabel;
  }).join('');

  // 2. Render Flight Count Line & Points
  const flightPoints = months.map((m, index) => {
    const cx = chartLeft + index * slotWidth + slotWidth / 2;
    const cy = ceilingFlights > 0 ? (baselineY - (m.flightCount / ceilingFlights) * chartHeight) : baselineY;
    return {
      x: cx,
      y: cy,
      count: m.flightCount,
      isCurrent: m.isCurrentMonth
    };
  });

  const polylinePoints = flightPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const pointsMarkup = flightPoints.map(p => {
    if (p.count > 0) {
      return `
        <circle
          cx="${p.x.toFixed(1)}"
          cy="${p.y.toFixed(1)}"
          r="3"
          fill="#38bdf8"
          stroke="var(--gm-bg-card, #13161f)"
          stroke-width="1.5"
        />
        <text
          x="${p.x.toFixed(1)}"
          y="${(p.y - 5).toFixed(1)}"
          text-anchor="middle"
          font-size="8"
          font-family="monospace"
          font-weight="700"
          fill="#38bdf8"
        >${p.count}</text>
      `;
    } else {
      return `
        <circle
          cx="${p.x.toFixed(1)}"
          cy="${p.y.toFixed(1)}"
          r="1.5"
          fill="#38bdf8"
          fill-opacity="0.3"
        />
      `;
    }
  }).join('');

  const ariaLabel = `Attività mensile ultimi 12 mesi: ${monthlyActivity.formattedHours} di volo e ${monthlyActivity.totalFlights} voli complessivi.`;

  return `
    <section class="gm-stats-section" aria-labelledby="heading-monthly-activity">
      <div class="gm-chart-header">
        <div class="gm-chart-title-group">
          <h3 id="heading-monthly-activity" class="gm-stats-section-title">Attività Mensile</h3>
          <span class="text-xs text-[var(--gm-text-muted)] font-mono">
            ${escapeHtml(monthlyActivity.formattedHours)} • ${escapeHtml(monthlyActivity.totalFlights)} voli negli ultimi 12 mesi
          </span>
        </div>

        <!-- Dual Metric Legend -->
        <div class="gm-mixed-chart-legend" role="note" aria-label="Legenda metriche">
          <span class="gm-legend-item">
            <span class="gm-legend-bar-swatch"></span>
            <span class="text-xs text-[var(--gm-text-secondary)] font-semibold">Ore di Volo</span>
          </span>
          <span class="gm-legend-item">
            <span class="gm-legend-line-swatch"></span>
            <span class="text-xs text-[var(--gm-text-secondary)] font-semibold">Numero Voli</span>
          </span>
        </div>
      </div>

      <div class="gm-chart-card">
        <div class="gm-chart-svg-wrap">
          <svg
            class="gm-chart-svg"
            viewBox="0 0 360 160"
            width="100%"
            height="auto"
            role="img"
            aria-label="${escapeHtml(ariaLabel)}"
          >
            <!-- Background Grid Lines -->
            <line x1="32" y1="24" x2="328" y2="24" stroke="var(--gm-border)" stroke-dasharray="2,2" stroke-width="1" />
            <line x1="32" y1="72" x2="328" y2="72" stroke="var(--gm-border)" stroke-dasharray="2,2" stroke-width="1" />
            <line x1="32" y1="120" x2="328" y2="120" stroke="var(--gm-border-strong)" stroke-width="1" />

            <!-- Left Y-Axis Value Labels (Hours) -->
            <text x="26" y="27" text-anchor="end" font-size="8.5" fill="var(--gm-text-muted)" font-family="monospace">${ceilingHours}h</text>
            <text x="26" y="75" text-anchor="end" font-size="8.5" fill="var(--gm-text-muted)" font-family="monospace">${midHours}h</text>
            <text x="26" y="123" text-anchor="end" font-size="8.5" fill="var(--gm-text-muted)" font-family="monospace">0h</text>

            <!-- Right Y-Axis Value Labels (Flight Count) -->
            <text x="334" y="27" text-anchor="start" font-size="8.5" fill="#38bdf8" font-family="monospace">${ceilingFlights}v</text>
            <text x="334" y="75" text-anchor="start" font-size="8.5" fill="#38bdf8" font-family="monospace">${midFlights}v</text>
            <text x="334" y="123" text-anchor="start" font-size="8.5" fill="#38bdf8" font-family="monospace">0</text>

            <!-- 12 Monthly Bars & Labels -->
            ${barsMarkup}

            <!-- Overlapping Flights Polyline & Points -->
            <polyline
              points="${polylinePoints}"
              fill="none"
              stroke="#38bdf8"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            ${pointsMarkup}
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
      ${renderMonthlyActivityChartHtml(monthlyActivity)}

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

      <!-- Frequented Sites & Gliders with Donut Charts -->
      <div class="gm-stats-distribution-grid">
        ${renderDonutDistributionCardHtml({
          id: 'heading-top-sites',
          title: 'Decolli Più Frequentati',
          items: sortedSites,
          totalFlights: safeFlights.length,
          emptyMessage: 'Nessun dato registrato'
        })}

        ${renderDonutDistributionCardHtml({
          id: 'heading-top-gliders',
          title: 'Vele Utilizzate',
          items: sortedGliders,
          totalFlights: safeFlights.length,
          emptyMessage: 'Nessun dato registrato'
        })}
      </div>
    </div>
  `;
}
