import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCoordinatedBankAngle,
  calculateKinematicPitchAngle,
  interpolateAngleDegrees,
  interpolateCatmullRom,
  interpolateTrackSample,
  calculateAvatarMinScale,
  projectTrackToThreeLocal,
  calculateRibbonDimensions,
  STANDARD_GRAVITY
} from '../../core/flightReplayMath.js';

describe('Flight Replay Math - Headless Core Kinematics & Coordinates', () => {

  describe('calculateCoordinatedBankAngle', () => {
    it('should return 0 when turn rate or speed is zero or invalid', () => {
      assert.equal(calculateCoordinatedBankAngle(0, 10), 0);
      assert.equal(calculateCoordinatedBankAngle(15, 0), 0);
      assert.equal(calculateCoordinatedBankAngle(null, 10), 0);
      assert.equal(calculateCoordinatedBankAngle(15, -5), 0);
      assert.equal(calculateCoordinatedBankAngle(NaN, 10), 0);
    });

    it('should calculate positive bank angle for right turn (clockwise)', () => {
      // 18 deg/s at 10 m/s (~36 km/h)
      // omega = 18 * PI / 180 = 0.314159 rad/s
      // a_c = 10 * 0.314159 = 3.14159 m/s^2
      // tan(phi) = 3.14159 / 9.80665 = 0.32035
      // phi = atan(0.32035) ~= 17.76 deg
      const bankDeg = calculateCoordinatedBankAngle(18, 10);
      assert.ok(bankDeg > 17 && bankDeg < 18.5, `Expected bank angle ~17.8°, got ${bankDeg}`);
    });

    it('should calculate negative bank angle for left turn (counter-clockwise)', () => {
      const bankDeg = calculateCoordinatedBankAngle(-18, 10);
      assert.ok(bankDeg < -17 && bankDeg > -18.5, `Expected negative bank angle ~ -17.8°, got ${bankDeg}`);
    });

    it('should clamp bank angle to maxBankDeg', () => {
      // Very fast 360 spiral: 90 deg/s at 25 m/s (~90 km/h)
      const clamped = calculateCoordinatedBankAngle(90, 25, { maxBankDeg: 60 });
      assert.equal(clamped, 60);

      const clampedNeg = calculateCoordinatedBankAngle(-90, 25, { maxBankDeg: 60 });
      assert.equal(clampedNeg, -60);
    });

    it('should support returning angle in radians when requested', () => {
      const bankRad = calculateCoordinatedBankAngle(18, 10, { inRadians: true });
      assert.ok(bankRad > 0.3 && bankRad < 0.32, `Expected bank in radians ~0.31, got ${bankRad}`);
    });
  });

  describe('calculateKinematicPitchAngle', () => {
    it('should return 0 for level flight (vz = 0)', () => {
      assert.equal(calculateKinematicPitchAngle(0, 10), 0);
      assert.equal(calculateKinematicPitchAngle(null, 10), 0);
    });

    it('should calculate positive pitch angle during thermal climb', () => {
      // vz = +3.0 m/s, speed = 10.0 m/s -> pitch = atan(3/10) = 16.7 deg
      const pitch = calculateKinematicPitchAngle(3.0, 10.0);
      assert.ok(pitch > 16.0 && pitch < 17.5, `Expected pitch ~16.7°, got ${pitch}`);
    });

    it('should calculate negative pitch angle during glide descent', () => {
      // vz = -1.5 m/s, speed = 10.0 m/s -> pitch = atan(-1.5/10) = -8.5 deg
      const pitch = calculateKinematicPitchAngle(-1.5, 10.0);
      assert.ok(pitch < -8.0 && pitch > -9.0, `Expected pitch ~ -8.5°, got ${pitch}`);
    });

    it('should clamp to maxPitchDeg when vertical speed is high or horizontal speed is low', () => {
      const pitchClamped = calculateKinematicPitchAngle(20, 1, { maxPitchDeg: 40 });
      assert.equal(pitchClamped, 40);

      const pitchNegClamped = calculateKinematicPitchAngle(-20, 1, { maxPitchDeg: 40 });
      assert.equal(pitchNegClamped, -40);
    });

    it('should support returning pitch in radians', () => {
      const pitchRad = calculateKinematicPitchAngle(3.0, 10.0, { inRadians: true });
      assert.ok(pitchRad > 0.28 && pitchRad < 0.30, `Expected pitch rad ~0.29, got ${pitchRad}`);
    });
  });

  describe('interpolateAngleDegrees', () => {
    it('should interpolate along the shortest arc without wrapping errors', () => {
      // Across 360 boundary: 350° to 10°
      // Shortest arc is +20° clockwise through 0°
      const mid = interpolateAngleDegrees(350, 10, 0.5);
      assert.equal(mid, 0);

      const q1 = interpolateAngleDegrees(350, 10, 0.25);
      assert.equal(q1, 355);

      const q3 = interpolateAngleDegrees(350, 10, 0.75);
      assert.equal(q3, 5);
    });

    it('should interpolate across 0 boundary counter-clockwise', () => {
      // 10° to 350° (counter-clockwise arc of 20°)
      const mid = interpolateAngleDegrees(10, 350, 0.5);
      assert.equal(mid, 0);
    });

    it('should handle standard angular interpolation', () => {
      assert.equal(interpolateAngleDegrees(90, 180, 0.5), 135);
      assert.equal(interpolateAngleDegrees(180, 90, 0.5), 135);
      assert.equal(interpolateAngleDegrees(45, 45, 0.5), 45);
    });

    it('should clamp factor to [0, 1] range', () => {
      assert.equal(interpolateAngleDegrees(100, 200, -0.5), 100);
      assert.equal(interpolateAngleDegrees(100, 200, 1.5), 200);
    });
  });

  describe('interpolateCatmullRom', () => {
    it('should evaluate exactly to knots at endpoints t=0 and t=1', () => {
      const p0 = 10, p1 = 20, p2 = 40, p3 = 50;
      assert.equal(interpolateCatmullRom(p0, p1, p2, p3, 0), 20);
      assert.equal(interpolateCatmullRom(p0, p1, p2, p3, 1), 40);
    });

    it('should produce a smooth intermediate value', () => {
      const mid = interpolateCatmullRom(0, 10, 20, 30, 0.5);
      assert.equal(mid, 15);
    });
  });

  describe('interpolateTrackSample', () => {
    const ptA = {
      lat: 45.5000000,
      lon: 7.8000000,
      alt: 1200,
      timeSeconds: 100,
      speedKmh: 36,
      vario: 2.0,
      heading: 90,
      x: 0,
      y: 1200,
      z: 0
    };

    const ptB = {
      lat: 45.5010000,
      lon: 7.8020000,
      alt: 1250,
      timeSeconds: 110,
      speedKmh: 40,
      vario: 3.0,
      heading: 110,
      x: 156,
      y: 1250,
      z: -111
    };

    it('should return boundary points at factor 0 and 1', () => {
      const at0 = interpolateTrackSample(ptA, ptB, 0);
      assert.equal(at0.lat, ptA.lat);
      assert.equal(at0.alt, ptA.alt);

      const at1 = interpolateTrackSample(ptA, ptB, 1);
      assert.equal(at1.lat, ptB.lat);
      assert.equal(at1.alt, ptB.alt);
    });

    it('should linearly interpolate coordinates and metrics at factor 0.5', () => {
      const mid = interpolateTrackSample(ptA, ptB, 0.5);
      assert.equal(mid.lat, 45.5005);
      assert.equal(mid.lon, 7.801);
      assert.equal(mid.alt, 1225);
      assert.equal(mid.timeSeconds, 105);
      assert.equal(mid.speedKmh, 38);
      assert.equal(mid.vario, 2.5);
      assert.equal(mid.heading, 100);
      assert.equal(mid.x, 78);
      assert.equal(mid.y, 1225);
      assert.equal(mid.z, -55.5);
      assert.ok(typeof mid.bankAngle === 'number');
      assert.ok(typeof mid.pitchAngle === 'number');
    });

    it('should support cubic Catmull-Rom smoothing when 4 points are supplied', () => {
      const ptPrev = { ...ptA, lat: 45.4990000, alt: 1160, x: -150, y: 1160, z: 110 };
      const ptNext = { ...ptB, lat: 45.5020000, alt: 1280, x: 310, y: 1280, z: -220 };

      const smoothed = interpolateTrackSample(ptA, ptB, 0.5, ptPrev, ptNext);
      assert.ok(smoothed.alt >= 1220 && smoothed.alt <= 1230);
      assert.ok(smoothed.x >= 70 && smoothed.x <= 85);
    });
  });

  describe('calculateAvatarMinScale', () => {
    it('should return scale 1.0 when camera is close enough that avatar is large', () => {
      // 100m away, wingspan 10m on 800px screen
      const scale = calculateAvatarMinScale(100, 60, 800, 36, 10);
      assert.equal(scale, 1.0);
    });

    it('should scale up avatar when camera is far away to maintain minPixelSize', () => {
      // 5000m away, avatar would naturally be tiny:
      // natural = 10 * 800 / (2 * 5000 * tan(30°)) = 8000 / 5773 = ~1.38 px
      // minPixelSize = 36 px -> required scale = 36 / 1.38 = ~26x
      const scale = calculateAvatarMinScale(5000, 60, 800, 36, 10);
      assert.ok(scale > 20 && scale < 30, `Expected scale ~26x, got ${scale}`);
    });

    it('should return 1.0 for invalid or non-positive camera distances', () => {
      assert.equal(calculateAvatarMinScale(0), 1.0);
      assert.equal(calculateAvatarMinScale(-100), 1.0);
      assert.equal(calculateAvatarMinScale(null), 1.0);
    });
  });

  describe('projectTrackToThreeLocal', () => {
    const testPoints = [
      { lat: 45.5000000, lon: 7.8000000, alt: 1200, timeSeconds: 0 },
      { lat: 45.5000000, lon: 7.8020000, alt: 1220, timeSeconds: 10 }, // East
      { lat: 45.5020000, lon: 7.8020000, alt: 1240, timeSeconds: 20 }  // North
    ];

    it('should project points centered at P0 with correct Three.js orientation', () => {
      const result = projectTrackToThreeLocal(testPoints);
      assert.ok(result.origin);
      assert.equal(result.origin.lat, 45.5);
      assert.equal(result.origin.lon, 7.8);
      assert.equal(result.origin.alt, 1200);

      const pts = result.points;
      assert.equal(pts.length, 3);

      // P0 should be at X=0, Z=0
      assert.equal(pts[0].x, 0);
      assert.equal(pts[0].z, 0);
      assert.equal(pts[0].y, 1200);

      // Point 1 is East: X > 0, Z ~ 0
      assert.ok(pts[1].x > 100, `Point 1 should have positive X (East), got ${pts[1].x}`);
      assert.ok(Math.abs(pts[1].z) < 1, `Point 1 should have ~0 Z, got ${pts[1].z}`);

      // Point 2 is North from Point 1: Z < 0 (South is +Z, North is -Z)
      assert.ok(pts[2].z < -100, `Point 2 should have negative Z (North), got ${pts[2].z}`);

      // Metrics computation
      assert.ok(typeof pts[0].heading === 'number');
      assert.ok(typeof pts[1].speedKmh === 'number');
      assert.ok(typeof pts[1].vario === 'number');
      assert.ok(typeof pts[1].bankAngle === 'number');
      assert.ok(typeof pts[1].pitchAngle === 'number');
    });

    it('should support relativeAltitude option', () => {
      const result = projectTrackToThreeLocal(testPoints, null, { relativeAltitude: true });
      assert.equal(result.points[0].y, 0);
      assert.equal(result.points[1].y, 20);
      assert.equal(result.points[2].y, 40);
    });

    it('should handle empty points array gracefully', () => {
      const result = projectTrackToThreeLocal([]);
      assert.deepEqual(result.points, []);
      assert.ok(result.origin);
    });
  });

  describe('calculateRibbonDimensions - Dynamic Zoom-Adaptive 3D Track Scaling', () => {
    it('should calculate slender ribbon dimensions when zoomed in close to the paraglider (zoom 18)', () => {
      const dims = calculateRibbonDimensions(18, 46.0);
      assert.ok(dims.widthMeters <= 0.5, `Expected close-up ribbon width <= 0.5m, got ${dims.widthMeters}`);
      assert.ok(dims.widthMeters >= 0.35, `Width must respect min clamp >= 0.35m, got ${dims.widthMeters}`);
      assert.ok(dims.heightMeters < dims.widthMeters, 'Height should be proportional to width');
      assert.equal(dims.halfWidth, Math.round((dims.widthMeters / 2) * 100) / 100);
      assert.equal(dims.halfHeight, Math.round((dims.heightMeters / 2) * 100) / 100);
    });

    it('should calculate slender 4px ribbon in chase replay view (zoom 14)', () => {
      const dims = calculateRibbonDimensions(14, 46.0);
      // At zoom 14, 0.52m gives exactly 4px on screen without engulfing the 13.2m canopy
      assert.equal(dims.widthMeters, 0.52, `Expected zoom 14 width 0.52m (~4px), got ${dims.widthMeters}`);
      assert.equal(dims.heightMeters, 0.31, `Expected zoom 14 height 0.31m, got ${dims.heightMeters}`);
    });

    it('should shrink dynamically when zoomed in close and expand at overview (zoom 12 vs 19)', () => {
      const closeDims = calculateRibbonDimensions(19, 46.0);
      const overviewDims = calculateRibbonDimensions(12, 46.0);

      // Close up at zoom 19 should be clamped (0.35m) compared to overview width (2.08m)
      assert.ok(closeDims.widthMeters < overviewDims.widthMeters,
        `Expected close width (${closeDims.widthMeters}m) to be less than overview width (${overviewDims.widthMeters}m)`);
      assert.equal(overviewDims.widthMeters, 2.08, `Expected overview width 2.08m, got ${overviewDims.widthMeters}`);
      assert.equal(closeDims.widthMeters, 0.35, `Expected close width clamped to 0.35m, got ${closeDims.widthMeters}`);
    });

    it('should guarantee a minimum of 4 screen pixels across typical flight zooms (12 to 18)', () => {
      for (let z = 12; z <= 18; z++) {
        const dims = calculateRibbonDimensions(z, 46.0);
        const screenPixels = dims.widthMeters / dims.metersPerPixel;
        assert.ok(screenPixels >= 3.99, `Zoom ${z} should have at least 4 screen pixels, got ${screenPixels.toFixed(2)}`);
      }
    });

    it('should respect custom options for targetPixels, clamps, and heightRatio', () => {
      const customDims = calculateRibbonDimensions(16, 46.0, {
        targetPixels: 5.0,
        minWidthMeters: 2.0,
        maxWidthMeters: 200.0,
        heightRatio: 0.5
      });

      assert.ok(customDims.widthMeters >= 2.0);
      assert.equal(customDims.heightMeters, Math.round((customDims.widthMeters * 0.5) * 100) / 100);
    });

    it('should handle missing, NaN, or extreme zoom inputs safely without crashing', () => {
      const defaultDims = calculateRibbonDimensions(undefined, null);
      assert.ok(defaultDims.widthMeters > 0);
      assert.ok(defaultDims.heightMeters > 0);

      const nanDims = calculateRibbonDimensions(NaN, NaN);
      assert.ok(nanDims.widthMeters > 0);

      const extremeClose = calculateRibbonDimensions(25, 46.0);
      assert.equal(extremeClose.widthMeters, 0.35, 'Must clamp to minWidthMeters (0.35m) at extreme close zoom');

      const extremeFar = calculateRibbonDimensions(1, 46.0);
      assert.equal(extremeFar.widthMeters, 25.0, 'Must clamp to maxWidthMeters (25m) at extreme wide zoom');
    });
  });
});
