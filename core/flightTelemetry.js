/**
 * Flight Telemetry & Kinematics Engine for GlideMind
 * Pure headless calculations for paragliding track logs (.IGC / GPS):
 *  - LTTB (Largest Triangle Three Buckets) downsampling for 60 FPS Canvas rendering.
 *  - Altitude smoothing and GNSS noise rejection.
 *  - Ground speed, variometer, and glide ratio (L/D) kinematics.
 *  - Accumulated elevation gain (thermal vs soaring).
 *  - Flight phase segmentation (Takeoff, Thermal, Soaring, Glide, Descent, Landing).
 *  - FAI vario color mapping and CSS timeline gradient generation.
 * 
 * Headless module with zero DOM dependencies.
 */

import { computeDistanceKm, computeBearing, angularDifference } from './geoSpatialMath.js';
import { detectThermals, detectFlightManeuvers, degToCardinal, smoothAltitudes } from './flightManeuvers.js';

export const CURRENT_TELEMETRY_ENGINE_VERSION = 8;

/**
 * Standard FAI / Ogoy 6-band vario color definitions.
 */
export const VARIO_BANDS = Object.freeze([
    { r: 0.86, g: 0.15, b: 0.15, hex: 0xdc2626, css: '#dc2626', label: 'Salita Forte' },
    { r: 0.92, g: 0.35, b: 0.05, hex: 0xea580c, css: '#ea580c', label: 'Salita Moderata' },
    { r: 0.96, g: 0.62, b: 0.04, hex: 0xf59e0b, css: '#f59e0b', label: 'Salita Debole' },
    { r: 0.06, g: 0.73, b: 0.51, hex: 0x10b981, css: '#10b981', label: 'Planata' },
    { r: 0.01, g: 0.52, b: 0.78, hex: 0x0284c7, css: '#0284c7', label: 'Discesa' },
    { r: 0.26, g: 0.22, b: 0.79, hex: 0x4338ca, css: '#4338ca', label: 'Discesa Forte' }
]);

/**
 * Standard paragliding flight phase color definitions (Tailwind & Hex).
 */
export const FLIGHT_PHASE_COLORS = Object.freeze({
    takeoff: '#64748b', // Slate 500 (Decollo)
    thermal: '#f59e0b', // Amber 500 (Termica)
    soaring: '#10b981', // Emerald 500 (Dinamica)
    glide:   '#0ea5e9', // Sky Blue 500 (Planata)
    descent: '#a855f7', // Purple 500 (Discesa)
    landing: '#475569'  // Slate 600 (Atterraggio)
});

/**
 * Calculates initial Great-Circle bearing in degrees [0, 360).
 */
export function calculateBearing(lat1, lon1, lat2, lon2) {
    return computeBearing(lat1, lon1, lat2, lon2);
}

/**
 * Calculates shortest signed angular difference between two bearings in degrees [-180, 180].
 */
export function calculateAngularDelta(b1, b2) {
    return angularDifference(b1, b2);
}

export { degToCardinal, smoothAltitudes };

/**
 * Maps a vertical speed (vario in m/s) to an RGB color based on FAI / Ogoy standard palettes:
 * - Salita Forte (>= +3.0 m/s): #dc2626 (Fiery Red)
 * - Salita Moderata (+1.5 to +3.0 m/s): #ea580c (Orange)
 * - Salita Debole (+0.2 to +1.5 m/s): #f59e0b (Yellow-Amber)
 * - Planata (-0.8 to +0.2 m/s): #10b981 (Emerald Green)
 * - Discesa (-2.0 to -0.8 m/s): #0284c7 (Light Blue)
 * - Discesa Forte (<= -2.0 m/s): #4338ca (Deep Indigo / Violet)
 * 
 * @param {number} vario Vertical speed in m/s
 * @returns {{ r: number, g: number, b: number, hex: number, css: string, label: string }}
 */
export function sampleVarioRgb(vario) {
    const v = (typeof vario === 'number' && !isNaN(vario)) ? vario : 0;

    if (v >= 3.0) {
        return VARIO_BANDS[0];
    } else if (v >= 1.5) {
        return VARIO_BANDS[1];
    } else if (v >= 0.2) {
        return VARIO_BANDS[2];
    } else if (v >= -0.8) {
        return VARIO_BANDS[3];
    } else if (v >= -2.0) {
        return VARIO_BANDS[4];
    } else {
        return VARIO_BANDS[5];
    }
}

/**
 * Largest-Triangle-Three-Buckets (LTTB) adaptive downsampling algorithm.
 * Reduces large GPS tracklogs (2,000 - 50,000 points) down to target display samples
 * while strictly preserving perceptual peaks, valleys, and turning points for 60 FPS Canvas rendering.
 * 
 * Complexity: O(N) linear time, single pass.
 * 
 * @param {Array<Object>} points Array of trackpoints with timeSeconds and numeric metricKey
 * @param {number} targetCount Desired number of points in decimated array (targetCount >= 2)
 * @param {string} [metricKey='alt'] Key to use for triangular area maximization
 * @returns {Array<Object>} Decimated points array of length targetCount
 */
export function lttbDecimate(points, targetCount, metricKey = 'alt') {
    if (!Array.isArray(points) || points.length <= targetCount || targetCount <= 2) {
        return points ? [...points] : [];
    }

    const n = points.length;
    const sampled = new Array(targetCount);
    sampled[0] = points[0];

    const bucketSize = (n - 2) / (targetCount - 2);
    let aIdx = 0;

    for (let i = 0; i < targetCount - 2; i++) {
        const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
        const bucketEnd = Math.min(n - 1, Math.floor((i + 2) * bucketSize) + 1);

        // Calculate average point C of next bucket (or last point if last bucket)
        let avgX = 0;
        let avgY = 0;
        let nextCount = 0;
        const nextBucketStart = Math.min(n - 1, Math.floor((i + 2) * bucketSize) + 1);
        const nextBucketEnd = Math.min(n, Math.floor((i + 3) * bucketSize) + 1);

        for (let j = nextBucketStart; j < nextBucketEnd; j++) {
            avgX += points[j].timeSeconds ?? j;
            avgY += points[j][metricKey] ?? 0;
            nextCount++;
        }
        if (nextCount > 0) {
            avgX /= nextCount;
            avgY /= nextCount;
        } else {
            avgX = points[n - 1].timeSeconds ?? (n - 1);
            avgY = points[n - 1][metricKey] ?? 0;
        }

        // Point A
        const ptA = points[aIdx];
        const aX = ptA.timeSeconds ?? aIdx;
        const aY = ptA[metricKey] ?? 0;

        // Current bucket points: find point B that maximizes triangle area
        const currentBucketStart = Math.floor(i * bucketSize) + 1;
        const currentBucketEnd = bucketStart;

        let maxArea = -1;
        let maxIdx = currentBucketStart;

        for (let j = currentBucketStart; j < currentBucketEnd; j++) {
            const bX = points[j].timeSeconds ?? j;
            const bY = points[j][metricKey] ?? 0;
            const area = Math.abs((aX - avgX) * (bY - aY) - (aX - bX) * (avgY - aY)) * 0.5;
            if (area > maxArea) {
                maxArea = area;
                maxIdx = j;
            }
        }

        sampled[i + 1] = points[maxIdx];
        aIdx = maxIdx;
    }

    sampled[targetCount - 1] = points[n - 1];
    return sampled;
}

export { lttbDecimate as decimateLTTB };

/**
 * Calculates ground speed in km/h between two track points.
 * @param {Object} p1 
 * @param {Object} p2 
 * @returns {number} Speed in km/h
 */
export function calculateGroundSpeedKmh(p1, p2) {
    if (!p1 || !p2) return 0;
    const dt = Math.abs((p2.timeSeconds || 0) - (p1.timeSeconds || 0));
    if (dt <= 0) return 0;
    const distKm = computeDistanceKm(p1.lat, p1.lon, p2.lat, p2.lon);
    return Math.round((distKm / (dt / 3600)) * 10) / 10;
}

/**
 * Calculates aerodynamic glide ratio (L/D - Efficienza) between two trackpoints or along a glide leg.
 * Formula: Glide Ratio = Horizontal Distance / Vertical Altitude Drop
 * 
 * @param {number|Object} p1OrDist Distance in km, or point 1
 * @param {number|Object} p2OrAltDrop Altitude drop in meters, or point 2
 * @returns {number} Glide ratio (e.g. 8.5) or Infinity if climbing/flat
 */
export function calculateGlideRatio(p1OrDist, p2OrAltDrop) {
    let distMeters = 0;
    let altDropMeters = 0;

    if (typeof p1OrDist === 'object' && typeof p2OrAltDrop === 'object') {
        const p1 = p1OrDist;
        const p2 = p2OrAltDrop;
        distMeters = computeDistanceKm(p1.lat, p1.lon, p2.lat, p2.lon) * 1000;
        altDropMeters = (p1.alt || 0) - (p2.alt || 0);
    } else {
        distMeters = (Number(p1OrDist) || 0) * 1000;
        altDropMeters = Number(p2OrAltDrop) || 0;
    }

    if (altDropMeters <= 0) return Infinity;
    const ratio = distMeters / altDropMeters;
    return Math.round(ratio * 10) / 10;
}

/**
 * Calculates total accumulated positive elevation gain (Σ Δh+) with noise thresholding.
 * Separates thermal climb gain from dynamic ridge soaring gain.
 * 
 * @param {Array<Object>} points Track points
 * @param {Array<Object>} [thermals=[]] Detected thermals
 * @param {Array<number>} [smoothedAlts=null] Pre-computed smoothed altitudes
 * @returns {{ accumulatedClimbMeters: number, thermalGainMeters: number, soaringGainMeters: number }}
 */
export function calculateAccumulatedGain(points, thermals = [], smoothedAlts = null) {
    if (!points || !Array.isArray(points) || points.length < 2) {
        return { accumulatedClimbMeters: 0, thermalGainMeters: 0, soaringGainMeters: 0 };
    }

    const alts = smoothedAlts || smoothAltitudes(points, 3);
    const n = points.length;

    // Fast lookup for points inside thermals
    const inThermalLookup = new Uint8Array(n);
    if (thermals && Array.isArray(thermals)) {
        for (const th of thermals) {
            for (let i = th.startIndex; i <= th.endIndex && i < n; i++) {
                inThermalLookup[i] = 1;
            }
        }
    }

    let thermalGain = 0;
    let soaringGain = 0;
    const minStepClimb = 0.2; // Minimum 20cm step threshold to reject high-frequency jitter

    for (let i = 1; i < n; i++) {
        const dz = alts[i] - alts[i - 1];
        if (dz >= minStepClimb) {
            if (inThermalLookup[i] === 1) {
                thermalGain += dz;
            } else {
                soaringGain += dz;
            }
        }
    }

    const thermalRounded = Math.round(thermalGain);
    const soaringRounded = Math.round(soaringGain);
    const totalAccumulated = thermalRounded + soaringRounded;

    return {
        accumulatedClimbMeters: totalAccumulated,
        thermalGainMeters: thermalRounded,
        soaringGainMeters: soaringRounded
    };
}

/**
 * Segments the flight into standard paragliding flight phases:
 *  - takeoff: First 45s (or 10% of total flight time)
 *  - landing: Last 45s (or 10% of total flight time)
 *  - thermal: Points within detected circling thermals
 *  - soaring: Level flight or climbing along slope without circling (Vz > -0.8 m/s)
 *  - glide: Normal trim sink (-0.8 to -2.5 m/s)
 *  - descent: Rapid descent maneuvers (Vz < -2.5 m/s)
 * 
 * @param {Array<Object>} points Track points
 * @param {Array<Object>} [thermals=[]] Detected thermals
 * @param {Array<number>} [smoothedAlts=null] Smoothed altitudes
 * @returns {Object} Phase breakdown durations, percentages, and chronological timeline segments
 */
export function segmentFlightPhases(points, thermals = [], smoothedAlts = null) {
    if (!points || !Array.isArray(points) || points.length < 2) {
        return {
            takeoff: { durationSeconds: 0, percentage: 0 },
            thermal: { durationSeconds: 0, percentage: 0 },
            soaring: { durationSeconds: 0, percentage: 0 },
            glide: { durationSeconds: 0, percentage: 0 },
            descent: { durationSeconds: 0, percentage: 0 },
            landing: { durationSeconds: 0, percentage: 0 },
            timeline: []
        };
    }

    const alts = smoothedAlts || smoothAltitudes(points, 3);
    const n = points.length;
    const totalDurationSeconds = Math.max(1, (points[n - 1].timeSeconds || (n - 1)) - (points[0].timeSeconds || 0));

    const pointPhases = new Array(n);

    // Mark thermals first
    if (thermals && Array.isArray(thermals)) {
        for (const th of thermals) {
            if (typeof th.startIndex === 'number' && typeof th.endIndex === 'number') {
                for (let i = Math.max(0, th.startIndex); i <= Math.min(n - 1, th.endIndex); i++) {
                    pointPhases[i] = 'thermal';
                }
            } else if (typeof th.startTimeSeconds === 'number') {
                const thStart = th.startTimeSeconds;
                const thEnd = typeof th.endTimeSeconds === 'number'
                    ? th.endTimeSeconds
                    : (thStart + (th.durationSeconds || (th.durationMinutes || 3) * 60));
                for (let i = 0; i < n; i++) {
                    const t = points[i].timeSeconds !== undefined ? points[i].timeSeconds : i;
                    if (t >= thStart && t <= thEnd) {
                        pointPhases[i] = 'thermal';
                    }
                }
            }
        }
    }

    // Takeoff phase: First 45s (or up to 10% of total flight time)
    const takeoffLimitSeconds = (points[0].timeSeconds || 0) + Math.min(45, Math.floor(totalDurationSeconds * 0.1));
    for (let i = 0; i < n && (points[i].timeSeconds || i) <= takeoffLimitSeconds; i++) {
        if (!pointPhases[i]) pointPhases[i] = 'takeoff';
    }

    // Landing phase: Last 45s (or up to 10% of total flight time)
    const landingLimitSeconds = (points[n - 1].timeSeconds || (n - 1)) - Math.min(45, Math.floor(totalDurationSeconds * 0.1));
    for (let i = n - 1; i >= 0 && (points[i].timeSeconds || i) >= landingLimitSeconds; i--) {
        if (!pointPhases[i]) pointPhases[i] = 'landing';
    }

    // Classify intermediate points
    for (let i = 0; i < n; i++) {
        if (pointPhases[i]) continue;

        const prevPt = i > 0 ? points[i - 1] : points[0];
        const dt = Math.max(1, (points[i].timeSeconds || i) - (prevPt.timeSeconds || (i > 0 ? i - 1 : 0)));
        const dz = alts[i] - alts[Math.max(0, i - 1)];
        const vario = (typeof points[i].vario === 'number' && !isNaN(points[i].vario)) ? points[i].vario : (dz / dt);

        if (vario > -0.8) {
            pointPhases[i] = 'soaring';
        } else if (vario < -2.5) {
            pointPhases[i] = 'descent';
        } else {
            pointPhases[i] = 'glide';
        }
    }

    // Anti-jitter smoothing: filter isolated 1-sample spikes between identical phases
    for (let i = 2; i < n - 2; i++) {
        if (pointPhases[i] !== pointPhases[i - 1] && pointPhases[i - 1] === pointPhases[i + 1]) {
            pointPhases[i] = pointPhases[i - 1];
        }
    }

    // Tally phase durations
    const durations = {
        takeoff: 0,
        thermal: 0,
        soaring: 0,
        glide: 0,
        descent: 0,
        landing: 0
    };

    for (let i = 1; i < n; i++) {
        const dt = Math.max(0, (points[i].timeSeconds || i) - (points[i - 1].timeSeconds || (i - 1)));
        const phase = pointPhases[i] || 'glide';
        if (durations[phase] !== undefined) {
            durations[phase] += dt;
        }
    }

    // Group contiguous points with the same phase into chronological timeline segments
    const timeline = [];
    if (n > 1) {
        let currentPhase = pointPhases[0] || 'takeoff';
        let segStartIndex = 0;
        let segStartSec = points[0].timeSeconds || 0;

        for (let i = 1; i < n; i++) {
            const phase = pointPhases[i] || 'glide';
            if (phase !== currentPhase) {
                const segEndSec = points[i].timeSeconds !== undefined ? points[i].timeSeconds : i;
                const segDur = Math.max(1, segEndSec - segStartSec);
                const segPct = Math.round(((segDur / totalDurationSeconds) * 100) * 10) / 10;

                timeline.push({
                    phase: currentPhase,
                    startIndex: segStartIndex,
                    endIndex: i,
                    startTimeSeconds: segStartSec,
                    endTimeSeconds: segEndSec,
                    durationSeconds: segDur,
                    percentage: segPct,
                    startTimeFormatted: points[segStartIndex].timeFormatted || '',
                    endTimeFormatted: points[i].timeFormatted || ''
                });

                currentPhase = phase;
                segStartIndex = i;
                segStartSec = segEndSec;
            }
        }

        const lastSec = points[n - 1].timeSeconds !== undefined ? points[n - 1].timeSeconds : (n - 1);
        const lastDur = Math.max(1, lastSec - segStartSec);
        timeline.push({
            phase: currentPhase,
            startIndex: segStartIndex,
            endIndex: n - 1,
            startTimeSeconds: segStartSec,
            endTimeSeconds: Math.max(segStartSec + 1, lastSec),
            durationSeconds: lastDur,
            percentage: Math.round(((lastDur / totalDurationSeconds) * 100) * 10) / 10,
            startTimeFormatted: points[segStartIndex].timeFormatted || '',
            endTimeFormatted: points[n - 1].timeFormatted || ''
        });
    }

    return {
        takeoff: { durationSeconds: durations.takeoff, percentage: Math.round((durations.takeoff / totalDurationSeconds) * 100) },
        thermal: { durationSeconds: durations.thermal, percentage: Math.round((durations.thermal / totalDurationSeconds) * 100) },
        soaring: { durationSeconds: durations.soaring, percentage: Math.round((durations.soaring / totalDurationSeconds) * 100) },
        glide: { durationSeconds: durations.glide, percentage: Math.round((durations.glide / totalDurationSeconds) * 100) },
        descent: { durationSeconds: durations.descent, percentage: Math.round((durations.descent / totalDurationSeconds) * 100) },
        landing: { durationSeconds: durations.landing, percentage: Math.round((durations.landing / totalDurationSeconds) * 100) },
        timeline
    };
}

/**
 * Extracts and unifies chronological flight phase segments across Logbook and 3D Replay.
 * 
 * @param {Object} flight Flight object or track representation
 * @returns {Array<{phase: string, color: string, startPct: number, endPct: number, durationSeconds: number, startTimeFormatted: string, endTimeFormatted: string}>}
 */
export function getUnifiedFlightPhaseSegments(flight) {
    if (!flight) return [];
    const pts = flight.points || flight.trackPoints || flight.projectedPoints || [];
    if (pts.length < 2) return [];

    const firstTime = pts[0].timeSeconds !== undefined ? pts[0].timeSeconds : 0;
    const lastTime = pts[pts.length - 1].timeSeconds !== undefined
        ? pts[pts.length - 1].timeSeconds
        : (firstTime + (flight.durationMinutes || 30) * 60);
    const totalDuration = Math.max(1, lastTime - firstTime);

    const thermals = flight?.telemetry?.thermals || [];
    const phases = flight?.telemetry?.phases || (pts.length >= 2 ? segmentFlightPhases(pts, thermals) : null);
    const timeline = phases?.timeline;

    if (Array.isArray(timeline) && timeline.length > 0) {
        const segments = [];
        for (const seg of timeline) {
            const color = FLIGHT_PHASE_COLORS[seg.phase] || FLIGHT_PHASE_COLORS.glide;
            let startSec = seg.startTimeSeconds;
            let endSec = seg.endTimeSeconds;
            if (typeof startSec !== 'number') {
                const startPt = pts[Math.min(pts.length - 1, seg.startIndex || 0)] || pts[0];
                startSec = startPt.timeSeconds !== undefined ? startPt.timeSeconds : firstTime;
            }
            if (typeof endSec !== 'number') {
                const endPt = pts[Math.min(pts.length - 1, seg.endIndex || (pts.length - 1))] || pts[pts.length - 1];
                endSec = endPt.timeSeconds !== undefined ? endPt.timeSeconds : lastTime;
            }
            const startPct = Math.max(0, Math.min(100, ((startSec - firstTime) / totalDuration) * 100));
            const endPct = Math.max(0, Math.min(100, ((endSec - firstTime) / totalDuration) * 100));
            if (endPct > startPct) {
                segments.push({
                    phase: seg.phase,
                    color,
                    startPct: Math.round(startPct * 100) / 100,
                    endPct: Math.round(endPct * 100) / 100,
                    durationSeconds: Math.max(1, endSec - startSec),
                    startTimeFormatted: seg.startTimeFormatted || '',
                    endTimeFormatted: seg.endTimeFormatted || '',
                    startTimeSeconds: startSec,
                    endTimeSeconds: endSec
                });
            }
        }
        if (segments.length > 0) return segments;
    }

    return [{
        phase: 'glide',
        color: FLIGHT_PHASE_COLORS.glide,
        startPct: 0,
        endPct: 100,
        durationSeconds: totalDuration,
        startTimeFormatted: '',
        endTimeFormatted: '',
        startTimeSeconds: firstTime,
        endTimeSeconds: lastTime
    }];
}

/**
 * Generates discrete solid CSS linear-gradient blocks representing the flight phases.
 * 
 * @param {Object} flight
 * @returns {string} CSS linear-gradient string
 */
export function generateFlightPhaseGradient(flight) {
    const segments = getUnifiedFlightPhaseSegments(flight);
    if (!segments || segments.length === 0) {
        return `linear-gradient(to right, ${FLIGHT_PHASE_COLORS.glide} 0%, ${FLIGHT_PHASE_COLORS.glide} 100%)`;
    }

    const stops = [];
    for (const seg of segments) {
        if (seg.endPct <= seg.startPct) continue;
        stops.push(`${seg.color} ${seg.startPct.toFixed(2)}%, ${seg.color} ${seg.endPct.toFixed(2)}%`);
    }

    return stops.length > 0 ? `linear-gradient(to right, ${stops.join(', ')})` : `linear-gradient(to right, ${FLIGHT_PHASE_COLORS.glide} 0%, ${FLIGHT_PHASE_COLORS.glide} 100%)`;
}

/**
 * Generates a smooth, continuous CSS linear-gradient matching the FAI vario color palette.
 * 
 * @param {Object} flight Flight object or track points bundle
 * @param {number} [maxStops=120] Maximum number of sampled gradient stops
 * @returns {string} CSS linear-gradient string
 */
export function generateVarioTimelineGradient(flight, maxStops = 120) {
    if (!flight) {
        return 'linear-gradient(to right, #10b981 0%, #10b981 100%)';
    }
    const pts = flight.points || flight.trackPoints || flight.projectedPoints || [];
    if (!Array.isArray(pts) || pts.length < 2) {
        return 'linear-gradient(to right, #10b981 0%, #10b981 100%)';
    }

    const n = pts.length;
    const firstTime = pts[0].timeSeconds !== undefined ? pts[0].timeSeconds : 0;
    const lastTime = pts[n - 1].timeSeconds !== undefined ? pts[n - 1].timeSeconds : (firstTime + (flight.durationMinutes || 30) * 60);

    const stepCount = Math.min(maxStops, Math.max(20, n));
    const stops = [];

    for (let s = 0; s <= stepCount; s++) {
        const u = s / stepCount;
        let pIdx = Math.min(n - 1, Math.max(0, Math.floor(u * (n - 1))));
        const pt = pts[pIdx];
        let vario = pt.vario;
        if (vario === undefined || isNaN(vario)) {
            if (pIdx > 0) {
                const prev = pts[pIdx - 1];
                const dt = Math.max(0.5, (pt.timeSeconds || pIdx) - (prev.timeSeconds || (pIdx - 1)));
                vario = ((pt.alt || 0) - (prev.alt || 0)) / dt;
            } else {
                vario = 0;
            }
        }

        const col = sampleVarioRgb(vario);
        const pct = (u * 100).toFixed(2);
        stops.push(`${col.css} ${pct}%`);
    }

    return stops.length > 0
        ? `linear-gradient(to right, ${stops.join(', ')})`
        : 'linear-gradient(to right, #10b981 0%, #10b981 100%)';
}

/**
 * Analyzes full flight telemetry: altitude smoothing, thermals, gains,
 * flight phases, peak climb/sink rates, dominant wind drift, and maneuvers.
 * 
 * @param {Array<Object>} points Track points
 * @param {Object} [options={}] Optional configuration
 * @returns {Object} Complete telemetry analysis
 */
export function analyzeFlightTelemetry(points, options = {}) {
    if (!points || !Array.isArray(points) || points.length < 5) {
        return {
            engineVersion: CURRENT_TELEMETRY_ENGINE_VERSION,
            pointsCount: points ? points.length : 0,
            thermals: [],
            thermalCount: 0,
            accumulatedClimbMeters: 0,
            thermalGainMeters: 0,
            soaringGainMeters: 0,
            maxThermalGain: 0,
            bestThermal: null,
            phases: segmentFlightPhases(points || [], []),
            dominantWindDrift: null,
            totalDistanceKm: 0,
            maxClimbRate: 0,
            maxSinkRate: 0,
            maneuvers: [],
            detectedManeuverKeys: []
        };
    }

    const smoothedAlts = smoothAltitudes(points, 3);
    const thermals = detectThermals(points, smoothedAlts);
    const gains = calculateAccumulatedGain(points, thermals, smoothedAlts);
    const phases = segmentFlightPhases(points, thermals, smoothedAlts);

    let totalDistKm = 0;
    let maxClimbRate = 0;
    let maxSinkRate = 0;

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const d = computeDistanceKm(prev.lat, prev.lon, curr.lat, curr.lon);
        totalDistKm += d;

        const dt = Math.max(1, (curr.timeSeconds || i) - (prev.timeSeconds || (i - 1)));
        const dz = smoothedAlts[i] - smoothedAlts[i - 1];
        const vario = Math.round((dz / dt) * 10) / 10;

        if (vario > maxClimbRate) maxClimbRate = vario;
        if (vario < maxSinkRate) maxSinkRate = vario;
    }

    // Best thermal
    let bestThermal = null;
    let maxGain = 0;
    for (const th of thermals) {
        if (th.altGain > maxGain) {
            maxGain = th.altGain;
            bestThermal = th;
        }
    }

    // Dominant wind drift from thermals
    let dominantWind = null;
    if (thermals.length > 0) {
        let sumDriftSpeed = 0;
        let sumOriginDeg = 0;
        let count = 0;
        for (const th of thermals) {
            if (th.windDrift && th.windDrift.driftSpeedKmh > 2) {
                sumDriftSpeed += th.windDrift.driftSpeedKmh;
                sumOriginDeg += th.windDrift.windOriginDeg;
                count++;
            }
        }
        if (count > 0) {
            const avgSpeed = Math.round((sumDriftSpeed / count) * 10) / 10;
            const avgDeg = Math.round((sumOriginDeg / count) % 360);
            dominantWind = {
                speedKmh: avgSpeed,
                originDeg: avgDeg,
                cardinal: degToCardinal(avgDeg)
            };
        }
    }

    const maneuvers = detectFlightManeuvers(points, smoothedAlts, thermals);
    const detectedManeuverKeys = Array.from(new Set(maneuvers.map(m => m.type)));

    return {
        engineVersion: CURRENT_TELEMETRY_ENGINE_VERSION,
        pointsCount: points.length,
        thermals,
        thermalCount: thermals.length,
        accumulatedClimbMeters: gains.accumulatedClimbMeters,
        thermalGainMeters: gains.thermalGainMeters,
        soaringGainMeters: gains.soaringGainMeters,
        maxThermalGain: maxGain,
        bestThermal,
        phases,
        dominantWindDrift: dominantWind,
        totalDistanceKm: Math.round(totalDistKm * 10) / 10,
        maxClimbRate: Math.round(maxClimbRate * 10) / 10,
        maxSinkRate: Math.round(maxSinkRate * 10) / 10,
        maneuvers,
        detectedManeuverKeys
    };
}
