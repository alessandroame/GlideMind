import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  logbookManager,
  createMemoryDbAdapter
} from '../../core/logbookDb.js';
import { store } from '../../core/store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/sample_flight.igc');

describe('Logbook IGC Pipeline - Dual-Storage Ingestion & Integrity', () => {
  let sampleIgcText;

  beforeEach(async () => {
    // Fresh in-memory adapter for complete test isolation
    logbookManager.setAdapter(createMemoryDbAdapter());
    await logbookManager.clearAll();
    sampleIgcText = fs.readFileSync(FIXTURE_PATH, 'utf8');
  });

  it('should ingest authentic FAI IGC file and separate flights_meta from flights_raw', async () => {
    let progressCalls = 0;
    const result = await logbookManager.importIgcTrack(sampleIgcText, {
      fileName: 'sample_flight.igc',
      onProgress: (p) => {
        progressCalls++;
        assert.ok(p >= 0 && p <= 100);
      }
    });

    assert.ok(progressCalls > 0, 'Progress callback must be invoked during ingestion');
    assert.equal(result.isNew, true);
    assert.equal(result.wasUpdated, false);

    // 1. Verify flights_meta (lightweight index)
    const meta = result.meta;
    assert.match(meta.id, /^fl_20261010_120000_[a-f0-9]{10}$/);
    assert.equal(meta.date, '2026-10-10');
    assert.equal(meta.pilot, 'Alessandro Rossi');
    assert.equal(meta.glider, 'Axis Compact 4');
    assert.equal(meta.gliderClass, 'EN-A');
    assert.equal(meta.takeoffLocationName, 'Decollo Risparmio');
    assert.equal(meta.landingLocationName, 'Atterraggio Ufficiale Suello');
    assert.equal(meta.siteName, 'Decollo Risparmio -> Atterraggio Ufficiale Suello');
    assert.equal(meta.hasRawIgc, true);
    assert.equal(meta.hasDecimatedTrack, true);
    assert.ok(meta.maxAltMsl > 1400, 'Must record peak altitude');
    assert.ok(meta.maxGainMeters > 300, 'Must record altitude gain');
    assert.equal(meta.thermalsCount, 1);
    assert.ok(meta.accumulatedClimbMeters > 300);

    // Verify SVG sparkline points
    assert.equal(typeof meta.sparklineSvgPoints, 'string');
    assert.ok(meta.sparklineSvgPoints.split(' ').length >= 30);

    // 2. Verify flights_raw (authentic payload & 3D decimated track)
    const raw = result.raw;
    assert.equal(raw.id, meta.id);
    assert.equal(raw.originalFileName, 'sample_flight.igc');
    assert.equal(raw.rawIgc, sampleIgcText);
    assert.ok(raw.rawIgc.includes('G7A8F4390B23846C7E2D'), 'Must preserve cryptographic FAI G-record bit-for-bit');
    assert.ok(Array.isArray(raw.decimatedPoints));
    assert.ok(raw.decimatedPoints.length > 20);
    assert.ok(raw.decimatedPoints.length <= 1500);

    // 3. Verify store synchronization
    const storeFlights = store.getState().flights || [];
    assert.equal(storeFlights.length, 1);
    assert.equal(storeFlights[0].id, meta.id);
  });

  it('should be idempotent: re-importing identical IGC updates record without duplicating', async () => {
    const res1 = await logbookManager.importIgcTrack(sampleIgcText, { fileName: 'track.igc' });
    assert.equal(res1.isNew, true);
    assert.equal(res1.wasUpdated, false);

    const count1 = (await logbookManager.getAllFlights()).length;
    assert.equal(count1, 1);

    // Second import with identical IGC content
    const res2 = await logbookManager.importIgcTrack(sampleIgcText, { fileName: 'track.igc' });
    assert.equal(res2.isNew, false);
    assert.equal(res2.wasUpdated, true);
    assert.equal(res2.meta.id, res1.meta.id);

    const count2 = (await logbookManager.getAllFlights()).length;
    assert.equal(count2, 1, 'Idempotent ingestion must never create duplicate records');
  });

  it('should export raw IGC text preserving exact original FAI file structure and G-records', async () => {
    const res = await logbookManager.importIgcTrack(sampleIgcText, { fileName: 'my_flight.igc' });
    const exported = await logbookManager.exportFlightIgc(res.meta.id);

    assert.ok(exported);
    assert.equal(exported.rawIgc, sampleIgcText);
    assert.equal(exported.fileName, 'my_flight.igc');
    assert.equal(exported.mimeType, 'application/x-igc');
    assert.ok(exported.rawIgc.startsWith('AXCT001'));
    assert.ok(exported.rawIgc.includes('G7A8F4390B23846C7E2D'));
  });

  it('should return null when exporting nonexistent flight ID', async () => {
    const exported = await logbookManager.exportFlightIgc('fl_unknown');
    assert.equal(exported, null);
  });

  it('should delete flight from both stores and synchronize store state', async () => {
    const res = await logbookManager.importIgcTrack(sampleIgcText, { fileName: 'flight.igc' });
    assert.equal((await logbookManager.getAllFlights()).length, 1);
    assert.equal(store.getState().flights.length, 1);

    const deleted = await logbookManager.deleteFlight(res.meta.id);
    assert.equal(deleted, true);

    assert.equal((await logbookManager.getAllFlights()).length, 0);
    assert.equal(await logbookManager.getRawIgc(res.meta.id), null);
    assert.equal(await logbookManager.getDecimatedTrack(res.meta.id), null);
    assert.equal(store.getState().flights.length, 0);
  });

  it('should reject invalid or empty IGC inputs with descriptive error messages', async () => {
    await assert.rejects(
      async () => await logbookManager.importIgcTrack(''),
      /Impossibile importare traccia/
    );

    await assert.rejects(
      async () => await logbookManager.importIgcTrack('AXCT001\nHFDTE101026\nHFPLT:Mario\n'),
      /non contiene record di volo B-record/
    );
  });
});
