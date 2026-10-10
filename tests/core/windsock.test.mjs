/**
 * GlideMind - Tests for Windsock Kinematics & Vector Engine (Headless Core)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAngle,
  getWindsockElevationStage,
  calculateWindsockKinematics,
  generateWindsockKeyframeCss,
  generateWindsockSvg
} from '../../core/windsock.js';

describe('GlideMind Headless Core - Windsock Kinematics & Vector Engine', () => {

  describe('normalizeAngle()', () => {
    it('should keep angles in [0, 360) range', () => {
      assert.equal(normalizeAngle(0), 0);
      assert.equal(normalizeAngle(180), 180);
      assert.equal(normalizeAngle(360), 0);
      assert.equal(normalizeAngle(450), 90);
      assert.equal(normalizeAngle(-90), 270);
      assert.equal(normalizeAngle(-360), 0);
    });

    it('should handle null, undefined, and non-numeric values safely', () => {
      assert.equal(normalizeAngle(null), 0);
      assert.equal(normalizeAngle(undefined), 0);
      assert.equal(normalizeAngle(NaN), 0);
    });
  });

  describe('getWindsockElevationStage()', () => {
    it('should correctly classify wind speeds according to EN-A envelope', () => {
      assert.equal(getWindsockElevationStage(0), 0, '0 km/h is Calm');
      assert.equal(getWindsockElevationStage(4.9), 0, '4.9 km/h is Calm');
      assert.equal(getWindsockElevationStage(5), 1, '5 km/h is Light');
      assert.equal(getWindsockElevationStage(11.9), 1, '11.9 km/h is Light');
      assert.equal(getWindsockElevationStage(12), 2, '12 km/h is Ideal EN-A');
      assert.equal(getWindsockElevationStage(18), 2, '18 km/h is Ideal EN-A upper limit');
      assert.equal(getWindsockElevationStage(18.1), 3, '18.1 km/h is Caution');
      assert.equal(getWindsockElevationStage(25), 3, '25 km/h is Caution');
      assert.equal(getWindsockElevationStage(25.1), 4, '25.1 km/h is Danger / Blown out');
      assert.equal(getWindsockElevationStage(45), 4, '45 km/h is Danger');
    });
  });

  describe('calculateWindsockKinematics()', () => {
    it('should calculate calm state when speed and gust are near zero', () => {
      const k = calculateWindsockKinematics(0, 0, 90, 0);

      assert.equal(k.speed, 0);
      assert.equal(k.isCalm, true);
      assert.equal(k.elevationStage, 0);
      assert.equal(k.rotation, 270, 'Wind from 90° (East) points towards 270° (West)');
      assert.equal(k.hasGustAnim, false);

      // Verify segments have zero amplitude when calm
      for (const seg of k.segments) {
        assert.equal(seg.amp, 0, `Segment ${seg.index} must have 0 amplitude when calm`);
      }
    });

    it('should orient downwind (+180 degrees modulo 360)', () => {
      assert.equal(calculateWindsockKinematics(15, 20, 0).rotation, 180, 'North wind (0°) blows towards South (180°)');
      assert.equal(calculateWindsockKinematics(15, 20, 180).rotation, 0, 'South wind (180°) blows towards North (0°)');
      assert.equal(calculateWindsockKinematics(15, 20, 270).rotation, 90, 'West wind (270°) blows towards East (90°)');
      assert.equal(calculateWindsockKinematics(15, 20, 315).rotation, 135, 'NW wind (315°) blows towards SE (135°)');
    });

    it('should compute 12 articulated segments with alternating aeronautical colors', () => {
      const k = calculateWindsockKinematics(14, 18, 200, 0.2);

      assert.equal(k.segments.length, 12, 'Must produce exactly 12 segments');
      assert.equal(k.elevationStage, 2, '14 km/h is Ideal EN-A');

      // Check alternating stripes: Segments 1..3 Red, 4..6 White, 7..9 Red, 10..12 White
      const expectedFills = [
        '#ef4444', '#ef4444', '#ef4444',
        '#ffffff', '#ffffff', '#ffffff',
        '#ef4444', '#ef4444', '#ef4444',
        '#ffffff', '#ffffff', '#ffffff'
      ];

      for (let i = 0; i < 12; i++) {
        assert.equal(k.segments[i].fill, expectedFills[i], `Segment ${i + 1} fill color mismatch`);
      }

      // Check width tapering: throat (24px) down to tail (12px)
      assert.equal(k.segments[0].wTop, 24, 'Throat mouth top width must be 24px');
      assert.equal(k.segments[11].wBot, 12, 'Tail bottom width must be 12px');

      // Check cumulative whip delay
      for (let i = 1; i < 12; i++) {
        assert.ok(k.segments[i].delay > k.segments[i - 1].delay, 'Whip wave delay must increase monotonically towards tail');
        assert.ok(k.segments[i].amp >= k.segments[i - 1].amp, 'Oscillation amplitude must amplify towards tail');
      }
    });

    it('should scale gust extension and increase frequency with turbulence', () => {
      const calmTurb = calculateWindsockKinematics(15, 30, 90, 0.0);
      const highTurb = calculateWindsockKinematics(15, 30, 90, 0.8);

      assert.equal(calmTurb.hasGustAnim, true, 'Gust delta > 1.5 must enable gust animation');
      assert.ok(calmTurb.stretchScale > 1.0, 'Gust must stretch the windsock');
      assert.ok(highTurb.flutterDuration < calmTurb.flutterDuration, 'Higher turbulence must produce shorter flutter duration (faster oscillation)');
    });

    it('should clamp extreme gusts safely to prevent graphical explosion', () => {
      const extreme = calculateWindsockKinematics(35, 90, 180, 1.0);
      assert.ok(extreme.nominalLength <= 88, 'Nominal length must clamp at 88px');
      assert.ok(extreme.gustLength <= 95, 'Gust length must clamp at 95px');
      assert.ok(extreme.stretchScale <= 2.2, 'Stretch scale must clamp at 2.2');
      assert.ok(extreme.flutterDuration >= 0.35, 'Flutter duration must have physical floor at 0.35s');
    });
  });

  describe('generateWindsockKeyframeCss()', () => {
    it('should generate valid CSS rules for all 12 segments and gust container', () => {
      const k = calculateWindsockKinematics(16, 22, 180, 0.3);
      const css = generateWindsockKeyframeCss(k, 'test-ws-');

      assert.ok(css.includes('@keyframes testwsSnake1'), 'Must include keyframes for segment 1');
      assert.ok(css.includes('@keyframes testwsSnake12'), 'Must include keyframes for segment 12');
      assert.ok(css.includes('.test-ws-seg-1'), 'Must include rule for segment 1');
      assert.ok(css.includes('.test-ws-seg-12'), 'Must include rule for segment 12');
      assert.ok(css.includes('@keyframes testwsGustPulse'), 'Must include gust pulse keyframe when gust present');
      assert.ok(css.includes('.test-ws-gust-container'), 'Must include gust container rule');
    });
  });

  describe('generateWindsockSvg()', () => {
    it('should generate clean SVG markup containing 12 nested groups and mounting lines', () => {
      const svg = generateWindsockSvg(14, 18, 90, 0.1, { prefix: 'test-ws-', scale: 0.5 });

      assert.ok(svg.includes('<svg'), 'Must contain <svg root');
      assert.ok(svg.includes('viewBox="0 0 240 240"'), 'Must have 240x240 viewBox');
      assert.ok(svg.includes('id="test-ws-style"'), 'Must include scoped style tag');
      assert.ok(svg.includes('id="test-ws-wrapper"'), 'Must include wrapper with rotation');
      assert.ok(svg.includes('transform: rotate(270deg)'), '90° wind must rotate wrapper to 270°');
      assert.ok(svg.includes('id="test-ws-group-1"'), 'Must have group 1');
      assert.ok(svg.includes('id="test-ws-group-12"'), 'Must have group 12');
      assert.ok(svg.includes('<ellipse cx="120" cy="96" rx="12" ry="4"'), 'Must have mouth ring');
      assert.ok(svg.includes('role="img"'), 'Must be accessible with role="img"');
      assert.ok(svg.includes('aria-label="Manica a vento vettoriale"'), 'Must have Italian accessibility label');
    });

    it('should support generating pure SVG without outer div wrapper', () => {
      const pureSvg = generateWindsockSvg(12, 15, 0, 0, { includeWrapper: false });
      assert.ok(!pureSvg.includes('<div class="gm-windsock-scaler"'), 'Must not include scaler wrapper');
      assert.ok(pureSvg.startsWith('<style id="gm-ws-style">'), 'Must start directly with style and SVG');
    });
  });
});
