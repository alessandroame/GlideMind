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
  DEFAULT_SEED_FLIGHTS,
  calculatePersonalRecords,
  checkFlightRecordFlags
} from '../../core/logbook.js';
import {
  sampleVarioRgb
} from '../../core/flightTelemetry.js';
import { detectTrimPoints } from '../../core/flightTrimming.js';
import { openTrackSetupView } from './TrackSetupSheet.js';
import {
  createMapEngine,
  renderLayerToggleIcon,
  getNextMapLayer,
  getMapLayerLabel
} from '../map/mapEngineAdapter.js';

let activeDetailOverlay = null;
let previousActiveEl = null;
let escapeKeyHandler = null;
let hashChangeHandler = null;
let flightDetailMapEngine = null;

/**
 * Returns the active flight detail map engine instance if mounted.
 * @returns {Object|null}
 */
export function getActiveFlightDetailMapEngine() {
  return flightDetailMapEngine;
}

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
 * Returns point variometer (m/s) with fallback calculation from altitude change.
 * @param {Object} p
 * @param {number} idx
 * @param {Array<Object>} pts
 * @returns {number}
 */
export function getPointVario(p, idx, pts) {
  if (typeof p?.vario === 'number' && !isNaN(p.vario)) return p.vario;
  if (idx > 0 && Array.isArray(pts) && pts[idx - 1]) {
    const prev = pts[idx - 1];
    const dt = Math.max(0.5, (p.timeSeconds ?? idx) - (prev.timeSeconds ?? (idx - 1)));
    return ((p.alt || 0) - (prev.alt || 0)) / dt;
  }
  return 0;
}

/**
 * Returns point ground speed (km/h) with fallback calculation from coordinates.
 * @param {Object} p
 * @param {number} idx
 * @param {Array<Object>} pts
 * @returns {number}
 */
export function getPointSpeed(p, idx, pts) {
  if (typeof p?.speedKmh === 'number' && !isNaN(p.speedKmh)) return p.speedKmh;
  if (idx > 0 && Array.isArray(pts) && pts[idx - 1]) {
    const prev = pts[idx - 1];
    if (typeof p.lat === 'number' && typeof p.lon === 'number' && typeof prev.lat === 'number' && typeof prev.lon === 'number') {
      const dt = Math.max(0.5, (p.timeSeconds ?? idx) - (prev.timeSeconds ?? (idx - 1)));
      const R = 6371;
      const dLat = (p.lat - prev.lat) * Math.PI / 180;
      const dLon = (p.lon - prev.lon) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(prev.lat * Math.PI / 180) * Math.cos(p.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return (R * c) / (dt / 3600);
    }
  }
  return 36.0;
}

/**
 * Generates an SVG altimetric chart with variometer-based gradient, thermal sections, probe markers,
 * and optional multi-channel zoom/pan, variometer curve, and ground speed curve.
 * @param {Array<Object>} points
 * @param {number} [width=600]
 * @param {number} [height=220]
 * @param {Object} [options={}]
 * @returns {string} SVG inner HTML
 */
export function generateExpandedSvgChart(points, width = 600, height = 220, options = {}) {
  if (!points || !Array.isArray(points) || points.length < 2) {
    return `
      <div class="flex items-center justify-center h-full text-xs text-[var(--gm-text-muted)]">
        Tracciato altimetrico non disponibile
      </div>
    `;
  }

  const n = points.length;
  const zoom = Math.max(1.0, Math.min(8.0, Number(options.zoom) || 1.0));
  const pan = Math.max(0.0, Math.min(1.0, typeof options.pan === 'number' ? options.pan : 0.5));
  const showAlt = options.showAlt !== false;
  const showVario = options.showVario === true;
  const showSpeed = options.showSpeed === true;
  const cursorIndex = typeof options.cursorIndex === 'number' ? options.cursorIndex : null;

  // Window bounds calculation for zoom & pan
  let startIdx = 0;
  let endIdx = n - 1;
  if (zoom > 1.0) {
    const windowLen = Math.max(6, Math.round(n / zoom));
    const centerIdx = Math.round(pan * (n - 1));
    startIdx = Math.max(0, Math.min(n - windowLen, centerIdx - Math.floor(windowLen / 2)));
    endIdx = Math.min(n - 1, startIdx + windowLen - 1);
  }

  const visiblePoints = points.slice(startIdx, endIdx + 1);
  const visibleN = visiblePoints.length;

  // Altimetric bounds (consistent scale using overall min/max so altitude profile doesn't wildly scale during pan)
  const alts = points.map((p) => (typeof p.alt === 'number' && !isNaN(p.alt) ? p.alt : 0));
  const minAlt = Math.min(...alts);
  const maxAlt = Math.max(...alts);
  const range = Math.max(1, maxAlt - minAlt);
  const padTop = 30;
  const padBottom = 22;
  const chartHeight = height - padTop - padBottom;

  const polyCoords = visiblePoints.map((p, vIdx) => {
    const origIdx = startIdx + vIdx;
    const x = Math.round((vIdx / (visibleN - 1)) * width * 10) / 10;
    const y = Math.round((padTop + (1 - (p.alt - minAlt) / range) * chartHeight) * 10) / 10;
    return { x, y, origIdx, point: p };
  });

  const polyPoints = polyCoords.map((c) => `${c.x},${c.y}`).join(' ');

  const takeoffAlt = Math.round(alts[0]);
  const landingAlt = Math.round(alts[alts.length - 1]);

  const gradId = options.gradId || 'gm-vario-grad';
  const thermals = Array.isArray(options.thermals) ? options.thermals : [];
  const probes = Array.isArray(options.thermalProbes) ? options.thermalProbes : [];
  const rollInversions = Array.isArray(options.rollInversions) ? options.rollInversions : [];
  const dynamicManeuvers = Array.isArray(options.dynamicManeuvers) ? options.dynamicManeuvers : [];

  // Variometer gradient stops along the visible trajectory
  const maxStops = Math.min(80, Math.max(10, visibleN));
  const stops = [];
  for (let s = 0; s <= maxStops; s++) {
    const frac = s / maxStops;
    const vIdx = Math.min(visibleN - 1, Math.floor(frac * (visibleN - 1)));
    const p = visiblePoints[vIdx];
    const origIdx = startIdx + vIdx;
    const vario = getPointVario(p, origIdx, points);
    const colorBand = sampleVarioRgb(vario);
    const offsetPct = (frac * 100).toFixed(1);
    stops.push(`<stop offset="${offsetPct}%" stop-color="${colorBand.css}" />`);
  }

  // Collect event markers (thermals and roll inversions) visible within [startIdx, endIdx]
  const eventItems = [];

  const resolveIndices = (item, defaultEndSpan = null) => {
    let sIdx = 0;
    let eIdx = n - 1;
    if (typeof item.startTimeSeconds === 'number' && typeof points[0]?.timeSeconds === 'number') {
      let fS = points.findIndex((p) => (p.timeSeconds ?? 0) >= item.startTimeSeconds);
      sIdx = fS === -1 ? n - 1 : fS;
      if (typeof item.endTimeSeconds === 'number') {
        let fE = points.findIndex((p) => (p.timeSeconds ?? 0) >= item.endTimeSeconds);
        eIdx = fE === -1 ? n - 1 : fE;
      } else {
        eIdx = defaultEndSpan !== null ? Math.min(n - 1, sIdx + defaultEndSpan) : sIdx;
      }
    } else if (typeof item.startIndex === 'number') {
      const origN = (options.sourceCount && options.sourceCount > 1) ? options.sourceCount : (item.startIndex >= n ? item.startIndex + 1 : n);
      const sFrac = Math.max(0, Math.min(1, item.startIndex / Math.max(1, origN - 1)));
      const eRaw = item.endIndex ?? (defaultEndSpan !== null ? item.startIndex + defaultEndSpan : item.startIndex);
      const eFrac = Math.max(0, Math.min(1, eRaw / Math.max(1, origN - 1)));
      sIdx = Math.max(0, Math.min(n - 1, Math.round(sFrac * (n - 1))));
      eIdx = Math.max(sIdx, Math.min(n - 1, Math.round(eFrac * (n - 1))));
    }
    return { sIdx: Math.min(sIdx, eIdx), eIdx: Math.max(sIdx, eIdx) };
  };

  thermals.forEach((th, idx) => {
    const { sIdx, eIdx } = resolveIndices(th);

    if (eIdx >= startIdx && sIdx <= endIdx) {
      const visS = Math.max(startIdx, sIdx);
      const visE = Math.min(endIdx, eIdx);
      const x1 = Math.round(((visS - startIdx) / (visibleN - 1)) * width * 10) / 10;
      const x2 = Math.round(((visE - startIdx) / (visibleN - 1)) * width * 10) / 10;
      const bandW = Math.max(12, x2 - x1);
      const cx = Math.round((x1 + bandW / 2) * 10) / 10;
      eventItems.push({
        type: 'thermal',
        sIdx,
        eIdx,
        x1,
        x2,
        bandW,
        cx,
        label: `T${th.thermalIndex || (idx + 1)}`,
        rawObj: th
      });
    }
  });

  rollInversions.forEach((inv) => {
    const { sIdx, eIdx } = resolveIndices(inv);

    if (eIdx >= startIdx && sIdx <= endIdx) {
      const visS = Math.max(startIdx, sIdx);
      const visE = Math.min(endIdx, eIdx);
      const x1 = Math.round(((visS - startIdx) / (visibleN - 1)) * width * 10) / 10;
      const x2 = Math.round(((visE - startIdx) / (visibleN - 1)) * width * 10) / 10;
      const bandW = Math.max(14, x2 - x1);
      const cx = Math.round((x1 + bandW / 2) * 10) / 10;
      const pCount = getPendolateCount(inv);
      const label = pCount ? `${pCount}P` : 'Inv';
      eventItems.push({
        type: 'roll',
        sIdx,
        eIdx,
        x1,
        x2,
        bandW,
        cx,
        label,
        pCount,
        rawObj: inv
      });
    }
  });

  dynamicManeuvers.forEach((m) => {
    const isInv = m.type === 'inversioni' || String(m.type).toLowerCase().includes('inversion');
    if (isInv) return;
    const { sIdx, eIdx } = resolveIndices(m, 4);

    if (eIdx >= startIdx && sIdx <= endIdx) {
      const visS = Math.max(startIdx, sIdx);
      const visE = Math.min(endIdx, eIdx);
      const x1 = Math.round(((visS - startIdx) / (visibleN - 1)) * width * 10) / 10;
      const x2 = Math.round(((visE - startIdx) / (visibleN - 1)) * width * 10) / 10;
      const bandW = Math.max(14, x2 - x1);
      const cx = Math.round((x1 + bandW / 2) * 10) / 10;
      const title = formatManeuverTitle(m.type, m);
      const label = m.type === 'wingover' ? 'WO' : (m.type === 'spirale' ? 'Spirale' : (m.type === 'figura8' ? 'Otto' : (title.length > 9 ? title.slice(0, 8) + '…' : title)));

      eventItems.push({
        type: 'maneuver',
        sIdx,
        eIdx,
        x1,
        x2,
        bandW,
        cx,
        label,
        fullTitle: title,
        rawObj: m
      });
    }
  });

  // Sort by horizontal position and allocate 3 non-colliding vertical lanes
  // Sort by horizontal position and allocate 3 non-colliding vertical lanes stacked from the bottom
  eventItems.sort((a, b) => a.cx - b.cx);
  const laneRightBounds = [-999, -999, -999];
  eventItems.forEach((ev) => {
    const pillW = Math.max(26, (ev.label ? ev.label.length : 2) * 8 + 10);
    const leftBound = ev.cx - pillW / 2;

    let chosenLane = 0;
    if (leftBound < laneRightBounds[0] + 6) {
      if (leftBound < laneRightBounds[1] + 6) {
        chosenLane = 2;
      } else {
        chosenLane = 1;
      }
    }
    ev.yLevel = chosenLane;
    laneRightBounds[chosenLane] = ev.cx + pillW / 2;
  });

  const bottomY = height - padBottom;
  const pillH = 16;

  // Render thermal bands
  const thermalBandsSvg = eventItems
    .filter((ev) => ev.type === 'thermal')
    .map((ev) => {
      const pillW = Math.max(26, ev.label.length * 8 + 10);
      const badgeY = bottomY - 3 - ev.yLevel * 18;
      const sIdx = ev.sIdx;
      const eIdx = ev.eIdx;
      return `
        <g class="gm-chart-thermal-band" data-phase-type="thermal" data-phase-label="${escapeHtml(ev.label)}" data-start-index="${sIdx}" data-end-index="${eIdx}" data-start-time="${ev.rawObj?.startTimeSeconds ?? ''}" data-end-time="${ev.rawObj?.endTimeSeconds ?? ''}" style="cursor: pointer;">
          <rect x="${ev.x1}" y="${padTop}" width="${ev.bandW}" height="${chartHeight}" fill="rgba(245, 158, 11, 0.14)" stroke="rgba(245, 158, 11, 0.45)" stroke-width="1" stroke-dasharray="3,2" rx="3" />
          <rect x="${ev.cx - pillW / 2}" y="${badgeY - pillH}" width="${pillW}" height="${pillH}" fill="rgba(15, 23, 42, 0.95)" stroke="#fbbf24" stroke-width="1.2" rx="3.5" />
          <text x="${ev.cx}" y="${badgeY - 4}" text-anchor="middle" font-size="10.5" font-family="monospace" font-weight="800" fill="#fbbf24">${escapeHtml(ev.label)}</text>
        </g>
      `;
    })
    .join('');

  // Render roll inversion markers
  const rollMarkersSvg = eventItems
    .filter((ev) => ev.type === 'roll')
    .map((ev) => {
      const pillW = Math.max(26, ev.label.length * 8 + 10);
      const badgeY = bottomY - 3 - ev.yLevel * 18;
      const sIdx = ev.sIdx;
      const eIdx = ev.eIdx;
      return `
        <g class="gm-chart-roll-marker" role="img" aria-label="Inversione di rollio (${ev.pCount ? `${ev.pCount} pendolate` : ''})" data-phase-type="roll" data-phase-label="${escapeHtml(ev.label)}" data-start-index="${sIdx}" data-end-index="${eIdx}" data-start-time="${ev.rawObj?.startTimeSeconds ?? ''}" data-end-time="${ev.rawObj?.endTimeSeconds ?? ''}" style="cursor: pointer;">
          <rect x="${ev.x1}" y="${padTop + 2}" width="${ev.bandW}" height="${chartHeight}" fill="rgba(234, 88, 12, 0.14)" stroke="rgba(234, 88, 12, 0.7)" stroke-width="1" stroke-dasharray="2,2" rx="2" />
          <rect x="${ev.cx - pillW / 2}" y="${badgeY - pillH}" width="${pillW}" height="${pillH}" fill="rgba(15, 23, 42, 0.95)" stroke="#fb923c" stroke-width="1.2" rx="3.5" />
          <text x="${ev.cx}" y="${badgeY - 4}" text-anchor="middle" font-size="10.5" font-family="monospace" font-weight="800" fill="#fb923c">${escapeHtml(ev.label)}</text>
        </g>
      `;
    })
    .join('');

  // Render general dynamic maneuver markers
  const maneuverMarkersSvg = eventItems
    .filter((ev) => ev.type === 'maneuver')
    .map((ev) => {
      const pillW = Math.max(26, ev.label.length * 8 + 10);
      const badgeY = bottomY - 3 - ev.yLevel * 18;
      const sIdx = ev.sIdx;
      const eIdx = ev.eIdx;
      return `
        <g class="gm-chart-maneuver-marker" role="img" aria-label="Manovra ${escapeHtml(ev.fullTitle || ev.label)}" data-phase-type="maneuver" data-phase-label="${escapeHtml(ev.fullTitle || ev.label)}" data-start-index="${sIdx}" data-end-index="${eIdx}" data-start-time="${ev.rawObj?.startTimeSeconds ?? ''}" data-end-time="${ev.rawObj?.endTimeSeconds ?? ''}" style="cursor: pointer;">
          <rect x="${ev.x1}" y="${padTop + 2}" width="${ev.bandW}" height="${chartHeight}" fill="rgba(192, 132, 252, 0.14)" stroke="rgba(192, 132, 252, 0.7)" stroke-width="1" stroke-dasharray="2,2" rx="2" />
          <rect x="${ev.cx - pillW / 2}" y="${badgeY - pillH}" width="${pillW}" height="${pillH}" fill="rgba(15, 23, 42, 0.95)" stroke="#c084fc" stroke-width="1.2" rx="3.5" />
          <text x="${ev.cx}" y="${badgeY - 4}" text-anchor="middle" font-size="10.5" font-family="monospace" font-weight="800" fill="#e9d5ff">${escapeHtml(ev.label)}</text>
        </g>
      `;
    })
    .join('');

  // Thermal probe (test 360) markers on the visible window
  const probeMarkersSvg = probes
    .map((pr) => {
      const { sIdx, eIdx } = resolveIndices(pr, 4);
      return { pr, sIdx, eIdx };
    })
    .filter(({ sIdx, eIdx }) => eIdx >= startIdx && sIdx <= endIdx)
    .map(({ pr, sIdx, eIdx }) => {
      const visIdx = Math.max(0, Math.min(visibleN - 1, sIdx - startIdx));
      const coord = polyCoords[visIdx] || { x: (width / 2), y: (padTop + chartHeight / 2) };
      return `
        <g class="gm-chart-probe-marker" data-phase-type="probe" data-phase-label="Sondaggio 360°" data-start-index="${sIdx}" data-end-index="${eIdx}" data-start-time="${pr.startTimeSeconds ?? ''}" data-end-time="${pr.endTimeSeconds ?? ''}" style="cursor: pointer;">
          <line x1="${coord.x}" y1="${padTop + 2}" x2="${coord.x}" y2="${height - padBottom}" stroke="rgba(14, 165, 233, 0.45)" stroke-width="1.5" stroke-dasharray="2,2" />
          <circle cx="${coord.x}" cy="${coord.y}" r="3.5" fill="#0284c7" stroke="#ffffff" stroke-width="1" />
        </g>
      `;
    })
    .join('');

  // Selected phase highlight overlay box
  let selectedPhaseBoxSvg = '';
  if (options.selectedPhase && typeof options.selectedPhase.startIndex === 'number') {
    const selS = options.selectedPhase.startIndex;
    const selE = options.selectedPhase.endIndex ?? selS;
    if (selE >= startIdx && selS <= endIdx) {
      const visS = Math.max(startIdx, selS);
      const visE = Math.min(endIdx, selE);
      const x1 = Math.round(((visS - startIdx) / (visibleN - 1)) * width * 10) / 10;
      const x2 = Math.round(((visE - startIdx) / (visibleN - 1)) * width * 10) / 10;
      const bandW = Math.max(12, x2 - x1);
      selectedPhaseBoxSvg = `
        <g class="gm-chart-phase-selected-group" aria-label="Fase selezionata ${escapeHtml(options.selectedPhase.label || '')}">
          <rect class="gm-chart-phase-selected-rect" x="${x1}" y="${padTop}" width="${bandW}" height="${chartHeight}" fill="rgba(56, 189, 248, 0.18)" stroke="#38bdf8" stroke-width="2" stroke-dasharray="4,2" rx="3" />
        </g>
      `;
    }
  }

  // Optional Variometer Curve Layer (Smoothed 3-point moving average with distinct positive/negative colors)
  let varioSvg = '';
  if (showVario) {
    const varioLimit = 5.0; // +/- 5 m/s scale
    const varioZeroY = Math.round((padTop + chartHeight * 0.58) * 10) / 10;
    const varioPts = visiblePoints.map((p, vIdx) => {
      const origIdx = startIdx + vIdx;
      const vRaw = getPointVario(p, origIdx, points);
      const vPrev = getPointVario(visiblePoints[Math.max(0, vIdx - 1)], Math.max(0, origIdx - 1), points);
      const vNext = getPointVario(visiblePoints[Math.min(visibleN - 1, vIdx + 1)], Math.min(n - 1, origIdx + 1), points);
      const vSmooth = (vPrev + vRaw * 2 + vNext) / 4;
      const clampedV = Math.max(-varioLimit, Math.min(varioLimit, vSmooth));
      const x = Math.round((vIdx / (visibleN - 1)) * width * 10) / 10;
      const y = Math.round((varioZeroY - (clampedV / varioLimit) * (chartHeight * 0.28)) * 10) / 10;
      return { x, y, v: vSmooth };
    });

    // Partition into contiguous positive (climb >= 0) and negative (sink < 0) runs with exact zero crossing
    const runs = [];
    if (varioPts.length > 0) {
      let currentRun = {
        sign: varioPts[0].v >= 0 ? 1 : -1,
        points: [varioPts[0]]
      };

      for (let i = 0; i < varioPts.length - 1; i++) {
        const p1 = varioPts[i];
        const p2 = varioPts[i + 1];
        const s1 = p1.v >= 0 ? 1 : -1;
        const s2 = p2.v >= 0 ? 1 : -1;

        if (s1 === s2) {
          currentRun.points.push(p2);
        } else {
          // Zero crossing between p1 and p2 at y = varioZeroY
          const denom = Math.abs(p1.v) + Math.abs(p2.v);
          const t = denom > 0 ? Math.abs(p1.v) / denom : 0.5;
          const x0 = Math.round((p1.x + t * (p2.x - p1.x)) * 10) / 10;
          const pZero = { x: x0, y: varioZeroY, v: 0 };

          currentRun.points.push(pZero);
          runs.push(currentRun);

          currentRun = {
            sign: s2,
            points: [pZero, p2]
          };
        }
      }
      runs.push(currentRun);
    }

    let posStrokeD = '';
    let negStrokeD = '';
    let posFillD = '';
    let negFillD = '';

    runs.forEach((run) => {
      if (!run.points || run.points.length < 2) return;
      const pts = run.points;
      const strokeCmd = `M ${pts[0].x},${pts[0].y} ` + pts.slice(1).map(pt => `L ${pt.x},${pt.y}`).join(' ');
      const fillCmd = `M ${pts[0].x},${varioZeroY} L ${pts[0].x},${pts[0].y} ` +
        pts.slice(1).map(pt => `L ${pt.x},${pt.y}`).join(' ') +
        ` L ${pts[pts.length - 1].x},${varioZeroY} Z`;

      if (run.sign === 1) {
        posStrokeD += (posStrokeD ? ' ' : '') + strokeCmd;
        posFillD += (posFillD ? ' ' : '') + fillCmd;
      } else {
        negStrokeD += (negStrokeD ? ' ' : '') + strokeCmd;
        negFillD += (negFillD ? ' ' : '') + fillCmd;
      }
    });

    varioSvg = `
      <g class="gm-chart-vario-layer" aria-label="Curva Variometro">
        <!-- Zero Reference Datum Line -->
        <line x1="0" y1="${varioZeroY}" x2="${width}" y2="${varioZeroY}" stroke="#64748b" stroke-dasharray="3,3" stroke-width="1" opacity="0.65" />
        <text x="${width - 6}" y="${varioZeroY - 3}" text-anchor="end" font-size="8.5" font-family="monospace" font-weight="600" fill="#94a3b8" opacity="0.9">0 m/s</text>
        ${posFillD ? `<path class="gm-vario-fill-climb" d="${posFillD}" fill="rgba(16, 185, 129, 0.16)" stroke="none" />` : ''}
        ${negFillD ? `<path class="gm-vario-fill-sink" d="${negFillD}" fill="rgba(239, 68, 68, 0.16)" stroke="none" />` : ''}
        ${posStrokeD ? `<path class="gm-vario-stroke-climb" d="${posStrokeD}" fill="none" stroke="#10b981" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" />` : ''}
        ${negStrokeD ? `<path class="gm-vario-stroke-sink" d="${negStrokeD}" fill="none" stroke="#ef4444" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" />` : ''}
      </g>
    `;
  }

  // Optional Ground Speed Curve Layer (Smoothed and scaled to lower 40% band)
  let speedSvg = '';
  if (showSpeed) {
    const speedLimit = 70.0; // 0 to 70 km/h scale
    const speedBandH = chartHeight * 0.38;
    const speedBaselineY = padTop + chartHeight;
    const speedCoords = visiblePoints.map((p, vIdx) => {
      const origIdx = startIdx + vIdx;
      const spRaw = getPointSpeed(p, origIdx, points);
      const spPrev = getPointSpeed(visiblePoints[Math.max(0, vIdx - 1)], Math.max(0, origIdx - 1), points);
      const spNext = getPointSpeed(visiblePoints[Math.min(visibleN - 1, vIdx + 1)], Math.min(n - 1, origIdx + 1), points);
      const spSmooth = (spPrev + spRaw * 2 + spNext) / 4;
      const clampedSp = Math.max(0, Math.min(speedLimit, spSmooth));
      const x = Math.round((vIdx / (visibleN - 1)) * width * 10) / 10;
      const y = Math.round((speedBaselineY - (clampedSp / speedLimit) * speedBandH) * 10) / 10;
      return `${x},${y}`;
    }).join(' ');

    const speed70Y = Math.round((speedBaselineY - speedBandH) * 10) / 10;
    speedSvg = `
      <g class="gm-chart-speed-layer" aria-label="Curva Velocità al Suolo">
        <line x1="0" y1="${speed70Y}" x2="${width}" y2="${speed70Y}" stroke="#c084fc" stroke-dasharray="2,3" stroke-width="0.8" opacity="0.35" />
        <text x="6" y="${speed70Y + 9}" font-size="8" font-family="monospace" fill="#c084fc" opacity="0.8">70 km/h</text>
        <polyline points="${speedCoords}" fill="none" stroke="#c084fc" stroke-width="1.6" stroke-dasharray="4,2" stroke-linecap="round" stroke-linejoin="round" opacity="0.8" />
      </g>
    `;
  }

  // Inspection Crosshair Cursor
  let cursorX = 0;
  let cursorY = 0;
  let hasValidCursor = false;
  if (cursorIndex !== null && cursorIndex >= startIdx && cursorIndex <= endIdx) {
    const vIdx = cursorIndex - startIdx;
    const coord = polyCoords[vIdx];
    if (coord) {
      cursorX = coord.x;
      cursorY = coord.y;
      hasValidCursor = true;
    }
  }

  const cursorSvg = `
    <g id="gm-chart-cursor-group" style="${hasValidCursor ? '' : 'display:none;'}" pointer-events="none">
      <line id="gm-chart-cursor-line" x1="${cursorX}" y1="${padTop}" x2="${cursorX}" y2="${height - padBottom}" stroke="var(--gm-accent-sky, #38bdf8)" stroke-width="1.5" stroke-dasharray="3,3" />
      <circle id="gm-chart-cursor-dot" cx="${cursorX}" cy="${cursorY}" r="4.5" fill="#38bdf8" stroke="#ffffff" stroke-width="1.5" />
    </g>
  `;

  // Time labels
  let startTime = visiblePoints[0].timeFormatted || visiblePoints[0].time;
  if (!startTime && visiblePoints[0].timeSeconds != null) startTime = formatSecondsToTime(visiblePoints[0].timeSeconds);
  if (!startTime) startTime = '00:00';

  let endTime = visiblePoints[visibleN - 1].timeFormatted || visiblePoints[visibleN - 1].time;
  if (!endTime && visiblePoints[visibleN - 1].timeSeconds != null) endTime = formatSecondsToTime(visiblePoints[visibleN - 1].timeSeconds);

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" class="w-full h-full" preserveAspectRatio="none" role="img" aria-label="Grafico altimetrico del volo: Quota massima ${maxAlt} m, Minima ${minAlt} m">
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

      <!-- Dynamic maneuver bands -->
      ${maneuverMarkersSvg}

      <!-- Roll inversion bands -->
      ${rollMarkersSvg}

      <!-- Thermal probe lines -->
      ${probeMarkersSvg}

      <!-- Selected phase highlight box -->
      ${selectedPhaseBoxSvg}

      <!-- Optional Vario layer -->
      ${varioSvg}

      <!-- Optional Speed layer -->
      ${speedSvg}

      <!-- Area fill below path -->
      ${showAlt ? `<polygon points="0,${height - padBottom} ${polyPoints} ${width},${height - padBottom}" fill="url(#${gradId}-area)" pointer-events="none" />` : ''}

      <!-- Main altitude polyline colored by variometer -->
      ${showAlt ? `<polyline points="${polyPoints}" fill="none" stroke="url(#${gradId})" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />` : ''}

      <!-- Inspection cursor crosshair -->
      ${cursorSvg}

      <!-- Time axis labels -->
      <text x="8" y="${height - 6}" fill="var(--gm-text-muted)" font-size="10" font-family="monospace">${escapeHtml(startTime)}</text>
      ${endTime ? `<text x="${width - 8}" y="${height - 6}" text-anchor="end" fill="var(--gm-text-muted)" font-size="10" font-family="monospace">${escapeHtml(endTime)}</text>` : ''}
    </svg>
  `;
}

/**
 * Generates an educational safety debriefing from flight telemetry.
 * Formulated with concise, safety-first instructor debriefing.
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
export function renderFlightDetailHtml(bundle, options = {}) {
  const meta = bundle.meta || {};
  const raw = bundle.raw || {};
  const tel = bundle.telemetry || {};

  const opt = options || {};
  const stateStore = (opt.store || bundle?.options?.store || store);
  const appState = (stateStore && typeof stateStore.getState === 'function') ? stateStore.getState() : {};
  const activeLayer = (appState.ui && appState.ui.mapLayer) || 'topo';

  // Career personal records calculation & matching
  let careerRecords = opt.careerRecords || bundle?.careerRecords;
  if (!careerRecords) {
    let allFlights = opt.allFlights || bundle?.allFlights;
    if (!Array.isArray(allFlights) || allFlights.length === 0) {
      allFlights = Array.isArray(appState.flights) && appState.flights.length > 0 ? appState.flights : DEFAULT_SEED_FLIGHTS;
    }
    careerRecords = calculatePersonalRecords(allFlights);
  }
  const recordFlags = checkFlightRecordFlags(meta, careerRecords);

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
  const hasValidTrack = Array.isArray(points) && points.length >= 2;
  const hasIgcDownload = Boolean(hasValidTrack || (raw && raw.rawIgc && raw.rawIgc.length > 30) || meta.hasRawIgc);
  const thermals = Array.isArray(tel.thermals) ? tel.thermals : [];
  const allManeuvers = Array.isArray(tel.maneuvers) ? tel.maneuvers : [];
  const thermalProbes = allManeuvers.filter((m) => m.type === '360°' || m.type === 'SINGLE_360' || m.type === 'sondaggio_termica');
  const rollInversions = allManeuvers.filter((m) => m.type === 'inversioni' || String(m.type).toLowerCase().includes('inversion'));
  const dynamicManeuvers = allManeuvers.filter((m) => m.type !== '360°' && m.type !== 'SINGLE_360' && m.type !== 'sondaggio_termica');

  const svgChartHtml = generateExpandedSvgChart(points, 600, 220, {
    thermals,
    thermalProbes,
    rollInversions,
    dynamicManeuvers
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
  const takeoffAltVal = meta.takeoffAltMsl || meta.takeoffAlt || meta.takeoffCoords?.elev;
  const takeoffAlt = takeoffAltVal ? `${takeoffAltVal} m` : '--';
  const landingAltVal = meta.landingAltMsl || meta.landingAlt || meta.landingCoords?.elev;
  const landingAlt = landingAltVal ? `${landingAltVal} m` : '--';
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
            class="gm-btn gm-btn-secondary gm-topbar-setup-btn ${!hasValidTrack ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}"
            ${!hasValidTrack ? 'disabled aria-disabled="true" title="Setup traccia non disponibile: traccia GPS assente"' : 'aria-label="Setup Traccia" title="Setup Traccia (Trimming e Calibrazione Quote)"'}
          >
            <svg width="15" height="15" class="flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <span class="hidden sm:inline">Setup Traccia</span>
          </button>
          <button
            type="button"
            id="btn-delete-from-detail"
            class="gm-btn gm-btn-secondary gm-flight-detail-delete-btn"
            style="min-height: var(--gm-touch-min, 48px);"
            data-action="delete-flight"
            data-flight-id="${escapeHtml(flightId)}"
            aria-label="Elimina volo ${escapeHtml(siteTitle)}"
            title="Elimina volo dal Flight Log"
          >
            <svg width="15" height="15" class="flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span class="hidden sm:inline">Elimina</span>
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
                  ${recordFlags.isMaxDuration ? '<span class="gm-record-badge" title="Record Personale: Volo Più Lungo">Record</span>' : ''}
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  ${hasValidTrack ? '<span class="gm-status-pill gm-status-pill-emerald" title="Traccia GPS registrata disponibile">Traccia GPS</span>' : '<span class="gm-status-pill gm-status-pill-slate" title="Volo registrato senza file IGC o coordinate GPS">Traccia Non Registrata</span>'}
                  ${meta.isReconstructed ? '<span class="gm-status-pill gm-status-pill-sky" title="Telemetria ricostruita da statistiche di volo">Telemetria Ricostruita</span>' : ''}
                  ${meta.isTrimmed ? '<span class="gm-status-pill gm-status-pill-amber">Traccia Trimmata</span>' : ''}
                  ${meta.elevationCorrection ? '<span class="gm-status-pill gm-status-pill-emerald">Quote Calibrate</span>' : ''}
                  ${recordFlags.hasAnyRecord ? '<span class="gm-status-pill gm-status-pill-record">Record Personale</span>' : ''}
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

        <!-- 2D Flight Track Mini-Map (Above Altimetric Profile) -->
        <section class="gm-flight-detail-section" aria-label="Mappa 2D Traccia Volo">
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="flex items-center gap-2 min-w-0">
              <h3 class="gm-flight-detail-section-title" style="margin: 0;">Mappa 2D Traccia</h3>
              <span id="gm-flight-map-phase-badge" class="gm-flight-map-phase-pill" style="display: none;" aria-live="polite"></span>
            </div>
            <button
              type="button"
              id="btn-flight-map-reset-selection"
              class="gm-flight-map-reset-btn"
              style="display: none;"
              title="Deseleziona fase e mostra traccia intera"
              aria-label="Mostra traccia completa"
            >
              Mostra Tutto
            </button>
          </div>

          <div id="flight-detail-map-container" class="gm-mini-map-box gm-flight-minimap-box" data-map-layer="${activeLayer}" style="position: relative; width: 100%; height: 210px; border-radius: var(--gm-radius-md); overflow: hidden; border: 1px solid var(--gm-border); background: var(--gm-bg-card);">
            <div id="flight-detail-map-canvas" class="gm-flight-map-canvas" style="width: 100%; height: 100%; touch-action: pan-y;"></div>
            
            <button
              type="button"
              id="flight-detail-map-layer-toggle"
              class="gm-mini-map-layer-toggle"
              data-action="toggle-flight-map-layer"
              data-layer="${activeLayer}"
              aria-label="Layer mappa: ${activeLayer === 'satellite' ? 'Satellite (tocca per OpenTopo)' : 'OpenTopo (tocca per Satellite)'}"
              title="Passa a ${activeLayer === 'satellite' ? 'OpenTopo' : 'Satellite'}"
            >
              ${renderLayerToggleIcon(activeLayer, 20)}
            </button>

            <button
              type="button"
              id="flight-detail-map-expand-btn"
              class="gm-mini-map-expand-btn"
              data-action="expand-flight-map"
              aria-label="Visualizza Replay 3D della traccia"
              title="Visualizza Replay 3D della traccia"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            </button>

            <div id="flight-detail-map-legend" class="gm-flight-map-hud-legend">
              <span class="gm-map-legend-dot gm-map-legend-dot-takeoff"></span><span>Decollo</span>
              <span class="gm-map-legend-dot gm-map-legend-dot-landing"></span><span>Atterraggio</span>
              <span class="gm-map-legend-pill gm-map-legend-vario">Traccia Vario (m/s)</span>
            </div>
          </div>
        </section>

        <!-- Altimetric Profile & Interactive Telemetry -->
        <section class="gm-flight-detail-section" aria-label="Profilo Altimetrico">
          <div class="flex items-center justify-between gap-2 mb-2">
            <h3 class="gm-flight-detail-section-title">Profilo Altimetrico</h3>
          </div>

          ${hasValidTrack ? `
          <!-- Telemetry Toolbar: Channel Toggles & Zoom Controls (Single-Row Segmented Dock) -->
          <div class="gm-telemetry-toolbar mb-2" role="toolbar" aria-label="Controlli Telemetria">
            <div class="gm-telemetry-segmented-dock gm-telemetry-toggles" role="group" aria-label="Canali Telemetrici">
              <button type="button" id="btn-toggle-alt" class="gm-telemetry-pill-btn gm-telemetry-btn active-alt" aria-pressed="true" title="Visualizza/Nascondi Quota">
                <span class="gm-telemetry-dot dot-alt"></span>
                <span>Quota</span>
              </button>
              <button type="button" id="btn-toggle-vario" class="gm-telemetry-pill-btn gm-telemetry-btn" aria-pressed="false" title="Attiva curva Variometro (m/s)">
                <span class="gm-telemetry-dot dot-vario"></span>
                <span>Vario</span>
              </button>
              <button type="button" id="btn-toggle-speed" class="gm-telemetry-pill-btn gm-telemetry-btn" aria-pressed="false" title="Attiva curva Velocità al Suolo (km/h)">
                <span class="gm-telemetry-dot dot-speed"></span>
                <span class="hidden sm:inline">Velocità</span>
                <span class="sm:hidden">Vel.</span>
              </button>
            </div>
            <div class="gm-telemetry-zoom-dock gm-telemetry-zoom-group" role="group" aria-label="Zoom Grafico">
              <button type="button" id="btn-chart-zoom-out" class="gm-telemetry-zoom-btn" title="Zoom Indietro" aria-label="Zoom indietro">−</button>
              <span id="gm-chart-zoom-level" class="gm-telemetry-zoom-val" aria-live="polite">1.0x</span>
              <button type="button" id="btn-chart-zoom-in" class="gm-telemetry-zoom-btn" title="Zoom Avanti" aria-label="Zoom avanti">+</button>
              <button type="button" id="btn-chart-zoom-reset" class="gm-telemetry-zoom-btn text-xs px-1" title="Ripristina Zoom (1x)" aria-label="Ripristina zoom">1x</button>
            </div>
          </div>

          <!-- Real-time Cockpit Inspection Ticker (Single Row Compact Banner) -->
          <div id="gm-chart-inspection-hud" class="gm-telemetry-hud-ticker gm-telemetry-hud mb-1.5" role="region" aria-label="HUD Ispezione Telemetria">
            <div class="gm-hud-ticker-item gm-telemetry-hud-item">
              <span class="gm-hud-ticker-lbl gm-telemetry-hud-label">Tempo:</span>
              <span id="gm-hud-time" class="gm-hud-ticker-val gm-telemetry-hud-val">--:--</span>
            </div>
            <div class="gm-hud-ticker-item gm-telemetry-hud-item">
              <span class="gm-hud-ticker-lbl gm-telemetry-hud-label">Quota:</span>
              <span id="gm-hud-alt" class="gm-hud-ticker-val gm-telemetry-hud-val text-sky-400">-- m</span>
            </div>
            <div class="gm-hud-ticker-item gm-telemetry-hud-item">
              <span class="gm-hud-ticker-lbl gm-telemetry-hud-label">Vario:</span>
              <span id="gm-hud-vario" class="gm-hud-ticker-val gm-telemetry-hud-val text-emerald-400">-- m/s</span>
            </div>
            <div class="gm-hud-ticker-item gm-telemetry-hud-item">
              <span class="gm-hud-ticker-lbl gm-telemetry-hud-label">Vel:</span>
              <span id="gm-hud-speed" class="gm-hud-ticker-val gm-telemetry-hud-val text-purple-300">-- km/h</span>
            </div>
            <div class="gm-hud-ticker-item gm-telemetry-hud-item gm-hud-event-item">
              <span id="gm-hud-event" class="gm-hud-ticker-val gm-telemetry-hud-val text-amber-400">--</span>
            </div>
          </div>

          <!-- Interactive SVG Chart Container -->
          <div id="gm-interactive-chart-container" class="gm-flight-detail-alt-chart" style="touch-action: pan-y; cursor: crosshair;">
            ${svgChartHtml}
          </div>

          <!-- Overview Pan Navigator Track -->
          <div id="gm-chart-navigator" class="gm-telemetry-navigator" style="display: none;" role="slider" aria-label="Navigatore Panoramico Traccia" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">
            <div id="gm-chart-nav-handle" class="gm-telemetry-nav-handle" style="left: 0%; width: 100%;"></div>
          </div>

          <!-- Variometer & Thermal Compact Legend -->
          <div class="gm-vario-legend-compact gm-vario-legend-bar">
            <div class="gm-vario-gradient-bar-wrap">
              <span class="gm-legend-scale-lbl">&lt;-2 m/s</span>
              <div class="gm-vario-gradient-strip" aria-hidden="true"></div>
              <span class="gm-legend-scale-lbl">Planata</span>
              <div class="gm-vario-gradient-strip strip-climb" aria-hidden="true"></div>
              <span class="gm-legend-scale-lbl">&gt;+3 m/s</span>
            </div>
            <div class="gm-legend-chips-wrap">
              <div class="gm-legend-chip gm-legend-vario-chip">
                <span class="gm-vario-dual-dot" aria-hidden="true"></span>
                <span>Vario: <span class="text-emerald-400 font-semibold">+Salita</span> / <span class="text-rose-400 font-semibold">-Discesa</span></span>
              </div>
              ${thermals.length > 0 ? `
                <div class="gm-legend-chip">
                  <span class="gm-thermal-legend-icon">T</span>
                  <span>Termica (${thermals.length})</span>
                </div>
              ` : ''}
              ${thermalProbes.length > 0 ? `
                <div class="gm-legend-chip">
                  <span class="gm-probe-legend-icon">•</span>
                  <span>Sondaggio (test 360°)</span>
                </div>
              ` : ''}
              ${rollInversions.length > 0 ? `
                <div class="gm-legend-chip">
                  <span class="gm-roll-legend-icon">P</span>
                  <span>Inversioni (P)</span>
                </div>
              ` : ''}
            </div>
          </div>
          ` : `
          <div class="gm-flight-no-track-box flex flex-col items-center justify-center p-6 text-center border border-[var(--gm-border-default)] rounded-xl bg-[var(--gm-bg-surface)] text-[var(--gm-text-secondary)]">
            <span class="text-sm font-semibold text-[var(--gm-text-primary)] mb-1">Tracciato altimetrico non disponibile</span>
            <span class="text-xs text-[var(--gm-text-muted)] max-w-md">Nessuna traccia GPS registrata per questo volo. I dati di quota (Decollo: ${escapeHtml(takeoffAlt)}, Quota Max: ${escapeHtml(maxAlt)}, Atterraggio: ${escapeHtml(landingAlt)}) derivano dalle statistiche certificate salvate.</span>
          </div>
          `}
        </section>

        <!-- Kinetic Telemetry 2x4 Responsive Card Grid (Thermals Prominent) -->
        <section class="gm-flight-detail-section" aria-label="Cinematica e Prestazioni">
          <h3 class="gm-flight-detail-section-title">Cinematica &amp; Prestazioni</h3>
          <div class="gm-flight-metrics-grid">
            <div class="gm-flight-metric-card ${recordFlags.isMaxAlt ? 'gm-flight-metric-card-record' : ''}">
              <div class="flex items-center justify-between gap-1">
                <span class="gm-flight-metric-num">${escapeHtml(maxAlt)}</span>
                ${recordFlags.isMaxAlt ? '<span class="gm-record-badge" title="Record Personale: Quota Massima MSL">Record</span>' : ''}
              </div>
              <span class="gm-flight-metric-desc">Quota Massima MSL</span>
            </div>
            <div class="gm-flight-metric-card ${recordFlags.isMaxGain ? 'gm-flight-metric-card-record' : ''}">
              <div class="flex items-center justify-between gap-1">
                <span class="gm-flight-metric-num ${meta.maxGainMeters ? 'text-emerald-400' : ''}">${escapeHtml(maxGain)}</span>
                ${recordFlags.isMaxGain ? '<span class="gm-record-badge" title="Record Personale: Maggior Guadagno">Record</span>' : ''}
              </div>
              <span class="gm-flight-metric-desc">Guadagno dal Decollo</span>
            </div>
            <div class="gm-flight-metric-card ${recordFlags.isMaxThermals ? 'gm-flight-metric-card-record' : ''}">
              <div class="flex items-center justify-between gap-1">
                <span class="gm-flight-metric-num ${thermals.length > 0 ? 'text-amber-400 font-bold' : ''}">${thermals.length}</span>
                ${recordFlags.isMaxThermals ? '<span class="gm-record-badge" title="Record Personale: Termiche Massime">Record</span>' : ''}
              </div>
              <span class="gm-flight-metric-desc">Termiche Agganciate</span>
            </div>
            <div class="gm-flight-metric-card ${recordFlags.isMaxClimbRate ? 'gm-flight-metric-card-record' : ''}">
              <div class="flex items-center justify-between gap-1">
                <span class="gm-flight-metric-num text-emerald-400">${escapeHtml(climbRate)}</span>
                ${recordFlags.isMaxClimbRate ? '<span class="gm-record-badge" title="Record Personale: Salita Massima (Max Vario)">Record</span>' : ''}
              </div>
              <span class="gm-flight-metric-desc">Salita Massima (Vario)</span>
            </div>
            <div class="gm-flight-metric-card ${recordFlags.isMaxSinkRate ? 'gm-flight-metric-card-record' : ''}">
              <div class="flex items-center justify-between gap-1">
                <span class="gm-flight-metric-num text-sky-400">${escapeHtml(sinkRate)}</span>
                ${recordFlags.isMaxSinkRate ? '<span class="gm-record-badge" title="Record Personale: Discesa Massima (Min Vario)">Record</span>' : ''}
              </div>
              <span class="gm-flight-metric-desc">Discesa Massima</span>
            </div>
            <div class="gm-flight-metric-card">
              <span class="gm-flight-metric-num">${escapeHtml(accumClimb)}</span>
              <span class="gm-flight-metric-desc">Dislivello Cumulato</span>
            </div>
            <div class="gm-flight-metric-card ${recordFlags.isMaxDistance ? 'gm-flight-metric-card-record' : ''}">
              <div class="flex items-center justify-between gap-1">
                <span class="gm-flight-metric-num">${escapeHtml(distance)}</span>
                ${recordFlags.isMaxDistance ? '<span class="gm-record-badge" title="Record Personale: Distanza Massima">Record</span>' : ''}
              </div>
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
                const sIdx = typeof t.startIndex === 'number' ? t.startIndex : 0;
                const eIdx = typeof t.endIndex === 'number' ? t.endIndex : (points.length - 1);
                const tNum = t.thermalIndex || (idx + 1);

                return `
                  <div class="gm-thermal-card" data-action="select-phase" data-phase-type="thermal" data-phase-label="T${tNum}" data-start-index="${sIdx}" data-end-index="${eIdx}" data-start-time="${t.startTimeSeconds ?? ''}" data-end-time="${t.endTimeSeconds ?? ''}" style="cursor: pointer;" title="Visualizza termica T${tNum} sulla mappa">
                    <div class="flex items-center gap-3">
                      <div class="gm-thermal-index-badge">#${tNum}</div>
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
                      ${turns ? `<span>${turns} giri (${turnDir === 'CW' ? 'Orario' : (turnDir === 'CCW' ? 'Antiorario' : 'Misto')})</span>` : ''}
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
                  const sIdx = typeof m.startIndex === 'number' ? m.startIndex : 0;
                  const eIdx = typeof m.endIndex === 'number' ? m.endIndex : sIdx;
                  return `
                    <div class="gm-maneuver-card" data-action="select-phase" data-phase-type="maneuver" data-phase-label="${escapeHtml(title)}" data-start-index="${sIdx}" data-end-index="${eIdx}" data-start-time="${m.startTimeSeconds ?? ''}" data-end-time="${m.endTimeSeconds ?? ''}" style="cursor: pointer;" title="Visualizza manovra sulla mappa">
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
                    const sIdx = typeof m.startIndex === 'number' ? m.startIndex : 0;
                    const eIdx = typeof m.endIndex === 'number' ? m.endIndex : Math.min(points.length - 1, sIdx + 4);
                    return `
                      <div class="gm-maneuver-card" data-action="select-phase" data-phase-type="probe" data-phase-label="Sondaggio #${idx + 1}" data-start-index="${sIdx}" data-end-index="${eIdx}" data-start-time="${m.startTimeSeconds ?? ''}" data-end-time="${m.endTimeSeconds ?? ''}" style="border-style: dashed; cursor: pointer;" title="Visualizza sondaggio sulla mappa">
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

        <!-- Educational Safety Debriefing -->
        <section class="gm-debrief-box" aria-label="Debriefing Didattico di Sicurezza">
          <div class="gm-debrief-header">
            <h3 class="gm-flight-detail-section-title m-0">Debriefing Didattico di Sicurezza</h3>
            <span class="gm-debrief-instructor-tag">Istruttore</span>
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
              class="gm-btn gm-btn-secondary px-5"
            >
              Salva Note
            </button>
          </div>
        </section>

        <!-- Secondary Aerological Data: Declassed Wind Drift -->
        ${hasWind ? `
          <section class="gm-flight-detail-section opacity-85" aria-label="Dati Eolici Secondari">
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
            class="gm-btn gm-btn-primary gm-bottom-replay-btn ${!hasValidTrack ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}"
            ${!hasValidTrack ? 'disabled aria-disabled="true" title="Replay 3D non disponibile: traccia GPS assente"' : 'title="Visualizza Replay 3D"'}
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
            class="gm-btn gm-btn-secondary gm-bottom-action-btn ${!hasValidTrack ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}"
            ${!hasValidTrack ? 'disabled aria-disabled="true" title="Setup traccia non disponibile: traccia GPS assente"' : 'title="Setup Traccia" aria-label="Setup Traccia"'}
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
            class="gm-btn gm-btn-secondary gm-bottom-action-btn ${!hasIgcDownload ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}"
            ${!hasIgcDownload ? 'disabled aria-disabled="true" title="Traccia IGC non disponibile"' : 'title="Scarica Traccia IGC (FAI)" aria-label="Scarica Traccia IGC (FAI)"'}
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
  const closedFlightId = activeDetailOverlay?.getAttribute('data-flight-id') || null;

  if (flightDetailMapEngine) {
    try {
      flightDetailMapEngine.destroy();
    } catch (_) {}
    flightDetailMapEngine = null;
  }

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

  // Restore keyboard focus to caller element if still connected
  if (previousActiveEl && typeof previousActiveEl.focus === 'function' && previousActiveEl.isConnected) {
    previousActiveEl.focus();
    previousActiveEl = null;
  }

  // Also highlight and scroll the closed flight card into view if in logbook view
  if (closedFlightId && typeof document !== 'undefined') {
    const card = document.querySelector(`.gm-flight-card[data-flight-id="${closedFlightId}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof card.focus === 'function') {
        try {
          card.focus({ preventScroll: true });
        } catch (_) {
          card.focus();
        }
      }
      card.classList.remove('gm-flight-card-focused');
      void card.offsetWidth;
      card.classList.add('gm-flight-card-focused');
      setTimeout(() => {
        if (card && card.classList) {
          card.classList.remove('gm-flight-card-focused');
        }
      }, 3000);
    }
  }
}

/**
 * Attaches interactive controls to the flight telemetry chart:
 * - Multi-channel layer toggles (Altitude, Variometer, Ground Speed)
 * - Zoom controls (Zoom In, Zoom Out, Reset 1x)
 * - Cockpit inspection HUD updating on hover/touch (<16ms)
 * - Overview pan scrub navigator bar
 * - Horizontal drag to pan across zoomed track with touch-action: pan-y isolation
 * @param {HTMLElement} overlayEl
 * @param {Object} bundle
 */
export function attachInteractiveFlightChart(overlayEl, bundle) {
  if (!overlayEl || typeof overlayEl.querySelector !== 'function') return;

  const chartContainer = overlayEl.querySelector('#gm-interactive-chart-container');
  if (!chartContainer) return;

  const raw = bundle?.raw || {};
  const points = (raw.decimatedPoints && raw.decimatedPoints.length > 0)
    ? raw.decimatedPoints
    : (raw.points || []);

  const hasPoints = Array.isArray(points) && points.length >= 2;

  const tel = bundle?.telemetry || {};
  const thermals = Array.isArray(tel.thermals) ? tel.thermals : [];
  const allManeuvers = Array.isArray(tel.maneuvers) ? tel.maneuvers : [];
  const thermalProbes = (Array.isArray(tel.thermalProbes) && tel.thermalProbes.length > 0)
    ? tel.thermalProbes
    : allManeuvers.filter((m) => m.type === '360°' || m.type === 'SINGLE_360' || m.type === 'sondaggio_termica');
  const rollInversions = allManeuvers.filter((m) => m.type === 'inversioni' || String(m.type).toLowerCase().includes('inversion'));
  const dynamicManeuvers = allManeuvers.filter((m) => m.type !== '360°' && m.type !== 'SINGLE_360' && m.type !== 'sondaggio_termica');

  const btnToggleAlt = overlayEl.querySelector('#btn-toggle-alt');
  const btnToggleVario = overlayEl.querySelector('#btn-toggle-vario');
  const btnToggleSpeed = overlayEl.querySelector('#btn-toggle-speed');

  const btnZoomIn = overlayEl.querySelector('#btn-chart-zoom-in');
  const btnZoomOut = overlayEl.querySelector('#btn-chart-zoom-out');
  const btnZoomReset = overlayEl.querySelector('#btn-chart-zoom-reset');
  const zoomLevelEl = overlayEl.querySelector('#gm-chart-zoom-level');

  const hudTime = overlayEl.querySelector('#gm-hud-time');
  const hudAlt = overlayEl.querySelector('#gm-hud-alt');
  const hudVario = overlayEl.querySelector('#gm-hud-vario');
  const hudSpeed = overlayEl.querySelector('#gm-hud-speed');
  const hudEvent = overlayEl.querySelector('#gm-hud-event');

  const navTrack = overlayEl.querySelector('#gm-chart-navigator');
  const navHandle = overlayEl.querySelector('#gm-chart-nav-handle');

  const mapCanvasEl = overlayEl.querySelector('#flight-detail-map-canvas');
  const phaseBadgeEl = overlayEl.querySelector('#gm-flight-map-phase-badge');
  const resetPhaseBtn = overlayEl.querySelector('#btn-flight-map-reset-selection');
  const layerToggleBtn = overlayEl.querySelector('#flight-detail-map-layer-toggle');
  const expandMapBtn = overlayEl.querySelector('#flight-detail-map-expand-btn');

  const targetStore = bundle?.options?.store || store;
  const currentAppState = (targetStore && typeof targetStore.getState === 'function') ? targetStore.getState() : {};
  const activeTheme = currentAppState.ui?.theme || 'dark';
  let activeLayer = currentAppState.ui?.mapLayer || 'topo';

  // Ensure points have fallback coordinates and smoothed variometer to match chart 1:1
  const rawVarios = hasPoints ? points.map((p, idx) => getPointVario(p, idx, points)) : [];
  const safePoints = hasPoints ? points.map((p, idx) => {
    const lat = (typeof p.lat === 'number' && !isNaN(p.lat)) ? p.lat : (45.8 + idx * 0.0008);
    const lon = (typeof p.lon === 'number' && !isNaN(p.lon)) ? p.lon : (9.29 + idx * 0.0006);
    const prevV = rawVarios[Math.max(0, idx - 1)];
    const nextV = rawVarios[Math.min(points.length - 1, idx + 1)];
    const vario = (prevV + rawVarios[idx] * 2 + nextV) / 4;
    return {
      ...p,
      lat,
      lon,
      vario
    };
  }) : [];

  if (flightDetailMapEngine) {
    try { flightDetailMapEngine.destroy(); } catch (_) {}
    flightDetailMapEngine = null;
  }

  if (mapCanvasEl) {
    flightDetailMapEngine = createMapEngine(mapCanvasEl, {
      theme: activeTheme,
      layer: activeLayer,
      isMiniMap: true
    });

    if (flightDetailMapEngine) {
      const meta = bundle?.meta || {};
      const takeoffLat = meta.takeoffLat ?? meta.takeoffCoords?.lat ?? (hasPoints ? safePoints[0]?.lat : null);
      const takeoffLon = meta.takeoffLon ?? meta.takeoffCoords?.lon ?? meta.takeoffCoords?.lng ?? (hasPoints ? safePoints[0]?.lon : null);
      const takeoff = (takeoffLat != null && takeoffLon != null)
        ? { lat: takeoffLat, lon: takeoffLon, name: meta.takeoffLocationName || meta.takeoffName || 'Decollo' }
        : (hasPoints && safePoints[0] ? { lat: safePoints[0].lat, lon: safePoints[0].lon, name: 'Decollo' } : null);

      const landingLat = meta.landingLat ?? meta.landingCoords?.lat ?? (hasPoints ? safePoints[safePoints.length - 1]?.lat : null);
      const landingLon = meta.landingLon ?? meta.landingCoords?.lon ?? meta.landingCoords?.lng ?? (hasPoints ? safePoints[safePoints.length - 1]?.lon : null);
      const landing = (landingLat != null && landingLon != null)
        ? { lat: landingLat, lon: landingLon, name: meta.landingLocationName || meta.landingName || 'Atterraggio' }
        : (hasPoints && safePoints[safePoints.length - 1] ? { lat: safePoints[safePoints.length - 1].lat, lon: safePoints[safePoints.length - 1].lon, name: 'Atterraggio' } : null);

      flightDetailMapEngine.renderFlightTrack(mapCanvasEl, {
        points: safePoints,
        takeoff,
        landing,
        thermals,
        maneuvers: Array.isArray(tel.maneuvers) ? tel.maneuvers : []
      });
    }
  }

  if (layerToggleBtn && !layerToggleBtn._gmListenerAttached) {
    layerToggleBtn._gmListenerAttached = true;
    layerToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentLayer = layerToggleBtn.getAttribute('data-layer') || activeLayer;
      const nextLayer = getNextMapLayer(currentLayer);
      activeLayer = nextLayer;
      layerToggleBtn.setAttribute('data-layer', nextLayer);
      layerToggleBtn.setAttribute('aria-label', `Layer mappa: ${nextLayer === 'satellite' ? 'Satellite (tocca per OpenTopo)' : 'OpenTopo (tocca per Satellite)'}`);
      layerToggleBtn.setAttribute('title', `Passa a ${nextLayer === 'satellite' ? 'OpenTopo' : 'Satellite'}`);
      layerToggleBtn.innerHTML = renderLayerToggleIcon(nextLayer, 20);

      if (flightDetailMapEngine && typeof flightDetailMapEngine.setLayer === 'function') {
        flightDetailMapEngine.setLayer(nextLayer);
      }

      const mapContainer = overlayEl.querySelector('#flight-detail-map-container');
      if (mapContainer) {
        mapContainer.setAttribute('data-map-layer', nextLayer);
      }

      if (targetStore && typeof targetStore.setState === 'function') {
        const prevUi = targetStore.getState().ui || {};
        targetStore.setState({ ui: { ...prevUi, mapLayer: nextLayer } });
      }
    });
  }

  if (expandMapBtn && !expandMapBtn._gmListenerAttached) {
    expandMapBtn._gmListenerAttached = true;
    expandMapBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const flightId = bundle?.meta?.id;
      if (flightId) {
        closeFlightDetailView();
        window.location.hash = `#replay?flightId=${encodeURIComponent(flightId)}`;
      }
    });
  }

  if (!hasPoints) return;

  const state = {
    zoom: 1.0,
    pan: 0.5,
    showAlt: true,
    showVario: false,
    showSpeed: false,
    cursorIndex: null,
    selectedPhase: null
  };

  const resolveIndices = (item, defaultEndSpan = null) => {
    let sIdx = 0;
    let eIdx = points.length - 1;
    const n = points.length;

    const sTime = item.startTimeSeconds ?? item.timeSeconds;
    const eTime = item.endTimeSeconds;
    if (typeof sTime === 'number' && typeof points[0]?.timeSeconds === 'number') {
      let fS = points.findIndex((p) => (p.timeSeconds ?? 0) >= sTime);
      sIdx = fS === -1 ? n - 1 : fS;
      if (typeof eTime === 'number') {
        let fE = points.findIndex((p) => (p.timeSeconds ?? 0) >= eTime);
        eIdx = fE === -1 ? n - 1 : fE;
      } else {
        eIdx = defaultEndSpan !== null ? Math.min(n - 1, sIdx + defaultEndSpan) : sIdx;
      }
      return { sIdx: Math.min(sIdx, eIdx), eIdx: Math.max(sIdx, eIdx) };
    }

    if (typeof item.startIndex === 'number') {
      const origN = (raw.originalPoints?.length && raw.originalPoints.length > 1)
        ? raw.originalPoints.length
        : (item.startIndex >= n ? item.startIndex + 1 : n);
      const sFrac = Math.max(0, Math.min(1, item.startIndex / Math.max(1, origN - 1)));
      const eRaw = item.endIndex ?? (defaultEndSpan !== null ? item.startIndex + defaultEndSpan : item.startIndex);
      const eFrac = Math.max(0, Math.min(1, eRaw / Math.max(1, origN - 1)));
      sIdx = Math.max(0, Math.min(n - 1, Math.round(sFrac * (n - 1))));
      eIdx = Math.max(sIdx, Math.min(n - 1, Math.round(eFrac * (n - 1))));
      return { sIdx, eIdx };
    }

    return { sIdx: 0, eIdx: n - 1 };
  };

  const findPhaseAtPoint = (pointIndex) => {
    if (pointIndex < 0 || pointIndex >= points.length) return null;
    const pt = points[pointIndex];
    const ptTime = pt?.timeSeconds;

    // 1. Dynamic maneuvers and roll inversions
    for (const m of dynamicManeuvers) {
      const { sIdx, eIdx } = resolveIndices(m, 4);
      const inRange = (pointIndex >= sIdx && pointIndex <= eIdx) ||
        (ptTime != null && m.startTimeSeconds != null && m.endTimeSeconds != null && ptTime >= m.startTimeSeconds && ptTime <= m.endTimeSeconds) ||
        (Math.abs(pointIndex - sIdx) <= 2 && Math.abs(pointIndex - eIdx) <= 2);
      if (inRange) {
        const title = formatManeuverTitle(m.type, m);
        const isInv = m.type === 'inversioni' || String(m.type).toLowerCase().includes('inversion');
        return {
          type: isInv ? 'roll' : 'maneuver',
          label: title,
          startIndex: sIdx,
          endIndex: eIdx,
          startTime: m.startTimeSeconds ?? '',
          endTime: m.endTimeSeconds ?? '',
          isResolvedIndex: true,
          raw: m
        };
      }
    }

    // 2. Thermals
    for (let idx = 0; idx < thermals.length; idx++) {
      const th = thermals[idx];
      const { sIdx, eIdx } = resolveIndices(th);
      const inRange = (pointIndex >= sIdx && pointIndex <= eIdx) ||
        (ptTime != null && th.startTimeSeconds != null && th.endTimeSeconds != null && ptTime >= th.startTimeSeconds && ptTime <= th.endTimeSeconds);
      if (inRange) {
        const tNum = th.thermalIndex || (idx + 1);
        const gain = typeof th.altGain === 'number' ? th.altGain : (typeof th.netGain === 'number' ? th.netGain : ((th.exitAlt || 0) - (th.entryAlt || 0)));
        return {
          type: 'thermal',
          label: `T${tNum}`,
          displayTitle: `Termica #${tNum}${gain ? ` (+${gain}m)` : ''}`,
          startIndex: sIdx,
          endIndex: eIdx,
          startTime: th.startTimeSeconds ?? '',
          endTime: th.endTimeSeconds ?? '',
          isResolvedIndex: true,
          gain,
          raw: th
        };
      }
    }

    // 3. Thermal probes
    for (let idx = 0; idx < thermalProbes.length; idx++) {
      const pr = thermalProbes[idx];
      const { sIdx, eIdx } = resolveIndices(pr, 4);
      const inRange = (pointIndex >= sIdx && pointIndex <= eIdx) ||
        (ptTime != null && pr.startTimeSeconds != null && pr.endTimeSeconds != null && ptTime >= pr.startTimeSeconds && ptTime <= pr.endTimeSeconds) ||
        (Math.abs(pointIndex - sIdx) <= 3);
      if (inRange) {
        return {
          type: 'probe',
          label: `Sondaggio #${idx + 1}`,
          startIndex: sIdx,
          endIndex: eIdx,
          startTime: pr.startTimeSeconds ?? '',
          endTime: pr.endTimeSeconds ?? '',
          isResolvedIndex: true,
          raw: pr
        };
      }
    }

    return null;
  };

  const selectPhase = (phase) => {
    if (!phase) return;
    const label = phase.label || 'Fase Volo';
    const type = phase.type || 'phase';

    let startIndex = 0;
    let endIndex = 0;

    if (phase.isResolvedIndex && typeof phase.startIndex === 'number') {
      startIndex = Math.max(0, Math.min(points.length - 1, phase.startIndex));
      endIndex = Math.max(startIndex, Math.min(points.length - 1, phase.endIndex ?? startIndex));
    } else {
      const startTimeSec = (phase.startTime != null && phase.startTime !== '') ? parseFloat(phase.startTime) : null;
      const endTimeSec = (phase.endTime != null && phase.endTime !== '') ? parseFloat(phase.endTime) : null;

      if (startTimeSec !== null && !isNaN(startTimeSec) && points.length > 0 && typeof points[0].timeSeconds === 'number') {
        let foundS = points.findIndex((p) => (p.timeSeconds ?? 0) >= startTimeSec);
        if (foundS === -1) foundS = points.length - 1;
        let foundE = foundS;
        if (endTimeSec !== null && !isNaN(endTimeSec)) {
          const matchE = points.findIndex((p) => (p.timeSeconds ?? 0) >= endTimeSec);
          foundE = matchE === -1 ? points.length - 1 : matchE;
        }
        startIndex = Math.min(foundS, foundE);
        endIndex = Math.max(foundS, foundE);
      } else {
        let rawS = parseInt(phase.startIndex ?? 0, 10);
        let rawE = parseInt(phase.endIndex ?? rawS, 10);
        const totalSource = (raw.originalPoints?.length || points.length);
        if (totalSource > points.length && rawS < totalSource) {
          const sFrac = Math.max(0, Math.min(1, rawS / (totalSource - 1)));
          const eFrac = Math.max(0, Math.min(1, rawE / (totalSource - 1)));
          startIndex = Math.max(0, Math.min(points.length - 1, Math.round(sFrac * (points.length - 1))));
          endIndex = Math.max(startIndex, Math.min(points.length - 1, Math.round(eFrac * (points.length - 1))));
        } else {
          startIndex = Math.max(0, Math.min(points.length - 1, rawS));
          endIndex = Math.max(startIndex, Math.min(points.length - 1, rawE));
        }
      }
    }

    state.selectedPhase = {
      type,
      label,
      startIndex,
      endIndex
    };

    // Trim/focus altimetric chart to the phase window
    const n = points.length;
    const phaseSpan = Math.max(2, endIndex - startIndex + 1);
    const spanFrac = phaseSpan / n;
    state.zoom = Math.min(5.0, Math.max(1.5, Math.round((1 / (spanFrac * 1.8)) * 10) / 10));
    const midIdx = (startIndex + endIndex) / 2;
    state.pan = Math.max(0.0, Math.min(1.0, midIdx / Math.max(1, n - 1)));

    if (phaseBadgeEl) {
      phaseBadgeEl.textContent = label;
      phaseBadgeEl.style.display = 'inline-flex';
    }
    if (resetPhaseBtn) {
      resetPhaseBtn.style.display = 'inline-flex';
    }

    if (flightDetailMapEngine && typeof flightDetailMapEngine.highlightFlightTrackRange === 'function') {
      flightDetailMapEngine.highlightFlightTrackRange(startIndex, endIndex, {
        label,
        type,
        trimToPhase: true
      });
    }

    renderSvg();
  };

  const clearPhaseSelection = () => {
    state.selectedPhase = null;
    state.zoom = 1.0;
    state.pan = 0.5;

    if (phaseBadgeEl) {
      phaseBadgeEl.textContent = '';
      phaseBadgeEl.style.display = 'none';
    }
    if (resetPhaseBtn) {
      resetPhaseBtn.style.display = 'none';
    }

    if (flightDetailMapEngine && typeof flightDetailMapEngine.highlightFlightTrackRange === 'function') {
      flightDetailMapEngine.highlightFlightTrackRange(null, null);
    }

    renderSvg();
  };

  if (resetPhaseBtn) {
    resetPhaseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearPhaseSelection();
    });
  }

  const updateHud = (pointIndex) => {
    if (pointIndex == null || pointIndex < 0 || pointIndex >= points.length) {
      if (hudTime) hudTime.textContent = '--:--';
      if (hudAlt) hudAlt.textContent = '-- m';
      if (hudVario) hudVario.textContent = '-- m/s';
      if (hudSpeed) hudSpeed.textContent = '-- km/h';
      if (hudEvent) hudEvent.textContent = '--';
      return;
    }

    const p = points[pointIndex];
    let timeStr = p.timeFormatted || p.time;
    if (!timeStr && p.timeSeconds != null) timeStr = formatSecondsToTime(p.timeSeconds);
    if (hudTime) hudTime.textContent = timeStr || '--:--';

    const altVal = Math.round(p.alt || 0);
    if (hudAlt) hudAlt.textContent = `${altVal} m`;

    const varioVal = Math.round(getPointVario(p, pointIndex, points) * 10) / 10;
    if (hudVario) {
      const sign = varioVal > 0 ? '+' : '';
      hudVario.textContent = `${sign}${varioVal.toFixed(1)} m/s`;
      if (varioVal >= 2.0) {
        hudVario.className = 'gm-telemetry-hud-val text-emerald-400 font-bold';
      } else if (varioVal >= 0.2) {
        hudVario.className = 'gm-telemetry-hud-val text-emerald-300';
      } else if (varioVal > -0.8) {
        hudVario.className = 'gm-telemetry-hud-val text-sky-300';
      } else if (varioVal > -2.0) {
        hudVario.className = 'gm-telemetry-hud-val text-amber-400';
      } else {
        hudVario.className = 'gm-telemetry-hud-val text-rose-400 font-bold';
      }
    }

    const speedVal = Math.round(getPointSpeed(p, pointIndex, points) * 10) / 10;
    if (hudSpeed) hudSpeed.textContent = `${speedVal.toFixed(1)} km/h`;

    let eventText = '--';
    const matched = findPhaseAtPoint(pointIndex);
    if (matched) {
      if (matched.type === 'thermal') {
        const gain = matched.gain;
        eventText = `${matched.label} (${gain ? `+${gain}m` : 'Termica'})`;
      } else if (matched.type === 'roll') {
        const pCount = matched.raw ? getPendolateCount(matched.raw) : null;
        eventText = `Inversione (${pCount ? `${pCount}P` : 'Rollio'})`;
      } else if (matched.type === 'probe') {
        eventText = 'Sondaggio 360°';
      } else {
        eventText = matched.label || '--';
      }
    }
    if (hudEvent) hudEvent.textContent = eventText;
  };

  const renderSvg = () => {
    const width = chartContainer.clientWidth || 600;
    const height = chartContainer.clientHeight || 220;

    const html = generateExpandedSvgChart(points, width, height, {
      zoom: state.zoom,
      pan: state.pan,
      showAlt: state.showAlt,
      showVario: state.showVario,
      showSpeed: state.showSpeed,
      cursorIndex: state.cursorIndex,
      selectedPhase: state.selectedPhase,
      thermals,
      thermalProbes,
      rollInversions,
      dynamicManeuvers
    });

    chartContainer.innerHTML = html;

    if (zoomLevelEl) {
      zoomLevelEl.textContent = `${state.zoom.toFixed(1)}x`;
    }

    if (navTrack && navHandle) {
      if (state.zoom > 1.0) {
        navTrack.style.display = 'block';
        const winFrac = 1 / state.zoom;
        const leftFrac = Math.max(0, Math.min(1 - winFrac, state.pan - winFrac / 2));
        navHandle.style.left = `${(leftFrac * 100).toFixed(1)}%`;
        navHandle.style.width = `${(winFrac * 100).toFixed(1)}%`;
        navTrack.setAttribute('aria-valuenow', Math.round(state.pan * 100));
      } else {
        navTrack.style.display = 'none';
      }
    }
  };

  const updateCursorGroup = (pointIndex) => {
    const cursorGroup = chartContainer.querySelector('#gm-chart-cursor-group');
    if (!cursorGroup) {
      renderSvg();
      return;
    }

    const n = points.length;
    let startIdx = 0;
    let endIdx = n - 1;
    if (state.zoom > 1.0) {
      const windowLen = Math.max(6, Math.round(n / state.zoom));
      const centerIdx = Math.round(state.pan * (n - 1));
      startIdx = Math.max(0, Math.min(n - windowLen, centerIdx - Math.floor(windowLen / 2)));
      endIdx = Math.min(n - 1, startIdx + windowLen - 1);
    }

    if (pointIndex < startIdx || pointIndex > endIdx) {
      cursorGroup.style.display = 'none';
      return;
    }

    const visibleN = endIdx - startIdx + 1;
    const vIdx = pointIndex - startIdx;
    const width = chartContainer.clientWidth || 600;
    const height = chartContainer.clientHeight || 220;
    const padTop = 30;
    const padBottom = 22;
    const chartHeight = height - padTop - padBottom;

    const alts = points.map((p) => (typeof p.alt === 'number' && !isNaN(p.alt) ? p.alt : 0));
    const minAlt = Math.min(...alts);
    const maxAlt = Math.max(...alts);
    const range = Math.max(1, maxAlt - minAlt);

    const p = points[pointIndex];
    const x = Math.round((vIdx / (visibleN - 1)) * width * 10) / 10;
    const y = Math.round((padTop + (1 - ((p.alt || 0) - minAlt) / range) * chartHeight) * 10) / 10;

    const line = cursorGroup.querySelector('#gm-chart-cursor-line');
    const dot = cursorGroup.querySelector('#gm-chart-cursor-dot');
    if (line) {
      line.setAttribute('x1', x);
      line.setAttribute('x2', x);
    }
    if (dot) {
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
    }
    cursorGroup.style.display = '';
  };

  const getPointIndexFromEvent = (e) => {
    const rect = chartContainer.getBoundingClientRect();
    const w = (rect && rect.width > 0) ? rect.width : (chartContainer.clientWidth || 600);
    const left = rect ? rect.left : 0;
    const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const relX = Math.max(0, Math.min(1, (clientX - left) / w));

    const n = points.length;
    if (state.zoom > 1.0) {
      const windowLen = Math.max(6, Math.round(n / state.zoom));
      const centerIdx = Math.round(state.pan * (n - 1));
      const startIdx = Math.max(0, Math.min(n - windowLen, centerIdx - Math.floor(windowLen / 2)));
      return Math.round(startIdx + relX * (windowLen - 1));
    }
    return Math.round(relX * (n - 1));
  };

  // 1. Channel toggles
  if (btnToggleAlt) {
    btnToggleAlt.addEventListener('click', () => {
      state.showAlt = !state.showAlt;
      btnToggleAlt.classList.toggle('active-alt', state.showAlt);
      btnToggleAlt.setAttribute('aria-pressed', state.showAlt ? 'true' : 'false');
      renderSvg();
    });
  }

  if (btnToggleVario) {
    btnToggleVario.addEventListener('click', () => {
      state.showVario = !state.showVario;
      btnToggleVario.classList.toggle('active-vario', state.showVario);
      btnToggleVario.setAttribute('aria-pressed', state.showVario ? 'true' : 'false');
      renderSvg();
    });
  }

  if (btnToggleSpeed) {
    btnToggleSpeed.addEventListener('click', () => {
      state.showSpeed = !state.showSpeed;
      btnToggleSpeed.classList.toggle('active-speed', state.showSpeed);
      btnToggleSpeed.setAttribute('aria-pressed', state.showSpeed ? 'true' : 'false');
      renderSvg();
    });
  }

  // 2. Zoom controls
  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => {
      state.zoom = Math.min(6.0, Math.round((state.zoom + 0.5) * 10) / 10);
      renderSvg();
    });
  }

  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => {
      state.zoom = Math.max(1.0, Math.round((state.zoom - 0.5) * 10) / 10);
      renderSvg();
    });
  }

  if (btnZoomReset) {
    btnZoomReset.addEventListener('click', () => {
      state.zoom = 1.0;
      state.pan = 0.5;
      renderSvg();
    });
  }

  // 3. Pointer, Scrubber & Pan Dragging on chart container
  let isPointerDown = false;
  let isPanMode = false;
  let startX = 0;
  let startY = 0;
  let pointerDownTime = 0;
  let hasMoved = false;
  let startPan = 0.5;
  let panStartX = 0;
  let lastSelectionTime = 0;
  let longPressTimer = null;

  const handleChartPointSelection = (e) => {
    if (Date.now() - lastSelectionTime < 250) return;
    const idx = getPointIndexFromEvent(e);
    const matched = findPhaseAtPoint(idx);
    if (matched) {
      lastSelectionTime = Date.now();
      selectPhase(matched);
    } else if (state.selectedPhase) {
      lastSelectionTime = Date.now();
      clearPhaseSelection();
    }
  };

  chartContainer.addEventListener('pointerdown', (e) => {
    isPointerDown = true;
    isPanMode = false;
    hasMoved = false;
    startX = e.clientX ?? 0;
    startY = e.clientY ?? 0;
    pointerDownTime = Date.now();
    startPan = state.pan;
    panStartX = startX;

    if (longPressTimer) {
      clearTimeout(longPressTimer);
    }
    longPressTimer = setTimeout(() => {
      if (isPointerDown && !hasMoved) {
        isPanMode = true;
        panStartX = startX;
        startPan = state.pan;
        chartContainer.style.cursor = 'grab';
      }
    }, 350);

    if (typeof chartContainer.setPointerCapture === 'function') {
      try { chartContainer.setPointerCapture(e.pointerId); } catch (_) {}
    }

    const idx = getPointIndexFromEvent(e);
    state.cursorIndex = idx;
    updateHud(idx);
    updateCursorGroup(idx);
    if (flightDetailMapEngine && typeof flightDetailMapEngine.setFlightTrackCursor === 'function') {
      const pt = points[idx];
      flightDetailMapEngine.setFlightTrackCursor(idx, points.length, pt?.timeSeconds);
    }
  });

  chartContainer.addEventListener('pointermove', (e) => {
    const idx = getPointIndexFromEvent(e);

    if (isPointerDown) {
      const curX = e.clientX ?? 0;
      const curY = e.clientY ?? 0;
      const deltaX = Math.abs(curX - startX);
      const deltaY = Math.abs(curY - startY);

      if (deltaX > 6 || deltaY > 6) {
        hasMoved = true;
      }

      if (!isPanMode) {
        // Short-press movement cancels the long-press timer -> acts purely as scrubber
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }

        // Update scrubber cursor and HUD without changing pan window
        state.cursorIndex = idx;
        updateHud(idx);
        updateCursorGroup(idx);
        if (flightDetailMapEngine && typeof flightDetailMapEngine.setFlightTrackCursor === 'function') {
          const pt = points[idx];
          flightDetailMapEngine.setFlightTrackCursor(idx, points.length, pt?.timeSeconds);
        }
        return;
      }

      // Long-press pan mode active
      if (state.zoom > 1.0) {
        const rect = chartContainer.getBoundingClientRect();
        const w = (rect && rect.width > 0) ? rect.width : (chartContainer.clientWidth || 600);
        const panDelta = -((curX - panStartX) / w) * (1 / state.zoom);
        state.pan = Math.max(0.0, Math.min(1.0, startPan + panDelta));
        state.cursorIndex = idx;
        updateHud(idx);
        renderSvg();
        if (flightDetailMapEngine && typeof flightDetailMapEngine.setFlightTrackCursor === 'function') {
          const pt = points[idx];
          flightDetailMapEngine.setFlightTrackCursor(idx, points.length, pt?.timeSeconds);
        }
        return;
      }
    } else {
      const hoveredPhase = findPhaseAtPoint(idx);
      if (hoveredPhase) {
        chartContainer.style.cursor = 'pointer';
        chartContainer.title = `Tocca per selezionare ${hoveredPhase.label || 'manovra'}`;
      } else {
        chartContainer.style.cursor = 'crosshair';
        chartContainer.title = '';
      }
    }

    state.cursorIndex = idx;
    updateHud(idx);
    updateCursorGroup(idx);
    if (flightDetailMapEngine && typeof flightDetailMapEngine.setFlightTrackCursor === 'function') {
      const pt = points[idx];
      flightDetailMapEngine.setFlightTrackCursor(idx, points.length, pt?.timeSeconds);
    }
  });

  const onPointerUp = (e) => {
    if (!isPointerDown) return;
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    const wasPanMode = isPanMode;
    const didMove = hasMoved;
    const elapsed = Date.now() - pointerDownTime;

    isPointerDown = false;
    isPanMode = false;
    hasMoved = false;

    if (typeof chartContainer.releasePointerCapture === 'function') {
      try { chartContainer.releasePointerCapture(e.pointerId); } catch (_) {}
    }

    // Clean tap: short click without moving and without entering pan mode
    if (!didMove && !wasPanMode && elapsed < 350) {
      handleChartPointSelection(e);
    }
  };

  chartContainer.addEventListener('pointerup', onPointerUp);
  chartContainer.addEventListener('pointercancel', onPointerUp);

  chartContainer.addEventListener('pointerleave', () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    chartContainer.style.cursor = '';
    chartContainer.title = '';
    if (!isPointerDown) {
      state.cursorIndex = null;
      const cursorGroup = chartContainer.querySelector('#gm-chart-cursor-group');
      if (cursorGroup) cursorGroup.style.display = 'none';
      if (flightDetailMapEngine && typeof flightDetailMapEngine.setFlightTrackCursor === 'function') {
        flightDetailMapEngine.setFlightTrackCursor(null);
      }
    }
  });

  // 4. Scrub bar / navigator dragging
  if (navTrack) {
    let isNavDragging = false;

    const handleNavEvent = (e) => {
      const rect = navTrack.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const frac = Math.max(0.0, Math.min(1.0, (clientX - rect.left) / rect.width));
      state.pan = frac;
      renderSvg();
    };

    navTrack.addEventListener('pointerdown', (e) => {
      isNavDragging = true;
      if (typeof navTrack.setPointerCapture === 'function') {
        try { navTrack.setPointerCapture(e.pointerId); } catch (_) {}
      }
      handleNavEvent(e);
    });

    navTrack.addEventListener('pointermove', (e) => {
      if (isNavDragging) {
        handleNavEvent(e);
      }
    });

    const onNavUp = (e) => {
      if (!isNavDragging) return;
      isNavDragging = false;
      if (typeof navTrack.releasePointerCapture === 'function') {
        try { navTrack.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };

    navTrack.addEventListener('pointerup', onNavUp);
    navTrack.addEventListener('pointercancel', onNavUp);
  }

  // 5. Click delegation for flight phases on chart and cards
  chartContainer.addEventListener('click', (e) => {
    const phaseTarget = e.target.closest('[data-phase-type]');
    if (phaseTarget) {
      const type = phaseTarget.getAttribute('data-phase-type');
      const label = phaseTarget.getAttribute('data-phase-label');
      const startIndex = parseInt(phaseTarget.getAttribute('data-start-index'), 10);
      const endIndex = parseInt(phaseTarget.getAttribute('data-end-index'), 10);
      const startTime = phaseTarget.getAttribute('data-start-time');
      const endTime = phaseTarget.getAttribute('data-end-time');
      selectPhase({ type, label, startIndex, endIndex, startTime, endTime });
    } else {
      handleChartPointSelection(e);
    }
  });

  overlayEl.addEventListener('click', (e) => {
    const cardTarget = e.target.closest('[data-action="select-phase"]');
    if (cardTarget) {
      const type = cardTarget.getAttribute('data-phase-type');
      const label = cardTarget.getAttribute('data-phase-label');
      const startIndex = parseInt(cardTarget.getAttribute('data-start-index'), 10);
      const endIndex = parseInt(cardTarget.getAttribute('data-end-index'), 10);
      const startTime = cardTarget.getAttribute('data-start-time');
      const endTime = cardTarget.getAttribute('data-end-time');
      selectPhase({ type, label, startIndex, endIndex, startTime, endTime });
      if (mapCanvasEl && typeof mapCanvasEl.scrollIntoView === 'function') {
        try { mapCanvasEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) {}
      }
    }
  });

  // 6. Initialize HUD with highest altitude or starting point
  const alts = points.map((p) => (typeof p.alt === 'number' && !isNaN(p.alt) ? p.alt : 0));
  const maxAlt = Math.max(...alts);
  const maxIdx = alts.indexOf(maxAlt);
  const initialPointIdx = maxIdx >= 0 ? maxIdx : 0;
  updateHud(initialPointIdx);
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
    console.warn('[FlightDetailView] Database error retrieving flight:', err);
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

      // Strict Anti-Sycophancy & Real Points Only:
      // Never fabricate or synthesize fake track points when GPS coordinates were not recorded.
      const decimatedPoints = Array.isArray(cachedFlight.decimatedPoints)
        ? cachedFlight.decimatedPoints
        : (Array.isArray(cachedFlight.points) ? cachedFlight.points : []);

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
    console.warn('[FlightDetailView] Flight not found:', flightId);
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
  const html = renderFlightDetailHtml(bundle, options);

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
  overlayEl.setAttribute('data-flight-id', String(bundle.meta.id || bundle.meta.flightId || flightId));
  overlayEl.__cleanupOverlay = closeFlightDetailView;
  activeDetailOverlay = overlayEl;

  // 0. Attach interactive telemetry chart controls (zoom, pan, vario, speed, HUD)
  attachInteractiveFlightChart(overlayEl, bundle);

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
      console.error('[FlightDetailView] Error saving notes:', err);
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
        console.error('[FlightDetailView] Error exporting IGC:', err);
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
          openFlightDetailView(flightId, { store: targetStore, onDelete: options.onDelete });
        }
      });
    });
  });

  // 8. Delete Flight Handler (delegates to LogbookView 5s Undo Grace Window or direct DB deletion)
  const deleteBtn = overlayEl.querySelector('#btn-delete-from-detail');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async (e) => {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      closeFlightDetailView();
      if (typeof options.onDelete === 'function') {
        options.onDelete(flightId);
      } else {
        try {
          await logbookManager.deleteFlight(flightId);
          if (targetStore && typeof targetStore.getState === 'function' && typeof targetStore.setState === 'function') {
            const currentFlights = targetStore.getState().flights || [];
            targetStore.setState({
              flights: currentFlights.filter((f) => f && String(f.id || f.flightId) !== String(flightId))
            });
          }
        } catch (err) {
          console.error('[FlightDetailView] Error deleting flight:', err);
        }
      }
    });
  }

  // 9. Focus first interactive element for keyboard accessibility
  if (backBtn && typeof backBtn.focus === 'function') {
    backBtn.focus();
  }
}

/**
 * Backward compatibility alias for openFlightDetailView.
 */
export const openFlightDetailSheet = openFlightDetailView;
export const closeFlightDetailSheet = closeFlightDetailView;
