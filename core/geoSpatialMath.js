/**
 * GlideMind - Core Geospatial & Geodesic Mathematics Engine
 * 
 * Provides pure mathematical utilities with ZERO DOM dependencies:
 * 1. IGC Coordinate parsing & formatting (DMM <-> Decimal Degrees)
 * 2. Geodesic distance (Haversine WGS84) & forward azimuth / bearing
 * 3. Polyline analysis: route distance, smoothing (Chaikin), point-to-segment distance
 * 4. Wind vector decomposition: angular difference, headwind and crosswind components
 * 5. Web Mercator projection (EPSG:3857) forward and inverse transformations
 * 6. Topocentric Metric Space (ENU / Three.js Y-Up) single-shot projection
 * 7. DEM terrain altitude alignment and linear gradient interpolation
 */

/** Earth radius constants */
export const WGS84_A = 6378137.0; // WGS84 Semi-major axis in meters
export const EARTH_RADIUS_KM = 6371.0;
export const EARTH_RADIUS_M = 6371000.0;

/**
 * Converts IGC format (degrees, minutes, milliminutes) to decimal degrees.
 * Examples:
 * - Lat: "4522732N" -> 45° 22.732' N -> 45.3788667°
 * - Lon: "00721407E" -> 007° 21.407' E -> 7.3567833°
 * 
 * @param {string} rawCoord Raw coordinate string from IGC B-record
 * @param {'lat'|'lon'} type 'lat' (DDMMmmm[N|S]) or 'lon' (DDDMMmmm[E|W])
 * @returns {number} Decimal degrees with high precision (7 decimal places)
 */
export function igcDmmToDecimal(rawCoord, type = 'lat') {
    if (!rawCoord || typeof rawCoord !== 'string') return 0;
    const str = rawCoord.trim().toUpperCase();

    if (type === 'lat') {
        if (str.length < 7) return 0;
        const deg = parseInt(str.substring(0, 2), 10) || 0;
        const min = parseInt(str.substring(2, 4), 10) || 0;
        const mmm = parseInt(str.substring(4, 7), 10) || 0;
        let dec = deg + (min + mmm / 1000) / 60;
        if (str.endsWith('S')) dec = -dec;
        return Math.round(dec * 1e7) / 1e7;
    } else {
        if (str.length < 8) return 0;
        const deg = parseInt(str.substring(0, 3), 10) || 0;
        const min = parseInt(str.substring(3, 5), 10) || 0;
        const mmm = parseInt(str.substring(5, 8), 10) || 0;
        let dec = deg + (min + mmm / 1000) / 60;
        if (str.endsWith('W')) dec = -dec;
        return Math.round(dec * 1e7) / 1e7;
    }
}

/**
 * Converts decimal degrees to IGC DMM format.
 * Examples:
 * - Lat 45.3788667 -> "4522732N"
 * - Lon 7.3567833 -> "00721407E"
 * 
 * @param {number} dec Decimal coordinate
 * @param {'lat'|'lon'} type 'lat' or 'lon'
 * @returns {string} Formatted IGC DMM string
 */
export function igcDecimalToDmm(dec, type = 'lat') {
    if (dec == null || isNaN(dec)) {
        return type === 'lat' ? '0000000N' : '00000000E';
    }
    const abs = Math.abs(dec);
    const deg = Math.floor(abs);
    const minDec = (abs - deg) * 60;
    const min = Math.floor(minDec);
    const mmm = Math.round((minDec - min) * 1000);

    if (type === 'lat') {
        const hemi = dec >= 0 ? 'N' : 'S';
        const degStr = String(deg).padStart(2, '0');
        const minStr = String(min).padStart(2, '0');
        const mmmStr = String(Math.min(999, mmm)).padStart(3, '0');
        return `${degStr}${minStr}${mmmStr}${hemi}`;
    } else {
        const hemi = dec >= 0 ? 'E' : 'W';
        const degStr = String(deg).padStart(3, '0');
        const minStr = String(min).padStart(2, '0');
        const mmmStr = String(Math.min(999, mmm)).padStart(3, '0');
        return `${degStr}${minStr}${mmmStr}${hemi}`;
    }
}

/**
 * Computes great-circle distance between two WGS84 points using the Haversine formula.
 * 
 * @param {number} lat1 Latitude 1 in decimal degrees
 * @param {number} lon1 Longitude 1 in decimal degrees
 * @param {number} lat2 Latitude 2 in decimal degrees
 * @param {number} lon2 Longitude 2 in decimal degrees
 * @returns {number} Great-circle distance in kilometers
 */
export function computeDistanceKm(lat1, lon1, lat2, lon2) {
    if (lat1 === lat2 && lon1 === lon2) return 0;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const dPhi = ((lat2 - lat1) * Math.PI) / 180;
    const dLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
    return EARTH_RADIUS_KM * c;
}

/**
 * Computes initial forward azimuth / bearing from point 1 to point 2 in degrees [0, 360).
 * 
 * @param {number} lat1 Latitude 1 in decimal degrees
 * @param {number} lon1 Longitude 1 in decimal degrees
 * @param {number} lat2 Latitude 2 in decimal degrees
 * @param {number} lon2 Longitude 2 in decimal degrees
 * @returns {number} Bearing in degrees clockwise from True North [0, 360)
 */
export function computeBearing(lat1, lon1, lat2, lon2) {
    if (lat1 === lat2 && lon1 === lon2) return 0;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const dLambda = ((lon2 - lon1) * Math.PI) / 180;

    const y = Math.sin(dLambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
    const b = (Math.atan2(y, x) * 180) / Math.PI;
    return (b + 360) % 360;
}

export const calculateBearing = computeBearing;

/**
 * Calculates a destination point given an origin, distance in meters, and bearing.
 * Uses high-precision planar tangent projection optimal for local aeronautical and landing patterns (< 10km).
 * 
 * @param {{ lat: number, lon: number }|number[]} origin Origin coordinates
 * @param {number} distanceMeters Distance in meters
 * @param {number} bearingDegrees Compass bearing in degrees [0, 360)
 * @returns {{ lat: number, lon: number } | null}
 */
export function calculateDestinationPoint(origin, distanceMeters, bearingDegrees) {
    if (!origin) return null;
    const lat = typeof origin.lat === 'number' ? origin.lat : (Array.isArray(origin) ? Number(origin[0]) : NaN);
    const lon = typeof origin.lon === 'number' ? origin.lon : (Array.isArray(origin) ? Number(origin[1]) : NaN);
    if (isNaN(lat) || isNaN(lon)) return null;

    const dist = Math.max(0, Number(distanceMeters) || 0);
    if (dist === 0) return { lat, lon };

    const brgRad = ((Number(bearingDegrees) || 0) * Math.PI) / 180;
    const latRad = (lat * Math.PI) / 180;
    const rEarth = 6371000; // Mean Earth radius in meters

    const deltaY = dist * Math.cos(brgRad);
    const deltaX = dist * Math.sin(brgRad);

    const lat2 = lat + (deltaY / rEarth) * (180 / Math.PI);
    const lon2 = lon + (deltaX / (rEarth * Math.cos(latRad))) * (180 / Math.PI);

    return {
        lat: Number(lat2.toFixed(6)),
        lon: Number(lon2.toFixed(6))
    };
}

/**
 * Computes shortest angular difference between two compass bearings in degrees [0, 180].
 * 
 * @param {number} a First angle in degrees
 * @param {number} b Second angle in degrees
 * @returns {number} Angular difference [0, 180]
 */
export function angularDifference(a, b) {
    let diff = Math.abs((Number(a) || 0) - (Number(b) || 0)) % 360;
    if (diff > 180) diff = 360 - diff;
    return diff;
}

/**
 * Decomposes wind speed and direction relative to a target heading (e.g. runway/takeoff orientation).
 * 
 * @param {number} windSpeed Wind speed in km/h
 * @param {number} windDir Wind direction in degrees [0, 360) (direction wind is blowing FROM)
 * @param {number} heading Takeoff heading azimuth in degrees [0, 360)
 * @returns {{ headwind: number, crosswind: number, angleOffAxis: number }}
 *   headwind: positive for headwind, negative for tailwind (km/h)
 *   crosswind: positive for right crosswind, negative for left crosswind (km/h)
 *   angleOffAxis: absolute angular deviation in degrees [0, 180]
 */
export function computeWindComponents(windSpeed, windDir, heading) {
    const speed = Math.max(0, Number(windSpeed) || 0);
    const wDir = (Number(windDir) || 0) % 360;
    const hDeg = (Number(heading) || 0) % 360;

    const angleOffAxis = angularDifference(wDir, hDeg);

    // Relative angle between wind origin and heading (radians)
    const relRad = ((wDir - hDeg) * Math.PI) / 180;

    // Headwind: cos(0) = 1 (pure headwind), cos(PI) = -1 (pure tailwind)
    const rawHeadwind = Math.round(speed * Math.cos(relRad) * 10) / 10;
    const headwind = rawHeadwind === 0 ? 0 : rawHeadwind;

    // Crosswind: positive = wind coming from the right, negative = from the left
    const rawCrosswind = Math.round(speed * Math.sin(relRad) * 10) / 10;
    const crosswind = rawCrosswind === 0 ? 0 : rawCrosswind;

    return { headwind, crosswind, angleOffAxis };
}

/**
 * Calculates total cumulative distance along a sequence of coordinate points in kilometers.
 * 
 * @param {Array<{lat: number, lon?: number, lng?: number}>} points Array of coordinate points
 * @returns {number} Distance in kilometers
 */
export function calculateRouteDistance(points) {
    if (!Array.isArray(points) || points.length < 2) return 0;
    let totalKm = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        if (!p1 || !p2) continue;
        const lat1 = typeof p1.lat === 'function' ? p1.lat() : Number(p1.lat);
        const lon1 = typeof p1.lon === 'number' ? p1.lon : (typeof p1.lng === 'function' ? p1.lng() : Number(p1.lng));
        const lat2 = typeof p2.lat === 'function' ? p2.lat() : Number(p2.lat);
        const lon2 = typeof p2.lon === 'number' ? p2.lon : (typeof p2.lng === 'function' ? p2.lng() : Number(p2.lng));

        if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) continue;
        totalKm += computeDistanceKm(lat1, lon1, lat2, lon2);
    }
    return Math.round(totalKm * 1000) / 1000;
}

/**
 * Smooths a line of coordinate points using Chaikin's corner-cutting algorithm.
 * Operates purely on objects having {lat, lon} or {lat, lng} properties.
 * 
 * @param {Array<{lat: number, lon?: number, lng?: number}>} points
 * @param {number} [iterations=3] Number of smoothing passes
 * @returns {Array<{lat: number, lon: number}>} Smoothed array of points
 */
export function smoothPolyline(points, iterations = 3) {
    if (!Array.isArray(points) || points.length < 3) return points ? [...points] : [];
    
    // Normalize coordinates to {lat, lon}
    let current = points.map(p => ({
        lat: Number(p.lat),
        lon: typeof p.lon === 'number' ? p.lon : Number(p.lng)
    }));

    for (let i = 0; i < iterations; i++) {
        const smoothed = [];
        smoothed.push(current[0]);
        for (let j = 0; j < current.length - 1; j++) {
            const p0 = current[j];
            const p1 = current[j + 1];
            smoothed.push({
                lat: 0.75 * p0.lat + 0.25 * p1.lat,
                lon: 0.75 * p0.lon + 0.25 * p1.lon
            });
            smoothed.push({
                lat: 0.25 * p0.lat + 0.75 * p1.lat,
                lon: 0.25 * p0.lon + 0.75 * p1.lon
            });
        }
        smoothed.push(current[current.length - 1]);
        current = smoothed;
    }
    return current;
}

/**
 * Calculates squared Euclidean distance from 2D point p to line segment vw.
 * 
 * @param {{x: number, y: number}} p
 * @param {{x: number, y: number}} v
 * @param {{x: number, y: number}} w
 * @returns {number} Squared distance
 */
export function distToSegmentSquared(p, v, w) {
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return (p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2;
}

/**
 * Calculates Euclidean distance from 2D point p to line segment vw.
 * 
 * @param {{x: number, y: number}} p
 * @param {{x: number, y: number}} v
 * @param {{x: number, y: number}} w
 * @returns {number} Distance
 */
export function distToSegment(p, v, w) {
    return Math.sqrt(distToSegmentSquared(p, v, w));
}

/**
 * Computes Mercator meter conversion scale factor at a given latitude.
 * Returns scale: 1 meter in normalized Web Mercator units [0, 1].
 * 
 * @param {number} lat Latitude in decimal degrees
 * @returns {number} Scale factor: meters -> Mercator units
 */
export function getMercatorMeterScale(lat) {
    const phi = (lat * Math.PI) / 180;
    const circumference = 2 * Math.PI * WGS84_A;
    return 1 / (circumference * Math.cos(phi));
}

/**
 * Transforms WGS84 geographic coordinates [lon, lat, alt] into normalized Web Mercator EPSG:3857 coordinates.
 * Compatible with MapLibre GL JS MercatorCoordinate representation.
 * 
 * @param {number} lon Longitude in degrees
 * @param {number} lat Latitude in degrees
 * @param {number} [alt=0] Altitude in meters
 * @returns {{ x: number, y: number, z: number }} Web Mercator normalized coordinates in range [0, 1]
 */
export function wgs84ToMercator(lon, lat, alt = 0) {
    // Mercator X: [0, 1] from lon -180 to +180
    const x = (lon + 180) / 360;

    // Mercator Y: [0, 1] from lat 85.051129 to -85.051129
    // Clamp latitude to avoid division by zero near poles
    const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
    const sinLat = Math.sin((clampedLat * Math.PI) / 180);
    const y = 0.5 - (0.25 / Math.PI) * Math.log((1 + sinLat) / (1 - sinLat));

    // Mercator Z: altitude in normalized units
    const meterScale = getMercatorMeterScale(clampedLat);
    const z = (alt || 0) * meterScale;

    return { x, y, z };
}

/**
 * Transforms normalized Web Mercator coordinates [x, y, z] back into WGS84 geographic coordinates.
 * 
 * @param {number} x Mercator X [0, 1]
 * @param {number} y Mercator Y [0, 1]
 * @param {number} [z=0] Mercator Z
 * @returns {{ lon: number, lat: number, alt: number }}
 */
export function mercatorToWgs84(x, y, z = 0) {
    const lon = x * 360 - 180;
    const y2 = 180 - y * 360;
    const lat = (360 / Math.PI) * Math.atan(Math.exp((y2 * Math.PI) / 180)) - 90;
    const meterScale = getMercatorMeterScale(lat);
    const alt = meterScale !== 0 ? z / meterScale : 0;

    return {
        lon: Math.round(lon * 1e7) / 1e7,
        lat: Math.round(lat * 1e7) / 1e7,
        alt: Math.round(alt * 10) / 10
    };
}

/**
 * Transforms an array of WGS84 telemetry points into a localized Topocentric Metric Space (ENU / Three.js).
 * 
 * Coordinate System:
 * - Origin: reference point (lon0, lat0, alt0)
 * - Three.js +X: East in meters
 * - Three.js +Y: Zenith / Altitude above origin in meters (alt - alt0)
 * - Three.js +Z: South in meters (where -Z is North in Three.js right-handed camera conventions)
 * 
 * @param {Array<{ lon: number, lat: number, alt: number, timeSeconds?: number, vario?: number, speedKmh?: number, heading?: number }>} points
 * @param {{ lon: number, lat: number, alt: number }} origin Reference origin point
 * @param {object} [options]
 * @param {object} [options.maplibregl] Optional maplibregl instance for exact MercatorCoordinate projection
 * @returns {Array<{ x: number, y: number, z: number, lon: number, lat: number, alt: number, timeSeconds: number, vario: number, speedKmh: number, heading: number }>}
 */
export function projectGeoToLocalMetric(points, origin, options = {}) {
    if (!points || !Array.isArray(points) || points.length === 0) return [];
    const originPoint = (origin && typeof origin.lat === 'number' && typeof origin.lon === 'number')
        ? origin
        : points[0];

    const maplibregl = options.maplibregl || null;
    const originMerc = (maplibregl && maplibregl.MercatorCoordinate)
        ? maplibregl.MercatorCoordinate.fromLngLat([originPoint.lon, originPoint.lat], originPoint.alt || 0)
        : wgs84ToMercator(originPoint.lon, originPoint.lat, originPoint.alt || 0);

    const meterScale = (originMerc && typeof originMerc.meterInMercatorCoordinateUnits === 'function')
        ? originMerc.meterInMercatorCoordinateUnits()
        : getMercatorMeterScale(originPoint.lat);

    const n = points.length;
    const projected = new Array(n);
    const originAlt = originPoint.alt || 0;

    // Lat/Lon to meters fallback constants
    const latToMeters = 111139.0;
    const lonToMeters = 111139.0 * Math.cos((originPoint.lat * Math.PI) / 180);

    for (let i = 0; i < n; i++) {
        const p = points[i];
        let x, y, z;

        if (maplibregl && maplibregl.MercatorCoordinate) {
            const ptMerc = maplibregl.MercatorCoordinate.fromLngLat([p.lon, p.lat], p.alt || 0);
            x = (ptMerc.x - originMerc.x) / meterScale;
            y = (p.alt || 0) - originAlt;
            z = (ptMerc.y - originMerc.y) / meterScale;
        } else {
            x = (p.lon - originPoint.lon) * lonToMeters;
            y = (p.alt || 0) - originAlt;
            z = (originPoint.lat - p.lat) * latToMeters;
        }

        // Heading computation (if missing)
        let heading = p.heading;
        if (heading === undefined || isNaN(heading)) {
            if (i < n - 1) {
                heading = computeBearing(p.lat, p.lon, points[i + 1].lat, points[i + 1].lon);
            } else if (i > 0) {
                heading = projected[i - 1].heading;
            } else {
                heading = 0;
            }
        }

        // Ground speed computation in km/h (if missing)
        let speedKmh = p.speedKmh;
        if (speedKmh === undefined || isNaN(speedKmh)) {
            if (i > 0) {
                const prev = points[i - 1];
                const dt = Math.max(1, (p.timeSeconds ?? i) - (prev.timeSeconds ?? (i - 1)));
                const distKm = computeDistanceKm(prev.lat, prev.lon, p.lat, p.lon);
                speedKmh = Math.round((distKm / (dt / 3600)) * 10) / 10;
                if (speedKmh > 180) speedKmh = projected[i - 1].speedKmh || 38;
            } else {
                speedKmh = 0;
            }
        }

        // Variometer vertical speed in m/s (if missing)
        let vario = p.vario;
        if (vario === undefined || isNaN(vario)) {
            if (i > 0) {
                const prev = points[i - 1];
                const dt = Math.max(0.5, (p.timeSeconds ?? i) - (prev.timeSeconds ?? (i - 1)));
                const dh = (p.alt || 0) - (prev.alt || 0);
                vario = Math.round((dh / dt) * 10) / 10;
            } else {
                vario = 0;
            }
        }

        projected[i] = {
            x: Math.round(x * 100) / 100,
            y: Math.round(y * 100) / 100,
            z: Math.round(z * 100) / 100,
            lon: p.lon,
            lat: p.lat,
            alt: p.alt || 0,
            timeSeconds: p.timeSeconds !== undefined ? p.timeSeconds : i,
            vario,
            speedKmh,
            heading: Math.round(heading * 10) / 10
        };
    }

    return projected;
}

/**
 * Computes Mercator delta coordinates (dx, dy, dz) normalized by origin meter scale.
 * Used for MapLibre CustomLayer Three.js track alignment.
 * 
 * @param {Array<{ lon: number, lat: number, alt: number }>} points Track points
 * @param {object} [maplibreglInstance] MapLibre GL JS library instance
 * @returns {{ originMercator: object, originMeterScale: number, points: Array<object> }}
 */
export function buildMercatorTrackDelta(points, maplibreglInstance = null) {
    if (!points || !Array.isArray(points) || points.length === 0) {
        return { originMercator: null, originMeterScale: 1, points: [] };
    }

    const p0 = points[0];
    let originMercator;
    let originMeterScale;

    if (maplibreglInstance && maplibreglInstance.MercatorCoordinate) {
        originMercator = maplibreglInstance.MercatorCoordinate.fromLngLat({ lng: p0.lon, lat: p0.lat }, 0);
        originMeterScale = originMercator.meterInMercatorCoordinateUnits();
    } else {
        const merc = wgs84ToMercator(p0.lon, p0.lat, 0);
        originMercator = { x: merc.x, y: merc.y, z: 0 };
        originMeterScale = getMercatorMeterScale(p0.lat);
    }

    const n = points.length;
    const projected = new Array(n);

    for (let i = 0; i < n; i++) {
        const pt = points[i];
        let mCoord;
        if (maplibreglInstance && maplibreglInstance.MercatorCoordinate) {
            mCoord = maplibreglInstance.MercatorCoordinate.fromLngLat({ lng: pt.lon, lat: pt.lat }, pt.alt || 0);
        } else {
            mCoord = wgs84ToMercator(pt.lon, pt.lat, pt.alt || 0);
        }

        const dx = (mCoord.x - originMercator.x) / originMeterScale;
        const dy = (mCoord.y - originMercator.y) / originMeterScale;
        const dz = pt.alt || 0; // Absolute altitude in meters (Z is Up in MapLibre Mercator custom layer space)

        let heading = pt.heading;
        if (heading === undefined || isNaN(heading)) {
            if (i < n - 1) {
                heading = computeBearing(pt.lat, pt.lon, points[i + 1].lat, points[i + 1].lon);
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
                const distKm = computeDistanceKm(prev.lat, prev.lon, pt.lat, pt.lon);
                speedKmh = Math.round((distKm / (dt / 3600)) * 10) / 10;
                if (speedKmh > 180) speedKmh = projected[i - 1].speedKmh || 38;
            } else {
                speedKmh = 0;
            }
        }

        let vario = pt.vario;
        if (vario === undefined || isNaN(vario)) {
            if (i > 0) {
                const prev = points[i - 1];
                const dt = Math.max(0.5, (pt.timeSeconds ?? i) - (prev.timeSeconds ?? (i - 1)));
                const dh = (pt.alt || 0) - (prev.alt || 0);
                vario = Math.round((dh / dt) * 10) / 10;
            } else {
                vario = 0;
            }
        }

        projected[i] = {
            x: Math.round(dx * 100) / 100,
            y: Math.round(dy * 100) / 100,
            z: Math.round(dz * 100) / 100,
            lon: pt.lon,
            lat: pt.lat,
            alt: pt.alt || 0,
            timeSeconds: pt.timeSeconds !== undefined ? pt.timeSeconds : i,
            vario,
            speedKmh,
            heading: Math.round(heading * 10) / 10
        };
    }

    return {
        originMercator,
        originMeterScale,
        points: projected
    };
}

/**
 * Creates the Three.js Matrix4 transform for a Mercator-anchored group.
 * 
 * @param {object} THREE Three.js library instance
 * @param {object} originMercator { x, y, z }
 * @param {number} originMeterScale
 * @returns {object|null} Three.js Matrix4 or null if THREE is not provided
 */
export function buildMercatorGroupTransform(THREE, originMercator, originMeterScale) {
    if (!THREE || !originMercator || !originMeterScale) return null;
    const transform = new THREE.Matrix4();
    transform.makeScale(originMeterScale, originMeterScale, originMeterScale);
    transform.setPosition(originMercator.x, originMercator.y, originMercator.z || 0);
    return transform;
}

/**
 * Builds the canonical MapLibre CustomLayer Three.js Model-View-Projection Matrix.
 * 
 * @param {object} THREE Three.js library instance
 * @param {Array<number>} maplibreglMatrix 16-element Float64/Float32 array from customLayer.render(gl, matrix)
 * @param {{ translateX: number, translateY: number, translateZ: number, scale: number }} modelTransform
 * @returns {object|null} Three.js Matrix4 projection matrix
 */
export function buildMapLibreCustomLayerMatrix(THREE, maplibreglMatrix, modelTransform) {
    if (!THREE || !maplibreglMatrix || !modelTransform) return null;

    const rotationX = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0),
        Math.PI / 2
    );

    const m = new THREE.Matrix4().fromArray(maplibreglMatrix);
    const l = new THREE.Matrix4()
        .makeTranslation(
            modelTransform.translateX,
            modelTransform.translateY,
            modelTransform.translateZ
        )
        .scale(
            new THREE.Vector3(
                modelTransform.scale,
                -modelTransform.scale,
                modelTransform.scale
            )
        )
        .multiply(rotationX);

    return m.multiply(l);
}

/**
 * Calculates DEM terrain delta offset (Delta H) to snap takeoff or trajectory to the ground.
 * 
 * @param {number} recordedTakeoffAlt Altitude recorded in IGC/GPS at takeoff in meters
 * @param {number|null} sampledDemElevation Altitude sampled from MapLibre DEM raster in meters
 * @returns {{ deltaH: number, isValid: boolean }}
 */
export function computeDemAltitudeOffset(recordedTakeoffAlt, sampledDemElevation) {
    if (sampledDemElevation == null || isNaN(sampledDemElevation) || sampledDemElevation <= 0) {
        return { deltaH: 0, isValid: false };
    }
    const deltaH = Math.round((sampledDemElevation - recordedTakeoffAlt) * 10) / 10;
    return { deltaH, isValid: true };
}

/**
 * Calculates interpolated altitude offset (Delta H) for a given point altitude based on takeoff and landing offsets.
 * 
 * @param {number} alt Recorded altitude of the current point (meters)
 * @param {number} hTakeoff Recorded altitude at takeoff (meters)
 * @param {number} hLanding Recorded altitude at landing (meters)
 * @param {number} deltaTakeoff Required offset at takeoff (DEM_takeoff - hTakeoff) (meters)
 * @param {number} deltaLanding Required offset at landing (DEM_landing - hLanding) (meters)
 * @param {object} [options]
 * @param {boolean} [options.clampAboveTakeoff=true] If true, prevents runaway extrapolation in thermals
 * @param {number} [options.minDeltaH=-500] Minimum allowed delta in meters
 * @param {number} [options.maxDeltaH=500] Maximum allowed delta in meters
 * @returns {number} Interpolated delta offset in meters
 */
export function interpolateAltitudeGradient(alt, hTakeoff, hLanding, deltaTakeoff, deltaLanding, options = {}) {
    const {
        clampAboveTakeoff = true,
        minDeltaH = -500,
        maxDeltaH = 500
    } = options;

    const numAlt = Number(alt);
    const numHTo = Number(hTakeoff);
    const numHLz = Number(hLanding);
    const numDTo = Number(deltaTakeoff);
    const numDLz = Number(deltaLanding);

    if (isNaN(numAlt) || isNaN(numHTo) || isNaN(numHLz) || isNaN(numDTo) || isNaN(numDLz)) {
        return 0;
    }

    const altSpan = numHLz - numHTo;
    // Edge case: Top Landing or flat terrain where takeoff and landing are at practically identical altitudes
    if (Math.abs(altSpan) < 15) {
        const avg = (numDTo + numDLz) / 2;
        return Math.max(minDeltaH, Math.min(maxDeltaH, Math.round(avg * 10) / 10));
    }

    // Normalized altitude fraction between takeoff (0) and landing (1)
    let beta = (numAlt - numHTo) / altSpan;

    if (clampAboveTakeoff) {
        // Climbing above takeoff gives beta < 0 in mountain flights (hTakeoff > hLanding).
        // Clamping to [0, 1] ensures stability in thermals.
        beta = Math.max(0, Math.min(1, beta));
    }

    const deltaH = (1 - beta) * numDTo + beta * numDLz;
    const clamped = Math.max(minDeltaH, Math.min(maxDeltaH, deltaH));
    return Math.round(clamped * 10) / 10;
}

/**
 * Applies dual-point altitude gradient calibration across a sequence of track points.
 * 
 * @param {Array<{alt: number, lat: number, lon: number}>} points Track points
 * @param {number} takeoffDemElev Ground elevation at takeoff (meters)
 * @param {number} landingDemElev Ground elevation at landing (meters)
 * @param {object} [options]
 * @returns {{ points: Array<object>, deltaTakeoff: number, deltaLanding: number, isValid: boolean }}
 */
export function applyAltitudeGradientOffset(points, takeoffDemElev, landingDemElev, options = {}) {
    if (!points || !Array.isArray(points) || points.length === 0 || 
        takeoffDemElev == null || landingDemElev == null || 
        isNaN(takeoffDemElev) || isNaN(landingDemElev)) {
        return { points: points || [], deltaTakeoff: 0, deltaLanding: 0, isValid: false };
    }

    const hTakeoff = points[0].alt;
    const hLanding = points[points.length - 1].alt;
    const deltaTakeoff = Math.round((takeoffDemElev - hTakeoff) * 10) / 10;
    const deltaLanding = Math.round((landingDemElev - hLanding) * 10) / 10;

    const calibratedPoints = points.map(p => {
        const offset = interpolateAltitudeGradient(p.alt, hTakeoff, hLanding, deltaTakeoff, deltaLanding, options);
        return {
            ...p,
            alt: Math.round((p.alt + offset) * 10) / 10,
            _appliedOffset: offset
        };
    });

    return {
        points: calibratedPoints,
        deltaTakeoff,
        deltaLanding,
        isValid: true
    };
}

/**
 * Calculates aerodynamic glide ratio required between two points accounting for wind vector:
 * E_required_ground = Distance / (Delta_Altitude) * (v_trim / v_ground)
 * 
 * @param {number} distanceMeters Horizontal distance in meters
 * @param {number} deltaAltitudeMeters Positive elevation drop in meters (takeoff - landing)
 * @param {number} [windSpeedKmh=0] Wind speed in km/h
 * @param {number} [windDirDegrees=0] Wind direction in degrees (blowing FROM)
 * @param {number} [trackBearingDegrees=0] Heading from takeoff to landing in degrees [0, 360)
 * @param {object} [gliderParams=null] Active glider parameters
 * @returns {{
 *   distanceMeters: number,
 *   deltaAltitudeMeters: number,
 *   requiredGlideRatioStill: number,
 *   requiredGlideRatioWind: number,
 *   effectiveGroundSpeedKmh: number,
 *   headwindKmh: number,
 *   safeLimit: number,
 *   isSafe: boolean,
 *   severity: number,
 *   statusText: string
 * }}
 */
export function calculateWindCorrectedGlideRatio(
    distanceMeters,
    deltaAltitudeMeters,
    windSpeedKmh = 0,
    windDirDegrees = 0,
    trackBearingDegrees = 0,
    gliderParams = null
) {
    const dist = Math.max(0, Number(distanceMeters) || 0);
    const drop = Math.max(1, Number(deltaAltitudeMeters) || 1);
    const speed = Math.max(0, Number(windSpeedKmh) || 0);
    const wDir = (Number(windDirDegrees) || 0) % 360;
    const bearing = (Number(trackBearingDegrees) || 0) % 360;

    const vTrim = (gliderParams && Number(gliderParams.trimSpeedKmh)) || 38;
    const category = (gliderParams && gliderParams.category) || 'EN-A';

    let safeLimit = 5.5;
    if (category === 'EN-B') safeLimit = 6.5;
    else if (category === 'EN-C') safeLimit = 7.5;
    else if (category === 'EN-D') safeLimit = 8.5;

    const { headwind } = computeWindComponents(speed, wDir, bearing);
    const effectiveGroundSpeedKmh = Math.max(5, Math.round((vTrim - headwind) * 10) / 10);

    const requiredGlideRatioStill = Math.round((dist / drop) * 10) / 10;
    const windFactor = vTrim / effectiveGroundSpeedKmh;
    const requiredGlideRatioWind = Math.round((requiredGlideRatioStill * windFactor) * 10) / 10;

    const isSafe = requiredGlideRatioWind <= safeLimit;

    const greenThreshold = Math.round(safeLimit * 0.75 * 10) / 10;
    const redThreshold = Math.round(safeLimit * 1.25 * 10) / 10;

    let severity = 0;
    let statusText = 'Rientro agevole';

    if (requiredGlideRatioWind <= greenThreshold) {
        severity = 0;
        statusText = 'Rientro agevole';
    } else if (requiredGlideRatioWind <= safeLimit) {
        severity = 1;
        statusText = 'Nel cono';
    } else if (requiredGlideRatioWind <= redThreshold) {
        severity = 2;
        statusText = 'Rientro critico';
    } else {
        severity = 3;
        statusText = 'Fuori cono';
    }

    return {
        distanceMeters: dist,
        deltaAltitudeMeters: drop,
        requiredGlideRatioStill,
        requiredGlideRatioWind,
        effectiveGroundSpeedKmh,
        headwindKmh: headwind,
        safeLimit,
        isSafe,
        severity,
        statusText
    };
}

