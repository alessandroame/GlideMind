/**
 * GlideMind - Flight Detail & Debriefing Sheet (UI Layer - Fase 6-ter)
 * Full-height (100dvh) bottom sheet managed via SheetManager.
 * Displays:
 *   - Expanded altimetric profile and flight phase timeline bar.
 *   - Kinetic telemetry summary (max alt, gain, climb/sink rates, dominant wind drift).
 *   - Granular thermals breakdown table (entry/exit altitude, net gain, avg rate, turns).
 *   - Maneuver recognition & educational explanation (core/flightManeuvers.js).
 *   - Personal pilot notes with immediate IndexedDB persistence.
 *   - Educational safety debriefing (Instructor Guido persona - ai-briefing-gemini).
 *   - Replay 3D dispatch and authentic FAI IGC export.
 * 
 * Governed by Laws of UX (Fitts >= 48px, Doherty < 400ms, zero nested modals).
 */

import { logbookManager } from '../../core/logbookDb.js';
import { store } from '../../core/store.js';
import { openSheet, closeSheet } from '../sheetManager.js';
import {
  generateFlightPhaseGradient,
  generateVarioTimelineGradient,
  FLIGHT_PHASE_COLORS
} from '../../core/flightTelemetry.js';

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
 * @param {number} [height=120]
 * @returns {string} SVG inner HTML
 */
export function generateExpandedSvgChart(points, width = 500, height = 120) {
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
  const padBottom = 20;
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
    <svg viewBox="0 0 ${width} ${height}" class="w-full h-full" preserveAspectRatio="none" aria-label="Grafico altimetrico del volo">
      <!-- Grid reference lines -->
      <line x1="0" y1="${padTop}" x2="${width}" y2="${padTop}" stroke="var(--gm-border)" stroke-dasharray="4,4" stroke-width="1" />
      <line x1="0" y1="${height - padBottom}" x2="${width}" y2="${height - padBottom}" stroke="var(--gm-border)" stroke-width="1" />

      <!-- Area fill below path -->
      <polygon points="0,${height - padBottom} ${polyPoints} ${width},${height - padBottom}" fill="rgba(14, 165, 233, 0.12)" />

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
 * Formulated with Instructor Guido's concise, cynical, safety-first persona.
 * @param {Object} bundle
 * @returns {string} Debriefing text
 */
export function generateEducationalDebriefing(bundle) {
  const meta = bundle.meta || {};
  const tel = bundle.telemetry || {};
  const thermals = tel.thermals || [];
  const windDrift = tel.dominantWindDrift || null;
  const maneuvers = tel.maneuvers || [];

  const lines = [];

  // 1. Overall thermal efficiency
  if (thermals.length > 0) {
    const totalThermalGain = thermals.reduce((sum, t) => sum + (t.netGain || 0), 0);
    const bestThermal = thermals.reduce((max, t) => (!max || (t.netGain || 0) > (max.netGain || 0) ? t : max), null);
    lines.push(`Attività termica rilevata: ${thermals.length} ${thermals.length === 1 ? 'termica' : 'termiche'}, guadagno netto cumulato di +${totalThermalGain} m.`);
    if (bestThermal) {
      lines.push(`Miglior salita: Termica #${bestThermal.thermalIndex || 1} con +${bestThermal.netGain} m a rateo medio di +${bestThermal.avgClimbRate || 0} m/s (${bestThermal.durationFormatted || ''}).`);
    }
  } else {
    lines.push('Volo privo di termicamento sostenuto: traiettoria di planata o veleggiamento in dinamica pura.');
  }

  // 2. Wind drift & leeside awareness
  if (windDrift && windDrift.speedKmh > 0) {
    if (windDrift.speedKmh >= 18) {
      lines.push(`Vento di deriva in quota stimato sostenuto: ${windDrift.speedKmh} km/h da ${windDrift.bearingDeg}° (${windDrift.cardinal || ''}). Attenzione all'avanzamento controvento e ai rotori sui costoni sottovento.`);
    } else {
      lines.push(`Deriva del vento in quota moderata: ~${windDrift.speedKmh} km/h da ${windDrift.cardinal || 'direzione variabile'}. Centramento fluido in spirale.`);
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
 * Renders the complete HTML body for the Flight Detail Sheet.
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
  const svgChartHtml = generateExpandedSvgChart(points, 500, 120);

  // Gradient phase bar
  const phaseGradient = generateFlightPhaseGradient(raw);
  const thermals = Array.isArray(tel.thermals) ? tel.thermals : [];
  const maneuvers = Array.isArray(tel.maneuvers) ? tel.maneuvers : [];
  const windDrift = tel.dominantWindDrift || null;

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
    <div class="gm-flight-detail-sheet" data-flight-id="${escapeHtml(flightId)}">
      <!-- 1. Header Card -->
      <section class="gm-flight-detail-header-card">
        <div class="flex items-center justify-between gap-3">
          <div class="flex flex-col min-w-0 flex-1">
            <h3 class="gm-flight-detail-title">
              ${escapeHtml(siteTitle)}
            </h3>
            <div class="gm-flight-detail-sub">
              ${siteSub ? `<span>${escapeHtml(siteSub)}</span><span>•</span>` : ''}
              <span>${escapeHtml(dateFormatted)}</span>
              <span>•</span>
              <span>${escapeHtml(takeoffTime)} → ${escapeHtml(landingTime)}</span>
              <span>•</span>
              <span class="font-bold text-[var(--gm-text-primary)]">${escapeHtml(duration)}</span>
            </div>
          </div>

          <div class="flex items-center gap-1.5 flex-shrink-0">
            <span class="gm-glider-pill-badge ${classBadgeStyle}">
              ${escapeHtml(gliderClass)}
            </span>
            <span class="text-xs font-semibold text-[var(--gm-text-secondary)] max-w-[110px] truncate" title="${escapeHtml(glider)}">
              ${escapeHtml(glider)}
            </span>
          </div>
        </div>
      </section>

      <!-- 2. Altimetric Profile & Phases -->
      <section class="gm-flight-detail-section">
        <h4 class="gm-flight-detail-section-title">Profilo Altimetrico & Fasi di Volo</h4>
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

      <!-- 3. Key Kinetic Telemetry Grid -->
      <section class="gm-flight-detail-section">
        <h4 class="gm-flight-detail-section-title">Cinematica & Prestazioni</h4>
        <div class="gm-flight-metrics-grid">
          <div class="gm-flight-metric-item">
            <span class="gm-flight-metric-num">${escapeHtml(maxAlt)}</span>
            <span class="gm-flight-metric-desc">Quota Massima MSL</span>
          </div>
          <div class="gm-flight-metric-item">
            <span class="gm-flight-metric-num">${escapeHtml(maxGain)}</span>
            <span class="gm-flight-metric-desc">Guadagno dal Decollo</span>
          </div>
          <div class="gm-flight-metric-item">
            <span class="gm-flight-metric-num text-emerald-400">${escapeHtml(climbRate)}</span>
            <span class="gm-flight-metric-desc">Salita Massima (Vario)</span>
          </div>
          <div class="gm-flight-metric-item">
            <span class="gm-flight-metric-num text-sky-400">${escapeHtml(sinkRate)}</span>
            <span class="gm-flight-metric-desc">Discesa Massima</span>
          </div>
          <div class="gm-flight-metric-item">
            <span class="gm-flight-metric-num">${escapeHtml(accumClimb)}</span>
            <span class="gm-flight-metric-desc">Dislivello Cumulato</span>
          </div>
          <div class="gm-flight-metric-item">
            <span class="gm-flight-metric-num">${escapeHtml(distance)}</span>
            <span class="gm-flight-metric-desc">Distanza Orizzontale</span>
          </div>
        </div>

        ${windDrift && windDrift.speedKmh > 0 ? `
          <div class="p-3 rounded-lg bg-[var(--gm-bg-card)] border border-[var(--gm-border)] flex items-center justify-between gap-3 text-xs">
            <div class="flex items-center gap-2">
              <span class="font-bold text-[var(--gm-accent-sky)]">Deriva del Vento Stimata:</span>
              <span class="font-mono">${windDrift.speedKmh} km/h da ${windDrift.bearingDeg}° (${escapeHtml(windDrift.cardinal || '')})</span>
            </div>
            <span class="text-[var(--gm-text-muted)]">Calcolata in spirale</span>
          </div>
        ` : ''}
      </section>

      <!-- 4. Thermals Breakdown -->
      <section class="gm-flight-detail-section">
        <h4 class="gm-flight-detail-section-title">
          Analisi Termiche (${thermals.length})
        </h4>

        ${thermals.length > 0 ? `
          <div class="gm-thermals-grid">
            ${thermals.map((t, idx) => `
              <div class="gm-thermal-card">
                <div class="flex items-center gap-3">
                  <div class="gm-thermal-index-badge">#${t.thermalIndex || (idx + 1)}</div>
                  <div class="flex flex-col">
                    <span class="font-bold text-sm text-[var(--gm-text-primary)]">
                      +${t.netGain || 0} m
                      <span class="text-xs font-normal text-[var(--gm-text-secondary)]">(${t.entryAlt || 0} m → ${t.exitAlt || 0} m)</span>
                    </span>
                    <span class="text-xs text-[var(--gm-text-muted)] font-mono">
                      ${escapeHtml(t.durationFormatted || '')} • Rateo medio: +${t.avgClimbRate || 0} m/s
                    </span>
                  </div>
                </div>

                <div class="flex flex-col items-end text-xs text-[var(--gm-text-secondary)]">
                  ${t.turns ? `<span>${t.turns} giri (${t.turnDir === 'CW' ? 'Orario' : 'Antiorario'})</span>` : ''}
                  ${t.efficiency != null ? `<span class="font-bold text-emerald-400">${t.efficiency}% in salita</span>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="p-4 rounded-lg bg-[var(--gm-bg-card)] border border-[var(--gm-border)] text-xs text-[var(--gm-text-muted)] text-center">
            Nessuna salita termica circolare rilevata in questo volo.
          </div>
        `}
      </section>

      <!-- 5. Maneuvers Breakdown -->
      ${maneuvers.length > 0 ? `
        <section class="gm-flight-detail-section">
          <h4 class="gm-flight-detail-section-title">
            Manovre ed Esercizi (${maneuvers.length})
          </h4>
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

      <!-- 6. Educational Safety Debriefing (Instructor Guido) -->
      <section class="gm-debrief-box">
        <div class="gm-debrief-header">
          <span class="gm-flight-detail-section-title" style="margin: 0;">Debriefing Didattico di Sicurezza</span>
          <span class="gm-debrief-instructor-tag">Istruttore Guido</span>
        </div>
        <div class="gm-debrief-text" id="gm-debrief-content">
          ${escapeHtml(debriefText)}
        </div>
      </section>

      <!-- 7. Pilot Personal Notes -->
      <section class="gm-flight-detail-section">
        <div class="flex items-center justify-between">
          <h4 class="gm-flight-detail-section-title">Note Personali del Pilota</h4>
          <span id="gm-notes-status" class="text-xs text-emerald-400 hidden">Salvate</span>
        </div>
        <textarea
          id="gm-flight-notes-input"
          class="gm-flight-notes-textarea"
          placeholder="Aggiungi note su condizioni, veleggiamento, regolazione imbrago o sensazioni in volo..."
          aria-label="Note personali del pilota"
        >${escapeHtml(notesText)}</textarea>
        <button
          type="button"
          id="btn-save-flight-notes"
          class="gm-btn-secondary w-full"
          style="min-height: var(--gm-touch-min, 48px);"
        >
          Salva Note
        </button>
      </section>

      <!-- 8. Action Buttons -->
      <section class="flex flex-col gap-2 pt-2 border-t border-[var(--gm-border)]">
        <button
          type="button"
          id="btn-replay-from-detail"
          class="gm-btn-primary w-full"
          style="min-height: var(--gm-touch-min, 48px);"
        >
          Visualizza Replay 3D
        </button>
        <button
          type="button"
          id="btn-download-from-detail"
          class="gm-btn-secondary w-full"
          style="min-height: var(--gm-touch-min, 48px);"
        >
          Scarica Traccia IGC (FAI)
        </button>
      </section>
    </div>
  `;
}

/**
 * Opens the Flight Detail Sheet for a given flight ID.
 * @param {string} flightId
 * @param {Object} [options={}]
 * @returns {Promise<void>}
 */
export async function openFlightDetailSheet(flightId, options = {}) {
  if (!flightId) return;

  const bundle = await logbookManager.getFlightDetail(flightId);
  if (!bundle || !bundle.meta) {
    console.warn('[FlightDetailSheet] Volo non trovato:', flightId);
    return;
  }

  const siteTitle = bundle.meta.siteName || bundle.meta.site || 'Dettaglio Volo';
  const dateFormatted = bundle.meta.date || '';
  const title = `${siteTitle} • ${dateFormatted}`;

  const htmlContent = renderFlightDetailHtml(bundle);

  openSheet({
    id: 'flight-detail',
    title,
    content: htmlContent,
    onOpen: () => {
      if (typeof document === 'undefined') return;

      // 1. Save notes handler
      const notesBtn = document.getElementById('btn-save-flight-notes');
      const notesInput = document.getElementById('gm-flight-notes-input');
      const notesStatus = document.getElementById('gm-notes-status');

      if (notesBtn && notesInput) {
        notesBtn.addEventListener('click', async () => {
          notesBtn.disabled = true;
          const newNotes = notesInput.value;
          try {
            await logbookManager.updateFlightNotes(flightId, newNotes);
            if (notesStatus) {
              notesStatus.classList.remove('hidden');
              setTimeout(() => notesStatus.classList.add('hidden'), 2500);
            }
          } catch (err) {
            console.error('[FlightDetailSheet] Errore nel salvataggio note:', err);
          } finally {
            notesBtn.disabled = false;
          }
        });
      }

      // 2. 3D Replay handler
      const replayBtn = document.getElementById('btn-replay-from-detail');
      if (replayBtn) {
        replayBtn.addEventListener('click', () => {
          if (store && typeof store.setState === 'function') {
            store.setState({ activeReplayFlightId: flightId });
          }
          closeSheet();
          if (typeof window !== 'undefined' && window.location) {
            window.location.hash = '#replay';
          }
        });
      }

      // 3. Download IGC handler
      const downloadBtn = document.getElementById('btn-download-from-detail');
      if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
          try {
            await logbookManager.exportFlightIgc(flightId);
          } catch (err) {
            console.error('[FlightDetailSheet] Errore durante export IGC:', err);
          }
        });
      }
    }
  });
}
