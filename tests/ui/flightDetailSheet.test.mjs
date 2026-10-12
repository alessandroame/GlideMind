import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateExpandedSvgChart,
  generateEducationalDebriefing,
  renderFlightDetailHtml,
  openFlightDetailSheet,
  escapeHtml,
  formatTrimPointLabel,
  getPendolateCount,
  formatManeuverTitle,
  formatManeuverDetails
} from '../../ui/views/FlightDetailSheet.js';
import { renderTrackSetupHtml } from '../../ui/views/TrackSetupSheet.js';
import { logbookManager, createMemoryDbAdapter } from '../../core/logbookDb.js';
import { store } from '../../core/store.js';

describe('FlightDetailSheet - Telemetry Analysis & Educational Debriefing (UI Layer)', () => {
  let mockBundle;

  beforeEach(async () => {
    logbookManager.setAdapter(createMemoryDbAdapter());
    await logbookManager.clearAll();

    mockBundle = {
      meta: {
        id: 'fl_cornizzolo_detail',
        date: '2026-10-10',
        takeoffTime: '12:00',
        landingTime: '12:35',
        durationMinutes: 35,
        site: 'Monte Cornizzolo',
        siteName: 'Decollo Risparmio -> Atterraggio Suello',
        glider: 'Axis Compact 4',
        gliderClass: 'EN-A',
        maxAltMsl: 1480,
        maxGainMeters: 420,
        maxClimbRate: 3.2,
        maxSinkRate: -2.1,
        accumulatedClimbMeters: 550,
        distanceKm: 8.4,
        notes: 'Volo didattico con termiche in uscita lago.'
      },
      raw: {
        id: 'fl_cornizzolo_detail',
        rawIgc: 'B1200004549980N00917580EA0106001060...',
        decimatedPoints: [
          { timeSeconds: 0, alt: 1060, lat: 45.8, lon: 9.29, vario: 0 },
          { timeSeconds: 120, alt: 1250, lat: 45.802, lon: 9.292, vario: 1.8 },
          { timeSeconds: 300, alt: 1480, lat: 45.805, lon: 9.295, vario: 2.5 },
          { timeSeconds: 600, alt: 1300, lat: 45.81, lon: 9.30, vario: -0.9 },
          { timeSeconds: 900, alt: 800, lat: 45.815, lon: 9.31, vario: -1.2 },
          { timeSeconds: 1200, alt: 260, lat: 45.817, lon: 9.32, vario: -0.5 }
        ]
      },
      telemetry: {
        thermals: [
          {
            thermalIndex: 1,
            entryAlt: 1100,
            exitAlt: 1480,
            netGain: 380,
            avgClimbRate: 2.1,
            durationFormatted: '4m 10s',
            turns: 5.5,
            turnDir: 'CW',
            efficiency: 88
          }
        ],
        dominantWindDrift: {
          speedKmh: 14,
          bearingDeg: 210,
          cardinal: 'SSW'
        },
        maneuvers: [
          {
            type: '360°',
            details: 'Virate continue termiche con discesa controllata'
          }
        ]
      }
    };
  });

  describe('Altimetric SVG Chart Generation', () => {
    it('should generate responsive SVG polyline with elevation labels', () => {
      const svg = generateExpandedSvgChart(mockBundle.raw.decimatedPoints, 500, 120);

      assert.ok(svg.includes('<svg'), 'Must include SVG container');
      assert.ok(svg.includes('polyline'), 'Must include altitude polyline');
      assert.ok(svg.includes('Max: 1480 m'), 'Must show max altitude label');
      assert.ok(svg.includes('Min: 260 m'), 'Must show min altitude label');
      assert.ok(svg.includes('Decollo: 1060 m'), 'Must show takeoff altitude');
      assert.ok(svg.includes('Atterraggio: 260 m'), 'Must show landing altitude');
    });

    it('should handle empty or malformed points gracefully without throwing', () => {
      const emptySvg = generateExpandedSvgChart([], 500, 120);
      assert.ok(emptySvg.includes('non disponibile'));

      const nullSvg = generateExpandedSvgChart(null);
      assert.ok(nullSvg.includes('non disponibile'));
    });
  });

  describe('Educational Safety Debriefing (Instructor Guido)', () => {
    it('should synthesize thermal performance, wind drift, and safety recommendations', () => {
      const text = generateEducationalDebriefing(mockBundle);

      assert.ok(text.includes('1 termica'), 'Must mention detected thermal');
      assert.ok(text.includes('+380 m'), 'Must mention net gain');
      assert.ok(text.includes('14 km/h'), 'Must highlight wind drift speed');
      assert.ok(text.includes('SSW'), 'Must mention cardinal wind direction');
      assert.ok(text.includes('EN-A'), 'Must calibrate advice for EN-A glider class');
      assert.ok(text.includes('cono di planata verso l\'atterraggio'), 'Must enforce landing cone margin');
    });

    it('should issue warning if wind drift is strong (>= 18 km/h)', () => {
      const strongWindBundle = {
        ...mockBundle,
        telemetry: {
          ...mockBundle.telemetry,
          dominantWindDrift: { speedKmh: 22, bearingDeg: 180, cardinal: 'S' }
        }
      };
      const text = generateEducationalDebriefing(strongWindBundle);
      assert.ok(text.includes('sottovento') || text.includes('sostenuto'));
    });
  });

  describe('HTML Markup & Laws of UX Rendering', () => {
    it('should render complete detail sheet markup with all sections', () => {
      const html = renderFlightDetailHtml(mockBundle);

      // Header
      assert.ok(html.includes('Decollo Risparmio -&gt; Atterraggio Suello') || html.includes('Decollo Risparmio'));
      assert.ok(html.includes('Monte Cornizzolo'));
      assert.ok(html.includes('Axis Compact 4'));
      assert.ok(html.includes('EN-A'));
      assert.ok(html.includes('35 min'));

      // Telemetry metrics
      assert.ok(html.includes('1480 m'));
      assert.ok(html.includes('+420 m'));
      assert.ok(html.includes('+3.2 m/s'));
      assert.ok(html.includes('-2.1 m/s'));
      assert.ok(html.includes('+550 m'));
      assert.ok(html.includes('8.4 km'));

      // Wind drift
      assert.ok(html.includes('14 km/h'));
      assert.ok(html.includes('SSW'));

      // Thermals table
      assert.ok(html.includes('Analisi Termiche (1)'));
      assert.ok(html.includes('+380 m'));
      assert.ok(html.includes('1100 m → 1480 m'));
      assert.ok(html.includes('88% in salita'));

      // Maneuvers
      assert.ok(html.includes('Manovre ed Esercizi (1)'));
      assert.ok(html.includes('360°'));

      // Debriefing Box & Callouts
      assert.ok(html.includes('Debriefing Didattico di Sicurezza'));
      assert.ok(html.includes('Istruttore Guido'));
      assert.ok(html.includes('class="gm-debrief-callout"'), 'Debriefing must be formatted into chunked callout cards');

      // Personal Notes
      assert.ok(html.includes('Volo didattico con termiche in uscita lago.'));
      assert.ok(html.includes('Salva Note'));

      // Actions
      assert.ok(html.includes('Visualizza Replay 3D'));
      assert.ok(html.includes('Scarica Traccia IGC (FAI)'));
    });

    it('should prominently display flight number in topbar and header hero box', () => {
      const bundleWithFlightNum = {
        ...mockBundle,
        meta: {
          ...mockBundle.meta,
          flightNumber: 12
        }
      };
      const html = renderFlightDetailHtml(bundleWithFlightNum);

      // Topbar badge
      assert.ok(html.includes('class="gm-flight-number-badge-detail"'), 'Must have topbar flight number badge');
      assert.ok(html.includes('>#12</span>'), 'Must display #12 badge in topbar');

      // Header hero box
      assert.ok(html.includes('class="gm-flight-hero-num-box"'), 'Must have hero flight number box in header card');
      assert.ok(html.includes('class="gm-flight-hero-num-label">VOLO</span>'), 'Must include VOLO label');
      assert.ok(html.includes('class="gm-flight-hero-num-val">#12</span>'), 'Must include #12 value');
    });

    it('should have back button labeled Flight Log with proper aria-label', () => {
      const html = renderFlightDetailHtml(mockBundle);
      assert.ok(html.includes('aria-label="Torna al Flight Log"'), 'Must have accessible back button to Flight Log');
      assert.ok(html.includes('<span>Flight Log</span>'), 'Back button text must be Flight Log');
    });

    it('should strictly enforce touch target floor >= 48px and zero banned decorative emojis', () => {
      const html = renderFlightDetailHtml(mockBundle);

      // Ergonomic touch floor
      assert.ok(html.includes('var(--gm-touch-min, 48px)'));

      // Anti-Sycophancy & Clean Microcopy (Zero decorative emojis)
      const bannedEmojis = ['📈', '🎙️', '⏱️', 'ℹ️', '🚀', '✨', '🔥', '🎉', '💡'];
      for (const emoji of bannedEmojis) {
        assert.equal(html.includes(emoji), false, `Should not contain banned emoji: ${emoji}`);
      }
    });
  });

  describe('Track Trimming Controls & Markup', () => {
    let trimmableBundle;

    beforeEach(() => {
      // 20 points track
      const pts = [];
      for (let i = 0; i < 20; i++) {
        pts.push({
          timeSeconds: i * 10,
          alt: 1000 + i * 20,
          lat: 45.8 + i * 0.001,
          lon: 9.29 + i * 0.001,
          speedKmh: i < 3 ? 2 : (i > 16 ? 4 : 35)
        });
      }

      trimmableBundle = {
        meta: {
          ...mockBundle.meta,
          id: 'fl_trimmable',
          isTrimmed: false
        },
        raw: {
          ...mockBundle.raw,
          id: 'fl_trimmable',
          originalPoints: pts,
          decimatedPoints: pts
        },
        telemetry: mockBundle.telemetry
      };
    });

    it('should format point time and altitude correctly via formatTrimPointLabel', () => {
      assert.equal(formatTrimPointLabel(null, 0), 'Punto #0');
      assert.equal(
        formatTrimPointLabel({ timeSeconds: 3665, alt: 1450 }, 12),
        'Punto #12 (01:01:05 • 1450 m)'
      );
      assert.equal(
        formatTrimPointLabel({ time: '12:30:15', alt: 980 }, 5),
        'Punto #5 (12:30:15 • 980 m)'
      );
    });

    it('should NOT render inline trimming section in FlightDetailSheet to prevent clutter', () => {
      const html = renderFlightDetailHtml(trimmableBundle);
      assert.ok(!html.includes('id="gm-flight-trimming-section"'), 'Main flight detail must NOT render inline trimming section');
      assert.ok(!html.includes('id="gm-trim-takeoff-range"'), 'Main flight detail must NOT render range sliders');
      assert.ok(html.includes('id="btn-open-track-setup"'), 'Top bar must include Setup Traccia button');
      assert.ok(html.includes('id="btn-setup-from-detail"'), 'Bottom bar must include Setup Traccia button');
    });

    it('should display status badges for trimming and elevation calibration in flight detail', () => {
      const calibratedBundle = {
        ...trimmableBundle,
        meta: {
          ...trimmableBundle.meta,
          isTrimmed: true,
          elevationCorrection: {
            mode: 'two_point',
            targetTakeoffAlt: 1060,
            targetLandingAlt: 280,
            appliedAt: 1718000000
          }
        }
      };

      const html = renderFlightDetailHtml(calibratedBundle);
      assert.ok(html.includes('Traccia Trimmata'), 'Must display Traccia Trimmata badge');
      assert.ok(html.includes('Quote Calibrate'), 'Must display Quote Calibrate badge');
    });

    it('renderTrackSetupHtml should render dedicated Setup Traccia view with sliders, auto-detect and elevation calibration', () => {
      const setupHtml = renderTrackSetupHtml(trimmableBundle);

      // Section 1: Trimming
      assert.ok(setupHtml.includes('id="gm-track-trimming-setup-section"'), 'Must contain trimming section');
      assert.ok(setupHtml.includes('id="gm-setup-trim-takeoff-range"'), 'Must contain takeoff range slider');
      assert.ok(setupHtml.includes('id="gm-setup-trim-landing-range"'), 'Must contain landing range slider');
      assert.ok(setupHtml.includes('id="gm-setup-trim-takeoff-val"'), 'Must display takeoff label');
      assert.ok(setupHtml.includes('id="gm-setup-trim-landing-val"'), 'Must display landing label');
      assert.ok(setupHtml.includes('id="btn-setup-auto-detect-trim"'), 'Must contain auto-detect button');
      assert.ok(setupHtml.includes('id="btn-setup-apply-trim"'), 'Must contain apply trim button');
      assert.ok(!setupHtml.includes('id="btn-setup-reset-trim"'), 'Untrimmed flight must not show reset button');

      // Section 2: Elevation Calibration
      assert.ok(setupHtml.includes('id="gm-track-elevation-setup-section"'), 'Must contain elevation section');
      assert.ok(setupHtml.includes('id="gm-setup-target-takeoff-input"'), 'Must contain takeoff elevation input');
      assert.ok(setupHtml.includes('id="gm-setup-target-landing-input"'), 'Must contain landing elevation input');
      assert.ok(setupHtml.includes('id="btn-setup-apply-elevation"'), 'Must contain apply elevation button');
    });

    it('renderTrackSetupHtml should render reset button when flight is trimmed', () => {
      const trimmedBundle = {
        ...trimmableBundle,
        meta: {
          ...trimmableBundle.meta,
          isTrimmed: true,
          trimIndices: { takeoffIndex: 2, landingIndex: 17 }
        }
      };

      const setupHtml = renderTrackSetupHtml(trimmedBundle);
      assert.ok(setupHtml.includes('id="btn-setup-reset-trim"'), 'Must show reset trimming button');
      assert.ok(setupHtml.includes('Traccia Trimmata'), 'Must display Traccia Trimmata badge in setup view');
    });
  });

  describe('openFlightDetailSheet Integration', () => {
    it('should open sheet with formatted flight detail bundle', async () => {
      // Save flight in adapter
      await logbookManager.saveFlight(mockBundle.meta, mockBundle.raw);

      let openedSheet = null;
      globalThis.__mockOpenSheet = (opts) => {
        openedSheet = opts;
      };

      await openFlightDetailSheet('fl_cornizzolo_detail');

      assert.ok(openedSheet, 'Sheet must have opened');
      assert.equal(openedSheet.id, 'flight-detail');
      assert.ok(openedSheet.title.includes('Monte Cornizzolo') || openedSheet.title.includes('Decollo Risparmio'));
      assert.ok(openedSheet.content.includes('Profilo Altimetrico'));

      delete globalThis.__mockOpenSheet;
    });

    it('should handle nonexistent flight ID gracefully without crash', async () => {
      let opened = false;
      globalThis.__mockOpenSheet = () => { opened = true; };

      await openFlightDetailSheet('fl_not_existing');
      assert.equal(opened, false, 'Must not open sheet for missing flight');

      delete globalThis.__mockOpenSheet;
    });
  });

  describe('Roll Inversions & Pendolate Counting', () => {
    it('should extract pendolate count from pendolateCount, chainCount, or details text', () => {
      assert.strictEqual(getPendolateCount({ pendolateCount: 4 }), 4);
      assert.strictEqual(getPendolateCount({ chainCount: 5 }), 5);
      assert.strictEqual(getPendolateCount({ details: 'Inversioni di rollio: 6 pendolate dinamiche' }), 6);
      assert.strictEqual(getPendolateCount({ details: '3 spendolate consecutive' }), 3);
      assert.strictEqual(getPendolateCount({ details: '4 oscillazioni' }), 4);
      assert.strictEqual(getPendolateCount(null), null);
      assert.strictEqual(getPendolateCount({ details: 'Volo rettilineo' }), null);
    });

    it('should format roll inversions title with pendolate count', () => {
      assert.strictEqual(
        formatManeuverTitle('inversioni', { pendolateCount: 4 }),
        'Inversioni di rollio (4 pendolate)'
      );
      assert.strictEqual(
        formatManeuverTitle('inversioni', { pendolateCount: 1 }),
        'Inversioni di rollio (1 pendolata)'
      );
      assert.strictEqual(
        formatManeuverTitle('inversioni'),
        'Inversioni di rollio'
      );
    });

    it('should render roll inversion card with prominent pendolate pill badge and chart marker', () => {
      const rollBundle = {
        ...mockBundle,
        telemetry: {
          ...mockBundle.telemetry,
          maneuvers: [
            {
              type: 'inversioni',
              startIndex: 1,
              endIndex: 3,
              durationSeconds: 14,
              pendolateCount: 4,
              details: 'Inversioni di rollio: 4 pendolate dinamiche (avg 70°, max 80°)'
            }
          ]
        }
      };

      const html = renderFlightDetailHtml(rollBundle);

      // Maneuver badge and count
      assert.ok(html.includes('Inversioni di rollio (4 pendolate)'), 'Must include pendolate count in title badge');
      assert.ok(html.includes('gm-maneuver-pendolate-pill'), 'Must render dedicated pendolate pill class');
      assert.ok(html.includes('4 pendolate'), 'Must display 4 pendolate in pill');

      // SVG Chart marker and legend
      assert.ok(html.includes('gm-chart-roll-marker'), 'Must render roll marker on altimetric chart');
      assert.ok(html.includes('4P'), 'Must show 4P label on roll marker');
      assert.ok(html.includes('Inversioni (P)'), 'Must show roll inversion legend item');

      // Instructor Guido debriefing
      assert.ok(html.includes('registrate 4 pendolate consecutive'), 'Guido must explicitly debrief on 4 pendolate');
    });
  });
});

