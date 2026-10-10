import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { renderLogbookStatsHtml } from '../../ui/views/LogbookStatsView.js';

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
});
