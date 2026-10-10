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
  ALL: Object.freeze({
    id: 'all',
    name: 'Tutta Europa',
    regions: Object.freeze([]),
    countries: Object.freeze([]),
    isSubdivision: false,
    defaultCenter: Object.freeze({ lat: 46.2, lon: 11.0 }),
    defaultZoom: 5
  }),
  NORTH_WEST: Object.freeze({
    id: 'north-west',
    name: 'Nord-Ovest (IT)',
    regions: Object.freeze(['Piemonte', "Valle d'Aosta", 'Liguria', 'Lombardia']),
    countries: Object.freeze(['IT']),
    isSubdivision: true,
    defaultCenter: Object.freeze({ lat: 45.4, lon: 8.0 }),
    defaultZoom: 7
  }),
  NORTH_EAST: Object.freeze({
    id: 'north-east',
    name: 'Nord-Est (IT)',
    regions: Object.freeze(['Trentino-Alto Adige', 'Veneto', 'Friuli-Venezia Giulia']),
    countries: Object.freeze(['IT']),
    isSubdivision: true,
    defaultCenter: Object.freeze({ lat: 46.1, lon: 11.8 }),
    defaultZoom: 7
  }),
  CENTRE: Object.freeze({
    id: 'centre',
    name: 'Centro (IT)',
    regions: Object.freeze(['Toscana', 'Umbria', 'Marche', 'Lazio', 'Abruzzo', 'Molise', 'Emilia-Romagna']),
    countries: Object.freeze(['IT']),
    isSubdivision: true,
    defaultCenter: Object.freeze({ lat: 43.0, lon: 12.5 }),
    defaultZoom: 7
  }),
  SOUTH_ISLANDS: Object.freeze({
    id: 'south-islands',
    name: 'Sud & Isole (IT)',
    regions: Object.freeze(['Campania', 'Puglia', 'Basilicata', 'Calabria', 'Sicilia', 'Sardegna']),
    countries: Object.freeze(['IT']),
    isSubdivision: true,
    defaultCenter: Object.freeze({ lat: 39.5, lon: 16.0 }),
    defaultZoom: 6
  }),
  ALPS_WEST: Object.freeze({
    id: 'alps-west',
    name: 'Francia & Alpi Ovest (FR/CH)',
    regions: Object.freeze(['Corse', 'Auvergne-Rhône-Alpes', "Provence-Alpes-Côte d'Azur", 'Occitanie', 'Valais', 'Vaud', 'Geneve']),
    countries: Object.freeze(['FR', 'CH']),
    isSubdivision: false,
    defaultCenter: Object.freeze({ lat: 45.5, lon: 6.5 }),
    defaultZoom: 7
  }),
  ALPS_EAST: Object.freeze({
    id: 'alps-east',
    name: 'Austria, Slovenia & Balcani (AT/SI/HR)',
    regions: Object.freeze(['Tirol', 'Salzburg', 'Kärnten', 'Goriška', 'Gorenjska', 'Osrednjeslovenska', 'Istarska županija', 'Primorsko-goranska županija']),
    countries: Object.freeze(['AT', 'SI', 'HR', 'DE']),
    isSubdivision: false,
    defaultCenter: Object.freeze({ lat: 46.2, lon: 14.2 }),
    defaultZoom: 7
  })
});

export const DEFAULT_MACRO_REGION = 'all';

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
 * @param {string} [macroRegionId='all']
 * @returns {Array<object>}
 */
export function filterComprensoriByMacroRegion(catalog, macroRegionId = DEFAULT_MACRO_REGION) {
  if (!Array.isArray(catalog)) return [];
  if (macroRegionId === 'all') return [...catalog];

  const regionEntry = Object.values(MACRO_REGIONS).find(r => r.id === macroRegionId);
  if (!regionEntry) {
    return [...catalog];
  }

  const allowedRegions = (regionEntry.regions || []).map(r => r.toLowerCase());
  const allowedCountries = (regionEntry.countries || []).map(c => c.toUpperCase());

  return catalog.filter(spot => {
    if (!spot) return false;

    // Check region match (case-insensitive)
    if (spot.region && allowedRegions.some(reg => reg === spot.region.toLowerCase())) {
      return true;
    }

    // For non-subdivision regions (e.g. international entries), match by country if region not explicitly matched
    if (!regionEntry.isSubdivision && allowedCountries.length > 0 && spot.country) {
      if (allowedCountries.includes(spot.country.toUpperCase())) {
        return true;
      }
    }

    return false;
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
 * Normalizes a bounding box from Leaflet LatLngBounds, an object, or an array into a clean { south, west, north, east }.
 * Supports margin expansion (e.g. marginRatio = 0.05 for 5% outer buffer).
 * @param {object|number[]} rawBbox
 * @param {number} [marginRatio=0]
 * @returns {{ south: number, west: number, north: number, east: number } | null}
 */
export function normalizeBoundingBox(rawBbox, marginRatio = 0) {
  if (!rawBbox) return null;
  let south, west, north, east;

  // Leaflet LatLngBounds object support: getSouth(), getWest(), getNorth(), getEast()
  if (typeof rawBbox.getSouth === 'function') {
    south = rawBbox.getSouth();
    west = rawBbox.getWest();
    north = rawBbox.getNorth();
    east = rawBbox.getEast();
  } else if (Array.isArray(rawBbox) && rawBbox.length >= 4) {
    [south, west, north, east] = rawBbox.map(Number);
  } else if (typeof rawBbox === 'object') {
    south = Number(rawBbox.south ?? rawBbox.minLat ?? rawBbox.latMin);
    west = Number(rawBbox.west ?? rawBbox.minLon ?? rawBbox.lonMin);
    north = Number(rawBbox.north ?? rawBbox.maxLat ?? rawBbox.latMax);
    east = Number(rawBbox.east ?? rawBbox.maxLon ?? rawBbox.lonMax);
  }

  if (isNaN(south) || isNaN(west) || isNaN(north) || isNaN(east)) {
    return null;
  }

  // Ensure south <= north
  if (south > north) {
    const tmp = south;
    south = north;
    north = tmp;
  }

  // Apply margin expansion if requested
  if (marginRatio > 0) {
    const latSpan = north - south;
    const lonSpan = Math.abs(east - west);
    south -= latSpan * marginRatio;
    north += latSpan * marginRatio;
    west -= lonSpan * marginRatio;
    east += lonSpan * marginRatio;
  }

  return { south, west, north, east };
}

/**
 * Filters a comprensori catalog by a spatial geographic bounding box.
 * Operates purely headless in O(N) time with zero DOM dependencies.
 * @param {Array<object>} catalog
 * @param {object|number[]} bbox
 * @param {object} [options]
 * @param {number} [options.marginRatio=0.05] 5% buffer around viewport
 * @param {number} [options.maxSpots=150] Safety cap on visible spots
 * @returns {Array<object>}
 */
export function filterComprensoriByBoundingBox(catalog, bbox, { marginRatio = 0.05, maxSpots = 150 } = {}) {
  if (!Array.isArray(catalog)) return [];
  const normBbox = normalizeBoundingBox(bbox, marginRatio);
  if (!normBbox) return [...catalog];

  const { south, west, north, east } = normBbox;
  const filtered = [];

  for (const spot of catalog) {
    const coords = getComprensorioCoordinates(spot);
    if (!coords) continue;

    const inLat = coords.lat >= south && coords.lat <= north;
    let inLon = false;

    // Handle standard longitude and antimeridian wrapping
    if (west <= east) {
      inLon = coords.lon >= west && coords.lon <= east;
    } else {
      // Crosses 180° / -180° antimeridian
      inLon = coords.lon >= west || coords.lon <= east;
    }

    if (inLat && inLon) {
      filtered.push(spot);
    }
  }

  if (typeof maxSpots === 'number' && maxSpots > 0 && filtered.length > maxSpots) {
    return filtered
      .sort((a, b) => (b.reliability || 0) - (a.reliability || 0))
      .slice(0, maxSpots);
  }

  return filtered;
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

/**
 * Clusters a list of evaluated comprensori by geographic proximity for macro zoom levels (< 7.5).
 * Pure headless function with zero DOM dependencies.
 * 
 * @param {Array<object>} evaluatedSpots
 * @param {number} [zoomLevel=7]
 * @param {object} [options]
 * @param {number} [options.clusterThresholdZoom=7.5] Zoom below which clustering is active
 * @param {number} [options.clusterRadiusKm] Custom cluster radius
 * @returns {Array<object>} Array containing individual spots and/or cluster objects
 */
export function clusterComprensori(evaluatedSpots, zoomLevel = 7, options = {}) {
  if (!Array.isArray(evaluatedSpots) || evaluatedSpots.length <= 1) {
    return Array.isArray(evaluatedSpots) ? [...evaluatedSpots] : [];
  }

  const thresholdZoom = options.clusterThresholdZoom ?? 7.5;
  if (zoomLevel >= thresholdZoom) {
    return [...evaluatedSpots];
  }

  // Radius in kilometers for clustering based on zoom level:
  // zoom 4 -> ~160km, zoom 5 -> ~90km, zoom 6 -> ~50km, zoom 7 -> ~25km
  const clusterRadiusKm = options.clusterRadiusKm || Math.max(20, Math.round(500 / Math.pow(2, zoomLevel - 3)));

  const clusters = [];
  const assigned = new Set();

  for (let i = 0; i < evaluatedSpots.length; i++) {
    if (assigned.has(i)) continue;

    const spotA = evaluatedSpots[i];
    const coordsA = getComprensorioCoordinates(spotA.comprensorio || spotA);
    if (!coordsA) {
      clusters.push(spotA);
      continue;
    }

    const currentClusterSpots = [spotA];
    assigned.add(i);

    let sumLat = coordsA.lat;
    let sumLon = coordsA.lon;
    let minLat = coordsA.lat;
    let maxLat = coordsA.lat;
    let minLon = coordsA.lon;
    let maxLon = coordsA.lon;

    for (let j = i + 1; j < evaluatedSpots.length; j++) {
      if (assigned.has(j)) continue;

      const spotB = evaluatedSpots[j];
      const coordsB = getComprensorioCoordinates(spotB.comprensorio || spotB);
      if (!coordsB) continue;

      const dist = computeDistanceKm(coordsA.lat, coordsA.lon, coordsB.lat, coordsB.lon);
      if (dist <= clusterRadiusKm) {
        currentClusterSpots.push(spotB);
        assigned.add(j);
        sumLat += coordsB.lat;
        sumLon += coordsB.lon;
        minLat = Math.min(minLat, coordsB.lat);
        maxLat = Math.max(maxLat, coordsB.lat);
        minLon = Math.min(minLon, coordsB.lon);
        maxLon = Math.max(maxLon, coordsB.lon);
      }
    }

    if (currentClusterSpots.length === 1) {
      clusters.push(spotA);
    } else {
      let bestStatus = 'unflyable';
      let minSeverity = 99;
      let topSpot = currentClusterSpots[0];

      let flyableCount = 0;
      let cautionCount = 0;
      let unflyableCount = 0;

      for (const s of currentClusterSpots) {
        const stat = s.status || 'unavailable';
        if (stat === 'flyable') flyableCount++;
        else if (stat === 'caution') cautionCount++;
        else unflyableCount++;

        const severity = typeof s.severity === 'number' ? s.severity : (stat === 'flyable' ? 0 : (stat === 'caution' ? 1 : 2));
        if (severity < minSeverity) {
          minSeverity = severity;
          bestStatus = stat;
          topSpot = s;
        }
      }

      clusters.push({
        isCluster: true,
        id: `cluster-${i}-${currentClusterSpots.length}`,
        name: `Area ${topSpot.name || topSpot.comprensorio?.name || 'Volo'} (+${currentClusterSpots.length - 1})`,
        count: currentClusterSpots.length,
        coordinates: {
          lat: sumLat / currentClusterSpots.length,
          lon: sumLon / currentClusterSpots.length
        },
        bounds: {
          south: minLat - 0.05,
          west: minLon - 0.05,
          north: maxLat + 0.05,
          east: maxLon + 0.05
        },
        spots: currentClusterSpots,
        status: bestStatus,
        severity: minSeverity,
        flyableCount,
        cautionCount,
        unflyableCount,
        topSpot
      });
    }
  }

  return clusters;
}
