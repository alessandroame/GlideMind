/**
 * GlideMind - Pilot Statistics & Currency View Controller (UI Layer)
 * Renders pilot currency, career KPIs, personal records, and flight distributions.
 * 
 * Complies with:
 *  - Laws of UX (Miller's Law, Gestalt Common Region, Doherty <400ms).
 *  - Engineering Sobriety (Zero decorative emojis, clean typography, WCAG AA contrast).
 *  - Novice Pilot Spec & Safety (Currency tiers: Active, Reentry, Lapsed).
 */

import { calculatePilotPeriodMetrics, PILOT_CURRENCY_STATUS } from '../../core/logbook.js';

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
 * Renders the Pilot Statistics & Currency tab content.
 * @param {Array<Object>} flights
 * @returns {string} HTML string
 */
export function renderLogbookStatsHtml(flights = []) {
  const safeFlights = Array.isArray(flights) ? flights : [];

  // Compute period metrics via headless core
  const periodMetrics = calculatePilotPeriodMetrics({
    flights: safeFlights,
    referenceDate: new Date()
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
