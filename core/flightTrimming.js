/**
 * Flight Track Trimming & Telemetry Recalculation Engine for GlideMind (Headless Core)
 * 
 * Provides:
 *  - Deterministic automatic takeoff and landing trim point detection.
 *  - Non-destructive track point slicing (preserves original raw IGC and coordinates).
 *  - Complete recalculation of kinematic statistics, elevation gain, duration,
 *    sparklines, thermals, flight phases, and maneuvers on the trimmed track.
 * 
 * Strictly headless: zero DOM, window, or document dependencies (Gate 1 & Gate 2).
 */

import { computeDistanceKm } from './geoSpatialMath.js';
import { smoothAltitudes } from './flightManeuvers.js';
import { analyzeFlightTelemetry, lttbDecimate } from './flightTelemetry.js';
import { generateSparklinePoints } from './logbookDb.js';

/**
 * Automatically detects the true takeoff and landing indices in a tracklog
 * by analyzing ground speed, horizontal displacement, and altitude delta.
 * 
 * @param {Array<Object>} points Chronologically sorted track points { lat, lon, alt, timeSeconds, speedKmh }
 * @returns {{
 *   takeoffIndex: number,
 *   landingIndex: number,
 *   originalCount: number,
 *   trimmedCount: number,
 *   canTrim: boolean,
 *   isTrimmed: boolean
 * }}
 */
export function detectTrimPoints(points) {
  if (!Array.isArray(points) || points.length < 15) {
    const len = points ? points.length : 0;
    return {
      takeoffIndex: 0,
      landingIndex: Math.max(0, len - 1),
      originalCount: len,
      trimmedCount: len,
      canTrim: false,
      isTrimmed: false
    };
  }

  const n = points.length;

  // 1. Calculate ground speeds between consecutive points
  const speeds = new Array(n);
  speeds[0] = 0;
  for (let i = 1; i < n; i++) {
    const dt = Math.max(0.5, (points[i].timeSeconds ?? i) - (points[i - 1].timeSeconds ?? (i - 1)));
    const dKm = computeDistanceKm(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    speeds[i] = (dKm / (dt / 3600));
  }

  // 2. Identify Takeoff Point (Inflation & launch acceleration)
  let takeoffIdx = 0;
  for (let i = 0; i < n - 5; i++) {
    const s0 = speeds[i];
    const s1 = speeds[i + 1];
    const s2 = speeds[i + 2];
    const altDelta = Math.abs((points[i + 3].alt || 0) - (points[0].alt || 0));
    const distFromStart = computeDistanceKm(points[0].lat, points[0].lon, points[i].lat, points[i].lon) * 1000;

    // Sustained flight speed >= 11-12 km/h over 3 consecutive points OR displacement > 45m OR alt delta > 15m
    if ((s0 >= 11 && s1 >= 12 && s2 >= 12) || (distFromStart > 45 && s1 >= 10) || altDelta > 15) {
      takeoffIdx = Math.max(0, i - 2); // Retain 2 points of run-up / inflation
      break;
    }
  }

  // 3. Identify Landing Point (Touchdown flare)
  let landingIdx = n - 1;
  const minLandingIdx = Math.max(takeoffIdx + 10, 5);
  for (let i = n - 1; i >= minLandingIdx; i--) {
    const s0 = speeds[i];
    const sPrev1 = speeds[i - 1];
    const sPrev2 = speeds[i - 2];
    const altDeltaFromEnd = Math.abs((points[i].alt || 0) - (points[n - 1].alt || 0));
    const distFromEnd = computeDistanceKm(points[i].lat, points[i].lon, points[n - 1].lat, points[n - 1].lon) * 1000;

    // Sustained flight speed before touchdown >= 11-12 km/h OR displacement > 45m OR altitude delta > 15m
    if ((s0 >= 11 && sPrev1 >= 12 && sPrev2 >= 12) || (distFromEnd > 45 && sPrev1 >= 10) || altDeltaFromEnd > 15) {
      landingIdx = Math.min(n - 1, i + 2); // Retain 2 points of touchdown flare
      break;
    }
  }

  const canTrim = (landingIdx - takeoffIdx) >= 5 && (takeoffIdx > 0 || landingIdx < n - 1);
  const trimmedCount = Math.max(0, landingIdx - takeoffIdx + 1);

  return {
    takeoffIndex: takeoffIdx,
    landingIndex: landingIdx,
    originalCount: n,
    trimmedCount,
    canTrim,
    isTrimmed: canTrim
  };
}

/**
 * Slices track points array between valid takeoff and landing indices.
 * 
 * @param {Array<Object>} points Original track points
 * @param {number} takeoffIndex 0-based takeoff start index
 * @param {number} landingIndex 0-based landing end index
 * @returns {Array<Object>} Sliced array of points
 */
export function applyTrackTrim(points, takeoffIndex, landingIndex) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const n = points.length;
  const start = Math.max(0, Math.min(n - 2, Math.floor(takeoffIndex || 0)));
  const end = Math.max(start + 1, Math.min(n - 1, Math.floor(landingIndex ?? (n - 1))));
  return points.slice(start, end + 1);
}

/**
 * Non-destructively recalculates a flight bundle (meta + raw) after trimming.
 * Recomputes durations, takeoff/landing timestamps, MSL altitudes, max climb/sink,
 * distance, sparklines, thermals, flight phases, and maneuvers.
 * 
 * @param {{ meta: Object, raw: Object }} bundle Original flight bundle
 * @param {number} takeoffIndex Desired takeoff start index in current raw points
 * @param {number} landingIndex Desired landing end index in current raw points
 * @param {Object} [options={}] Additional configuration options
 * @returns {{ meta: Object, raw: Object, trimmedPoints: Array<Object> }}
 */
export function recalculateFlightAfterTrim(bundle, takeoffIndex, landingIndex, options = {}) {
  if (!bundle || typeof bundle !== 'object') {
    throw new Error('[recalculateFlightAfterTrim] Invalid flight bundle provided');
  }

  const meta = bundle.meta ? { ...bundle.meta } : {};
  const raw = bundle.raw ? { ...bundle.raw } : {};

  // Extract source points: prefer raw.originalPoints if already trimmed, otherwise raw.decimatedPoints or raw.points
  const sourcePoints = Array.isArray(raw.originalPoints) && raw.originalPoints.length > 0
    ? raw.originalPoints
    : (Array.isArray(raw.decimatedPoints) && raw.decimatedPoints.length > 0
      ? raw.decimatedPoints
      : (Array.isArray(raw.points) ? raw.points : (bundle.trackPoints || [])));

  if (!Array.isArray(sourcePoints) || sourcePoints.length < 5) {
    throw new Error('[recalculateFlightAfterTrim] Track contains insufficient points for trimming (min 5 points)');
  }

  const n = sourcePoints.length;
  const validTakeoffIdx = Math.max(0, Math.min(n - 2, Math.floor(takeoffIndex || 0)));
  const validLandingIdx = Math.max(validTakeoffIdx + 1, Math.min(n - 1, Math.floor(landingIndex ?? (n - 1))));

  const trimmedPoints = sourcePoints.slice(validTakeoffIdx, validLandingIdx + 1);
  if (trimmedPoints.length < 2) {
    throw new Error('[recalculateFlightAfterTrim] Trimmed slice resulted in less than 2 points');
  }

  // Preserve untrimmed original points in raw record for cheap takeover / reset
  if (!raw.originalPoints) {
    raw.originalPoints = sourcePoints;
  }

  const firstPt = trimmedPoints[0];
  const lastPt = trimmedPoints[trimmedPoints.length - 1];

  // 1. Durations and Timestamps
  const firstTimeSec = firstPt.timeSeconds ?? 0;
  const lastTimeSec = lastPt.timeSeconds ?? (firstTimeSec + 60);
  const durationSec = Math.max(1, lastTimeSec - firstTimeSec);
  const durationMin = Math.max(1, Math.round(durationSec / 60));

  const formatHhMm = (sec) => {
    const s = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const takeoffTime = firstPt.timeFormatted ? firstPt.timeFormatted.substring(0, 5) : formatHhMm(firstTimeSec);
  const landingTime = lastPt.timeFormatted ? lastPt.timeFormatted.substring(0, 5) : formatHhMm(lastTimeSec);

  // 2. Kinematics, Min/Max Altitudes, Distance
  let minAlt = firstPt.alt || 0;
  let maxAlt = firstPt.alt || 0;
  let totalDistKm = 0;
  let maxClimbRate = 0;
  let maxSinkRate = 0;
  const smoothedAlts = smoothAltitudes(trimmedPoints, 3);

  for (let i = 0; i < trimmedPoints.length; i++) {
    const a = trimmedPoints[i].alt || 0;
    if (a < minAlt) minAlt = a;
    if (a > maxAlt) maxAlt = a;

    if (i > 0) {
      const prev = trimmedPoints[i - 1];
      const curr = trimmedPoints[i];
      const d = computeDistanceKm(prev.lat, prev.lon, curr.lat, curr.lon);
      totalDistKm += d;

      const dt = Math.max(0.5, (curr.timeSeconds ?? i) - (prev.timeSeconds ?? (i - 1)));
      const dz = smoothedAlts[i] - smoothedAlts[i - 1];
      const vario = Math.round((dz / dt) * 10) / 10;

      if (vario > maxClimbRate) maxClimbRate = vario;
      if (vario < maxSinkRate) maxSinkRate = vario;
    }
  }

  const maxGainMeters = Math.max(0, Math.round(maxAlt - (firstPt.alt || 0)));

  // 3. Full Telemetry Re-analysis (Thermals, Phases, Maneuvers, Events)
  const telemetry = analyzeFlightTelemetry(trimmedPoints);

  // 4. Downstream Sparklines and LTTB Decimation
  const sparklineSvgPoints = generateSparklinePoints(trimmedPoints, 60, 100, 32);
  const decimatedPoints = trimmedPoints.length <= 1500
    ? trimmedPoints
    : lttbDecimate(trimmedPoints, 1500, 'alt');

  const nowUtc = Date.now();

  // 5. Update Meta Record
  meta.takeoffTime = takeoffTime;
  meta.landingTime = landingTime;
  meta.durationSeconds = durationSec;
  meta.durationMinutes = durationMin;
  meta.takeoffAltMsl = Math.round(firstPt.alt || 0);
  meta.landingAltMsl = Math.round(lastPt.alt || 0);
  meta.minAltMsl = Math.round(minAlt);
  meta.maxAltMsl = Math.round(maxAlt);
  meta.maxGainMeters = maxGainMeters;
  meta.maxClimbRate = Math.round(maxClimbRate * 10) / 10;
  meta.maxSinkRate = Math.round(maxSinkRate * 10) / 10;
  meta.accumulatedClimbMeters = telemetry.accumulatedClimbMeters || 0;
  meta.distanceKm = Math.round(totalDistKm * 10) / 10;
  meta.thermalsCount = telemetry.thermalCount || 0;
  meta.hasThermals = (telemetry.thermalCount || 0) > 0;
  meta.maneuversCount = (telemetry.maneuvers || []).length;
  meta.hasExercises = (telemetry.maneuvers || []).length > 0;
  meta.detectedManeuvers = telemetry.detectedManeuverKeys || [];
  meta.sparklineSvgPoints = sparklineSvgPoints;
  const isActuallyTrimmed = !options.isReset && (validTakeoffIdx > 0 || validLandingIdx < n - 1);
  meta.isTrimmed = isActuallyTrimmed;
  meta.trimIndices = isActuallyTrimmed ? {
    takeoffIndex: validTakeoffIdx,
    landingIndex: validLandingIdx,
    originalCount: n,
    trimmedCount: trimmedPoints.length
  } : null;
  meta.updatedAt = nowUtc;

  // 6. Update Raw Record
  raw.decimatedPoints = decimatedPoints;
  raw.telemetry = telemetry;
  raw.sampleIntervalSeconds = trimmedPoints.length > 1
    ? Math.round(Math.max(1, ((trimmedPoints[trimmedPoints.length - 1].timeSeconds || 0) - (trimmedPoints[0].timeSeconds || 0)) / trimmedPoints.length))
    : 1;
  raw.updatedAt = nowUtc;

  return {
    meta,
    raw,
    trimmedPoints
  };
}

/**
 * Restores the original untrimmed flight track from raw.originalPoints or raw.rawIgc.
 * 
 * @param {{ meta: Object, raw: Object }} bundle 
 * @returns {{ meta: Object, raw: Object, restoredPoints: Array<Object> }}
 */
export function restoreUntrimmedFlight(bundle) {
  if (!bundle || !bundle.raw) {
    throw new Error('[restoreUntrimmedFlight] Invalid flight bundle provided');
  }

  const raw = bundle.raw;
  const originalPoints = raw.originalPoints;
  if (!Array.isArray(originalPoints) || originalPoints.length < 5) {
    throw new Error('[restoreUntrimmedFlight] No original untrimmed points found to restore');
  }

  return recalculateFlightAfterTrim(
    bundle,
    0,
    originalPoints.length - 1,
    { isReset: true }
  );
}

/**
 * Automatically detects and applies true takeoff and landing trim points to a flight bundle.
 * Does not overwrite if already trimmed or explicitly marked as untrimmed by the pilot.
 * 
 * @param {{ meta: Object, raw: Object }} bundle
 * @returns {{ bundle: { meta: Object, raw: Object }, wasTrimmed: boolean }}
 */
export function autoTrimFlight(bundle) {
  if (!bundle || !bundle.raw) return { bundle, wasTrimmed: false };
  if (bundle.meta?.isTrimmed || bundle.meta?.isExplicitlyUntrimmed) {
    return { bundle, wasTrimmed: false };
  }

  const raw = bundle.raw;
  const sourcePoints = Array.isArray(raw.originalPoints) && raw.originalPoints.length >= 15
    ? raw.originalPoints
    : (Array.isArray(raw.points) && raw.points.length >= 15
        ? raw.points
        : (Array.isArray(raw.decimatedPoints) && raw.decimatedPoints.length >= 15 ? raw.decimatedPoints : null));

  if (!sourcePoints) return { bundle, wasTrimmed: false };

  const trim = detectTrimPoints(sourcePoints);
  if (trim && trim.canTrim) {
    const result = recalculateFlightAfterTrim(bundle, trim.takeoffIndex, trim.landingIndex);
    result.meta.isAutoTrimmed = true;
    return { bundle: result, wasTrimmed: true };
  }

  return { bundle, wasTrimmed: false };
}

/**
 * Applies topographic elevation correction to flight trackpoints and recalculates telemetry.
 * 
 * Modes:
 *  - 'two_point': Linear barometric drift compensation between takeoff and landing.
 *  - 'takeoff_offset': Uniform vertical altitude offset based on takeoff delta.
 * 
 * @param {{ meta: Object, raw: Object }} bundle
 * @param {number} targetTakeoffAlt Target takeoff altitude MSL in meters
 * @param {number|null} [targetLandingAlt=null] Target landing altitude MSL in meters
 * @param {'two_point'|'takeoff_offset'} [mode='two_point']
 * @returns {{ meta: Object, raw: Object }}
 */
export function applyElevationCorrection(bundle, targetTakeoffAlt, targetLandingAlt = null, mode = 'two_point') {
  if (!bundle || !bundle.raw) {
    throw new Error('[applyElevationCorrection] Invalid flight bundle provided');
  }

  const meta = bundle.meta ? { ...bundle.meta } : {};
  const raw = bundle.raw ? { ...bundle.raw } : {};

  const pointsToAdjust = Array.isArray(raw.originalPoints) && raw.originalPoints.length >= 2
    ? raw.originalPoints
    : (Array.isArray(raw.decimatedPoints) ? raw.decimatedPoints : (raw.points || []));

  if (pointsToAdjust.length < 2) {
    throw new Error('[applyElevationCorrection] Track contains insufficient points for elevation correction');
  }

  const n = pointsToAdjust.length;
  const currentTakeoffAlt = pointsToAdjust[0].alt || 0;
  const currentLandingAlt = pointsToAdjust[n - 1].alt || 0;

  const validTargetTakeoff = typeof targetTakeoffAlt === 'number' && !isNaN(targetTakeoffAlt) ? targetTakeoffAlt : currentTakeoffAlt;
  const validTargetLanding = typeof targetLandingAlt === 'number' && !isNaN(targetLandingAlt) ? targetLandingAlt : null;

  const deltaTakeoff = validTargetTakeoff - currentTakeoffAlt;
  const deltaLanding = validTargetLanding !== null ? (validTargetLanding - currentLandingAlt) : deltaTakeoff;

  // Preserve uncalibrated original points if not already saved
  if (!raw.uncalibratedOriginalPoints) {
    raw.uncalibratedOriginalPoints = pointsToAdjust.map(p => ({ ...p }));
  }

  const firstTime = pointsToAdjust[0].timeSeconds ?? 0;
  const lastTime = pointsToAdjust[n - 1].timeSeconds ?? (firstTime + n);
  const totalDuration = Math.max(1, lastTime - firstTime);

  // Apply elevation correction point by point
  const correctedPoints = pointsToAdjust.map((p, idx) => {
    let deltaZ = deltaTakeoff;
    if (mode === 'two_point' && validTargetLanding !== null) {
      const curTime = p.timeSeconds ?? (firstTime + idx);
      const frac = Math.max(0, Math.min(1, (curTime - firstTime) / totalDuration));
      deltaZ = deltaTakeoff * (1 - frac) + deltaLanding * frac;
    }
    return {
      ...p,
      alt: Math.round(((p.alt || 0) + deltaZ) * 10) / 10
    };
  });

  // Re-assign corrected points
  if (raw.originalPoints) {
    raw.originalPoints = correctedPoints;
  }
  raw.decimatedPoints = correctedPoints.length <= 1500
    ? correctedPoints
    : lttbDecimate(correctedPoints, 1500, 'alt');

  // Recalculate kinematics and telemetry on corrected points
  const tIndices = meta.trimIndices;
  let recomputed;
  if (meta.isTrimmed && tIndices) {
    recomputed = recalculateFlightAfterTrim(
      { meta, raw },
      tIndices.takeoffIndex,
      tIndices.landingIndex
    );
  } else {
    recomputed = recalculateFlightAfterTrim(
      { meta, raw },
      0,
      correctedPoints.length - 1,
      { isReset: !meta.isTrimmed }
    );
  }

  recomputed.meta.elevationCorrection = {
    targetTakeoffAlt: validTargetTakeoff,
    targetLandingAlt: validTargetLanding,
    deltaTakeoff: Math.round(deltaTakeoff * 10) / 10,
    deltaLanding: Math.round(deltaLanding * 10) / 10,
    mode,
    appliedAt: Date.now()
  };

  return recomputed;
}

/**
 * Restores original uncalibrated elevations from raw.uncalibratedOriginalPoints.
 * 
 * @param {{ meta: Object, raw: Object }} bundle
 * @returns {{ meta: Object, raw: Object }}
 */
export function restoreOriginalElevations(bundle) {
  if (!bundle || !bundle.raw) {
    throw new Error('[restoreOriginalElevations] Invalid flight bundle provided');
  }

  const raw = bundle.raw;
  const uncalibrated = raw.uncalibratedOriginalPoints;
  if (!Array.isArray(uncalibrated) || uncalibrated.length < 2) {
    throw new Error('[restoreOriginalElevations] No uncalibrated original points found to restore');
  }

  const meta = { ...bundle.meta };
  raw.originalPoints = uncalibrated.map(p => ({ ...p }));
  raw.decimatedPoints = uncalibrated.length <= 1500
    ? uncalibrated
    : lttbDecimate(uncalibrated, 1500, 'alt');
  delete raw.uncalibratedOriginalPoints;
  delete meta.elevationCorrection;

  const tIndices = meta.trimIndices;
  if (meta.isTrimmed && tIndices) {
    return recalculateFlightAfterTrim({ meta, raw }, tIndices.takeoffIndex, tIndices.landingIndex);
  } else {
    return recalculateFlightAfterTrim({ meta, raw }, 0, uncalibrated.length - 1, { isReset: true });
  }
}

