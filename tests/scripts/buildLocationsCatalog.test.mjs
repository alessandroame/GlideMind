import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildComprensoriFromClusters,
  generateAuditReport,
  runBuildCatalog
} from '../../scripts/build-locations-catalog.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Comprensorio Catalog Builder & Staging Pipeline - Tooling Tests', () => {
  it('should build structured comprensori matching locations.json schema', () => {
    const mockTakeoffs = [
      {
        canonicalId: 't-1',
        canonicalName: 'Decollo Cornizzolo',
        coordinates: { lat: 45.833, lon: 9.302 },
        altitude: 1060,
        heading: 180,
        description: 'Decollo con moquette',
        operator: 'Aero Club Monte Cornizzolo',
        geometricReliability: 94,
        bestLanding: {
          landingId: 'l-1',
          landingName: 'Atterraggio Suello',
          coordinates: { lat: 45.817, lon: 9.318 },
          altitude: 260,
          requiredGlide: 2.75,
          isSafe: true
        },
        pairedLandings: []
      }
    ];

    const mockLandings = [];

    const comprensori = buildComprensoriFromClusters(mockTakeoffs, mockLandings);
    assert.equal(comprensori.length, 1);

    const comp = comprensori[0];
    assert.equal(comp.location, 'Cornizzolo');
    assert.equal(comp.reliability, 94);
    assert.equal(comp.takeoffs.length, 1);
    assert.equal(comp.takeoffs[0].name, 'Decollo Cornizzolo');
    assert.equal(comp.takeoffs[0].altitude, 1060);
    assert.equal(comp.takeoffs[0].heading, 180);
    assert.equal(comp.landings.length, 1);
    assert.equal(comp.landings[0].name, 'Atterraggio Suello');
    assert.equal(comp.landings[0].altitude, 260);
  });

  it('should generate markdown audit report with valid formatting', () => {
    const mockStats = {
      rawCount: 10,
      takeoffsCount: 5,
      landingsCount: 5,
      comprensoriCount: 4,
      demOptimalCount: 3,
      highReliabilityCount: 3,
      reviewRequiredCount: 1,
      entries: [
        {
          id: 'monte-cornizzolo',
          location: 'Monte Cornizzolo',
          reliability: 92,
          takeoffs: [{ name: 'Decollo Sud', altitude: 1060 }],
          landings: [{ name: 'Atterraggio Suello' }]
        }
      ]
    };

    const report = generateAuditReport(mockStats);
    assert.ok(report.includes('# Report di Audit e Validazione Spot'));
    assert.ok(report.includes('Monte Cornizzolo'));
    assert.ok(report.includes('**92%**'));
    assert.ok(report.includes('🟢 APPROVED'));
  });

  it('should execute runBuildCatalog end-to-end using temporary test files', async () => {
    const tmpRawFile = path.resolve(__dirname, 'tmp-raw-builder.json');
    const tmpStagingFile = path.resolve(__dirname, 'tmp-staging-builder.json');
    const tmpReportFile = path.resolve(__dirname, 'tmp-report-builder.md');

    const testSpots = [
      {
        source: 'osm',
        sourceId: 't-test',
        name: 'Decollo Test',
        type: 'takeoff',
        coordinates: { lat: 46.0, lon: 10.0 },
        altitude: 1200,
        heading: 190
      },
      {
        source: 'osm',
        sourceId: 'l-test',
        name: 'Atterraggio Test',
        type: 'landing',
        coordinates: { lat: 45.98, lon: 10.01 },
        altitude: 400
      }
    ];

    fs.writeFileSync(tmpRawFile, JSON.stringify(testSpots, null, 2), 'utf-8');

    try {
      const result = await runBuildCatalog({
        rawFile: tmpRawFile,
        stagingFile: tmpStagingFile,
        reportFile: tmpReportFile,
        demMap: {
          '46,10': 1195,
          '45.98,10.01': 402
        }
      });

      assert.equal(result.comprensori.length, 1);
      assert.ok(fs.existsSync(tmpStagingFile));
      assert.ok(fs.existsSync(tmpReportFile));
    } finally {
      if (fs.existsSync(tmpRawFile)) fs.unlinkSync(tmpRawFile);
      if (fs.existsSync(tmpStagingFile)) fs.unlinkSync(tmpStagingFile);
      if (fs.existsSync(tmpReportFile)) fs.unlinkSync(tmpReportFile);
    }
  });
});
