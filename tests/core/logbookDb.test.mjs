import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMemoryDbAdapter,
  fnv1a64,
  computeFlightFingerprint,
  deduceGliderClass,
  generateSparklinePoints,
  requestStoragePersistence,
  logbookManager
} from '../../core/logbookDb.js';

describe('Logbook Database & Storage Adapters - Headless Core Contracts', () => {
  let adapter;

  beforeEach(() => {
    adapter = createMemoryDbAdapter();
  });

  describe('FNV-1a 64-bit Hash & Deterministic Fingerprinting', () => {
    it('should compute consistent 16-hex characters hash for identical strings', () => {
      const input = '2026-10-10|B1200004549980N00917580EA0106001060|B1202224549140N00918540EA0026000260|73';
      const hash1 = fnv1a64(input);
      const hash2 = fnv1a64(input);

      assert.equal(typeof hash1, 'string');
      assert.equal(hash1.length, 16);
      assert.equal(hash1, hash2);
    });

    it('should produce distinct hashes for different inputs (collision resistance)', () => {
      const h1 = fnv1a64('track_alpha_sample');
      const h2 = fnv1a64('track_beta_sample');
      assert.notEqual(h1, h2);
    });

    it('should generate formatted flight fingerprint string fl_YYYYMMDD_HHMMSS_<hash>', () => {
      const firstB = 'B1200004549980N00917580EA0106001060';
      const lastB = 'B1202224549140N00918540EA0026000260';
      const id = computeFlightFingerprint('2026-10-10', firstB, lastB, 73);

      assert.match(id, /^fl_20261010_120000_[a-f0-9]{10}$/);
    });

    it('should handle missing or malformed dates and records gracefully', () => {
      const id = computeFlightFingerprint(null, '', '', 0);
      assert.match(id, /^fl_19700101_000000_[a-f0-9]{10}$/);
    });
  });

  describe('Glider Class Deduction', () => {
    it('should deduce EN-A category from names and category objects', () => {
      assert.equal(deduceGliderClass('Axis Compact 4'), 'EN-A');
      assert.equal(deduceGliderClass({ name: 'Alpha 7', category: 'EN-A' }), 'EN-A');
      assert.equal(deduceGliderClass('Ozone Mojo 6'), 'EN-A');
    });

    it('should deduce EN-B, EN-C, EN-D and Tandem', () => {
      assert.equal(deduceGliderClass('Ozone Rush 6 (EN-B)'), 'EN-B');
      assert.equal(deduceGliderClass('Advance Sigma 11 (EN-C)'), 'EN-C');
      assert.equal(deduceGliderClass('Niviuk Icepeak Evox (EN-D)'), 'EN-D');
      assert.equal(deduceGliderClass('Advance BiBeta 6 Tandem'), 'Tandem');
    });

    it('should fall back to Custom for unknown or null glider strings', () => {
      assert.equal(deduceGliderClass(null), 'Custom');
      assert.equal(deduceGliderClass(''), 'Custom');
      assert.equal(deduceGliderClass('Custom Paraglider Prototype'), 'Custom');
    });
  });

  describe('Sparkline SVG Point Generator', () => {
    it('should generate normalized coordinates string for altimetric track points', () => {
      const points = [
        { timeSeconds: 0, alt: 1000 },
        { timeSeconds: 30, alt: 1200 },
        { timeSeconds: 60, alt: 1400 },
        { timeSeconds: 90, alt: 1100 },
        { timeSeconds: 120, alt: 800 }
      ];

      const sparkline = generateSparklinePoints(points, 5, 100, 32);
      assert.equal(typeof sparkline, 'string');
      const pairs = sparkline.split(' ');
      assert.equal(pairs.length, 5);

      // First point x should be 0, last point x should be 100
      assert.equal(pairs[0].split(',')[0], '0');
      assert.equal(pairs[pairs.length - 1].split(',')[0], '100');
    });

    it('should handle empty or single-point arrays safely', () => {
      assert.equal(generateSparklinePoints([], 60, 100, 32), '0,16 100,16');
      const single = generateSparklinePoints([{ alt: 1000 }], 60, 100, 32);
      assert.ok(single.includes(','));
    });
  });

  describe('MemoryDbAdapter Operations', () => {
    it('should initialize and perform save and get operations', async () => {
      await adapter.init();

      const meta = {
        id: 'fl_test_001',
        date: '2026-10-10',
        takeoffTime: '12:00',
        landingTime: '12:45',
        durationMinutes: 45,
        site: 'Monte Cornizzolo',
        siteName: 'Decollo Risparmio -> Atterraggio Suello',
        maxAltMsl: 1450,
        distanceKm: 12.4,
        maxClimbRate: 3.2,
        thermalsCount: 2,
        accumulatedClimbMeters: 450
      };

      const raw = {
        id: 'fl_test_001',
        rawIgc: 'AXCT001\nHFDTE101026\nB1200004549980N00917580EA0106001060\n',
        originalFileName: 'cornizzolo.igc',
        decimatedPoints: [{ lat: 45.83, lon: 9.30, alt: 1060 }]
      };

      const savedId = await adapter.saveFlight(meta, raw);
      assert.equal(savedId, 'fl_test_001');

      const retrieved = await adapter.getFlight('fl_test_001');
      assert.ok(retrieved);
      assert.equal(retrieved.meta.site, 'Monte Cornizzolo');
      assert.equal(retrieved.raw.originalFileName, 'cornizzolo.igc');

      const rawIgc = await adapter.getRawIgc('fl_test_001');
      assert.ok(rawIgc.includes('HFDTE101026'));

      const decimated = await adapter.getDecimatedTrack('fl_test_001');
      assert.equal(decimated.length, 1);
      assert.equal(decimated[0].alt, 1060);
    });

    it('should return null when retrieving nonexistent flight ID', async () => {
      const flight = await adapter.getFlight('fl_nonexistent');
      assert.equal(flight, null);
      const rawIgc = await adapter.getRawIgc('fl_nonexistent');
      assert.equal(rawIgc, null);
      const decimated = await adapter.getDecimatedTrack('fl_nonexistent');
      assert.equal(decimated, null);
    });

    it('should return all flight metas sorted chronologically descending', async () => {
      await adapter.saveFlight(
        { id: 'fl_old', date: '2026-08-15', takeoffTime: '10:00', durationMinutes: 30, distanceKm: 5 },
        null
      );
      await adapter.saveFlight(
        { id: 'fl_new', date: '2026-10-10', takeoffTime: '14:00', durationMinutes: 60, distanceKm: 15 },
        null
      );
      await adapter.saveFlight(
        { id: 'fl_mid', date: '2026-09-01', takeoffTime: '11:00', durationMinutes: 40, distanceKm: 8 },
        null
      );

      const metas = await adapter.getAllFlightMetas();
      assert.equal(metas.length, 3);
      assert.equal(metas[0].id, 'fl_new');
      assert.equal(metas[1].id, 'fl_mid');
      assert.equal(metas[2].id, 'fl_old');
    });

    it('should compute career KPIs accurately across stored flights', async () => {
      await adapter.saveFlight(
        {
          id: 'fl_1',
          durationMinutes: 45,
          distanceKm: 10,
          maxAltMsl: 1500,
          maxClimbRate: 3.0,
          thermalsCount: 2,
          accumulatedClimbMeters: 400
        },
        null
      );
      await adapter.saveFlight(
        {
          id: 'fl_2',
          durationMinutes: 75,
          distanceKm: 20,
          maxAltMsl: 1800,
          maxClimbRate: 4.5,
          thermalsCount: 3,
          accumulatedClimbMeters: 700
        },
        null
      );

      const kpis = await adapter.getCareerKpis();
      assert.equal(kpis.totalFlights, 2);
      assert.equal(kpis.totalDurationMinutes, 120);
      assert.equal(kpis.totalHours, 2);
      assert.equal(kpis.formattedHours, '2 h');
      assert.equal(kpis.totalDistanceKm, 30);
      assert.equal(kpis.maxAltMsl, 1800);
      assert.equal(kpis.maxClimbRate, 4.5);
      assert.equal(kpis.maxDistanceKm, 20);
      assert.equal(kpis.maxDurationMinutes, 75);
      assert.equal(kpis.totalThermals, 5);
      assert.equal(kpis.totalAccumulatedClimbMeters, 1100);
    });

    it('should delete a flight and clear storage cleanly', async () => {
      await adapter.saveFlight({ id: 'fl_del', site: 'To Delete' }, { id: 'fl_del', rawIgc: 'raw' });
      assert.equal((await adapter.getAllFlightMetas()).length, 1);

      const deleted = await adapter.deleteFlight('fl_del');
      assert.equal(deleted, true);
      assert.equal((await adapter.getAllFlightMetas()).length, 0);
      assert.equal(await adapter.getRawIgc('fl_del'), null);

      // Delete nonexistent should return false
      assert.equal(await adapter.deleteFlight('fl_del'), false);

      // Clear all
      await adapter.saveFlight({ id: 'fl_x' }, null);
      await adapter.clearAll();
      assert.equal((await adapter.getAllFlightMetas()).length, 0);
    });

    it('should update flight metadata and personal notes via updateFlightMeta', async () => {
      await adapter.saveFlight({ id: 'fl_notes_1', site: 'Monte Cornizzolo', notes: '' }, null);
      const updated = await adapter.updateFlightMeta('fl_notes_1', { notes: 'Great thermal day over the lake!' });

      assert.equal(updated.notes, 'Great thermal day over the lake!');
      const retrieved = await adapter.getFlight('fl_notes_1');
      assert.equal(retrieved.meta.notes, 'Great thermal day over the lake!');

      // Updating nonexistent flight should return null
      assert.equal(await adapter.updateFlightMeta('fl_nonexistent', { notes: 'test' }), null);
    });
  });

  describe('LogbookManager Flight Detail & Notes Synchronization', () => {
    it('should retrieve flight detail with telemetry bundle and persist personal notes', async () => {
      await logbookManager.clearAll();

      await logbookManager.saveFlight(
        {
          id: 'fl_mgr_detail',
          site: 'Bassano del Grappa',
          glider: 'Axis Compact 4',
          gliderClass: 'EN-A',
          notes: ''
        },
        {
          id: 'fl_mgr_detail',
          rawIgc: 'B120000...',
          decimatedPoints: [
            { timeSeconds: 0, alt: 1000, lat: 45.8, lon: 11.7, vario: 0 },
            { timeSeconds: 60, alt: 1100, lat: 45.801, lon: 11.701, vario: 1.6 },
            { timeSeconds: 120, alt: 1200, lat: 45.802, lon: 11.702, vario: 1.6 },
            { timeSeconds: 180, alt: 1250, lat: 45.803, lon: 11.703, vario: 0.8 },
            { timeSeconds: 240, alt: 1200, lat: 45.804, lon: 11.704, vario: -0.8 },
            { timeSeconds: 300, alt: 1100, lat: 45.805, lon: 11.705, vario: -1.6 }
          ],
          telemetry: {
            thermals: [{ thermalIndex: 1, netGain: 250, avgClimbRate: 1.4, durationFormatted: '3m 0s' }],
            dominantWindDrift: { speedKmh: 12, cardinal: 'SSW', bearingDeg: 200 }
          }
        }
      );

      const detail = await logbookManager.getFlightDetail('fl_mgr_detail');
      assert.ok(detail);
      assert.equal(detail.meta.site, 'Bassano del Grappa');
      assert.equal(detail.telemetry.thermals.length, 1);
      assert.equal(detail.telemetry.dominantWindDrift.cardinal, 'SSW');

      // Update notes
      const updated = await logbookManager.updateFlightNotes('fl_mgr_detail', 'Volo didattico con virate regolari.');
      assert.equal(updated.notes, 'Volo didattico con virate regolari.');

      const refreshed = await logbookManager.getFlightDetail('fl_mgr_detail');
      assert.equal(refreshed.meta.notes, 'Volo didattico con virate regolari.');
    });
  });

  describe('Storage Persistence Safe Check (Node.js fallback)', () => {
    it('should return supported: false without throwing under Node.js runtime', async () => {
      const status = await requestStoragePersistence();
      assert.equal(typeof status.persisted, 'boolean');
      assert.equal(status.supported, false);
    });
  });
});
