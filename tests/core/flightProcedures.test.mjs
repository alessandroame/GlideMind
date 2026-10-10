/**
 * GlideMind - Flight Procedures & Landing Circuit Unit Tests (Pure Node.js)
 * 
 * Verifies:
 * 1. Headless Core Isolation (Zero DOM dependencies)
 * 2. Standard C-Approach geometry and polyline continuity
 * 3. Dynamic final leg distance scaling with residual ground speed
 * 4. Calm anemometric fallback cascade (runwayHeading -> flightPlan -> takeoff bearing -> default 180)
 * 5. Novice Pilot Spec safety gate for surface wind > 18 km/h (severe warning)
 * 6. Left-hand vs right-hand traffic pattern determination
 * 7. Figure-8 approach generation under strong wind
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLandingCircuit,
  CALM_WIND_THRESHOLD_KMH,
  STRONG_WIND_EN_A_THRESHOLD_KMH
} from '../../core/flightProcedures.js';
import { computeDistanceKm } from '../../core/geoSpatialMath.js';

describe('Flight Procedures Engine - Landing Circuit Geometry & Safety Gate', () => {
  const SUELLO_LANDING = { lat: 45.817209, lon: 9.318668 };
  const CORNIZZOLO_TAKEOFF = { lat: 45.833265, lon: 9.302084 };

  it('should calculate a standard C-approach pointing directly into wind with 14 km/h SSE wind', () => {
    const result = calculateLandingCircuit({
      landingCoordinates: SUELLO_LANDING,
      takeoffCoordinates: CORNIZZOLO_TAKEOFF,
      windSpeedKmh: 14,
      windDirectionDeg: 160 // SSE
    });

    assert.equal(result.circuitType, 'standard_c');
    assert.equal(result.finalHeading, 160);
    assert.equal(result.isCalm, false);
    assert.equal(result.isSafetyWarning, false);
    assert.ok(result.finalDistanceMeters >= 80 && result.finalDistanceMeters <= 250);

    // Final starts upwind of touchdown (towards NNW, ~340 deg)
    assert.ok(result.finalStart.lat > SUELLO_LANDING.lat);
    assert.ok(result.polylines.finalLeg.length === 2);
    assert.ok(result.polylines.baseLeg.length === 2);
    assert.ok(result.polylines.downwindLeg.length === 2);

    // Continuity: finalStart must match baseLeg end
    assert.deepEqual(result.polylines.baseLeg[1], result.polylines.finalLeg[0]);
    // Continuity: baseStart must match downwindLeg end
    assert.deepEqual(result.polylines.downwindLeg[1], result.polylines.baseLeg[0]);

    // Check explanation text has plain language
    assert.ok(result.explanation.includes('Circuito standard'));
    assert.ok(result.explanation.includes('160°'));
  });

  it('should dynamically scale final leg distance based on wind speed (shorter in strong wind, longer in light wind)', () => {
    const lightWindResult = calculateLandingCircuit({
      landingCoordinates: SUELLO_LANDING,
      windSpeedKmh: 5,
      windDirectionDeg: 180
    });

    const moderateWindResult = calculateLandingCircuit({
      landingCoordinates: SUELLO_LANDING,
      windSpeedKmh: 16,
      windDirectionDeg: 180
    });

    // In lighter wind, ground speed is higher, requiring a longer final distance to lose 25m AGL
    assert.ok(
      lightWindResult.finalDistanceMeters > moderateWindResult.finalDistanceMeters,
      `Expected light wind final (${lightWindResult.finalDistanceMeters}m) > moderate wind final (${moderateWindResult.finalDistanceMeters}m)`
    );
  });

  it('should activate calm fallback cascade when wind speed < 4 km/h', () => {
    // 1. RunwayHeading takes top priority
    const withRunway = calculateLandingCircuit({
      landingCoordinates: SUELLO_LANDING,
      windSpeedKmh: 2,
      windDirectionDeg: 90,
      landing: { runwayHeading: 210 }
    });
    assert.equal(withRunway.isCalm, true);
    assert.equal(withRunway.circuitType, 'calm_straight');
    assert.equal(withRunway.finalHeading, 210);
    assert.equal(withRunway.calmHeadingSource, 'runwayHeading');

    // 2. FlightPlan heading takes second priority
    const withFlightPlan = calculateLandingCircuit({
      landingCoordinates: SUELLO_LANDING,
      windSpeedKmh: 1.5,
      windDirectionDeg: 45,
      flightPlan: { heading: 150 }
    });
    assert.equal(withFlightPlan.finalHeading, 150);
    assert.equal(withFlightPlan.calmHeadingSource, 'flightPlan');

    // 3. Takeoff bearing is used if no runway or flight plan
    const withTakeoff = calculateLandingCircuit({
      landingCoordinates: SUELLO_LANDING,
      takeoffCoordinates: CORNIZZOLO_TAKEOFF,
      windSpeedKmh: 0,
      windDirectionDeg: 0
    });
    assert.ok(typeof withTakeoff.finalHeading === 'number');
    assert.equal(withTakeoff.calmHeadingSource, 'takeoffBearing');

    // 4. Default 180 if nothing else provided
    const withDefault = calculateLandingCircuit({
      landingCoordinates: SUELLO_LANDING,
      windSpeedKmh: 2.5
    });
    assert.equal(withDefault.finalHeading, 180);
    assert.equal(withDefault.calmHeadingSource, 'default');
  });

  it('should trigger Novice Pilot safety warning and figure-eight mode when wind > 18 km/h', () => {
    const strongWind = calculateLandingCircuit({
      landingCoordinates: SUELLO_LANDING,
      takeoffCoordinates: CORNIZZOLO_TAKEOFF,
      windSpeedKmh: 19,
      windDirectionDeg: 180
    });

    assert.equal(strongWind.isSafetyWarning, true);
    assert.equal(strongWind.warningSeverity, 'severe');
    assert.equal(strongWind.circuitType, 'figure_eight');
    assert.ok(strongWind.warningReason.includes('EN-A'));
    assert.ok(strongWind.warningReason.includes('arretramento'));
    assert.ok(strongWind.polylines.figureEight.length >= 3);
  });

  it('should trigger extreme danger warning when wind > 22 km/h', () => {
    const extremeWind = calculateLandingCircuit({
      landingCoordinates: SUELLO_LANDING,
      windSpeedKmh: 25,
      windDirectionDeg: 180
    });

    assert.equal(extremeWind.isSafetyWarning, true);
    assert.equal(extremeWind.warningSeverity, 'severe');
    assert.ok(extremeWind.warningReason.includes('pericoloso') || extremeWind.warningReason.includes('chiuso'));
  });

  it('should honor flightPlan circuitHand convention if declared as right-hand', () => {
    const rightHandResult = calculateLandingCircuit({
      landingCoordinates: SUELLO_LANDING,
      takeoffCoordinates: CORNIZZOLO_TAKEOFF,
      windSpeedKmh: 12,
      windDirectionDeg: 180,
      flightPlan: { circuitHand: 'right' }
    });

    assert.equal(rightHandResult.circuitHand, 'right');

    const leftHandResult = calculateLandingCircuit({
      landingCoordinates: SUELLO_LANDING,
      takeoffCoordinates: CORNIZZOLO_TAKEOFF,
      windSpeedKmh: 12,
      windDirectionDeg: 180,
      flightPlan: { circuitHand: 'left' }
    });

    assert.equal(leftHandResult.circuitHand, 'left');

    // Base start longitude should be different for left vs right
    assert.notEqual(rightHandResult.baseStart.lon, leftHandResult.baseStart.lon);
  });

  it('should throw an informative error when landingCoordinates are missing', () => {
    assert.throws(() => {
      calculateLandingCircuit({ landingCoordinates: null });
    }, /valid landingCoordinates are required/);
  });
});
