/**
 * GlideMind - Flight Logbook & Pilot Currency Analytics (Headless Core)
 * Pure domain logic for pilot flight hours, automated session deduction (thermals AND exercises),
 * currency tracking, and flight log record normalization.
 * Zero DOM dependencies, 100% testable in Node.js.
 */

import { detectThermals, detectFlightManeuvers } from './flightManeuvers.js';

export const FLIGHT_TYPES = Object.freeze({
  THERMAL: 'thermal',
  EXERCISE: 'exercise',
  SOARING: 'soaring',
  GLIDE: 'glide'
});

export const FLIGHT_TYPE_LABELS = Object.freeze({
  thermal: 'Termica & Cross',
  exercise: 'Esercizi & Manovre',
  soaring: 'Dinamica & Soaring',
  glide: 'Planata / Discesa'
});

export const PILOT_CURRENCY_STATUS = Object.freeze({
  NO_FLIGHTS: 'no_flights',
  ACTIVE: 'active',
  REENTRY: 'reentry',
  LAPSED: 'lapsed'
});

export const PILOT_CURRENCY_LABELS = Object.freeze({
  no_flights: 'Nessun volo',
  active: 'In attività',
  reentry: 'Ripresa graduale',
  lapsed: 'Fermo prolungato'
});

/**
 * Default realistic seed flights for pilot profiles.
 * Reflects real paragliding where a single flight can feature BOTH thermals AND exercises!
 */
export const DEFAULT_SEED_FLIGHTS = Object.freeze([
  Object.freeze({
    id: 'fl-1',
    date: '2026-10-03',
    site: 'Monte Cornizzolo',
    durationMinutes: 74,
    hasThermals: true,
    hasExercises: false,
    thermalsCount: 3,
    maneuversCount: 0,
    notes: 'Termica generosa su Corno Birone, quota max 1420m'
  }),
  Object.freeze({
    id: 'fl-2',
    date: '2026-09-28',
    site: 'Bassano del Grappa',
    durationMinutes: 45,
    hasThermals: true,
    hasExercises: true,
    thermalsCount: 1,
    maneuversCount: 2,
    notes: 'Salita in termica a 1200m e poi esercizi controllo assetto e orecchie'
  }),
  Object.freeze({
    id: 'fl-3',
    date: '2026-09-15',
    site: 'Meduno',
    durationMinutes: 62,
    hasThermals: true,
    hasExercises: false,
    thermalsCount: 2,
    maneuversCount: 0,
    notes: 'Veleggio serale con risalita morbida sul decollo'
  }),
  Object.freeze({
    id: 'fl-4',
    date: '2026-08-20',
    site: 'Monte Cornizzolo',
    durationMinutes: 38,
    hasThermals: false,
    hasExercises: true,
    thermalsCount: 0,
    maneuversCount: 3,
    notes: 'Manovre di discesa rapida e avvicinamento a 8'
  }),
  Object.freeze({
    id: 'fl-5',
    date: '2026-07-12',
    site: 'Rocca Calascio',
    durationMinutes: 95,
    hasThermals: true,
    hasExercises: true,
    thermalsCount: 4,
    maneuversCount: 2,
    notes: 'Cross verso Campo Imperatore con termica potente e spirale controllata'
  }),
  Object.freeze({
    id: 'fl-6',
    date: '2026-05-18',
    site: 'Bassano del Grappa',
    durationMinutes: 52,
    hasThermals: false,
    hasExercises: true,
    thermalsCount: 0,
    maneuversCount: 4,
    notes: 'Esercizi virate 360 e controllo beccheggio'
  }),
  Object.freeze({
    id: 'fl-7',
    date: '2026-04-05',
    site: 'Meduno',
    durationMinutes: 80,
    hasThermals: true,
    hasExercises: false,
    thermalsCount: 3,
    maneuversCount: 0,
    notes: 'Volo di primavera lungo cresta Valinis'
  })
]);

/**
 * Automatically deduces flight activities (thermals, maneuvers/exercises) from GPS track points.
 * @param {Array<Object>} points - Array of GPS track points with lat, lon, alt.
 * @returns {{
 *   hasThermals: boolean,
 *   hasExercises: boolean,
 *   thermalsCount: number,
 *   maneuversCount: number,
 *   detectedManeuvers: Array<string>
 * }}
 */
export function deduceFlightActivitiesFromTrack(points) {
  if (!Array.isArray(points) || points.length < 5) {
    return {
      hasThermals: false,
      hasExercises: false,
      thermalsCount: 0,
      maneuversCount: 0,
      detectedManeuvers: []
    };
  }

  let thermals = [];
  try {
    thermals = detectThermals(points) || [];
  } catch {
    thermals = [];
  }

  let maneuvers = [];
  try {
    maneuvers = detectFlightManeuvers(points, null, thermals) || [];
  } catch {
    maneuvers = [];
  }

  return {
    hasThermals: thermals.length > 0,
    hasExercises: maneuvers.length > 0,
    thermalsCount: thermals.length,
    maneuversCount: maneuvers.length,
    detectedManeuvers: maneuvers.map(m => m.name || m.type || 'manovra')
  };
}

/**
 * Calculates pilot flight currency metrics aggregated over a rolling period (month or year).
 * Note: A flight can feature BOTH thermals AND exercises simultaneously!
 * @param {Object} options
 * @param {Array<Object>} [options.flights=[]] - Array of flight objects.
 * @param {'month'|'year'} [options.period='month'] - Rolling period window.
 * @param {Date|string} [options.referenceDate=new Date()] - Reference date for period calculation.
 * @returns {{
 *   period: 'month'|'year',
 *   periodLabel: string,
 *   totalMinutes: number,
 *   totalHours: number,
 *   formattedHours: string,
 *   thermalSessions: number,
 *   exerciseSessions: number,
 *   totalSessions: number,
 *   lastFlight: Object|null,
 *   isCurrent: boolean,
 *   currencyStatus: 'active'|'lapsed',
 *   currencyLabel: string
 * }}
 */
export function calculatePilotPeriodMetrics(options = {}) {
  const flights = Array.isArray(options.flights) ? options.flights : [];
  const period = options.period === 'year' ? 'year' : 'month';
  const refDate = options.referenceDate ? new Date(options.referenceDate) : new Date();
  const refTime = isNaN(refDate.getTime()) ? Date.now() : refDate.getTime();

  // Window calculation: 30 days for 'month', 365 days for 'year'
  const windowDays = period === 'year' ? 365 : 30;
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const startTime = refTime - windowMs;

  let totalMinutes = 0;
  let thermalSessions = 0;
  let exerciseSessions = 0;
  let matchingFlightsCount = 0;

  // Track overall latest flight regardless of period filter
  let latestFlight = null;
  let latestFlightTime = -Infinity;

  for (const flight of flights) {
    if (!flight || !flight.date) continue;

    const flightTime = new Date(flight.date).getTime();
    if (isNaN(flightTime)) continue;

    if (flightTime > latestFlightTime) {
      latestFlightTime = flightTime;
      latestFlight = flight;
    }

    // Check if flight falls within the rolling period (allowing same day)
    if (flightTime >= startTime && flightTime <= refTime + 86400000) {
      const duration = Math.max(0, parseInt(flight.durationMinutes, 10) || 0);
      totalMinutes += duration;
      matchingFlightsCount += 1;

      // Both can be true in the same flight!
      const isThermal = flight.hasThermals === true ||
        (flight.type && (flight.type === FLIGHT_TYPES.THERMAL || flight.type === 'both')) ||
        (flight.thermalsCount && flight.thermalsCount > 0);

      const isExercise = flight.hasExercises === true ||
        (flight.type && (flight.type === FLIGHT_TYPES.EXERCISE || flight.type === 'both')) ||
        (flight.maneuversCount && flight.maneuversCount > 0);

      if (isThermal) {
        thermalSessions += 1;
      }
      if (isExercise) {
        exerciseSessions += 1;
      }
    }
  }

  // Flight Continuity & Currency:
  // Categorizes flight recency into 4 operational tiers based on days since last flight:
  // 1. NO_FLIGHTS: No flights in logbook -> 'Nessun volo' (Neutral)
  // 2. ACTIVE: Last flight within 35 days -> 'In attività' (Flyable/Green)
  // 3. REENTRY: Last flight between 36 and 90 days -> 'Ripresa graduale' (Caution/Amber)
  // 4. LAPSED: Last flight older than 90 days -> 'Fermo prolungato' (Alert/Orange)
  let daysSinceLastFlight = null;
  let currencyStatus = PILOT_CURRENCY_STATUS.NO_FLIGHTS;
  let currencyLabel = PILOT_CURRENCY_LABELS.no_flights;
  let currencyDescription = 'Nessun volo registrato nel libretto. Registra il primo volo o carica un file IGC.';
  let isCurrent = false;

  if (latestFlight !== null && isFinite(latestFlightTime)) {
    daysSinceLastFlight = Math.max(0, Math.floor((refTime - latestFlightTime) / (24 * 60 * 60 * 1000)));

    if (daysSinceLastFlight <= 35) {
      currencyStatus = PILOT_CURRENCY_STATUS.ACTIVE;
      currencyLabel = PILOT_CURRENCY_LABELS.active;
      isCurrent = true;
      const daysText = daysSinceLastFlight === 0 ? 'oggi' : `${daysSinceLastFlight} ${daysSinceLastFlight === 1 ? 'giorno' : 'giorni'} fa`;
      currencyDescription = `Ultimo volo effettuato ${daysText}. Continuità di volo ottimale.`;
    } else if (daysSinceLastFlight <= 90) {
      currencyStatus = PILOT_CURRENCY_STATUS.REENTRY;
      currencyLabel = PILOT_CURRENCY_LABELS.reentry;
      isCurrent = false;
      currencyDescription = `Ultimo volo effettuato ${daysSinceLastFlight} giorni fa. Consigliata ripresa con condizioni tranquille.`;
    } else {
      currencyStatus = PILOT_CURRENCY_STATUS.LAPSED;
      currencyLabel = PILOT_CURRENCY_LABELS.lapsed;
      isCurrent = false;
      currencyDescription = `Ultimo volo effettuato ${daysSinceLastFlight} giorni fa. Consigliata cautela, campetto di gonfiaggio o volo di ripresa.`;
    }
  }

  const totalHours = Number((totalMinutes / 60).toFixed(1));
  const formattedHours = totalHours >= 10 ? `${Math.round(totalHours)} h` : `${totalHours} h`;

  return {
    period,
    periodLabel: period === 'year' ? 'Ultimo Anno' : 'Ultimi 30 Giorni',
    totalMinutes,
    totalHours,
    formattedHours,
    thermalSessions,
    exerciseSessions,
    totalSessions: matchingFlightsCount,
    lastFlight: latestFlight,
    daysSinceLastFlight,
    isCurrent,
    currencyStatus,
    currencyLabel,
    currencyDescription
  };
}

/**
 * Validates, normalizes, and creates an immutable flight log entry.
 * Note: Does NOT force the user to classify the flight!
 * Activities are deduced from trackPoints or debriefing notes.
 * @param {Object} input - Raw flight entry input.
 * @returns {Object} Normalized flight object.
 */
export function createFlightLogEntry(input = {}) {
  const dateStr = (input.date && typeof input.date === 'string')
    ? input.date.trim().split('T')[0]
    : new Date().toISOString().split('T')[0];

  const siteStr = (input.site && typeof input.site === 'string')
    ? input.site.trim()
    : 'Località non specificata';

  const duration = Math.max(1, parseInt(input.durationMinutes, 10) || 30);
  const notesStr = (input.notes && typeof input.notes === 'string') ? input.notes.trim() : '';

  let hasThermals = false;
  let hasExercises = false;
  let thermalsCount = 0;
  let maneuversCount = 0;
  let detectedManeuvers = [];

  // Automated deduction if GPS track points are provided
  if (Array.isArray(input.trackPoints) && input.trackPoints.length > 5) {
    const deduced = deduceFlightActivitiesFromTrack(input.trackPoints);
    hasThermals = deduced.hasThermals;
    hasExercises = deduced.hasExercises;
    thermalsCount = deduced.thermalsCount;
    maneuversCount = deduced.maneuversCount;
    detectedManeuvers = deduced.detectedManeuvers;
  } else {
    // Smart deduction from notes/keywords (zero user prompt required)
    const lower = notesStr.toLowerCase();
    hasThermals = input.hasThermals === true ||
      lower.includes('termic') ||
      lower.includes('cross') ||
      lower.includes('veleggio') ||
      lower.includes('quota');

    hasExercises = input.hasExercises === true ||
      lower.includes('eserciz') ||
      lower.includes('manovr') ||
      lower.includes('360') ||
      lower.includes('orecchie') ||
      lower.includes('siv') ||
      lower.includes('wingover') ||
      lower.includes('beccheggio') ||
      lower.includes('rollio') ||
      lower.includes('discesa');

    // Also support input.type if provided programmatically
    if (input.type) {
      const normType = String(input.type).toLowerCase();
      if (normType.includes('thermal') || normType === 'both') hasThermals = true;
      if (normType.includes('exercise') || normType === 'both') hasExercises = true;
    }

    if (hasThermals) thermalsCount = 1;
    if (hasExercises) maneuversCount = 1;
  }

  // Deduce combined or primary activity label/type for display & compatibility
  let type = 'glide';
  if (hasThermals && hasExercises) {
    type = 'both';
  } else if (hasThermals) {
    type = 'thermal';
  } else if (hasExercises) {
    type = 'exercise';
  }

  const id = input.id || `fl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  return Object.freeze({
    id,
    date: dateStr,
    site: siteStr,
    durationMinutes: duration,
    hasThermals,
    hasExercises,
    thermalsCount,
    maneuversCount,
    detectedManeuvers: Object.freeze(detectedManeuvers),
    type,
    notes: notesStr
  });
}
