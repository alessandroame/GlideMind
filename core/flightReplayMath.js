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
    turnRateDegSec: Math.round(turnRateDegSec * 10) / 10
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
 * @returns {number} Scale multiplier (>= 1.0)
 */
export function calculateAvatarMinScale(
  cameraDistanceMeters,
  fovDeg = 60,
  viewportHeightPx = 800,
  minPixelSize = 36,
  physicalSpanMeters = 10
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
  // Limit maximum magnification to 100x to prevent visual artifacts
  return Math.max(1.0, Math.min(100.0, Math.round(requiredScale * 100) / 100));
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
 * Calculates dynamic 3D track ribbon width and height in meters based on 3D perspective camera zoom.
 * In MapLibre 3D with perspective projection, maintains a consistent, crisp visual screen width
 * of at least 4 pixels across all zoom levels without engulfing the paraglider avatar or vanishing.
 * 
 * @param {number} zoom Current map zoom level (e.g. 10 - 20)
 * @param {number} [_latitude=46.0] Geographic latitude (retained for backward compatibility)
 * @param {object} [options]
 * @param {number} [options.targetPixels=4.0] Target visual thickness on screen in pixels (minimum 4px)
 * @param {number} [options.minWidthMeters=0.35] Minimum physical width clamp in meters (close-up)
 * @param {number} [options.maxWidthMeters=25.0] Maximum physical width clamp in meters (overview)
 * @param {number} [options.heightRatio=0.6] Ratio of vertical thickness to horizontal width
 * @returns {{ widthMeters: number, heightMeters: number, halfWidth: number, halfHeight: number, metersPerPixel: number }}
 */
export function calculateRibbonDimensions(zoom, latitude = 46.0, options = {}) {
  const targetPixels = typeof options.targetPixels === 'number' && !isNaN(options.targetPixels)
    ? options.targetPixels
    : 6.0;
  const minWidth = typeof options.minWidthMeters === 'number' && !isNaN(options.minWidthMeters)
    ? options.minWidthMeters
    : 0.20;
  const maxWidth = typeof options.maxWidthMeters === 'number' && !isNaN(options.maxWidthMeters)
    ? options.maxWidthMeters
    : 1000.0;
  const heightRatio = typeof options.heightRatio === 'number' && !isNaN(options.heightRatio)
    ? options.heightRatio
    : 0.6;

  const z = typeof zoom === 'number' && !isNaN(zoom) ? zoom : 14;
  const lat = typeof latitude === 'number' && !isNaN(latitude) ? latitude : 46.0;
  const latRad = (lat * Math.PI) / 180;
  const cosLat = Math.max(0.1, Math.cos(latRad));

  // In Web Mercator / MapLibre 3D, the Earth circumference is 40,075,016.686 meters.
  // At zoom z, the Mercator world size is 512 * 2^z pixels.
  // Ground resolution at latitude lat: metersPerPixel = (40,075,016.686 * cosLat) / (512 * 2^z).
  const metersPerPixel = (40075016.686 * cosLat) / (512 * Math.pow(2, z));

  const rawWidth = metersPerPixel * targetPixels;
  const clampedWidth = Math.max(minWidth, Math.min(maxWidth, rawWidth));
  const roundedWidth = Math.round(clampedWidth * 100) / 100;

  const halfWidth = Math.round((roundedWidth / 2) * 100) / 100;
  const heightMeters = Math.round((roundedWidth * heightRatio) * 100) / 100;
  const halfHeight = Math.round((heightMeters / 2) * 100) / 100;

  return {
    widthMeters: roundedWidth,
    heightMeters,
    halfWidth,
    halfHeight,
    metersPerPixel: Math.round(metersPerPixel * 10000) / 10000
  };
}
