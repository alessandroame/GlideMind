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
import { DEFAULT_SEED_FLIGHTS } from '../../core/logbook.js';
import { closeSheet } from '../sheetManager.js';
import {
  sampleVarioRgb
} from '../../core/flightTelemetry.js';
import { detectTrimPoints } from '../../core/flightTrimming.js';
import { openTrackSetupView } from './TrackSetupSheet.js';

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
 * Formats seconds into HH:MM:SS or MM:SS string.
 * @param {number} totalSec
 * @returns {string}
 */
export function formatSecondsToTime(totalSec) {
  if (typeof totalSec !== 'number' || isNaN(totalSec)) return '00:00';
  const s = Math.round(totalSec);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return hrs > 0
    ? `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Formats a track point timestamp and altitude for trimming labels.
 * @param {Object} point
 * @param {number} index
 * @returns {string}
 */
export function formatTrimPointLabel(point, index) {
  if (!point) return `Punto #${index}`;
  let timeStr = '';
  if (typeof point.time === 'string' && point.time.length >= 5) {
    timeStr = point.time;
  } else if (typeof point.timeSeconds === 'number') {
    timeStr = formatSecondsToTime(point.timeSeconds);
  }
  const altStr = typeof point.alt === 'number' && !isNaN(point.alt) ? ` • ${Math.round(point.alt)} m` : '';
  return timeStr ? `Punto #${index} (${timeStr}${altStr})` : `Punto #${index}${altStr}`;
}

/**
 * Extracts the count of roll oscillations (pendolate / spendolate) from a maneuver.
 * @param {Object} m
 * @returns {number|null}
 */
export function getPendolateCount(m) {
  if (!m) return null;
  if (typeof m.pendolateCount === 'number' && m.pendolateCount > 0) return m.pendolateCount;
  if (typeof m.chainCount === 'number' && m.chainCount > 0) return m.chainCount;
  if (m.details) {
    const match = String(m.details).match(/(\d+)\s*(?:pendolat[ea]|spendolat[ea]|oscillazion[ie])/i);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Formats a flight maneuver type key into a human-readable Italian title.
 * If maneuver object contains pendolate count for roll inversions, includes count.
 * @param {string} type
 * @param {Object} [m=null]
 * @returns {string}
 */
export function formatManeuverTitle(type, m = null) {
  const map = {
    'inversioni': 'Inversioni di rollio',
    'wingover': 'Wingover',
    'orecchie': 'Orecchie',
    'spirale': 'Spirale stretta',
    'figura8': 'Figura a 8',
    '360°': 'Giro 360°',
    '2x360°': 'Doppio 360°'
  };
  const baseTitle = map[type] || type || 'Manovra';
  if ((type === 'inversioni' || String(type).toLowerCase().includes('inversion')) && m) {
    const pCount = getPendolateCount(m);
    if (pCount) {
      return `${baseTitle} (${pCount} ${pCount === 1 ? 'pendolata' : 'pendolate'})`;
    }
  }
  return baseTitle;
}

/**
 * Strips redundant prefixes from maneuver details matching the title.
 * @param {Object} m
 * @returns {string}
 */
export function formatManeuverDetails(m) {
  const rawDetails = (m && m.details) ? String(m.details).trim() : '';
  const isInv = m && (m.type === 'inversioni' || String(m.type).toLowerCase().includes('inversion'));
  const pCount = isInv ? getPendolateCount(m) : null;

  if (!rawDetails) {
    if (pCount) {
      return `${pCount} ${pCount === 1 ? 'pendolata' : 'pendolate'} consecutive`;
    }
    return '';
  }

  const baseTitle = formatManeuverTitle(m.type);
  const fullTitle = formatManeuverTitle(m.type, m);
  const regex = new RegExp(`^(${escapeRegex(fullTitle)}|${escapeRegex(baseTitle)}|${escapeRegex(m.type)})\\s*:\\s*`, 'i');
  let cleaned = rawDetails.replace(regex, '');

  if (isInv && pCount && !/pendolat|spendolat/i.test(cleaned)) {
    cleaned = `${pCount} ${pCount === 1 ? 'pendolata' : 'pendolate'} • ${cleaned}`;
  }
  return cleaned;
}

/**
 * Generates an SVG altimetric chart with variometer-based gradient, thermal sections, and probe markers.
 * @param {Array<Object>} points
 * @param {number} [width=600]
 * @param {number} [height=140]
 * @param {Object} [options={}]
 * @returns {string} SVG inner HTML
 */
export function generateExpandedSvgChart(points, width = 600, height = 150, options = {}) {
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
  const padTop = 32;
  const padBottom = 22;
  const chartHeight = height - padTop - padBottom;

  const n = points.length;
  const polyCoords = points.map((p, idx) => {
    const x = Math.round((idx / (n - 1)) * width * 10) / 10;
    const y = Math.round((padTop + (1 - (p.alt - minAlt) / range) * chartHeight) * 10) / 10;
    return { x, y };
  });

  const polyPoints = polyCoords.map((c) => `${c.x},${c.y}`).join(' ');

  const takeoffAlt = Math.round(alts[0]);
  const landingAlt = Math.round(alts[alts.length - 1]);

  const gradId = options.gradId || 'gm-vario-grad';
  const thermals = Array.isArray(options.thermals) ? options.thermals : [];
  const probes = Array.isArray(options.thermalProbes) ? options.thermalProbes : [];
  const rollInversions = Array.isArray(options.rollInversions) ? options.rollInversions : [];

  // Variometer gradient stops along the flight trajectory
  const maxStops = Math.min(80, Math.max(10, n));
  const stops = [];
  for (let s = 0; s <= maxStops; s++) {
    const frac = s / maxStops;
    const idx = Math.min(n - 1, Math.floor(frac * (n - 1)));
    const p = points[idx];
    let vario = p.vario;
    if (typeof vario !== 'number' || isNaN(vario)) {
      if (idx > 0) {
        const prev = points[idx - 1];
        const dt = Math.max(0.5, (p.timeSeconds || idx) - (prev.timeSeconds || (idx - 1)));
        vario = ((p.alt || 0) - (prev.alt || 0)) / dt;
      } else {
        vario = 0;
      }
    }
    const colorBand = sampleVarioRgb(vario);
    const offsetPct = (frac * 100).toFixed(1);
    stops.push(`<stop offset="${offsetPct}%" stop-color="${colorBand.css}" />`);
  }

  // Collect event markers (thermals and roll inversions) for anti-collision positioning
  const eventItems = [];

  thermals.forEach((th, idx) => {
    const sIdx = typeof th.startIndex === 'number' ? Math.max(0, Math.min(th.startIndex, n - 1)) : 0;
    const eIdx = typeof th.endIndex === 'number' ? Math.max(0, Math.min(th.endIndex, n - 1)) : (n - 1);
    const x1 = Math.round((sIdx / (n - 1)) * width * 10) / 10;
    const x2 = Math.round((eIdx / (n - 1)) * width * 10) / 10;
    const bandW = Math.max(12, x2 - x1);
    const cx = Math.round((x1 + bandW / 2) * 10) / 10;
    eventItems.push({
      type: 'thermal',
      x1,
      x2,
      bandW,
      cx,
      label: `T${th.thermalIndex || (idx + 1)}`,
      rawObj: th
    });
  });

  rollInversions.forEach((inv) => {
    const sIdx = typeof inv.startIndex === 'number' ? Math.max(0, Math.min(inv.startIndex, n - 1)) : 0;
    const eIdx = typeof inv.endIndex === 'number' ? Math.max(0, Math.min(inv.endIndex, n - 1)) : sIdx;
    const coord1 = polyCoords[sIdx] || { x: (width / 2), y: (padTop + chartHeight / 2) };
    const coord2 = polyCoords[eIdx] || coord1;
    const x1 = Math.min(coord1.x, coord2.x);
    const x2 = Math.max(coord1.x, coord2.x);
    const bandW = Math.max(14, x2 - x1);
    const cx = Math.round((x1 + bandW / 2) * 10) / 10;
    const pCount = getPendolateCount(inv);
    const label = pCount ? `${pCount}P` : 'Inv';
    eventItems.push({
      type: 'roll',
      x1,
      x2,
      bandW,
      cx,
      label,
      pCount,
      rawObj: inv
    });
  });

  // Sort by horizontal position and stagger adjacent badges to prevent text collisions
  eventItems.sort((a, b) => a.cx - b.cx);
  let lastCx = -999;
  let staggerLevel = 0;
  eventItems.forEach((ev) => {
    if (ev.cx - lastCx < 36) {
      staggerLevel = (staggerLevel + 1) % 2;
    } else {
      staggerLevel = 0;
    }
    ev.yLevel = staggerLevel;
    lastCx = ev.cx;
  });

  // Render thermal bands
  const thermalBandsSvg = eventItems
    .filter((ev) => ev.type === 'thermal')
    .map((ev) => {
      const badgeY = padTop + (ev.yLevel === 0 ? 12 : 25);
      const pillW = 24;
      const pillH = 13;
      return `
        <g class="gm-chart-thermal-band">
          <rect x="${ev.x1}" y="${padTop}" width="${ev.bandW}" height="${chartHeight}" fill="rgba(245, 158, 11, 0.16)" stroke="rgba(245, 158, 11, 0.45)" stroke-width="1" stroke-dasharray="3,2" rx="3" />
          <rect x="${ev.cx - pillW / 2}" y="${badgeY - 10}" width="${pillW}" height="${pillH}" fill="rgba(15, 23, 42, 0.88)" stroke="#f59e0b" stroke-width="0.8" rx="2.5" />
          <text x="${ev.cx}" y="${badgeY}" text-anchor="middle" font-size="9" font-family="monospace" font-weight="800" fill="#f59e0b">${escapeHtml(ev.label)}</text>
        </g>
      `;
    })
    .join('');

  // Render roll inversion markers
  const rollMarkersSvg = eventItems
    .filter((ev) => ev.type === 'roll')
    .map((ev) => {
      const badgeY = padTop + (ev.yLevel === 0 ? 12 : 25);
      const pillW = Math.max(22, ev.label.length * 7 + 8);
      const pillH = 13;
      return `
        <g class="gm-chart-roll-marker" role="img" aria-label="Inversione di rollio (${ev.pCount ? `${ev.pCount} pendolate` : ''})">
          <rect x="${ev.x1}" y="${padTop + 2}" width="${ev.bandW}" height="${chartHeight}" fill="rgba(234, 88, 12, 0.15)" stroke="rgba(234, 88, 12, 0.7)" stroke-width="1" stroke-dasharray="2,2" rx="2" />
          <rect x="${ev.cx - pillW / 2}" y="${badgeY - 10}" width="${pillW}" height="${pillH}" fill="rgba(15, 23, 42, 0.88)" stroke="#ea580c" stroke-width="0.8" rx="2.5" />
          <text x="${ev.cx}" y="${badgeY}" text-anchor="middle" font-size="9" font-family="monospace" font-weight="800" fill="#ea580c">${escapeHtml(ev.label)}</text>
        </g>
      `;
    })
    .join('');

  // Thermal probe (test 360) markers on the altimetric line
  const probeMarkersSvg = probes.map((pr) => {
    const sIdx = typeof pr.startIndex === 'number' ? Math.max(0, Math.min(pr.startIndex, n - 1)) : 0;
    const coord = polyCoords[sIdx] || { x: (width / 2), y: (padTop + chartHeight / 2) };
    return `
      <g class="gm-chart-probe-marker">
        <line x1="${coord.x}" y1="${padTop + 2}" x2="${coord.x}" y2="${height - padBottom}" stroke="rgba(14, 165, 233, 0.45)" stroke-width="1.5" stroke-dasharray="2,2" />
        <circle cx="${coord.x}" cy="${coord.y}" r="3.5" fill="#0284c7" stroke="#ffffff" stroke-width="1" />
      </g>
    `;
  }).join('');

  // Time labels
  let startTime = points[0].timeFormatted || points[0].time;
  if (!startTime && points[0].timeSeconds != null) startTime = formatSecondsToTime(points[0].timeSeconds);
  if (!startTime) startTime = '00:00';

  let endTime = points[n - 1].timeFormatted || points[n - 1].time;
  if (!endTime && points[n - 1].timeSeconds != null) endTime = formatSecondsToTime(points[n - 1].timeSeconds);

  return `
    <svg viewBox="0 0 ${width} ${height}" class="w-full h-full" preserveAspectRatio="none" role="img" aria-label="Grafico altimetrico del volo: Quota massima ${maxAlt} m, Minima ${minAlt} m">
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">
          ${stops.join('\n          ')}
        </linearGradient>
        <linearGradient id="${gradId}-area" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="var(--gm-accent-sky, #0ea5e9)" stop-opacity="0.18" />
          <stop offset="100%" stop-color="var(--gm-accent-sky, #0ea5e9)" stop-opacity="0.02" />
        </linearGradient>
      </defs>

      <!-- Dedicated Altitude Summary Strip (Anti-Collision Header Zone) -->
      <g class="gm-chart-header-row" font-family="monospace" font-size="10.5">
        <text x="8" y="17" fill="var(--gm-text-secondary)"><tspan font-weight="600" fill="var(--gm-text-primary)">Decollo: ${takeoffAlt} m</tspan></text>
        <text x="${Math.round(width / 2)}" y="17" text-anchor="middle">
          <tspan fill="var(--gm-accent-sky, #38bdf8)" font-weight="700">Max: ${maxAlt} m</tspan>
          <tspan fill="var(--gm-text-muted)"> • </tspan>
          <tspan fill="var(--gm-text-muted)">Min: ${minAlt} m</tspan>
        </text>
        <text x="${width - 8}" y="17" text-anchor="end" fill="var(--gm-text-secondary)"><tspan font-weight="600" fill="var(--gm-text-primary)">Atterraggio: ${landingAlt} m</tspan></text>
      </g>

      <!-- Grid reference lines -->
      <line x1="0" y1="${padTop}" x2="${width}" y2="${padTop}" stroke="var(--gm-border)" stroke-dasharray="4,4" stroke-width="1" />
      <line x1="0" y1="${height - padBottom}" x2="${width}" y2="${height - padBottom}" stroke="var(--gm-border)" stroke-width="1" />

      <!-- Thermal sections bands -->
      ${thermalBandsSvg}

      <!-- Roll inversion bands -->
      ${rollMarkersSvg}

      <!-- Thermal probe lines -->
      ${probeMarkersSvg}

      <!-- Area fill below path -->
      <polygon points="0,${height - padBottom} ${polyPoints} ${width},${height - padBottom}" fill="url(#${gradId}-area)" />

      <!-- Main altitude polyline colored by variometer -->
      <polyline points="${polyPoints}" fill="none" stroke="url(#${gradId})" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />

      <!-- Time axis labels -->
      <text x="8" y="${height - 5}" fill="var(--gm-text-muted)" font-size="10" font-family="monospace">${escapeHtml(startTime)}</text>
      ${endTime ? `<text x="${width - 8}" y="${height - 5}" text-anchor="end" fill="var(--gm-text-muted)" font-size="10" font-family="monospace">${escapeHtml(endTime)}</text>` : ''}
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
    const rollInv = maneuvers.find((m) => m.type === 'inversioni' || String(m.type).toLowerCase().includes('inversion'));
    if (rollInv) {
      const pCount = getPendolateCount(rollInv);
      if (pCount) {
        lines.push(`Inversioni di rollio eseguite: registrate ${pCount} pendolate consecutive. Ottimo esercizio per la coordinazione asimmetrica e il controllo del beccheggio.`);
      }
    }
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

  const flightId = String(meta.id || meta.flightId || '');
  const flightNumber = meta.flightNumber != null ? meta.flightNumber : null;
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
  const thermals = Array.isArray(tel.thermals) ? tel.thermals : [];
  const allManeuvers = Array.isArray(tel.maneuvers) ? tel.maneuvers : [];
  const thermalProbes = allManeuvers.filter((m) => m.type === '360°' || m.type === 'SINGLE_360' || m.type === 'sondaggio_termica');
  const rollInversions = allManeuvers.filter((m) => m.type === 'inversioni' || String(m.type).toLowerCase().includes('inversion'));
  const dynamicManeuvers = allManeuvers.filter((m) => m.type !== '360°' && m.type !== 'SINGLE_360' && m.type !== 'sondaggio_termica');

  const svgChartHtml = generateExpandedSvgChart(points, 600, 140, {
    thermals,
    thermalProbes,
    rollInversions
  });

  const sourcePoints = (raw.originalPoints && Array.isArray(raw.originalPoints) && raw.originalPoints.length >= 10)
    ? raw.originalPoints
    : (raw.points && Array.isArray(raw.points) && raw.points.length >= 10
        ? raw.points
        : (points && Array.isArray(points) && points.length >= 10 ? points : []));
  const maxTrimIndex = Math.max(0, sourcePoints.length - 1);
  const initialTakeoffIndex = (meta.trimIndices && typeof meta.trimIndices.takeoffIndex === 'number')
    ? Math.max(0, Math.min(meta.trimIndices.takeoffIndex, maxTrimIndex))
    : 0;
  const initialLandingIndex = (meta.trimIndices && typeof meta.trimIndices.landingIndex === 'number')
    ? Math.max(0, Math.min(meta.trimIndices.landingIndex, maxTrimIndex))
    : maxTrimIndex;

  const maneuvers = allManeuvers;
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
  const debriefParagraphs = debriefText
    .split('\n\n')
    .map((p) => p.trim())
    .filter(Boolean);
  const debriefCalloutsHtml = debriefParagraphs.length > 0
    ? debriefParagraphs.map((p) => `<div class="gm-debrief-callout">${escapeHtml(p)}</div>`).join('')
    : `<div class="gm-debrief-callout">${escapeHtml(debriefText)}</div>`;

  return `
    <div id="flight-detail-overlay" class="gm-flight-detail-fullscreen" role="dialog" aria-modal="true" aria-labelledby="gm-flight-detail-title-text" data-flight-id="${escapeHtml(flightId)}">
      <!-- 1. Top Bar with Back Navigation Target (>= 48px touch target) -->
      <header class="gm-flight-detail-topbar">
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            id="btn-flight-detail-back"
            class="gm-flight-detail-back-btn"
            aria-label="Torna al Flight Log"
          >
            <svg width="18" height="18" class="flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Flight Log</span>
          </button>

          <div class="flex items-center gap-2 min-w-0 flex-1">
            ${flightNumber != null ? `<span class="gm-flight-number-badge-detail" aria-label="Volo numero ${flightNumber}">#${escapeHtml(flightNumber)}</span>` : ''}
            <h2 id="gm-flight-detail-title-text" class="gm-flight-detail-title-heading truncate">
              ${escapeHtml(siteTitle)}
            </h2>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            id="btn-open-track-setup"
            class="gm-btn-secondary gm-topbar-setup-btn"
            aria-label="Setup Traccia"
            title="Setup Traccia (Trimming e Calibrazione Quote)"
          >
            <svg width="15" height="15" class="flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <span class="hidden sm:inline">Setup Traccia</span>
          </button>
        </div>
      </header>

      <!-- 2. Scrollable Body (100dvh flex-1, touch-action: pan-y) -->
      <main class="gm-flight-detail-scroll-body" tabindex="-1">
        <!-- Flight Info Sub-Card with Prominent Flight Number -->
        <div class="gm-flight-detail-header-card">
          <div class="flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-[var(--gm-text-secondary)]">
            <div class="flex items-center gap-3 min-w-0">
              ${flightNumber != null ? `
                <div class="gm-flight-hero-num-box" aria-label="Numero volo: ${flightNumber}">
                  <span class="gm-flight-hero-num-label">VOLO</span>
                  <span class="gm-flight-hero-num-val">#${escapeHtml(flightNumber)}</span>
                </div>
              ` : ''}
              <div class="flex flex-col gap-1.5 min-w-0">
                <div class="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                  <span class="font-bold text-[var(--gm-text-primary)]">${escapeHtml(dateFormatted)}</span>
                  <span class="text-[var(--gm-text-muted)]">•</span>
                  <span class="font-semibold text-[var(--gm-text-primary)]">${escapeHtml(takeoffTime)} → ${escapeHtml(landingTime)}</span>
                  ${siteSub ? `<span class="text-[var(--gm-text-secondary)]">(${escapeHtml(siteSub)})</span>` : ''}
                  <span class="text-[var(--gm-text-muted)]">•</span>
                  <span class="font-bold text-amber-400">${escapeHtml(duration)}</span>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  ${meta.isTrimmed ? '<span class="gm-status-pill gm-status-pill-amber">Traccia Trimmata</span>' : ''}
                  ${meta.elevationCorrection ? '<span class="gm-status-pill gm-status-pill-emerald">Quote Calibrate</span>' : ''}
                  <span class="text-xs font-medium text-[var(--gm-text-secondary)]">${escapeHtml(glider)}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <span class="gm-glider-pill-badge ${classBadgeStyle}">
                ${escapeHtml(gliderClass)}
              </span>
            </div>
          </div>
        </div>

        <!-- Altimetric Profile -->
        <section class="gm-flight-detail-section" aria-label="Profilo Altimetrico">
          <h3 class="gm-flight-detail-section-title">Profilo Altimetrico</h3>
          <div class="gm-flight-detail-alt-chart">
            ${svgChartHtml}
          </div>

          <!-- Variometer & Thermal Legend -->
          <div class="gm-vario-legend-bar">
            <div class="gm-vario-legend-item">
              <span class="gm-vario-color-box gm-vario-color-strong-climb"></span>
              <span>Salita forte (&gt;+3 m/s)</span>
            </div>
            <div class="gm-vario-legend-item">
              <span class="gm-vario-color-box gm-vario-color-climb"></span>
              <span>Termica (&gt;+0.2 m/s)</span>
            </div>
            <div class="gm-vario-legend-item">
              <span class="gm-vario-color-box gm-vario-color-glide"></span>
              <span>Planata (-0.8..+0.2 m/s)</span>
            </div>
            <div class="gm-vario-legend-item">
              <span class="gm-vario-color-box gm-vario-color-sink"></span>
              <span>Discesa (&lt;-0.8 m/s)</span>
            </div>
            <div class="gm-vario-legend-item">
              <span class="gm-vario-color-box gm-vario-color-strong-sink"></span>
              <span>Discesa rapida (&lt;-2 m/s)</span>
            </div>
            ${thermals.length > 0 ? `
              <div class="gm-vario-legend-item">
                <span class="gm-thermal-band-indicator"></span>
                <span>Sezione Termica (T1, T2...)</span>
              </div>
            ` : ''}
            ${thermalProbes.length > 0 ? `
              <div class="gm-vario-legend-item">
                <span class="gm-probe-dot-indicator"></span>
                <span>Sondaggio (test 360°)</span>
              </div>
            ` : ''}
            ${rollInversions.length > 0 ? `
              <div class="gm-vario-legend-item">
                <span class="gm-roll-marker-indicator"></span>
                <span>Inversioni (P)</span>
              </div>
            ` : ''}
          </div>
        </section>

        <!-- Kinetic Telemetry 2x4 Responsive Card Grid (Thermals Prominent) -->
        <section class="gm-flight-detail-section" aria-label="Cinematica e Prestazioni">
          <h3 class="gm-flight-detail-section-title">Cinematica &amp; Prestazioni</h3>
          <div class="gm-flight-metrics-grid">
            <div class="gm-flight-metric-card">
              <span class="gm-flight-metric-num">${escapeHtml(maxAlt)}</span>
              <span class="gm-flight-metric-desc">Quota Massima MSL</span>
            </div>
            <div class="gm-flight-metric-card">
              <span class="gm-flight-metric-num ${meta.maxGainMeters ? 'text-emerald-400' : ''}">${escapeHtml(maxGain)}</span>
              <span class="gm-flight-metric-desc">Guadagno dal Decollo</span>
            </div>
            <div class="gm-flight-metric-card">
              <span class="gm-flight-metric-num ${thermals.length > 0 ? 'text-amber-400 font-bold' : ''}">${thermals.length}</span>
              <span class="gm-flight-metric-desc">Termiche Agganciate</span>
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
            <div class="gm-flight-metric-card">
              <span class="gm-flight-metric-num text-sky-400">${thermalProbes.length}</span>
              <span class="gm-flight-metric-desc">Sondaggi Termici</span>
            </div>
          </div>
        </section>

        <!-- Thermals Breakdown -->
        <section class="gm-flight-detail-section" aria-label="Analisi Termiche">
          <div class="flex items-center justify-between">
            <h3 class="gm-flight-detail-section-title" style="margin: 0;">
              Analisi Termiche (${thermals.length})
            </h3>
            ${thermalProbes.length > 0 ? `
              <span class="text-xs px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 font-semibold">
                ${thermalProbes.length} ${thermalProbes.length === 1 ? 'Sondaggio termico' : 'Sondaggi termici'}
              </span>
            ` : ''}
          </div>

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
            <div class="gm-empty-state-card">
              Nessuna salita termica circolare agganciata in questo volo.
            </div>
          `}
        </section>

        <!-- Maneuvers Breakdown (with Sondaggi Termici separation) -->
        ${allManeuvers.length > 0 ? `
          <section class="gm-flight-detail-section" aria-label="Manovre ed Esercizi">
            <div class="flex items-center justify-between">
              <h3 class="gm-flight-detail-section-title" style="margin: 0;">
                Manovre ed Esercizi (${allManeuvers.length})
              </h3>
              ${thermalProbes.length > 0 ? `
                <span class="text-xs px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 font-semibold">
                  ${thermalProbes.length} ${thermalProbes.length === 1 ? 'Sondaggio termico' : 'Sondaggi termici'}
                </span>
              ` : ''}
            </div>

            <!-- Dynamic Maneuvers (Wingover, Inversioni, Spirale...) -->
            ${dynamicManeuvers.length > 0 ? `
              <div class="gm-maneuvers-list">
                ${dynamicManeuvers.map((m) => {
                  const title = formatManeuverTitle(m.type, m);
                  const details = formatManeuverDetails(m);
                  const isInv = m.type === 'inversioni' || String(m.type).toLowerCase().includes('inversion');
                  const pCount = isInv ? getPendolateCount(m) : null;
                  return `
                    <div class="gm-maneuver-card">
                      <div class="gm-maneuver-header">
                        <div class="flex items-center gap-2">
                          <span class="gm-maneuver-badge">${escapeHtml(title)}</span>
                          ${pCount ? `
                            <span class="gm-maneuver-pendolate-pill" title="${pCount} pendolate conteggiate">
                              ${pCount} ${pCount === 1 ? 'pendolata' : 'pendolate'}
                            </span>
                          ` : ''}
                        </div>
                        ${m.durationSeconds ? `<span class="text-xs font-mono text-[var(--gm-text-muted)]">${Math.round(m.durationSeconds)}s</span>` : ''}
                      </div>
                      ${details ? `<div class="gm-maneuver-details">${escapeHtml(details)}</div>` : ''}
                    </div>
                  `;
                }).join('')}
              </div>
            ` : ''}

            <!-- Thermal Probes (Single 360 Test Turns) -->
            ${thermalProbes.length > 0 ? `
              <div class="flex flex-col gap-2 mt-1">
                <div class="text-xs text-[var(--gm-text-secondary)] font-semibold flex items-center gap-1.5">
                  <span class="gm-probe-dot-indicator"></span>
                  <span>Sondaggi Termici (Test 360° per saggiare l&#39;aria):</span>
                </div>
                <div class="gm-maneuvers-list">
                  ${thermalProbes.map((m, idx) => {
                    const dur = m.durationSeconds ? `${Math.round(m.durationSeconds)}s` : '';
                    const details = formatManeuverDetails(m) || (m.details || 'Giro 360° singolo');
                    return `
                      <div class="gm-maneuver-card" style="border-style: dashed;">
                        <div class="gm-maneuver-header">
                          <span class="gm-maneuver-badge text-sky-400">Sondaggio Termico #${idx + 1} (360°)</span>
                          ${dur ? `<span class="text-xs font-mono text-[var(--gm-text-muted)]">${dur}</span>` : ''}
                        </div>
                        <div class="gm-maneuver-details">${escapeHtml(details)} • Nessuna ascendenza riscontrata</div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            ` : ''}
          </section>
        ` : ''}

        <!-- Educational Safety Debriefing (Instructor Guido) -->
        <section class="gm-debrief-box" aria-label="Debriefing Didattico di Sicurezza">
          <div class="gm-debrief-header">
            <h3 class="gm-flight-detail-section-title" style="margin: 0;">Debriefing Didattico di Sicurezza</h3>
            <span class="gm-debrief-instructor-tag">Istruttore Guido</span>
          </div>
          <div class="gm-debrief-text flex flex-col gap-2.5" id="gm-debrief-content">
            ${debriefCalloutsHtml}
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

        <!-- Secondary Aerological Data: Declassed Wind Drift -->
        ${hasWind ? `
          <section class="gm-flight-detail-section" aria-label="Dati Eolici Secondari" style="opacity: 0.85;">
            <div class="p-3 rounded-lg bg-[var(--gm-bg-card)] border border-[var(--gm-border)] flex items-center justify-between gap-3 text-xs">
              <div class="flex items-center gap-2">
                <span class="font-medium text-[var(--gm-text-secondary)]">Deriva del Vento Stimata:</span>
                <span class="font-mono text-[var(--gm-text-primary)]">${windDrift.speedKmh} km/h da ${windOrigin}° (${escapeHtml(windDrift.cardinal || '')})</span>
              </div>
              <span class="text-[var(--gm-text-muted)] text-[11px]">Dato secondario stimato in spirale</span>
            </div>
          </section>
        ` : ''}
      </main>

      <!-- 3. Sticky Bottom Action Bar (Thumb Zone Ergonomics) -->
      <footer class="gm-flight-detail-bottom-bar" role="contentinfo">
        <div class="gm-flight-detail-bottom-bar-inner">
          <button
            type="button"
            id="btn-replay-from-detail"
            class="gm-btn-primary gm-bottom-replay-btn"
            style="min-height: var(--gm-touch-min, 48px);"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span class="gm-btn-text-full hidden sm:inline whitespace-nowrap">Visualizza Replay 3D</span>
            <span class="gm-btn-text-short sm:hidden whitespace-nowrap">Replay 3D</span>
          </button>
          <button
            type="button"
            id="btn-setup-from-detail"
            class="gm-btn-secondary gm-bottom-action-btn"
            style="min-height: var(--gm-touch-min, 48px);"
            title="Setup Traccia"
            aria-label="Setup Traccia"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="4" y1="21" x2="4" y2="14"></line>
              <line x1="4" y1="10" x2="4" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12" y2="3"></line>
              <line x1="20" y1="21" x2="20" y2="16"></line>
              <line x1="20" y1="12" x2="20" y2="3"></line>
              <line x1="1" y1="14" x2="7" y2="14"></line>
              <line x1="9" y1="8" x2="15" y2="8"></line>
              <line x1="17" y1="16" x2="23" y2="16"></line>
            </svg>
            <span class="gm-btn-text-full hidden md:inline whitespace-nowrap">Setup Traccia</span>
            <span class="gm-btn-text-short md:hidden whitespace-nowrap">Setup</span>
          </button>
          <button
            type="button"
            id="btn-download-from-detail"
            class="gm-btn-secondary gm-bottom-action-btn"
            style="min-height: var(--gm-touch-min, 48px);"
            title="Scarica Traccia IGC (FAI)"
            aria-label="Scarica Traccia IGC (FAI)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span class="gm-btn-text-full hidden md:inline whitespace-nowrap">Scarica Traccia IGC (FAI)</span>
            <span class="gm-btn-text-short md:hidden whitespace-nowrap">Scarica IGC</span>
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

  const targetStore = options.store || store;

  let bundle = null;
  try {
    bundle = await logbookManager.getFlightDetail(flightId);
  } catch (err) {
    console.warn('[FlightDetailView] Errore DB nel recupero volo:', err);
  }

  // Fallback to reactive store state or default seed flights if flight is not persisted in DB
  if (!bundle || !bundle.meta) {
    const state = (targetStore && typeof targetStore.getState === 'function') ? targetStore.getState() : {};
    let cachedFlight = Array.isArray(state.flights)
      ? state.flights.find((f) => f && (String(f.id) === String(flightId) || String(f.flightId) === String(flightId)))
      : null;

    if (!cachedFlight && Array.isArray(DEFAULT_SEED_FLIGHTS)) {
      cachedFlight = DEFAULT_SEED_FLIGHTS.find((f) => f && (String(f.id) === String(flightId) || String(f.flightId) === String(flightId)));
    }

    if (cachedFlight) {
      const takeoffAlt = cachedFlight.takeoffAltMsl || cachedFlight.takeoffAlt || 1000;
      const maxAlt = cachedFlight.maxAltMsl || (cachedFlight.maxGainMeters ? takeoffAlt + cachedFlight.maxGainMeters : (takeoffAlt + 450));
      const durationSec = (cachedFlight.durationMinutes || 30) * 60;

      // Synthesize realistic track points if absent for smooth altimetric chart and replay
      let decimatedPoints = cachedFlight.decimatedPoints || cachedFlight.points || [];
      if (!Array.isArray(decimatedPoints) || decimatedPoints.length < 2) {
        const count = 30;
        decimatedPoints = new Array(count);
        for (let i = 0; i < count; i++) {
          const frac = i / (count - 1);
          decimatedPoints[i] = {
            timeSeconds: Math.round(frac * durationSec),
            alt: Math.round(takeoffAlt + (maxAlt - takeoffAlt) * Math.sin(frac * Math.PI)),
            vario: Math.round(Math.cos(frac * Math.PI) * 2.5 * 10) / 10
          };
        }
      }

      bundle = {
        meta: cachedFlight,
        raw: {
          id: cachedFlight.id || cachedFlight.flightId || flightId,
          decimatedPoints
        },
        telemetry: cachedFlight.telemetry || {
          thermals: cachedFlight.thermalsCount ? [{ thermalIndex: 1, altGain: cachedFlight.maxGainMeters || 300, avgClimbRate: cachedFlight.maxClimbRate || 1.8 }] : [],
          dominantWindDrift: null,
          maneuvers: []
        }
      };
    }
  }

  if (!bundle || !bundle.meta) {
    console.warn('[FlightDetailView] Volo non trovato:', flightId);
    return;
  }

  // Resolve flight number for prominent logbook attribution
  let flightNumber = options.flightNumber != null ? options.flightNumber : (bundle.meta && bundle.meta.flightNumber != null ? bundle.meta.flightNumber : null);
  if (flightNumber == null && targetStore && typeof targetStore.getState === 'function') {
    const stateFlights = targetStore.getState().flights;
    if (Array.isArray(stateFlights)) {
      const idx = stateFlights.findIndex((f) => f && (String(f.id) === String(flightId) || String(f.flightId) === String(flightId)));
      if (idx !== -1) {
        flightNumber = stateFlights[idx].flightNumber != null ? stateFlights[idx].flightNumber : (stateFlights.length - idx);
      }
    }
  }
  if (flightNumber == null && Array.isArray(DEFAULT_SEED_FLIGHTS)) {
    const idx = DEFAULT_SEED_FLIGHTS.findIndex((f) => f && (String(f.id) === String(flightId) || String(f.flightId) === String(flightId)));
    if (idx !== -1) {
      flightNumber = DEFAULT_SEED_FLIGHTS[idx].flightNumber != null ? DEFAULT_SEED_FLIGHTS[idx].flightNumber : (DEFAULT_SEED_FLIGHTS.length - idx);
    }
  }
  if (flightNumber != null && bundle.meta) {
    bundle.meta.flightNumber = flightNumber;
  }

  // Close any active drawer/sheet first (Single Active Modal / Overlay Policy)
  closeSheet(true);
  closeFlightDetailView();

  // Clean up any lingering overlay in DOM
  if (typeof document !== 'undefined') {
    const existing = document.getElementById('flight-detail-overlay');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }

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
      if (targetStore && typeof targetStore.setState === 'function') {
        targetStore.setState({ activeReplayFlightId: flightId });
      }
      if (store && store !== targetStore && typeof store.setState === 'function') {
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

  // 7. Track Setup Navigation (Trimming and Elevation Calibration)
  const openSetupBtns = overlayEl.querySelectorAll('#btn-open-track-setup, #btn-setup-from-detail');
  openSetupBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      openTrackSetupView(flightId, {
        store: targetStore,
        onClose: () => {
          openFlightDetailView(flightId, { store: targetStore });
        }
      });
    });
  });

  // 8. Focus first interactive element for keyboard accessibility
  if (backBtn && typeof backBtn.focus === 'function') {
    backBtn.focus();
  }
}

/**
 * Backward compatibility alias for openFlightDetailView.
 */
export const openFlightDetailSheet = openFlightDetailView;
export const closeFlightDetailSheet = closeFlightDetailView;
