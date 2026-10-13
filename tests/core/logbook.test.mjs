import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePilotPeriodMetrics,
  calculateMonthlyFlightActivity,
  calculatePersonalRecords,
  checkFlightRecordFlags,
  createFlightLogEntry,
  deduceFlightActivitiesFromTrack,
  hasAttachedTrack,
  DEFAULT_SEED_FLIGHTS,
  FLIGHT_TYPES,
  PILOT_CURRENCY_STATUS,
  PILOT_CURRENCY_LABELS,
  ITALIAN_MONTHS_SHORT
} from '../../core/logbook.js';

describe('GlideMind Flight Logbook & Pilot Currency Analytics (Headless Core)', () => {
  const refDate = '2026-10-08';

  it('should calculate accurate metrics for 30-day rolling window with dual-activity flights', () => {
    const metrics = calculatePilotPeriodMetrics({
      flights: DEFAULT_SEED_FLIGHTS,
      period: 'month',
      referenceDate: refDate
    });

    assert.equal(metrics.period, 'month');
    assert.equal(metrics.periodLabel, 'Ultimi 30 Giorni');
    // Flights in 30 days (since 2026-09-08):
    // 2026-10-03 (Cornizzolo, 74m, thermals)
    // 2026-09-28 (Bassano, 45m, BOTH thermals AND exercises!)
    // 2026-09-15 (Meduno, 62m, thermals)
    // Total = 181 min = 3.0 h
    assert.equal(metrics.totalMinutes, 181);
    assert.equal(metrics.totalHours, 3.0);
    assert.equal(metrics.formattedHours, '3 h');
    assert.equal(metrics.thermalSessions, 3);
    assert.equal(metrics.exerciseSessions, 1);
    assert.equal(metrics.totalSessions, 3);
    assert.equal(metrics.isCurrent, true);
    assert.equal(metrics.currencyStatus, 'active');
    assert.equal(metrics.currencyLabel, 'In attività');
    assert.equal(metrics.daysSinceLastFlight, 5);
  });

  it('should calculate accurate metrics for 365-day rolling window', () => {
    const metrics = calculatePilotPeriodMetrics({
      flights: DEFAULT_SEED_FLIGHTS,
      period: 'year',
      referenceDate: refDate
    });

    assert.equal(metrics.period, 'year');
    assert.equal(metrics.periodLabel, 'Ultimo Anno');
    // All 7 flights: 74 + 45 + 62 + 38 + 95 + 52 + 80 = 446 min = 7.4 h
    assert.equal(metrics.totalMinutes, 446);
    assert.equal(metrics.totalHours, 7.4);
    assert.equal(metrics.formattedHours, '7.4 h');
    // 5 flights with thermals (fl-1, fl-2, fl-3, fl-5, fl-7)
    assert.equal(metrics.thermalSessions, 5);
    // 4 flights with exercises (fl-2, fl-4, fl-5, fl-6)
    assert.equal(metrics.exerciseSessions, 4);
    assert.equal(metrics.totalSessions, 7);
    assert.equal(metrics.isCurrent, true);
  });

  it('should detect reentry currency when flights exist within 36-90 days', () => {
    const oldFlights = [
      {
        id: 'old-1',
        date: '2026-08-01',
        site: 'Monte Cornizzolo',
        durationMinutes: 60,
        hasThermals: true,
        hasExercises: false
      }
    ];

    const metrics = calculatePilotPeriodMetrics({
      flights: oldFlights,
      period: 'month',
      referenceDate: refDate
    });

    assert.equal(metrics.totalMinutes, 0);
    assert.equal(metrics.totalHours, 0);
    assert.equal(metrics.thermalSessions, 0);
    assert.equal(metrics.isCurrent, false);
    assert.equal(metrics.currencyStatus, 'reentry');
    assert.equal(metrics.currencyLabel, 'Ripresa graduale');
    assert.equal(metrics.daysSinceLastFlight, 68);
  });

  it('should detect lapsed currency when flights are older than 90 days', () => {
    const lapsedFlights = [
      {
        id: 'lapsed-1',
        date: '2026-05-01',
        site: 'Bassano del Grappa',
        durationMinutes: 45,
        hasThermals: true,
        hasExercises: false
      }
    ];

    const metrics = calculatePilotPeriodMetrics({
      flights: lapsedFlights,
      period: 'month',
      referenceDate: refDate
    });

    assert.equal(metrics.totalMinutes, 0);
    assert.equal(metrics.isCurrent, false);
    assert.equal(metrics.currencyStatus, 'lapsed');
    assert.equal(metrics.currencyLabel, 'Fermo prolungato');
    assert.ok(metrics.daysSinceLastFlight > 90);
  });

  it('should handle empty or null flight arrays gracefully with no_flights currency', () => {
    const metrics = calculatePilotPeriodMetrics({
      flights: null,
      period: 'month',
      referenceDate: refDate
    });

    assert.equal(metrics.totalMinutes, 0);
    assert.equal(metrics.totalHours, 0);
    assert.equal(metrics.thermalSessions, 0);
    assert.equal(metrics.exerciseSessions, 0);
    assert.equal(metrics.isCurrent, false);
    assert.equal(metrics.currencyStatus, 'no_flights');
    assert.equal(metrics.currencyLabel, 'Nessun volo');
    assert.equal(metrics.daysSinceLastFlight, null);
    assert.equal(metrics.lastFlight, null);
  });

  it('should validate, normalize, and freeze new flight log entries with deduced activities', () => {
    const entry = createFlightLogEntry({
      date: '2026-10-08',
      site: '  Bassano del Grappa  ',
      durationMinutes: '65',
      notes: 'Provato orecchie e wingover controllati'
    });

    assert.ok(entry.id.startsWith('fl-'));
    assert.equal(entry.date, '2026-10-08');
    assert.equal(entry.site, 'Bassano del Grappa');
    assert.equal(entry.durationMinutes, 65);
    assert.equal(entry.hasExercises, true);
    assert.equal(entry.hasThermals, false);
    assert.equal(entry.type, 'exercise');
    assert.equal(entry.notes, 'Provato orecchie e wingover controllati');
    assert.ok(Object.isFrozen(entry));
  });

  it('should support dual-activity flights where pilot does BOTH thermals AND exercises in the same flight', () => {
    const entry = createFlightLogEntry({
      date: '2026-10-08',
      site: 'Monte Cornizzolo',
      durationMinutes: 75,
      notes: 'Salita in termica su Corno Birone e poi discesa con esercizi di 360 e rollio'
    });

    assert.equal(entry.hasThermals, true, 'Must automatically deduce thermal activity from flight debriefing');
    assert.equal(entry.hasExercises, true, 'Must automatically deduce exercise activity from flight debriefing');
    assert.equal(entry.type, 'both');
  });

  it('should apply safe defaults on createFlightLogEntry when parameters are omitted', () => {
    const entry = createFlightLogEntry({});

    assert.ok(entry.id);
    assert.ok(entry.date);
    assert.equal(entry.site, 'Località non specificata');
    assert.equal(entry.durationMinutes, 30);
    assert.equal(entry.hasThermals, false);
    assert.equal(entry.hasExercises, false);
    assert.equal(entry.type, 'glide');
    assert.equal(entry.notes, '');
  });

  describe('Monthly Flight Activity Aggregation', () => {
    it('should return 12 empty months when flights array is empty', () => {
      const res = calculateMonthlyFlightActivity([], { referenceDate: refDate });
      assert.equal(res.months.length, 12);
      assert.equal(res.totalMinutes, 0);
      assert.equal(res.totalHours, 0);
      assert.equal(res.formattedHours, '0 h');
      assert.equal(res.totalFlights, 0);
      assert.equal(res.maxMonthlyHours, 0);
      assert.equal(res.maxMonthlyFlights, 0);
      assert.equal(res.activeMonthsCount, 0);

      // Verify months are chronologically sorted and the last one is the current month
      const currentMonth = res.months[11];
      assert.equal(currentMonth.year, 2026);
      assert.equal(currentMonth.month, 10);
      assert.equal(currentMonth.monthKey, '2026-10');
      assert.equal(currentMonth.label, 'Ott');
      assert.equal(currentMonth.isCurrentMonth, true);

      // First month should be 11 months prior (Nov 2025)
      const firstMonth = res.months[0];
      assert.equal(firstMonth.year, 2025);
      assert.equal(firstMonth.month, 11);
      assert.equal(firstMonth.monthKey, '2025-11');
      assert.equal(firstMonth.label, 'Nov');
      assert.equal(firstMonth.isCurrentMonth, false);
    });

    it('should aggregate flight hours and counts accurately from DEFAULT_SEED_FLIGHTS', () => {
      const res = calculateMonthlyFlightActivity(DEFAULT_SEED_FLIGHTS, { referenceDate: refDate });
      assert.equal(res.months.length, 12);
      assert.equal(res.totalFlights, 7);
      // Total minutes: 74 + 45 + 62 + 38 + 95 + 52 + 80 = 446 min = 7.4 h
      assert.equal(res.totalMinutes, 446);
      assert.equal(res.totalHours, 7.4);
      assert.equal(res.formattedHours, '7.4 h');
      assert.equal(res.activeMonthsCount, 6); // Apr, May, Jul, Aug, Sep, Oct

      // Month 2026-10 (Ott): 1 flight, 74 min = 1.2 h
      const oct = res.months.find(m => m.monthKey === '2026-10');
      assert.ok(oct);
      assert.equal(oct.flightCount, 1);
      assert.equal(oct.totalMinutes, 74);
      assert.equal(oct.totalHours, 1.2);
      assert.equal(oct.isCurrentMonth, true);

      // Month 2026-09 (Set): 2 flights, 45 + 62 = 107 min = 1.8 h
      const sep = res.months.find(m => m.monthKey === '2026-09');
      assert.ok(sep);
      assert.equal(sep.flightCount, 2);
      assert.equal(sep.totalMinutes, 107);
      assert.equal(sep.totalHours, 1.8);

      // Month 2026-06 (Giu): 0 flights
      const jun = res.months.find(m => m.monthKey === '2026-06');
      assert.ok(jun);
      assert.equal(jun.flightCount, 0);
      assert.equal(jun.totalHours, 0);

      // Max values
      assert.equal(res.maxMonthlyFlights, 2);
      assert.equal(res.maxMonthlyHours, 1.8);
    });

    it('should support custom monthsCount window (e.g. 6 months)', () => {
      const res = calculateMonthlyFlightActivity(DEFAULT_SEED_FLIGHTS, {
        referenceDate: refDate,
        monthsCount: 6
      });
      assert.equal(res.months.length, 6);
      // Window: May 2026 to Oct 2026
      assert.equal(res.months[0].monthKey, '2026-05');
      assert.equal(res.months[5].monthKey, '2026-10');
      // Flights in window: May (52m), Jul (95m), Aug (38m), Sep (45+62=107m), Oct (74m) = 366 min = 6.1 h
      assert.equal(res.totalFlights, 6);
      assert.equal(res.totalHours, 6.1);
    });

    it('should handle ISO dates with timestamps and Date objects seamlessly', () => {
      const mixedFlights = [
        { id: '1', date: '2026-10-01T14:30:00.000Z', durationMinutes: 60 },
        { id: '2', date: new Date('2026-09-15T09:00:00Z'), durationMinutes: 30 }
      ];
      const res = calculateMonthlyFlightActivity(mixedFlights, { referenceDate: refDate });
      assert.equal(res.totalFlights, 2);
      assert.equal(res.totalHours, 1.5);
    });
  });

  describe('Career Personal Records & Record Flags (Headless Core)', () => {
    const testFlights = [
      {
        id: 'fl-1',
        flightNumber: 10,
        date: '2026-10-10',
        siteName: 'Decollo Ciavanis',
        maxAltMsl: 2037,
        maxGainMeters: 260,
        durationMinutes: 36,
        distanceKm: 19.7,
        thermalsCount: 5,
        maxClimbRate: 3.5,
        maxSinkRate: -4.2
      },
      {
        id: 'fl-2',
        flightNumber: 9,
        date: '2026-09-20',
        siteName: 'Monte Cornizzolo',
        maxAltMsl: 1850,
        maxGainMeters: 850,
        durationMinutes: 120,
        distanceKm: 14.2,
        thermalsCount: 2,
        maxClimbRate: 4.1,
        maxSinkRate: -2.1
      },
      {
        id: 'fl-3',
        // No flightNumber explicit -> total (3) - index (2) = 1
        date: '2026-08-15',
        siteName: 'Bassano',
        maxAltMsl: 1200,
        maxGainMeters: 400,
        durationMinutes: 45,
        distanceKm: 8.0,
        thermalsCount: 1,
        maxClimbRate: 2.0,
        maxSinkRate: -1.8
      }
    ];

    it('should calculate career personal records accurately with flight metadata attribution', () => {
      const records = calculatePersonalRecords(testFlights);

      // Max altitude: fl-1 (2037 m, #10)
      assert.equal(records.maxAlt.val, 2037);
      assert.equal(records.maxAlt.flightId, 'fl-1');
      assert.equal(records.maxAlt.flightNumber, 10);
      assert.equal(records.maxAlt.site, 'Decollo Ciavanis');

      // Max gain: fl-2 (+850 m, #9)
      assert.equal(records.maxGain.val, 850);
      assert.equal(records.maxGain.flightId, 'fl-2');
      assert.equal(records.maxGain.flightNumber, 9);
      assert.equal(records.maxGain.site, 'Monte Cornizzolo');

      // Max duration: fl-2 (120 min, #9)
      assert.equal(records.maxDuration.val, 120);
      assert.equal(records.maxDuration.flightId, 'fl-2');
      assert.equal(records.maxDuration.flightNumber, 9);

      // Max distance: fl-1 (19.7 km, #10)
      assert.equal(records.maxDistance.val, 19.7);
      assert.equal(records.maxDistance.flightId, 'fl-1');
      assert.equal(records.maxDistance.flightNumber, 10);

      // Max thermals: fl-1 (5 thermals, #10)
      assert.equal(records.maxThermals.val, 5);
      assert.equal(records.maxThermals.flightId, 'fl-1');
      assert.equal(records.maxThermals.flightNumber, 10);

      // Max climb rate (max vario): fl-2 (4.1 m/s, #9)
      assert.equal(records.maxClimbRate.val, 4.1);
      assert.equal(records.maxClimbRate.flightId, 'fl-2');
      assert.equal(records.maxClimbRate.flightNumber, 9);
      assert.equal(records.maxVario.val, 4.1);

      // Max sink rate (min vario): fl-1 (-4.2 m/s, #10)
      assert.equal(records.maxSinkRate.val, -4.2);
      assert.equal(records.maxSinkRate.flightId, 'fl-1');
      assert.equal(records.maxSinkRate.flightNumber, 10);
      assert.equal(records.minVario.val, -4.2);
    });

    it('should deduce flightNumber from progressive position when omitted', () => {
      const flightsWithoutNumbers = [
        { id: 'f-newest', durationMinutes: 50 },
        { id: 'f-oldest', durationMinutes: 90 }
      ];
      const records = calculatePersonalRecords(flightsWithoutNumbers);

      // Longest flight is f-oldest at index 1 -> total (2) - index (1) = 1
      assert.equal(records.maxDuration.val, 90);
      assert.equal(records.maxDuration.flightId, 'f-oldest');
      assert.equal(records.maxDuration.flightNumber, 1);
    });

    it('should return empty records safely for empty or invalid flight arrays', () => {
      const records = calculatePersonalRecords([]);
      assert.equal(records.maxAlt.val, 0);
      assert.equal(records.maxAlt.flightId, null);
      assert.equal(records.maxAlt.flightNumber, null);
      assert.equal(records.maxGain.val, 0);
      assert.equal(records.maxDuration.val, 0);
      assert.equal(records.maxDistance.val, 0);
      assert.equal(records.maxThermals.val, 0);
      assert.equal(records.maxClimbRate.val, 0);
      assert.equal(records.maxSinkRate.val, 0);
    });

    it('should identify which metrics of a specific flight are records with checkFlightRecordFlags', () => {
      const records = calculatePersonalRecords(testFlights);

      // fl-1 has maxAlt (2037), maxDistance (19.7), maxThermals (5), maxSinkRate (-4.2)
      const flags1 = checkFlightRecordFlags(testFlights[0], records);
      assert.equal(flags1.isMaxAlt, true);
      assert.equal(flags1.isMaxDistance, true);
      assert.equal(flags1.isMaxThermals, true);
      assert.equal(flags1.isMaxSinkRate, true);
      assert.equal(flags1.isMinVario, true);
      assert.equal(flags1.isMaxGain, false);
      assert.equal(flags1.isMaxDuration, false);
      assert.equal(flags1.isMaxClimbRate, false);
      assert.equal(flags1.hasAnyRecord, true);

      // fl-2 has maxGain (850), maxDuration (120), maxClimbRate (4.1)
      const flags2 = checkFlightRecordFlags(testFlights[1], records);
      assert.equal(flags2.isMaxAlt, false);
      assert.equal(flags2.isMaxDistance, false);
      assert.equal(flags2.isMaxThermals, false);
      assert.equal(flags2.isMaxSinkRate, false);
      assert.equal(flags2.isMaxGain, true);
      assert.equal(flags2.isMaxDuration, true);
      assert.equal(flags2.isMaxClimbRate, true);
      assert.equal(flags2.isMaxVario, true);
      assert.equal(flags2.hasAnyRecord, true);

      // fl-3 has no records
      const flags3 = checkFlightRecordFlags(testFlights[2], records);
      assert.equal(flags3.isMaxAlt, false);
      assert.equal(flags3.isMaxDistance, false);
      assert.equal(flags3.isMaxThermals, false);
      assert.equal(flags3.isMaxSinkRate, false);
      assert.equal(flags3.isMaxGain, false);
      assert.equal(flags3.isMaxDuration, false);
      assert.equal(flags3.isMaxClimbRate, false);
      assert.equal(flags3.hasAnyRecord, false);
    });

    it('should handle null flightMeta or careerRecords safely in checkFlightRecordFlags', () => {
      const safe = checkFlightRecordFlags(null, null);
      assert.equal(safe.hasAnyRecord, false);
      assert.equal(safe.isMaxAlt, false);
    });
  });

  describe('hasAttachedTrack - Authentic GPS Track Presence Verification', () => {
    it('should return true when flight meta has hasDecimatedTrack: true or hasRawIgc: true', () => {
      assert.equal(hasAttachedTrack({ hasDecimatedTrack: true }), true);
      assert.equal(hasAttachedTrack({ hasRawIgc: true }), true);
    });

    it('should return true when flight has decimatedPoints or points array with >= 2 items', () => {
      assert.equal(hasAttachedTrack({ decimatedPoints: [{ lat: 45, lon: 9 }, { lat: 45.1, lon: 9.1 }] }), true);
      assert.equal(hasAttachedTrack({ points: [{ lat: 45, lon: 9 }, { lat: 45.1, lon: 9.1 }] }), true);
      assert.equal(hasAttachedTrack({ rawPoints: [{ lat: 45, lon: 9 }, { lat: 45.1, lon: 9.1 }] }), true);
    });

    it('should return true when flight has rawIgc text', () => {
      assert.equal(hasAttachedTrack({ rawIgc: 'B1200004550000N00918000EA0100001050\nB1200014550010N00918010EA0100201052' }), true);
    });

    it('should return true for flight bundle with track in raw or meta', () => {
      const bundle = {
        meta: { id: 'fl-test', site: 'Cornizzolo', hasDecimatedTrack: true },
        raw: { decimatedPoints: [{ lat: 45, lon: 9 }, { lat: 45.1, lon: 9.1 }] }
      };
      assert.equal(hasAttachedTrack(bundle), true);
    });

    it('should return false when flight is marked isReconstructed: true', () => {
      assert.equal(hasAttachedTrack({ isReconstructed: true, hasDecimatedTrack: true, decimatedPoints: [{}, {}] }), false);
    });

    it('should return false for flight without GPS recording (e.g. Excel flight #50)', () => {
      const flight50 = {
        id: 'fl_excel_1787747985586_10',
        site: 'Ciavanis -> PeterPan',
        takeoffAltMsl: 1777,
        landingAltMsl: 912,
        maxAltMsl: 2037,
        durationMinutes: 36,
        hasDecimatedTrack: false,
        hasRawIgc: false,
        decimatedPoints: [],
        rawIgc: null
      };
      assert.equal(hasAttachedTrack(flight50), false);
    });

    it('should return false for default seed demo flights without GPS tracks', () => {
      assert.equal(hasAttachedTrack(DEFAULT_SEED_FLIGHTS[0]), false);
      assert.equal(hasAttachedTrack(DEFAULT_SEED_FLIGHTS[1]), false);
    });

    it('should handle null, undefined, empty object safely without throwing', () => {
      assert.equal(hasAttachedTrack(null), false);
      assert.equal(hasAttachedTrack(undefined), false);
      assert.equal(hasAttachedTrack({}), false);
      assert.equal(hasAttachedTrack({ points: [] }), false);
      assert.equal(hasAttachedTrack({ points: [{ lat: 45, lon: 9 }] }), false);
    });
  });
});

