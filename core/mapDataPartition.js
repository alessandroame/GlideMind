/**
 * GlideMind - Map Data Partitioning & Geospatial Filtering (Headless Core)
 * 
 * Manages macro-region partitioning, distance filtering, entity-centric cache diffs,
 * and top-spot selection for the Map View.
 * 
 * ZERO DOM DEPENDENCIES: 100% testable in Node.js runtime.
 */

import { computeDistanceKm } from './geoSpatialMath.js';
import { parseCoordinates } from './comprensorio.js';

export const MACRO_REGIONS = Object.freeze({
  NORTH_WEST: Object.freeze({
    id: 'north-west',
    name: 'Nord-Ovest',
    regions: Object.freeze(['Piemonte', "Valle d'Aosta", 'Liguria', 'Lombardia']),
    defaultCenter: Object.freeze({ lat: 45.4, lon: 8.0 }),
    defaultZoom: 7
  }),
  NORTH_EAST: Object.freeze({
    id: 'north-east',
    name: 'Nord-Est',
    regions: Object.freeze(['Trentino-Alto Adige', 'Veneto', 'Friuli-Venezia Giulia']),
    defaultCenter: Object.freeze({ lat: 46.1, lon: 11.8 }),
    defaultZoom: 7
  }),
  CENTRE: Object.freeze({
    id: 'centre',
    name: 'Centro',
    regions: Object.freeze(['Toscana', 'Umbria', 'Marche', 'Lazio', 'Abruzzo', 'Molise', 'Emilia-Romagna']),
    defaultCenter: Object.freeze({ lat: 43.0, lon: 12.5 }),
    defaultZoom: 7
  }),
  SOUTH_ISLANDS: Object.freeze({
    id: 'south-islands',
    name: 'Sud & Isole',
    regions: Object.freeze(['Campania', 'Puglia', 'Basilicata', 'Calabria', 'Sicilia', 'Sardegna']),
    defaultCenter: Object.freeze({ lat: 39.5, lon: 16.0 }),
    defaultZoom: 6
  }),
  ALL: Object.freeze({
    id: 'all',
    name: 'Tutta Italia',
    regions: Object.freeze([]),
    defaultCenter: Object.freeze({ lat: 42.5, lon: 12.5 }),
    defaultZoom: 6
  })
});

export const DEFAULT_MACRO_REGION = 'north-west';

/**
 * Extracts normalized geographic coordinates from a comprensorio's primary takeoff.
 * @param {object} comprensorio
 * @returns {{ lat: number, lon: number } | null}
 */
export function getComprensorioCoordinates(comprensorio) {
  if (!comprensorio) return null;
  const takeoffs = comprensorio.takeoffs || [];
  const primaryTakeoff = takeoffs.find(t => t.isPrimary) || takeoffs[0];
  if (!primaryTakeoff || !primaryTakeoff.coordinates) return null;
  return parseCoordinates(primaryTakeoff.coordinates);
}

/**
 * Filters a comprensori catalog by macro-region identifier.
 * @param {Array<object>} catalog
 * @param {string} [macroRegionId='north-west']
 * @returns {Array<object>}
 */
export function filterComprensoriByMacroRegion(catalog, macroRegionId = DEFAULT_MACRO_REGION) {
  if (!Array.isArray(catalog)) return [];
  if (macroRegionId === 'all') return [...catalog];

  const regionEntry = Object.values(MACRO_REGIONS).find(r => r.id === macroRegionId);
  if (!regionEntry || regionEntry.regions.length === 0) {
    return [...catalog];
  }

  const allowedRegions = regionEntry.regions;
  return catalog.filter(spot => {
    if (!spot || !spot.region) return false;
    return allowedRegions.some(reg => reg.toLowerCase() === spot.region.toLowerCase());
  });
}

/**
 * Filters comprensori within a given radius in kilometers from a center point.
 * @param {Array<object>} catalog
 * @param {{ lat: number, lon: number }} centerCoords
 * @param {number} radiusKm
 * @returns {Array<{ spot: object, distanceKm: number }>} Sorted ascending by distance
 */
export function filterComprensoriByRadius(catalog, centerCoords, radiusKm) {
  if (!Array.isArray(catalog) || !centerCoords || typeof centerCoords.lat !== 'number' || typeof centerCoords.lon !== 'number') {
    return [];
  }
  const maxR = Math.max(0, Number(radiusKm) || 100);

  const results = [];
  for (const spot of catalog) {
    const coords = getComprensorioCoordinates(spot);
    if (!coords) continue;

    const dist = computeDistanceKm(centerCoords.lat, centerCoords.lon, coords.lat, coords.lon);
    if (dist <= maxR) {
      results.push({
        spot,
        distanceKm: Math.round(dist * 10) / 10
      });
    }
  }

  results.sort((a, b) => a.distanceKm - b.distanceKm);
  return results;
}

/**
 * Computes missing spot IDs via set difference (SpotsInRegion \ SpotsInCache).
 * @param {Array<object>} spots
 * @param {Map<string, object>|Record<string, object>} cachedSpotMap
 * @param {number} [maxCacheAgeMs=1800000] 30 minutes TTL
 * @returns {Array<object>} Array of spots needing weather fetch
 */
export function getMissingSpots(spots, cachedSpotMap, maxCacheAgeMs = 1800000) {
  if (!Array.isArray(spots)) return [];
  const now = Date.now();

  return spots.filter(spot => {
    if (!spot || !spot.id) return false;
    let cached = null;
    if (cachedSpotMap instanceof Map) {
      cached = cachedSpotMap.get(spot.id);
    } else if (cachedSpotMap && typeof cachedSpotMap === 'object') {
      cached = cachedSpotMap[spot.id];
    }

    if (!cached) return true;
    if (typeof cached.fetchedAt === 'number' && (now - cached.fetchedAt) > maxCacheAgeMs) {
      return true; // Expired cache
    }
    return false;
  });
}

/**
 * Determines the single top flyable spot from an array of evaluated comprensori.
 * Prioritizes:
 * 1. Lowest severity (0 = flyable, 1 = caution, 2 = unflyable)
 * 2. Highest score (numerical 0-100)
 * 3. Most safe glide ratio
 * @param {Array<object>} evaluatedSpots
 * @returns {object | null}
 */
export function findTopFlyableSpot(evaluatedSpots) {
  if (!Array.isArray(evaluatedSpots) || evaluatedSpots.length === 0) {
    return null;
  }

  const sorted = [...evaluatedSpots].sort((a, b) => {
    const sevA = typeof a.severity === 'number' ? a.severity : 99;
    const sevB = typeof b.severity === 'number' ? b.severity : 99;
    if (sevA !== sevB) {
      return sevA - sevB; // Lower severity is better
    }
    const scoreA = typeof a.score === 'number' ? a.score : 0;
    const scoreB = typeof b.score === 'number' ? b.score : 0;
    return scoreB - scoreA; // Higher score is better
  });

  return sorted[0] || null;
}
