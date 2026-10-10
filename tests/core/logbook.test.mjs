import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePilotPeriodMetrics,
  createFlightLogEntry,
  deduceFlightActivitiesFromTrack,
  DEFAULT_SEED_FLIGHTS,
  FLIGHT_TYPES,
  PILOT_CURRENCY_STATUS,
  PILOT_CURRENCY_LABELS
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
});
