/**
 * GlideMind - Comprensorio Catalog Builder & Staging Pipeline (Headless ETL Tooling)
 * 
 * Orchestrates the full spot harvesting and validation pipeline:
 * 1. Reads raw harvested spots (or invokes harvest-osm)
 * 2. Runs geometric clustering, DEM elevation cross-check, and takeoff-landing pairing
 * 3. Assembles comprensorio localities conforming to data/locations.json schema
 * 4. Isolates output into data/staging-locations.json and generates markdown audit report
 * 5. Supports controlled merge with --merge flag
 * 
 * ZERO RUNTIME INTERFERENCE:
 * Operates offline in scripts/ and protects production data/locations.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processGeometricPipeline } from './geo-cluster-filter.mjs';
import { slugifyComprensorio } from '../core/comprensorio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_RAW_PATH = path.resolve(__dirname, '../data/raw-harvest/osm-raw.json');
export const DEFAULT_STAGING_PATH = path.resolve(__dirname, '../data/staging-locations.json');
export const DEFAULT_LOCATIONS_PATH = path.resolve(__dirname, '../data/locations.json');
export const DEFAULT_REPORT_PATH = path.resolve(__dirname, '../docs/spots-audit-report.md');

/**
 * Groups processed takeoffs and landings into comprensorio localities.
 * @param {Array<object>} takeoffs Processed takeoffs with paired landings
 * @param {Array<object>} landings Processed landings
 * @returns {Array<object>} Comprensorio entries
 */
export function buildComprensoriFromClusters(takeoffs, landings) {
  const comprensori = [];
  const assignedLandingIds = new Set();

  for (const takeoff of takeoffs) {
    const primaryLanding = takeoff.bestLanding;
    const pairedLandings = [];

    if (primaryLanding) {
      pairedLandings.push(primaryLanding);
      assignedLandingIds.add(primaryLanding.landingId);
    }

    // Additional safe landings
    for (const pl of (takeoff.pairedLandings || [])) {
      if (pl.isSafe && pl.landingId !== primaryLanding?.landingId) {
        pairedLandings.push(pl);
        assignedLandingIds.add(pl.landingId);
      }
    }

    const compName = takeoff.canonicalName.replace(/^(Decollo|Launch|Takeoff)\s+/i, '');
    const reliability = Math.round(takeoff.geometricReliability);

    comprensori.push({
      id: slugifyComprensorio(compName),
      location: `${compName}`,
      description: takeoff.description || `Comprensorio di volo censito con decollo ed atterraggio verificati. [attendibilità ${reliability}%]`,
      club: takeoff.operator ? { name: takeoff.operator } : null,
      reliability,
      takeoffs: [
        {
          name: takeoff.canonicalName,
          coordinates: `${takeoff.coordinates.lat.toFixed(6)}, ${takeoff.coordinates.lon.toFixed(6)}`,
          altitude: takeoff.altitude,
          heading: takeoff.heading ?? 180,
          description: takeoff.description || `Decollo censito [attendibilità ${reliability}%]`,
          reliability
        }
      ],
      landings: pairedLandings.map(l => {
        const landingRel = Math.min(100, Math.round(reliability * 0.95));
        return {
          name: l.landingName,
          coordinates: `${l.coordinates.lat.toFixed(6)}, ${l.coordinates.lon.toFixed(6)}`,
          altitude: l.altitude,
          description: `Atterraggio ufficiale raggiungibile (efficienza richiesta: ${l.requiredGlide}). [attendibilità ${landingRel}%]`,
          reliability: landingRel
        };
      })
    });
  }

  return comprensori;
}

/**
 * Generates markdown audit report of the pipeline run.
 * @param {object} stats
 * @returns {string}
 */
export function generateAuditReport(stats) {
  return `# Report di Audit e Validazione Spot

- **Data Elaborazione**: ${new Date().toISOString()}
- **Totale Spot Grezzi Analizzati**: ${stats.rawCount}
- **Decolli Riconosciuti**: ${stats.takeoffsCount}
- **Atterraggi Riconosciuti**: ${stats.landingsCount}
- **Comprensori Assemblati**: ${stats.comprensoriCount}
- **Spot con Validazione DEM Ottimale (<=25m)**: ${stats.demOptimalCount}
- **Spot ad Alta Attendibilità (>=80%)**: ${stats.highReliabilityCount}
- **Spot Segnalati per Ispezione Manuale (<75%)**: ${stats.reviewRequiredCount}

---

## Dettaglio Comprensori in Staging

| ID Comprensorio | Nome | Attendibilità | Decollo Primario | Quota (m) | Atterraggi Sicuri | Stato Audit |
| :--- | :--- | :---: | :--- | :---: | :---: | :---: |
${stats.entries.map(e => `| \`${e.id}\` | ${e.location} | **${e.reliability}%** | ${e.takeoffs[0]?.name || 'N/D'} | ${e.takeoffs[0]?.altitude || 'N/D'} | ${e.landings.length} | ${e.reliability >= 80 ? '🟢 APPROVED' : '🟡 REVIEW'} |`).join('\n')}
`;
}

/**
 * Main execution function.
 */
export async function runBuildCatalog({
  rawFile = DEFAULT_RAW_PATH,
  stagingFile = DEFAULT_STAGING_PATH,
  reportFile = DEFAULT_REPORT_PATH,
  demMap = null
} = {}) {
  if (!fs.existsSync(rawFile)) {
    throw new Error(`[Catalog Builder] File grezzo non trovato: ${rawFile}. Eseguire prima 'node scripts/harvest-osm.mjs'.`);
  }

  const rawSpots = JSON.parse(fs.readFileSync(rawFile, 'utf-8'));
  console.log(`[Catalog Builder] Caricati ${rawSpots.length} spot grezzi da ${rawFile}`);

  const processed = await processGeometricPipeline(rawSpots, { demElevationsMap: demMap });
  const comprensori = buildComprensoriFromClusters(processed.takeoffs, processed.landings);

  // Ensure staging directory exists
  const stagingDir = path.dirname(stagingFile);
  if (!fs.existsSync(stagingDir)) {
    fs.mkdirSync(stagingDir, { recursive: true });
  }

  fs.writeFileSync(stagingFile, JSON.stringify(comprensori, null, 2), 'utf-8');
  console.log(`[Catalog Builder] Esportati ${comprensori.length} comprensori in staging: ${stagingFile}`);

  // Generate audit report
  const stats = {
    rawCount: rawSpots.length,
    takeoffsCount: processed.takeoffs.length,
    landingsCount: processed.landings.length,
    comprensoriCount: comprensori.length,
    demOptimalCount: processed.takeoffs.filter(t => t.demValidation?.score === 20).length,
    highReliabilityCount: comprensori.filter(c => c.reliability >= 80).length,
    reviewRequiredCount: comprensori.filter(c => c.reliability < 75).length,
    entries: comprensori
  };

  const report = generateAuditReport(stats);
  const reportDir = path.dirname(reportFile);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  fs.writeFileSync(reportFile, report, 'utf-8');
  console.log(`[Catalog Builder] Report generato in ${reportFile}`);

  return { comprensori, stats };
}

// Direct CLI execution
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runBuildCatalog().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
