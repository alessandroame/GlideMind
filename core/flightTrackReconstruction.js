/**
 * GlideMind - Flight Track Reconstruction & Synthetic IGC Generator (Headless Core)
 * 
 * Reconstructs continuous, realistic GPS flight track points and generates valid
 * FAI IGC B-record logs from rich telemetry metadata (thermals, max vario/alt waypoints,
 * phases, and takeoff/landing coordinates) when raw GPS point arrays were omitted
 * from legacy ParaMeteo backups.
 * 
 * Compliant with Shift-Left Quality Gates: Pure Node.js headless core module
 * with zero DOM, window, or document dependencies.
 */

import { DEFAULT_COMPRENSORI, parseCoordinates } from './comprensorio.js';

/**
 * Converts decimal degrees into standard FAI IGC DDMMmmmN / DDDMMmmmE format.
 * 
 * Example Lat: 45.3789667 -> 45 + 22.738002' -> 4522738N
 * Example Lon: 7.3568167 -> 007 + 21.409002' -> 00721409E
 * 
 * @param {number} decimalVal
 * @param {'lat'|'lon'} type
 * @returns {string}
 */
export function formatIgcCoord(decimalVal, type) {
  const isLat = type === 'lat';
  const hemi = isLat ? (decimalVal >= 0 ? 'N' : 'S') : (decimalVal >= 0 ? 'E' : 'W');
  const abs = Math.abs(Number(decimalVal) || 0);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  const minInt = Math.floor(min);
  const minDec = Math.min(999, Math.round((min - minInt) * 1000));
  const degStr = String(deg).padStart(isLat ? 2 : 3, '0');
  const minStr = String(minInt).padStart(2, '0');
  const decStr = String(minDec).padStart(3, '0');
  return `${degStr}${minStr}${decStr}${hemi}`;
}

/**
 * Parses a HH:MM or HH:MM:SS time string into total seconds from midnight.
 * @param {string} timeStr
 * @returns {number|null}
 */
function parseTimeStringToSeconds(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.trim().split(':').map(Number);
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
  }
  return null;
}

/**
 * Formats integer seconds into standard HHMMSS string for IGC B-records.
 * @param {number} totalSec
 * @returns {string}
 */
function formatSecondsToHhmmss(totalSec) {
  const s = Math.max(0, Math.floor(totalSec)) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}${String(sec).padStart(2, '0')}`;
}

/**
 * Resolves takeoff and landing physical coordinates from flight object,
 * sub-properties or the fallback comprensori catalog.
 * 
 * @param {Object} flight
 * @param {Array<Object>} [catalog=DEFAULT_COMPRENSORI]
 * @returns {{
 *   takeoff: { lat: number, lon: number },
 *   landing: { lat: number, lon: number },
 *   takeoffAlt: number,
 *   landingAlt: number
 * }}
 */
function resolveFlightAnchors(flight, catalog = DEFAULT_COMPRENSORI) {
  let takeoffLat = flight.takeoffCoords?.lat ?? flight.takeoffLat ?? null;
  let takeoffLon = flight.takeoffCoords?.lon ?? flight.takeoffCoords?.lng ?? flight.takeoffLon ?? null;
  let landingLat = flight.landingCoords?.lat ?? flight.landingLat ?? null;
  let landingLon = flight.landingCoords?.lon ?? flight.landingCoords?.lng ?? flight.landingLon ?? null;

  let takeoffAlt = Number(flight.stats?.takeoffAltitude ?? flight.takeoffAltMsl ?? flight.takeoffAlt ?? 0);
  let landingAlt = Number(flight.stats?.landingAltitude ?? flight.landingAltMsl ?? flight.landingAlt ?? 0);

  // If coordinates are missing, resolve from site catalog
  if (takeoffLat == null || takeoffLon == null || landingLat == null || landingLon == null) {
    const siteQuery = (flight.siteName || flight.site || flight.takeoffLocationName || '').toLowerCase();
    const match = Array.isArray(catalog) ? catalog.find(c => {
      const cName = (c.name || '').toLowerCase();
      return cName.includes(siteQuery) || siteQuery.includes(cName);
    }) : null;

    if (match) {
      const primaryTakeoff = match.takeoffs?.[0];
      const primaryLanding = match.landings?.[0];
      const parsedTO = primaryTakeoff ? parseCoordinates(primaryTakeoff.coordinates) : null;
      const parsedLZ = primaryLanding ? parseCoordinates(primaryLanding.coordinates) : null;

      if (takeoffLat == null && parsedTO) {
        takeoffLat = parsedTO.lat;
        takeoffLon = parsedTO.lon;
      }
      if (landingLat == null && parsedLZ) {
        landingLat = parsedLZ.lat;
        landingLon = parsedLZ.lon;
      }
      if (takeoffAlt === 0 && primaryTakeoff?.altitude) {
        takeoffAlt = primaryTakeoff.altitude;
      }
      if (landingAlt === 0 && primaryLanding?.altitude) {
        landingAlt = primaryLanding.altitude;
      }
    }
  }

  // Final fallback defaults (standard sub-alpine site)
  takeoffLat = takeoffLat ?? 45.3789667;
  takeoffLon = takeoffLon ?? 7.3568167;
  landingLat = landingLat ?? (takeoffLat - 0.0139);
  landingLon = landingLon ?? (takeoffLon - 0.0256);

  takeoffAlt = takeoffAlt > 0 ? takeoffAlt : 1200;
  landingAlt = landingAlt > 0 ? landingAlt : Math.max(200, takeoffAlt - 600);

  return {
    takeoff: { lat: Number(takeoffLat), lon: Number(takeoffLon) },
    landing: { lat: Number(landingLat), lon: Number(landingLon) },
    takeoffAlt,
    landingAlt
  };
}

/**
 * Reconstructs continuous, realistic flight track points from flight telemetry metadata.
 * Generates faithful altitude curves and spatial trajectories reflecting thermals,
 * ridge soaring, transitions, and landing flare.
 * 
 * @param {Object} flight - Flight meta or bundle object
 * @param {Object|null} [raw=null] - Optional raw record
 * @param {Object} [options={}] - Options (e.g. spotsCatalog)
 * @returns {{
 *   points: Array<Object>,
 *   rawIgc: string,
 *   isReconstructed: boolean
 * }}
 */
export function reconstructTrackFromFlightMetadata(flight, raw = null, options = {}) {
  if (!flight || typeof flight !== 'object') {
    throw new Error('[reconstructTrackFromFlightMetadata] Invalid flight record');
  }

  const catalog = options.spotsCatalog || DEFAULT_COMPRENSORI;
  const { takeoff, landing, takeoffAlt, landingAlt } = resolveFlightAnchors(flight, catalog);

  const stats = flight.stats || raw?.stats || {};
  const maxAlt = Number(stats.maxAltitude ?? flight.maxAltMsl ?? flight.maxAltitude ?? (takeoffAlt + (stats.maxGainMeters || 260)));
  const minAlt = Number(stats.minAltitude ?? flight.minAltMsl ?? flight.minAltitude ?? landingAlt);

  // Determine flight duration in seconds
  let durationSec = Number(flight.durationSeconds || raw?.durationSeconds || 0);
  if (!durationSec || durationSec <= 0) {
    const mins = Number(flight.durationMinutes || raw?.durationMinutes || 30);
    durationSec = Math.max(300, mins * 60);
  }

  // Determine starting timestamp (local seconds from midnight)
  const timeline = flight.telemetry?.phases?.timeline || raw?.telemetry?.phases?.timeline || [];
  const startSec = timeline[0]?.startTimeSeconds
    ?? parseTimeStringToSeconds(flight.takeoffTime)
    ?? 43200; // 12:00 default

  const thermals = flight.telemetry?.thermals || raw?.telemetry?.thermals || [];
  const maxAltPoint = flight.maxAltPoint || raw?.telemetry?.maxAltPoint || null;
  const maxVarioPoint = flight.maxVarioPoint || raw?.telemetry?.maxVarioPoint || null;

  // Decide sampling frequency: 1 sample every 2-4 seconds (capped at 750 points for optimal LTTB decimation)
  const totalPoints = Math.min(800, Math.max(90, Math.round(durationSec / 3)));
  const points = new Array(totalPoints);

  for (let i = 0; i < totalPoints; i++) {
    const frac = i / (totalPoints - 1);
    const relSec = frac * durationSec;
    const tSec = Math.round(startSec + relSec);

    // 1. Check if current moment falls within a recorded thermal
    let currentThermal = null;
    for (const th of thermals) {
      const thStart = th.startTimeSeconds ? (th.startTimeSeconds - startSec) : null;
      const thEnd = th.endTimeSeconds ? (th.endTimeSeconds - startSec) : null;
      if (thStart != null && thEnd != null && relSec >= thStart && relSec <= thEnd) {
        currentThermal = { ...th, thStart, thEnd };
        break;
      }
    }

    let lat, lon, alt;

    if (currentThermal && currentThermal.centerCoords) {
      // CIRCLING IN THERMAL
      const thSpan = Math.max(1, currentThermal.thEnd - currentThermal.thStart);
      const thFrac = (relSec - currentThermal.thStart) / thSpan;
      const turns = Number(currentThermal.turnCount) || 4;
      const dir = String(currentThermal.turnDirection).toUpperCase() === 'CCW' ? -1 : 1;
      const angle = dir * turns * 2 * Math.PI * thFrac;
      const rMeters = Number(currentThermal.meanRadiusMeters) || 55;
      const rDeg = rMeters / 111320;

      const cLat = currentThermal.centerCoords.lat;
      const cLon = currentThermal.centerCoords.lon;

      lat = cLat + Math.sin(angle) * rDeg;
      lon = cLon + Math.cos(angle) * (rDeg / Math.max(0.2, Math.cos(cLat * Math.PI / 180)));

      const entryA = currentThermal.entryAlt || takeoffAlt;
      const exitA = currentThermal.exitAlt || (entryA + (currentThermal.altGain || 100));
      // Smooth sinusoidal ascent inside thermal
      alt = Math.round(entryA + (exitA - entryA) * (1 - Math.cos(thFrac * Math.PI)) / 2);
    } else {
      // RIDGE SOARING, TRANSITION, OR GLIDE TO LANDING
      if (frac < 0.60) {
        // Phase 1: Ridge soaring near takeoff slope
        const pFrac = frac / 0.60;
        const turns = 6;
        const angle = pFrac * Math.PI * turns;

        // Vector towards landing
        const forwardVectorFrac = pFrac * 0.25;
        const baseLat = takeoff.lat + (landing.lat - takeoff.lat) * forwardVectorFrac;
        const baseLon = takeoff.lon + (landing.lon - takeoff.lon) * forwardVectorFrac;

        // S-turns along the mountain ridge
        const ridgeOscillationLat = Math.sin(angle) * 0.0012;
        const ridgeOscillationLon = Math.cos(angle) * 0.0016;

        lat = baseLat + ridgeOscillationLat;
        lon = baseLon + ridgeOscillationLon;

        // Progressive climb up to maxAlt (or apex)
        const climbWeight = Math.sin(pFrac * Math.PI * 0.5);
        alt = Math.round(takeoffAlt + (maxAlt - takeoffAlt) * climbWeight);
      } else {
        // Phase 2: Final glide & descent to landing field
        const gFrac = (frac - 0.60) / 0.40;
        const exitLat = takeoff.lat + (landing.lat - takeoff.lat) * 0.25;
        const exitLon = takeoff.lon + (landing.lon - takeoff.lon) * 0.25;

        // Final approach S-turns damping out on short final
        const approachTurns = Math.sin(gFrac * Math.PI * 4) * 0.0007 * (1 - gFrac);
        lat = exitLat + (landing.lat - exitLat) * gFrac + approachTurns * 0.5;
        lon = exitLon + (landing.lon - exitLon) * gFrac + approachTurns;

        // Steady aerodynamic descent from ceiling to landing touchdown
        alt = Math.round(maxAlt - (maxAlt - landingAlt) * Math.pow(gFrac, 1.05));
      }
    }

    // Direct waypoint snapping if very close to peak alt or max vario
    if (maxAltPoint && Math.abs(relSec - (maxAltPoint.timeSeconds - startSec)) < (durationSec / totalPoints)) {
      alt = maxAltPoint.alt || maxAlt;
      if (maxAltPoint.lat && maxAltPoint.lon) {
        lat = maxAltPoint.lat;
        lon = maxAltPoint.lon;
      }
    }

    // Safety bounds clamping
    alt = Math.max(minAlt, Math.min(maxAlt + 10, alt));

    points[i] = {
      timeSeconds: tSec,
      timeFormatted: formatSecondsToHhmmss(tSec).replace(/(\d{2})(\d{2})(\d{2})/, '$1:$2:$3'),
      lat: Math.round(lat * 10000000) / 10000000,
      lon: Math.round(lon * 10000000) / 10000000,
      alt,
      pressAlt: alt,
      gpsAlt: alt
    };
  }

  // 2. Compute variometer vertical speed and ground speed across points
  for (let i = 0; i < totalPoints; i++) {
    if (i === 0) {
      points[i].vario = 0;
      points[i].speedKmh = 0;
    } else {
      const prev = points[i - 1];
      const dt = Math.max(1, points[i].timeSeconds - prev.timeSeconds);
      const dAlt = points[i].alt - prev.alt;
      points[i].vario = Math.round((dAlt / dt) * 10) / 10;

      // Approximate ground speed
      const dLat = (points[i].lat - prev.lat) * 111320;
      const dLon = (points[i].lon - prev.lon) * 111320 * Math.cos(points[i].lat * Math.PI / 180);
      const distM = Math.sqrt(dLat * dLat + dLon * dLon);
      points[i].speedKmh = Math.round((distM / dt) * 3.6 * 10) / 10;
    }
  }

  // 3. Generate standard FAI IGC B-records text
  const rawIgc = generateIgcFromPoints(points, flight);

  return {
    points,
    rawIgc,
    isReconstructed: true
  };
}

/**
 * Generates standard FAI IGC text compliant with the FAI Sporting Code.
 * 
 * @param {Array<Object>} points
 * @param {Object} [meta={}]
 * @returns {string}
 */
export function generateIgcFromPoints(points, meta = {}) {
  if (!Array.isArray(points) || points.length === 0) {
    return '';
  }

  // Format date: YYYY-MM-DD -> DDMMYY
  let dateCode = '010126';
  const dStr = meta.date || meta.utcDate || '';
  if (dStr) {
    const parts = dStr.split('-');
    if (parts.length === 3) {
      const yy = parts[0].slice(-2);
      const mm = parts[1].padStart(2, '0');
      const dd = parts[2].padStart(2, '0');
      dateCode = `${dd}${mm}${yy}`;
    }
  }

  const pilot = String(meta.pilot || 'Alessandro Amé').trim() || 'Pilota';
  const glider = String(meta.glider || meta.gear?.glider || 'Parapendio').trim();

  const lines = [
    'AXXXGLIDEMIND',
    `HFDTE${dateCode}`,
    'HFFTYFRTYPE:GLIDEMIND',
    `HFPLTPILOT:${pilot}`,
    `HFGTYGLIDERTYPE:${glider}`,
    'I013638FXA'
  ];

  for (const p of points) {
    const timeHms = formatSecondsToHhmmss(p.timeSeconds || 0);
    const latStr = formatIgcCoord(p.lat, 'lat');
    const lonStr = formatIgcCoord(p.lon, 'lon');
    const pressAltStr = String(Math.max(0, Math.min(99999, Math.round(p.pressAlt ?? p.alt ?? 0)))).padStart(5, '0');
    const gpsAltStr = String(Math.max(0, Math.min(99999, Math.round(p.gpsAlt ?? p.alt ?? 0)))).padStart(5, '0');

    lines.push(`B${timeHms}${latStr}${lonStr}A${pressAltStr}${gpsAltStr}`);
  }

  return lines.join('\r\n');
}
