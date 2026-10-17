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
  smoothTrackKinematics,
  computeCameraGroundTargetForAltitude,
  stepCameraSpringDamper,
  computePendulumPose,
  buildSmoothTrackGeometryData,
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
      assert.equal(dims.widthMeters, 0.41, `Expected close-up ribbon width 0.41m at zoom 18, got ${dims.widthMeters}`);
      assert.equal(dims.heightMeters, 0.06, `Expected close-up ribbon height 0.06m at zoom 18, got ${dims.heightMeters}`);
      assert.ok(dims.widthMeters < 0.50, 'Close-up ribbon must be narrower than paraglider pod harness (0.50m)');
      assert.ok(dims.heightMeters < 0.10, 'Close-up ribbon height must be minimal (<= 0.10m) to clear suspension lines');
      assert.ok(dims.heightMeters < dims.widthMeters, 'Height should be proportional to width');
      assert.equal(dims.halfWidth, Math.round((dims.widthMeters / 2) * 100) / 100);
      assert.equal(dims.halfHeight, Math.round((dims.heightMeters / 2) * 100) / 100);
    });

    it('should calculate balanced transition ribbon dimensions in chase replay view (zoom 14)', () => {
      const dims = calculateRibbonDimensions(14, 46.0);
      assert.equal(dims.widthMeters, 13.09, `Expected zoom 14 width 13.09m, got ${dims.widthMeters}`);
      assert.equal(dims.heightMeters, 3.24, `Expected zoom 14 height 3.24m, got ${dims.heightMeters}`);
      assert.ok(dims.widthMeters <= 13.2, 'Zoom 14 ribbon must not exceed the paraglider wingspan (13.2m)');
      assert.ok(dims.heightMeters < 7.2, 'Zoom 14 ribbon height must not exceed suspension line height (7.2m)');
    });

    it('should adapt dynamically across zoom levels (zoom 12 vs 19)', () => {
      const closeDims = calculateRibbonDimensions(19, 46.0);
      const overviewDims = calculateRibbonDimensions(12, 46.0);

      assert.ok(closeDims.widthMeters < overviewDims.widthMeters,
        `Expected close width (${closeDims.widthMeters}m) to be less than overview width (${overviewDims.widthMeters}m)`);
      assert.equal(overviewDims.widthMeters, 66.37, `Expected overview width 66.37m, got ${overviewDims.widthMeters}`);
      assert.equal(closeDims.widthMeters, 0.21, `Expected close width 0.21m, got ${closeDims.widthMeters}`);
    });

    it('should guarantee continuous visibility across all flight zooms (10 to 19) without engulfing paraglider', () => {
      for (let z = 10; z <= 19; z++) {
        const dims = calculateRibbonDimensions(z, 46.0);
        const screenPixels = dims.widthMeters / dims.metersPerPixel;
        // Screen pixels must stay within a healthy, visible, non-cluttering range [1.95px, 5.05px]
        assert.ok(
          screenPixels >= 1.95 && screenPixels <= 5.05,
          `Zoom ${z} screen pixels must be in [1.95, 5.05] range, got ${screenPixels.toFixed(3)}px`
        );

        // At macro zooms (z <= 12), exactly ~5.0px on screen
        if (z <= 12) {
          assert.ok(
            Math.abs(screenPixels - 5.0) < 0.05,
            `Zoom ${z} macro should have ~5.0 screen pixels, got ${screenPixels.toFixed(3)}`
          );
        }

        // At micro zooms (z >= 17), exactly ~2.0px on screen and physical width <= 0.85m
        if (z >= 17) {
          assert.ok(
            Math.abs(screenPixels - 2.0) < 0.05,
            `Zoom ${z} micro should have ~2.0 screen pixels, got ${screenPixels.toFixed(3)}`
          );
          assert.ok(
            dims.widthMeters <= 0.85,
            `Zoom ${z} micro ribbon width must be <= 0.85m, got ${dims.widthMeters}m`
          );
          assert.ok(
            dims.heightMeters <= 0.10,
            `Zoom ${z} micro ribbon height must be <= 0.10m, got ${dims.heightMeters}m`
          );
        }
      }
    });

    it('should respect custom options for targetPixels, clamps, and heightRatio', () => {
      const customDims = calculateRibbonDimensions(16, 46.0, {
        targetPixels: 4.0,
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
      assert.equal(extremeClose.widthMeters, 0.20, 'Must clamp to minWidthMeters (0.20m) at extreme close zoom');

      const extremeFar = calculateRibbonDimensions(1, 46.0);
      assert.equal(extremeFar.widthMeters, 1000.0, 'Must clamp to maxWidthMeters (1000m) at extreme wide zoom');
    });
  });

  describe('smoothTrackKinematics - Gaussian Window Smoothing & Aerodynamic Pitch', () => {
    it('should smooth 1 Hz GPS quantization jitter and populate brake deflections and thermal centroids', () => {
      const spiralPoints = [];
      for (let i = 0; i <= 20; i++) {
        const angleRad = (i * 15 * Math.PI) / 180;
        spiralPoints.push({
          lat: 46.5 + (Math.cos(angleRad) * 60) / 111132,
          lon: 11.5 + (Math.sin(angleRad) * 60) / 76000,
          alt: 1800 + i * 2.5,
          timeSeconds: i
        });
      }

      const projected = projectTrackToThreeLocal(spiralPoints, null, { relativeAltitude: true });
      const midPt = projected.points[10];

      assert.ok(typeof midPt.smoothHeading === 'number');
      assert.ok(typeof midPt.smoothBankAngle === 'number');
      assert.ok(Math.abs(midPt.smoothBankAngle) > 5, 'Should detect sustained bank angle in 15 deg/s spiral');
      assert.ok(midPt.aerodynamicPitchAngle >= -9 && midPt.aerodynamicPitchAngle <= 7, 'Aerodynamic pitch must stay within realistic [-9°, +7°] envelope');
      assert.ok(midPt.brakeRight > 0 || midPt.brakeLeft > 0, 'Inner trailing-edge brake deflection must be active in turn');
      assert.ok(typeof midPt.thermalCenterLon === 'number' && typeof midPt.thermalCenterLat === 'number');
    });
  });

  describe('computeCameraGroundTargetForAltitude & stepCameraSpringDamper - 3D Camera Controller V2', () => {
    it('should project high-altitude glider coordinates forward onto ground plane so glider stays centered', () => {
      // Glider at 2300m MSL over 1500m MSL valley floor (+800m AGL), flying North (bearing 0) at 60° camera pitch
      const target = computeCameraGroundTargetForAltitude({
        lon: 11.5000,
        lat: 46.5000,
        altMsl: 2300,
        groundAltMsl: 1500,
        bearingDeg: 0,
        pitchDeg: 60,
        lookAheadMeters: 35
      });

      // Camera ground focus must be shifted North (lat > 46.5000) to intersect camera ray through glider
      assert.ok(target.centerLat > 46.502, `Expected projected ground center North of glider (> 46.502), got ${target.centerLat}`);
      assert.ok(Math.abs(target.centerLon - 11.5000) < 1e-5);
    });

    it('should apply exponential spring-damper, thermal horizon stabilization, and user touch orbit offsets', () => {
      const pt = {
        lon: 11.5000,
        lat: 46.5000,
        alt: 2100,
        heading: 90,
        smoothHeading: 90,
        smoothTurnRateDegSec: 16, // Active thermal turn (> 7.5 deg/s)
        smoothBankAngle: 28,
        vario: 2.8,
        smoothVario: 2.8,
        thermalCenterLon: 11.5008,
        thermalCenterLat: 46.5004
      };

      const state0 = stepCameraSpringDamper(null, pt, 0.05, {
        mode: 'chase',
        userBearingOffsetDeg: 25,
        userPitchOffsetDeg: -5,
        userZoomOffset: 0.4,
        groundAltMsl: 1500
      });

      assert.ok(state0.isThermalling, 'Should detect active thermal spiral when |turnRate| >= 7.5 deg/s');
      // With +25 deg user orbit offset on 90 deg heading, initial bearing should be 115 deg
      assert.equal(Math.round(state0.bearing), 115);

      // Step forward with a 40 deg heading change in 0.1s: thermal horizon stabilization (tau=6.5s) prevents abrupt spin
      const ptNext = { ...pt, smoothHeading: 130, heading: 130 };
      const state1 = stepCameraSpringDamper(state0, ptNext, 0.1, {
        mode: 'chase',
        userBearingOffsetDeg: 25,
        groundAltMsl: 1500
      });
      const bearingDelta = Math.abs(state1.bearing - state0.bearing);
      assert.ok(bearingDelta < 2.0, `Expected gentle horizon rotation (< 2.0 deg in 0.1s) during thermal, got ${bearingDelta}`);
    });

    it('should apply look-into-turn yaw offset in cockpit POV mode', () => {
      const pt = {
        lon: 11.5,
        lat: 46.5,
        alt: 1800,
        smoothHeading: 180,
        smoothTurnRateDegSec: 15,
        smoothBankAngle: 25
      };
      const cockpitState = stepCameraSpringDamper(null, pt, 1.0, { mode: 'cockpit', groundAltMsl: 1500 });
      assert.ok(cockpitState.bearing > 188 && cockpitState.bearing <= 200, `Expected look-into-turn bearing > 188°, got ${cockpitState.bearing}`);
      assert.ok(cockpitState.zoom >= 17.0);
    });

    it('should compute compensatedZoom when glider is high above terrain so camera eye stays behind the glider and centered on takeoff', () => {
      // 1. At takeoff (alt = groundAltMsl = 1060m) in chase mode: zero forward offset and compensatedZoom === zoom
      const takeoffPt = { lon: 9.302, lat: 45.833, alt: 1060, smoothHeading: 180 };
      const takeoffState = stepCameraSpringDamper(null, takeoffPt, 2.0, { mode: 'chase', groundAltMsl: 1060 });
      assert.ok(Math.abs(takeoffState.centerLon - 9.302) < 1e-6);
      assert.ok(Math.abs(takeoffState.centerLat - 45.833) < 1e-6);
      assert.equal(takeoffState.compensatedZoom, takeoffState.zoom);

      // 2. High above valley (alt = 1260m, valley groundAltMsl = 360m -> +900m AGL) in chase and cockpit modes:
      // compensatedZoom must be smaller than zoom so the longer ray from glider down to valley floor preserves constant camera-to-glider distance
      const valleyPt = { lon: 9.302, lat: 45.833, alt: 1260, smoothHeading: 180 };
      const valleyChase = stepCameraSpringDamper(null, valleyPt, 2.0, { mode: 'chase', groundAltMsl: 360 });
      assert.ok(valleyChase.compensatedZoom < valleyChase.zoom - 1.2,
        `Expected compensatedZoom (${valleyChase.compensatedZoom}) < zoom (${valleyChase.zoom}) by > 1.2 levels over 900m valley`);
      assert.ok(valleyChase.chaseDistanceMeters > 500 && valleyChase.chaseDistanceMeters < 2000);

      const valleyCockpit = stepCameraSpringDamper(null, valleyPt, 2.0, { mode: 'cockpit', groundAltMsl: 360 });
      assert.ok(valleyCockpit.compensatedZoom < valleyCockpit.zoom - 2.5,
        `Expected cockpit compensatedZoom (${valleyCockpit.compensatedZoom}) < zoom (${valleyCockpit.zoom}) over 900m valley`);
    });

    it('should lock focusLat/Lon/Alt 100% to the paraglider and align the 3D optical ray from eye through glider to ground', () => {
      const pt = {
        lon: 11.5012,
        lat: 46.5008,
        alt: 2150,
        heading: 125,
        smoothHeading: 125,
        smoothTurnRateDegSec: 18,
        vario: 3.1,
        smoothVario: 3.1,
        thermalCenterLon: 11.5000,
        thermalCenterLat: 46.5000,
        directionalPersistence: 0.15
      };

      const state = stepCameraSpringDamper(null, pt, 0.05, {
        mode: 'chase',
        elevationOffset: 15,
        groundAltMsl: 1400,
        valleyBearingDeg: 180
      });

      // 1. Focus coordinates must match instantaneous glider 3D position with zero lag or centroid blending
      assert.equal(state.focusLon, pt.lon);
      assert.equal(state.focusLat, pt.lat);
      assert.equal(state.focusAlt, pt.alt + 15);

      // 2. Independent geometric verification: vector from eye to focus must match state.bearing and state.pitch
      const metersPerDegLat = (Math.PI / 180) * 6378137.0;
      const metersPerDegLon = metersPerDegLat * Math.cos((pt.lat * Math.PI) / 180);
      const dxEast = (state.focusLon - state.eyeLon) * metersPerDegLon;
      const dyNorth = (state.focusLat - state.eyeLat) * metersPerDegLat;
      const dzDown = state.eyeAlt - state.focusAlt;
      const horizDist = Math.hypot(dxEast, dyNorth);
      const rayBearing = ((Math.atan2(dxEast, dyNorth) * 180) / Math.PI + 360) % 360;
      const rayPitch = (Math.atan2(horizDist, dzDown) * 180) / Math.PI;

      assert.ok(Math.abs(rayBearing - state.bearing) < 1e-2, `Expected ray bearing ${rayBearing} to match state.bearing ${state.bearing}`);
      assert.ok(Math.abs(rayPitch - state.pitch) < 1e-2, `Expected ray pitch ${rayPitch} to match state.pitch ${state.pitch}`);
    });

    it('should suppress >95% of horizontal camera eye translation during 360° thermal turns without zoom jumps', () => {
      const centerLat = 46.5000;
      const centerLon = 11.5000;
      const radiusMeters = 55; // 110m thermal diameter
      const turnRateDegSec = 18; // Full 360° every 20s
      const metersPerDegLat = 111132.92;
      const metersPerDegLon = 111412.84 * Math.cos((centerLat * Math.PI) / 180);

      // Build a 60-second thermal climb (3 full turns)
      const rawPoints = [];
      for (let t = 0; t <= 60; t++) {
        const angleRad = ((t * turnRateDegSec) * Math.PI) / 180;
        rawPoints.push({
          lat: centerLat + (Math.cos(angleRad) * radiusMeters) / metersPerDegLat,
          lon: centerLon + (Math.sin(angleRad) * radiusMeters) / metersPerDegLon,
          alt: 1800 + t * 2.2,
          timeSeconds: t
        });
      }

      const projected = projectTrackToThreeLocal(rawPoints);
      const pts = projected.points;

      let camState = null;
      const eyePositionsEast = [];
      const eyePositionsNorth = [];

      // Step through the core of the thermal (t = 15s to t = 45s) at 10 Hz
      for (let step = 150; step <= 450; step++) {
        const tSec = step * 0.1;
        const idx = Math.min(pts.length - 2, Math.floor(tSec));
        const frac = tSec - idx;
        const sample = interpolateTrackSample(pts[idx], pts[idx + 1], frac);
        camState = stepCameraSpringDamper(camState, sample, 0.1, {
          mode: 'chase',
          groundAltMsl: 1200,
          valleyBearingDeg: 180
        });

        // Focus must remain 100% locked to the orbiting glider at every sub-step
        assert.equal(camState.focusLat, sample.lat);
        assert.equal(camState.focusLon, sample.lon);
        // No thermal zoom jump: base zoom remains 15.2
        assert.equal(camState.zoom, 15.2);

        if (step >= 200) {
          eyePositionsEast.push((camState.eyeLon - centerLon) * metersPerDegLon);
          eyePositionsNorth.push((camState.eyeLat - centerLat) * metersPerDegLat);
        }
      }

      const eastSpan = Math.max(...eyePositionsEast) - Math.min(...eyePositionsEast);
      const northSpan = Math.max(...eyePositionsNorth) - Math.min(...eyePositionsNorth);
      const maxEyeHorizontalSpan = Math.hypot(eastSpan, northSpan);
      const gliderHorizontalDiameter = radiusMeters * 2; // 110m

      // Camera eye horizontal excursion must be suppressed by >95% compared to the 110m glider orbit diameter (< 5.5m)
      assert.ok(
        maxEyeHorizontalSpan < gliderHorizontalDiameter * 0.05,
        `Expected camera eye horizontal span (${maxEyeHorizontalSpan.toFixed(2)}m) < 5% of glider orbit diameter (${(gliderHorizontalDiameter * 0.05).toFixed(2)}m)`
      );
    });

    it('should track a paraglider at maximum glide speed (65 km/h) within the 12m elastic leash across playback speeds', () => {
      const startLat = 46.5000;
      const startLon = 11.5000;
      const speedMs = 65 / 3.6; // 18.0556 m/s (65 km/h)
      const metersPerDegLon = 111412.84 * Math.cos((startLat * Math.PI) / 180);

      for (const playbackSpeed of [1, 4, 8]) {
        let state = null;
        for (let step = 0; step <= 100; step++) {
          const dtWall = 0.05;
          const simTime = step * dtWall * playbackSpeed;
          const distEast = simTime * speedMs;
          const pt = {
            lat: startLat,
            lon: startLon + distEast / metersPerDegLon,
            alt: 2000 - simTime * 1.8,
            heading: 90,
            smoothHeading: 90,
            guideHeading: 90,
            smoothTurnRateDegSec: 0,
            vario: -1.8,
            smoothVario: -1.8,
            directionalPersistence: 1.0
          };

          state = stepCameraSpringDamper(state, pt, dtWall, {
            mode: 'chase',
            playbackSpeed,
            groundAltMsl: 1000
          });

          // Look-at focus has zero lag at 65 km/h
          assert.equal(state.focusLon, pt.lon);
          assert.equal(state.focusLat, pt.lat);

          // Spatial anchor lag must never exceed the 12m elastic leash
          const anchorLagMeters = Math.abs(pt.lon - state.anchorLon) * metersPerDegLon;
          assert.ok(
            anchorLagMeters <= 12.01,
            `Anchor lag (${anchorLagMeters.toFixed(2)}m) exceeded 12m leash at 65 km/h (playbackSpeed=${playbackSpeed}x)`
          );
        }
      }
    });

    it('should bias the chase camera eye toward the valley side and recover if initialized on the mountain side', () => {
      // Glider ridge-soaring East (heading 90°) along an East-West ridge with valley to the South (valleyBearingDeg = 180°)
      const ridgePt = {
        lat: 46.5000,
        lon: 11.5000,
        alt: 1950,
        heading: 90,
        smoothHeading: 90,
        guideHeading: 90,
        smoothTurnRateDegSec: 0,
        vario: 0.5,
        smoothVario: 0.5,
        directionalPersistence: 0.98,
        valleyBearingDeg: 180
      };

      // 1. Initial snap in chase mode must place camera eye on the South (valley) side of the glider (eyeLat < focusLat)
      const initialChase = stepCameraSpringDamper(null, ridgePt, 1.0, {
        mode: 'chase',
        groundAltMsl: 1200,
        valleyBearingDeg: 180
      });
      assert.ok(
        initialChase.eyeLat < initialChase.focusLat,
        `Expected camera eye (${initialChase.eyeLat}) to be South (valley side) of glider (${initialChase.focusLat})`
      );

      // 2. If camera was previously oriented looking South (autoRigBearing = 160°, so camera eye is North on the mountain side),
      // stepping forward must smoothly swing the camera eye back to the South (valley) side
      let state = {
        ...initialChase,
        autoRigBearing: 160,
        bearing: 160
      };
      for (let i = 0; i < 60; i++) {
        state = stepCameraSpringDamper(state, ridgePt, 0.1, {
          mode: 'chase',
          groundAltMsl: 1200,
          valleyBearingDeg: 180
        });
      }
      assert.ok(
        state.eyeLat < state.focusLat,
        `Expected camera eye (${state.eyeLat}) to recover to the South (valley side) of glider (${state.focusLat})`
      );
    });

    it('should smoothly center anchor when transitioning continuously from a straight glide into a 360° thermal without arm rotation drift', () => {
      const centerLat = 46.5000;
      const centerLon = 11.5000;
      const radiusMeters = 55;
      const turnRateDegSec = 18;
      const speedMs = (turnRateDegSec * Math.PI / 180) * radiusMeters;
      const metersPerDegLat = 111132.92;
      const metersPerDegLon = 111412.84 * Math.cos((centerLat * Math.PI) / 180);

      // t = 0..20s: straight Eastward glide along the northern tangent of the circle (lat = centerLat + R)
      // t = 20..80s: 360° right-hand thermal orbit around (centerLat, centerLon)
      const rawPoints = [];
      for (let t = 0; t <= 80; t++) {
        if (t <= 20) {
          const distEast = (t - 20) * speedMs;
          rawPoints.push({
            lat: centerLat + radiusMeters / metersPerDegLat,
            lon: centerLon + distEast / metersPerDegLon,
            alt: 1850 - t * 1.1,
            timeSeconds: t
          });
        } else {
          const dtTherm = t - 20;
          const angleRad = ((dtTherm * turnRateDegSec) * Math.PI) / 180;
          rawPoints.push({
            lat: centerLat + (Math.cos(angleRad) * radiusMeters) / metersPerDegLat,
            lon: centerLon + (Math.sin(angleRad) * radiusMeters) / metersPerDegLon,
            alt: (1850 - 20 * 1.1) + dtTherm * 2.4,
            timeSeconds: t
          });
        }
      }

      const projected = projectTrackToThreeLocal(rawPoints);
      const pts = projected.points;

      let camState = null;
      const steadyEyeEast = [];
      const steadyEyeNorth = [];

      // Step continuously from t = 0s through t = 65s at 10 Hz without resetting camState
      for (let step = 0; step <= 650; step++) {
        const tSec = step * 0.1;
        const idx = Math.min(pts.length - 2, Math.floor(tSec));
        const frac = tSec - idx;
        const sample = interpolateTrackSample(pts[idx], pts[idx + 1], frac);
        camState = stepCameraSpringDamper(camState, sample, 0.1, {
          mode: 'chase',
          groundAltMsl: 1200,
          valleyBearingDeg: 180,
          valleyBias: 0.65
        });

        assert.equal(camState.focusLat, sample.lat);
        assert.equal(camState.focusLon, sample.lon);

        if (step >= 380 && step <= 600) {
          steadyEyeEast.push((camState.eyeLon - centerLon) * metersPerDegLon);
          steadyEyeNorth.push((camState.eyeLat - centerLat) * metersPerDegLat);
        }
      }

      const eastSpan = Math.max(...steadyEyeEast) - Math.min(...steadyEyeEast);
      const northSpan = Math.max(...steadyEyeNorth) - Math.min(...steadyEyeNorth);
      const steadyEyeSpan = Math.hypot(eastSpan, northSpan);

      assert.ok(
        steadyEyeSpan < (radiusMeters * 2) * 0.05,
        `Expected steady-state eye span after glide-to-thermal entry (${steadyEyeSpan.toFixed(2)}m) < 5.5m`
      );
    });

    it('should distinguish alternating ridge S-turns from 360° thermals while applying immediate user yaw and smoothing DEM valley bearing jitter', () => {
      const baseLat = 46.5000;
      const baseLon = 11.5000;
      const metersPerDegLat = 111132.92;
      const metersPerDegLon = 111412.84 * Math.cos((baseLat * Math.PI) / 180);

      // Build a 40s ridge-soaring track heading generally East (90°) with alternating +/-25° S-turns every 10s
      const rawPoints = [];
      let curNorthM = 0;
      let curEastM = 0;
      const speedMs = 11.0;
      for (let t = 0; t <= 40; t++) {
        const headingDeg = 90 + 25 * Math.sin((2 * Math.PI * t) / 12);
        const hRad = (headingDeg * Math.PI) / 180;
        if (t > 0) {
          curEastM += Math.sin(hRad) * speedMs;
          curNorthM += Math.cos(hRad) * speedMs;
        }
        rawPoints.push({
          lat: baseLat + curNorthM / metersPerDegLat,
          lon: baseLon + curEastM / metersPerDegLon,
          alt: 1900 + Math.sin(t * 0.4) * 3,
          timeSeconds: t
        });
      }

      const projected = projectTrackToThreeLocal(rawPoints);
      const pts = projected.points;

      // Mid-track S-turns must NOT be classified as a 360° thermal orbit
      assert.equal(pts[20].isThermalOrbit, false, 'Alternating S-turns along a ridge must not trigger isThermalOrbit');

      let camState = stepCameraSpringDamper(null, pts[15], 1.0, {
        mode: 'chase',
        groundAltMsl: 1200,
        valleyBearingDeg: 180,
        userBearingOffsetDeg: 0
      });

      // Step with a sudden +40° noisy DEM valleyBearingDeg perturbation and a simultaneous +30° userBearingOffsetDeg drag
      const nextState = stepCameraSpringDamper(camState, pts[16], 0.05, {
        mode: 'chase',
        groundAltMsl: 1200,
        valleyBearingDeg: 220,
        userBearingOffsetDeg: 30
      });

      // 1. Valley bearing must be exponentially smoothed (< 2 deg change in 0.05s despite 40 deg DEM jump)
      assert.ok(
        Math.abs(nextState.valleyBearingDeg - 180) < 2.0,
        `Expected smoothed valleyBearingDeg near 180°, got ${nextState.valleyBearingDeg}`
      );
      // 2. Manual userBearingOffsetDeg (+30°) must be applied immediately to rigBearing
      const rigDelta = ((nextState.rigBearing - camState.rigBearing + 540) % 360) - 180;
      assert.ok(
        rigDelta > 28 && rigDelta < 32,
        `Expected immediate +30° manual user yaw response on rigBearing, got ${rigDelta.toFixed(2)}°`
      );
    });

    it('should prevent vertical Catmull-Rom overshoot on non-uniform LTTB time intervals and support negative altitudeDeltaMeters & lockAnchorToFocus', () => {
      // 1. Non-uniform time intervals: rapid climb in [0, 2s], flat glide in [2s, 32s], rapid sink in [32s, 34s]
      const p0 = { lat: 46.500, lon: 11.500, alt: 1400, y: 0, timeSeconds: 0 };
      const p1 = { lat: 46.502, lon: 11.502, alt: 1520, y: 120, timeSeconds: 2 };
      const p2 = { lat: 46.512, lon: 11.512, alt: 1522, y: 122, timeSeconds: 32 };
      const p3 = { lat: 46.514, lon: 11.514, alt: 1380, y: -20, timeSeconds: 34 };

      for (const frac of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        const sample = interpolateTrackSample(p1, p2, frac, p0, p3);
        assert.ok(
          sample.alt >= 1520 && sample.alt <= 1522,
          `Interpolated alt (${sample.alt}) must not overshoot [1520, 1522] at frac=${frac}`
        );
        assert.ok(
          sample.y >= 120 && sample.y <= 122,
          `Interpolated y (${sample.y}) must not overshoot [120, 122] at frac=${frac}`
        );
      }

      // 2. Negative altitudeDeltaMeters when look-ahead mountain slope is higher than glider
      const uphillTarget = computeCameraGroundTargetForAltitude({
        lat: 46.5000,
        lon: 11.5000,
        altMsl: 1600,
        referenceElevationMsl: 1750,
        pitchDeg: 60,
        bearingDeg: 0,
        zoom: 15.0
      });
      assert.equal(uphillTarget.altitudeDeltaMeters, -150);
      assert.equal(uphillTarget.referenceElevationMsl, 1750);
      assert.ok(uphillTarget.forwardOffsetMeters < 0, 'Forward offset must shift backward when reference plane is above glider');

      // 3. lockAnchorToFocus locks spatial anchor 100% to focus even inside a steep thermal turn
      const thermalPt = {
        lat: 46.5015,
        lon: 11.5025,
        alt: 1920,
        heading: 210,
        smoothHeading: 210,
        smoothTurnRateDegSec: 19,
        isThermalOrbit: true,
        thermalCenterLat: 46.5000,
        thermalCenterLon: 11.5000
      };
      const pausedState = stepCameraSpringDamper(null, thermalPt, 2.5, {
        mode: 'chase',
        lockAnchorToFocus: true,
        groundAltMsl: 1400
      });
      assert.equal(pausedState.anchorLat, pausedState.focusLat);
      assert.equal(pausedState.anchorLon, pausedState.focusLon);
      assert.equal(pausedState.anchorAlt, pausedState.focusAlt);
    });
  });

  describe('computePendulumPose & buildSmoothTrackGeometryData', () => {
    it('should displace canopy inward and pilot pod outward during banked turns', () => {
      const rightTurn = computePendulumPose(30, 5);
      assert.ok(rightTurn.canopyOffsetX < -1.0, 'Canopy must shift laterally inward (-X) on right bank');
      assert.ok(rightTurn.pilotOffsetX > 0.5, 'Pilot pod must swing centrifugally outward (+X) on right bank');
      assert.ok(rightTurn.brakeRight > 0.4 && rightTurn.brakeLeft === 0, 'Right inner trailing edge must deflect on right turn');
    });

    it('should subdivide curved segments via Catmull-Rom and compute unit miter normals without pinching', () => {
      const rawPts = [
        { x: 0, y: 100, z: 0, timeSeconds: 0, vario: 1.0, heading: 0 },
        { x: 30, y: 115, z: -40, timeSeconds: 5, vario: 2.5, heading: 45 },
        { x: 80, y: 135, z: -40, timeSeconds: 10, vario: 3.0, heading: 90 },
        { x: 110, y: 150, z: 0, timeSeconds: 15, vario: 2.0, heading: 135 }
      ];
      const { points, normals } = buildSmoothTrackGeometryData(rawPts, { maxSubdivisionsPerSegment: 4 });
      assert.ok(points.length > rawPts.length, 'Curved track should be subdivided into smoother spline points');
      assert.equal(normals.length, points.length * 2);
      for (let i = 0; i < points.length; i++) {
        const nx = normals[i * 2];
        const nz = normals[i * 2 + 1];
        const len = Math.hypot(nx, nz);
        assert.ok(Math.abs(len - 1.0) < 1e-3, `Normal at ${i} must be unit length, got ${len}`);
      }
    });
  });
});

