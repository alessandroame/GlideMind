/**
 * GlideMind - Comprensorio Locality & Dual Launch/Landing Evaluator (Headless Core)
 * 
 * Implements the Comprensorio-Centric paradigm (Comprensorio/Localita as root domain entity):
 * 1. Coordinates parsing and slugification for spots and landing fields
 * 2. Comprensorio normalization from raw JSON catalog
 * 3. Simultaneous evaluation of best takeoff (T_best) and safe landing (L_safe)
 * 4. Aerodynamic glide ratio cone calculation (E_richiesta = D / Delta_H)
 * 5. Explainability (reason string with physical meteorological context)
 * 6. Dynamic flyability sorting (Flyable/Aperto -> Caution/Cautela -> Unflyable/Chiuso)
 * 
 * ZERO DOM DEPENDENCIES: 100% testable in Node.js runtime.
 */

import { getFlyabilityScore, DEFAULT_GLIDER } from './flyability.js';
import { computeDistanceKm } from './geoSpatialMath.js';

/**
 * Parses coordinate strings in formats like "45.8332, 9.3020" or [lat, lon].
 * @param {string|number[]|{lat: number, lon: number}|null} coord
 * @returns {{ lat: number, lon: number } | null}
 */
export function parseCoordinates(coord) {
  if (!coord) return null;
  if (typeof coord === 'object' && typeof coord.lat === 'number' && typeof coord.lon === 'number') {
    return { lat: coord.lat, lon: coord.lon };
  }
  if (Array.isArray(coord) && coord.length >= 2) {
    const lat = Number(coord[0]);
    const lon = Number(coord[1]);
    if (!isNaN(lat) && !isNaN(lon)) return { lat, lon };
  }
  if (typeof coord === 'string') {
    const parts = coord.split(',').map(s => parseFloat(s.trim()));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { lat: parts[0], lon: parts[1] };
    }
  }
  return null;
}

/**
 * Generates a clean URL/state slug identifier for a comprensorio.
 * @param {string} locationName
 * @param {string} [provinceOrRegion='']
 * @returns {string}
 */
export function slugifyComprensorio(locationName, provinceOrRegion = '') {
  const combined = `${locationName} ${provinceOrRegion}`.toLowerCase();
  return combined
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Default curated set of top paragliding comprensori in Italy for immediate offline use.
 */
export const DEFAULT_COMPRENSORI = Object.freeze([
  {
    id: 'monte-cornizzolo-lc',
    name: 'Monte Cornizzolo',
    province: 'LC',
    region: 'Lombardia',
    location: 'Monte Cornizzolo (Suello - LC)',
    description: 'Centro nevralgico del volo libero in Lombardia con sede FIVL e navetta.',
    webcam: 'https://www.cornizzolo.com/webcam/',
    club: {
      name: 'Aero Club Monte Cornizzolo',
      radioFreq: '144.300 MHz'
    },
    takeoffs: [
      {
        id: 'cornizzolo-risparmio',
        name: 'Decollo Risparmio',
        coordinates: '45.833265, 9.302084',
        altitude: 1060,
        heading: 170,
        isPrimary: true,
        description: 'Decollo principale esposto a Sud con moquette e manica a vento.'
      },
      {
        id: 'cornizzolo-centrale',
        name: 'Decollo Centrale',
        coordinates: '45.834520, 9.290397',
        altitude: 1150,
        heading: 180,
        isPrimary: false,
        description: 'Decollo alto vicino al Rifugio Consigliere, ideale per partenze termiche.'
      }
    ],
    landings: [
      {
        id: 'suello-ufficiale',
        name: 'Atterraggio Ufficiale Suello',
        coordinates: '45.817209, 9.318668',
        altitude: 260,
        isPrimary: true,
        isOfficial: true,
        description: 'Grandissimo campo atterraggio attrezzato presso Cielo & Terra.'
      }
    ]
  },
  {
    id: 'meduno-monte-valinis-pn',
    name: 'Meduno',
    province: 'PN',
    region: 'Friuli-Venezia Giulia',
    location: 'Meduno / Monte Valinis (Toppo - PN)',
    description: 'Celebre rampa erbosa friulana con ampio atterraggio e forte termodinamica.',
    takeoffs: [
      {
        id: 'meduno-sommita',
        name: 'Decollo Monte Valinis',
        coordinates: '46.223889, 12.825278',
        altitude: 1050,
        heading: 190,
        isPrimary: true,
        description: 'Prato immenso, dislivello 770m, decollo facile e pulito.'
      }
    ],
    landings: [
      {
        id: 'meduno-atterraggio',
        name: 'Atterraggio Meduno',
        coordinates: '46.208889, 12.802778',
        altitude: 280,
        isPrimary: true,
        isOfficial: true,
        description: 'Ampio prato pianeggiante a fondo valle.'
      }
    ]
  },
  {
    id: 'calascio-rocca-aq',
    name: 'Rocca Calascio',
    province: 'AQ',
    region: 'Abruzzo',
    location: 'Calascio / Rocca Calascio (Calascio - AQ)',
    description: 'Scenario cinematografico nel Parco Nazionale del Gran Sasso.',
    takeoffs: [
      {
        id: 'calascio-rocca',
        name: 'Decollo Rocca Calascio',
        coordinates: '42.331000, 13.688000',
        altitude: 1450,
        heading: 180,
        isPrimary: true,
        description: 'Decollo spettacolare erboso esposto a Sud sulla Maiella.'
      }
    ],
    landings: [
      {
        id: 'calascio-campo-fossa',
        name: 'Atterraggio Campo di Fossa',
        coordinates: '42.315000, 13.695000',
        altitude: 1100,
        isPrimary: true,
        isOfficial: true,
        description: 'Ampio prato atterraggio a fondo valle.'
      }
    ]
  },
  {
    id: 'bassano-borso-del-grappa-tv',
    name: 'Bassano del Grappa',
    province: 'TV',
    region: 'Veneto',
    location: 'Bassano / Borso del Grappa (Borso - TV)',
    description: 'Capitale europea del volo invernale e primaverile pedemontano.',
    takeoffs: [
      {
        id: 'bassano-costalunga',
        name: 'Decollo Col Campeggia / Costalunga',
        coordinates: '45.834400, 11.758200',
        altitude: 750,
        heading: 170,
        isPrimary: true,
        description: 'Decollo sud riparato dalla Valsugana.'
      }
    ],
    landings: [
      {
        id: 'bassano-garden-relass',
        name: 'Atterraggio Garden Relais',
        coordinates: '45.812200, 11.776600',
        altitude: 190,
        isPrimary: true,
        isOfficial: true,
        description: 'Atterraggio ufficiale con club house e maniche a vento.'
      }
    ]
  }
]);

/**
 * Normalizes raw location JSON into structured Comprensorio instances.
 * @param {object} rawJson
 * @returns {Array<object>}
 */
export function normalizeLocationsCatalog(rawJson) {
  if (!rawJson || typeof rawJson !== 'object') {
    return [...DEFAULT_COMPRENSORI];
  }

  const results = [];
  const countries = Object.keys(rawJson);

  for (const countryCode of countries) {
    const regions = rawJson[countryCode];
    if (!regions || typeof regions !== 'object') continue;

    for (const regionName of Object.keys(regions)) {
      const localities = regions[regionName];
      if (!Array.isArray(localities)) continue;

      for (const loc of localities) {
        if (!loc || !loc.location) continue;

        // Extract province code from location string if present e.g. "(Suello - LC)"
        const provMatch = loc.location.match(/\b([A-Z]{2})\)$/);
        const province = provMatch ? provMatch[1] : '';
        const id = loc.id || slugifyComprensorio(loc.location, province);

        const takeoffs = (loc.takeoffs || []).map((t, idx) => ({
          id: t.id || `${id}-takeoff-${idx + 1}`,
          name: t.name || `Decollo ${idx + 1}`,
          coordinates: t.coordinates || null,
          altitude: Number(t.altitude) || 0,
          heading: typeof t.heading === 'number' ? t.heading : null,
          isPrimary: t.isPrimary !== undefined ? Boolean(t.isPrimary) : (idx === 0),
          description: t.description || '',
          hazards: t.hazards || ''
        }));

        const landings = (loc.landings || []).map((l, idx) => ({
          id: l.id || `${id}-landing-${idx + 1}`,
          name: l.name || `Atterraggio ${idx + 1}`,
          coordinates: l.coordinates || null,
          altitude: Number(l.altitude) || 0,
          isPrimary: l.isPrimary !== undefined ? Boolean(l.isPrimary) : (idx === 0),
          isOfficial: Boolean(l.isOfficial || (l.name && l.name.toLowerCase().includes('ufficiale'))),
          description: l.description || '',
          hazards: l.hazards || '',
          rules: l.rules || ''
        }));

        results.push({
          id,
          name: loc.location.replace(/\s*\([^)]*\)$/, ''),
          province,
          region: regionName,
          country: countryCode,
          location: loc.location,
          description: loc.description || '',
          webcam: loc.webcam || null,
          club: loc.club || null,
          takeoffs,
          landings
        });
      }
    }
  }

  return results.length > 0 ? results : [...DEFAULT_COMPRENSORI];
}

/**
 * Calculates aerodynamic glide ratio required between takeoff and landing:
 * E_richiesta = Distance / Delta_Altitude
 * @param {object} takeoff
 * @param {object} landing
 * @returns {{ distanceMeters: number, deltaAltitudeMeters: number, requiredGlideRatio: number, isSafe: boolean }}
 */
export function calculateGlideToLanding(takeoff, landing, glider = null) {
  const activeGlider = glider || DEFAULT_GLIDER;
  const tCoord = parseCoordinates(takeoff.coordinates);
  const lCoord = parseCoordinates(landing.coordinates);

  if (!tCoord || !lCoord) {
    return {
      distanceMeters: 0,
      deltaAltitudeMeters: Math.max(1, (takeoff.altitude || 1000) - (landing.altitude || 300)),
      requiredGlideRatio: 5.0,
      isSafe: true
    };
  }

  const distanceKm = computeDistanceKm(tCoord.lat, tCoord.lon, lCoord.lat, lCoord.lon);
  const distanceMeters = Math.round(distanceKm * 1000);
  const tAlt = Number(takeoff.altitude) || 1000;
  const lAlt = Number(landing.altitude) || 300;
  const deltaAltitudeMeters = Math.max(10, tAlt - lAlt);

  const requiredGlideRatio = Math.round((distanceMeters / deltaAltitudeMeters) * 10) / 10;

  // Safe conservative glide limit based on glider class (proxy for pilot envelope)
  // EN-A: safe limit 5.5:1; EN-B: 6.5:1; EN-C: 7.5:1; EN-D: 8.5:1
  let safeLimit = 6.0;
  if (activeGlider.category === 'EN-A') safeLimit = 5.5;
  else if (activeGlider.category === 'EN-B') safeLimit = 6.5;
  else if (activeGlider.category === 'EN-C') safeLimit = 7.5;
  else if (activeGlider.category === 'EN-D') safeLimit = 8.5;

  const isSafe = requiredGlideRatio <= safeLimit;

  return {
    distanceMeters,
    deltaAltitudeMeters,
    requiredGlideRatio,
    safeLimit,
    isSafe
  };
}

/**
 * Evaluates full paragliding flyability for an entire Comprensorio,
 * aggregating best takeoff (T_best) and return landing safety (L_safe).
 * 
 * @param {object} params
 * @param {object} params.comprensorio - Comprensorio object with takeoffs and landings
 * @param {object|null} [params.weatherData] - Weather payload from Open-Meteo or synthetic weather
 * @param {number} [params.hourIndex=14] - Hour index of day to evaluate (default 14:00 thermal window)
 * @param {object|null} [params.glider=null] - Active glider from store / hangar
 * @returns {object} Evaluated comprensorio with verdict, score, T_best, L_safe, explainability
 */
export function evaluateComprensorio({
  comprensorio,
  weatherData = null,
  hourIndex = 14,
  glider = null
}) {
  const activeGlider = glider || DEFAULT_GLIDER;
  const takeoffs = comprensorio.takeoffs || [];
  const landings = comprensorio.landings || [];

  // Default synthetic values if weatherData not provided
  let windSpeed = 12;
  let windGust = 18;
  let windDir = 180;
  let cape = 150;
  let turbulence = 0.12;
  let rain = 0;
  let temp = 22;

  if (weatherData && weatherData.hourly) {
    const h = weatherData.hourly;
    const idx = Math.min(Math.max(0, hourIndex), (h.time?.length || 1) - 1);
    const rawSpeed = h.windspeed_10m ?? h.wind_speed_10m;
    if (rawSpeed && rawSpeed[idx] != null) windSpeed = Number(rawSpeed[idx]);
    const rawGust = h.windgusts_10m ?? h.wind_gusts_10m;
    if (rawGust && rawGust[idx] != null) windGust = Number(rawGust[idx]);
    const rawDir = h.winddirection_10m ?? h.wind_direction_10m;
    if (rawDir && rawDir[idx] != null) windDir = Number(rawDir[idx]);
    if (h.cape && h.cape[idx] != null) cape = Number(h.cape[idx]);
    if (h.turbulence_edr && h.turbulence_edr[idx] != null) turbulence = Number(h.turbulence_edr[idx]);
    if (h.precipitation && h.precipitation[idx] != null) rain = Number(h.precipitation[idx]);
    if (h.temperature_2m && h.temperature_2m[idx] != null) temp = Number(h.temperature_2m[idx]);
  }

  // 1. Evaluate all takeoffs in this comprensorio
  const evaluatedTakeoffs = takeoffs.map(t => {
    const heading = typeof t.heading === 'number' ? t.heading : null;
    const flyScore = getFlyabilityScore(
      windSpeed,
      windGust,
      cape,
      turbulence,
      rain,
      windDir,
      heading,
      true, // isTakeoff
      activeGlider
    );

    // Compute numerical score: 100 base, penalize severity and crosswind
    let score = 100;
    if (flyScore.severity >= 2) score = 15;
    else if (flyScore.severity === 1) score = 55;
    else score = 90;

    return {
      takeoff: t,
      heading,
      flyScore,
      severity: flyScore.severity,
      score,
      statusText: flyScore.text,
      color: flyScore.color
    };
  });

  // 2. Select Single Takeoff via "Ibrido con Override Meteo"
  // Default to primary takeoff (isPrimary: true, or first)
  const primaryTakeoffEval = evaluatedTakeoffs.find(e => e.takeoff.isPrimary) || evaluatedTakeoffs[0] || null;
  
  let selectedTakeoffEval = primaryTakeoffEval;
  let isTakeoffOverridden = false;
  let takeoffOverrideReason = null;

  if (primaryTakeoffEval && primaryTakeoffEval.severity > 0) {
    // If primary is not optimal, look for an alternative with strictly lower severity or better flyability
    const alternatives = [...evaluatedTakeoffs]
      .filter(e => e !== primaryTakeoffEval)
      .sort((a, b) => {
        if (a.severity !== b.severity) return a.severity - b.severity;
        return b.score - a.score;
      });

    const bestAlt = alternatives[0];
    if (bestAlt && bestAlt.severity < primaryTakeoffEval.severity) {
      selectedTakeoffEval = bestAlt;
      isTakeoffOverridden = true;
      takeoffOverrideReason = `Decollo alternativo ${bestAlt.takeoff.name}: ${primaryTakeoffEval.takeoff.name} non favorevole (${primaryTakeoffEval.statusText})`;
    }
  }

  const selectedTakeoff = selectedTakeoffEval ? selectedTakeoffEval.takeoff : null;

  // 3. Evaluate Landings from the selected takeoff (Default to primary/official landing)
  let safeLanding = null;
  let glideMetrics = null;
  let isLandingOverridden = false;

  if (selectedTakeoff && landings.length > 0) {
    const evaluatedLandings = landings.map(l => {
      const g = calculateGlideToLanding(selectedTakeoff, l, activeGlider);
      return {
        landing: l,
        isPrimary: Boolean(l.isPrimary || l.isOfficial),
        glide: g
      };
    });

    const primaryLandingEval = evaluatedLandings.find(e => e.isPrimary) || evaluatedLandings[0];

    if (primaryLandingEval && primaryLandingEval.glide.isSafe) {
      safeLanding = primaryLandingEval.landing;
      glideMetrics = primaryLandingEval.glide;
    } else {
      // Look for a safe alternative with lowest required glide ratio
      const safeAlternatives = evaluatedLandings
        .filter(e => e.glide.isSafe)
        .sort((a, b) => a.glide.requiredGlideRatio - b.glide.requiredGlideRatio);

      if (safeAlternatives.length > 0) {
        safeLanding = safeAlternatives[0].landing;
        glideMetrics = safeAlternatives[0].glide;
        isLandingOverridden = safeLanding !== primaryLandingEval?.landing;
      } else {
        safeLanding = primaryLandingEval ? primaryLandingEval.landing : evaluatedLandings[0].landing;
        glideMetrics = primaryLandingEval ? primaryLandingEval.glide : evaluatedLandings[0].glide;
      }
    }
  }

  // 4. Overall Comprensorio Verdict & Explainability
  let status = 'flyable'; // 'flyable' | 'caution' | 'unflyable'
  let badge = 'Aperto';
  let badgeColor = 'var(--gm-status-flyable)';
  let badgeBg = 'var(--gm-status-flyable-bg)';
  let overallScore = selectedTakeoffEval ? selectedTakeoffEval.score : 50;
  let reason = '';

  if (!selectedTakeoffEval || selectedTakeoffEval.severity >= 2) {
    status = 'unflyable';
    badge = 'Chiuso';
    badgeColor = 'var(--gm-status-unflyable)';
    badgeBg = 'var(--gm-status-unflyable-bg)';
    overallScore = Math.min(overallScore, 20);
    reason = selectedTakeoffEval ? selectedTakeoffEval.statusText : 'Nessun decollo praticabile';
  } else if (selectedTakeoffEval.severity === 1 || (glideMetrics && !glideMetrics.isSafe)) {
    status = 'caution';
    badge = 'Cautela';
    badgeColor = 'var(--gm-status-caution)';
    badgeBg = 'var(--gm-status-caution-bg)';
    overallScore = Math.min(overallScore, 65);
    if (!glideMetrics || glideMetrics.isSafe) {
      reason = isTakeoffOverridden
        ? `Alt. ${selectedTakeoff.name}: ${selectedTakeoffEval.statusText}`
        : selectedTakeoffEval.statusText;
    } else {
      reason = `Rientro critico: efficienza richiesta 1:${glideMetrics.requiredGlideRatio} > 1:${glideMetrics.safeLimit}`;
    }
  } else {
    status = 'flyable';
    badge = 'Aperto';
    badgeColor = 'var(--gm-status-flyable)';
    badgeBg = 'var(--gm-status-flyable-bg)';
    if (isTakeoffOverridden) {
      reason = `Alt. ${selectedTakeoff.name}: vento in asse (${primaryTakeoffEval.takeoff.name} non volabile)`;
    } else {
      reason = `Vento ${Math.round(windSpeed)} km/h da ${windDir}° in asse col decollo`;
    }
  }

  return {
    comprensorioId: comprensorio.id,
    name: comprensorio.name || comprensorio.location,
    province: comprensorio.province || '',
    region: comprensorio.region || '',
    location: comprensorio.location,
    description: comprensorio.description || '',
    webcam: comprensorio.webcam || null,
    status,
    badge,
    badgeColor,
    badgeBg,
    score: overallScore,
    reason,
    // Unico Binomio (1 Decollo + 1 Atterraggio)
    takeoff: selectedTakeoff,
    landing: safeLanding,
    bestTakeoff: selectedTakeoff,
    bestTakeoffEval: selectedTakeoffEval,
    safeLanding,
    isTakeoffPrimary: Boolean(selectedTakeoff?.isPrimary),
    isLandingPrimary: Boolean(safeLanding?.isPrimary || safeLanding?.isOfficial),
    isTakeoffOverridden,
    isLandingOverridden,
    takeoffOverrideReason,
    primaryTakeoff: primaryTakeoffEval ? primaryTakeoffEval.takeoff : null,
    glideMetrics,
    takeoffs: evaluatedTakeoffs,
    landings,
    weatherSnapshot: {
      windSpeed: Math.round(windSpeed),
      windGust: Math.round(windGust),
      windDir: Math.round(windDir),
      temp: Math.round(temp),
      cape: Math.round(cape),
      rain
    }
  };
}

/**
 * Sorts an array of evaluated comprensori by flyability descending:
 * Flyable (Aperto) -> Caution (Cautela) -> Unflyable (Chiuso), with score and name tie-breakers.
 * 
 * @param {Array<object>} evaluatedList
 * @returns {Array<object>}
 */
export function sortEvaluatedComprensori(evaluatedList) {
  if (!Array.isArray(evaluatedList)) return [];

  const statusPriority = {
    flyable: 0,
    caution: 1,
    unflyable: 2
  };

  return [...evaluatedList].sort((a, b) => {
    const prioA = statusPriority[a.status] ?? 99;
    const prioB = statusPriority[b.status] ?? 99;

    if (prioA !== prioB) return prioA - prioB;
    if (b.score !== a.score) return b.score - a.score;
    return (a.name || '').localeCompare(b.name || '');
  });
}
