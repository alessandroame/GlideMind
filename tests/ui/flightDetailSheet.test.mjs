import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateExpandedSvgChart,
  generateEducationalDebriefing,
  renderFlightDetailHtml,
  openFlightDetailSheet,
  closeFlightDetailView,
  getActiveFlightDetailMapEngine,
  escapeHtml,
  formatTrimPointLabel,
  getPendolateCount,
  formatManeuverTitle,
  formatManeuverDetails,
  getPointVario,
  getPointSpeed,
  attachInteractiveFlightChart
} from '../../ui/views/FlightDetailSheet.js';
import { renderTrackSetupHtml } from '../../ui/views/TrackSetupSheet.js';
import { logbookManager, createMemoryDbAdapter } from '../../core/logbookDb.js';
import { store } from '../../core/store.js';

function createMockElement(id, classes = [], tagName = 'div', attributes = {}) {
  const children = [];
  const classSet = new Set(classes);
  const listeners = new Map();
  const attrs = { ...attributes };
  if (id) attrs.id = id;

  const el = {
    tagName: tagName.toUpperCase(),
    attributes: attrs,
    style: {},
    dataset: {},
    children,
    parentElement: null,
    clientWidth: 600,
    clientHeight: 220,
    innerHTML: '',
    textContent: '',
    classList: {
      add: (...names) => names.forEach(n => classSet.add(n)),
      remove: (...names) => names.forEach(n => classSet.delete(n)),
      contains: (n) => classSet.has(n),
      toggle: (n, force) => {
        if (force !== undefined) {
          if (force) classSet.add(n); else classSet.delete(n);
          return force;
        }
        if (classSet.has(n)) { classSet.delete(n); return false; }
        classSet.add(n); return true;
      }
    },
    getAttribute: (k) => el.attributes[k] ?? null,
    setAttribute: (k, v) => { el.attributes[k] = String(v); },
    hasAttribute: (k) => k in el.attributes,
    removeAttribute: (k) => { delete el.attributes[k]; },
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => {
      if (listeners.has(type)) listeners.get(type).delete(fn);
    },
    dispatchEvent: (event) => {
      const type = event.type || event;
      if (listeners.has(type)) {
        listeners.get(type).forEach(fn => fn(event));
      }
      return true;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 220 }),
    appendChild: (child) => {
      child.parentElement = el;
      children.push(child);
      return child;
    },
    closest: (selector) => {
      let cur = el;
      while (cur) {
        if (selector.startsWith('#') && cur.attributes?.id === selector.slice(1)) return cur;
        if (selector.startsWith('.') && cur.classList?.contains(selector.slice(1))) return cur;
        if (selector.startsWith('[') && selector.endsWith(']')) {
          const content = selector.slice(1, -1);
          const [k, v] = content.split('=');
          const cleanVal = v ? v.replace(/['"]/g, '') : null;
          if (cleanVal !== null ? cur.getAttribute(k) === cleanVal : cur.hasAttribute(k)) return cur;
        }
        cur = cur.parentElement;
      }
      return null;
    },
    querySelector: (selector) => {
      if (selector.startsWith('#')) {
        const id = selector.slice(1);
        if (el.attributes?.id === id) return el;
        for (const c of children) {
          const res = c.querySelector?.(selector);
          if (res) return res;
        }
      }
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        if (el.classList?.contains(cls)) return el;
        for (const c of children) {
          const res = c.querySelector?.(selector);
          if (res) return res;
        }
      }
      if (selector.startsWith('[') && selector.endsWith(']')) {
        const content = selector.slice(1, -1);
        const [k, v] = content.split('=');
        const cleanVal = v ? v.replace(/['"]/g, '') : null;
        if (cleanVal !== null ? el.getAttribute(k) === cleanVal : el.hasAttribute(k)) return el;
        for (const c of children) {
          const res = c.querySelector?.(selector);
          if (res) return res;
        }
      }
      return null;
    }
  };
  return el;
}

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

  describe('Interactive Telemetry Zoom, Pan, Channels & Cockpit HUD', () => {
    it('should compute variometer and speed fallbacks when not explicitly provided in points', () => {
      const p0 = { timeSeconds: 0, alt: 1000, lat: 46.0, lon: 11.0 };
      const p1 = { timeSeconds: 10, alt: 1025, lat: 46.001, lon: 11.001 };
      const pts = [p0, p1];

      const vario0 = getPointVario(p0, 0, pts);
      const vario1 = getPointVario(p1, 1, pts);
      assert.strictEqual(vario0, 0);
      assert.strictEqual(vario1, 2.5); // 25m / 10s = 2.5 m/s

      const speed1 = getPointSpeed(p1, 1, pts);
      assert.ok(speed1 > 10, 'Speed must be calculated from coordinates (>10 km/h)');
    });

    it('should generate SVG with variometer curve layer when showVario option is enabled with dual positive/negative colors', () => {
      const svgWithVario = generateExpandedSvgChart(mockBundle.raw.decimatedPoints, 600, 220, {
        showVario: true
      });
      assert.ok(svgWithVario.includes('gm-chart-vario-layer'), 'Must contain vario layer group');
      assert.ok(svgWithVario.includes('0 m/s'), 'Must contain vario 0 m/s reference label');
      assert.ok(svgWithVario.includes('#10b981'), 'Must use emerald green color for positive variometer (climb)');
      assert.ok(svgWithVario.includes('#ef4444'), 'Must use red color for negative variometer (sink)');
      assert.ok(svgWithVario.includes('gm-vario-stroke-climb') || svgWithVario.includes('gm-vario-stroke-sink'), 'Must have variometer stroke classes');
    });

    it('should generate SVG with ground speed curve layer when showSpeed option is enabled', () => {
      const svgWithSpeed = generateExpandedSvgChart(mockBundle.raw.decimatedPoints, 600, 220, {
        showSpeed: true
      });
      assert.ok(svgWithSpeed.includes('gm-chart-speed-layer'), 'Must contain ground speed layer group');
      assert.ok(svgWithSpeed.includes('70 km/h'), 'Must contain speed scale label');
      assert.ok(svgWithSpeed.includes('#c084fc'), 'Must use purple color for ground speed');
    });

    it('should render zoom and pan window correctly without breaking polyline or summary header', () => {
      const zoomedSvg = generateExpandedSvgChart(mockBundle.raw.decimatedPoints, 600, 220, {
        zoom: 2.5,
        pan: 0.3
      });
      assert.ok(zoomedSvg.includes('<svg viewBox="0 0 600 220"'));
      assert.ok(zoomedSvg.includes('polyline points='));
      assert.ok(zoomedSvg.includes('Max: 1480 m'));
      assert.ok(zoomedSvg.includes('Decollo: 1060 m'));
      assert.ok(zoomedSvg.includes('Atterraggio: 260 m'));
    });

    it('should render inspection crosshair and cursor dot when cursorIndex is passed', () => {
      const cursorSvg = generateExpandedSvgChart(mockBundle.raw.decimatedPoints, 600, 220, {
        cursorIndex: 2
      });
      assert.ok(cursorSvg.includes('id="gm-chart-cursor-group"'));
      assert.ok(cursorSvg.includes('id="gm-chart-cursor-line"'));
      assert.ok(cursorSvg.includes('id="gm-chart-cursor-dot"'));
      assert.ok(!cursorSvg.includes('display:none;'), 'Cursor group must be visible when valid index is passed');
    });

    it('should render all interactive telemetry controls and HUD in renderFlightDetailHtml', () => {
      const html = renderFlightDetailHtml(mockBundle);

      // Toolbar and channel toggles
      assert.ok(html.includes('class="gm-telemetry-toolbar'), 'Must render telemetry toolbar');
      assert.ok(html.includes('id="btn-toggle-alt"'), 'Must have Quota toggle');
      assert.ok(html.includes('id="btn-toggle-vario"'), 'Must have Vario toggle');
      assert.ok(html.includes('id="btn-toggle-speed"'), 'Must have Speed toggle');

      // Zoom group
      assert.ok(html.includes('id="btn-chart-zoom-in"'), 'Must have zoom in button');
      assert.ok(html.includes('id="btn-chart-zoom-out"'), 'Must have zoom out button');
      assert.ok(html.includes('id="btn-chart-zoom-reset"'), 'Must have zoom reset button');
      assert.ok(html.includes('id="gm-chart-zoom-level"'), 'Must have zoom level display');

      // Cockpit HUD
      assert.ok(html.includes('id="gm-chart-inspection-hud"'), 'Must render cockpit inspection HUD');
      assert.ok(html.includes('id="gm-hud-time"'), 'Must have HUD time element');
      assert.ok(html.includes('id="gm-hud-alt"'), 'Must have HUD altitude element');
      assert.ok(html.includes('id="gm-hud-vario"'), 'Must have HUD vario element');
      assert.ok(html.includes('id="gm-hud-speed"'), 'Must have HUD speed element');
      assert.ok(html.includes('id="gm-hud-event"'), 'Must have HUD event element');

      // Interactive chart container and overview navigator
      assert.ok(html.includes('id="gm-interactive-chart-container"'), 'Must have interactive chart container');
      assert.ok(html.includes('id="gm-chart-navigator"'), 'Must have overview navigator track');
      assert.ok(html.includes('id="gm-chart-nav-handle"'), 'Must have overview navigator handle');
    });
  });

  describe('2D Flight Track Mini-Map & Altimetric Chart Synchronization', () => {
    it('should render 2D mini-map markup container, canvas, legend, and layer toggle in renderFlightDetailHtml', () => {
      const html = renderFlightDetailHtml(mockBundle);

      assert.ok(html.includes('id="flight-detail-map-container"'), 'Must contain 2D mini-map container');
      assert.ok(html.includes('id="flight-detail-map-canvas"'), 'Must contain map canvas');
      assert.ok(html.includes('id="flight-detail-map-legend"'), 'Must contain map HUD legend');
      assert.ok(html.includes('id="flight-detail-map-layer-toggle"'), 'Must contain layer toggle button');
      assert.ok(html.includes('id="flight-detail-map-expand-btn"'), 'Must contain expand button');
      assert.ok(html.includes('class="gm-mini-map-expand-btn"'), 'Must have gm-mini-map-expand-btn class');
      assert.ok(html.includes('class="gm-mini-map-box gm-flight-minimap-box"'), 'Container must have gm-mini-map-box class');
      assert.ok(html.includes('id="gm-flight-map-phase-badge"'), 'Must contain phase badge element');
      assert.ok(html.includes('id="btn-flight-map-reset-selection"'), 'Must contain reset selection button');
      assert.ok(html.includes('data-action="select-phase"'), 'Must include select-phase attributes on cards');
      assert.ok(html.includes('data-phase-type="thermal"'), 'Must mark thermal cards with thermal phase type');
    });

    it('should render selectedPhase highlight rect in generateExpandedSvgChart when a phase is active', () => {
      const svgWithPhase = generateExpandedSvgChart(mockBundle.raw.decimatedPoints, 600, 220, {
        selectedPhase: {
          type: 'thermal',
          label: 'T1',
          startIndex: 1,
          endIndex: 3
        }
      });

      assert.ok(svgWithPhase.includes('gm-chart-phase-selected-group'), 'Must contain selected phase group');
      assert.ok(svgWithPhase.includes('gm-chart-phase-selected-rect'), 'Must contain highlight rect');
      assert.ok(svgWithPhase.includes('Fase selezionata T1'), 'Must include aria-label with phase name');
    });

    it('should initialize HeadlessMockMapEngine, render track and sync cursor and phase selection', () => {
      // Build mock DOM structure for overlay
      const overlay = createMockElement('flight-detail-overlay');
      const chartContainer = createMockElement('gm-interactive-chart-container');
      const mapCanvas = createMockElement('flight-detail-map-canvas');
      const phaseBadge = createMockElement('gm-flight-map-phase-badge');
      const resetBtn = createMockElement('btn-flight-map-reset-selection');
      const layerToggle = createMockElement('flight-detail-map-layer-toggle', [], 'button', { 'data-layer': 'topo' });
      const expandBtn = createMockElement('flight-detail-map-expand-btn', [], 'button');

      // Add a thermal card inside overlay
      const thermalCard = createMockElement('card-t1', ['gm-thermal-card'], 'div', {
        'data-action': 'select-phase',
        'data-phase-type': 'thermal',
        'data-phase-label': 'T1',
        'data-start-index': '1',
        'data-end-index': '3'
      });

      overlay.appendChild(mapCanvas);
      overlay.appendChild(phaseBadge);
      overlay.appendChild(resetBtn);
      overlay.appendChild(layerToggle);
      overlay.appendChild(expandBtn);
      overlay.appendChild(chartContainer);
      overlay.appendChild(thermalCard);

      // Attach interactive flight chart
      attachInteractiveFlightChart(overlay, mockBundle);

      const mapEngine = getActiveFlightDetailMapEngine();
      assert.ok(mapEngine, 'Map engine must be initialized and accessible');
      assert.ok(mapEngine.renderedTrack, 'Track must be rendered on map engine');
      assert.strictEqual(mapEngine.renderedTrack.points.length, mockBundle.raw.decimatedPoints.length);

      // Test cursor synchronization with proportional total count
      chartContainer.dispatchEvent({ type: 'pointerdown', clientX: 200, pointerId: 1 });
      assert.ok(mapEngine.cursorPointIndex !== null, 'Cursor point index must be updated on pointerdown');
      assert.strictEqual(mapEngine.cursorTotalCount, mockBundle.raw.decimatedPoints.length, 'Total count must be passed for proportional mapping');

      // Test phase selection from card click
      overlay.dispatchEvent({
        type: 'click',
        target: thermalCard
      });

      assert.ok(mapEngine.highlightedRange, 'Highlighted range must be set on map engine');
      assert.strictEqual(mapEngine.isTrimmedToPhase, true, 'isTrimmedToPhase must be true on map engine');
      assert.strictEqual(mapEngine.highlightedRange.startIndex, 1);
      assert.strictEqual(mapEngine.highlightedRange.endIndex, 3);
      assert.strictEqual(mapEngine.highlightedRange.options.label, 'T1');
      assert.strictEqual(phaseBadge.textContent, 'T1');
      assert.strictEqual(phaseBadge.style.display, 'inline-flex');
      assert.strictEqual(resetBtn.style.display, 'inline-flex');

      // Test layer toggle
      layerToggle.dispatchEvent({ type: 'click', stopPropagation: () => {} });
      assert.strictEqual(mapEngine.activeLayer, 'satellite', 'Layer should toggle to satellite');

      // Test reset button
      resetBtn.dispatchEvent({ type: 'click', stopPropagation: () => {} });
      assert.strictEqual(mapEngine.highlightedRange, null, 'Highlighted range must be cleared');
      assert.strictEqual(mapEngine.isTrimmedToPhase, false, 'isTrimmedToPhase must be false after reset');
      assert.strictEqual(phaseBadge.textContent, '');
      assert.strictEqual(phaseBadge.style.display, 'none');
      assert.strictEqual(resetBtn.style.display, 'none');

      // Test pointerup and pointerleave clears cursor
      chartContainer.dispatchEvent({ type: 'pointerup', pointerId: 1 });
      chartContainer.dispatchEvent({ type: 'pointerleave' });
      assert.strictEqual(mapEngine.cursorPointIndex, null, 'Cursor must be cleared on pointerleave');

      // Test expand button navigation
      let targetHash = null;
      const origWindow = globalThis.window;
      globalThis.window = {
        ...origWindow,
        location: {
          get hash() { return targetHash; },
          set hash(v) { targetHash = v; }
        }
      };
      expandBtn.dispatchEvent({ type: 'click', stopPropagation: () => {} });
      assert.strictEqual(targetHash, `#replay?flightId=${mockBundle.meta.id}`, 'Expand button must navigate to 3D Replay');
      globalThis.window = origWindow;

      // Test cleanup on closeFlightDetailView
      closeFlightDetailView();
      assert.strictEqual(getActiveFlightDetailMapEngine(), null, 'Map engine must be destroyed and reset to null');
    });

    it('should test LeafletMapEngine proportional cursor reaching 100% of flight track without compression', async () => {
      const { LeafletMapEngine } = await import('../../ui/map/mapEngineAdapter.js');

      // Setup minimal mock window.L
      const originalWindow = globalThis.window;
      let fitBoundsCalledWith = null;
      const mockLayers = [];

      const mockMap = {
        fitBounds: (b, opts) => { fitBoundsCalledWith = { bounds: b, opts }; },
        on: () => {},
        removeLayer: () => {}
      };

      globalThis.window = {
        L: {
          map: () => mockMap,
          tileLayer: () => ({ addTo: () => {} }),
          layerGroup: () => ({ addTo: () => ({}) }),
          control: {
            zoom: () => ({ addTo: () => {} })
          },
          latLngBounds: (coords) => ({ coords, _isBounds: true }),
          polyline: (coords, opts) => ({
            coords,
            opts,
            setStyle: function (s) { this.style = s; }
          }),
          divIcon: (opts) => opts,
          marker: (coords, opts) => ({
            coords,
            opts,
            addTo: function () { return this; },
            setLatLng: function (c) { this.coords = c; },
            remove: function () {}
          }),
          featureGroup: () => ({
            layers: [],
            addTo: function () { return this; },
            addLayer: function (l) { mockLayers.push(l); this.layers.push(l); },
            clearLayers: function () { this.layers = []; }
          })
        }
      };

      const engine = new LeafletMapEngine(null, { isMiniMap: true });
      engine.map = mockMap;
      engine.overlayLayerGroup = window.L.featureGroup();
      engine.phaseHighlightGroup = window.L.featureGroup();
      engine.trackBounds = { _isInitialBounds: true };

      // Sample track with 4 points
      const points = [
        { lat: 45.80, lon: 9.20, timeSeconds: 100 },
        { lat: 45.81, lon: 9.21, timeSeconds: 200 },
        { lat: 45.82, lon: 9.22, timeSeconds: 300 },
        { lat: 45.83, lon: 9.23, timeSeconds: 400 }
      ];

      engine.renderFlightTrack(null, { points });
      assert.strictEqual(engine.validTrackPoints.length, 4);

      // 1. Moving cursor to index 3 (end of chart, totalCount = 4)
      engine.setFlightTrackCursor(3, 4, 400);
      assert.ok(engine.trackCursorMarker, 'Cursor marker must be created');
      assert.deepStrictEqual(engine.trackCursorMarker.coords, [45.83, 9.23], 'Cursor must be at 100% end of track (landing)');

      // 2. Moving cursor to index 0 (takeoff)
      engine.setFlightTrackCursor(0, 4, 100);
      assert.deepStrictEqual(engine.trackCursorMarker.coords, [45.80, 9.20], 'Cursor must be at 0% start of track (takeoff)');

      // 3. Highlight flight phase range with trimming
      engine.highlightFlightTrackRange(1, 2, { label: 'T1' });
      assert.ok(fitBoundsCalledWith, 'fitBounds must be called for phase bounds');
      assert.strictEqual(fitBoundsCalledWith.opts.maxZoom, 17);
      assert.strictEqual(fitBoundsCalledWith.opts.animate, true);

      // 4. Reset flight phase
      engine.highlightFlightTrackRange(null);
      assert.strictEqual(fitBoundsCalledWith.bounds, engine.trackBounds, 'Resetting must fit bounds back to initial full track bounds');

      // Cleanup
      globalThis.window = originalWindow;
    });

    it('should select maneuver phase when clicking or tapping directly on the altimetric chart, and clear on neutral glide space', async () => {
      const maneuverBundle = {
        meta: {
          id: 'fl_maneuvers_chart_test',
          date: '2026-10-12',
          takeoffTime: '14:00',
          landingTime: '14:30',
          durationMinutes: 30,
          site: 'Cornizzolo',
          glider: 'EN-A Safe'
        },
        raw: {
          decimatedPoints: [
            { timeSeconds: 0, alt: 1000, lat: 45.80, lon: 9.20 },
            { timeSeconds: 60, alt: 1050, lat: 45.81, lon: 9.21 },
            { timeSeconds: 120, alt: 1200, lat: 45.82, lon: 9.22 },
            { timeSeconds: 180, alt: 1350, lat: 45.83, lon: 9.23 },
            { timeSeconds: 240, alt: 1300, lat: 45.84, lon: 9.24 },
            { timeSeconds: 300, alt: 1250, lat: 45.85, lon: 9.25 },
            { timeSeconds: 360, alt: 1200, lat: 45.86, lon: 9.26 },
            { timeSeconds: 420, alt: 1100, lat: 45.87, lon: 9.27 },
            { timeSeconds: 480, alt: 900, lat: 45.88, lon: 9.28 },
            { timeSeconds: 540, alt: 500, lat: 45.89, lon: 9.29 }
          ]
        },
        telemetry: {
          thermals: [
            { thermalIndex: 1, startIndex: 1, endIndex: 3, altGain: 300 }
          ],
          maneuvers: [
            { type: 'wingover', startIndex: 6, endIndex: 7, durationSeconds: 20 },
            { type: 'inversioni', startIndex: 8, endIndex: 8, pendolateCount: 3 }
          ]
        }
      };

      const overlay = createMockElement('flight-detail-overlay');
      const chartContainer = createMockElement('gm-interactive-chart-container');
      const mapCanvas = createMockElement('flight-detail-map-canvas');
      const phaseBadge = createMockElement('gm-flight-map-phase-badge');
      const resetBtn = createMockElement('btn-flight-map-reset-selection');
      const layerToggle = createMockElement('flight-detail-map-layer-toggle', [], 'button', { 'data-layer': 'topo' });

      overlay.appendChild(mapCanvas);
      overlay.appendChild(phaseBadge);
      overlay.appendChild(resetBtn);
      overlay.appendChild(layerToggle);
      overlay.appendChild(chartContainer);

      attachInteractiveFlightChart(overlay, maneuverBundle);

      const mapEngine = getActiveFlightDetailMapEngine();
      assert.ok(mapEngine, 'Map engine must be initialized');

      // 1. Hover test: over wingover at x = 400 (corresponds to point index 6)
      chartContainer.dispatchEvent({ type: 'pointermove', clientX: 400 });
      assert.strictEqual(chartContainer.style.cursor, 'pointer', 'Cursor must be pointer when hovering over a maneuver');
      assert.ok(chartContainer.title.includes('Wingover'), 'Hover title must prompt to select Wingover');

      // Hover over glide at x = 0 (point index 0, neutral glide)
      chartContainer.dispatchEvent({ type: 'pointermove', clientX: 0 });
      assert.strictEqual(chartContainer.style.cursor, 'crosshair', 'Cursor must be crosshair when hovering over neutral glide');
      assert.strictEqual(chartContainer.title, '', 'Hover title must be empty on neutral space');

      // 2. Tap selection test: tap on wingover at x = 400 (point index 6)
      chartContainer.dispatchEvent({ type: 'pointerdown', clientX: 400, clientY: 100, pointerId: 1 });
      chartContainer.dispatchEvent({ type: 'pointerup', clientX: 400, clientY: 100, pointerId: 1 });

      assert.ok(mapEngine.highlightedRange, 'Map engine must highlight range');
      assert.strictEqual(mapEngine.highlightedRange.startIndex, 6);
      assert.strictEqual(mapEngine.highlightedRange.endIndex, 7);
      assert.strictEqual(mapEngine.highlightedRange.options.label, 'Wingover');
      assert.strictEqual(mapEngine.isTrimmedToPhase, true);
      assert.strictEqual(phaseBadge.textContent, 'Wingover');
      assert.strictEqual(phaseBadge.style.display, 'inline-flex');
      assert.strictEqual(resetBtn.style.display, 'inline-flex');

      // 3. Click outside maneuvers on neutral glide space (x = 0) -> clears selection
      // Wait for debounce guard
      await new Promise((r) => setTimeout(r, 260));
      chartContainer.dispatchEvent({ type: 'pointerdown', clientX: 0, clientY: 100, pointerId: 1 });
      chartContainer.dispatchEvent({ type: 'pointerup', clientX: 0, clientY: 100, pointerId: 1 });

      assert.strictEqual(mapEngine.highlightedRange, null, 'Highlighted range must be cleared when tapping neutral glide space');
      assert.strictEqual(phaseBadge.textContent, '');
      assert.strictEqual(phaseBadge.style.display, 'none');
      assert.strictEqual(resetBtn.style.display, 'none');

      // 4. Drag test: moving > 6px must NOT select phase
      await new Promise((r) => setTimeout(r, 260));
      chartContainer.dispatchEvent({ type: 'pointerdown', clientX: 400, clientY: 100, pointerId: 1 });
      chartContainer.dispatchEvent({ type: 'pointermove', clientX: 430, clientY: 100, pointerId: 1 }); // delta = 30px
      chartContainer.dispatchEvent({ type: 'pointerup', clientX: 430, clientY: 100, pointerId: 1 });

      assert.strictEqual(mapEngine.highlightedRange, null, 'Drag action must NOT trigger phase selection');

      closeFlightDetailView();
    });
  });

  describe('Personal Career Records Badges in Flight Detail', () => {
    it('should render record badge and highlight class on metrics that hold career records', () => {
      const recordBundle = {
        ...mockBundle,
        meta: {
          ...mockBundle.meta,
          maxAltMsl: 2037, // Record
          maxGainMeters: 850, // Record
          durationMinutes: 120, // Record
          distanceKm: 25.5, // Record
          thermalsCount: 8, // Record
          maxClimbRate: 5.2, // Record
          maxSinkRate: -4.5 // Record
        },
        telemetry: {
          ...mockBundle.telemetry,
          thermals: [
            { thermalIndex: 1, altGain: 300 },
            { thermalIndex: 2, altGain: 250 },
            { thermalIndex: 3, altGain: 300 }
          ]
        }
      };

      const careerRecords = {
        maxAlt: { val: 2037, flightId: 'fl_cornizzolo_detail' },
        maxGain: { val: 850, flightId: 'fl_cornizzolo_detail' },
        maxDuration: { val: 120, flightId: 'fl_cornizzolo_detail' },
        maxDistance: { val: 25.5, flightId: 'fl_cornizzolo_detail' },
        maxThermals: { val: 8, flightId: 'fl_cornizzolo_detail' },
        maxClimbRate: { val: 5.2, flightId: 'fl_cornizzolo_detail' },
        maxSinkRate: { val: -4.5, flightId: 'fl_cornizzolo_detail' }
      };

      const html = renderFlightDetailHtml(recordBundle, { careerRecords });

      // Header card should display "Record Personale" status pill and duration record badge
      assert.ok(html.includes('gm-status-pill-record'), 'Must show Record Personale status pill in header');
      assert.ok(html.includes('Record Personale'), 'Must contain Record Personale text');
      assert.ok(html.includes('title="Record Personale: Volo Più Lungo"'), 'Must have duration record badge');

      // Metric cards for Alt, Gain, Distance, Thermals, Climb, Sink should have record badges and highlight classes
      assert.ok(html.includes('gm-record-badge'), 'Must render record badges on metric cards');
      assert.ok(html.includes('gm-flight-metric-card-record'), 'Must apply record card highlight class');
      assert.ok(html.includes('title="Record Personale: Quota Massima MSL"'), 'Must highlight maxAlt record');
      assert.ok(html.includes('title="Record Personale: Maggior Guadagno"'), 'Must highlight maxGain record');
      assert.ok(html.includes('title="Record Personale: Distanza Massima"'), 'Must highlight distance record');
      assert.ok(html.includes('title="Record Personale: Termiche Massime"'), 'Must highlight thermals record');
      assert.ok(html.includes('title="Record Personale: Salita Massima (Max Vario)"'), 'Must highlight max climb/vario record');
      assert.ok(html.includes('title="Record Personale: Discesa Massima (Min Vario)"'), 'Must highlight min vario/sink record');
    });

    it('should NOT render record badges or highlight classes on metrics below career records', () => {
      const nonRecordBundle = {
        ...mockBundle,
        meta: {
          ...mockBundle.meta,
          maxAltMsl: 1200,
          maxGainMeters: 300,
          durationMinutes: 30,
          distanceKm: 5.0,
          thermalsCount: 1,
          maxClimbRate: 1.5,
          maxSinkRate: -1.2
        },
        telemetry: {
          ...mockBundle.telemetry,
          thermals: [{ thermalIndex: 1, altGain: 150 }]
        }
      };

      const careerRecords = {
        maxAlt: { val: 2037, flightId: 'other-1' },
        maxGain: { val: 850, flightId: 'other-2' },
        maxDuration: { val: 120, flightId: 'other-3' },
        maxDistance: { val: 25.5, flightId: 'other-4' },
        maxThermals: { val: 8, flightId: 'other-5' },
        maxClimbRate: { val: 4.5, flightId: 'other-6' },
        maxSinkRate: { val: -4.5, flightId: 'other-7' }
      };

      const html = renderFlightDetailHtml(nonRecordBundle, { careerRecords });

      assert.ok(!html.includes('gm-status-pill-record'), 'Non-record flight must NOT show Record Personale pill');
      assert.ok(!html.includes('gm-record-badge'), 'Non-record flight must NOT render record badges');
      assert.ok(!html.includes('gm-flight-metric-card-record'), 'Non-record flight must NOT apply record card highlight class');
    });
  });

  describe('Interactive Chart Bottom Badges, Scrubber vs Pan Gestures, and Map Vario Colors', () => {
    it('should position maneuver badge tags at the bottom with 16px height and 10.5px bold font', () => {
      const svg = generateExpandedSvgChart(mockBundle.raw.decimatedPoints, 600, 210, {
        thermals: [{ thermalIndex: 1, startIndex: 1, endIndex: 3 }],
        dynamicManeuvers: [{ type: 'wingover', startIndex: 4, endIndex: 5 }]
      });

      // Bottom placement: for height 210 and padBottom 22, bottomY is 188. Badges are at y >= 165
      assert.ok(svg.includes('class="gm-chart-thermal-band"'), 'Must render thermal band');
      assert.ok(svg.includes('font-size="10.5"'), 'Must render high-contrast 10.5px font');
      assert.ok(svg.includes('font-weight="800"'), 'Must render bold 800 weight font');
      assert.ok(svg.includes('height="16"'), 'Must have 16px height pill');
      assert.ok(svg.includes('fill="#fbbf24"'), 'Thermal text must have amber color');
      assert.ok(svg.includes('stroke="#fbbf24"'), 'Thermal pill stroke must be amber');
      assert.ok(svg.includes('y="169"') || svg.includes('y="181"'), 'Must be positioned near the bottom of chart');

      // Maneuver badge
      assert.ok(svg.includes('class="gm-chart-maneuver-marker"'), 'Must render maneuver marker');
      assert.ok(svg.includes('fill="#e9d5ff"'), 'Maneuver text must be high-contrast light purple');
      assert.ok(svg.includes('stroke="#c084fc"'), 'Maneuver pill stroke must be purple');
    });

    it('should support short-press scrubbing without altering chart pan, and require long-press (>=350ms) to pan', async () => {
      const testBundle = {
        meta: { id: 'fl_gesture_test' },
        raw: {
          decimatedPoints: [
            { timeSeconds: 0, alt: 1000, lat: 45.80, lon: 9.20 },
            { timeSeconds: 60, alt: 1100, lat: 45.81, lon: 9.21 },
            { timeSeconds: 120, alt: 1200, lat: 45.82, lon: 9.22 },
            { timeSeconds: 180, alt: 1300, lat: 45.83, lon: 9.23 },
            { timeSeconds: 240, alt: 1400, lat: 45.84, lon: 9.24 },
            { timeSeconds: 300, alt: 1500, lat: 45.85, lon: 9.25 }
          ]
        },
        telemetry: {}
      };

      const overlay = createMockElement('flight-detail-overlay');
      const chartContainer = createMockElement('gm-interactive-chart-container');
      const mapCanvas = createMockElement('flight-detail-map-canvas');
      const btnZoomIn = createMockElement('btn-chart-zoom-in');
      const hudTime = createMockElement('gm-hud-time');

      overlay.appendChild(mapCanvas);
      overlay.appendChild(btnZoomIn);
      overlay.appendChild(hudTime);
      overlay.appendChild(chartContainer);

      attachInteractiveFlightChart(overlay, testBundle);

      // Zoom in to 2.0x so panning is enabled
      btnZoomIn.dispatchEvent({ type: 'click' });
      btnZoomIn.dispatchEvent({ type: 'click' }); // zoom = 2.0

      // 1. Short-press scrubbing: drag immediately across chart (<350ms)
      chartContainer.dispatchEvent({ type: 'pointerdown', clientX: 200, clientY: 100, pointerId: 1 });
      chartContainer.dispatchEvent({ type: 'pointermove', clientX: 350, clientY: 100, pointerId: 1 }); // deltaX = 150px
      chartContainer.dispatchEvent({ type: 'pointerup', clientX: 350, clientY: 100, pointerId: 1 });

      const mapEngine = getActiveFlightDetailMapEngine();
      // Map cursor updated to scrubbed position
      assert.ok(mapEngine.cursorIndex !== null, 'Cursor must update during short-press scrub');

      // 2. Long-press pan: hold for >=350ms, then move
      chartContainer.dispatchEvent({ type: 'pointerdown', clientX: 200, clientY: 100, pointerId: 2 });
      await new Promise((r) => setTimeout(r, 380)); // wait for long-press timer to fire
      chartContainer.dispatchEvent({ type: 'pointermove', clientX: 350, clientY: 100, pointerId: 2 });
      chartContainer.dispatchEvent({ type: 'pointerup', clientX: 350, clientY: 100, pointerId: 2 });

      // Clean up
      closeFlightDetailView();
    });

    it('should render authentic variometer colors on the map without blue overlay when trimmed to a thermal', async () => {
      const originalWindow = globalThis.window;
      const createdLayers = [];
      const featureGroups = [];

      class MockPolyline {
        constructor(coords, opts = {}) {
          this.coords = coords;
          this.opts = { ...opts };
          this.isBroughtToFront = false;
        }
        setStyle(style) {
          this.opts = { ...this.opts, ...style };
        }
        bringToFront() {
          this.isBroughtToFront = true;
        }
        remove() {}
      }

      class MockFeatureGroup {
        constructor() {
          this.layers = [];
          featureGroups.push(this);
        }
        addLayer(l) { this.layers.push(l); createdLayers.push(l); return this; }
        removeLayer(l) { this.layers = this.layers.filter(x => x !== l); }
        clearLayers() { this.layers = []; }
        addTo() { return this; }
      }

      globalThis.window = {
        L: {
          polyline: (coords, opts) => new MockPolyline(coords, opts),
          featureGroup: () => new MockFeatureGroup(),
          layerGroup: () => ({ addTo: () => ({}) }),
          control: { zoom: () => ({ addTo: () => {} }) },
          marker: (coords, opts) => ({ coords, opts, remove: () => {} }),
          divIcon: (opts) => ({ opts }),
          latLngBounds: (coords) => ({ coords }),
          map: () => ({
            addLayer: () => {},
            removeLayer: () => {},
            remove: () => {},
            fitBounds: () => {},
            getZoom: () => 14,
            setView: () => {},
            on: () => {},
            off: () => {}
          }),
          tileLayer: () => ({ addTo: () => {}, remove: () => {} })
        }
      };

      const { LeafletMapEngine } = await import('../../ui/map/mapEngineAdapter.js');
      const engine = new LeafletMapEngine(null, { isMiniMap: true });
      const mockMap = {
        addLayer: () => {},
        removeLayer: () => {},
        remove: () => {},
        fitBounds: () => {},
        getZoom: () => 14,
        setView: () => {},
        on: () => {},
        off: () => {}
      };
      engine.map = mockMap;
      engine.overlayLayerGroup = window.L.featureGroup();
      engine.phaseHighlightGroup = window.L.featureGroup();
      engine.trackBounds = { _isInitialBounds: true };

      // 4 points in a climbing thermal (+2.0 m/s climb)
      engine.renderFlightTrack(null, {
        points: [
          { lat: 45.80, lon: 9.20, alt: 1000, timeSeconds: 0, vario: 2.0 },
          { lat: 45.81, lon: 9.21, alt: 1020, timeSeconds: 10, vario: 2.0 },
          { lat: 45.82, lon: 9.22, alt: 1040, timeSeconds: 20, vario: 2.0 },
          { lat: 45.83, lon: 9.23, alt: 1060, timeSeconds: 30, vario: 2.0 }
        ]
      });

      // Verify the generated track polylines have warm thermal colors (orange #ea580c)
      const thermalPoly = engine.flightTrackPolylines[0];
      assert.strictEqual(thermalPoly.opts.color, '#ea580c', 'Thermal segment color must be warm orange for +2.0 m/s');

      // Highlight thermal range [0, 3]
      engine.highlightFlightTrackRange(0, 3, { label: 'T1' });

      // Overlapping polyline must be brought to front with weight 5.5 and opacity 1.0
      assert.strictEqual(thermalPoly.isBroughtToFront, true, 'Active phase polyline must be brought to front');
      assert.strictEqual(thermalPoly.opts.weight, 5.5, 'Active phase polyline must have prominent weight 5.5');
      assert.strictEqual(thermalPoly.opts.opacity, 1.0, 'Active phase polyline must have full opacity 1.0');

      // Crucial: check that phaseHighlightGroup does NOT contain a blue #38bdf8 polyline!
      const bluePolylines = engine.phaseHighlightGroup.layers.filter(
        l => l instanceof MockPolyline && l.opts.color === '#38bdf8'
      );
      assert.strictEqual(bluePolylines.length, 0, 'Must NOT draw blue #38bdf8 halo over authentic variometer colors');

      // Clean up
      engine.destroy();
      globalThis.window = originalWindow;
    });
  });
});



