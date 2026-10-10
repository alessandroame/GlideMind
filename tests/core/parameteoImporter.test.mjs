/**
 * GlideMind - ParaMeteo Flight Importer Test Suite
 * 
 * Verifies headless parsing, schema normalization, track decimation,
 * idempotent Last-Write-Wins merging, and reactive store synchronization
 * for ParaMeteo V1, V2, and bare JSON exports.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseParaMeteoBackup,
  convertParaMeteoFlight,
  importParaMeteoData
} from '../../core/parameteoImporter.js';
import {
  createMemoryDbAdapter,
  logbookManager
} from '../../core/logbookDb.js';
import { createStore, createInMemoryStorageAdapter } from '../../core/store.js';

describe('ParaMeteo Importer - Headless Core Contracts', () => {
  // Synthetic sample track points (20 points for fast tests)
  const sampleTrackPoints = Array.from({ length: 20 }, (_, i) => ({
    timeSeconds: i * 30,
    timeFormatted: `13:${String(Math.floor(i / 2)).padStart(2, '0')}:00`,
    lat: 45.82 + i * 0.001,
    lon: 9.31 + i * 0.001,
    alt: 1000 + (i < 10 ? i * 50 : 500 - (i - 10) * 40),
    vario: i < 10 ? 1.6 : -1.3
  }));

  const sampleV2Backup = {
    app: 'ParaMeteo',
    version: 2,
    exportedAt: '2026-04-15T16:00:00.000Z',
    meta: {
      flightsCount: 2,
      tracksCount: 1
    },
    database: {
      flights: [
        {
          id: 'fl_pm_001',
          date: '2026-04-14',
          utcDate: '2026-04-14T12:00:00.000Z',
          takeoffTime: '13:00',
          landingTime: '13:45',
          durationMinutes: 45,
          durationSeconds: 2700,
          takeoffLocationName: 'Cornizzolo',
          landingLocationName: 'Suello',
          siteName: 'Cornizzolo -> Suello',
          pilot: 'Marco',
          gear: { glider: 'Axis Compact 4' },
          notes: 'Primo volo primaverile in termica debole.',
          stats: {
            takeoffAltitude: 1050,
            landingAltitude: 280,
            minAltitude: 270,
            maxAltitude: 1500,
            maxGainMeters: 450,
            maxClimb: 2.5,
            maxSink: -2.1,
            totalDistanceKm: 12.4,
            accumulatedClimbMeters: 620,
            thermalCount: 2
          },
          telemetry: {
            thermals: [{ thermalIndex: 1, netGain: 250 }],
            detectedManeuverKeys: ['360_turn']
          },
          updatedAt: '2026-04-14T15:00:00.000Z',
          isDeleted: false
        },
        {
          id: 'fl_pm_002',
          date: '2026-04-15',
          takeoffTime: '11:30',
          landingTime: '12:00',
          durationMinutes: 30,
          site: 'Bassano del Grappa',
          siteName: 'Decollo Stella -> Garden Relais',
          pilot: 'Marco',
          glider: 'Ozone Rush 6 (EN-B)',
          notes: '',
          stats: {
            takeoffAltitude: 850,
            landingAltitude: 190,
            maxAltitude: 1200,
            maxGainMeters: 350,
            maxClimb: 1.8,
            maxSink: -1.5,
            totalDistanceKm: 8.0,
            accumulatedClimbMeters: 400,
            thermalCount: 1
          },
          updatedAt: '2026-04-15T13:00:00.000Z',
          isDeleted: false
        },
        {
          id: 'fl_pm_deleted',
          date: '2026-04-10',
          siteName: 'Volo Cancellato',
          isDeleted: true
        }
      ],
      flightTracks: [
        {
          flightId: 'fl_pm_001',
          trackPoints: sampleTrackPoints,
          telemetry: {
            thermalCount: 2,
            thermals: [{ thermalIndex: 1, netGain: 250 }],
            accumulatedClimbMeters: 620,
            detectedManeuverKeys: ['360_turn']
          }
        }
      ]
    }
  };

  const sampleV1Backup = {
    app: 'ParaMeteo',
    version: 1,
    totalFlights: 1,
    flights: [
      {
        id: 'fl_v1_001',
        date: '2026-03-20',
        siteName: 'Alpe Giumello -> Taceno',
        takeoffTime: '14:00',
        landingTime: '14:35',
        durationMinutes: 35,
        glider: 'Niviuk Hook 5',
        notes: 'Dinamica di cresta pulita.',
        trackPoints: sampleTrackPoints,
        stats: {
          maxAltitude: 1650,
          maxGainMeters: 300,
          maxClimb: 2.1,
          maxSink: -1.8,
          totalDistanceKm: 9.5
        },
        updatedAt: '2026-03-20T16:00:00.000Z'
      }
    ]
  };

  const sampleBareArray = [
    {
      id: 'fl_bare_001',
      date: '2026-02-10',
      siteName: 'Col Rodella',
      durationMinutes: 50,
      glider: 'Advance Epsilon 9',
      notes: 'Panorama dolomitico spettacolare.',
      updatedAt: 1740000000000
    }
  ];

  describe('parseParaMeteoBackup Schema Validation', () => {
    it('should reject empty or null payloads', () => {
      assert.equal(parseParaMeteoBackup(null).isValid, false);
      assert.equal(parseParaMeteoBackup('').isValid, false);
      assert.equal(parseParaMeteoBackup('   ').isValid, false);
    });

    it('should reject invalid JSON strings with syntax error details', () => {
      const res = parseParaMeteoBackup('{ invalid json string ...');
      assert.equal(res.isValid, false);
      assert.ok(res.error.includes('JSON parse error'));
    });

    it('should parse V2 Full Backup packages and reconcile tracks', () => {
      const res = parseParaMeteoBackup(JSON.stringify(sampleV2Backup));
      assert.equal(res.isValid, true);
      assert.equal(res.version, 2);
      assert.equal(res.flights.length, 2); // Excludes deleted flight
      assert.equal(res.tracksMap.size, 1);
      assert.ok(res.tracksMap.has('fl_pm_001'));
      assert.equal(res.summary.flightsCount, 2);
      assert.equal(res.summary.tracksCount, 1);
    });

    it('should parse V1 Logbook packages with embedded track points', () => {
      const res = parseParaMeteoBackup(sampleV1Backup);
      assert.equal(res.isValid, true);
      assert.equal(res.version, 1);
      assert.equal(res.flights.length, 1);
      assert.equal(res.tracksMap.size, 1);
      assert.ok(res.tracksMap.has('fl_v1_001'));
      assert.equal(res.summary.flightsCount, 1);
      assert.equal(res.summary.tracksCount, 1);
    });

    it('should parse bare flights JSON array (version 0)', () => {
      const res = parseParaMeteoBackup(sampleBareArray);
      assert.equal(res.isValid, true);
      assert.equal(res.version, 0);
      assert.equal(res.flights.length, 1);
      assert.equal(res.flights[0].id, 'fl_bare_001');
    });

    it('should reject unsupported JSON objects lacking flights collection', () => {
      const res = parseParaMeteoBackup({ foo: 'bar', timestamp: 12345 });
      assert.equal(res.isValid, false);
      assert.ok(res.error.includes('Unrecognized backup structure'));
    });
  });

  describe('convertParaMeteoFlight Normalization', () => {
    it('should normalize flight with track into dual-level GlideMind schema', () => {
      const rawFlight = sampleV2Backup.database.flights[0];
      const trackData = sampleV2Backup.database.flightTracks[0];

      const { meta, raw } = convertParaMeteoFlight(rawFlight, trackData);

      // Verify meta
      assert.equal(meta.id, 'fl_pm_001');
      assert.equal(meta.date, '2026-04-14');
      assert.equal(meta.takeoffTime, '13:00');
      assert.equal(meta.landingTime, '13:45');
      assert.equal(meta.durationMinutes, 45);
      assert.equal(meta.durationSeconds, 2700);
      assert.equal(meta.site, 'Cornizzolo');
      assert.equal(meta.siteName, 'Cornizzolo -> Suello');
      assert.equal(meta.takeoffLocationName, 'Cornizzolo');
      assert.equal(meta.landingLocationName, 'Suello');
      assert.equal(meta.pilot, 'Marco');
      assert.equal(meta.glider, 'Axis Compact 4');
      assert.equal(meta.gliderClass, 'EN-A');
      assert.equal(meta.maxAltMsl, 1500);
      assert.equal(meta.maxGainMeters, 450);
      assert.equal(meta.maxClimbRate, 2.5);
      assert.equal(meta.maxSinkRate, -2.1);
      assert.equal(meta.accumulatedClimbMeters, 620);
      assert.equal(meta.distanceKm, 12.4);
      assert.equal(meta.thermalsCount, 2);
      assert.equal(meta.hasThermals, true);
      assert.equal(meta.hasExercises, true);
      assert.deepEqual(meta.detectedManeuvers, ['360_turn']);
      assert.equal(meta.notes, 'Primo volo primaverile in termica debole.');
      assert.equal(meta.hasDecimatedTrack, true);

      // Verify sparkline string
      assert.equal(typeof meta.sparklineSvgPoints, 'string');
      assert.ok(meta.sparklineSvgPoints.split(' ').length > 2);

      // Verify raw
      assert.equal(raw.id, 'fl_pm_001');
      assert.equal(raw.decimatedPoints.length, 20);
      assert.equal(raw.telemetry.thermalCount, 2);
    });

    it('should deduce EN-B glider class and handle flight without track points', () => {
      const rawFlight = sampleV2Backup.database.flights[1];
      const { meta, raw } = convertParaMeteoFlight(rawFlight, null);

      assert.equal(meta.id, 'fl_pm_002');
      assert.equal(meta.glider, 'Ozone Rush 6 (EN-B)');
      assert.equal(meta.gliderClass, 'EN-B');
      assert.equal(meta.hasDecimatedTrack, false);
      assert.equal(raw.decimatedPoints.length, 0);
    });

    it('should generate deterministic fallback fingerprint when flight id is missing', () => {
      const flightWithoutId = {
        date: '2026-05-01',
        siteName: 'Monte Valandra',
        durationMinutes: 25
      };

      const { meta, raw } = convertParaMeteoFlight(flightWithoutId, null);
      assert.ok(meta.id.startsWith('fl_20260501_'));
      assert.equal(raw.id, meta.id);
    });
  });

  describe('importParaMeteoData Ingestion & Store Synchronization', () => {
    let mockManager;
    let storeInstance;

    beforeEach(() => {
      storeInstance = createStore({ flights: [] }, createInMemoryStorageAdapter());
      const memDb = createMemoryDbAdapter();

      mockManager = {
        adapter: memDb,
        async getFlight(id) {
          return memDb.getFlight(id);
        },
        async getAllFlights() {
          return memDb.getAllFlightMetas();
        },
        async saveFlight(meta, raw) {
          return memDb.saveFlight(meta, raw);
        }
      };
    });

    it('should import full V2 backup package with merge strategy', async () => {
      const progressSteps = [];
      const result = await importParaMeteoData(sampleV2Backup, mockManager, {
        mode: 'merge',
        onProgress: (p) => progressSteps.push(p)
      });

      assert.equal(result.success, true);
      assert.equal(result.totalFlightsInBackup, 2);
      assert.equal(result.importedFlightsCount, 2);
      assert.equal(result.newFlightsCount, 2);
      assert.equal(result.updatedFlightsCount, 0);
      assert.equal(result.skippedFlightsCount, 0);
      assert.equal(result.tracksImportedCount, 1);
      assert.ok(progressSteps.length > 0);
      assert.equal(progressSteps[progressSteps.length - 1], 100);

      // Verify adapter storage
      const metas = await mockManager.adapter.getAllFlightMetas();
      assert.equal(metas.length, 2);

      const f1 = await mockManager.adapter.getFlight('fl_pm_001');
      assert.ok(f1);
      assert.equal(f1.meta.site, 'Cornizzolo');
      assert.equal(f1.raw.decimatedPoints.length, 20);

      const f2 = await mockManager.adapter.getFlight('fl_pm_002');
      assert.ok(f2);
      assert.equal(f2.meta.gliderClass, 'EN-B');
    });

    it('should be idempotent on second import with merge (Last-Write-Wins)', async () => {
      // First import
      await importParaMeteoData(sampleV2Backup, mockManager, { mode: 'merge' });

      // Second identical import
      const secondResult = await importParaMeteoData(sampleV2Backup, mockManager, { mode: 'merge' });

      assert.equal(secondResult.success, true);
      assert.equal(secondResult.importedFlightsCount, 0);
      assert.equal(secondResult.newFlightsCount, 0);
      assert.equal(secondResult.updatedFlightsCount, 0);
      assert.equal(secondResult.skippedFlightsCount, 2);

      const metas = await mockManager.adapter.getAllFlightMetas();
      assert.equal(metas.length, 2);
    });

    it('should update flight if incoming backup has newer updatedAt timestamp', async () => {
      // First import
      await importParaMeteoData(sampleV2Backup, mockManager, { mode: 'merge' });

      // Create updated payload with newer timestamp and revised notes
      const updatedPayload = {
        ...sampleV2Backup,
        database: {
          ...sampleV2Backup.database,
          flights: [
            {
              ...sampleV2Backup.database.flights[0],
              notes: 'Note aggiornate con debriefing dettagliato.',
              updatedAt: '2026-05-01T10:00:00.000Z'
            }
          ],
          flightTracks: []
        }
      };

      const result = await importParaMeteoData(updatedPayload, mockManager, { mode: 'merge' });
      assert.equal(result.importedFlightsCount, 1);
      assert.equal(result.updatedFlightsCount, 1);

      const refreshed = await mockManager.adapter.getFlight('fl_pm_001');
      assert.equal(refreshed.meta.notes, 'Note aggiornate con debriefing dettagliato.');
    });

    it('should overwrite existing records unconditionally when mode is overwrite', async () => {
      // First import
      await importParaMeteoData(sampleV2Backup, mockManager, { mode: 'merge' });

      // Second import with overwrite
      const overwriteResult = await importParaMeteoData(sampleV2Backup, mockManager, { mode: 'overwrite' });

      assert.equal(overwriteResult.success, true);
      assert.equal(overwriteResult.importedFlightsCount, 2);
      assert.equal(overwriteResult.newFlightsCount, 2);
      assert.equal(overwriteResult.skippedFlightsCount, 0);
    });

    it('should import V1 logbook export seamlessly', async () => {
      const res = await importParaMeteoData(sampleV1Backup, mockManager);
      assert.equal(res.success, true);
      assert.equal(res.importedFlightsCount, 1);
      assert.equal(res.tracksImportedCount, 1);

      const stored = await mockManager.adapter.getFlight('fl_v1_001');
      assert.ok(stored);
      assert.equal(stored.meta.siteName, 'Alpe Giumello -> Taceno');
      assert.equal(stored.raw.decimatedPoints.length, 20);
    });

    it('should import bare flights array seamlessly', async () => {
      const res = await importParaMeteoData(sampleBareArray, mockManager);
      assert.equal(res.success, true);
      assert.equal(res.importedFlightsCount, 1);

      const stored = await mockManager.adapter.getFlight('fl_bare_001');
      assert.ok(stored);
      assert.equal(stored.meta.siteName, 'Col Rodella');
      assert.equal(stored.meta.glider, 'Advance Epsilon 9');
    });
  });

  describe('LogbookManager Singleton Integration', () => {
    it('should support importParaMeteoBackup via logbookManager', async () => {
      await logbookManager.clearAll();

      const res = await logbookManager.importParaMeteoBackup(sampleV2Backup);
      assert.equal(res.success, true);
      assert.equal(res.importedFlightsCount, 2);

      const flights = await logbookManager.getAllFlights();
      assert.equal(flights.length, 2);
    });
  });
});
