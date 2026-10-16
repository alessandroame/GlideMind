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

