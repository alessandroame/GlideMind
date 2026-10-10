import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDateIso,
  parseDateIso,
  addDays,
  formatShortDate,
  getDayName,
  diffDaysIso,
  classifyForecastHorizon,
  getSmartDatePresets,
  getPastDatePresets,
  getAvailableCalendarDates,
  normalizeDateFlyability,
  attachFlyabilityToCalendarDates
} from '../../core/datePresets.js';

describe('GlideMind Phase 4 - Smart Date Selector & Calendar Presets Engine', () => {
  it('should format and parse ISO dates accurately without UTC shift', () => {
    const d = new Date(2026, 9, 9, 23, 30, 0); // 9 Oct 2026 local time
    const iso = formatDateIso(d);
    assert.equal(iso, '2026-10-09');

    const parsed = parseDateIso('2026-10-09');
    assert.equal(parsed.getFullYear(), 2026);
    assert.equal(parsed.getMonth(), 9); // October (0-indexed)
    assert.equal(parsed.getDate(), 9);

    const fallback = parseDateIso('invalid');
    assert.ok(fallback instanceof Date);
    assert.ok(!isNaN(fallback.getTime()));
  });

  it('should add days and calculate date diffs reliably', () => {
    const base = parseDateIso('2026-10-09');
    const plus3 = addDays(base, 3);
    assert.equal(formatDateIso(plus3), '2026-10-12');

    const diff = diffDaysIso('2026-10-09', '2026-10-14');
    assert.equal(diff, 5);
  });

  it('should format short date and day names in Italian', () => {
    const date = parseDateIso('2026-10-10'); // Saturday
    assert.equal(formatShortDate(date), '10 Ott');
    assert.equal(getDayName(date, false), 'Sabato');
    assert.equal(getDayName(date, true), 'Sab');
  });

  it('should generate presets for Mid-Week (Lunedì - Giovedì) with direct weekend visibility', () => {
    // 2026-10-07 is Wednesday (dayOfWeek 3)
    const refWednesday = '2026-10-07';
    const result = getSmartDatePresets(refWednesday);

    assert.equal(result.presets.length, 4);
    assert.equal(result.presets[0].label, 'Oggi');
    assert.equal(result.presets[0].isoDate, '2026-10-07');
    assert.equal(result.presets[0].isActive, true);

    assert.equal(result.presets[1].label, 'Domani');
    assert.equal(result.presets[1].isoDate, '2026-10-08');

    assert.equal(result.presets[2].label, 'Sabato');
    assert.equal(result.presets[2].isoDate, '2026-10-10');
    assert.equal(result.presets[2].isWeekend, true);

    assert.equal(result.presets[3].label, 'Domenica');
    assert.equal(result.presets[3].isoDate, '2026-10-11');
    assert.equal(result.presets[3].isWeekend, true);
  });

  it('should generate presets for Thursday (Giovedì) with consecutive weekend days', () => {
    // 2026-10-08 is Thursday (dayOfWeek 4)
    const refThursday = '2026-10-08';
    const result = getSmartDatePresets(refThursday);

    assert.equal(result.presets.length, 4);
    assert.equal(result.presets[0].label, 'Oggi');
    assert.equal(result.presets[0].isoDate, '2026-10-08');

    assert.equal(result.presets[1].label, 'Domani');
    assert.equal(result.presets[1].isoDate, '2026-10-09'); // Venerdì

    assert.equal(result.presets[2].label, 'Sabato');
    assert.equal(result.presets[2].isoDate, '2026-10-10');

    assert.equal(result.presets[3].label, 'Domenica');
    assert.equal(result.presets[3].isoDate, '2026-10-11');
  });

  it('should prevent duplicated buttons on Friday (Venerdì)', () => {
    // 2026-10-09 is Friday (dayOfWeek 5)
    const refFriday = '2026-10-09';
    const result = getSmartDatePresets(refFriday);

    // On Friday, Domani is Saturday! Should NOT have both 'Domani' and 'Sabato' buttons
    assert.equal(result.presets.length, 3);
    assert.equal(result.presets[0].label, 'Oggi');
    assert.equal(result.presets[0].isoDate, '2026-10-09');

    assert.equal(result.presets[1].label, 'Sabato');
    assert.equal(result.presets[1].isoDate, '2026-10-10');

    assert.equal(result.presets[2].label, 'Domenica');
    assert.equal(result.presets[2].isoDate, '2026-10-11');
  });

  it('should handle Saturday (Sabato) when inside the weekend', () => {
    // 2026-10-10 is Saturday (dayOfWeek 6)
    const refSaturday = '2026-10-10';
    const result = getSmartDatePresets(refSaturday);

    assert.equal(result.presets.length, 3);
    assert.equal(result.presets[0].label, 'Oggi');
    assert.equal(result.presets[0].subLabel, '10 Ott');
    assert.equal(result.presets[0].isoDate, '2026-10-10');
    assert.equal(result.presets[0].isWeekend, true);

    assert.equal(result.presets[1].label, 'Domani');
    assert.equal(result.presets[1].subLabel, '11 Ott');
    assert.equal(result.presets[1].isoDate, '2026-10-11');
    assert.equal(result.presets[1].isWeekend, true);

    assert.equal(result.presets[2].label, 'Prossimo Sab');
    assert.equal(result.presets[2].subLabel, '17 Ott');
    assert.equal(result.presets[2].isoDate, '2026-10-17');
    assert.equal(result.presets[2].isWeekend, true);
  });

  it('should handle Sunday (Domenica) when inside the weekend', () => {
    // 2026-10-11 is Sunday (dayOfWeek 0)
    const refSunday = '2026-10-11';
    const result = getSmartDatePresets(refSunday);

    assert.equal(result.presets.length, 3);
    assert.equal(result.presets[0].label, 'Oggi');
    assert.equal(result.presets[0].subLabel, '11 Ott');
    assert.equal(result.presets[0].isoDate, '2026-10-11');
    assert.equal(result.presets[0].isWeekend, true);

    assert.equal(result.presets[1].label, 'Domani');
    assert.equal(result.presets[1].subLabel, '12 Ott');
    assert.equal(result.presets[1].isoDate, '2026-10-12');

    assert.equal(result.presets[2].label, 'Prossimo Sab');
    assert.equal(result.presets[2].subLabel, '17 Ott');
    assert.equal(result.presets[2].isoDate, '2026-10-17');
  });

  it('should inject a custom chip if the user selects a custom date outside presets', () => {
    // Ref is Wednesday (2026-10-07), user picked next Wednesday (2026-10-14)
    const refWednesday = '2026-10-07';
    const customDate = '2026-10-14';
    const result = getSmartDatePresets(refWednesday, customDate);

    // Standard 4 + 1 custom chip
    assert.equal(result.presets.length, 5);
    const customChip = result.presets[4];
    assert.equal(customChip.isoDate, '2026-10-14');
    assert.equal(customChip.isCustom, true);
    assert.equal(customChip.isActive, true);
    assert.equal(result.isCustomActive, true);
    assert.equal(result.presets[0].isActive, false); // Today is not active
  });

  it('should classify meteorological forecast horizons accurately', () => {
    const horizon0 = classifyForecastHorizon(1);
    assert.equal(horizon0.level, 'high_res');
    assert.equal(horizon0.isSynoptic, false);

    const horizon5 = classifyForecastHorizon(5);
    assert.equal(horizon5.level, 'standard');
    assert.equal(horizon5.isSynoptic, false);

    const horizon10 = classifyForecastHorizon(10);
    assert.equal(horizon10.level, 'synoptic');
    assert.equal(horizon10.isSynoptic, true);
  });

  it('should provide past date presets for flight log entry', () => {
    // 2026-10-09 is Friday
    const pastPresets = getPastDatePresets('2026-10-09');
    assert.ok(pastPresets.length >= 2);
    assert.equal(pastPresets[0].label, 'Oggi');
    assert.equal(pastPresets[0].isoDate, '2026-10-09');
    assert.equal(pastPresets[1].label, 'Ieri');
    assert.equal(pastPresets[1].isoDate, '2026-10-08');

    // Should include previous Sunday (2026-10-04)
    const hasSunday = pastPresets.some(p => p.label === 'Domenica');
    assert.ok(hasSunday, 'Should offer last Sunday');
  });

  it('should generate available calendar dates up to 14 days for picker sheet', () => {
    const list = getAvailableCalendarDates('2026-10-09', 14);
    assert.equal(list.length, 14);
    assert.equal(list[0].isoDate, '2026-10-09');
    assert.equal(list[13].isoDate, '2026-10-22');
    assert.equal(typeof list[0].isWeekend, 'boolean');
    assert.ok(list[0].horizon);
    assert.ok(list[0].flyability);
    assert.equal(list[0].flyability.status, 'unknown');
    assert.equal(list[0].flyability.label, 'N/D');
  });

  it('should normalize flyability statuses across all 4 semantic colors (Verde, Giallo, Rosso, Nero)', () => {
    // 0: Verde (Flyable)
    const f0 = normalizeDateFlyability({ bestSeverity: 0, score: 85, limitingFactor: 'Vento Calmo' });
    assert.equal(f0.status, 'flyable');
    assert.equal(f0.label, 'Volabile');
    assert.equal(f0.icon, '●');
    assert.equal(f0.color, 'var(--gm-status-flyable)');
    assert.equal(f0.badgeClass, 'gm-badge-flyable');

    // 1: Giallo (Caution)
    const f1 = normalizeDateFlyability({ bestSeverity: 1, score: 65, limitingFactor: 'Vento Forte' });
    assert.equal(f1.status, 'caution');
    assert.equal(f1.label, 'Cautela');
    assert.equal(f1.icon, '▲');
    assert.equal(f1.color, 'var(--gm-status-caution)');
    assert.equal(f1.badgeClass, 'gm-badge-caution');

    // 2: Rosso (Unflyable)
    const f2 = normalizeDateFlyability({ bestSeverity: 2, score: 30, limitingFactor: 'Pioggia' });
    assert.equal(f2.status, 'unflyable');
    assert.equal(f2.label, 'Non Volabile');
    assert.equal(f2.icon, '✕');
    assert.equal(f2.color, 'var(--gm-status-unflyable)');
    assert.equal(f2.badgeClass, 'gm-badge-unflyable');

    // 3: Nero (Severe)
    const f3 = normalizeDateFlyability({ bestSeverity: 3, score: 10, limitingFactor: 'Raffiche Estreme' });
    assert.equal(f3.status, 'severe');
    assert.equal(f3.label, 'Severo');
    assert.equal(f3.icon, '⚡');
    assert.equal(f3.color, 'var(--gm-status-severe)');
    assert.equal(f3.badgeClass, 'gm-badge-severe');

    // Fallback: null
    const fNull = normalizeDateFlyability(null);
    assert.equal(fNull.status, 'unknown');
    assert.equal(fNull.label, 'N/D');
    assert.equal(fNull.icon, '○');
  });

  it('should enrich 14 calendar dates with flyability summaries', () => {
    const mockSummaries = [
      { dateStr: '2026-10-09', status: 'flyable', statusLabel: 'Volabile', bestSeverity: 0, score: 90 },
      { dateStr: '2026-10-10', status: 'caution', statusLabel: 'Cautela', bestSeverity: 1, score: 60 },
      { dateStr: '2026-10-11', status: 'unflyable', statusLabel: 'Non Volabile', bestSeverity: 2, score: 25 },
      { dateStr: '2026-10-12', status: 'severe', statusLabel: 'Severo', bestSeverity: 3, score: 10 }
    ];

    const enriched = getAvailableCalendarDates('2026-10-09', 14, mockSummaries);
    assert.equal(enriched.length, 14);

    assert.equal(enriched[0].flyability.status, 'flyable');
    assert.equal(enriched[0].flyability.label, 'Volabile');

    assert.equal(enriched[1].flyability.status, 'caution');
    assert.equal(enriched[1].flyability.label, 'Cautela');

    assert.equal(enriched[2].flyability.status, 'unflyable');
    assert.equal(enriched[2].flyability.label, 'Non Volabile');

    assert.equal(enriched[3].flyability.status, 'severe');
    assert.equal(enriched[3].flyability.label, 'Severo');

    // Days without explicit summaries fallback to unknown (N/D)
    assert.equal(enriched[4].flyability.status, 'unknown');
    assert.equal(enriched[4].flyability.label, 'N/D');
  });

  it('should attach flyability to presets in getSmartDatePresets when flyabilityMap is provided', () => {
    const mockMap = {
      '2026-10-09': { status: 'flyable', statusLabel: 'Volabile', bestSeverity: 0 },
      '2026-10-10': { status: 'caution', statusLabel: 'Cautela', bestSeverity: 1 }
    };

    const smart = getSmartDatePresets('2026-10-09', null, mockMap);
    assert.ok(smart.presets[0].flyability);
    assert.equal(smart.presets[0].flyability.status, 'flyable');
    assert.equal(smart.presets[0].flyability.label, 'Volabile');

    assert.ok(smart.presets[1].flyability);
    assert.equal(smart.presets[1].flyability.status, 'caution');
    assert.equal(smart.presets[1].flyability.label, 'Cautela');
  });
});
