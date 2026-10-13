/**
 * GlideMind - Flight Windows & Daily Narrative Engine (Headless Core)
 * 
 * Provides pure meteorological day-segmentation and operational aeronautical briefings:
 * 1. Diurnal sunrise-to-sunset segmentation into 3-4 natural flight phases (morning, midday thermal peak, afternoon, evening).
 * 2. Synthesis of launch flyability, thermal convective lift, and landing field safety per window.
 * 3. Support for manual takeoff forcing (forcedTakeoffId) without silent override, with advisory alternative hints.
 * 4. Human-readable, beginner-friendly (Novice Pilot Spec) operational Italian microcopy.
 * 
 * ZERO DOM DEPENDENCIES: 100% testable in pure Node.js runtime.
 */

import { evaluateComprensorio } from './comprensorio.js';
import { resolveDaylightHours } from './daylight.js';
import { DEFAULT_GLIDER } from './gliders.js';

/**
 * Calculates structured operational flight windows across the daylight hours of a comprensorio.
 * 
 * @param {object} options
 * @param {object} options.comprensorio Comprensorio object from catalog
 * @param {object} [options.weatherData=null] Raw or enriched weather payload with hourly arrays
 * @param {string} [options.targetDate=null] Target ISO date string (YYYY-MM-DD)
 * @param {object} [options.glider=DEFAULT_GLIDER] Active paraglider configuration
 * @param {string|null} [options.forcedTakeoffId=null] Explicitly forced takeoff ID by user
 * @param {string|null} [options.forcedLandingId=null] Explicitly forced landing ID by user
 * @returns {Array<object>} Array of flight window objects
 */
export function calculateFlightWindows({
  comprensorio,
  weatherData = null,
  targetDate = null,
  glider = DEFAULT_GLIDER,
  forcedTakeoffId = null,
  forcedLandingId = null
}) {
  if (!comprensorio) return [];

  const activeGlider = glider || DEFAULT_GLIDER;
  const daylight = resolveDaylightHours(weatherData, targetDate, comprensorio);
  const sunriseH = daylight.sunriseHour;
  const sunsetH = daylight.sunsetHour;

  if (sunriseH >= sunsetH) return [];

  // Evaluate each hour across the daylight window
  const hourlyEvaluations = [];
  for (let h = sunriseH; h <= sunsetH; h++) {
    const evalResult = evaluateComprensorio({
      comprensorio,
      weatherData,
      hourIndex: h,
      glider: activeGlider,
      targetDate,
      takeoffId: forcedTakeoffId,
      landingId: forcedLandingId
    });

    // Check if an alternative takeoff would be strictly better when a takeoff is forced
    let alternativeTakeoff = null;
    if (forcedTakeoffId && evalResult.status !== 'flyable' && Array.isArray(comprensorio.takeoffs) && comprensorio.takeoffs.length > 1) {
      const autoEval = evaluateComprensorio({
        comprensorio,
        weatherData,
        hourIndex: h,
        glider: activeGlider,
        targetDate,
        takeoffId: null, // automatic selection
        landingId: forcedLandingId
      });
      if (autoEval.status === 'flyable' && autoEval.takeoff && autoEval.takeoff.id !== forcedTakeoffId) {
        alternativeTakeoff = autoEval.takeoff;
      }
    }

    hourlyEvaluations.push({
      hour: h,
      evalResult,
      alternativeTakeoff
    });
  }

  // Partition daylight hours into 3-4 natural meteorological windows:
  // Phase 1: Morning / Calm (sunrise to ~11:00)
  // Phase 2: Midday Thermal Core (11:00 to ~14:30)
  // Phase 3: Afternoon Valley Breeze & Turbulence (14:30 to ~17:30)
  // Phase 4: Late Afternoon / Restitution (17:30 to sunset)
  const partitions = buildDayPartitions(sunriseH, sunsetH);

  const windows = partitions.map((part, index) => {
    const slice = hourlyEvaluations.filter(e => e.hour >= part.startHour && e.hour <= part.endHour);
    if (slice.length === 0) return null;

    return synthesizeWindow({
      windowIndex: index,
      part,
      slice,
      comprensorio,
      glider: activeGlider,
      isForcedTakeoff: Boolean(forcedTakeoffId)
    });
  }).filter(Boolean);

  return windows;
}

/**
 * Builds standard meteorological day partition bounds according to sunrise and sunset.
 * @param {number} sunriseH
 * @param {number} sunsetH
 * @returns {Array<{ id: string, phaseName: string, startHour: number, endHour: number }>}
 */
function buildDayPartitions(sunriseH, sunsetH) {
  const span = sunsetH - sunriseH;

  // Short winter/autumn day (span <= 9 hours) -> 3 windows
  if (span <= 9) {
    const mid1 = sunriseH + Math.round(span * 0.35);
    const mid2 = sunriseH + Math.round(span * 0.70);
    return [
      { id: 'morning', phaseName: 'Mattina', startHour: sunriseH, endHour: Math.max(sunriseH, mid1 - 1) },
      { id: 'midday', phaseName: 'Ore Centrali', startHour: mid1, endHour: Math.max(mid1, mid2 - 1) },
      { id: 'afternoon', phaseName: 'Pomeriggio', startHour: mid2, endHour: sunsetH }
    ];
  }

  // Standard/long spring/summer day (span > 9 hours) -> 4 windows
  const morningEnd = Math.min(11, sunriseH + 3);
  const middayEnd = 14;
  const afternoonEnd = Math.min(sunsetH - 2, 17);

  const partitions = [];

  // 1. Mattina
  partitions.push({
    id: 'morning',
    phaseName: 'Mattina',
    startHour: sunriseH,
    endHour: Math.max(sunriseH, morningEnd)
  });

  // 2. Ore Centrali
  const middayStart = partitions[0].endHour + 1;
  const actualMiddayEnd = Math.max(middayStart, Math.min(middayEnd, sunsetH - 2));
  partitions.push({
    id: 'midday',
    phaseName: 'Ore Centrali',
    startHour: middayStart,
    endHour: actualMiddayEnd
  });

  // 3. Pomeriggio
  const aftStart = partitions[1].endHour + 1;
  if (aftStart <= sunsetH - 2) {
    const actualAftEnd = Math.max(aftStart, Math.min(afternoonEnd, sunsetH - 2));
    partitions.push({
      id: 'afternoon',
      phaseName: 'Pomeriggio',
      startHour: aftStart,
      endHour: actualAftEnd
    });
  }

  // 4. Tardo Pomeriggio / Sera
  const lastStart = partitions[partitions.length - 1].endHour + 1;
  if (lastStart <= sunsetH) {
    partitions.push({
      id: 'evening',
      phaseName: 'Tardo Pomeriggio / Sera',
      startHour: lastStart,
      endHour: sunsetH
    });
  }

  return partitions;
}

/**
 * Synthesizes aerological data, flight safety status, and narrative advice for a single time window.
 * 
 * @param {object} params
 * @param {number} params.windowIndex
 * @param {object} params.part
 * @param {Array<object>} params.slice
 * @param {object} params.comprensorio
 * @param {object} params.glider
 * @param {boolean} params.isForcedTakeoff
 * @returns {object}
 */
function synthesizeWindow({
  windowIndex,
  part,
  slice,
  comprensorio,
  glider,
  isForcedTakeoff
}) {
  const startHour = part.startHour;
  const endHour = part.endHour;
  const timeRange = `${String(startHour).padStart(2, '0')}:00 - ${String(endHour + 1).padStart(2, '0')}:00`;

  // Representative hour: middle hour of the window
  const midIndex = Math.floor(slice.length / 2);
  const repItem = slice[midIndex] || slice[0];
  const repEval = repItem.evalResult;

  // Aggregate safety status across the slice (pessimistic / weakest link safety)
  const unflyableCount = slice.filter(s => s.evalResult.status === 'unflyable').length;
  const cautionCount = slice.filter(s => s.evalResult.status === 'caution').length;
  const flyableCount = slice.filter(s => s.evalResult.status === 'flyable').length;

  let windowStatus = 'flyable';
  if (unflyableCount > 0 && unflyableCount >= Math.ceil(slice.length / 2)) {
    windowStatus = 'unflyable';
  } else if (unflyableCount > 0 || cautionCount > 0) {
    windowStatus = 'caution';
  }

  // Representative takeoff and landing
  const activeTakeoff = repEval.takeoff || (comprensorio.takeoffs && comprensorio.takeoffs[0]) || { name: 'Decollo' };
  const safeLanding = repEval.landing || (comprensorio.landings && comprensorio.landings[0]) || { name: 'Atterraggio' };

  // Weather metrics in slice
  const windSpeeds = slice.map(s => Number(s.evalResult.takeoffWeather?.windSpeed ?? s.evalResult.weatherSnapshot?.windSpeed ?? 0));
  const windGusts = slice.map(s => Number(s.evalResult.takeoffWeather?.windGust ?? s.evalResult.weatherSnapshot?.windGust ?? 0));
  const landingSpeeds = slice.map(s => Number(s.evalResult.landingWeather?.windSpeed ?? s.evalResult.weatherSnapshot?.windSpeed ?? 0));
  const capes = slice.map(s => Number(s.evalResult.weatherSnapshot?.cape ?? 0));
  const rains = slice.map(s => Number(s.evalResult.weatherSnapshot?.rain ?? 0));

  const maxTakeoffWind = Math.round(Math.max(0, ...windSpeeds));
  const avgTakeoffWind = Math.round(windSpeeds.reduce((a, b) => a + b, 0) / (windSpeeds.length || 1));
  const maxGust = Math.round(Math.max(0, ...windGusts));
  const maxLandingWind = Math.round(Math.max(0, ...landingSpeeds));
  const maxCape = Math.round(Math.max(0, ...capes));
  const maxRain = Math.max(0, ...rains);

  // Hazards collection
  const hazards = [];
  if (maxRain > 0.1) {
    hazards.push('Precipitazioni o decollo bagnato');
  }
  if (maxCape >= 800) {
    hazards.push(`Instabilità convettiva elevata (CAPE ${maxCape} J/kg): rischio sovrasviluppo`);
  }
  if (maxGust - maxTakeoffWind >= 8) {
    hazards.push(`Raffiche attive (fino a ${maxGust} km/h)`);
  }
  if (maxLandingWind > 20) {
    hazards.push(`Brezza sostenuta in atterraggio (${maxLandingWind} km/h)`);
  }
  if (maxTakeoffWind > (glider.vTrim * 0.55)) {
    hazards.push(`Vento forte in quota (${maxTakeoffWind} km/h): rischio scarroccio`);
  }

  // Detect alternative takeoff advisory
  const altSuggestion = slice.find(s => Boolean(s.alternativeTakeoff))?.alternativeTakeoff || null;

  // Build titles and operational descriptions
  let title = '';
  let description = '';

  if (windowStatus === 'unflyable') {
    if (maxRain > 0.1) {
      title = 'Sconsigliato: Precipitazioni';
      description = 'Pioggia o copertura compatta impediscono il volo in sicurezza.';
    } else if (maxTakeoffWind > 25 || maxGust > 32) {
      title = 'NO FLY: Vento Forte';
      description = `Vento in decollo eccessivo (${maxTakeoffWind} km/h con raffiche a ${maxGust} km/h). Rischio arretramento.`;
    } else if (maxLandingWind > 25) {
      title = 'NO FLY: Atterraggio Chiuso';
      description = `Brezza di valle violenta in atterraggio (${maxLandingWind} km/h). Rientro ad alto rischio rotori.`;
    } else {
      title = 'Non Volabile';
      description = `Condizioni sfavorevoli in decollo (${repEval.reason || 'vento fuori limiti o sottovento'}).`;
    }
  } else if (windowStatus === 'caution') {
    if (maxLandingWind > 18) {
      title = 'Attenzione: Brezza di Valle';
      description = `Decollo praticabile (${maxTakeoffWind} km/h), ma brezza vivace a terra (${maxLandingWind} km/h). Richiesto circuito di atterraggio preciso.`;
    } else if (maxGust - maxTakeoffWind >= 8) {
      title = 'Vento a Raffiche';
      description = `Decollo consentito con attenzione: raffiche fino a ${maxGust} km/h. Consigliato per piloti esperti.`;
    } else if (maxCape >= 600) {
      title = 'Convezione Marcata';
      description = 'Termiche vive e aria attiva. Monitorare eventuali formazioni nuvolose a cumulo congesto.';
    } else {
      title = 'Condizioni Marginali';
      description = `Volo possibile con cautela. ${repEval.reason || 'Verificare andamento locale.'}`;
    }
  } else {
    // Flyable
    if (part.id === 'morning') {
      title = 'Volo Calmo & Planate';
      description = `Brezza debole e aria dolce (${avgTakeoffWind} km/h). Condizioni ideali per planate, ripresa volo e vele ricreative EN-A.`;
    } else if (part.id === 'midday') {
      title = 'Termodinamica Formata';
      description = `Termiche attive e buona quota. Decollo ${activeTakeoff.name} ben alimentato. Atterraggio ${safeLanding.name} agibile.`;
    } else if (part.id === 'afternoon') {
      title = 'Veleggiamento Attivo';
      description = `Brezza regolare (${avgTakeoffWind} km/h in quota, ${maxLandingWind} km/h a valle). Ottimo per galleggiamento e termica di pendio.`;
    } else {
      title = 'Restituzione Serale';
      description = `Aria omogenea e calma in progressivo calo. Atterraggio facile a fondo valle.`;
    }
  }

  // Append alternative hint if forced takeoff is degraded
  if (isForcedTakeoff && altSuggestion && windowStatus !== 'flyable') {
    description += ` (Suggerimento: ${altSuggestion.name} risulta favorevole).`;
  }

  return {
    id: `fw-${part.id}-${startHour}`,
    phaseId: part.id,
    phaseName: part.phaseName,
    timeRange,
    startHour,
    endHour,
    status: windowStatus,
    takeoff: activeTakeoff,
    landing: safeLanding,
    title,
    description,
    hazards,
    avgTakeoffWind,
    maxTakeoffWind,
    maxGust,
    maxLandingWind,
    maxCape,
    isForcedTakeoff,
    alternativeTakeoff: altSuggestion
  };
}
