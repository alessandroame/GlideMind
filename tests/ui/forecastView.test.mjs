import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../core/store.js';
import {
  ForecastViewController,
  normalizeAngle,
  calculateAngularDifference,
  getCardinalDirection,
  polarToCartesian,
  describeSectorArc,
  generateGuidoBriefing
} from '../../ui/views/ForecastView.js';
import { DEFAULT_COMPRENSORI } from '../../core/comprensorio.js';
import { GLIDER_CLASSES } from '../../core/flyability.js';

describe('GlideMind Phase 4 - ForecastView Architecture & Contracts', () => {
  it('should initialize with default state and contracts', () => {
    const mockStore = createStore();
    const controller = new ForecastViewController({ store: mockStore });

    assert.ok(controller, 'Controller must instantiate');
    assert.equal(typeof controller.mount, 'function');
    assert.equal(typeof controller.unmount, 'function');
    assert.equal(typeof controller.renderHtml, 'function');
    assert.equal(controller.selectedHour >= 8 && controller.selectedHour <= 20, true, 'Default hour must be in flight window');
    assert.equal(typeof controller.activeDate, 'string');
  });

  it('should calculate angles and compass geometry accurately', () => {
    // Normalization
    assert.equal(normalizeAngle(0), 0);
    assert.equal(normalizeAngle(360), 0);
    assert.equal(normalizeAngle(-90), 270);
    assert.equal(normalizeAngle(450), 90);

    // Angular difference with sign
    assert.equal(calculateAngularDifference(180, 180), 0);
    assert.equal(calculateAngularDifference(180, 190), 10);
    assert.equal(calculateAngularDifference(180, 170), -10);
    assert.equal(calculateAngularDifference(350, 10), 20);
    assert.equal(calculateAngularDifference(10, 350), -20);

    // Cardinal points
    assert.equal(getCardinalDirection(0), 'N');
    assert.equal(getCardinalDirection(90), 'E');
    assert.equal(getCardinalDirection(180), 'S');
    assert.equal(getCardinalDirection(270), 'W');
    assert.equal(getCardinalDirection(175), 'S');
    assert.equal(getCardinalDirection(220), 'SW');

    // Polar to Cartesian (Center 100, 100, R 50)
    // 0 deg (North) -> x = 100, y = 50
    const ptN = polarToCartesian(100, 100, 50, 0);
    assert.equal(ptN.x, 100);
    assert.equal(ptN.y, 50);

    // 90 deg (East) -> x = 150, y = 100
    const ptE = polarToCartesian(100, 100, 50, 90);
    assert.equal(ptE.x, 150);
    assert.equal(ptE.y, 100);

    // Sector arc string
    const arc = describeSectorArc(100, 100, 75, 140, 220);
    assert.ok(arc.startsWith('M 100 100 L'), 'Sector arc must start at center');
    assert.ok(arc.includes('A 75 75'), 'Must contain SVG arc definition with radius');
  });

  it('should enforce the Unico Binomio contract (1 takeoff, 1 landing) in summary card', () => {
    const mockStore = createStore({
      selectedSpot: DEFAULT_COMPRENSORI[0] // Monte Cornizzolo
    });
    const controller = new ForecastViewController({ store: mockStore });
    controller.selectedHour = 13;

    const html = controller.renderHtml();

    // Must have summary section
    assert.ok(html.includes('id="forecast-summary-card"'), 'Must have #forecast-summary-card');
    assert.ok(html.includes('13:00'), 'Must display selected hour 13:00');

    // Count takeoff ↗ and landing ↘ icons in summary card
    const summaryCardMatch = html.match(/<article id="forecast-summary-card"[\s\S]*?<\/article>/);
    assert.ok(summaryCardMatch, 'Summary card must exist in HTML');
    const summaryHtml = summaryCardMatch[0];

    const takeoffCount = (summaryHtml.match(/<span class="gm-flight-icon">↗<\/span>/g) || []).length;
    const landingCount = (summaryHtml.match(/<span class="gm-flight-icon">↘<\/span>/g) || []).length;
    assert.equal(takeoffCount, 1, 'Summary card must show exactly 1 takeoff');
    assert.equal(landingCount, 1, 'Summary card must show exactly 1 landing');

    // Must show explicit names and efficiency
    assert.ok(summaryHtml.includes('Risparmio') || summaryHtml.includes('Centrale'), 'Must display takeoff name');
    assert.ok(summaryHtml.includes('Suello'), 'Must display landing name');
    assert.ok(summaryHtml.includes('1:'), 'Must show glide ratio 1:X.X');
    assert.ok(summaryHtml.includes('gm-spot-explain'), 'Must render physical explainability string');
  });

  it('should render the 13-slot hourly timeline from 08:00 to 20:00 with waterfall bars', () => {
    const mockStore = createStore({
      selectedSpot: DEFAULT_COMPRENSORI[0]
    });
    const controller = new ForecastViewController({ store: mockStore });
    controller.selectedHour = 12;

    const html = controller.renderHtml();
    assert.ok(html.includes('id="forecast-timeline-scrubber"'), 'Must render timeline scrubber');

    // Verify all 13 hourly columns exist
    for (let h = 8; h <= 20; h++) {
      const timeLabel = String(h).padStart(2, '0');
      assert.ok(html.includes(`data-hour="${h}"`), `Timeline must contain slot for hour ${h}`);
      assert.ok(html.includes(timeLabel), `Timeline must render label ${timeLabel}`);
    }

    // Active column check
    assert.ok(
      /gm-timeline-col-compact\s+active[\s\S]*?data-hour="12"/.test(html),
      'Hour 12 must be marked active'
    );
  });

  it('should render 360° wind compass with takeoff azimuth cone and alignment status', () => {
    const mockStore = createStore({
      selectedSpot: DEFAULT_COMPRENSORI[0] // Monte Cornizzolo (Takeoff azimuth 170°)
    });
    const controller = new ForecastViewController({ store: mockStore });
    controller.selectedHour = 13;

    const html = controller.renderHtml();

    assert.ok(html.includes('id="forecast-wind-compass"'), 'Must render SVG 360 compass');
    assert.ok(html.includes('170° (S)'), 'Must indicate takeoff azimuth 170°');
    assert.ok(html.includes('gm-compass-readout'), 'Must render compass readout bar');
    assert.ok(html.includes('km/h'), 'Must display wind metrics in km/h');
  });

  it('should render Soundings panel with LCL Cloud Base and Thermal Ceiling', () => {
    const mockStore = createStore({
      selectedSpot: DEFAULT_COMPRENSORI[0]
    });
    const controller = new ForecastViewController({ store: mockStore });
    controller.selectedHour = 13;

    const html = controller.renderHtml();

    assert.ok(html.includes('id="forecast-sounding-card"'), 'Must render sounding card');
    assert.ok(html.includes('Base Cumulo (LCL)'), 'Must display LCL label');
    assert.ok(html.includes('Ceiling Termico'), 'Must display thermal ceiling label');
    assert.ok(html.includes('Gradiente Termico'), 'Must display lapse rate label');
    assert.ok(html.includes('Rischio Temporali'), 'Must display thunderstorm risk label (anti-jargon)');
    assert.ok(html.includes('CAPE'), 'Must display CAPE secondary indicator');
    assert.ok(html.includes('AGL'), 'Must display above-ground-level cloud base');
  });

  it('should generate Guido safety flight briefing deterministically', () => {
    const spot = DEFAULT_COMPRENSORI[0];
    const controller = new ForecastViewController();
    const weatherData = controller.getWeatherData(spot, '2026-10-09');

    const briefing = generateGuidoBriefing(spot, weatherData, '2026-10-09', GLIDER_CLASSES.EN_A);

    assert.ok(briefing, 'Briefing must be generated');
    assert.ok(briefing.window, 'Must specify flight window');
    assert.ok(briefing.hazards, 'Must specify hazards list');
    assert.ok(briefing.pilotLevel, 'Must specify pilot level advice');
    assert.ok(briefing.summary.includes('Guido:'), 'Summary must follow Guido persona');

    const html = controller.renderHtml();
    assert.ok(html.includes('id="forecast-briefing-box"'), 'HTML must render briefing box');
    assert.ok(html.includes('Briefing di Volo (Guido)'), 'HTML must display briefing header');
  });

  it('should switch spot and synchronize with store when picking spot in sheet', () => {
    const mockStore = createStore({
      selectedSpot: DEFAULT_COMPRENSORI[0]
    });
    const controller = new ForecastViewController({ store: mockStore });

    let rendered = false;
    controller.render = () => { rendered = true; };

    const mockClickEvent = {
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'pick-spot';
                if (attr === 'data-spot-id') return DEFAULT_COMPRENSORI[3].id; // Bassano
                return null;
              }
            };
          }
          return null;
        }
      }
    };

    controller.handleClick(mockClickEvent);

    assert.equal(mockStore.getState().selectedSpot.id, DEFAULT_COMPRENSORI[3].id);
    assert.equal(rendered, true, 'Must trigger re-render on spot change');

    // Test sub-spot dropdown change
    const takeoffId = DEFAULT_COMPRENSORI[3].takeoffs[0].id;
    controller.handleChange({
      target: {
        id: 'forecast-subspot-select',
        value: takeoffId
      }
    });
    assert.equal(controller.selectedSubSpot, takeoffId);
  });

  it('should switch date and re-render on date tab click', () => {
    const mockStore = createStore();
    const controller = new ForecastViewController({ store: mockStore });

    let rendered = false;
    controller.render = () => { rendered = true; };

    const targetDate = controller.getDateString(1); // Tomorrow
    const mockClickEvent = {
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'select-date';
                if (attr === 'data-date') return targetDate;
                return null;
              }
            };
          }
          return null;
        }
      }
    };

    controller.handleClick(mockClickEvent);

    assert.equal(controller.activeDate, targetDate);
    assert.equal(mockStore.getState().activeDate, targetDate);
    assert.equal(rendered, true);
  });

  it('should switch active hour and update details on timeline slot click', () => {
    const mockStore = createStore();
    const controller = new ForecastViewController({ store: mockStore });

    let rendered = false;
    controller.render = () => { rendered = true; };

    const mockClickEvent = {
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'select-hour';
                if (attr === 'data-hour') return '15';
                return null;
              }
            };
          }
          return null;
        }
      }
    };

    controller.handleClick(mockClickEvent);

    assert.equal(controller.selectedHour, 15);
    assert.equal(rendered, true);
  });

  it('should toggle wind and sounding views between summary and chart mode', () => {
    const mockStore = createStore();
    const controller = new ForecastViewController({ store: mockStore });

    let rendered = false;
    controller.render = () => { rendered = true; };

    // Toggle Wind View to Chart
    controller.handleClick({
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'set-wind-view';
                if (attr === 'data-view') return 'chart';
                return null;
              }
            };
          }
          return null;
        }
      }
    });

    assert.equal(controller.windPanelView, 'chart');
    assert.equal(rendered, true);

    const chartHtml = controller.renderHtml();
    assert.ok(chartHtml.includes('id="forecast-wind-chart-box"'), 'Must render wind chart box');

    // Toggle Sounding View to Chart
    controller.handleClick({
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'set-sounding-view';
                if (attr === 'data-view') return 'chart';
                return null;
              }
            };
          }
          return null;
        }
      }
    });

    assert.equal(controller.soundingPanelView, 'chart');
    const soundingChartHtml = controller.renderHtml();
    assert.ok(soundingChartHtml.includes('id="forecast-sounding-chart-box"'), 'Must render sounding chart box');
  });

  it('should clean up listeners and subscriptions safely on unmount', () => {
    const mockStore = createStore();
    const controller = new ForecastViewController({ store: mockStore });

    let clickRemoved = false;
    let changeRemoved = false;
    const mockContainer = {
      innerHTML: '',
      addEventListener() {},
      removeEventListener(evt) {
        if (evt === 'click') clickRemoved = true;
        if (evt === 'change') changeRemoved = true;
      }
    };

    controller.mount(mockContainer);
    assert.ok(controller.containerEl);
    assert.ok(controller.unsubscribeStore);

    controller.unmount();
    assert.equal(controller.containerEl, null);
    assert.equal(controller.unsubscribeStore, null);
    assert.equal(clickRemoved, true);
    assert.equal(changeRemoved, true);
  });
});
