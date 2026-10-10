/**
 * GlideMind - Flight Procedures & Landing Circuit Geometric Engine (Headless Core)
 * 
 * Computes deterministic aeronautical landing patterns for paragliding sites:
 * 1. Standard C-Approach (Attacco a 'C'): Downwind, Base, Final, and Holding/Altitude-Loss Sector
 * 2. Figure-8 Approach (Attacco a '8'): S-turns / figure-8s facing into wind for restricted or strong wind scenarios
 * 3. Calm Anemometric Fallback: deterministic cascade when v < 4 km/h
 * 4. Novice Pilot Safety Gate: triggers severe safety warnings for surface wind > 18 km/h (EN-A envelope)
 * 5. Dynamic Final Leg Distance: scaled by residual aerodynamic ground speed (v_trim - v_wind)
 * 
 * ZERO DOM DEPENDENCIES: 100% testable in Node.js runtime.
 */

import { calculateDestinationPoint, computeBearing, angularDifference } from './geoSpatialMath.js';
import { parseCoordinates } from './comprensorio.js';
import { DEFAULT_GLIDER, getCardinalDirection } from './flyability.js';

export const CALM_WIND_THRESHOLD_KMH = 4;
export const STRONG_WIND_EN_A_THRESHOLD_KMH = 18;
export const DANGEROUS_WIND_THRESHOLD_KMH = 22;

/**
 * Calculates a complete paragliding landing circuit geometry and metadata.
 * 
 * @param {object} options
 * @param {object|string|number[]} options.landingCoordinates Landing coordinates
 * @param {object|string|number[]} [options.takeoffCoordinates] Takeoff coordinates (for valley orientation)
 * @param {number} [options.windSpeedKmh=0] Surface wind speed at landing in km/h
 * @param {number} [options.windDirectionDeg=0] Meteorological wind direction in degrees (FROM where wind blows)
 * @param {object} [options.landing=null] Optional landing entity from catalog (for runwayHeading/rules)
 * @param {object} [options.flightPlan=null] Optional preferred flight plan from club conventions
 * @param {object} [options.glider=DEFAULT_GLIDER] Active glider profile
 * @returns {object} Calculated circuit geometry, legs, polylines, and safety status
 */
export function calculateLandingCircuit({
  landingCoordinates,
  takeoffCoordinates = null,
  windSpeedKmh = 0,
  windDirectionDeg = 0,
  landing = null,
  flightPlan = null,
  glider = DEFAULT_GLIDER
}) {
  const landingPos = parseCoordinates(landingCoordinates || landing?.coordinates);
  if (!landingPos) {
    throw new Error('calculateLandingCircuit: valid landingCoordinates are required');
  }

  const takeoffPos = parseCoordinates(takeoffCoordinates);
  const windSpeed = Math.max(0, Number(windSpeedKmh) || 0);
  const windDir = ((Number(windDirectionDeg) || 0) % 360 + 360) % 360;

  const isCalm = windSpeed < CALM_WIND_THRESHOLD_KMH;
  const isStrongWind = windSpeed > STRONG_WIND_EN_A_THRESHOLD_KMH;
  const isDangerousWind = windSpeed > DANGEROUS_WIND_THRESHOLD_KMH;

  // 1. Resolve preferred or runway heading in calm conditions
  let preferredHeading = 180; // Default South
  let calmHeadingSource = 'default';

  if (typeof landing?.runwayHeading === 'number') {
    preferredHeading = landing.runwayHeading;
    calmHeadingSource = 'runwayHeading';
  } else if (typeof landing?.heading === 'number') {
    preferredHeading = landing.heading;
    calmHeadingSource = 'landingHeading';
  } else if (flightPlan && typeof flightPlan.heading === 'number') {
    preferredHeading = flightPlan.heading;
    calmHeadingSource = 'flightPlan';
  } else if (takeoffPos) {
    preferredHeading = Math.round(computeBearing(takeoffPos.lat, takeoffPos.lon, landingPos.lat, landingPos.lon));
    calmHeadingSource = 'takeoffBearing';
  }

  // 2. Heading of the final leg (glider heading when touching down)
  // In wind: glider points directly INTO the wind (heading = windDir)
  // In calm: glider follows preferred runway / valley axis
  const finalHeading = isCalm ? preferredHeading : windDir;

  // 3. Dynamic Final Leg Distance
  // Scaled by ground speed: v_ground = v_trim - v_wind
  const trimSpeedKmh = glider?.trimSpeed || 36;
  const trimSpeedMs = trimSpeedKmh / 3.6;
  const windSpeedMs = windSpeed / 3.6;
  const groundSpeedMs = Math.max(2.0, trimSpeedMs - (isCalm ? 0 : windSpeedMs));
  const sinkRateMs = 1.2; // Standard paraglider sink rate (m/s)
  const finalEntryAltitudeAgl = 25; // Standard final entry altitude (m AGL)
  
  const rawFinalDist = Math.round(finalEntryAltitudeAgl * (groundSpeedMs / sinkRateMs));
  // Clamp final leg length between 80m and 250m
  const finalDistanceMeters = Math.min(250, Math.max(80, rawFinalDist));

  // The final approach starts upwind of touchdown along heading (finalHeading + 180)
  const finalStart = calculateDestinationPoint(
    landingPos,
    finalDistanceMeters,
    (finalHeading + 180) % 360
  );

  // 4. Circuit Hand (Left-Hand vs Right-Hand traffic pattern)
  let circuitHand = 'left';
  if (flightPlan?.circuitHand === 'right' || flightPlan?.circuitHand === 'left') {
    circuitHand = flightPlan.circuitHand;
  } else if (flightPlan?.description && flightPlan.description.toLowerCase().includes('destra')) {
    circuitHand = 'right';
  } else if (takeoffPos) {
    // If takeoff is known, place the downwind on the open-valley side
    const bearingToTakeoff = computeBearing(landingPos.lat, landingPos.lon, takeoffPos.lat, takeoffPos.lon);
    const relDiff = ((bearingToTakeoff - finalHeading + 540) % 360) - 180;
    // If terrain/takeoff is to the left (relDiff < 0), put circuit on the right to stay clear of slope
    circuitHand = relDiff < 0 ? 'right' : 'left';
  }

  // 5. Circuit Type
  let circuitType = 'standard_c';
  if (isCalm) {
    circuitType = 'calm_straight';
  } else if (isStrongWind || (flightPlan?.pattern && flightPlan.pattern.includes('8'))) {
    circuitType = 'figure_eight';
  }

  // 6. Geometry Generation
  const lateralOffsetMeters = 120; // Distance between final axis and downwind leg
  const downwindLengthMeters = 180; // Length of downwind leg

  // Base leg bearing perpendicular to final:
  // For left-hand pattern: base leg starts to the left of final axis (finalHeading - 90)
  // For right-hand pattern: base leg starts to the right of final axis (finalHeading + 90)
  const baseBearingFromFinal = (finalHeading + (circuitHand === 'left' ? -90 : 90) + 360) % 360;
  const baseStart = calculateDestinationPoint(finalStart, lateralOffsetMeters, baseBearingFromFinal);

  // Downwind leg runs in the direction of the wind (finalHeading + 180)
  // It starts upwind of the base leg turn point
  const downwindStart = calculateDestinationPoint(baseStart, downwindLengthMeters, finalHeading);

  // Holding / Altitude loss sector (Smaltimento quota)
  // Positioned upwind of downwind entry
  const holdingSectorCenter = calculateDestinationPoint(
    downwindStart,
    100,
    (finalHeading + (circuitHand === 'left' ? -45 : 45) + 360) % 360
  );

  // Figure-8 legs for strong wind
  const fig8Left = calculateDestinationPoint(finalStart, 90, (finalHeading - 80 + 360) % 360);
  const fig8Right = calculateDestinationPoint(finalStart, 90, (finalHeading + 80) % 360);

  // 7. Safety Warnings and Explanations
  let isSafetyWarning = false;
  let warningSeverity = 'normal';
  let warningReason = null;

  if (isDangerousWind) {
    isSafetyWarning = true;
    warningSeverity = 'severe';
    warningReason = `Vento al suolo pericoloso (${windSpeed} km/h > 22 km/h). Condizioni estreme fuori da qualsiasi margine di sicurezza. Atterraggio vietato/chiuso.`;
  } else if (isStrongWind) {
    isSafetyWarning = true;
    warningSeverity = 'severe';
    warningReason = `Vento al suolo sostenuto (${windSpeed} km/h > 18 km/h). Condizioni critiche fuori dall'inviluppo di sicurezza per vele base (EN-A). Forte rischio di arretramento e gradiente ripido.`;
  }

  // Plain-language pilot explanation
  const cardinalWind = getCardinalDirection(finalHeading);
  let explanation = '';

  if (isCalm) {
    explanation = `Vento calmo (< 4 km/h). Avvicinamento rettilineo consigliato lungo l'asse convenzionale ${preferredHeading}° (${getCardinalDirection(preferredHeading)}).`;
  } else if (circuitType === 'figure_eight') {
    explanation = `Vento sostenuto da ${getCardinalDirection(windDir)} a ${windSpeed} km/h. Procedura consigliata ad 'Attacco a 8' (virate ad S frontali controvento) per evitare di finire dietrovento. Finale controvento per ${finalHeading}° ${cardinalWind}.`;
  } else {
    explanation = `Vento da ${getCardinalDirection(windDir)} a ${windSpeed} km/h. Circuito standard a 'C' (${circuitHand === 'left' ? 'Mano Sinistra' : 'Mano Destra'}), finale controvento orientato per ${finalHeading}° ${cardinalWind}. Smaltimento quota sul lato aperto.`;
  }

  // 8. Polylines coordinates array [lat, lon] for direct map rendering
  const finalLegCoordinates = [
    [finalStart.lat, finalStart.lon],
    [landingPos.lat, landingPos.lon]
  ];

  const baseLegCoordinates = [
    [baseStart.lat, baseStart.lon],
    [finalStart.lat, finalStart.lon]
  ];

  const downwindLegCoordinates = [
    [downwindStart.lat, downwindStart.lon],
    [baseStart.lat, baseStart.lon]
  ];

  const figureEightCoordinates = [
    [fig8Left.lat, fig8Left.lon],
    [finalStart.lat, finalStart.lon],
    [fig8Right.lat, fig8Right.lon]
  ];

  return {
    circuitType,
    circuitHand,
    finalHeading,
    finalDistanceMeters,
    windSpeedKmh: windSpeed,
    windDirectionDeg: windDir,
    isCalm,
    isSafetyWarning,
    warningSeverity,
    warningReason,
    explanation,
    calmHeadingSource,
    touchdown: landingPos,
    finalStart,
    baseStart,
    downwindStart,
    holdingArea: {
      center: holdingSectorCenter,
      radiusMeters: 75
    },
    polylines: {
      finalLeg: finalLegCoordinates,
      baseLeg: baseLegCoordinates,
      downwindLeg: downwindLegCoordinates,
      figureEight: figureEightCoordinates
    }
  };
}
