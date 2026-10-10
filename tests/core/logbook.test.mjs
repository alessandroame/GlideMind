import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePilotPeriodMetrics,
  calculateMonthlyFlightActivity,
  createFlightLogEntry,
  deduceFlightActivitiesFromTrack,
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
});
