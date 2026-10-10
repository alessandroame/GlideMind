/**
 * GlideMind - Flight Detail & Debriefing Full-Screen View (UI Layer - Fase 6-ter)
 * Full-viewport (100dvh) dedicated aeronautical debriefing view.
 * 
 * Replaces the constrained bottom sheet ("flyer") with an immersive full-screen experience.
 * Complies with:
 *   - Laws of UX:
 *       - Jakob's Law: Full-screen post-flight analysis matching standard avionics (XContest, SeeYou).
 *       - Fitts's Law: Touch target floor >= 48px, thumb zone sticky bottom bar for primary actions.
 *       - Von Restorff Effect: Prominent primary CTA (Replay 3D).
 *       - Gestalt (Common Region & Proximity): Metric cards in responsive 2x3/3x2 grid.
 *       - Postel's Law & NN/G #5: Debounced autosave on pilot notes with visual feedback.
 *       - Doherty Threshold (<400ms): Instant DOM mounting with zero gesture conflicts.
 *   - Engineering Sobriety: Clean aeronautical typography, zero decorative emojis, WCAG AA contrast.
 *   - Mobile Outdoor Ergonomics: touch-action: pan-y, high-contrast sunlight tokens.
 */

import { logbookManager } from '../../core/logbookDb.js';
import { store } from '../../core/store.js';
import { closeSheet } from '../sheetManager.js';
import {
  generateFlightPhaseGradient,
  FLIGHT_PHASE_COLORS
} from '../../core/flightTelemetry.js';

let activeDetailOverlay = null;
let previousActiveEl = null;
let escapeKeyHandler = null;
let hashChangeHandler = null;

/**
 * Escapes unsafe HTML characters.
 * @param {string|number|null|undefined} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generates an SVG altimetric chart with elevation axes and points.
 * @param {Array<Object>} points
 * @param {number} [width=500]
 * @param {number} [height=130]
 * @returns {string} SVG inner HTML
 */
export function generateExpandedSvgChart(points, width = 500, height = 130) {
  if (!points || !Array.isArray(points) || points.length < 2) {
    return `
      <div class="flex items-center justify-center h-full text-xs text-[var(--gm-text-muted)]">
        Tracciato altimetrico non disponibile
      </div>
    `;
  }

  const alts = points.map((p) => (typeof p.alt === 'number' && !isNaN(p.alt) ? p.alt : 0));
  const minAlt = Math.min(...alts);
  const maxAlt = Math.max(...alts);
  const range = Math.max(1, maxAlt - minAlt);
  const padTop = 15;
  const padBottom = 22;
  const chartHeight = height - padTop - padBottom;

  const n = points.length;
  const polyPoints = points
    .map((p, idx) => {
      const x = Math.round((idx / (n - 1)) * width * 10) / 10;
      const y = Math.round((padTop + (1 - (p.alt - minAlt) / range) * chartHeight) * 10) / 10;
      return `${x},${y}`;
    })
    .join(' ');

  const takeoffAlt = Math.round(alts[0]);
  const landingAlt = Math.round(alts[alts.length - 1]);

  return `
    <svg viewBox="0 0 ${width} ${height}" class="w-full h-full" preserveAspectRatio="none" role="img" aria-label="Grafico altimetrico del volo: Quota massima ${maxAlt} m, Minima ${minAlt} m">
      <!-- Grid reference lines -->
      <line x1="0" y1="${padTop}" x2="${width}" y2="${padTop}" stroke="var(--gm-border)" stroke-dasharray="4,4" stroke-width="1" />
      <line x1="0" y1="${height - padBottom}" x2="${width}" y2="${height - padBottom}" stroke="var(--gm-border)" stroke-width="1" />

      <!-- Area fill below path -->
      <polygon points="0,${height - padBottom} ${polyPoints} ${width},${height - padBottom}" fill="rgba(14, 165, 233, 0.14)" />

      <!-- Main altitude polyline -->
      <polyline points="${polyPoints}" fill="none" stroke="var(--gm-accent-sky, #0ea5e9)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

      <!-- Labels -->
      <text x="8" y="${padTop + 12}" fill="var(--gm-text-secondary)" font-size="11" font-family="monospace" font-weight="700">Max: ${maxAlt} m</text>
      <text x="8" y="${height - padBottom - 6}" fill="var(--gm-text-secondary)" font-size="11" font-family="monospace">Min: ${minAlt} m</text>
      <text x="${width - 8}" y="${padTop + 12}" text-anchor="end" fill="var(--gm-text-secondary)" font-size="11" font-family="monospace">Decollo: ${takeoffAlt} m</text>
      <text x="${width - 8}" y="${height - padBottom - 6}" text-anchor="end" fill="var(--gm-text-secondary)" font-size="11" font-family="monospace">Atterraggio: ${landingAlt} m</text>
    </svg>
  `;
}

/**
 * Generates an educational safety debriefing from flight telemetry.
 * Formulated with Instructor Guido's concise, safety-first persona.
 * Robust against telemetry schema differences (altGain vs netGain, originDeg vs bearingDeg).
 * @param {Object} bundle
 * @returns {string} Debriefing text
 */
export function generateEducationalDebriefing(bundle) {
  const meta = bundle.meta || {};
  const tel = bundle.telemetry || {};
  const thermals = Array.isArray(tel.thermals) ? tel.thermals : [];
  const windDrift = tel.dominantWindDrift || null;
  const maneuvers = Array.isArray(tel.maneuvers) ? tel.maneuvers : [];

  const lines = [];

  // 1. Overall thermal efficiency
  if (thermals.length > 0) {
    const totalThermalGain = thermals.reduce((sum, t) => {
      const g = typeof t.altGain === 'number' ? t.altGain : (typeof t.netGain === 'number' ? t.netGain : ((t.exitAlt || 0) - (t.entryAlt || 0)));
      return sum + Math.max(0, g);
    }, 0);

    const bestThermal = thermals.reduce((max, t) => {
      const g = typeof t.altGain === 'number' ? t.altGain : (typeof t.netGain === 'number' ? t.netGain : 0);
      const maxG = max ? (typeof max.altGain === 'number' ? max.altGain : (typeof max.netGain === 'number' ? max.netGain : 0)) : -1;
      return g > maxG ? t : max;
    }, null);

    lines.push(`Attività termica rilevata: ${thermals.length} ${thermals.length === 1 ? 'termica' : 'termiche'}, guadagno netto cumulato di +${totalThermalGain} m.`);
    if (bestThermal) {
      const bestGain = typeof bestThermal.altGain === 'number' ? bestThermal.altGain : (typeof bestThermal.netGain === 'number' ? bestThermal.netGain : ((bestThermal.exitAlt || 0) - (bestThermal.entryAlt || 0)));
      lines.push(`Miglior salita: Termica #${bestThermal.thermalIndex || 1} con +${bestGain} m a rateo medio di +${bestThermal.avgClimbRate || 0} m/s (${bestThermal.durationFormatted || ''}).`);
    }
  } else {
    lines.push('Volo privo di termicamento sostenuto: traiettoria di planata o veleggiamento in dinamica pura.');
  }

  // 2. Wind drift & leeside awareness
  if (windDrift && windDrift.speedKmh > 0) {
    const windDeg = typeof windDrift.originDeg === 'number' ? windDrift.originDeg : (typeof windDrift.bearingDeg === 'number' ? windDrift.bearingDeg : null);
    if (windDrift.speedKmh >= 18) {
      lines.push(`Vento di deriva in quota stimato sostenuto: ${windDrift.speedKmh} km/h${windDeg != null ? ` da ${windDeg}°` : ''} (${windDrift.cardinal || ''}). Attenzione all'avanzamento controvento e ai rotori sui costoni sottovento.`);
    } else {
      lines.push(`Deriva del vento in quota moderata: ~${windDrift.speedKmh} km/h da ${windDrift.cardinal || (windDeg != null ? `${windDeg}°` : 'direzione variabile')}. Centramento fluido in spirale.`);
    }
  }

  // 3. Glider class conservative check
  const gliderClass = meta.gliderClass || 'Custom';
  if (gliderClass === 'EN-A') {
    lines.push('Assetto vela scuola/intermedia (EN-A): ottimo margine passivo di stabilità. Mantieni sempre il cono di planata verso l\'atterraggio con almeno 150m di quota residua.');
  } else if (gliderClass === 'EN-B') {
    lines.push('Assetto EN-B: gestione dinamica attiva dell\'ala. Monitora la velocità di discesa nelle transizioni in turbolenza.');
  }

  // 4. Maneuvers & sink control
  if (maneuvers.length > 0) {
    lines.push(`Esercizi registrati: ${maneuvers.length} manovre rilevate. Controlla sempre l'altitudine prima di impostare spirali o discese rapide.`);
  }

  return lines.join('\n\n');
}

/**
 * Renders the complete HTML body for the Full-Screen Flight Detail View.
 * @param {Object} bundle - { meta, raw, telemetry }
 * @returns {string} HTML string
 */
export function renderFlightDetailHtml(bundle) {
  const meta = bundle.meta || {};
  const raw = bundle.raw || {};
  const tel = bundle.telemetry || {};

  const flightId = meta.id || '';
  const siteTitle = meta.siteName || meta.site || 'Volo Libero';
  const siteSub = meta.site && meta.site !== siteTitle ? meta.site : '';
  const dateFormatted = meta.date || 'Data N/D';
  const takeoffTime = meta.takeoffTime || '--:--';
  const landingTime = meta.landingTime || '--:--';
  const duration = meta.durationMinutes ? `${meta.durationMinutes} min` : '--';
  const glider = meta.glider || 'Parapendio';
  const gliderClass = meta.gliderClass || 'Custom';
  const classBadgeStyle = (gliderClass || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '');

  const points = raw.decimatedPoints || [];
  const svgChartHtml = generateExpandedSvgChart(points, 600, 130);

  // Gradient phase bar
  const phaseGradient = generateFlightPhaseGradient(raw);
  const thermals = Array.isArray(tel.thermals) ? tel.thermals : [];
  const maneuvers = Array.isArray(tel.maneuvers) ? tel.maneuvers : [];
  const windDrift = tel.dominantWindDrift || null;
  const windOrigin = typeof windDrift?.originDeg === 'number' ? windDrift.originDeg : (typeof windDrift?.bearingDeg === 'number' ? windDrift.bearingDeg : null);
  const hasWind = windDrift && windDrift.speedKmh > 0 && windOrigin !== null;

  // Kinetic metrics
  const maxAlt = meta.maxAltMsl ? `${meta.maxAltMsl} m` : '--';
  const maxGain = meta.maxGainMeters ? `+${meta.maxGainMeters} m` : '--';
  const climbRate = meta.maxClimbRate ? `+${meta.maxClimbRate} m/s` : '--';
  const sinkRate = meta.maxSinkRate ? `${meta.maxSinkRate} m/s` : '--';
  const accumClimb = meta.accumulatedClimbMeters ? `+${meta.accumulatedClimbMeters} m` : '--';
  const distance = meta.distanceKm ? `${meta.distanceKm} km` : '--';

  const notesText = meta.notes || '';
  const debriefText = generateEducationalDebriefing(bundle);

  return `
    <div id="flight-detail-overlay" class="gm-flight-detail-fullscreen" role="dialog" aria-modal="true" aria-labelledby="gm-flight-detail-title-text" data-flight-id="${escapeHtml(flightId)}">
      <!-- 1. Top Bar with Back Navigation Target (>= 48px touch target) -->
      <header class="gm-flight-detail-topbar">
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <button
            type="button"
            id="btn-flight-detail-back"
            class="gm-flight-detail-back-btn"
            aria-label="Torna al Libretto Voli"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Libretto</span>
          </button>

          <div class="flex flex-col min-w-0">
            <h2 id="gm-flight-detail-title-text" class="text-base sm:text-lg font-bold text-[var(--gm-text-primary)] truncate m-0">
              ${escapeHtml(siteTitle)}
            </h2>
            <div class="text-xs text-[var(--gm-text-secondary)] flex items-center gap-2 truncate">
              <span>${escapeHtml(dateFormatted)}</span>
              <span>•</span>
              <span>${escapeHtml(duration)}</span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="gm-glider-pill-badge ${classBadgeStyle}">
            ${escapeHtml(gliderClass)}
          </span>
          <span class="text-xs font-semibold text-[var(--gm-text-secondary)] hidden sm:inline max-w-[140px] truncate" title="${escapeHtml(glider)}">
            ${escapeHtml(glider)}
          </span>
        </div>
      </header>

      <!-- 2. Scrollable Body (100dvh flex-1, touch-action: pan-y) -->
      <main class="gm-flight-detail-scroll-body" tabindex="-1">
        <!-- Flight Info Sub-Card -->
        <div class="gm-flight-detail-header-card">
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm text-[var(--gm-text-secondary)]">
            <div class="flex items-center gap-2">
              <span class="font-bold text-[var(--gm-text-primary)]">${escapeHtml(takeoffTime)} → ${escapeHtml(landingTime)}</span>
              ${siteSub ? `<span>(${escapeHtml(siteSub)})</span>` : ''}
              <span>•</span>
              <span class="font-semibold text-[var(--gm-text-primary)]">${escapeHtml(duration)}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs text-[var(--gm-text-muted)]">ID: ${escapeHtml(flightId.slice(0, 14))}</span>
            </div>
          </div>
        </div>

        <!-- Altimetric Profile & Phases -->
        <section class="gm-flight-detail-section" aria-label="Profilo Altimetrico e Fasi di Volo">
          <h3 class="gm-flight-detail-section-title">Profilo Altimetrico &amp; Fasi di Volo</h3>
          <div class="gm-flight-detail-alt-chart">
            ${svgChartHtml}
          </div>
          <div class="gm-flight-detail-phase-bar" style="background: ${phaseGradient};" title="Timeline delle fasi di volo"></div>
          
          <!-- Phase Legend -->
          <div class="gm-phase-legend-grid">
            <div class="gm-phase-legend-item">
              <span class="gm-phase-dot" style="background: ${FLIGHT_PHASE_COLORS.takeoff};"></span>
              <span>Decollo</span>
            </div>
            <div class="gm-phase-legend-item">
              <span class="gm-phase-dot" style="background: ${FLIGHT_PHASE_COLORS.thermal};"></span>
              <span>Termica</span>
            </div>
            <div class="gm-phase-legend-item">
              <span class="gm-phase-dot" style="background: ${FLIGHT_PHASE_COLORS.soaring};"></span>
              <span>Veleggiamento</span>
            </div>
            <div class="gm-phase-legend-item">
              <span class="gm-phase-dot" style="background: ${FLIGHT_PHASE_COLORS.glide};"></span>
              <span>Planata</span>
            </div>
            <div class="gm-phase-legend-item">
              <span class="gm-phase-dot" style="background: ${FLIGHT_PHASE_COLORS.descent};"></span>
              <span>Discesa</span>
            </div>
            <div class="gm-phase-legend-item">
              <span class="gm-phase-dot" style="background: ${FLIGHT_PHASE_COLORS.landing};"></span>
              <span>Atterraggio</span>
            </div>
          </div>
        </section>

        <!-- Kinetic Telemetry 2x3 / 3x2 Responsive Card Grid -->
        <section class="gm-flight-detail-section" aria-label="Cinematica e Prestazioni">
          <h3 class="gm-flight-detail-section-title">Cinematica &amp; Prestazioni</h3>
          <div class="gm-flight-metrics-grid">
            <div class="gm-flight-metric-card">
              <span class="gm-flight-metric-num">${escapeHtml(maxAlt)}</span>
              <span class="gm-flight-metric-desc">Quota Massima MSL</span>
            </div>
            <div class="gm-flight-metric-card">
              <span class="gm-flight-metric-num text-emerald-400">${escapeHtml(maxGain)}</span>
              <span class="gm-flight-metric-desc">Guadagno dal Decollo</span>
            </div>
            <div class="gm-flight-metric-card">
              <span class="gm-flight-metric-num text-emerald-400">${escapeHtml(climbRate)}</span>
              <span class="gm-flight-metric-desc">Salita Massima (Vario)</span>
            </div>
            <div class="gm-flight-metric-card">
              <span class="gm-flight-metric-num text-sky-400">${escapeHtml(sinkRate)}</span>
              <span class="gm-flight-metric-desc">Discesa Massima</span>
            </div>
            <div class="gm-flight-metric-card">
              <span class="gm-flight-metric-num">${escapeHtml(accumClimb)}</span>
              <span class="gm-flight-metric-desc">Dislivello Cumulato</span>
            </div>
            <div class="gm-flight-metric-card">
              <span class="gm-flight-metric-num">${escapeHtml(distance)}</span>
              <span class="gm-flight-metric-desc">Distanza Orizzontale</span>
            </div>
          </div>

          ${hasWind ? `
            <div class="p-3.5 rounded-lg bg-[var(--gm-bg-card)] border border-[var(--gm-border)] flex items-center justify-between gap-3 text-xs">
              <div class="flex items-center gap-2">
                <span class="font-bold text-[var(--gm-accent-sky)]">Deriva del Vento Stimata:</span>
                <span class="font-mono">${windDrift.speedKmh} km/h da ${windOrigin}° (${escapeHtml(windDrift.cardinal || '')})</span>
              </div>
              <span class="text-[var(--gm-text-muted)]">Calcolata in spirale</span>
            </div>
          ` : ''}
        </section>

        <!-- Thermals Breakdown -->
        <section class="gm-flight-detail-section" aria-label="Analisi Termiche">
          <h3 class="gm-flight-detail-section-title">
            Analisi Termiche (${thermals.length})
          </h3>

          ${thermals.length > 0 ? `
            <div class="gm-thermals-grid">
              ${thermals.map((t, idx) => {
                const gain = typeof t.altGain === 'number' ? t.altGain : (typeof t.netGain === 'number' ? t.netGain : ((t.exitAlt || 0) - (t.entryAlt || 0)));
                const turns = t.turnCount != null ? t.turnCount : t.turns;
                const turnDir = t.turnDirection || t.turnDir;
                const eff = t.efficiencyPercent != null ? t.efficiencyPercent : t.efficiency;

                return `
                  <div class="gm-thermal-card">
                    <div class="flex items-center gap-3">
                      <div class="gm-thermal-index-badge">#${t.thermalIndex || (idx + 1)}</div>
                      <div class="flex flex-col">
                        <span class="font-bold text-sm text-[var(--gm-text-primary)]">
                          +${gain} m
                          <span class="text-xs font-normal text-[var(--gm-text-secondary)]">(${t.entryAlt || 0} m → ${t.exitAlt || 0} m)</span>
                        </span>
                        <span class="text-xs text-[var(--gm-text-muted)] font-mono">
                          ${escapeHtml(t.durationFormatted || '')} • Rateo medio: +${t.avgClimbRate || 0} m/s
                        </span>
                      </div>
                    </div>

                    <div class="flex flex-col items-end text-xs text-[var(--gm-text-secondary)]">
                      ${turns ? `<span>${turns} giri (${turnDir === 'CW' ? 'Orario' : 'Antiorario'})</span>` : ''}
                      ${eff != null ? `<span class="font-bold text-emerald-400">${eff}% in salita</span>` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div class="p-4 rounded-lg bg-[var(--gm-bg-card)] border border-[var(--gm-border)] text-xs text-[var(--gm-text-muted)] text-center">
              Nessuna salita termica circolare rilevata in questo volo.
            </div>
          `}
        </section>

        <!-- Maneuvers Breakdown -->
        ${maneuvers.length > 0 ? `
          <section class="gm-flight-detail-section" aria-label="Manovre ed Esercizi">
            <h3 class="gm-flight-detail-section-title">
              Manovre ed Esercizi (${maneuvers.length})
            </h3>
            <div class="flex flex-col gap-2">
              ${maneuvers.map((m) => `
                <div class="p-3 rounded-lg bg-[var(--gm-bg-card)] border border-[var(--gm-border)] flex items-center justify-between text-xs">
                  <span class="font-bold text-[var(--gm-text-primary)]">${escapeHtml(m.type || 'Manovra')}</span>
                  <span class="text-[var(--gm-text-secondary)]">${escapeHtml(m.details || '')}</span>
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <!-- Educational Safety Debriefing (Instructor Guido) -->
        <section class="gm-debrief-box" aria-label="Debriefing Didattico di Sicurezza">
          <div class="gm-debrief-header">
            <h3 class="gm-flight-detail-section-title" style="margin: 0;">Debriefing Didattico di Sicurezza</h3>
            <span class="gm-debrief-instructor-tag">Istruttore Guido</span>
          </div>
          <div class="gm-debrief-text" id="gm-debrief-content">
            ${escapeHtml(debriefText)}
          </div>
        </section>

        <!-- Pilot Personal Notes (with Autosave) -->
        <section class="gm-flight-detail-section" aria-label="Note Personali del Pilota">
          <div class="flex items-center justify-between">
            <h3 class="gm-flight-detail-section-title">Note Personali del Pilota</h3>
            <span id="gm-notes-status" class="text-xs font-semibold text-emerald-400 opacity-0 transition-opacity duration-300">Salvate</span>
          </div>
          <textarea
            id="gm-flight-notes-input"
            class="gm-flight-notes-textarea"
            placeholder="Aggiungi note su condizioni meteo, settaggio imbrago, veleggiamento o sensazioni di pilotaggio..."
            aria-label="Note personali del pilota"
          >${escapeHtml(notesText)}</textarea>
          <div class="flex justify-end">
            <button
              type="button"
              id="btn-save-flight-notes"
              class="gm-btn-secondary"
              style="min-height: var(--gm-touch-min, 48px); padding: 0 20px;"
            >
              Salva Note
            </button>
          </div>
        </section>
      </main>

      <!-- 3. Sticky Bottom Action Bar (Thumb Zone Ergonomics) -->
      <footer class="gm-flight-detail-bottom-bar" role="contentinfo">
        <div class="gm-flight-detail-bottom-bar-inner">
          <button
            type="button"
            id="btn-replay-from-detail"
            class="gm-btn-primary flex-1"
            style="min-height: var(--gm-touch-min, 48px);"
          >
            Visualizza Replay 3D
          </button>
          <button
            type="button"
            id="btn-download-from-detail"
            class="gm-btn-secondary flex-shrink-0"
            style="min-height: var(--gm-touch-min, 48px); padding: 0 16px;"
          >
            Scarica Traccia IGC (FAI)
          </button>
        </div>
      </footer>
    </div>
  `;
}

/**
 * Closes and removes the active full-screen flight detail view.
 */
export function closeFlightDetailView() {
  if (escapeKeyHandler && typeof window !== 'undefined') {
    window.removeEventListener('keydown', escapeKeyHandler);
    escapeKeyHandler = null;
  }
  if (hashChangeHandler && typeof window !== 'undefined') {
    window.removeEventListener('hashchange', hashChangeHandler);
    hashChangeHandler = null;
  }

  if (activeDetailOverlay) {
    if (activeDetailOverlay.parentNode) {
      activeDetailOverlay.parentNode.removeChild(activeDetailOverlay);
    }
    activeDetailOverlay = null;
  }

  // Restore body scroll behavior
  if (typeof document !== 'undefined' && document.body) {
    document.body.style.overflow = '';
  }

  // Restore keyboard focus to caller element
  if (previousActiveEl && typeof previousActiveEl.focus === 'function') {
    previousActiveEl.focus();
    previousActiveEl = null;
  }
}

/**
 * Opens the Full-Screen Flight Detail View for a given flight ID.
 * Replaces the former bottom sheet modal ("flyer") with a 100dvh dedicated view.
 * @param {string} flightId
 * @param {Object} [options={}]
 * @returns {Promise<void>}
 */
export async function openFlightDetailView(flightId, options = {}) {
  if (!flightId) return;

  const bundle = await logbookManager.getFlightDetail(flightId);
  if (!bundle || !bundle.meta) {
    console.warn('[FlightDetailView] Volo non trovato:', flightId);
    return;
  }

  // Close any active drawer/sheet first (Single Active Modal / Overlay Policy)
  closeSheet(true);
  closeFlightDetailView();

  const siteTitle = bundle.meta.siteName || bundle.meta.site || 'Dettaglio Volo';
  const dateFormatted = bundle.meta.date || '';
  const title = `${siteTitle} • ${dateFormatted}`;
  const html = renderFlightDetailHtml(bundle);

  // Test environment mock support
  if (typeof globalThis !== 'undefined' && typeof globalThis.__mockOpenSheet === 'function') {
    globalThis.__mockOpenSheet({ id: 'flight-detail', title, content: html });
  }

  if (typeof document === 'undefined') return;

  // Remember previous active element for accessibility focus restoration
  previousActiveEl = document.activeElement;

  const tempWrapper = document.createElement('div');
  tempWrapper.innerHTML = html.trim();
  const overlayEl = tempWrapper.firstElementChild;

  if (!overlayEl) return;

  document.body.appendChild(overlayEl);
  document.body.style.overflow = 'hidden';
  activeDetailOverlay = overlayEl;

  // 1. Back button click handler
  const backBtn = overlayEl.querySelector('#btn-flight-detail-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      closeFlightDetailView();
    });
  }

  // 2. Escape key dismissal listener
  escapeKeyHandler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeFlightDetailView();
    }
  };
  window.addEventListener('keydown', escapeKeyHandler);

  // 3. Hash change listener to dismiss if user navigates via browser back
  hashChangeHandler = () => {
    closeFlightDetailView();
  };
  window.addEventListener('hashchange', hashChangeHandler, { once: true });

  // 4. Pilot notes: Debounced autosave + explicit save button
  const notesBtn = overlayEl.querySelector('#btn-save-flight-notes');
  const notesInput = overlayEl.querySelector('#gm-flight-notes-input');
  const notesStatus = overlayEl.querySelector('#gm-notes-status');

  let debounceTimer = null;

  const saveNotesFn = async () => {
    if (!notesInput) return;
    const newNotes = notesInput.value;
    try {
      await logbookManager.updateFlightNotes(flightId, newNotes);
      if (notesStatus) {
        notesStatus.style.opacity = '1';
        setTimeout(() => {
          if (notesStatus) notesStatus.style.opacity = '0';
        }, 2200);
      }
    } catch (err) {
      console.error('[FlightDetailView] Errore nel salvataggio note:', err);
    }
  };

  if (notesInput) {
    notesInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(saveNotesFn, 800);
    });
  }

  if (notesBtn) {
    notesBtn.addEventListener('click', async () => {
      clearTimeout(debounceTimer);
      notesBtn.disabled = true;
      try {
        await saveNotesFn();
      } finally {
        notesBtn.disabled = false;
      }
    });
  }

  // 5. 3D Replay handler
  const replayBtn = overlayEl.querySelector('#btn-replay-from-detail');
  if (replayBtn) {
    replayBtn.addEventListener('click', () => {
      if (store && typeof store.setState === 'function') {
        store.setState({ activeReplayFlightId: flightId });
      }
      closeFlightDetailView();
      if (typeof window !== 'undefined' && window.location) {
        window.location.hash = `#replay?flightId=${encodeURIComponent(flightId)}`;
      }
    });
  }

  // 6. Download IGC handler
  const downloadBtn = overlayEl.querySelector('#btn-download-from-detail');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      try {
        await logbookManager.exportFlightIgc(flightId);
      } catch (err) {
        console.error('[FlightDetailView] Errore durante export IGC:', err);
      }
    });
  }

  // 7. Focus first interactive element for keyboard accessibility
  if (backBtn && typeof backBtn.focus === 'function') {
    backBtn.focus();
  }
}

/**
 * Backward compatibility alias for openFlightDetailView.
 */
export const openFlightDetailSheet = openFlightDetailView;
export const closeFlightDetailSheet = closeFlightDetailView;
