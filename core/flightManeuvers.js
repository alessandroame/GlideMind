/**
 * Flight Maneuvers & Thermal Lift Analyzer for GlideMind
 * Kinematic detection for paragliding thermals, acrobatics, and rapid descent maneuvers
 * from GNSS/GPS tracklogs (1 Hz).
 * 
 * Headless module with zero DOM dependencies.
 */

import { computeDistanceKm, computeBearing } from './geoSpatialMath.js';

export const MANEUVER_KEYS = Object.freeze({
    INVERSIONI: 'inversioni',
    WINGOVER: 'wingover',
    SINGLE_360: '360°',
    DOUBLE_360: '2x 360° consecutive',
    SPIRALE: 'vite positiva (spirale)',
    FIGURE_8: 'circuito a 8',
    ORECCHIE: 'orecchie con pilotaggio'
});

/**
 * Normalizes maneuver string for safe comparisons.
 * @param {string} str 
 * @returns {string}
 */
export function normalizeManeuverName(str) {
    if (!str || typeof str !== 'string') return '';
    return str.trim().toLowerCase();
}

/**
 * Calculates the shortest signed angular difference between two bearings in degrees [-180, 180].
 * Positive = Clockwise (right turn), Negative = Counter-Clockwise (left turn).
 * @param {number} b1 Initial bearing [0, 360)
 * @param {number} b2 Final bearing [0, 360)
 * @returns {number} Delta in degrees [-180, 180]
 */
export function calculateAngularDelta(b1, b2) {
    return ((Number(b2) - Number(b1) + 540) % 360) - 180;
}

/**
 * Converts compass heading in degrees [0, 360) into a 16-point cardinal compass string.
 * @param {number} deg Heading in degrees
 * @returns {string} Cardinal direction (e.g. 'N', 'NE', 'ESE')
 */
export function degToCardinal(deg) {
    const val = Math.floor(((deg % 360) / 22.5) + 0.5);
    const arr = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return arr[val % 16];
}

/**
 * Smooths altitude array using a symmetric moving average window to eliminate GNSS jitter
 * while preserving boundary end-points.
 * 
 * @param {Array<{ alt: number }>} points Track points
 * @param {number} [windowSize=3] Window size in samples (odd integer >= 1)
 * @returns {Array<number>} Smoothed altitudes array
 */
export function smoothAltitudes(points, windowSize = 3) {
    if (!points || points.length === 0) return [];
    if (points.length < 10 || windowSize <= 1) {
        return points.map(p => (p && typeof p.alt === 'number') ? p.alt : 0);
    }

    const n = points.length;
    const smoothed = new Array(n);
    const half = Math.floor(windowSize / 2);

    smoothed[0] = points[0].alt || 0;
    smoothed[n - 1] = points[n - 1].alt || 0;

    for (let i = 1; i < n - 1; i++) {
        let sum = 0;
        let count = 0;
        for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
            sum += ((points[j] && typeof points[j].alt === 'number') ? points[j].alt : 0);
            count++;
        }
        smoothed[i] = Math.round((sum / count) * 10) / 10;
    }

    return smoothed;
}

/**
 * Idempotently merges detected maneuvers into an existing list of flight maneuvers,
 * strictly preserving existing entries and casing without duplicates.
 * 
 * @param {Array<string>} [existingManeuvers=[]] 
 * @param {Array<string>} [detectedManeuvers=[]] 
 * @returns {Array<string>} Merged maneuver list
 */
export function mergeManeuversPreservingExisting(existingManeuvers = [], detectedManeuvers = []) {
    const result = Array.isArray(existingManeuvers) ? [...existingManeuvers] : [];
    const existingNormalized = new Set(result.map(m => normalizeManeuverName(m)));

    if (Array.isArray(detectedManeuvers)) {
        for (const m of detectedManeuvers) {
            if (!m || typeof m !== 'string') continue;
            const norm = normalizeManeuverName(m);
            if (!existingNormalized.has(norm)) {
                result.push(m);
                existingNormalized.add(norm);
            }
        }
    }

    return result;
}

/**
 * Non-destructively reconciles flight maneuvers during telemetry engine upgrades.
 * Removes legacy automated 'inversioni' / 's-turn' pseudo-maneuvers while strictly preserving
 * all manual pilot notes, custom syllabus entries, and newly detected maneuvers.
 * 
 * @param {Array<string>} [existingManeuvers=[]]
 * @param {Array<string>} [newDetectedKeys=[]]
 * @returns {Array<string>} Reconciled maneuver list
 */
export function reconcileManeuversAfterMigration(existingManeuvers = [], newDetectedKeys = []) {
    const existing = Array.isArray(existingManeuvers) ? existingManeuvers : [];
    const detected = Array.isArray(newDetectedKeys) ? newDetectedKeys : [];

    const hasNewInversioni = detected.some(k => {
        const norm = normalizeManeuverName(k);
        return norm === 'inversioni' || norm === 'inversioni di rollio';
    });

    const preserved = existing.filter(m => {
        if (!m || typeof m !== 'string') return false;
        const norm = normalizeManeuverName(m);
        if (norm === 'inversioni' || norm === 'inversioni di rollio' || norm === 's-turn' || norm === 's-turns') {
            return hasNewInversioni;
        }
        return true;
    });

    return mergeManeuversPreservingExisting(preserved, detected);
}

/**
 * Detects paragliding thermals from GPS track points based on continuous angular turn progression.
 * Evaluates core coordinates as lift-weighted barycenter, mean radius, climb efficiency,
 * and wind drift.
 * 
 * @param {Array<Object>} points Track points with lat, lon, alt, timeSeconds
 * @param {Array<number>} [smoothedAlts=null] Optional pre-computed smoothed altitudes
 * @returns {Array<Object>} List of detected thermals with full aerological metrics
 */
export function detectThermals(points, smoothedAlts = null) {
    if (!points || !Array.isArray(points) || points.length < 10) return [];

    const alts = smoothedAlts || smoothAltitudes(points, 3);
    const n = points.length;

    // Step 1: Compute instantaneous bearings, speed and vario per interval
    const stepBearings = new Array(n - 1);
    const stepVarios = new Array(n - 1);

    for (let i = 0; i < n - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        stepBearings[i] = computeBearing(p1.lat, p1.lon, p2.lat, p2.lon);
        const dt = Math.max(1, (p2.timeSeconds || (i + 1)) - (p1.timeSeconds || i));
        stepVarios[i] = (alts[i + 1] - alts[i]) / dt;
    }

    const turnRates = new Array(Math.max(0, n - 2));
    const turnDeltas = new Array(Math.max(0, n - 2));
    for (let i = 0; i < n - 2; i++) {
        const delta = calculateAngularDelta(stepBearings[i], stepBearings[i + 1]);
        const dt = Math.max(0.5, (points[i + 2].timeSeconds || (i + 2)) - (points[i + 1].timeSeconds || (i + 1)));
        turnDeltas[i] = delta;
        turnRates[i] = delta / dt;
    }

    // Step 2: Identify candidate circling blocks with 2-second jitter tolerance
    const rawCircles = [];
    let currentDir = 0; // +1 CW, -1 CCW
    let startIdx = 0;
    let accumulatedAngle = 0;
    let noiseSec = 0;
    let lastValidIdx = 0;

    for (let i = 0; i < turnRates.length; i++) {
        const rate = turnRates[i];
        const delta = turnDeltas[i];
        const absRate = Math.abs(rate);
        const dir = rate > 0 ? 1 : -1;

        // Active turning threshold for paraglider circling: >= 2.8 deg/sec
        if (absRate >= 2.8) {
            if (currentDir === 0) {
                currentDir = dir;
                startIdx = Math.max(0, i);
                accumulatedAngle = Math.abs(delta);
                noiseSec = 0;
                lastValidIdx = i;
            } else if (dir === currentDir) {
                accumulatedAngle += Math.abs(delta);
                noiseSec = 0;
                lastValidIdx = i;
            } else {
                // Opposite direction: allow up to 2 seconds of turbulence/correction if already in sustained turn
                if (accumulatedAngle >= 140 && noiseSec < 2) {
                    noiseSec++;
                } else {
                    if (accumulatedAngle >= 260) {
                        rawCircles.push({
                            startIndex: startIdx,
                            endIndex: lastValidIdx + 1,
                            accumulatedAngle,
                            turnDir: currentDir > 0 ? 'CW' : 'CCW'
                        });
                    }
                    currentDir = dir;
                    startIdx = Math.max(0, i - noiseSec);
                    accumulatedAngle = Math.abs(delta);
                    noiseSec = 0;
                    lastValidIdx = i;
                }
            }
        } else {
            // Low turn rate / straight flight
            if (currentDir !== 0) {
                noiseSec++;
                if (noiseSec > 4) {
                    if (accumulatedAngle >= 260) {
                        rawCircles.push({
                            startIndex: startIdx,
                            endIndex: lastValidIdx + 1,
                            accumulatedAngle,
                            turnDir: currentDir > 0 ? 'CW' : 'CCW'
                        });
                    }
                    currentDir = 0;
                    accumulatedAngle = 0;
                    noiseSec = 0;
                }
            }
        }
    }

    if (currentDir !== 0 && accumulatedAngle >= 260) {
        rawCircles.push({
            startIndex: startIdx,
            endIndex: lastValidIdx + 1,
            accumulatedAngle,
            turnDir: currentDir > 0 ? 'CW' : 'CCW'
        });
    }

    // Step 3: Trim each candidate circle to real climb range (Entry & Exit trimming)
    const trimmedCandidates = [];
    for (const c of rawCircles) {
        let sIdx = c.startIndex;
        let eIdx = c.endIndex;

        // Local minimum altitude scan in first 40% to eliminate pre-lift descent approach
        const scanRange = Math.min(eIdx, sIdx + Math.max(3, Math.floor((eIdx - sIdx) * 0.4)));
        let minAlt = alts[sIdx];
        let minAltIdx = sIdx;
        for (let i = sIdx; i <= scanRange; i++) {
            if (alts[i] < minAlt) {
                minAlt = alts[i];
                minAltIdx = i;
            }
        }
        if (minAltIdx > sIdx && (alts[sIdx] - minAlt) >= 2) {
            sIdx = minAltIdx;
        }

        // Peak altitude trimming: truncate descending tail
        let maxAlt = alts[sIdx];
        let maxAltIdx = sIdx;
        for (let i = sIdx; i <= eIdx; i++) {
            if (alts[i] > maxAlt) {
                maxAlt = alts[i];
                maxAltIdx = i;
            }
        }
        if (maxAltIdx > sIdx && (maxAlt - alts[eIdx]) >= 6) {
            eIdx = maxAltIdx;
        }

        const dur = Math.max(1, (points[eIdx].timeSeconds || eIdx) - (points[sIdx].timeSeconds || sIdx));
        const gain = alts[eIdx] - alts[sIdx];
        const vz = gain / dur;

        // Recalculate turn progression inside trimmed bounds
        let trimmedAngle = 0;
        for (let i = sIdx; i < Math.min(eIdx, turnDeltas.length); i++) {
            const delta = turnDeltas[i];
            if ((c.turnDir === 'CW' && delta > 0) || (c.turnDir === 'CCW' && delta < 0)) {
                trimmedAngle += Math.abs(delta);
            }
        }

        if (gain >= 8 && vz >= 0.15 && trimmedAngle >= 220) {
            trimmedCandidates.push({
                startIndex: sIdx,
                endIndex: eIdx,
                accumulatedAngle: trimmedAngle,
                turnDir: c.turnDir
            });
        }
    }

    // Step 4: Merge adjacent thermal fragments with same turning direction and small gap (<= 12s)
    const mergedThermals = [];
    let curBlock = null;

    for (let i = 0; i < trimmedCandidates.length; i++) {
        const cand = trimmedCandidates[i];
        if (!curBlock) {
            curBlock = { ...cand };
            continue;
        }

        const gapSec = (points[cand.startIndex].timeSeconds || cand.startIndex) - (points[curBlock.endIndex].timeSeconds || curBlock.endIndex);
        const altDrop = alts[curBlock.endIndex] - alts[cand.startIndex];

        if (gapSec <= 12 && altDrop <= 8 && cand.turnDir === curBlock.turnDir) {
            curBlock.endIndex = cand.endIndex;
            curBlock.accumulatedAngle += cand.accumulatedAngle;
        } else {
            mergedThermals.push(curBlock);
            curBlock = { ...cand };
        }
    }
    if (curBlock) {
        mergedThermals.push(curBlock);
    }

    // Step 5: Build final thermal objects with aerological metrics
    const validThermals = [];
    let thermalIndex = 1;

    for (const block of mergedThermals) {
        const startPt = points[block.startIndex];
        const endPt = points[block.endIndex];
        const effectiveEndPt = endPt || points[points.length - 1];

        const effectiveDurationSec = Math.max(1, (effectiveEndPt.timeSeconds || block.endIndex) - (startPt.timeSeconds || block.startIndex));
        const entryAlt = Math.round(alts[block.startIndex]);
        const exitAlt = Math.round(alts[block.endIndex]);
        const netGain = exitAlt - entryAlt;

        // Strict thermal filters: net positive gain >= 10m and avg climb >= 0.20 m/s
        if (netGain < 10) continue;

        const avgClimbRate = effectiveDurationSec > 0 ? (exitAlt - entryAlt) / effectiveDurationSec : 0;
        if (avgClimbRate < 0.20) continue;

        // Find peak altitude in the block
        let maxAlt = alts[block.startIndex];
        for (let i = block.startIndex; i <= block.endIndex; i++) {
            if (alts[i] > maxAlt) maxAlt = alts[i];
        }

        // Find climb metrics and positive vario seconds
        let peakVario = 0;
        let positiveVarioSeconds = 0;
        for (let i = block.startIndex; i <= block.endIndex; i++) {
            if (i < n - 1) {
                if (stepVarios[i] > peakVario) peakVario = stepVarios[i];
                if (stepVarios[i] > 0.1) {
                    const dt = Math.max(1, (points[i + 1].timeSeconds || (i + 1)) - (points[i].timeSeconds || i));
                    positiveVarioSeconds += dt;
                }
            }
        }

        // Calculate Core Coordinates as Lift-Weighted Barycenter
        let sumWeightedLat = 0, sumWeightedLon = 0, sumWeights = 0;
        const halfCount = Math.max(1, Math.floor((block.endIndex - block.startIndex) / 3));

        let startWeightedLat = 0, startWeightedLon = 0, startWeightSum = 0;
        let endWeightedLat = 0, endWeightedLon = 0, endWeightSum = 0;

        for (let i = block.startIndex; i <= block.endIndex; i++) {
            const v = (i < n - 1) ? stepVarios[i] : (stepVarios[i - 1] || 0);
            const w = Math.max(0.05, Math.pow(Math.max(0, v + 1.0), 2.0));

            sumWeightedLat += points[i].lat * w;
            sumWeightedLon += points[i].lon * w;
            sumWeights += w;

            if (i < block.startIndex + halfCount) {
                startWeightedLat += points[i].lat * w;
                startWeightedLon += points[i].lon * w;
                startWeightSum += w;
            }
            if (i > block.endIndex - halfCount) {
                endWeightedLat += points[i].lat * w;
                endWeightedLon += points[i].lon * w;
                endWeightSum += w;
            }
        }

        const centerLat = sumWeights > 0 ? sumWeightedLat / sumWeights : startPt.lat;
        const centerLon = sumWeights > 0 ? sumWeightedLon / sumWeights : startPt.lon;

        // Calculate mean circling radius in meters
        let sumRadiusMeters = 0;
        let ptCount = 0;
        for (let i = block.startIndex; i <= block.endIndex; i++) {
            const distKm = computeDistanceKm(centerLat, centerLon, points[i].lat, points[i].lon);
            sumRadiusMeters += (distKm * 1000.0);
            ptCount++;
        }
        const meanRadiusMeters = ptCount > 0 ? Math.round((sumRadiusMeters / ptCount) * 10) / 10 : 38.0;

        // Filter out wide navigation curves (radius > 160m with low turn count)
        const turns = Math.round((block.accumulatedAngle / 360) * 10) / 10;
        if (meanRadiusMeters > 160.0 && turns < 2.0) continue;

        // Wind drift calculation
        const pStartCenter = {
            lat: startWeightSum > 0 ? startWeightedLat / startWeightSum : startPt.lat,
            lon: startWeightSum > 0 ? startWeightedLon / startWeightSum : startPt.lon
        };
        const pEndCenter = {
            lat: endWeightSum > 0 ? endWeightedLat / endWeightSum : effectiveEndPt.lat,
            lon: endWeightSum > 0 ? endWeightedLon / endWeightSum : effectiveEndPt.lon
        };
        const driftDistKm = computeDistanceKm(pStartCenter.lat, pStartCenter.lon, pEndCenter.lat, pEndCenter.lon);
        const driftSpeedKmh = effectiveDurationSec > 0 ? Math.round((driftDistKm / (effectiveDurationSec / 3600)) * 10) / 10 : 0;
        const driftBearing = computeBearing(pStartCenter.lat, pStartCenter.lon, pEndCenter.lat, pEndCenter.lon);
        const windOriginDeg = Math.round((driftBearing + 180) % 360);

        const mins = Math.floor(effectiveDurationSec / 60);
        const secs = effectiveDurationSec % 60;
        const durationFormatted = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        const efficiency = effectiveDurationSec > 0 ? Math.round((positiveVarioSeconds / effectiveDurationSec) * 100) : 0;

        validThermals.push({
            id: `th_${thermalIndex}`,
            thermalIndex,
            startIndex: block.startIndex,
            endIndex: block.endIndex,
            startTimeSeconds: startPt.timeSeconds !== undefined ? startPt.timeSeconds : 0,
            endTimeSeconds: effectiveEndPt.timeSeconds !== undefined ? effectiveEndPt.timeSeconds : effectiveDurationSec,
            startTimeFormatted: startPt.timeFormatted || `${Math.floor((startPt.timeSeconds || 0) / 3600)}:${Math.floor(((startPt.timeSeconds || 0) % 3600) / 60)}`,
            endTimeFormatted: effectiveEndPt.timeFormatted || `${Math.floor((effectiveEndPt.timeSeconds || 0) / 3600)}:${Math.floor(((effectiveEndPt.timeSeconds || 0) % 3600) / 60)}`,
            durationSeconds: effectiveDurationSec,
            durationFormatted,
            entryAlt,
            exitAlt,
            maxAlt: Math.round(maxAlt),
            altGain: Math.round(netGain),
            turnCount: turns,
            turnDirection: block.turnDir,
            avgClimbRate: Math.round(avgClimbRate * 10) / 10,
            maxClimbRate: Math.round(peakVario * 10) / 10,
            meanRadiusMeters,
            efficiencyPercent: efficiency,
            centerCoords: {
                lat: Math.round(centerLat * 100000) / 100000,
                lon: Math.round(centerLon * 100000) / 100000
            },
            windDrift: {
                driftSpeedKmh: Math.min(65, driftSpeedKmh),
                windOriginDeg,
                windCardinal: degToCardinal(windOriginDeg)
            }
        });

        thermalIndex++;
    }

    return validThermals;
}

/**
 * Analyzes kinematic trackpoints to detect executed paragliding maneuvers:
 *  - Wingover (dynamic figure-8 loops > 180° with steep sink peak <= -2.5 m/s)
 *  - Vite positiva / Spirale rapida (continuous turns >= 680° with sink <= -3.0 m/s)
 *  - 2x 360° consecutivi (neutral descent outside thermals)
 *  - 360° singolo (320° to 680° outside thermals)
 *  - Circuito a 8 (alternating CW/CCW rotations >= 275°)
 *  - Orecchie con pilotaggio (high drag sink <= -1.8 m/s, damped turns 55°-130°)
 *  - Inversioni di rollio acrobatiche
 * 
 * @param {Array<Object>} points GPS trackpoints {lat, lon, alt, timeSeconds, speedKmh, vario}
 * @param {Array<number>} [smoothedAlts=null] Pre-computed smoothed altitudes
 * @param {Array<Object>} [thermals=null] Pre-detected thermals
 * @returns {Array<Object>} Detected maneuver events with kinematic details
 */
export function detectFlightManeuvers(points, smoothedAlts = null, thermals = null) {
    if (!points || !Array.isArray(points) || points.length < 8) {
        return [];
    }

    const n = points.length;
    const alts = smoothedAlts || smoothAltitudes(points, 3);

    // Pre-calculate step bearings, turn deltas, and turn rates (deg/s)
    const stepBearings = new Array(n - 1);
    const stepVarios = new Array(n - 1);
    const stepSpeeds = new Array(n - 1);

    for (let i = 0; i < n - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const dt = Math.max(0.5, (p2.timeSeconds || (i + 1)) - (p1.timeSeconds || i));
        const distKm = computeDistanceKm(p1.lat, p1.lon, p2.lat, p2.lon);
        const calcSpeed = (distKm / (dt / 3600));
        let rawSpeed = typeof p1.speedKmh === 'number' && p1.speedKmh > 0 ? p1.speedKmh : calcSpeed;
        stepSpeeds[i] = Math.min(90, rawSpeed);
        stepBearings[i] = computeBearing(p1.lat, p1.lon, p2.lat, p2.lon);
        stepVarios[i] = ((alts[i + 1] !== undefined ? alts[i + 1] : p2.alt) - (alts[i] !== undefined ? alts[i] : p1.alt)) / dt;
    }

    // Determine real landing ground altitude and touchdown time
    let hasRealLanding = false;
    let minLandingAlt = Infinity;
    let touchdownTime = 0;

    const endWindowStart = Math.max(0, n - Math.min(300, Math.floor(n * 0.25)));
    for (let i = n - 2; i >= endWindowStart; i--) {
        if (stepSpeeds[i] < 14) {
            hasRealLanding = true;
            touchdownTime = points[i + 1]?.timeSeconds || points[i]?.timeSeconds || 0;
            break;
        }
    }

    if (hasRealLanding) {
        for (let i = endWindowStart; i < n; i++) {
            if (alts[i] < minLandingAlt) {
                minLandingAlt = alts[i];
            }
        }
    }

    const turnRates = new Array(Math.max(0, n - 2));
    const angularDeltas = new Array(Math.max(0, n - 2));

    for (let i = 0; i < n - 2; i++) {
        // In-flight guard: if ground speed is too low (< 16 km/h), bearing is dominated by GNSS jitter on ground
        if (stepSpeeds[i] < 16 || stepSpeeds[i + 1] < 16) {
            angularDeltas[i] = 0;
            turnRates[i] = 0;
            continue;
        }
        const delta = calculateAngularDelta(stepBearings[i], stepBearings[i + 1]);
        const dt = Math.max(0.5, (points[i + 2].timeSeconds || (i + 2)) - (points[i + 1].timeSeconds || (i + 1)));
        angularDeltas[i] = delta;
        turnRates[i] = delta / dt; // deg/s (positive CW, negative CCW)
    }

    const detectedEvents = [];

    // ============================================================
    // 1. ROTATIONAL MANEUVERS: 360°, 2x 360°, Spirale, Figura a 8
    // ============================================================
    const rotationalBlocks = [];
    let currentDir = 0; // +1 CW, -1 CCW
    let accumulatedAngle = 0;
    let blockStartIndex = 0;

    for (let i = 0; i < turnRates.length; i++) {
        const rate = turnRates[i];
        const delta = angularDeltas[i];
        const absRate = Math.abs(rate);

        // Turn rate threshold for active turning: >= 4.0 deg/s
        if (absRate >= 4.0) {
            const dir = rate > 0 ? 1 : -1;
            if (currentDir === 0) {
                currentDir = dir;
                accumulatedAngle = Math.abs(delta);
                blockStartIndex = i;
            } else if (currentDir === dir) {
                accumulatedAngle += Math.abs(delta);
            } else {
                // Direction flipped
                if (accumulatedAngle >= 140) {
                    rotationalBlocks.push({
                        startIndex: blockStartIndex,
                        endIndex: i + 1,
                        dir: currentDir > 0 ? 'CW' : 'CCW',
                        totalAngle: accumulatedAngle
                    });
                }
                currentDir = dir;
                accumulatedAngle = Math.abs(delta);
                blockStartIndex = i;
            }
        } else {
            // Straight line or near-zero turn rate
            if (currentDir !== 0) {
                if (accumulatedAngle >= 140) {
                    rotationalBlocks.push({
                        startIndex: blockStartIndex,
                        endIndex: i + 1,
                        dir: currentDir > 0 ? 'CW' : 'CCW',
                        totalAngle: accumulatedAngle
                    });
                }
                currentDir = 0;
                accumulatedAngle = 0;
            }
        }
    }

    if (currentDir !== 0 && accumulatedAngle >= 140) {
        rotationalBlocks.push({
            startIndex: blockStartIndex,
            endIndex: turnRates.length + 1,
            dir: currentDir > 0 ? 'CW' : 'CCW',
            totalAngle: accumulatedAngle
        });
    }

    // Classify Figure-8 / Doppio 360 ad Otto (Consecutive opposite rotations >= 275 deg with transition <= 10s)
    const consumedBlockIndices = new Set();

    for (let b = 0; b < rotationalBlocks.length - 1; b++) {
        const b1 = rotationalBlocks[b];
        const b2 = rotationalBlocks[b + 1];

        if (b1.dir !== b2.dir && b1.totalAngle >= 275 && b2.totalAngle >= 275) {
            const gapSec = (points[b2.startIndex].timeSeconds || b2.startIndex) - (points[b1.endIndex].timeSeconds || b1.endIndex);
            if (gapSec <= 10) {
                const sIdx = b1.startIndex;
                const eIdx = b2.endIndex;
                const midIdx = Math.floor((sIdx + eIdx) / 2);
                detectedEvents.push({
                    type: MANEUVER_KEYS.FIGURE_8,
                    startIndex: sIdx,
                    endIndex: eIdx,
                    lat: points[midIdx].lat,
                    lon: points[midIdx].lon,
                    alt: points[midIdx].alt,
                    timeSeconds: points[sIdx].timeSeconds,
                    durationSeconds: (points[eIdx].timeSeconds || eIdx) - (points[sIdx].timeSeconds || sIdx),
                    details: 'CW/CCW transition: ' + Math.round(b1.totalAngle) + '° + ' + Math.round(b2.totalAngle) + '°'
                });
                consumedBlockIndices.add(b);
                consumedBlockIndices.add(b + 1);
                b++;
            }
        }
    }

    // Process remaining rotational blocks (Spirale, 2x 360, 360)
    for (let b = 0; b < rotationalBlocks.length; b++) {
        if (consumedBlockIndices.has(b)) continue;
        const blk = rotationalBlocks[b];
        const sIdx = blk.startIndex;
        const eIdx = blk.endIndex;
        const durationSec = Math.max(1, (points[eIdx].timeSeconds || eIdx) - (points[sIdx].timeSeconds || sIdx));
        const avgTurnRate = blk.totalAngle / durationSec;

        let minVz = 0;
        let sumVz = 0;
        let countVz = 0;
        let sumSpd = 0;
        let altDelta = (alts[eIdx] !== undefined ? alts[eIdx] : points[eIdx].alt) - (alts[sIdx] !== undefined ? alts[sIdx] : points[sIdx].alt);

        for (let i = sIdx; i < eIdx; i++) {
            if (stepVarios[i] < minVz) minVz = stepVarios[i];
            sumVz += stepVarios[i];
            countVz++;
            sumSpd += (stepSpeeds[i] || 0);
        }
        const avgVz = countVz > 0 ? sumVz / countVz : 0;
        const avgSpd = countVz > 0 ? sumSpd / countVz : 0;

        const midPt = points[Math.floor((sIdx + eIdx) / 2)];

        const isInThermal = Array.isArray(thermals) && thermals.some(th => {
            return Math.max(sIdx, th.startIndex) < Math.min(eIdx, th.endIndex);
        });

        // Continuous >= 680 deg (2 full circles)
        if (blk.totalAngle >= 680) {
            // Steep sink rate Vz <= -3.0 m/s and fast rotation -> Vite positiva (spirale)
            if (minVz <= -3.0 && altDelta < -15 && avgTurnRate >= 16) {
                detectedEvents.push({
                    type: MANEUVER_KEYS.SPIRALE,
                    startIndex: sIdx,
                    endIndex: eIdx,
                    lat: midPt.lat,
                    lon: midPt.lon,
                    alt: midPt.alt,
                    timeSeconds: points[sIdx].timeSeconds,
                    durationSeconds: durationSec,
                    details: 'Rotazione ' + Math.round(blk.totalAngle) + '°, Vz max ' + minVz.toFixed(1) + ' m/s, avg ' + avgTurnRate.toFixed(1) + '°/s'
                });
            } else if (!isInThermal && altDelta <= 0 && avgVz <= -0.2 && durationSec >= 15 && avgSpd >= 20) {
                // Outside pure thermal climbing: 2x 360° consecutive
                detectedEvents.push({
                    type: MANEUVER_KEYS.DOUBLE_360,
                    startIndex: sIdx,
                    endIndex: eIdx,
                    lat: midPt.lat,
                    lon: midPt.lon,
                    alt: midPt.alt,
                    timeSeconds: points[sIdx].timeSeconds,
                    durationSeconds: durationSec,
                    details: '2x 360° continui (' + Math.round(blk.totalAngle) + '°)'
                });
            }
        }
        // Single complete 360° (320° to 679°) outside thermal climbing
        else if (!isInThermal && blk.totalAngle >= 320 && blk.totalAngle < 680) {
            if (altDelta <= 0 && avgVz <= -0.2 && durationSec >= 8 && durationSec <= 35 && avgSpd >= 20) {
                detectedEvents.push({
                    type: MANEUVER_KEYS.SINGLE_360,
                    startIndex: sIdx,
                    endIndex: eIdx,
                    lat: midPt.lat,
                    lon: midPt.lon,
                    alt: midPt.alt,
                    timeSeconds: points[sIdx].timeSeconds,
                    durationSeconds: durationSec,
                    details: '360° singolo (' + Math.round(blk.totalAngle) + '° in ' + Math.round(durationSec) + 's)'
                });
            }
        }
    }

    // ============================================================
    // 2. OSCILLATION MANEUVERS: Inversioni di rollio & Wingover
    // ============================================================
    const oscillations = [];
    let currentOscDir = 0;
    let oscAngle = 0;
    let oscStartIdx = 0;
    let maxOscTurnRate = 0;

    for (let i = 0; i < turnRates.length; i++) {
        const rate = turnRates[i];
        const delta = angularDeltas[i];
        const absRate = Math.abs(rate);

        // Turn rate threshold for active paraglider oscillation: >= 4.0 deg/s
        if (absRate >= 4.0) {
            const dir = rate > 0 ? 1 : -1;
            if (currentOscDir === 0) {
                currentOscDir = dir;
                oscAngle = Math.abs(delta);
                oscStartIdx = i;
                maxOscTurnRate = absRate;
            } else if (currentOscDir === dir) {
                oscAngle += Math.abs(delta);
                if (absRate > maxOscTurnRate) maxOscTurnRate = absRate;
            } else {
                // Direction flipped
                const dtOsc = (points[i].timeSeconds || i) - (points[oscStartIdx].timeSeconds || oscStartIdx);
                if (oscAngle >= 45 && oscAngle <= 260 && dtOsc >= 1.2 && dtOsc <= 15.0) {
                    oscillations.push({
                        startIdx: oscStartIdx,
                        endIdx: i,
                        dir: currentOscDir > 0 ? 'CW' : 'CCW',
                        angle: oscAngle,
                        duration: dtOsc,
                        maxTurnRate: maxOscTurnRate
                    });
                }
                currentOscDir = dir;
                oscAngle = Math.abs(delta);
                oscStartIdx = i;
                maxOscTurnRate = absRate;
            }
        } else {
            if (currentOscDir !== 0) {
                const dtOsc = (points[i].timeSeconds || i) - (points[oscStartIdx].timeSeconds || oscStartIdx);
                if (oscAngle >= 45 && oscAngle <= 260 && dtOsc >= 1.2 && dtOsc <= 15.0) {
                    oscillations.push({
                        startIdx: oscStartIdx,
                        endIdx: i,
                        dir: currentOscDir > 0 ? 'CW' : 'CCW',
                        angle: oscAngle,
                        duration: dtOsc,
                        maxTurnRate: maxOscTurnRate
                    });
                }
                currentOscDir = 0;
                oscAngle = 0;
                maxOscTurnRate = 0;
            }
        }
    }

    if (currentOscDir !== 0) {
        const lastIdx = Math.min(turnRates.length + 1, points.length - 1);
        const dtOsc = (points[lastIdx].timeSeconds || lastIdx) - (points[oscStartIdx].timeSeconds || oscStartIdx);
        if (oscAngle >= 45 && oscAngle <= 260 && dtOsc >= 1.2 && dtOsc <= 15.0) {
            oscillations.push({
                startIdx: oscStartIdx,
                endIdx: lastIdx,
                dir: currentOscDir > 0 ? 'CW' : 'CCW',
                angle: oscAngle,
                duration: dtOsc,
                maxTurnRate: maxOscTurnRate
            });
        }
    }

    let chain = [];
    for (let o = 0; o < oscillations.length; o++) {
        const curr = oscillations[o];
        if (chain.length === 0) {
            chain.push(curr);
            continue;
        }

        const prev = chain[chain.length - 1];
        const gap = (points[curr.startIdx].timeSeconds || curr.startIdx) - (points[prev.endIdx].timeSeconds || prev.endIdx);

        if (curr.dir !== prev.dir && gap <= 6.0) {
            chain.push(curr);
        } else {
            if (chain.length >= 3) {
                processOscillationChain(chain, points, stepVarios, detectedEvents, stepSpeeds, touchdownTime, minLandingAlt);
            }
            chain = [curr];
        }
    }
    if (chain.length >= 3) {
        processOscillationChain(chain, points, stepVarios, detectedEvents, stepSpeeds, touchdownTime, minLandingAlt);
    }

    return detectedEvents;
}

function processOscillationChain(chain, points, stepVarios, detectedEvents, stepSpeeds = [], touchdownTime = 0, minLandingAlt = 0) {
    const sIdx = chain[0].startIdx;
    const eIdx = chain[chain.length - 1].endIdx;
    const startTimeSec = points[sIdx].timeSeconds || sIdx;
    const endTimeSec = points[eIdx].timeSeconds || eIdx;

    // Suppress maneuvers on final landing approach (within 35s of touchdown or within 35m AGL of landing field)
    if ((touchdownTime > 0 && endTimeSec >= touchdownTime - 35) || (minLandingAlt < Infinity && (points[eIdx].alt - minLandingAlt) < 35)) {
        return;
    }

    const duration = Math.max(1, endTimeSec - startTimeSec);
    const altStart = points[sIdx].alt !== undefined ? points[sIdx].alt : 0;
    const altEnd = points[eIdx].alt !== undefined ? points[eIdx].alt : 0;
    const altDelta = altEnd - altStart;
    const avgVz = altDelta / duration;

    let minVz = 0;
    let maxVz = -999;
    let maxSpeed = 0;
    let minSpeed = 999;

    for (let i = sIdx; i < eIdx; i++) {
        if (stepVarios[i] < minVz) minVz = stepVarios[i];
        if (stepVarios[i] > maxVz) maxVz = stepVarios[i];
        const spd = (stepSpeeds && stepSpeeds[i] !== undefined) ? stepSpeeds[i] : (points[i].speedKmh || 0);
        if (spd > maxSpeed) maxSpeed = spd;
        if (spd > 0 && spd < minSpeed) minSpeed = spd;
    }

    const speedDelta = maxSpeed - (minSpeed < 999 ? minSpeed : maxSpeed);
    const midPt = points[Math.floor((sIdx + eIdx) / 2)];

    const angles = chain.map(o => o.angle);
    const avgAngle = angles.reduce((sum, a) => sum + a, 0) / chain.length;
    const maxAngle = Math.max(...angles);
    const maxTurnRate = Math.max(...chain.map(o => o.maxTurnRate || 0));

    // Dynamic paragliding classification matrix:
    // 1. Wingover (Figure-8 loops, Acro/SIV)
    const hasWingoverAngle = (maxAngle >= 175 && avgAngle >= 155) || (avgAngle >= 170);
    const hasDynamicEnergy = minVz <= -2.5 && (speedDelta >= 8 || maxTurnRate >= 15);

    if (hasWingoverAngle && hasDynamicEnergy) {
        detectedEvents.push({
            type: MANEUVER_KEYS.WINGOVER,
            startIndex: sIdx,
            endIndex: eIdx,
            lat: midPt.lat,
            lon: midPt.lon,
            alt: midPt.alt,
            timeSeconds: points[sIdx].timeSeconds,
            durationSeconds: duration,
            avgAngle: Math.round(avgAngle),
            maxAngle: Math.round(maxAngle),
            minVz: Number(minVz.toFixed(1)),
            avgVz: Number(avgVz.toFixed(1)),
            chainCount: chain.length,
            details: 'Wingover: ' + chain.length + ' oscillazioni ad 8 (avg ' + Math.round(avgAngle) + '°, max ' + Math.round(maxAngle) + '°), Vz peak ' + minVz.toFixed(1) + ' m/s'
        });
        return;
    }

    // 2. Pilotaggio con le Orecchie
    const hasOrecchieSink = avgVz <= -1.8 && minVz <= -2.0 && maxVz <= 0.3;
    const hasOrecchieAngles = avgAngle >= 55 && avgAngle <= 130 && maxAngle <= 145;
    const hasOrecchieTurnRate = maxTurnRate >= 3.5 && maxTurnRate <= 13.5;

    if (hasOrecchieSink && hasOrecchieAngles && hasOrecchieTurnRate) {
        detectedEvents.push({
            type: MANEUVER_KEYS.ORECCHIE,
            startIndex: sIdx,
            endIndex: eIdx,
            lat: midPt.lat,
            lon: midPt.lon,
            alt: midPt.alt,
            timeSeconds: points[sIdx].timeSeconds,
            durationSeconds: duration,
            avgAngle: Math.round(avgAngle),
            maxAngle: Math.round(maxAngle),
            minVz: Number(minVz.toFixed(1)),
            avgVz: Number(avgVz.toFixed(1)),
            chainCount: chain.length,
            details: 'Pilotaggio con orecchie: ' + chain.length + ' virate a peso (avg ' + Math.round(avgAngle) + '°), Vz medio ' + avgVz.toFixed(1) + ' m/s'
        });
        return;
    }

    // 3. Inversioni di rollio acrobatiche
    const hasInversioniAcro = avgAngle >= 55 && minVz <= -1.5 && avgVz <= -1.2 && maxSpeed >= 38 && speedDelta >= 10 && maxTurnRate >= 14;

    if (hasInversioniAcro) {
        detectedEvents.push({
            type: MANEUVER_KEYS.INVERSIONI,
            startIndex: sIdx,
            endIndex: eIdx,
            lat: midPt.lat,
            lon: midPt.lon,
            alt: midPt.alt,
            timeSeconds: points[sIdx].timeSeconds,
            durationSeconds: duration,
            avgAngle: Math.round(avgAngle),
            maxAngle: Math.round(maxAngle),
            minVz: Number(minVz.toFixed(1)),
            avgVz: Number(avgVz.toFixed(1)),
            chainCount: chain.length,
            details: 'Inversioni di rollio: ' + chain.length + ' pendolate dinamiche (avg ' + Math.round(avgAngle) + '°, max ' + Math.round(maxAngle) + '°), ΔV ' + Math.round(speedDelta) + ' km/h'
        });
    }
}
