import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectTrimPoints,
  applyTrackTrim,
  recalculateFlightAfterTrim,
  restoreUntrimmedFlight,
  autoTrimFlight,
  applyElevationCorrection,
  restoreOriginalElevations
} from '../../core/flightTrimming.js';
import {
  extractFlightEvents,
  analyzeFlightTelemetry,
  FLIGHT_PHASE_COLORS
} from '../../core/flightTelemetry.js';
import { logbookManager, createMemoryDbAdapter } from '../../core/logbookDb.js';

describe('Flight Track Trimming & Milestone Events Engine', () => {

  function createSyntheticFlightPoints() {
    const points = [];
    const baseLat = 45.45;
    const baseLon = 7.85;
    const baseTime = 1718000000;

    // 0 to 9: ground preparation (immobile, 0-2 km/h)
    for (let i = 0; i < 10; i++) {
      points.push({
        lat: baseLat + i * 0.000005,
        lon: baseLon + i * 0.000005,
        alt: 1200,
        timeSeconds: baseTime + i,
        speedKmh: 1.5,
        timeFormatted: '12:00:00'
      });
    }

    // 10 to 49: flying (takeoff run -> climb -> cruise, 30-45 km/h)
    for (let i = 10; i < 50; i++) {
      const frac = (i - 10) / 40;
      points.push({
        lat: baseLat + 0.0001 + frac * 0.02,
        lon: baseLon + 0.0001 + frac * 0.02,
        alt: 1200 + Math.sin(frac * Math.PI) * 400,
        timeSeconds: baseTime + i,
        speedKmh: 36,
        timeFormatted: '12:00:30'
      });
    }

    // 50 to 59: ground post-landing (packing wing, 0-2 km/h)
    for (let i = 50; i < 60; i++) {
      points.push({
        lat: baseLat + 0.021 + (i - 50) * 0.000005,
        lon: baseLon + 0.021 + (i - 50) * 0.000005,
        alt: 800,
        timeSeconds: baseTime + i,
        speedKmh: 1.2,
        timeFormatted: '12:01:00'
      });
    }

    return points;
  }

  it('detectTrimPoints should detect launch takeoff and landing field shutdown', () => {
    const points = createSyntheticFlightPoints();
    const result = detectTrimPoints(points);

    assert.equal(result.canTrim, true);
    assert.ok(result.takeoffIndex >= 5 && result.takeoffIndex <= 12, `Takeoff index was ${result.takeoffIndex}`);
    assert.ok(result.landingIndex >= 48 && result.landingIndex <= 55, `Landing index was ${result.landingIndex}`);
    assert.equal(result.originalCount, 60);
    assert.ok(result.trimmedCount < result.originalCount);
  });

  it('applyTrackTrim should slice track points non-destructively within bounds', () => {
    const points = createSyntheticFlightPoints();
    const trimmed = applyTrackTrim(points, 10, 49);

    assert.equal(trimmed.length, 40);
    assert.equal(trimmed[0], points[10]);
    assert.equal(trimmed[trimmed.length - 1], points[49]);
  });

  it('recalculateFlightAfterTrim should recalculate flight metrics and preserve originalPoints', () => {
    const points = createSyntheticFlightPoints();
    const bundle = {
      meta: {
        id: 'test-trim-flight',
        durationSeconds: 60,
        distanceKm: 4.5,
        takeoffAltMsl: 1200,
        landingAltMsl: 800
      },
      raw: {
        id: 'test-trim-flight',
        decimatedPoints: points,
        originalPoints: points
      }
    };

    const trimmed = recalculateFlightAfterTrim(bundle, 10, 49);

    assert.equal(trimmed.meta.isTrimmed, true);
    assert.equal(trimmed.meta.trimIndices.takeoffIndex, 10);
    assert.equal(trimmed.meta.trimIndices.landingIndex, 49);
    assert.equal(trimmed.meta.trimIndices.trimmedCount, 40);
    assert.equal(trimmed.meta.trimIndices.originalCount, 60);
    assert.ok(trimmed.raw.originalPoints.length === 60);
    assert.ok(trimmed.raw.decimatedPoints.length === 40);
    assert.ok(trimmed.raw.telemetry);
    assert.ok(Array.isArray(trimmed.raw.telemetry.events));
  });

  it('restoreUntrimmedFlight should revert flight track to original dimensions', () => {
    const points = createSyntheticFlightPoints();
    const bundle = {
      meta: { id: 'test-revert-flight' },
      raw: {
        id: 'test-revert-flight',
        decimatedPoints: points.slice(10, 50),
        originalPoints: points
      }
    };

    const restored = restoreUntrimmedFlight(bundle);

    assert.equal(restored.meta.isTrimmed, false);
    assert.equal(restored.trimmedPoints.length, 60);
    assert.equal(restored.raw.decimatedPoints.length, 60);
  });

  it('extractFlightEvents should produce ordered milestone events with labels and colors', () => {
    const points = createSyntheticFlightPoints();
    const telemetry = analyzeFlightTelemetry(points);
    const events = extractFlightEvents({ points, telemetry });

    assert.ok(Array.isArray(events));
    assert.ok(events.length >= 2, 'Must include at least takeoff and landing');

    const types = events.map(e => e.type);
    assert.ok(types.includes('takeoff'), 'Must have takeoff event');
    assert.ok(types.includes('landing'), 'Must have landing event');

    const takeoffEv = events.find(e => e.type === 'takeoff');
    assert.equal(takeoffEv.progress, 0.0);
    assert.equal(takeoffEv.color, FLIGHT_PHASE_COLORS.takeoff);

    const landingEv = events.find(e => e.type === 'landing');
    assert.equal(landingEv.progress, 1.0);
    assert.equal(landingEv.color, FLIGHT_PHASE_COLORS.landing);

    // Ensure strictly ascending chronological order
    for (let i = 1; i < events.length; i++) {
      assert.ok(events[i].progress >= events[i - 1].progress);
    }

    // Verify novice pilot friendly short labels (no cryptic acronyms D#, T#, Max Q)
    assert.ok(
      !events.some(e => e.shortLabel === 'Max Q' || e.shortLabel.startsWith('D#') || e.shortLabel.startsWith('T#')),
      'Flight events must use human-readable labels instead of cryptic acronyms (Novice Pilot Spec)'
    );
  });

  it('LogbookManager should integrate trimFlightTrack and resetFlightTrim', async () => {
    const memoryAdapter = createMemoryDbAdapter();
    logbookManager.setAdapter(memoryAdapter);
    await logbookManager.init();

    const points = createSyntheticFlightPoints();
    const meta = {
      id: 'logbook-trim-test',
      date: '2026-06-15',
      durationMinutes: 1,
      durationSeconds: 60,
      site: 'Monte Cavallaria',
      glider: 'Ozone Enzo 3'
    };
    const raw = {
      id: 'logbook-trim-test',
      decimatedPoints: points,
      originalPoints: points
    };

    await logbookManager.saveFlight(meta, raw);

    // Apply trimming
    const trimRes = await logbookManager.trimFlightTrack('logbook-trim-test', 10, 49);
    assert.equal(trimRes.meta.isTrimmed, true);
    assert.equal(trimRes.meta.trimIndices.trimmedCount, 40);

    const savedAfterTrim = await logbookManager.getFlight('logbook-trim-test');
    assert.equal(savedAfterTrim.meta.isTrimmed, true);
    assert.equal(savedAfterTrim.raw.decimatedPoints.length, 40);

    // Reset trimming
    const resetRes = await logbookManager.resetFlightTrim('logbook-trim-test');
    assert.equal(resetRes.meta.isTrimmed, false);
    assert.equal(resetRes.meta.isExplicitlyUntrimmed, true);

    const savedAfterReset = await logbookManager.getFlight('logbook-trim-test');
    assert.equal(savedAfterReset.meta.isTrimmed, false);
    assert.equal(savedAfterReset.raw.decimatedPoints.length, 60);
  });

  it('autoTrimFlight should automatically trim untrimmed flights and respect isExplicitlyUntrimmed flag', () => {
    const points = createSyntheticFlightPoints();
    const bundle = {
      meta: { id: 'auto-trim-flight', isTrimmed: false },
      raw: { id: 'auto-trim-flight', decimatedPoints: points, originalPoints: points }
    };

    // First auto-trim: trims track
    const res1 = autoTrimFlight(bundle);
    assert.equal(res1.wasTrimmed, true);
    assert.equal(res1.bundle.meta.isTrimmed, true);
    assert.ok(res1.bundle.raw.decimatedPoints.length < 60);

    // Second auto-trim on already trimmed flight: does nothing
    const res2 = autoTrimFlight(res1.bundle);
    assert.equal(res2.wasTrimmed, false);

    // Auto-trim on flight explicitly reset by user: must respect user intent and NOT re-trim
    const explicitlyUntrimmed = {
      meta: { id: 'untrimmed-flight', isTrimmed: false, isExplicitlyUntrimmed: true },
      raw: { id: 'untrimmed-flight', decimatedPoints: points, originalPoints: points }
    };
    const res3 = autoTrimFlight(explicitlyUntrimmed);
    assert.equal(res3.wasTrimmed, false);
    assert.equal(res3.bundle.meta.isTrimmed, false);
    assert.equal(res3.bundle.raw.decimatedPoints.length, 60);
  });

  describe('Elevation Calibration (QNH & Barometric Drift)', () => {
    it('applyElevationCorrection with two_point should adjust takeoff and landing altitudes and interpolate drift', () => {
      const points = createSyntheticFlightPoints();
      const bundle = {
        meta: {
          id: 'elev-test-flight',
          takeoffAltMsl: 1200,
          landingAltMsl: 800,
          maxAltMsl: 1600
        },
        raw: {
          id: 'elev-test-flight',
          decimatedPoints: points,
          originalPoints: points
        }
      };

      // Correct takeoff from 1200 to 1250 (+50), landing from 800 to 820 (+20)
      const corrected = applyElevationCorrection(bundle, 1250, 820, 'two_point');

      assert.ok(corrected.meta.elevationCorrection);
      assert.equal(corrected.meta.elevationCorrection.mode, 'two_point');
      assert.equal(corrected.meta.elevationCorrection.targetTakeoffAlt, 1250);
      assert.equal(corrected.meta.elevationCorrection.targetLandingAlt, 820);
      assert.equal(corrected.meta.takeoffAltMsl, 1250);
      assert.equal(corrected.meta.landingAltMsl, 820);

      const firstPt = corrected.raw.decimatedPoints[0];
      const lastPt = corrected.raw.decimatedPoints[corrected.raw.decimatedPoints.length - 1];
      assert.equal(Math.round(firstPt.alt), 1250);
      assert.equal(Math.round(lastPt.alt), 820);

      // Raw uncalibrated points preserved for reversible editing
      assert.ok(corrected.raw.uncalibratedOriginalPoints);
      assert.equal(corrected.raw.uncalibratedOriginalPoints.length, 60);
      assert.equal(corrected.raw.uncalibratedOriginalPoints[0].alt, 1200);
    });

    it('applyElevationCorrection with takeoff_offset should shift all altitudes uniformly', () => {
      const points = createSyntheticFlightPoints();
      const bundle = {
        meta: {
          id: 'offset-test-flight',
          takeoffAltMsl: 1200,
          landingAltMsl: 800
        },
        raw: {
          id: 'offset-test-flight',
          decimatedPoints: points,
          originalPoints: points
        }
      };

      // Shift takeoff by +30m (from 1200 to 1230)
      const corrected = applyElevationCorrection(bundle, 1230, null, 'takeoff_offset');

      assert.equal(corrected.meta.takeoffAltMsl, 1230);
      assert.equal(corrected.meta.landingAltMsl, 830);
      assert.equal(Math.round(corrected.raw.decimatedPoints[0].alt), 1230);
      assert.equal(Math.round(corrected.raw.decimatedPoints[59].alt), 830);
    });

    it('restoreOriginalElevations should restore uncalibrated altitudes and remove correction metadata', () => {
      const points = createSyntheticFlightPoints();
      const bundle = {
        meta: {
          id: 'restore-elev-test',
          takeoffAltMsl: 1200,
          landingAltMsl: 800
        },
        raw: {
          id: 'restore-elev-test',
          decimatedPoints: points,
          originalPoints: points
        }
      };

      const corrected = applyElevationCorrection(bundle, 1300, 850, 'two_point');
      assert.ok(corrected.meta.elevationCorrection);
      assert.equal(corrected.meta.takeoffAltMsl, 1300);

      const restored = restoreOriginalElevations(corrected);
      assert.equal(restored.meta.elevationCorrection, undefined);
      assert.equal(restored.meta.takeoffAltMsl, 1200);
      assert.equal(restored.meta.landingAltMsl, 800);
      assert.equal(restored.raw.decimatedPoints[0].alt, 1200);
      assert.equal(restored.raw.decimatedPoints[59].alt, 800);
    });

    it('LogbookManager should integrate correctFlightElevations and resetFlightElevations', async () => {
      const memoryAdapter = createMemoryDbAdapter();
      logbookManager.setAdapter(memoryAdapter);
      await logbookManager.init();

      const points = createSyntheticFlightPoints();
      const meta = {
        id: 'logbook-elev-flight',
        takeoffAltMsl: 1200,
        landingAltMsl: 800
      };
      const raw = {
        id: 'logbook-elev-flight',
        decimatedPoints: points,
        originalPoints: points
      };

      await logbookManager.saveFlight(meta, raw);

      // Calibrate elevations
      const calRes = await logbookManager.correctFlightElevations('logbook-elev-flight', 1240, 810, 'two_point');
      assert.ok(calRes.meta.elevationCorrection);
      assert.equal(calRes.meta.takeoffAltMsl, 1240);
      assert.equal(calRes.meta.landingAltMsl, 810);

      const savedAfterCal = await logbookManager.getFlight('logbook-elev-flight');
      assert.ok(savedAfterCal.meta.elevationCorrection);
      assert.equal(savedAfterCal.meta.takeoffAltMsl, 1240);

      // Reset elevations
      const resetRes = await logbookManager.resetFlightElevations('logbook-elev-flight');
      assert.equal(resetRes.meta.elevationCorrection, undefined);
      assert.equal(resetRes.meta.takeoffAltMsl, 1200);

      const savedAfterReset = await logbookManager.getFlight('logbook-elev-flight');
      assert.equal(savedAfterReset.meta.elevationCorrection, undefined);
      assert.equal(savedAfterReset.meta.takeoffAltMsl, 1200);
    });
  });
});
