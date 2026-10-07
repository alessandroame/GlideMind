import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    WGS84_A,
    EARTH_RADIUS_KM,
    igcDmmToDecimal,
    igcDecimalToDmm,
    computeDistanceKm,
    computeBearing,
    angularDifference,
    computeWindComponents,
    calculateRouteDistance,
    smoothPolyline,
    distToSegment,
    distToSegmentSquared,
    getMercatorMeterScale,
    wgs84ToMercator,
    mercatorToWgs84,
    projectGeoToLocalMetric,
    buildMercatorTrackDelta,
    buildMercatorGroupTransform,
    buildMapLibreCustomLayerMatrix,
    computeDemAltitudeOffset,
    interpolateAltitudeGradient,
    applyAltitudeGradientOffset
} from '../../core/geoSpatialMath.js';

describe('GeoSpatialMath Engine - Geodesy & Coordinates', () => {

    it('should correctly parse IGC DMM coordinates to decimal degrees', () => {
        // Monte Grappa Cima Grappa takeoff: 45° 52.260' N, 11° 48.060' E
        // 45 + (52 + 260/1000)/60 = 45.871
        // 11 + (48 + 60/1000)/60 = 11.801
        const lat = igcDmmToDecimal('4552260N', 'lat');
        const lon = igcDmmToDecimal('01148060E', 'lon');

        assert.equal(lat, 45.871);
        assert.equal(lon, 11.801);

        // Southern and Western hemispheres
        const southLat = igcDmmToDecimal('3355500S', 'lat'); // 33° 55.500' S = -33.925
        const westLon = igcDmmToDecimal('04312000W', 'lon'); // 043° 12.000' W = -43.200

        assert.equal(southLat, -33.925);
        assert.equal(westLon, -43.2);

        // Invalid or malformed inputs return 0
        assert.equal(igcDmmToDecimal('', 'lat'), 0);
        assert.equal(igcDmmToDecimal(null, 'lat'), 0);
        assert.equal(igcDmmToDecimal('123', 'lat'), 0);
    });

    it('should convert decimal degrees back to standard IGC DMM strings with zero-padding', () => {
        const latStr = igcDecimalToDmm(45.871, 'lat');
        const lonStr = igcDecimalToDmm(11.801, 'lon');

        assert.equal(latStr, '4552260N');
        assert.equal(lonStr, '01148060E');

        const southStr = igcDecimalToDmm(-33.925, 'lat');
        const westStr = igcDecimalToDmm(-43.2, 'lon');

        assert.equal(southStr, '3355500S');
        assert.equal(westStr, '04312000W');

        // Edge case: invalid input
        assert.equal(igcDecimalToDmm(NaN, 'lat'), '0000000N');
        assert.equal(igcDecimalToDmm(NaN, 'lon'), '00000000E');
    });

    it('should calculate great-circle distance between verified geographic coordinates', () => {
        // Rome (41.9028° N, 12.4964° E) to Milan (45.4642° N, 9.1900° E)
        // Known Haversine distance is ~477 km
        const distRomeMilan = computeDistanceKm(41.9028, 12.4964, 45.4642, 9.1900);
        assert.ok(distRomeMilan > 475 && distRomeMilan < 480, `Expected ~477km, got ${distRomeMilan}`);

        // Local flight segment: Col Rodella Takeoff (46.4950° N, 11.7580° E) to Canazei Landing (46.4750° N, 11.7700° E)
        // ~2.41 km
        const distFlight = computeDistanceKm(46.4950, 11.7580, 46.4750, 11.7700);
        assert.ok(distFlight > 2.3 && distFlight < 2.6, `Expected ~2.4km, got ${distFlight}`);

        // Identical coordinates yield 0
        assert.equal(computeDistanceKm(45.0, 10.0, 45.0, 10.0), 0);
    });

    it('should compute initial forward bearing accurately', () => {
        // Due North
        const bearingNorth = computeBearing(45.0, 10.0, 46.0, 10.0);
        assert.ok(Math.abs(bearingNorth - 0) < 0.01 || Math.abs(bearingNorth - 360) < 0.01);

        // Due East
        const bearingEast = computeBearing(0.0, 10.0, 0.0, 11.0);
        assert.ok(Math.abs(bearingEast - 90) < 0.1);

        // Due South
        const bearingSouth = computeBearing(46.0, 10.0, 45.0, 10.0);
        assert.ok(Math.abs(bearingSouth - 180) < 0.1);

        // Due West
        const bearingWest = computeBearing(0.0, 11.0, 0.0, 10.0);
        assert.ok(Math.abs(bearingWest - 270) < 0.1);

        // Identical points return 0
        assert.equal(computeBearing(45.0, 10.0, 45.0, 10.0), 0);
    });

    it('should calculate shortest angular difference across compass wrap-around', () => {
        assert.equal(angularDifference(10, 350), 20);
        assert.equal(angularDifference(350, 10), 20);
        assert.equal(angularDifference(0, 180), 180);
        assert.equal(angularDifference(90, 270), 180);
        assert.equal(angularDifference(45, 65), 20);
        assert.equal(angularDifference(360, 0), 0);
    });

    it('should decompose wind vector into headwind and crosswind components relative to heading', () => {
        // Scenario 1: Runway heading 180° (South), Wind 180° (Pure headwind) at 20 km/h
        const s1 = computeWindComponents(20, 180, 180);
        assert.equal(s1.headwind, 20);
        assert.equal(s1.crosswind, 0);
        assert.equal(s1.angleOffAxis, 0);

        // Scenario 2: Runway heading 180°, Wind 0° (Pure tailwind) at 15 km/h
        const s2 = computeWindComponents(15, 0, 180);
        assert.equal(s2.headwind, -15);
        assert.equal(s2.crosswind, 0);
        assert.equal(s2.angleOffAxis, 180);

        // Scenario 3: Runway heading 180°, Wind 270° (West, 90° right crosswind) at 10 km/h
        const s3 = computeWindComponents(10, 270, 180);
        assert.equal(s3.headwind, 0);
        assert.equal(s3.crosswind, 10);
        assert.equal(s3.angleOffAxis, 90);

        // Scenario 4: Runway heading 180°, Wind 90° (East, 90° left crosswind) at 10 km/h
        const s4 = computeWindComponents(10, 90, 180);
        assert.equal(s4.headwind, 0);
        assert.equal(s4.crosswind, -10);
        assert.equal(s4.angleOffAxis, 90);
    });

    it('should calculate cumulative route distance along track points', () => {
        const points = [
            { lat: 46.4950, lon: 11.7580 },
            { lat: 46.4850, lon: 11.7640 },
            { lat: 46.4750, lon: 11.7700 }
        ];

        const seg1 = computeDistanceKm(points[0].lat, points[0].lon, points[1].lat, points[1].lon);
        const seg2 = computeDistanceKm(points[1].lat, points[1].lon, points[2].lat, points[2].lon);
        const total = calculateRouteDistance(points);

        assert.ok(Math.abs(total - (seg1 + seg2)) < 0.005);
        assert.equal(calculateRouteDistance([]), 0);
        assert.equal(calculateRouteDistance([{ lat: 45, lon: 10 }]), 0);
    });

    it('should smooth a polyline with Chaikin algorithm while keeping endpoints', () => {
        const line = [
            { lat: 45.0, lon: 10.0 },
            { lat: 45.1, lon: 10.2 },
            { lat: 45.3, lon: 10.1 },
            { lat: 45.4, lon: 10.3 }
        ];

        const smoothed = smoothPolyline(line, 2);
        assert.ok(smoothed.length > line.length);
        assert.equal(smoothed[0].lat, line[0].lat);
        assert.equal(smoothed[0].lon, line[0].lon);
        assert.equal(smoothed[smoothed.length - 1].lat, line[line.length - 1].lat);
        assert.equal(smoothed[smoothed.length - 1].lon, line[line.length - 1].lon);

        // Less than 3 points returns original
        const shortLine = [{ lat: 45.0, lon: 10.0 }, { lat: 45.1, lon: 10.1 }];
        assert.equal(smoothPolyline(shortLine).length, 2);
    });

    it('should calculate distance from 2D point to line segment', () => {
        const v = { x: 0, y: 0 };
        const w = { x: 10, y: 0 };

        // Point directly above midpoint (5, 5) -> distance should be 5
        const pMid = { x: 5, y: 5 };
        assert.equal(distToSegment(pMid, v, w), 5);
        assert.equal(distToSegmentSquared(pMid, v, w), 25);

        // Point before segment start (-3, 4) -> distance to v (0,0) is 5
        const pBefore = { x: -3, y: 4 };
        assert.equal(distToSegment(pBefore, v, w), 5);

        // Point after segment end (13, 4) -> distance to w (10,0) is 5
        const pAfter = { x: 13, y: 4 };
        assert.equal(distToSegment(pAfter, v, w), 5);
    });
});

describe('GeoSpatialMath Engine - Web Mercator & Topocentric 3D', () => {

    it('should project WGS84 coordinates to EPSG:3857 Web Mercator and invert accurately', () => {
        // Equator at prime meridian (0° lon, 0° lat)
        const mercOrigin = wgs84ToMercator(0, 0, 0);
        assert.equal(mercOrigin.x, 0.5);
        assert.equal(mercOrigin.y, 0.5);
        assert.equal(mercOrigin.z, 0);

        // Invert back to WGS84
        const invOrigin = mercatorToWgs84(mercOrigin.x, mercOrigin.y, mercOrigin.z);
        assert.equal(invOrigin.lon, 0);
        assert.equal(invOrigin.lat, 0);

        // Alpine takeoff coordinates with altitude: Lat 45.871, Lon 11.801, Alt 1500m
        const mercTakeoff = wgs84ToMercator(11.801, 45.871, 1500);
        assert.ok(mercTakeoff.x > 0.5 && mercTakeoff.x < 0.6);
        assert.ok(mercTakeoff.y < 0.5 && mercTakeoff.y > 0.2); // Northern hemisphere is y < 0.5
        assert.ok(mercTakeoff.z > 0);

        const invTakeoff = mercatorToWgs84(mercTakeoff.x, mercTakeoff.y, mercTakeoff.z);
        assert.ok(Math.abs(invTakeoff.lat - 45.871) < 1e-5);
        assert.ok(Math.abs(invTakeoff.lon - 11.801) < 1e-5);
        assert.ok(Math.abs(invTakeoff.alt - 1500) < 0.5);
    });

    it('should compute conformal Mercator meter scale scaling with latitude secant', () => {
        const scaleEq = getMercatorMeterScale(0);
        const scale60 = getMercatorMeterScale(60);

        // At 60° latitude, cos(60) = 0.5, so scale factor should be exactly double that of the equator
        assert.ok(Math.abs(scale60 - 2 * scaleEq) / scaleEq < 1e-4);
    });

    it('should project GPS points into local metric topocentric space (Three.js ENU)', () => {
        const origin = { lon: 11.0, lat: 45.0, alt: 1000 };
        const points = [
            { lon: 11.0, lat: 45.0, alt: 1000, timeSeconds: 0 },
            { lon: 11.001, lat: 45.0, alt: 1050, timeSeconds: 10 },
            { lon: 11.001, lat: 45.001, alt: 1100, timeSeconds: 20 }
        ];

        const projected = projectGeoToLocalMetric(points, origin);
        assert.equal(projected.length, 3);

        // First point is origin
        assert.equal(projected[0].x, 0);
        assert.equal(projected[0].y, 0);
        assert.equal(projected[0].z, 0);
        assert.equal(projected[0].speedKmh, 0);
        assert.equal(projected[0].vario, 0);

        // Second point: moved East (+X), gained 50m (+Y)
        assert.ok(projected[1].x > 50 && projected[1].x < 100, `Expected +X > 50, got ${projected[1].x}`);
        assert.equal(projected[1].y, 50);
        assert.ok(projected[1].vario > 0, `Expected positive climb rate, got ${projected[1].vario}`);
        assert.ok(projected[1].speedKmh > 0, `Expected positive ground speed, got ${projected[1].speedKmh}`);

        // Third point: moved North (which is -Z in Three.js camera conventions)
        assert.ok(projected[2].z < 0, `Expected -Z towards North, got ${projected[2].z}`);
        assert.equal(projected[2].y, 100);
    });

    it('should build Mercator track deltas without DOM dependencies', () => {
        const points = [
            { lon: 11.7580, lat: 46.4950, alt: 2200, timeSeconds: 100 },
            { lon: 11.7640, lat: 46.4850, alt: 2100, timeSeconds: 160 }
        ];

        const delta = buildMercatorTrackDelta(points);
        assert.ok(delta.originMercator != null);
        assert.ok(delta.originMeterScale > 0);
        assert.equal(delta.points.length, 2);
        assert.equal(delta.points[0].x, 0);
        assert.equal(delta.points[0].y, 0);
        assert.equal(delta.points[0].z, 2200);

        // Handling empty array safely
        const empty = buildMercatorTrackDelta([]);
        assert.equal(empty.points.length, 0);
    });

    it('should handle optional Three.js matrix composition gracefully when Three.js is null', () => {
        assert.equal(buildMercatorGroupTransform(null, {}, 1), null);
        assert.equal(buildMapLibreCustomLayerMatrix(null, [], {}), null);
    });
});

describe('GeoSpatialMath Engine - DEM Terrain Calibration', () => {

    it('should compute single-shot DEM altitude offset for takeoff snapping', () => {
        const valid = computeDemAltitudeOffset(1500, 1532.4);
        assert.equal(valid.isValid, true);
        assert.equal(valid.deltaH, 32.4);

        // Invalid cases (null, negative, or NaN DEM elevation)
        assert.equal(computeDemAltitudeOffset(1500, null).isValid, false);
        assert.equal(computeDemAltitudeOffset(1500, -10).isValid, false);
        assert.equal(computeDemAltitudeOffset(1500, NaN).isValid, false);
    });

    it('should interpolate altitude gradient across flight trajectory', () => {
        const hTakeoff = 1500;
        const hLanding = 800;
        const deltaTakeoff = 20; // At takeoff: DEM is 1520m, GPS says 1500m -> +20m
        const deltaLanding = 10; // At landing: DEM is 810m, GPS says 800m -> +10m

        // Exactly at takeoff altitude
        const dAtTakeoff = interpolateAltitudeGradient(1500, hTakeoff, hLanding, deltaTakeoff, deltaLanding);
        assert.equal(dAtTakeoff, 20);

        // Exactly at landing altitude
        const dAtLanding = interpolateAltitudeGradient(800, hTakeoff, hLanding, deltaTakeoff, deltaLanding);
        assert.equal(dAtLanding, 10);

        // Halfway between takeoff and landing (1150m)
        const dAtMid = interpolateAltitudeGradient(1150, hTakeoff, hLanding, deltaTakeoff, deltaLanding);
        assert.equal(dAtMid, 15);

        // Above takeoff in thermal (2200m): clamping prevents runaway extrapolation
        const dAbove = interpolateAltitudeGradient(2200, hTakeoff, hLanding, deltaTakeoff, deltaLanding, { clampAboveTakeoff: true });
        assert.equal(dAbove, 20);

        // Top landing edge case (takeoff and landing at virtually same altitude)
        const dTopLanding = interpolateAltitudeGradient(1500, 1500, 1505, 20, 10);
        assert.equal(dTopLanding, 15); // Returns average
    });

    it('should apply dual-point altitude gradient across track point array', () => {
        const points = [
            { alt: 1500, lat: 46.0, lon: 11.0 },
            { alt: 1150, lat: 46.01, lon: 11.01 },
            { alt: 800, lat: 46.02, lon: 11.02 }
        ];

        const calibrated = applyAltitudeGradientOffset(points, 1520, 810);
        assert.equal(calibrated.isValid, true);
        assert.equal(calibrated.deltaTakeoff, 20);
        assert.equal(calibrated.deltaLanding, 10);
        assert.equal(calibrated.points.length, 3);

        // Calibrated altitudes: 1500 + 20 = 1520; 1150 + 15 = 1165; 800 + 10 = 810
        assert.equal(calibrated.points[0].alt, 1520);
        assert.equal(calibrated.points[1].alt, 1165);
        assert.equal(calibrated.points[2].alt, 810);
    });
});
