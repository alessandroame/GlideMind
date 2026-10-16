/**
 * GlideMind - Flight Replay Mathematics & Kinematics Engine (Headless Core)
 * 
 * Provides pure mathematical utilities with ZERO DOM / WebGL / Three.js dependencies:
 * 1. Aerodynamic coordinated bank angle (roll) calculation
 * 2. Kinematic flight path pitch angle calculation
 * 3. Shortest-path angle interpolation and Hermite/linear sample interpolation
 * 4. Perspective projection minimum scale for 3D paraglider avatar
 * 5. Topocentric metric space projection for Three.js local coordinate frame (Y-Up, X-East, Z-South)
 * 
 * 100% testable in pure Node.js environments.
 */

import { computeBearing, computeDistanceKm } from './geoSpatialMath.js';
import { calculateAngularDelta } from './flightManeuvers.js';

export const STANDARD_GRAVITY = 9.80665; // m/s^2

/**
 * Calculates aerodynamic coordinated bank angle (roll) in degrees.
 * Based on paragliding turn dynamics: tan(phi) = (v * omega) / g
 * 
 * @param {number} turnRateDegSec Rate of turn in degrees per second (positive = right turn)
 * @param {number} groundSpeedMs True airspeed or ground speed in m/s
 * @param {object} [options]
 * @param {number} [options.maxBankDeg=65] Maximum clamp angle in degrees
 * @param {boolean} [options.inRadians=false] Return in radians instead of degrees
 * @returns {number} Coordinated bank angle (positive = right wing down)
 */
export function calculateCoordinatedBankAngle(turnRateDegSec, groundSpeedMs, { maxBankDeg = 65, inRadians = false } = {}) {
  if (!turnRateDegSec || isNaN(turnRateDegSec) || !groundSpeedMs || isNaN(groundSpeedMs) || groundSpeedMs <= 0) {
    return 0;
  }

  // Turn rate in radians per second: omega = turnRate * (PI / 180)
  const omegaRadSec = (turnRateDegSec * Math.PI) / 180;
  
  // Centripetal acceleration: a_c = v * omega
  const centripetalAcc = groundSpeedMs * omegaRadSec;
  
  // tan(bankAngle) = a_c / g
  const bankAngleRad = Math.atan2(centripetalAcc, STANDARD_GRAVITY);
  
  const maxBankRad = (maxBankDeg * Math.PI) / 180;
  const clampedRad = Math.max(-maxBankRad, Math.min(maxBankRad, bankAngleRad));

  if (inRadians) {
    return clampedRad === 0 ? 0 : clampedRad;
  }

  const deg = (clampedRad * 180) / Math.PI;
  return deg === 0 ? 0 : Math.round(deg * 10) / 10;
}

/**
 * Calculates kinematic pitch angle of the flight path in degrees.
 * Based on vertical velocity and horizontal velocity: tan(pitch) = vz / v_horizontal
 * 
 * @param {number} vzMs Vertical speed (vario) in m/s (positive = climb, negative = sink)
 * @param {number} groundSpeedMs Horizontal ground speed in m/s
 * @param {object} [options]
 * @param {number} [options.maxPitchDeg=45] Maximum clamp angle in degrees
 * @param {boolean} [options.inRadians=false] Return in radians instead of degrees
 * @returns {number} Kinematic pitch angle (positive = nose up, negative = nose down)
 */
export function calculateKinematicPitchAngle(vzMs, groundSpeedMs, { maxPitchDeg = 45, inRadians = false } = {}) {
  if (vzMs === undefined || vzMs === null || isNaN(vzMs)) {
    return 0;
  }
  
  const vHorizontal = Math.max(0, groundSpeedMs || 0);

  if (vHorizontal < 0.1) {
    if (vzMs === 0) return 0;
    const maxPitchRad = (maxPitchDeg * Math.PI) / 180;
    const sign = Math.sign(vzMs);
    return inRadians ? sign * maxPitchRad : sign * maxPitchDeg;
  }

  const pitchRad = Math.atan2(vzMs, vHorizontal);
  const maxPitchRad = (maxPitchDeg * Math.PI) / 180;
  const clampedRad = Math.max(-maxPitchRad, Math.min(maxPitchRad, pitchRad));

  if (inRadians) {
    return clampedRad === 0 ? 0 : clampedRad;
  }

  const deg = (clampedRad * 180) / Math.PI;
  return deg === 0 ? 0 : Math.round(deg * 10) / 10;
}

/**
 * Interpolates between two compass bearings in degrees [0, 360) along the shortest angular arc.
 * 
 * @param {number} a1 Initial bearing in degrees
 * @param {number} a2 Final bearing in degrees
 * @param {number} factor Interpolation factor [0, 1]
 * @returns {number} Interpolated bearing in degrees [0, 360)
 */
export function interpolateAngleDegrees(a1, a2, factor) {
  if (a1 === undefined || a1 === null || isNaN(a1)) return a2 || 0;
  if (a2 === undefined || a2 === null || isNaN(a2)) return a1 || 0;

  const t = Math.max(0, Math.min(1, factor));
  const delta = calculateAngularDelta(a1, a2);
  const interpolated = (Number(a1) + delta * t + 360) % 360;
  return interpolated === 0 ? 0 : Math.round(interpolated * 10) / 10;
}

/**
 * Computes Catmull-Rom cubic spline interpolation value for scalar values.
 * 
 * @param {number} p0 Value at index i-1
 * @param {number} p1 Value at index i
 * @param {number} p2 Value at index i+1
 * @param {number} p3 Value at index i+2
 * @param {number} t Interpolation factor [0, 1]
 * @returns {number} Interpolated value
 */
export function interpolateCatmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;

  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

/**
 * Interpolates between two track points with smooth kinematics and orientation.
 * 
 * @param {object} pPrev Previous track point
 * @param {object} pNext Next track point
 * @param {number} factor Fraction between pPrev and pNext [0, 1]
 * @param {object|null} [pPrevPrev=null] Optional point before pPrev for cubic spline
 * @param {object|null} [pNextNext=null] Optional point after pNext for cubic spline
 * @returns {object} Interpolated track point
 */
export function interpolateTrackSample(pPrev, pNext, factor, pPrevPrev = null, pNextNext = null) {
  if (!pPrev && !pNext) return null;
  if (!pPrev) return { ...pNext };
  if (!pNext) return { ...pPrev };

  const t = Math.max(0, Math.min(1, factor));
  if (t === 0) return { ...pPrev };
  if (t === 1) return { ...pNext };

  const hasCubic = pPrevPrev && pNextNext &&
    typeof pPrev.lat === 'number' && typeof pNext.lat === 'number';

  const lat = hasCubic
    ? interpolateCatmullRom(pPrevPrev.lat, pPrev.lat, pNext.lat, pNextNext.lat, t)
    : pPrev.lat + (pNext.lat - pPrev.lat) * t;

  const lon = hasCubic
    ? interpolateCatmullRom(pPrevPrev.lon, pPrev.lon, pNext.lon, pNextNext.lon, t)
    : pPrev.lon + (pNext.lon - pPrev.lon) * t;

  const alt = hasCubic && typeof pPrev.alt === 'number'
    ? interpolateCatmullRom(pPrevPrev.alt || pPrev.alt, pPrev.alt, pNext.alt, pNextNext.alt || pNext.alt, t)
    : (pPrev.alt || 0) + ((pNext.alt || 0) - (pPrev.alt || 0)) * t;

  const timeSeconds = (pPrev.timeSeconds ?? 0) + ((pNext.timeSeconds ?? 0) - (pPrev.timeSeconds ?? 0)) * t;
  const speedKmh = (pPrev.speedKmh ?? 38) + ((pNext.speedKmh ?? 38) - (pPrev.speedKmh ?? 38)) * t;
  const vario = (pPrev.vario ?? 0) + ((pNext.vario ?? 0) - (pPrev.vario ?? 0)) * t;

  // Heading interpolation via shortest angular arc
  const heading = interpolateAngleDegrees(pPrev.heading ?? 0, pNext.heading ?? 0, t);

  // Turn rate estimation in deg/s
  const dt = Math.max(0.1, (pNext.timeSeconds ?? 1) - (pPrev.timeSeconds ?? 0));
  const turnRateDegSec = calculateAngularDelta(pPrev.heading ?? 0, pNext.heading ?? 0) / dt;

  // Coordinated bank & kinematic pitch
  const groundSpeedMs = Math.max(0.5, speedKmh / 3.6);
  const bankAngle = calculateCoordinatedBankAngle(turnRateDegSec, groundSpeedMs);
  const pitchAngle = calculateKinematicPitchAngle(vario, groundSpeedMs);

  // Interpolate smoothed multi-window kinematics when available
  const hasSmooth = typeof pPrev.smoothHeading === 'number' && typeof pNext.smoothHeading === 'number';
  const smoothHeading = hasSmooth
    ? interpolateAngleDegrees(pPrev.smoothHeading, pNext.smoothHeading, t)
    : heading;
  const smoothTurnRateDegSec = (typeof pPrev.smoothTurnRateDegSec === 'number' && typeof pNext.smoothTurnRateDegSec === 'number')
    ? Math.round((pPrev.smoothTurnRateDegSec + (pNext.smoothTurnRateDegSec - pPrev.smoothTurnRateDegSec) * t) * 10) / 10
    : Math.round(turnRateDegSec * 10) / 10;
  const smoothBankAngle = (typeof pPrev.smoothBankAngle === 'number' && typeof pNext.smoothBankAngle === 'number')
    ? Math.round((pPrev.smoothBankAngle + (pNext.smoothBankAngle - pPrev.smoothBankAngle) * t) * 10) / 10
    : bankAngle;
  const aerodynamicPitchAngle = (typeof pPrev.aerodynamicPitchAngle === 'number' && typeof pNext.aerodynamicPitchAngle === 'number')
    ? Math.round((pPrev.aerodynamicPitchAngle + (pNext.aerodynamicPitchAngle - pPrev.aerodynamicPitchAngle) * t) * 10) / 10
    : Math.max(-9, Math.min(7, Math.round((pitchAngle * 0.28) * 10) / 10));
  const smoothVario = (typeof pPrev.smoothVario === 'number' && typeof pNext.smoothVario === 'number')
    ? Math.round((pPrev.smoothVario + (pNext.smoothVario - pPrev.smoothVario) * t) * 100) / 100
    : Math.round(vario * 100) / 100;
  const normSmoothBank = Math.min(1, Math.abs(smoothBankAngle) / 42);
  const brakeRight = smoothBankAngle > 0.5 ? Math.round(normSmoothBank * 100) / 100 : 0;
  const brakeLeft = smoothBankAngle < -0.5 ? Math.round(normSmoothBank * 100) / 100 : 0;

  const isThermalOrbit = Boolean(t < 0.5 ? pPrev.isThermalOrbit : pNext.isThermalOrbit);
  const thermalCenterLat = (typeof pPrev.thermalCenterLat === 'number' && typeof pNext.thermalCenterLat === 'number')
    ? Math.round((pPrev.thermalCenterLat + (pNext.thermalCenterLat - pPrev.thermalCenterLat) * t) * 1e7) / 1e7
    : Math.round(lat * 1e7) / 1e7;
  const thermalCenterLon = (typeof pPrev.thermalCenterLon === 'number' && typeof pNext.thermalCenterLon === 'number')
    ? Math.round((pPrev.thermalCenterLon + (pNext.thermalCenterLon - pPrev.thermalCenterLon) * t) * 1e7) / 1e7
    : Math.round(lon * 1e7) / 1e7;

  const result = {
    lat: Math.round(lat * 1e7) / 1e7,
    lon: Math.round(lon * 1e7) / 1e7,
    alt: Math.round(alt * 10) / 10,
    timeSeconds: Math.round(timeSeconds * 10) / 10,
    speedKmh: Math.round(speedKmh * 10) / 10,
    vario: Math.round(vario * 10) / 10,
    heading,
    bankAngle,
    pitchAngle,
    turnRateDegSec: Math.round(turnRateDegSec * 10) / 10,
    smoothHeading,
    smoothTurnRateDegSec,
    smoothBankAngle: smoothBankAngle === 0 ? 0 : smoothBankAngle,
    aerodynamicPitchAngle: aerodynamicPitchAngle === 0 ? 0 : aerodynamicPitchAngle,
    smoothVario,
    brakeLeft,
    brakeRight,
    isThermalOrbit,
    thermalCenterLat,
    thermalCenterLon
  };

  // Interpolate local Cartesian coordinates if present
  if (typeof pPrev.x === 'number' && typeof pNext.x === 'number') {
    const rx = hasCubic && typeof pPrevPrev?.x === 'number' && typeof pNextNext?.x === 'number'
      ? Math.round(interpolateCatmullRom(pPrevPrev.x, pPrev.x, pNext.x, pNextNext.x, t) * 100) / 100
      : Math.round((pPrev.x + (pNext.x - pPrev.x) * t) * 100) / 100;
    result.x = rx === 0 ? 0 : rx;
  }
  if (typeof pPrev.y === 'number' && typeof pNext.y === 'number') {
    const ry = hasCubic && typeof pPrevPrev?.y === 'number' && typeof pNextNext?.y === 'number'
      ? Math.round(interpolateCatmullRom(pPrevPrev.y, pPrev.y, pNext.y, pNextNext.y, t) * 100) / 100
      : Math.round((pPrev.y + (pNext.y - pPrev.y) * t) * 100) / 100;
    result.y = ry === 0 ? 0 : ry;
  }
  if (typeof pPrev.z === 'number' && typeof pNext.z === 'number') {
    const rz = hasCubic && typeof pPrevPrev?.z === 'number' && typeof pNextNext?.z === 'number'
      ? Math.round(interpolateCatmullRom(pPrevPrev.z, pPrev.z, pNext.z, pNextNext.z, t) * 100) / 100
      : Math.round((pPrev.z + (pNext.z - pPrev.z) * t) * 100) / 100;
    result.z = rz === 0 ? 0 : rz;
  }

  return result;
}

/**
 * Calculates the projective minimum scale multiplier for a 3D avatar
 * so it never disappears into a subpixel dot at large camera distances.
 * 
 * Formula:
 * Projected height P = (S * viewportHeight) / (2 * cameraDistance * tan(fov / 2))
 * Desired min scale M = max(1.0, (2 * cameraDistance * tan(fov / 2) * minPixelSize) / (S * viewportHeight))
 * 
 * @param {number} cameraDistanceMeters Distance from camera to avatar in meters
 * @param {number} [fovDeg=60] Camera vertical Field of View in degrees
 * @param {number} [viewportHeightPx=800] Canvas height in pixels
 * @param {number} [minPixelSize=36] Minimum screen pixel size target
 * @param {number} [physicalSpanMeters=10] Real physical size of avatar in meters
 * @param {number} [maxScale=100.0] Maximum magnification cap
 * @returns {number} Scale multiplier (>= 1.0)
 */
export function calculateAvatarMinScale(
  cameraDistanceMeters,
  fovDeg = 60,
  viewportHeightPx = 800,
  minPixelSize = 36,
  physicalSpanMeters = 10,
  maxScale = 100.0
) {
  if (!cameraDistanceMeters || cameraDistanceMeters <= 0 || !viewportHeightPx || viewportHeightPx <= 0) {
    return 1.0;
  }

  const fovRad = (fovDeg * Math.PI) / 180;
  const tanHalfFov = Math.tan(fovRad / 2);

  // Apparent pixel size at scale 1.0:
  const naturalPixelSize = (physicalSpanMeters * viewportHeightPx) / (2 * cameraDistanceMeters * tanHalfFov);

  if (naturalPixelSize >= minPixelSize) {
    return 1.0;
  }

  const requiredScale = minPixelSize / naturalPixelSize;
  const cap = Math.max(1.0, Number(maxScale) || 100.0);
  return Math.max(1.0, Math.min(cap, Math.round(requiredScale * 100) / 100));
}

/**
 * Projects a sequence of WGS84 geographic track points into local Three.js Cartesian space
 * centered at a single-shot origin point P0.
 * 
 * Coordinate System (Three.js Y-Up Right-Handed):
 * - +X: East
 * - +Y: Up (Zenith, absolute altitude in meters or relative to P0)
 * - +Z: South (-Z: North, since East x Zenith = South)
 * 
 * @param {Array<object>} points Array of points with lat, lon, alt, and optional timeSeconds, speedKmh, vario, heading
 * @param {object|null} [origin=null] Optional explicit origin { lat, lon, alt }
 * @param {object} [options]
 * @param {boolean} [options.relativeAltitude=false] If true, Y is (alt - alt0); if false, Y is absolute alt
 * @returns {{ origin: { lat: number, lon: number, alt: number, meterScale: number }, points: Array<object> }}
 */
export function projectTrackToThreeLocal(points, origin = null, { relativeAltitude = false } = {}) {
  if (!Array.isArray(points) || points.length === 0) {
    return {
      origin: origin || { lat: 0, lon: 0, alt: 0, meterScale: 1 },
      points: []
    };
  }

  const p0 = origin || points[0];
  const lat0 = Number(p0.lat) || 0;
  const lon0 = Number(p0.lon) || 0;
  const alt0 = Number(p0.alt) || 0;

  // WGS84 Semi-major axis in meters
  const WGS84_A = 6378137.0;
  const phi0 = (lat0 * Math.PI) / 180;
  const cosPhi0 = Math.cos(phi0);
  const meterScale = cosPhi0 > 0 ? 1 / cosPhi0 : 1;

  const n = points.length;
  const projected = new Array(n);

  for (let i = 0; i < n; i++) {
    const pt = points[i];
    const lat = Number(pt.lat) || 0;
    const lon = Number(pt.lon) || 0;
    const alt = Number(pt.alt) || 0;

    // Metric displacement from P0
    const dLatRad = ((lat - lat0) * Math.PI) / 180;
    const dLonRad = ((lon - lon0) * Math.PI) / 180;

    // +X is East: dLon * R * cos(phi0)
    const x = dLonRad * WGS84_A * cosPhi0;

    // +Z is South: -dLat * R (North is -Z)
    const z = -dLatRad * WGS84_A;

    // +Y is Up
    const y = relativeAltitude ? alt - alt0 : alt;

    let heading = pt.heading;
    if (heading === undefined || isNaN(heading)) {
      if (i < n - 1) {
        heading = computeBearing(lat, lon, points[i + 1].lat, points[i + 1].lon);
      } else if (i > 0) {
        heading = projected[i - 1].heading;
      } else {
        heading = 0;
      }
    }

    let speedKmh = pt.speedKmh;
    if (speedKmh === undefined || isNaN(speedKmh)) {
      if (i > 0) {
        const prev = points[i - 1];
        const dt = Math.max(1, (pt.timeSeconds ?? i) - (prev.timeSeconds ?? (i - 1)));
        const distKm = computeDistanceKm(prev.lat, prev.lon, lat, lon);
        speedKmh = Math.round((distKm / (dt / 3600)) * 10) / 10;
        if (speedKmh > 180) speedKmh = projected[i - 1].speedKmh || 38;
      } else {
        speedKmh = 38;
      }
    }

    let vario = pt.vario;
    if (vario === undefined || isNaN(vario)) {
      if (i > 0) {
        const prev = points[i - 1];
        const dt = Math.max(0.5, (pt.timeSeconds ?? i) - (prev.timeSeconds ?? (i - 1)));
        const dh = alt - (prev.alt || 0);
        vario = Math.round((dh / dt) * 10) / 10;
      } else {
        vario = 0;
      }
    }

    const dt = i > 0 ? Math.max(0.1, (pt.timeSeconds ?? i) - (points[i - 1].timeSeconds ?? (i - 1))) : 1;
    const turnRateDegSec = i > 0 ? calculateAngularDelta(projected[i - 1].heading, heading) / dt : 0;
    const groundSpeedMs = Math.max(0.5, speedKmh / 3.6);

    const roundedX = Math.round(x * 100) / 100;
    const roundedY = Math.round(y * 100) / 100;
    const roundedZ = Math.round(z * 100) / 100;

    projected[i] = {
      x: roundedX === 0 ? 0 : roundedX,
      y: roundedY === 0 ? 0 : roundedY,
      z: roundedZ === 0 ? 0 : roundedZ,
      lat,
      lon,
      alt,
      timeSeconds: pt.timeSeconds !== undefined ? pt.timeSeconds : i,
      speedKmh: Math.round(speedKmh * 10) / 10,
      vario: Math.round(vario * 10) / 10,
      heading: Math.round(heading * 10) / 10,
      bankAngle: calculateCoordinatedBankAngle(turnRateDegSec, groundSpeedMs),
      pitchAngle: calculateKinematicPitchAngle(vario, groundSpeedMs),
      turnRateDegSec: Math.round(turnRateDegSec * 10) / 10
    };
  }

  // Enrich projected points with multi-window Gaussian smoothed kinematics,
  // aerodynamic pitch, brake deflection, and thermal orbit centroids
  smoothTrackKinematics(projected);

  return {
    origin: {
      lat: lat0,
      lon: lon0,
      alt: alt0,
      meterScale: Math.round(meterScale * 1e6) / 1e6
    },
    points: projected
  };
}

/**
 * Applies a time-weighted Gaussian smoothing filter over projected track points to eliminate
 * 1 Hz GPS quantization jitter on heading, turn rate, bank angle, and aerodynamic pitch,
 * while detecting sustained thermal orbits and computing the moving thermal center.
 *
 * Mutates points in-place by adding `smoothHeading`, `smoothTurnRateDegSec`, `smoothBankAngle`,
 * `aerodynamicPitchAngle`, `smoothVario`, `brakeLeft`, `brakeRight`, `isThermalOrbit`,
 * `thermalCenterLat`, `thermalCenterLon`, `thermalCenterX`, `thermalCenterZ`, and returns the array.
 *
 * @param {Array<object>} points Projected track points
 * @param {object} [options]
 * @param {number} [options.sigmaSeconds=1.8] Gaussian kernel standard deviation in seconds
 * @param {number} [options.windowSeconds=4.5] Half-window radius in seconds
 * @returns {Array<object>} Enriched points array
 */
export function smoothTrackKinematics(points, options = {}) {
  if (!Array.isArray(points) || points.length === 0) return points || [];
  const n = points.length;
  const sigma = Math.max(0.4, options.sigmaSeconds ?? 1.8);
  const halfWin = Math.max(1.0, options.windowSeconds ?? 4.5);
  const twoSigmaSq = 2 * sigma * sigma;

  // Step 1: Instantaneous local Cartesian velocity components (vx East, vy Up, vz South)
  const instVx = new Float64Array(n);
  const instVy = new Float64Array(n);
  const instVz = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n - 1, i + 1);
    const p0 = points[i0];
    const p1 = points[i1];
    const dt = Math.max(0.2, (p1.timeSeconds ?? i1) - (p0.timeSeconds ?? i0));
    if (i0 === i1) {
      const hRad = ((points[i].heading || 0) * Math.PI) / 180;
      const spdMs = Math.max(0, (points[i].speedKmh || 36) / 3.6);
      instVx[i] = Math.sin(hRad) * spdMs;
      instVz[i] = -Math.cos(hRad) * spdMs;
      instVy[i] = points[i].vario || 0;
    } else {
      instVx[i] = ((p1.x ?? 0) - (p0.x ?? 0)) / dt;
      instVy[i] = ((p1.alt ?? p1.y ?? 0) - (p0.alt ?? p0.y ?? 0)) / dt;
      instVz[i] = ((p1.z ?? 0) - (p0.z ?? 0)) / dt;
    }
  }

  // Step 2: Gaussian smoothing of velocity vector & circular heading
  const smoothHeadingArr = new Float64Array(n);
  const smoothSpeedMsArr = new Float64Array(n);
  const smoothVarioArr = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const ti = points[i].timeSeconds ?? i;
    let sumW = 0;
    let sumVx = 0;
    let sumVy = 0;
    let sumVz = 0;
    let sumSinH = 0;
    let sumCosH = 0;

    for (let j = i; j >= 0; j--) {
      const dt = Math.abs(ti - (points[j].timeSeconds ?? j));
      if (dt > halfWin && j < i - 2) break;
      const w = Math.exp(-(dt * dt) / twoSigmaSq);
      const hRad = ((points[j].heading || 0) * Math.PI) / 180;
      sumW += w;
      sumVx += instVx[j] * w;
      sumVy += instVy[j] * w;
      sumVz += instVz[j] * w;
      sumSinH += Math.sin(hRad) * w;
      sumCosH += Math.cos(hRad) * w;
    }
    for (let j = i + 1; j < n; j++) {
      const dt = Math.abs((points[j].timeSeconds ?? j) - ti);
      if (dt > halfWin && j > i + 2) break;
      const w = Math.exp(-(dt * dt) / twoSigmaSq);
      const hRad = ((points[j].heading || 0) * Math.PI) / 180;
      sumW += w;
      sumVx += instVx[j] * w;
      sumVy += instVy[j] * w;
      sumVz += instVz[j] * w;
      sumSinH += Math.sin(hRad) * w;
      sumCosH += Math.cos(hRad) * w;
    }

    const invW = sumW > 0 ? 1 / sumW : 1;
    const vx = sumVx * invW;
    const vy = sumVy * invW;
    const vz = sumVz * invW;
    const horizSpeed = Math.hypot(vx, vz);

    let headingDeg;
    if (horizSpeed > 0.8) {
      // In Three.js local space: +X is East, -Z is North -> bearing = atan2(vx, -vz)
      headingDeg = ((Math.atan2(vx, -vz) * 180) / Math.PI + 360) % 360;
    } else {
      headingDeg = ((Math.atan2(sumSinH * invW, sumCosH * invW) * 180) / Math.PI + 360) % 360;
    }

    smoothHeadingArr[i] = headingDeg;
    smoothSpeedMsArr[i] = Math.max(2.0, horizSpeed || ((points[i].speedKmh || 36) / 3.6));
    smoothVarioArr[i] = vy;
  }

  // Step 3: Smoothed Turn Rate, Coordinated Bank, Aerodynamic Pitch, Brakes & Thermal Centroid
  const rawTurnRates = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n - 1, i + 1);
    const dt = Math.max(0.25, (points[i1].timeSeconds ?? i1) - (points[i0].timeSeconds ?? i0));
    rawTurnRates[i] = i0 === i1 ? 0 : calculateAngularDelta(smoothHeadingArr[i0], smoothHeadingArr[i1]) / dt;
  }

  for (let i = 0; i < n; i++) {
    const pt = points[i];
    const ti = pt.timeSeconds ?? i;

    // Smooth turn rate and vertical acceleration over +/- 2.5s window
    let wSum = 0;
    let omegaSum = 0;
    for (let j = Math.max(0, i - 4); j <= Math.min(n - 1, i + 4); j++) {
      const dt = Math.abs(ti - (points[j].timeSeconds ?? j));
      const w = Math.exp(-(dt * dt) / (2 * 1.4 * 1.4));
      wSum += w;
      omegaSum += rawTurnRates[j] * w;
    }
    const smoothOmega = wSum > 0 ? omegaSum / wSum : rawTurnRates[i];
    const smoothBank = calculateCoordinatedBankAngle(smoothOmega, smoothSpeedMsArr[i], { maxBankDeg: 55 });

    // Vertical acceleration az = d(smoothVario)/dt for transient aerodynamic pitch surge
    const iPrev = Math.max(0, i - 1);
    const iNext = Math.min(n - 1, i + 1);
    const dtAcc = Math.max(0.5, (points[iNext].timeSeconds ?? iNext) - (points[iPrev].timeSeconds ?? iPrev));
    const az = iPrev === iNext ? 0 : (smoothVarioArr[iNext] - smoothVarioArr[iPrev]) / dtAcc;

    // Realistic paraglider aerodynamic pitch attitude in [-9 deg, +7 deg]
    // Trim pitch is ~ -2.0 deg in glide; pitches back slightly on thermal entry (+az / +vario)
    const rawAeroPitch = -2.0 + 0.75 * smoothVarioArr[i] + 1.8 * az - 0.04 * Math.abs(smoothBank);
    const aeroPitch = Math.max(-9.0, Math.min(7.0, Math.round(rawAeroPitch * 10) / 10));

    // Inner trailing-edge brake deflection in [0, 1]
    const normBank = Math.min(1, Math.abs(smoothBank) / 42);
    const brakeRight = smoothBank > 0.5 ? Math.round(normBank * 100) / 100 : 0;
    const brakeLeft = smoothBank < -0.5 ? Math.round(normBank * 100) / 100 : 0;

    // Thermal orbit detection & moving centroid over +/- 8s window
    let cLat = 0, cLon = 0, cX = 0, cZ = 0, cCount = 0, absOmegaSum = 0;
    for (let j = i; j >= 0; j--) {
      if (Math.abs(ti - (points[j].timeSeconds ?? j)) > 8.0 && j < i - 2) break;
      cLat += points[j].lat;
      cLon += points[j].lon;
      cX += points[j].x ?? 0;
      cZ += points[j].z ?? 0;
      absOmegaSum += Math.abs(rawTurnRates[j]);
      cCount++;
    }
    for (let j = i + 1; j < n; j++) {
      if (Math.abs((points[j].timeSeconds ?? j) - ti) > 8.0 && j > i + 2) break;
      cLat += points[j].lat;
      cLon += points[j].lon;
      cX += points[j].x ?? 0;
      cZ += points[j].z ?? 0;
      absOmegaSum += Math.abs(rawTurnRates[j]);
      cCount++;
    }

    const avgAbsOmega = cCount > 0 ? absOmegaSum / cCount : Math.abs(smoothOmega);
    const isThermalOrbit = Math.abs(smoothOmega) >= 7.5 && avgAbsOmega >= 6.5;

    pt.smoothHeading = Math.round(smoothHeadingArr[i] * 10) / 10;
    pt.smoothTurnRateDegSec = Math.round(smoothOmega * 10) / 10;
    pt.smoothBankAngle = smoothBank === 0 ? 0 : smoothBank;
    pt.aerodynamicPitchAngle = aeroPitch === 0 ? 0 : aeroPitch;
    pt.smoothVario = Math.round(smoothVarioArr[i] * 100) / 100;
    pt.brakeLeft = brakeLeft;
    pt.brakeRight = brakeRight;
    pt.isThermalOrbit = isThermalOrbit;
    pt.thermalCenterLat = cCount > 0 ? Math.round((cLat / cCount) * 1e7) / 1e7 : pt.lat;
    pt.thermalCenterLon = cCount > 0 ? Math.round((cLon / cCount) * 1e7) / 1e7 : pt.lon;
    pt.thermalCenterX = cCount > 0 ? Math.round((cX / cCount) * 100) / 100 : (pt.x ?? 0);
    pt.thermalCenterZ = cCount > 0 ? Math.round((cZ / cCount) * 100) / 100 : (pt.z ?? 0);
  }

  return points;
}

/**
 * Computes the geodetic ground look-at target `[lon, lat]` for MapLibre GL so that the camera's
 * optical ray (tilted by `pitchDeg` along `bearingDeg`) passes directly through the 3D paraglider
 * at altitude `targetAltMsl` instead of pointing at the valley floor far below.
 *
 * Also applies a look-ahead framing offset so the paraglider sits in the lower-central third of
 * the viewport (`Chase` mode) or projects ahead of the helmet (`Pilot POV` mode).
 *
 * @param {object} params
 * @param {number} params.lat Target latitude in degrees
 * @param {number} params.lon Target longitude in degrees
 * @param {number} params.altMsl Target altitude in meters MSL
 * @param {number} [params.referenceElevationMsl=0] Terrain/center reference elevation in meters MSL
 * @param {number} [params.pitchDeg=62] Camera pitch in degrees [0, 80]
 * @param {number} [params.bearingDeg=0] Camera viewing bearing in degrees [0, 360)
 * @param {number} [params.zoom=15] Current MapLibre zoom level
 * @param {'chase'|'cockpit'|'free'} [params.cameraMode='chase'] Active camera mode
 * @returns {{ lon: number, lat: number, forwardOffsetMeters: number, altitudeDeltaMeters: number }}
 */
export function computeCameraGroundTargetForAltitude({
  lat,
  lon,
  altMsl = 0,
  referenceElevationMsl,
  groundAltMsl,
  pitchDeg = 62,
  bearingDeg = 0,
  zoom = 15.2,
  cameraMode = 'chase',
  lookAheadMeters,
  viewportHeightPx = 600
} = {}) {
  const baseLat = Number(lat) || 0;
  const baseLon = Number(lon) || 0;
  const clampedPitch = Math.max(0, Math.min(78, Number(pitchDeg) || 0));
  const pitchRad = (clampedPitch * Math.PI) / 180;

  // Height of the 3D glider above MapLibre's current center elevation plane (Z_merc = 0)
  const hasExplicitRef = referenceElevationMsl !== undefined || groundAltMsl !== undefined;
  const refElev = referenceElevationMsl !== undefined
    ? Number(referenceElevationMsl)
    : (groundAltMsl !== undefined ? Number(groundAltMsl) : Number(altMsl));
  const rawDeltaH = hasExplicitRef ? ((Number(altMsl) || 0) - (refElev || 0)) : 0;
  const altitudeDeltaMeters = Math.max(0, Math.min(2800, rawDeltaH));

  // Ray-plane intersection: for a camera looking down at pitchRad along bearingDeg to intersect
  // the 3D glider at +altitudeDeltaMeters above refElev:
  // 1. Shift ground pivot forward by altitudeDeltaMeters * tan(pitchRad)
  // 2. Increase camera-to-ground distance D(zoom) by +altitudeDeltaMeters / cos(pitchRad)
  //    so the camera eye stays behind and above the 3D glider at distance d_chase.
  const tanPitch = Math.tan(pitchRad);
  const cosPitch = Math.max(0.18, Math.cos(pitchRad));

  const z = Math.max(10, Math.min(20, Number(zoom) || 15.2));
  const WGS84_A = 6378137.0;
  const latRad = (baseLat * Math.PI) / 180;
  const cosLat = Math.max(0.1, Math.cos(latRad));

  const metersPerPixel = (40075016.686 * cosLat) / (512 * Math.pow(2, z));
  const cameraToCenterPx = 1.5 * Math.max(320, Number(viewportHeightPx) || 600);
  const chaseDistanceMeters = Math.max(25, cameraToCenterPx * metersPerPixel);

  const totalRayDistance = chaseDistanceMeters + (altitudeDeltaMeters / cosPitch);
  const zoomDrop = Math.log2(Math.max(1.0, totalRayDistance / chaseDistanceMeters));
  const compensatedZoom = Math.max(10.5, Math.min(19.5, z - zoomDrop));

  const framingLookAheadMeters = (typeof lookAheadMeters === 'number' && !isNaN(lookAheadMeters))
    ? lookAheadMeters
    : (cameraMode === 'cockpit' ? 3.5 : 0);

  const forwardOffsetMeters = altitudeDeltaMeters * tanPitch + framingLookAheadMeters;

  const bearingRad = ((Number(bearingDeg) || 0) * Math.PI) / 180;
  const dEastMeters = Math.sin(bearingRad) * forwardOffsetMeters;
  const dNorthMeters = Math.cos(bearingRad) * forwardOffsetMeters;

  const targetLat = baseLat + (dNorthMeters / WGS84_A) * (180 / Math.PI);
  const targetLon = baseLon + (dEastMeters / (WGS84_A * cosLat)) * (180 / Math.PI);
  const roundedLon = Math.round(targetLon * 1e7) / 1e7;
  const roundedLat = Math.round(targetLat * 1e7) / 1e7;

  return {
    lon: roundedLon,
    lat: roundedLat,
    centerLon: roundedLon,
    centerLat: roundedLat,
    forwardOffsetMeters: Math.round(forwardOffsetMeters * 10) / 10,
    altitudeDeltaMeters: Math.round(altitudeDeltaMeters * 10) / 10,
    compensatedZoom: Math.round(compensatedZoom * 100) / 100,
    chaseDistanceMeters: Math.round(chaseDistanceMeters * 10) / 10
  };
}

/**
 * Advances the 3D camera state using a frame-rate independent exponential spring-damper,
 * incorporating Thermal Horizon Stabilization and user touch orbit offsets.
 *
 * @param {object|null} prevState Previous camera controller state
 * @param {object} targetPoint Current interpolated track sample
 * @param {number} dtSeconds Elapsed real frame time in seconds
 * @param {object} [options]
 * @param {'chase'|'cockpit'|'free'} [options.cameraMode='chase']
 * @param {'chase'|'cockpit'|'free'} [options.mode]
 * @param {number} [options.referenceElevationMsl]
 * @param {number} [options.groundAltMsl]
 * @param {number} [options.elevationOffset=0]
 * @param {number} [options.userBearingOffsetDeg=0] User orbit yaw offset in degrees
 * @param {number} [options.userPitchOffsetDeg=0] User orbit pitch offset in degrees
 * @param {number} [options.userZoomOffset=0] User zoom offset
 * @param {number} [options.viewportHeightPx=600] Viewport height in pixels
 * @returns {object} Updated camera state
 */
export function stepCameraSpringDamper(prevState, targetPoint, dtSeconds = 0.016, options = {}) {
  if (!targetPoint) return prevState || null;

  const mode = options.cameraMode || options.mode || 'chase';
  const rawDt = Number(dtSeconds) || 0.016;
  const isImmediateSnap = !prevState || rawDt >= 1.5;
  const dt = Math.max(0.001, Math.min(0.5, rawDt));
  const userYaw = Number(options.userBearingOffsetDeg) || 0;
  const userPitch = Number(options.userPitchOffsetDeg) || 0;
  const userZoom = Number(options.userZoomOffset) || 0;
  const elevOffset = Number(options.elevationOffset) || 0;

  const gliderHeading = targetPoint.smoothHeading ?? targetPoint.heading ?? 0;
  const turnRate = targetPoint.smoothTurnRateDegSec ?? targetPoint.turnRateDegSec ?? 0;
  const isThermal = (Boolean(targetPoint.isThermalOrbit) || Math.abs(turnRate) >= 7.5) && mode === 'chase';

  // Keep focus anchored tightly to the paraglider so the camera always points at the glider;
  // only apply a subtle 8% damping toward thermal centroid during confirmed sustained orbits
  const useThermalBlend = Boolean(targetPoint.isThermalOrbit) && mode === 'chase';
  const rawLat = useThermalBlend && typeof targetPoint.thermalCenterLat === 'number'
    ? targetPoint.lat * 0.92 + targetPoint.thermalCenterLat * 0.08
    : targetPoint.lat;
  const rawLon = useThermalBlend && typeof targetPoint.thermalCenterLon === 'number'
    ? targetPoint.lon * 0.92 + targetPoint.thermalCenterLon * 0.08
    : targetPoint.lon;
  const rawAlt = (targetPoint.alt ?? 0) + elevOffset;

  const hasExplicitRef = options.referenceElevationMsl !== undefined || options.groundAltMsl !== undefined;
  const refElev = hasExplicitRef
    ? (Number(options.referenceElevationMsl ?? options.groundAltMsl) || 0)
    : rawAlt;

  // Desired camera orientation before damping:
  // - In 'cockpit' (Pilot POV): look into the turn by up to +/- 20 deg
  // - In 'chase': glider smoothed heading + user touch orbit offset
  const lookIntoTurnDeg = mode === 'cockpit'
    ? Math.max(-20, Math.min(20, turnRate * 0.65))
    : 0;
  const desiredBearing = (gliderHeading + lookIntoTurnDeg + userYaw + 360) % 360;

  const basePitch = mode === 'cockpit' ? 75 : (options.basePitch ?? 62);
  const desiredPitch = Math.max(15, Math.min(78, basePitch + userPitch));

  const baseZoom = mode === 'cockpit' ? 17.1 : (isThermal ? 15.6 : (options.baseZoom ?? 15.2));
  const desiredZoom = Math.max(10.5, Math.min(19.5, baseZoom + userZoom));

  // Time constants tau (seconds):
  // In thermal orbit, bearing time constant increases to 6.5s so mountains stay still
  const tauPos = mode === 'cockpit' ? 0.08 : 0.18;
  const tauBearing = mode === 'cockpit' ? 0.18 : (isThermal ? 6.5 : 0.55);
  const tauPitchZoom = 0.22;

  const alphaPos = isImmediateSnap ? 1.0 : (1.0 - Math.exp(-dt / tauPos));
  const alphaBearing = isImmediateSnap ? 1.0 : (1.0 - Math.exp(-dt / tauBearing));
  const alphaPZ = isImmediateSnap ? 1.0 : (1.0 - Math.exp(-dt / tauPitchZoom));

  const focusLat = isImmediateSnap ? rawLat : prevState.focusLat + (rawLat - prevState.focusLat) * alphaPos;
  const focusLon = isImmediateSnap ? rawLon : prevState.focusLon + (rawLon - prevState.focusLon) * alphaPos;
  const focusAlt = isImmediateSnap ? rawAlt : prevState.focusAlt + (rawAlt - prevState.focusAlt) * alphaPos;

  const smoothedBearing = isImmediateSnap
    ? desiredBearing
    : interpolateAngleDegrees(prevState.bearing, desiredBearing, alphaBearing);
  const smoothedPitch = isImmediateSnap
    ? desiredPitch
    : prevState.pitch + (desiredPitch - prevState.pitch) * alphaPZ;
  const smoothedZoom = isImmediateSnap
    ? desiredZoom
    : prevState.zoom + (desiredZoom - prevState.zoom) * alphaPZ;

  // Project 3D focus point at focusAlt down along the optical ray to MapLibre ground center
  const groundTarget = computeCameraGroundTargetForAltitude({
    lat: focusLat,
    lon: focusLon,
    altMsl: focusAlt,
    referenceElevationMsl: refElev,
    pitchDeg: smoothedPitch,
    bearingDeg: smoothedBearing,
    zoom: smoothedZoom,
    cameraMode: mode,
    viewportHeightPx: options.viewportHeightPx
  });

  return {
    centerLon: groundTarget.lon,
    centerLat: groundTarget.lat,
    bearing: Math.round(smoothedBearing * 100) / 100,
    pitch: Math.round(smoothedPitch * 100) / 100,
    zoom: Math.round(smoothedZoom * 100) / 100,
    compensatedZoom: groundTarget.compensatedZoom,
    chaseDistanceMeters: groundTarget.chaseDistanceMeters,
    focusLat,
    focusLon,
    focusAlt: Math.round(focusAlt * 10) / 10,
    forwardOffsetMeters: groundTarget.forwardOffsetMeters,
    altitudeDeltaMeters: groundTarget.altitudeDeltaMeters,
    isThermalStabilized: isThermal,
    isThermalling: isThermal
  };
}

/**
 * Computes the articulated pendulum pose for the 3D paraglider avatar:
 * when banking by `bankDeg`, the wing shifts laterally inward while
 * the pilot pod swings outward under centrifugal force like a real pendulum.
 *
 * Accepts either `(pointObj, options)` or `(bankDeg, pitchDeg, options)`.
 *
 * @param {object|number} pointOrBank Current interpolated/projected track point or bank angle in degrees
 * @param {object|number} [pitchOrOptions] Pitch angle in degrees or options object
 * @param {object} [maybeOptions]
 * @returns {object}
 */
export function computePendulumPose(pointOrBank = {}, pitchOrOptions = {}, maybeOptions = {}) {
  const isNumericSignature = typeof pointOrBank === 'number';
  const point = isNumericSignature
    ? { bankAngle: pointOrBank, aerodynamicPitchAngle: typeof pitchOrOptions === 'number' ? pitchOrOptions : 0 }
    : (pointOrBank || {});
  const options = isNumericSignature ? (maybeOptions || {}) : (pitchOrOptions || {});

  const arm = options.pendulumArmMeters ?? 6.7;
  const headingDeg = point.smoothHeading ?? point.heading ?? 0;
  const bankDeg = point.smoothBankAngle ?? point.bankAngle ?? 0;
  const pitchDeg = point.aerodynamicPitchAngle ?? Math.max(-9, Math.min(7, (point.pitchAngle ?? 0) * 0.3));

  const bankRad = (bankDeg * Math.PI) / 180;
  const podSwingLateralMeters = Math.round((-Math.sin(bankRad) * arm) * 1000) / 1000;
  const podLiftMeters = Math.round(((1 - Math.cos(bankRad)) * arm) * 1000) / 1000;
  const canopyOffsetX = Math.round((-Math.sin(bankRad) * 3.2) * 1000) / 1000;
  const pilotOffsetX = Math.round((Math.sin(bankRad) * 1.35) * 1000) / 1000;

  const normBank = Math.min(1, Math.abs(bankDeg) / 42);
  const brakeRight = point.brakeRight !== undefined ? point.brakeRight : (bankDeg > 0.5 ? Math.round(normBank * 100) / 100 : 0);
  const brakeLeft = point.brakeLeft !== undefined ? point.brakeLeft : (bankDeg < -0.5 ? Math.round(normBank * 100) / 100 : 0);

  return {
    headingDeg,
    pitchDeg: pitchDeg === 0 ? 0 : pitchDeg,
    bankDeg: bankDeg === 0 ? 0 : bankDeg,
    podSwingLateralMeters: podSwingLateralMeters === 0 ? 0 : podSwingLateralMeters,
    podLiftMeters: podLiftMeters === 0 ? 0 : podLiftMeters,
    canopyOffsetX: canopyOffsetX === 0 ? 0 : canopyOffsetX,
    pilotOffsetX: pilotOffsetX === 0 ? 0 : pilotOffsetX,
    brakeLeft,
    brakeRight
  };
}

/**
 * Generates a subdivided Catmull-Rom spline track with miter-bisector horizontal normals
 * and smoothed variometer values to eliminate polygonal kinks and ribbon pinching in thermals.
 *
 * @param {Array<object>} projectedPoints Array of projected points from projectTrackToThreeLocal
 * @param {object} [options]
 * @param {number} [options.maxSubdivisionsPerSegment=4] Maximum subdivisions in tight turns
 * @returns {{
 *   points: Array<object>,
 *   normals: Float32Array,
 *   splinePoints: Array<object>,
 *   normalsXZ: Float32Array,
 *   pointToSplineIndex: Int32Array
 * }}
 */
export function buildSmoothTrackGeometryData(projectedPoints, options = {}) {
  if (!Array.isArray(projectedPoints) || projectedPoints.length === 0) {
    const emptyArr = [];
    const emptyNormals = new Float32Array(0);
    return {
      points: emptyArr,
      normals: emptyNormals,
      splinePoints: emptyArr,
      normalsXZ: emptyNormals,
      pointToSplineIndex: new Int32Array(0)
    };
  }

  const n = projectedPoints.length;
  const maxSub = Math.max(1, Math.min(6, options.maxSubdivisionsPerSegment ?? 3));
  const splinePoints = [];
  const pointToSplineIndex = new Int32Array(n);

  for (let i = 0; i < n - 1; i++) {
    pointToSplineIndex[i] = splinePoints.length;
    const p0 = projectedPoints[Math.max(0, i - 1)];
    const p1 = projectedPoints[i];
    const p2 = projectedPoints[i + 1];
    const p3 = projectedPoints[Math.min(n - 1, i + 2)];

    const dHeading = Math.abs(calculateAngularDelta(p1.smoothHeading ?? p1.heading ?? 0, p2.smoothHeading ?? p2.heading ?? 0));
    const segDist = Math.hypot((p2.x ?? 0) - (p1.x ?? 0), (p2.z ?? 0) - (p1.z ?? 0));

    // Subdivide curved segments (thermal turns or larger segments)
    let steps = 1;
    if (dHeading > 16 || (dHeading > 6 && segDist > 12)) {
      steps = maxSub;
    } else if (dHeading > 6 || segDist > 35) {
      steps = Math.min(2, maxSub);
    }

    for (let s = 0; s < steps; s++) {
      if (s === 0) {
        splinePoints.push({
          x: p1.x,
          y: p1.y,
          z: p1.z,
          lat: p1.lat,
          lon: p1.lon,
          alt: p1.alt,
          timeSeconds: p1.timeSeconds ?? i,
          vario: p1.smoothVario ?? p1.vario ?? 0,
          smoothVario: p1.smoothVario ?? p1.vario ?? 0,
          heading: p1.smoothHeading ?? p1.heading ?? 0,
          smoothHeading: p1.smoothHeading ?? p1.heading ?? 0,
          bankAngle: p1.smoothBankAngle ?? p1.bankAngle ?? 0,
          smoothBankAngle: p1.smoothBankAngle ?? p1.bankAngle ?? 0,
          sourceIndex: i
        });
      } else {
        const t = s / steps;
        const sx = interpolateCatmullRom(p0.x, p1.x, p2.x, p3.x, t);
        const sy = interpolateCatmullRom(p0.y, p1.y, p2.y, p3.y, t);
        const sz = interpolateCatmullRom(p0.z, p1.z, p2.z, p3.z, t);
        const slat = interpolateCatmullRom(p0.lat ?? 0, p1.lat ?? 0, p2.lat ?? 0, p3.lat ?? 0, t);
        const slon = interpolateCatmullRom(p0.lon ?? 0, p1.lon ?? 0, p2.lon ?? 0, p3.lon ?? 0, t);
        const salt = interpolateCatmullRom(p0.alt ?? p0.y ?? 0, p1.alt ?? p1.y ?? 0, p2.alt ?? p2.y ?? 0, p3.alt ?? p3.y ?? 0, t);
        const stime = (p1.timeSeconds ?? i) + ((p2.timeSeconds ?? (i + 1)) - (p1.timeSeconds ?? i)) * t;
        const v1 = p1.smoothVario ?? p1.vario ?? 0;
        const v2 = p2.smoothVario ?? p2.vario ?? 0;
        const svario = v1 + (v2 - v1) * t;
        const sheading = interpolateAngleDegrees(p1.smoothHeading ?? p1.heading ?? 0, p2.smoothHeading ?? p2.heading ?? 0, t);
        const b1 = p1.smoothBankAngle ?? p1.bankAngle ?? 0;
        const b2 = p2.smoothBankAngle ?? p2.bankAngle ?? 0;
        const sbank = b1 + (b2 - b1) * t;

        const roundedVario = Math.round(svario * 100) / 100;
        const roundedBank = Math.round(sbank * 10) / 10;

        splinePoints.push({
          x: Math.round(sx * 100) / 100,
          y: Math.round(sy * 100) / 100,
          z: Math.round(sz * 100) / 100,
          lat: slat,
          lon: slon,
          alt: salt,
          timeSeconds: stime,
          vario: roundedVario,
          smoothVario: roundedVario,
          heading: sheading,
          smoothHeading: sheading,
          bankAngle: roundedBank,
          smoothBankAngle: roundedBank,
          sourceIndex: i
        });
      }
    }
  }

  pointToSplineIndex[n - 1] = splinePoints.length;
  const lastPt = projectedPoints[n - 1];
  splinePoints.push({
    x: lastPt.x,
    y: lastPt.y,
    z: lastPt.z,
    lat: lastPt.lat,
    lon: lastPt.lon,
    alt: lastPt.alt,
    timeSeconds: lastPt.timeSeconds ?? (n - 1),
    vario: lastPt.smoothVario ?? lastPt.vario ?? 0,
    smoothVario: lastPt.smoothVario ?? lastPt.vario ?? 0,
    heading: lastPt.smoothHeading ?? lastPt.heading ?? 0,
    smoothHeading: lastPt.smoothHeading ?? lastPt.heading ?? 0,
    bankAngle: lastPt.smoothBankAngle ?? lastPt.bankAngle ?? 0,
    smoothBankAngle: lastPt.smoothBankAngle ?? lastPt.bankAngle ?? 0,
    sourceIndex: n - 1
  });

  // Compute miter-bisector unit normals in the horizontal XZ plane to prevent pinching on turns
  const m = splinePoints.length;
  const normalsXZ = new Float32Array(m * 2);

  for (let k = 0; k < m; k++) {
    const prev = splinePoints[Math.max(0, k - 1)];
    const curr = splinePoints[k];
    const next = splinePoints[Math.min(m - 1, k + 1)];

    let tx1 = curr.x - prev.x;
    let tz1 = curr.z - prev.z;
    const len1 = Math.hypot(tx1, tz1);
    if (len1 > 1e-4) {
      tx1 /= len1;
      tz1 /= len1;
    } else {
      const hRad = ((curr.heading || 0) * Math.PI) / 180;
      tx1 = Math.sin(hRad);
      tz1 = -Math.cos(hRad);
    }

    let tx2 = next.x - curr.x;
    let tz2 = next.z - curr.z;
    const len2 = Math.hypot(tx2, tz2);
    if (len2 > 1e-4) {
      tx2 /= len2;
      tz2 /= len2;
    } else {
      tx2 = tx1;
      tz2 = tz1;
    }

    // Average tangent bisector
    let bx = tx1 + tx2;
    let bz = tz1 + tz2;
    const bLen = Math.hypot(bx, bz);
    if (bLen > 1e-4) {
      bx /= bLen;
      bz /= bLen;
    } else {
      bx = tx2;
      bz = tz2;
    }

    // Right-hand normal in XZ plane: (tx, tz) = (sin(h), -cos(h)) -> normal = (-tz, tx) = (cos(h), sin(h))
    normalsXZ[k * 2] = -bz;
    normalsXZ[k * 2 + 1] = bx;
  }

  return {
    points: splinePoints,
    normals: normalsXZ,
    splinePoints,
    normalsXZ,
    pointToSplineIndex
  };
}

/**
 * Calculates dynamic 3D track ribbon width and height in meters based on map zoom and Web Mercator scale.
 * 
 * Implements a dual-regime multi-scale engine:
 * 1. Macro Regime (zoom <= 12.0):
 *    Guarantees robust screen visibility (~5.0px on screen) across vast alpine terrain and mountain valleys,
 *    ensuring the flight trajectory is always prominent, continuous, and clearly recognizable from afar.
 * 2. Smooth Transition (12.0 < zoom < 17.0):
 *    Continuous C1 Hermite smoothstep transition preventing visual pops during continuous zoom/scroll.
 * 3. Micro Aerodynamic Tracer (zoom >= 17.0):
 *    Tapers to a sleek, delicate aerodynamic ribbon (width 0.20m - 0.83m, height <= 0.10m),
 *    comparable to or narrower than the paraglider pod harness (0.50m) and far smaller than the
 *    wingspan (13.2m). When zoomed in to inspect maneuvers, 360 circles, or paraglider details,
 *    it remains elegant and never occludes or engulfs the paraglider canopy, lines, or pilot.
 * 
 * @param {number} zoom Current map zoom level (e.g. 10 - 20)
 * @param {number} [latitude=46.0] Geographic latitude for Mercator meter scale
 * @param {object} [options]
 * @param {number} [options.targetPixels] Optional explicit target visual thickness on screen in pixels
 * @param {number} [options.minWidthMeters=0.20] Minimum physical width clamp in meters
 * @param {number} [options.maxWidthMeters=1000.0] Maximum physical width clamp in meters
 * @param {number} [options.heightRatio] Optional ratio of vertical thickness to horizontal width
 * @returns {{ widthMeters: number, heightMeters: number, halfWidth: number, halfHeight: number, metersPerPixel: number }}
 */
export function calculateRibbonDimensions(zoom, latitude = 46.0, options = {}) {
  const z = typeof zoom === 'number' && !isNaN(zoom) ? zoom : 14;
  const lat = typeof latitude === 'number' && !isNaN(latitude) ? latitude : 46.0;
  const latRad = (lat * Math.PI) / 180;
  const cosLat = Math.max(0.1, Math.cos(latRad));

  // In Web Mercator / MapLibre 3D, Earth circumference is 40,075,016.686 meters.
  // Ground resolution at latitude lat: metersPerPixel = (40,075,016.686 * cosLat) / (512 * 2^z).
  const metersPerPixel = (40075016.686 * cosLat) / (512 * Math.pow(2, z));

  const minWidth = typeof options.minWidthMeters === 'number' && !isNaN(options.minWidthMeters)
    ? options.minWidthMeters
    : 0.20;
  const maxWidth = typeof options.maxWidthMeters === 'number' && !isNaN(options.maxWidthMeters)
    ? options.maxWidthMeters
    : 1000.0;

  let widthMeters;
  let heightRatio;
  let maxHeight;

  const hasCustomTarget = typeof options.targetPixels === 'number' && !isNaN(options.targetPixels);
  const hasCustomHeightRatio = typeof options.heightRatio === 'number' && !isNaN(options.heightRatio);

  if (hasCustomTarget) {
    // Explicit custom target pixels override (linear scaling)
    widthMeters = metersPerPixel * options.targetPixels;
    heightRatio = hasCustomHeightRatio ? options.heightRatio : 0.30;
    maxHeight = 1000.0;
  } else {
    // Dual-regime multi-scale engine:
    if (z <= 12.0) {
      // Regime 1: Macro Screen-Space (~5.0 px) for high visibility over mountain relief
      widthMeters = metersPerPixel * 5.0;
      heightRatio = 0.30;
      maxHeight = 25.0;
    } else if (z < 17.0) {
      // Regime 2: Hermite Smoothstep Transition (12.0 -> 17.0)
      const t = (z - 12.0) / 5.0;
      const s = t * t * (3.0 - 2.0 * t);
      const targetPx = (1.0 - s) * 5.0 + s * 2.0;
      widthMeters = metersPerPixel * targetPx;
      heightRatio = (1.0 - s) * 0.30 + s * 0.15;
      maxHeight = (1.0 - s) * 20.0 + s * 0.15;
    } else {
      // Regime 3: Micro Aerodynamic Tracer (z >= 17.0)
      // Slender ribbon (target 2.0px, <= 0.83m, clamped down to 0.20m)
      widthMeters = metersPerPixel * 2.0;
      heightRatio = 0.15;
      maxHeight = 0.10;
    }
  }

  if (hasCustomHeightRatio) {
    heightRatio = options.heightRatio;
    maxHeight = 1000.0;
  }

  const clampedWidth = Math.max(minWidth, Math.min(maxWidth, widthMeters));
  const roundedWidth = Math.round(clampedWidth * 100) / 100;

  const rawHeight = roundedWidth * heightRatio;
  const clampedHeight = Math.min(maxHeight, rawHeight);
  const roundedHeight = Math.max(0.04, Math.round(clampedHeight * 100) / 100);

  const halfWidth = Math.round((roundedWidth / 2) * 100) / 100;
  const halfHeight = Math.round((roundedHeight / 2) * 100) / 100;

  return {
    widthMeters: roundedWidth,
    heightMeters: roundedHeight,
    halfWidth,
    halfHeight,
    metersPerPixel: Math.round(metersPerPixel * 10000) / 10000
  };
}

