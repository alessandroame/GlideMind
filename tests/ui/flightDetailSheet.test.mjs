import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateExpandedSvgChart,
  generateEducationalDebriefing,
  renderFlightDetailHtml,
  openFlightDetailSheet,
  escapeHtml
} from '../../ui/views/FlightDetailSheet.js';
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

      // Debriefing Box
      assert.ok(html.includes('Debriefing Didattico di Sicurezza'));
      assert.ok(html.includes('Istruttore Guido'));

      // Personal Notes
      assert.ok(html.includes('Volo didattico con termiche in uscita lago.'));
      assert.ok(html.includes('Salva Note'));

      // Actions
      assert.ok(html.includes('Visualizza Replay 3D'));
      assert.ok(html.includes('Scarica Traccia IGC (FAI)'));
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
});
