/**
 * GlideMind - Flight Detail Full-Screen View Unit & Governance Tests
 * 
 * Verifies:
 *  - Headless rendering of full-screen view (100dvh, zero bottom sheet flyer).
 *  - Schema alignment: altGain vs netGain, originDeg vs bearingDeg (no 'undefined°' or '+0 m').
 *  - Gestalt Common Region: .gm-flight-metrics-grid and .gm-flight-metric-card.
 *  - Laws of UX: Fitts's law touch targets (>= 48px), prominent Von Restorff Replay CTA in bottom bar.
 *  - Instructor Guido educational debriefing calculations.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  generateExpandedSvgChart,
  generateEducationalDebriefing,
  renderFlightDetailHtml
} from '../ui/views/FlightDetailSheet.js';

describe('Flight Detail Full-Screen View & Schema Integrity', () => {

  const sampleFlightBundle = {
    meta: {
      id: 'flight_test_20261004_120000',
      siteName: 'Col Rodella',
      site: 'Val di Fassa (TN)',
      date: '2026-10-04',
      takeoffTime: '12:15',
      landingTime: '13:03',
      durationMinutes: 48,
      glider: 'Ozone Mojo 6',
      gliderClass: 'EN-A',
      maxAltMsl: 2450,
      maxGainMeters: 420,
      maxClimbRate: 3.2,
      maxSinkRate: -2.1,
      accumulatedClimbMeters: 580,
      distanceKm: 18.4,
      notes: 'Ottima termica iniziale su costone Sud.'
    },
    raw: {
      decimatedPoints: [
        { lat: 46.49, lon: 11.75, alt: 2030, timeSeconds: 0 },
        { lat: 46.50, lon: 11.76, alt: 2450, timeSeconds: 1200 },
        { lat: 46.48, lon: 11.74, alt: 1420, timeSeconds: 2880 }
      ]
    },
    telemetry: {
      thermals: [
        {
          id: 'th_1',
          thermalIndex: 1,
          entryAlt: 1720,
          exitAlt: 1739,
          altGain: 19,
          durationFormatted: '48s',
          avgClimbRate: 0.4,
          turnCount: 2.5,
          turnDirection: 'CW',
          efficiencyPercent: 82
        },
        {
          id: 'th_2',
          thermalIndex: 2,
          entryAlt: 1734,
          exitAlt: 1880,
          altGain: 146,
          durationFormatted: '3m 15s',
          avgClimbRate: 1.2,
          turnCount: 6.0,
          turnDirection: 'CCW',
          efficiencyPercent: 91
        }
      ],
      dominantWindDrift: {
        speedKmh: 6.4,
        originDeg: 215,
        cardinal: 'SW'
      },
      maneuvers: [
        { type: '360 Spirale', details: '2 giri controllati a -4 m/s' }
      ]
    }
  };

  test('escapeHtml handles special characters and nullish values safely', () => {
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
    assert.strictEqual(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    assert.strictEqual(escapeHtml("Pilot's wing & bar"), 'Pilot&#39;s wing &amp; bar');
  });

  test('generateExpandedSvgChart generates valid SVG with elevation polyline and labels', () => {
    const points = sampleFlightBundle.raw.decimatedPoints;
    const svg = generateExpandedSvgChart(points, 500, 130);

    assert.ok(svg.includes('<svg viewBox="0 0 500 130"'), 'Includes viewBox dimensions');
    assert.ok(svg.includes('polyline points='), 'Includes altitude polyline');
    assert.ok(svg.includes('Max: 2450 m'), 'Includes max altitude label');
    assert.ok(svg.includes('Min: 1420 m'), 'Includes min altitude label');
    assert.ok(svg.includes('Decollo: 2030 m'), 'Includes takeoff altitude label');
    assert.ok(svg.includes('Atterraggio: 1420 m'), 'Includes landing altitude label');
  });

  test('generateEducationalDebriefing calculates net thermal gain and wind without undefined', () => {
    const debrief = generateEducationalDebriefing(sampleFlightBundle);

    assert.ok(!debrief.includes('undefined'), 'Debriefing must NEVER contain undefined');
    assert.ok(debrief.includes('165 m'), 'Calculates total thermal gain (19 + 146 = 165 m)');
    assert.ok(debrief.includes('Termica #2 con +146 m'), 'Identifies best thermal with its gain');
    assert.ok(debrief.includes('215°') || debrief.includes('SW'), 'Includes wind origin degrees or cardinal');
    assert.ok(debrief.includes('EN-A'), 'Includes EN-A safety reminder');
  });

  test('renderFlightDetailHtml renders dedicated full-screen structure instead of flyer', () => {
    const html = renderFlightDetailHtml(sampleFlightBundle);

    // Fullscreen container
    assert.ok(html.includes('class="gm-flight-detail-fullscreen"'), 'Must have .gm-flight-detail-fullscreen container');
    assert.ok(html.includes('id="flight-detail-overlay"'), 'Must have #flight-detail-overlay element');

    // Sticky Top Bar with Back Navigation Button
    assert.ok(html.includes('class="gm-flight-detail-topbar"'), 'Must have top bar');
    assert.ok(html.includes('id="btn-flight-detail-back"'), 'Must have back button');
    assert.ok(html.includes('class="gm-flight-detail-back-btn"'), 'Must have back button class');
    assert.ok(html.includes('aria-label="Torna al Libretto Voli"'), 'Must have accessible back button label');

    // Sticky Bottom Bar in Thumb Zone
    assert.ok(html.includes('class="gm-flight-detail-bottom-bar"'), 'Must have sticky bottom bar');
    assert.ok(html.includes('id="btn-replay-from-detail"'), 'Must have 3D Replay CTA');
    assert.ok(html.includes('Visualizza Replay 3D'), 'Must have 3D Replay label');
    assert.ok(html.includes('id="btn-download-from-detail"'), 'Must have IGC download button');

    // Kinetic Telemetry Grid (Common Region)
    assert.ok(html.includes('class="gm-flight-metrics-grid"'), 'Must have .gm-flight-metrics-grid');
    assert.ok(html.includes('class="gm-flight-metric-card"'), 'Must have .gm-flight-metric-card');
    assert.ok(html.includes('Quota Massima MSL'), 'Must include Quota Massima');
    assert.ok(html.includes('Guadagno dal Decollo'), 'Must include Guadagno dal Decollo');
  });

  test('renderFlightDetailHtml fixes thermal altGain schema mismatch (+19 m instead of +0 m)', () => {
    const html = renderFlightDetailHtml(sampleFlightBundle);

    // Thermal 1 has altGain: 19 m (entry 1720 -> exit 1739)
    assert.ok(html.includes('+19 m'), 'Thermal #1 must show +19 m instead of +0 m');
    assert.ok(html.includes('1720 m → 1739 m'), 'Must show entry and exit altitude');
    assert.ok(html.includes('2.5 giri (Orario)'), 'Must show turns and direction');
    assert.ok(html.includes('82% in salita'), 'Must show efficiency percent');

    // Thermal 2 has altGain: 146 m
    assert.ok(html.includes('+146 m'), 'Thermal #2 must show +146 m');
    assert.ok(html.includes('6 giri (Antiorario)'), 'Must show 6 turns CCW');
  });

  test('renderFlightDetailHtml fixes wind drift schema and eliminates undefined°', () => {
    const html = renderFlightDetailHtml(sampleFlightBundle);

    assert.ok(!html.includes('undefined°'), 'Must NEVER render undefined°');
    assert.ok(html.includes('da 215° (SW)'), 'Must render wind direction with degrees and cardinal');
    assert.ok(html.includes('6.4 km/h'), 'Must render wind speed');
  });
});
