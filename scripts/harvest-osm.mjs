/**
 * GlideMind - OpenStreetMap Free Flying Harvester (Headless ETL Tooling)
 * 
 * Fetches and normalizes paragliding/hang gliding takeoff and landing sites
 * from OpenStreetMap via Overpass API.
 * 
 * ZERO RUNTIME INTERFERENCE:
 * Operates offline in scripts/ and outputs to raw staging files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_OVERPASS_ENDPOINT = 'https://overpass.osm.ch/api/interpreter';
export const FALLBACK_OVERPASS_ENDPOINTS = [
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

export const COUNTRY_BBOX_MAP = {
  IT: '35.5,6.6,47.1,18.5',
  CH: '45.8,5.9,47.9,10.5',
  FR: '41.3,-5.2,51.1,9.6',
  AT: '46.3,9.5,49.1,17.2',
  DE: '47.2,5.8,55.1,15.1',
  ES: '36.0,-9.3,43.8,3.3',
  SI: '45.4,13.3,46.9,16.6',
  HR: '42.3,13.4,46.5,19.4',
  PT: '36.9,-9.5,42.2,-6.1',
  UK: '49.8,-8.6,60.9,1.8',
  GR: '34.8,19.3,41.8,28.3'
};

/**
 * Builds the Overpass QL query string for a target country using area search.
 * @param {string} [countryCode='IT']
 * @returns {string}
 */
export function buildOverpassQuery(countryCode = 'IT') {
  return `[out:json][timeout:60];
area["ISO3166-1"="${countryCode}"]->.searchArea;
(
  node["sport"="free_flying"](area.searchArea);
  way["sport"="free_flying"](area.searchArea);
  node["sport"="paragliding"](area.searchArea);
  way["sport"="paragliding"](area.searchArea);
);
out center body;`;
}

/**
 * Builds high-performance Overpass QL query using indexed spatial bounding box (O(log N)).
 * @param {string} [bbox='35.5,6.6,47.1,18.5']
 * @returns {string}
 */
export function buildOverpassBboxQuery(bbox = '35.5,6.6,47.1,18.5') {
  return `[out:json][timeout:60][bbox:${bbox}];
(
  node["sport"="free_flying"];
  way["sport"="free_flying"];
  node["sport"="paragliding"];
  way["sport"="paragliding"];
);
out center body;`;
}

/**
 * Normalizes an raw OSM element into a standardized spot candidate.
 * @param {object} element OSM node or way
 * @returns {object|null}
 */
export function normalizeOsmSpot(element) {
  if (!element || typeof element !== 'object') return null;
  const tags = element.tags || {};
  
  // Coordinates can be direct (node) or center (way/area)
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  // Determine site type
  const rawSite = (tags['free_flying:site'] || tags['paragliding:site'] || '').toLowerCase();
  let type = 'unknown';
  if (rawSite.includes('takeoff') || rawSite.includes('launch') || tags.takeoff === 'yes') {
    type = 'takeoff';
  } else if (rawSite.includes('landing') || tags.landing === 'yes') {
    type = 'landing';
  }

  // Parse altitude
  let altitude = null;
  if (tags.ele) {
    const parsedEle = parseFloat(tags.ele);
    if (!isNaN(parsedEle)) altitude = Math.round(parsedEle);
  }

  // Parse heading/direction
  let heading = null;
  if (tags.direction) {
    const parsedDir = parseFloat(tags.direction);
    if (!isNaN(parsedDir)) {
      heading = ((Math.round(parsedDir) % 360) + 360) % 360;
    }
  }

  return {
    source: 'osm',
    sourceId: `osm-${element.type}-${element.id}`,
    name: tags.name || tags['name:it'] || tags['name:en'] || `Spot OSM ${element.id}`,
    type,
    coordinates: { lat, lon },
    altitude,
    heading,
    description: tags.description || tags.note || '',
    operator: tags.operator || tags.club || null,
    rawTags: tags
  };
}

/**
 * Parses and filters a full Overpass JSON response.
 * @param {object} overpassJson
 * @returns {Array<object>}
 */
export function parseOverpassResponse(overpassJson) {
  if (!overpassJson || !Array.isArray(overpassJson.elements)) return [];
  
  const spots = [];
  for (const el of overpassJson.elements) {
    const spot = normalizeOsmSpot(el);
    if (spot) {
      spots.push(spot);
    }
  }
  return spots;
}

/**
 * Executes the harvester CLI command.
 */
export async function runHarvest({
  country = 'IT',
  bbox = null,
  endpoint = DEFAULT_OVERPASS_ENDPOINT,
  outFile = path.resolve(__dirname, '../data/raw-harvest/osm-raw.json'),
  fetchImpl = globalThis.fetch,
  timeoutMs = 90000
} = {}) {
  const targetBbox = bbox || COUNTRY_BBOX_MAP[country];
  const query = targetBbox ? buildOverpassBboxQuery(targetBbox) : buildOverpassQuery(country);
  const endpointsToTry = [endpoint];
  for (const ep of FALLBACK_OVERPASS_ENDPOINTS) {
    if (!endpointsToTry.includes(ep)) {
      endpointsToTry.push(ep);
    }
  }

  let lastError = null;
  let json = null;

  for (const ep of endpointsToTry) {
    try {
      console.log(`[OSM Harvester] Interrogazione Overpass API (${ep}) per ${country}...`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetchImpl(ep, {
        method: 'POST',
        headers: {
          'User-Agent': 'GlideMind-SpotHarvester/1.0 (contact: info@glidemind.app)',
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`Errore HTTP Overpass: ${response.status} ${response.statusText}`);
      }

      json = await response.json();
      break;
    } catch (err) {
      console.warn(`[OSM Harvester] Fallito endpoint ${ep}: ${err.message}. Tento eventuale fallback...`);
      lastError = err;
    }
  }

  if (!json) {
    throw new Error(`[OSM Harvester] Tutti gli endpoint Overpass sono falliti. Ultimo errore: ${lastError?.message}`);
  }

  const normalizedSpots = parseOverpassResponse(json);

  const outDir = path.dirname(outFile);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outFile, JSON.stringify(normalizedSpots, null, 2), 'utf-8');
  console.log(`[OSM Harvester] Censiti con successo ${normalizedSpots.length} spot OSM in ${outFile}`);
  return normalizedSpots;
}

// Direct CLI execution check
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  let country = 'IT';
  for (const arg of args) {
    if (arg.startsWith('--country=')) {
      country = arg.split('=')[1].toUpperCase();
    } else if (!arg.startsWith('-')) {
      country = arg.toUpperCase();
    }
  }

  const outFile = country === 'IT'
    ? path.resolve(__dirname, '../data/raw-harvest/osm-raw.json')
    : path.resolve(__dirname, `../data/raw-harvest/osm-raw-${country.toLowerCase()}.json`);

  runHarvest({ country, outFile }).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
