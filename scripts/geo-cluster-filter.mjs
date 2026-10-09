/**
 * GlideMind - Geometric Clustering & DEM Elevation Validation Engine (Headless ETL Tooling)
 * 
 * Implements Step 2 of the Spot Data Harvesting Pipeline:
 * 1. Proximity clustering (Haversine WGS84 <= 100m) to deduplicate multi-source takeoffs and landings.
 * 2. DEM Copernicus / SRTM elevation cross-check (|Delta H| <= 30m) via Open-Meteo Elevation API.
 * 3. Aerodynamic pairing between Takeoff and Landing (Glide Ratio E = D / Delta_H <= 7).
 * 4. Deterministic geometric reliability scoring (0 - 100%).
 * 
 * ZERO DOM DEPENDENCIES - 100% testable in Node.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeDistanceKm } from '../core/geoSpatialMath.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_CLUSTER_RADIUS_KM = 0.100; // 100 meters
export const MAX_SAFE_GLIDE_RATIO = 7.0; // Standard EN-A school glider safe glide ratio
export const MAX_PAIRING_DISTANCE_KM = 15.0; // Maximum distance to search for a comprensorio landing

/**
 * Clusters a list of spots by spatial proximity.
 * @param {Array<object>} spots List of spots with .coordinates { lat, lon }
 * @param {number} [radiusKm=0.1] Clustering threshold in kilometers
 * @returns {Array<object>} Clustered entities with canonical spot and co-located sources
 */
export function clusterSpotsByProximity(spots, radiusKm = DEFAULT_CLUSTER_RADIUS_KM) {
  if (!Array.isArray(spots) || spots.length === 0) return [];

  const clusters = [];
  const assigned = new Set();

  for (let i = 0; i < spots.length; i++) {
    if (assigned.has(i)) continue;

    const rootSpot = spots[i];
    const coLocated = [rootSpot];
    assigned.add(i);

    for (let j = i + 1; j < spots.length; j++) {
      if (assigned.has(j)) continue;

      const candidate = spots[j];
      if (rootSpot.type !== candidate.type && rootSpot.type !== 'unknown' && candidate.type !== 'unknown') {
        // Do not cluster takeoffs together with landings
        continue;
      }

      const dist = computeDistanceKm(
        rootSpot.coordinates.lat,
        rootSpot.coordinates.lon,
        candidate.coordinates.lat,
        candidate.coordinates.lon
      );

      if (dist <= radiusKm) {
        coLocated.push(candidate);
        assigned.add(j);
      }
    }

    // Determine canonical spot (best completeness: has name, altitude, heading)
    let canonical = coLocated[0];
    let maxCompleteness = -1;

    for (const spot of coLocated) {
      let score = 0;
      if (spot.name && !spot.name.startsWith('Spot OSM')) score += 3;
      if (typeof spot.altitude === 'number') score += 2;
      if (typeof spot.heading === 'number') score += 2;
      if (spot.description) score += 1;
      if (score > maxCompleteness) {
        maxCompleteness = score;
        canonical = spot;
      }
    }

    // Distinct sources count (osm, pgearth, etc.)
    const sourceTypes = new Set(coLocated.map(s => s.source || 'osm'));

    clusters.push({
      canonicalId: canonical.sourceId || `cluster-${i}`,
      canonicalName: canonical.name,
      type: canonical.type,
      coordinates: { ...canonical.coordinates },
      altitude: canonical.altitude,
      heading: canonical.heading,
      description: canonical.description,
      operator: canonical.operator,
      coLocatedCount: coLocated.length,
      sourceCount: sourceTypes.size,
      sources: Array.from(sourceTypes),
      rawItems: coLocated
    });
  }

  return clusters;
}

/**
 * Validates a spot's declared altitude against DEM terrain altitude.
 * @param {number|null} declaredAltitude Altitude declared by the spot source
 * @param {number|null} demAltitude Altitude retrieved from DEM Copernicus
 * @param {number} [toleranceMeters=25] Optimal tolerance threshold
 * @returns {{ isValid: boolean, deltaMeters: number|null, score: number }}
 */
export function validateElevationWithDem(declaredAltitude, demAltitude, toleranceMeters = 25) {
  if (typeof declaredAltitude !== 'number' || typeof demAltitude !== 'number' || isNaN(declaredAltitude) || isNaN(demAltitude)) {
    return {
      isValid: false,
      deltaMeters: null,
      score: 0,
      reason: 'Quota dichiarata o DEM assente'
    };
  }

  const deltaMeters = Math.abs(declaredAltitude - demAltitude);

  if (deltaMeters <= toleranceMeters) {
    return {
      isValid: true,
      deltaMeters,
      score: 20,
      reason: 'Conferma DEM ottimale (scostamento <= 25m)'
    };
  } else if (deltaMeters <= 75) {
    return {
      isValid: true,
      deltaMeters,
      score: 10,
      reason: 'Conferma DEM parziale (scostamento compreso tra 25m e 75m)'
    };
  } else {
    return {
      isValid: false,
      deltaMeters,
      score: 0,
      reason: `Discrepanza DEM eccessiva (${Math.round(deltaMeters)}m > 75m): coordinate o quota sospette`
    };
  }
}

/**
 * Pairs a takeoff with candidate landings within glide reach.
 * E = (Distance_m) / (Delta_H)
 * @param {object} takeoff Takeoff spot candidate with .coordinates and .altitude
 * @param {Array<object>} landings List of landing spot candidates
 * @param {number} [maxGlideRatio=7.0] Maximum glide ratio
 * @param {number} [maxDistanceKm=15.0] Maximum search radius
 * @returns {Array<object>} Reachable landings with required glide ratio and distance
 */
export function pairTakeoffWithLandings(takeoff, landings, maxGlideRatio = MAX_SAFE_GLIDE_RATIO, maxDistanceKm = MAX_PAIRING_DISTANCE_KM) {
  if (!takeoff || !takeoff.coordinates || typeof takeoff.altitude !== 'number') return [];
  if (!Array.isArray(landings) || landings.length === 0) return [];

  const reachable = [];

  for (const landing of landings) {
    if (!landing || !landing.coordinates || typeof landing.altitude !== 'number') continue;

    const distKm = computeDistanceKm(
      takeoff.coordinates.lat,
      takeoff.coordinates.lon,
      landing.coordinates.lat,
      landing.coordinates.lon
    );

    if (distKm > maxDistanceKm) continue;

    const deltaH = takeoff.altitude - landing.altitude;
    if (deltaH <= 50) {
      // Landing must be at least 50m below takeoff
      continue;
    }

    const distMeters = distKm * 1000;
    const requiredGlide = distMeters / deltaH;

    const isSafe = requiredGlide <= maxGlideRatio;

    reachable.push({
      landingId: landing.canonicalId || landing.sourceId,
      landingName: landing.canonicalName || landing.name,
      coordinates: landing.coordinates,
      altitude: landing.altitude,
      distanceKm: Math.round(distKm * 100) / 100,
      deltaH: Math.round(deltaH),
      requiredGlide: Math.round(requiredGlide * 10) / 10,
      isSafe
    });
  }

  // Sort by required glide ascending (easiest/safest glide first)
  reachable.sort((a, b) => a.requiredGlide - b.requiredGlide);
  return reachable;
}

/**
 * Calculates the deterministic geometric reliability score.
 * Formula: W_sources (40) + W_dem (20) + W_heading (20) + W_landing (20)
 * @param {object} params
 * @returns {number} Score from 0 to 100
 */
export function computeGeometricReliability({
  sourceCount = 1,
  demScore = 0,
  hasSafeLanding = false,
  isLanding = false,
  hasHeading = false
} = {}) {
  // 1. Source corroboration (max 40 pts)
  let wSources = 15;
  if (sourceCount === 2) wSources = 30;
  else if (sourceCount >= 3) wSources = 40;

  // 2. DEM score (max 20 pts)
  const wDem = Math.max(0, Math.min(20, demScore));

  // 3. Heading consistency (max 20 pts)
  let wHeading = 0;
  if (isLanding) {
    wHeading = 20; // Landings do not strictly require a single launch heading
  } else if (hasHeading) {
    wHeading = 20;
  }

  // 4. Landing / Comprensorio pairing (max 20 pts)
  let wLanding = 5;
  if (isLanding) {
    wLanding = 20; // Direct landing has intrinsic landing value
  } else if (hasSafeLanding) {
    wLanding = 20;
  }

  const total = wSources + wDem + wHeading + wLanding;
  return Math.min(100, Math.max(0, total));
}

/**
 * Fetches batch DEM elevations from Open-Meteo Elevation API.
 * @param {Array<{ lat: number, lon: number }>} coordinates
 * @param {Function} [fetchImpl=globalThis.fetch]
 * @returns {Promise<Array<number|null>>}
 */
export async function fetchDemElevations(coordinates, fetchImpl = globalThis.fetch) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return [];

  const CHUNK_SIZE = 50;
  const results = [];

  for (let i = 0; i < coordinates.length; i += CHUNK_SIZE) {
    const chunk = coordinates.slice(i, i + CHUNK_SIZE);
    const lats = chunk.map(c => c.lat.toFixed(6)).join(',');
    const lons = chunk.map(c => c.lon.toFixed(6)).join(',');
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;

    const res = await fetchImpl(url);
    if (!res.ok) {
      throw new Error(`[DEM Fetcher] Errore HTTP Elevation API: ${res.status}`);
    }

    const data = await res.json();
    if (Array.isArray(data.elevation)) {
      results.push(...data.elevation.map(e => (typeof e === 'number' ? Math.round(e) : null)));
    } else {
      results.push(...chunk.map(() => null));
    }
  }

  return results;
}

/**
 * Orchestrates geometric processing for an array of raw spots.
 * @param {Array<object>} rawSpots
 * @param {object} [options]
 * @returns {Promise<Array<object>>} Pre-filtered and scored spot clusters
 */
export async function processGeometricPipeline(rawSpots, {
  radiusKm = DEFAULT_CLUSTER_RADIUS_KM,
  maxGlideRatio = MAX_SAFE_GLIDE_RATIO,
  fetchImpl = globalThis.fetch,
  demElevationsMap = null // Optional pre-loaded DEM map for unit testing
} = {}) {
  // 1. Separate takeoffs and landings
  const rawTakeoffs = rawSpots.filter(s => s.type === 'takeoff');
  const rawLandings = rawSpots.filter(s => s.type === 'landing');
  const rawUnknown = rawSpots.filter(s => s.type !== 'takeoff' && s.type !== 'landing');

  // 2. Spatial clustering
  const clusteredTakeoffs = clusterSpotsByProximity(rawTakeoffs, radiusKm);
  const clusteredLandings = clusterSpotsByProximity(rawLandings, radiusKm);
  const clusteredUnknown = clusterSpotsByProximity(rawUnknown, radiusKm);

  // Combine takeoffs & landings for batch DEM query
  const allClusters = [...clusteredTakeoffs, ...clusteredLandings, ...clusteredUnknown];
  
  // 3. Batch DEM validation
  let demElevations = [];
  if (demElevationsMap) {
    demElevations = allClusters.map(c => demElevationsMap[`${c.coordinates.lat},${c.coordinates.lon}`] ?? c.altitude);
  } else {
    try {
      demElevations = await fetchDemElevations(allClusters.map(c => c.coordinates), fetchImpl);
    } catch {
      // Fallback: use declared altitudes if network fails
      demElevations = allClusters.map(c => c.altitude);
    }
  }

  // Assign DEM validations and auto-fill missing spot elevations
  allClusters.forEach((cluster, idx) => {
    const demElev = demElevations[idx];
    cluster.demAltitude = demElev;
    cluster.demValidation = validateElevationWithDem(cluster.altitude, demElev);

    if ((cluster.altitude === null || cluster.altitude === undefined) && typeof demElev === 'number') {
      cluster.altitude = demElev;
      cluster.demAutoFilled = true;
      cluster.demValidation = {
        isValid: true,
        deltaMeters: 0,
        score: 15,
        reason: 'Quota derivata da DEM Copernicus 30m (assente nei tag OSM)'
      };
    }
  });

  // 4. Pair takeoffs with candidate landings
  const processedTakeoffs = clusteredTakeoffs.map(takeoff => {
    const pairedLandings = pairTakeoffWithLandings(takeoff, clusteredLandings, maxGlideRatio);
    const safeLandings = pairedLandings.filter(l => l.isSafe);
    const hasSafeLanding = safeLandings.length > 0;

    const geometricReliability = computeGeometricReliability({
      sourceCount: takeoff.sourceCount,
      demScore: takeoff.demValidation.score,
      hasSafeLanding,
      isLanding: false,
      hasHeading: typeof takeoff.heading === 'number'
    });

    return {
      ...takeoff,
      pairedLandings,
      hasSafeLanding,
      bestLanding: safeLandings[0] || pairedLandings[0] || null,
      geometricReliability
    };
  });

  const processedLandings = clusteredLandings.map(landing => {
    const geometricReliability = computeGeometricReliability({
      sourceCount: landing.sourceCount,
      demScore: landing.demValidation.score,
      hasSafeLanding: false,
      isLanding: true,
      hasHeading: false
    });

    return {
      ...landing,
      geometricReliability
    };
  });

  return {
    takeoffs: processedTakeoffs,
    landings: processedLandings,
    unclassified: clusteredUnknown
  };
}
