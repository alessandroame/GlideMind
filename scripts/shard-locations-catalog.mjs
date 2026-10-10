/**
 * GlideMind - Locations Catalog Sharder & Index Generator (Headless ETL Tooling)
 * 
 * Partitions monolithic locations catalog into:
 * 1. Lightweight global index: data/locations-index.json (~10-20% original size)
 *    Contains only coordinates, basic metadata, and counts for map/search at 0ms latency.
 * 2. Country-sharded detail files: data/locations/<country>.json
 *    Contains complete aeronautical records (sub-spots, hazards, radio frequencies, clubs).
 * 
 * ZERO RUNTIME INTERFERENCE:
 * Preserves data/locations.json intact for full backward compatibility.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeLocationsCatalog } from '../core/comprensorio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_SOURCE_CATALOG = path.resolve(__dirname, '../data/locations.json');
export const DEFAULT_INDEX_TARGET = path.resolve(__dirname, '../data/locations-index.json');
export const DEFAULT_SHARDS_DIR = path.resolve(__dirname, '../data/locations');

/**
 * Builds lightweight index entry from a fully normalized comprensorio object.
 * @param {object} comprensorio
 * @returns {object}
 */
export function createIndexEntry(comprensorio) {
  if (!comprensorio || typeof comprensorio !== 'object') return null;

  const primaryTakeoff = (comprensorio.takeoffs || []).find(t => t.isPrimary) || comprensorio.takeoffs?.[0];
  const primaryLanding = (comprensorio.landings || []).find(l => l.isPrimary) || comprensorio.landings?.[0];

  return {
    id: comprensorio.id,
    name: comprensorio.name,
    country: comprensorio.country || 'IT',
    region: comprensorio.region || '',
    province: comprensorio.province || '',
    location: comprensorio.location || '',
    coordinates: primaryTakeoff?.coordinates || null,
    altitude: primaryTakeoff?.altitude || 0,
    heading: typeof primaryTakeoff?.heading === 'number' ? primaryTakeoff.heading : null,
    landingAltitude: primaryLanding?.altitude || null,
    reliability: typeof comprensorio.reliability === 'number' ? comprensorio.reliability : (primaryTakeoff?.reliability || 0),
    takeoffsCount: Array.isArray(comprensorio.takeoffs) ? comprensorio.takeoffs.length : 0,
    landingsCount: Array.isArray(comprensorio.landings) ? comprensorio.landings.length : 0,
    hasWebcam: Boolean(comprensorio.webcam),
    hasClub: Boolean(comprensorio.club)
  };
}

/**
 * Shards a normalized catalog into index and country partitions.
 * @param {Array<object>} normalizedCatalog
 * @returns {{ indexEntries: Array<object>, countryPartitions: Record<string, Array<object>> }}
 */
export function shardCatalog(normalizedCatalog) {
  if (!Array.isArray(normalizedCatalog)) {
    return { indexEntries: [], countryPartitions: {} };
  }

  const indexEntries = [];
  const countryPartitions = {};

  for (const comp of normalizedCatalog) {
    if (!comp || !comp.id) continue;
    const indexEntry = createIndexEntry(comp);
    if (indexEntry) {
      indexEntries.push(indexEntry);
    }

    const countryKey = (comp.country || 'IT').toLowerCase();
    if (!countryPartitions[countryKey]) {
      countryPartitions[countryKey] = [];
    }
    countryPartitions[countryKey].push(comp);
  }

  return { indexEntries, countryPartitions };
}

/**
 * Executes catalog sharding process and writes files to disk.
 * @param {object} [options]
 * @returns {object} Summary statistics
 */
export function runSharding({
  sourceFile = DEFAULT_SOURCE_CATALOG,
  indexFile = DEFAULT_INDEX_TARGET,
  shardsDir = DEFAULT_SHARDS_DIR
} = {}) {
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`[Catalog Sharder] Source catalog not found: ${sourceFile}`);
  }

  const rawJson = JSON.parse(fs.readFileSync(sourceFile, 'utf-8'));
  const normalized = normalizeLocationsCatalog(rawJson);
  console.log(`[Catalog Sharder] Loaded and normalized ${normalized.length} comprensori from ${sourceFile}`);

  const { indexEntries, countryPartitions } = shardCatalog(normalized);

  // Ensure output directories exist
  const indexDir = path.dirname(indexFile);
  if (!fs.existsSync(indexDir)) {
    fs.mkdirSync(indexDir, { recursive: true });
  }
  if (!fs.existsSync(shardsDir)) {
    fs.mkdirSync(shardsDir, { recursive: true });
  }

  // Write lightweight index
  fs.writeFileSync(indexFile, JSON.stringify(indexEntries, null, 2), 'utf-8');
  const indexSizeKb = Math.round(fs.statSync(indexFile).size / 1024);
  console.log(`[Catalog Sharder] Wrote index: ${indexFile} (${indexEntries.length} entries, ~${indexSizeKb} KB)`);

  // Write national partitions
  const writtenShards = [];
  for (const [countryKey, spots] of Object.entries(countryPartitions)) {
    const shardPath = path.join(shardsDir, `${countryKey}.json`);
    fs.writeFileSync(shardPath, JSON.stringify(spots, null, 2), 'utf-8');
    const shardSizeKb = Math.round(fs.statSync(shardPath).size / 1024);
    writtenShards.push({ country: countryKey.toUpperCase(), count: spots.length, sizeKb: shardSizeKb, file: shardPath });
    console.log(`[Catalog Sharder] Partition [${countryKey.toUpperCase()}]: ${spots.length} spots (~${shardSizeKb} KB) in ${shardPath}`);
  }

  return {
    totalSpots: normalized.length,
    indexSizeKb,
    writtenShards
  };
}

// Direct CLI execution
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const stats = runSharding();
    console.log('[Catalog Sharder] Completed successfully:', JSON.stringify(stats, null, 2));
  } catch (err) {
    console.error('[Catalog Sharder] Fatal error:', err.message);
    process.exit(1);
  }
}
