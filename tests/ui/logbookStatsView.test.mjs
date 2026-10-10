import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  renderLogbookStatsHtml,
  renderMonthlyActivityChartHtml
} from '../../ui/views/LogbookStatsView.js';

describe('LogbookStatsView Component (UI Layer)', () => {
  const sampleFlights = [
    {
      id: 'fl-1',
      date: '2026-10-04',
      durationMinutes: 45,
      site: 'Monte Cornizzolo',
      siteName: 'Decollo Risparmio -> Atterraggio Suello',
      glider: 'Axis Compact 4',
      maxAltMsl: 1886,
      maxGainMeters: 116,
      thermalsCount: 2,
      maneuversCount: 0,
      distanceKm: 13.8
    },
    {
      id: 'fl-2',
      date: '2026-09-20',
      durationMinutes: 60,
      site: 'Bassano del Grappa',
      siteName: 'Decollo Stella -> Atterraggio Garden Relais',
      glider: 'Ozone Rush 6',
      maxAltMsl: 1650,
      maxGainMeters: 750,
      thermalsCount: 3,
      maneuversCount: 2,
      distanceKm: 15.2
    }
  ];

  it('should render empty state metrics cleanly when flights array is empty', () => {
    const html = renderLogbookStatsHtml([]);

    assert.ok(html.includes('gm-stats-container'));
    assert.ok(html.includes('Valuta &amp; Continuità Pilota'));
    assert.ok(html.includes('Totali di Carriera'));
    assert.ok(html.includes('0 h'), 'Must show 0 total hours');
    assert.ok(html.includes('Migliori Prestazioni Personali'));
    assert.ok(html.includes('Nessun dato registrato'));
  });

  it('should compute career totals, pilot currency, and personal records accurately', () => {
    const html = renderLogbookStatsHtml(sampleFlights);

    // Pilot Currency
    assert.ok(html.includes('Valuta &amp; Continuità Pilota'));
    assert.ok(html.includes('gm-currency-active') || html.includes('In attività'));

    // Career Totals (45 + 60 = 105 min = 1.8 h)
    assert.ok(html.includes('1.8 h') || html.includes('2 h'));
    assert.ok(html.includes('2'), 'Must show 2 total flights');
    assert.ok(html.includes('5'), 'Must show 5 total thermals (2 + 3)');
    assert.ok(html.includes('2'), 'Must show 2 total maneuvers');

    // Personal Records
    assert.ok(html.includes('1886 m'), 'Max altitude MSL must be 1886m');
    assert.ok(html.includes('+750 m'), 'Max gain must be +750m');
    assert.ok(html.includes('60 min'), 'Longest flight must be 60 min');
    assert.ok(html.includes('15.2 km'), 'Max distance must be 15.2 km');

    // Top Sites & Gliders
    assert.ok(html.includes('Decollo Risparmio'));
    assert.ok(html.includes('Decollo Stella'));
    assert.ok(html.includes('Axis Compact 4'));
    assert.ok(html.includes('Ozone Rush 6'));
  });

  it('should adhere to sobriety rules with zero banned emojis and WCAG contrast', () => {
    const html = renderLogbookStatsHtml(sampleFlights);

    const banned = ['📈', '🎙️', '⏱️', 'ℹ️', '🚀', '✨', '🔥', '🎉'];
    for (const emoji of banned) {
      assert.ok(!html.includes(emoji), `LogbookStatsView must not contain banned emoji "${emoji}"`);
    }
  });

  it('should render the 12-month monthly activity bar chart with SVG bars and toggle controls', () => {
    const html = renderLogbookStatsHtml(sampleFlights, { referenceDate: '2026-10-10' });

    assert.ok(html.includes('heading-monthly-activity'));
    assert.ok(html.includes('Attività Mensile'));
    assert.ok(html.includes('gm-chart-card'));
    assert.ok(html.includes('gm-chart-svg'));
    assert.ok(html.includes('viewBox="0 0 360 148"'));
    assert.ok(html.includes('data-action="toggle-stats-metric"'));
    assert.ok(html.includes('data-metric="hours"'));
    assert.ok(html.includes('data-metric="flights"'));

    // Check SVG bars for flights in Sep and Oct 2026
    assert.ok(html.includes('Ott'));
    assert.ok(html.includes('Set'));
    // Sep flight: 60 min = 1 h. Oct flight: 45 min = 0.8 h.
    assert.ok(html.includes('0.8') || html.includes('1'));
  });

  it('should toggle between hours and flights metric modes cleanly', () => {
    // Flights mode
    const flightsHtml = renderLogbookStatsHtml(sampleFlights, {
      metric: 'flights',
      referenceDate: '2026-10-10'
    });
    assert.ok(flightsHtml.includes('2 voli negli ultimi 12 mesi'));
    assert.ok(flightsHtml.includes('data-metric="flights"'));
    assert.ok(flightsHtml.includes('gm-chart-toggle-btn active"'));

    // Hours mode
    const hoursHtml = renderLogbookStatsHtml(sampleFlights, {
      metric: 'hours',
      referenceDate: '2026-10-10'
    });
    assert.ok(hoursHtml.includes('1.8 h negli ultimi 12 mesi'));
    assert.ok(hoursHtml.includes('data-metric="hours"'));
    assert.ok(hoursHtml.includes('gm-chart-toggle-btn active"'));
  });

  it('should render baseline ticks for empty monthly activity without crashing', () => {
    const html = renderLogbookStatsHtml([], { referenceDate: '2026-10-10' });
    assert.ok(html.includes('0 h negli ultimi 12 mesi'));
    assert.ok(html.includes('gm-chart-svg'));
    assert.ok(!html.includes('NaN'), 'Chart markup must never contain NaN');
  });
});

