import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore } from '../../core/store.js';
import {
  ForecastViewController,
  normalizeAngle,
  calculateAngularDifference,
  getCardinalDirection,
  polarToCartesian,
  describeSectorArc,
  buildSmoothPath,
  buildSmoothAreaPath,
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

    // Ensure naked wind numbers and unreferenced arrows are removed from scrubber to follow Progressive Disclosure
    assert.ok(
      !html.includes('compact-wind'),
      'Scrubber columns must not render naked numbers without context'
    );
    assert.ok(
      !html.includes('compact-arrow'),
      'Scrubber columns must not render ambiguous rotated arrows without compass context'
    );
  });

  it('should render compact scrubber without redundant header and mark current hour with badge when activeDate is today', () => {
    const mockStore = createStore({
      selectedSpot: DEFAULT_COMPRENSORI[0]
    });
    const controller = new ForecastViewController({ store: mockStore });
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    controller.activeDate = todayIso;
    controller.selectedHour = 12;

    const html = controller.renderHtml();

    // Verify redundant technical header is absent
    assert.ok(!html.includes('<span>Scrubber Orario</span>'), 'Must not render redundant technical label');
    assert.ok(!html.includes('id="forecast-scrubber-hour-display"'), 'Must not render redundant text header');

    // If current time is within [8, 20], verify is-now and compact-now-badge
    const currentHour = today.getHours();
    if (currentHour >= 8 && currentHour <= 20) {
      assert.ok(html.includes('is-now'), 'Must mark current hour slot with is-now class');
      assert.ok(html.includes('compact-now-badge'), 'Must render ORA badge on current hour slot');
      assert.ok(html.includes('>ORA</span>'), 'Must contain text ORA');
    }

    // Verify enhanced flyability bar with status-bg
    assert.ok(html.includes('compact-bar'), 'Must render compact-bar');
    assert.ok(html.includes('compact-bar-fill'), 'Must render compact-bar-fill');
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

  it('should advance and decrement hour using stepper buttons', () => {
    const mockStore = createStore();
    const controller = new ForecastViewController({ store: mockStore });
    controller.selectedHour = 12;

    const createActionClick = (actionName) => ({
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return actionName;
                return null;
              }
            };
          }
          return null;
        }
      }
    });

    // Step next
    controller.handleClick(createActionClick('next-hour'));
    assert.equal(controller.selectedHour, 13);

    // Step prev
    controller.handleClick(createActionClick('prev-hour'));
    assert.equal(controller.selectedHour, 12);

    // Bounds: test min boundary
    controller.selectedHour = 8;
    controller.handleClick(createActionClick('prev-hour'));
    assert.equal(controller.selectedHour, 8, 'Must not decrement below 8:00');

    // Bounds: test max boundary
    controller.selectedHour = 20;
    controller.handleClick(createActionClick('next-hour'));
    assert.equal(controller.selectedHour, 20, 'Must not advance above 20:00');
  });

  it('should support continuous pointer scrubbing/slide selection across timeline hours', () => {
    const mockStore = createStore();
    const controller = new ForecastViewController({ store: mockStore });

    const mockStrip = {
      contains() { return true; },
      setPointerCapture() {},
      releasePointerCapture() {},
      getBoundingClientRect() {
        return {
          left: 100,
          right: 360,
          top: 500,
          bottom: 550,
          width: 260,
          height: 50
        };
      }
    };

    const mockContainer = {
      querySelector(sel) {
        if (sel === '#forecast-timeline-strip') return mockStrip;
        return null;
      },
      addEventListener() {},
      removeEventListener() {}
    };

    controller.containerEl = mockContainer;

    // 1. PointerDown at hour 10 (x = 100 + 2.5 * 20 = 150)
    controller.handlePointerDown({
      target: mockStrip,
      clientX: 150,
      pointerId: 1
    });
    assert.equal(controller.isScrubbing, true, 'Scrubbing must be active on pointer down');
    assert.equal(controller.selectedHour, 10, 'Selected hour must update to 10');

    // 2. Continuous pointer drag to hour 18 (x = 100 + 10.5 * 20 = 310)
    controller.handlePointerMove({
      target: mockStrip,
      clientX: 310,
      pointerId: 1
    });
    assert.equal(controller.selectedHour, 18, 'Selected hour must smoothly update to 18 during slide');

    // 3. PointerUp finishes scrubbing
    controller.handlePointerUp({
      target: mockStrip,
      pointerId: 1
    });
    assert.equal(controller.isScrubbing, false, 'Scrubbing must be false on pointer up');

    // 4. Trailing click from initial touch position (e.g. 10) must be ignored if pointer was dragged
    controller.handleClick({
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'select-hour';
                if (attr === 'data-hour') return '10';
                return null;
              }
            };
          }
          return null;
        }
      }
    });
    assert.equal(controller.selectedHour, 18, 'Selected hour must remain 18 and not jump back to 10 from trailing click');
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

  it('should render smart date tabs with calendar trigger and custom date support', () => {
    const mockStore = createStore({ activeDate: '2026-10-25' }); // 16 days in future
    const controller = new ForecastViewController({ store: mockStore });
    controller.activeDate = '2026-10-25';

    const html = controller.renderHtml();
    assert.ok(html.includes('gm-date-tabs'), 'Must render smart date tabs');
    assert.ok(html.includes('data-action="open-date-picker-sheet"'), 'Must render calendar button');
    assert.ok(html.includes('gm-date-tab-calendar'), 'Must style calendar button');
    assert.ok(html.includes('gm-horizon-notice'), 'Must render synoptic horizon notice for > 7 days');

    // Test picking date from calendar
    let rendered = false;
    controller.render = () => { rendered = true; };

    controller.handleClick({
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'pick-calendar-date';
                if (attr === 'data-date') return '2026-10-18';
                return null;
              }
            };
          }
          return null;
        }
      }
    });

    assert.equal(controller.activeDate, '2026-10-18');
    assert.equal(mockStore.getState().activeDate, '2026-10-18');
    assert.equal(rendered, true);
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

  it('should open the 14-day date picker sheet with 4-color flyability indicators and legend', async () => {
    const { initSheetManager } = await import('../../ui/sheetManager.js');
    let capturedHtml = '';
    const mockContainer = {
      innerHTML: '',
      querySelector(sel) {
        if (sel === '#sheet-backdrop') return { addEventListener() {} };
        if (sel === '.gm-sheet') return { addEventListener() {}, setAttribute() {} };
        if (sel === '.gm-sheet-title') return { textContent: '' };
        if (sel === '.gm-sheet-content') return {
          get innerHTML() { return capturedHtml; },
          set innerHTML(val) { capturedHtml = val; },
          appendChild() {}
        };
        if (sel === '.gm-sheet-close-btn') return { addEventListener() {}, focus() {} };
        return null;
      },
      classList: { add() {}, remove() {}, contains() { return false; } },
      setAttribute() {}
    };

    initSheetManager(mockContainer);
    const mockStore = createStore();
    const controller = new ForecastViewController({ store: mockStore });

    controller.openDatePickerSheet();

    assert.ok(capturedHtml.includes('Calendario Previsioni (Prossimi 14 Giorni)'));
    assert.ok(capturedHtml.includes('grid-fly-status'));
    assert.ok(capturedHtml.includes('gm-date-sheet-legend'));
    assert.ok(capturedHtml.includes('Volabile'));
    assert.ok(capturedHtml.includes('Cautela'));
    assert.ok(capturedHtml.includes('Non Volabile'));
    assert.ok(capturedHtml.includes('Severo'));
  });

  it('should enforce semantic header layout with safe-area and Fitts touch target in ForecastView', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const mockStore = createStore();
    const controller = new ForecastViewController({ store: mockStore });
    const html = controller.renderHtml();

    // Verify semantic header in view HTML
    assert.ok(html.includes('<header class="gm-forecast-header">'), 'Header must have gm-forecast-header class');
    assert.ok(!html.includes('gap-2.5'), 'Header must not rely on non-existent gap-2.5 utility');

    // Verify CSS design tokens and layout rules in theme.css
    const cssContent = fs.readFileSync(path.resolve('css/theme.css'), 'utf-8');
    assert.ok(cssContent.includes('.gm-forecast-header'), 'theme.css must declare .gm-forecast-header');
    assert.ok(cssContent.includes('safe-area-inset-top'), 'theme.css must support safe-area-inset-top for header breathing room');
    assert.ok(cssContent.includes('.gm-subspot-select'), 'theme.css must define .gm-subspot-select');
  });

  it('should render collapsing sticky header with spot, sub-spot details and live badge', async () => {
    const mockStore = createStore({
      selectedSpot: DEFAULT_COMPRENSORI[0] // Monte Cornizzolo
    });
    const controller = new ForecastViewController({ store: mockStore });
    
    // Default overview mode
    let html = controller.renderHtml();
    assert.ok(html.includes('id="forecast-sticky-bar"'), 'Must render #forecast-sticky-bar in view');
    assert.ok(html.includes('gm-forecast-sticky-bar'), 'Must have gm-forecast-sticky-bar class');
    assert.ok(html.includes('Monte Cornizzolo'), 'Must display active spot name in sticky bar');
    assert.ok(html.includes('Panoramica'), 'Must display Panoramica in default sticky bar');
    assert.ok(html.includes('gm-forecast-live-badge-sticky'), 'Must render dedicated sticky live badge');
    assert.ok(html.includes('data-action="scroll-to-top"'), 'Must provide scroll-to-top button');

    // Focused takeoff mode
    const takeoffs = DEFAULT_COMPRENSORI[0].takeoffs || [];
    if (takeoffs.length > 0) {
      controller.selectedSubSpot = takeoffs[0].id;
      html = controller.renderHtml();
      assert.ok(html.includes(takeoffs[0].name), 'Must display takeoff name in sticky bar when focused');
      assert.ok(html.includes(`${takeoffs[0].altitude}m`), 'Must display takeoff altitude in sticky bar');
    }
  });

  it('should toggle sticky bar visibility when scroll threshold is crossed in handleScroll', () => {
    const mockStore = createStore();
    const controller = new ForecastViewController({ store: mockStore });

    let isVisible = false;
    let ariaHidden = 'true';
    const mockStickyBar = {
      classList: {
        toggle(cls, val) {
          if (cls === 'visible') isVisible = Boolean(val);
        }
      },
      setAttribute(name, val) {
        if (name === 'aria-hidden') ariaHidden = val;
      }
    };

    let scrollTopValue = 0;
    const mockScrollContainer = {
      get scrollTop() { return scrollTopValue; },
      addEventListener() {},
      removeEventListener() {},
      scrollTo() {}
    };

    controller.scrollContainerEl = mockScrollContainer;
    controller.stickyBarEl = mockStickyBar;

    // Below threshold (scrollTop = 30 <= 60)
    scrollTopValue = 30;
    controller.handleScroll();
    assert.equal(isVisible, false, 'Sticky bar must remain hidden below threshold');

    // Above threshold (scrollTop = 85 > 60)
    scrollTopValue = 85;
    controller.handleScroll();
    assert.equal(isVisible, true, 'Sticky bar must become visible above threshold');
    assert.equal(ariaHidden, 'false');

    // Back to top (scrollTop = 10 <= 60)
    scrollTopValue = 10;
    controller.handleScroll();
    assert.equal(isVisible, false, 'Sticky bar must hide when scrolling back to top');
    assert.equal(ariaHidden, 'true');
  });

  it('should smoothly scroll to top on scroll-to-top click and declare CSS styles in theme.css', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const mockStore = createStore();
    const controller = new ForecastViewController({ store: mockStore });

    let scrolledTo = null;
    controller.scrollContainerEl = {
      scrollTo(options) {
        scrolledTo = options;
      }
    };

    controller.handleClick({
      target: {
        closest(sel) {
          if (sel === '[data-action]') return { getAttribute: () => 'scroll-to-top' };
          return null;
        }
      }
    });

    assert.deepEqual(scrolledTo, { top: 0, behavior: 'smooth' }, 'Must scroll to top smoothly');

    // Verify CSS tokens in theme.css
    const cssContent = fs.readFileSync(path.resolve('css/theme.css'), 'utf-8');
    assert.ok(cssContent.includes('.gm-forecast-sticky-bar'), 'theme.css must declare .gm-forecast-sticky-bar');
    assert.ok(cssContent.includes('.gm-forecast-sticky-bar.visible'), 'theme.css must declare .gm-forecast-sticky-bar.visible');
    assert.ok(cssContent.includes('.gm-sticky-bar-scrolltop-btn'), 'theme.css must declare .gm-sticky-bar-scrolltop-btn');
  });

  it('should reactively synchronize activeDate and re-fetch weather data when store activeDate updates', () => {
    const mockStore = createStore({ activeDate: '2026-10-10' });
    let fetchedDate = null;
    const controller = new ForecastViewController({ store: mockStore });
    controller.fetchWeatherDataAsync = async (_spot, dateStr) => {
      fetchedDate = dateStr;
      return null;
    };

    const mockContainer = {
      innerHTML: '',
      addEventListener() {},
      removeEventListener() {}
    };

    controller.mount(mockContainer);
    assert.equal(controller.activeDate, '2026-10-10');

    // Simulate external store date update (e.g. from Home or another component)
    mockStore.setState({ activeDate: '2026-10-15' });

    assert.equal(controller.activeDate, '2026-10-15', 'Controller activeDate must sync from store');
    assert.equal(fetchedDate, '2026-10-15', 'fetchWeatherDataAsync must be invoked with new date');

    controller.unmount();
  });

  it('should automatically select current local hour (clamped 08..20) when date is today, and default to 13:00 for future dates', () => {
    const mockStore = createStore();
    const controller = new ForecastViewController({ store: mockStore });

    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const expectedTodayHour = Math.min(20, Math.max(8, now.getHours()));

    assert.equal(controller._resolveInitialHour(todayIso), expectedTodayHour, 'Today must resolve to current local hour (clamped 08..20)');
    assert.equal(controller._resolveInitialHour('2028-06-15'), 13, 'Future date must default to 13:00 soaring hour');
  });

  it('should render all 7 parameter cards at-a-glance with 4-state indicator scale', () => {
    const mockStore = createStore({ selectedSpot: DEFAULT_COMPRENSORI[0] });
    const controller = new ForecastViewController({ store: mockStore });
    const html = controller.renderHtml();

    // Verify mode toggle bar
    assert.ok(html.includes('gm-forecast-mode-bar'), 'Must render mode toggle bar');
    assert.ok(html.includes('data-mode="cards"'), 'Must provide Schede mode button');
    assert.ok(html.includes('data-mode="charts"'), 'Must provide Solo Grafici button');

    // Verify all 7 parameter cards
    assert.ok(html.includes('id="param-card-vento-decollo"'), 'Must render Vento in Decollo card');
    assert.ok(html.includes('id="param-card-raffiche"'), 'Must render Raffiche & Delta Vento card');
    assert.ok(html.includes('id="param-card-base-cumulo"'), 'Must render Base Cumulo (LCL) card');
    assert.ok(html.includes('id="param-card-instabilita"'), 'Must render Instabilità / Temporali (CAPE) card');
    assert.ok(html.includes('id="param-card-turbolenza"'), 'Must render Turbolenza in Termica (EDR) card');
    assert.ok(html.includes('id="param-card-copertura"'), 'Must render Copertura Nuvolosa & Insolazione card');
    assert.ok(html.includes('id="param-card-atterraggio"'), 'Must render Condizioni in Atterraggio card');

    // Verify 4-state indicator dots and badges
    assert.ok(html.includes('gm-param-status-dot'), 'Must render status dots');
    assert.ok(html.includes('gm-param-status-badge'), 'Must render status badges');

    // Verify all parameter cards start collapsed by default
    assert.equal(controller.expandedCardId, null, 'Must initialize with expandedCardId null');
    assert.ok(!html.includes('gm-param-body'), 'No parameter card body should be expanded by default');
    assert.ok(!html.includes('id="param-body-vento-decollo"'), 'Vento card must start collapsed');
  });

  it('should render analytical details, pilot advice and trend chart inside expanded parameter card', () => {
    const mockStore = createStore({ selectedSpot: DEFAULT_COMPRENSORI[0] });
    const controller = new ForecastViewController({ store: mockStore });
    controller.expandedCardId = 'vento-decollo';
    const html = controller.renderHtml();

    assert.ok(html.includes('id="param-body-vento-decollo"'), 'Must render expanded card body');
    assert.ok(html.includes('gm-param-details-grid'), 'Must render analytical details grid');
    assert.ok(html.includes('gm-param-advice-box'), 'Must render pilot operational advice box');
    assert.ok(html.includes('Consiglio Pilota:'), 'Must display pilot advice header');
    assert.ok(html.includes('forecast-wind-chart-box'), 'Must render trend chart inside expanded wind card');
  });

  it('should toggle expandedCardId and accordion body on toggle-param-card action', () => {
    const mockStore = createStore({ selectedSpot: DEFAULT_COMPRENSORI[0] });
    const controller = new ForecastViewController({ store: mockStore });

    assert.equal(controller.expandedCardId, null, 'Must start with all parameter accordion cards collapsed');

    // Simulate clicking raffiche card header
    const mockActionEl = {
      getAttribute(attr) {
        if (attr === 'data-action') return 'toggle-param-card';
        if (attr === 'data-card-id') return 'raffiche';
        return null;
      },
      closest(sel) {
        return sel === '[data-action]' ? this : null;
      }
    };
    controller.handleClick({ target: mockActionEl });
    assert.equal(controller.expandedCardId, 'raffiche', 'Must toggle expandedCardId to raffiche');

    // Click same card again -> collapses
    controller.handleClick({ target: mockActionEl });
    assert.equal(controller.expandedCardId, null, 'Clicking active card again must collapse accordion');
  });

  it('should update #forecast-params-container in place and preserve scroll position when toggling param card', () => {
    const mockStore = createStore({ selectedSpot: DEFAULT_COMPRENSORI[0] });
    const controller = new ForecastViewController({ store: mockStore });

    let paramsHtml = '';
    const mockScrollContainer = {
      scrollTop: 350,
      addEventListener() {},
      removeEventListener() {}
    };
    const mockParamsContainer = {
      set innerHTML(val) { paramsHtml = val; },
      get innerHTML() { return paramsHtml; }
    };
    const mockContainer = {
      innerHTML: '',
      addEventListener() {},
      removeEventListener() {},
      querySelector(sel) {
        if (sel === '#forecast-scroll-container') return mockScrollContainer;
        if (sel === '#forecast-params-container') return mockParamsContainer;
        return null;
      }
    };

    controller.mount(mockContainer);
    // Simulate scroll container already scrolled down to 350px
    mockScrollContainer.scrollTop = 350;

    let renderCalled = false;
    const originalRender = controller.render.bind(controller);
    controller.render = (...args) => {
      renderCalled = true;
      return originalRender(...args);
    };

    const mockActionEl = {
      getAttribute(attr) {
        if (attr === 'data-action') return 'toggle-param-card';
        if (attr === 'data-card-id') return 'vento-decollo';
        return null;
      },
      closest(sel) {
        return sel === '[data-action]' ? this : null;
      }
    };

    controller.handleClick({ target: mockActionEl });

    assert.equal(controller.expandedCardId, 'vento-decollo');
    assert.equal(renderCalled, false, 'Must NOT trigger full render() when #forecast-params-container is in DOM');
    assert.equal(mockScrollContainer.scrollTop, 350, 'Scroll position must remain unchanged at 350px');
    assert.ok(paramsHtml.includes('param-card-vento-decollo'), 'Must update parameter cards markup in-place');
    assert.ok(paramsHtml.includes('expanded'), 'Expanded card must have expanded class');
    assert.ok(paramsHtml.includes('aria-expanded="true"'), 'Expanded button must have aria-expanded="true"');

    // Click again to collapse
    controller.handleClick({ target: mockActionEl });
    assert.equal(controller.expandedCardId, null);
    assert.equal(renderCalled, false, 'Collapsing must also update in-place without calling full render()');
    assert.equal(mockScrollContainer.scrollTop, 350, 'Scroll position must remain at 350px on collapse');
    assert.ok(!paramsHtml.includes('aria-expanded="true"'), 'All cards should be collapsed');

    controller.unmount();
  });

  it('should preserve and restore scrollTop across render() calls and reset when requested', () => {
    const mockStore = createStore({ selectedSpot: DEFAULT_COMPRENSORI[0] });
    const controller = new ForecastViewController({ store: mockStore });

    const mockScrollContainer = {
      scrollTop: 420,
      addEventListener() {},
      removeEventListener() {}
    };
    const mockContainer = {
      innerHTML: '',
      addEventListener() {},
      removeEventListener() {},
      querySelector(sel) {
        if (sel === '#forecast-scroll-container') return mockScrollContainer;
        return null;
      }
    };

    controller.mount(mockContainer);
    // Explicitly set scroll position
    mockScrollContainer.scrollTop = 420;

    // Full render without resetScroll
    controller.render();
    assert.equal(mockScrollContainer.scrollTop, 420, 'render() must preserve scrollTop of 420px');

    // Full render with resetScroll: true
    controller.render({ resetScroll: true });
    assert.equal(mockScrollContainer.scrollTop, 0, 'render({ resetScroll: true }) must reset scrollTop to 0');

    controller.unmount();
  });

  it('should switch between Schede and Solo Grafici mode and render multi-trend charts stack', () => {
    const mockStore = createStore({ selectedSpot: DEFAULT_COMPRENSORI[0] });
    const controller = new ForecastViewController({ store: mockStore });

    assert.equal(controller.forecastMode, 'cards');

    // Toggle to charts mode
    const mockActionEl = {
      getAttribute(attr) {
        if (attr === 'data-action') return 'set-forecast-mode';
        if (attr === 'data-mode') return 'charts';
        return null;
      },
      closest(sel) {
        return sel === '[data-action]' ? this : null;
      }
    };
    controller.handleClick({ target: mockActionEl });
    assert.equal(controller.forecastMode, 'charts', 'Must switch to charts mode');

    const html = controller.renderHtml();
    assert.ok(html.includes('>Aerologia</span>'), 'Must render Aerologia section heading');
    assert.ok(!html.includes('Parametri di Volo'), 'Must not render legacy Parametri di Volo heading');
    assert.ok(html.includes('gm-multi-charts-container'), 'Must render multi-charts container in Solo Grafici mode');
    assert.ok(html.includes('id="multi-chart-wind"'), 'Must render wind trend card');
    assert.ok(html.includes('id="multi-chart-sounding"'), 'Must render sounding trend card');
    assert.ok(html.includes('id="multi-chart-cape"'), 'Must render CAPE trend card');
    assert.ok(html.includes('id="multi-chart-turbulence"'), 'Must render turbulence trend card');
    assert.ok(html.includes('id="multi-chart-cloudcover"'), 'Must render cloud cover trend card');
    assert.ok(html.includes('id="multi-chart-landing"'), 'Must render landing trend card');
  });

  it('should update #forecast-params-container in place when setHour is called', () => {
    const mockStore = createStore({ selectedSpot: DEFAULT_COMPRENSORI[0] });
    const controller = new ForecastViewController({ store: mockStore });

    let paramsHtml = '';
    const mockSpotCard = { innerHTML: '' };
    const mockParamsContainer = {
      set innerHTML(val) { paramsHtml = val; },
      get innerHTML() { return paramsHtml; }
    };

    const mockContainer = {
      innerHTML: '',
      addEventListener() {},
      removeEventListener() {},
      querySelector(sel) {
        if (sel === '#forecast-spot-card-container') return mockSpotCard;
        if (sel === '#forecast-params-container') return mockParamsContainer;
        if (sel === '#forecast-timeline-strip') return null;
        if (sel === '#forecast-wind-panel-container') return null;
        if (sel === '#forecast-sounding-panel-container') return null;
        return null;
      }
    };

    controller.mount(mockContainer);
    controller.setHour(16);

    assert.equal(controller.selectedHour, 16);
    assert.ok(paramsHtml.includes('param-card-vento-decollo'), 'Must update params container with parameter cards on hour change');

    controller.unmount();
  });

  it('should generate mathematically smooth cubic Bézier spline paths with Fritsch-Carlson monotonicity', () => {
    // Edge cases
    assert.equal(buildSmoothPath([]), '');
    assert.equal(buildSmoothPath([{ x: 10, y: 20 }]), 'M 10,20');
    assert.equal(buildSmoothPath([{ x: 10, y: 20 }, { x: 30, y: 40 }]), 'M 10,20 L 30,40');

    // 3 points with a peak at (20, 10)
    const peakPts = [
      { x: 10, y: 50 },
      { x: 20, y: 10 },
      { x: 30, y: 50 }
    ];
    const peakPath = buildSmoothPath(peakPts);
    assert.ok(peakPath.startsWith('M 10,50'), 'Must start at first point');
    assert.ok(peakPath.includes('C'), 'Must contain cubic Bézier segments');
    // Verify horizontal tangent at peak (y=10 for both approaching CP2 and leaving CP1)
    assert.ok(peakPath.includes(' 20,10 C 23.3,10 '), 'Tangents at peak must be horizontal (dy/dx = 0)');

    // Flat line (constant value)
    const flatPts = [
      { x: 10, y: 25 },
      { x: 20, y: 25 },
      { x: 30, y: 25 }
    ];
    const flatPath = buildSmoothPath(flatPts);
    assert.ok(flatPath.includes('C 13.3,25 16.7,25 20,25'), 'Flat line must maintain constant Y without NaN or division by zero');

    // Closed area path
    const areaPath = buildSmoothAreaPath(peakPts, 95);
    assert.ok(areaPath.startsWith('M 10,95 L 10,50'), 'Area path must start from baseline and rise to first point');
    assert.ok(areaPath.endsWith('L 30,95 Z'), 'Area path must descend from last point to baseline and close with Z');
  });

  it('should render smooth curves in renderSvgTrendChart, renderWindChart, and renderSoundingChart', () => {
    const mockStore = createStore({ selectedSpot: DEFAULT_COMPRENSORI[0] });
    const controller = new ForecastViewController({ store: mockStore });
    const weatherData = controller.getWeatherData(DEFAULT_COMPRENSORI[0], controller.activeDate);

    // 1. renderSvgTrendChart must output smooth <path d="M... C..."> instead of <polyline
    const trendSvg = controller.renderSvgTrendChart({
      id: 'test-trend',
      title: 'Vento Test',
      unit: 'km/h',
      series: [
        {
          name: 'Vento',
          points: [
            { hour: 8, value: 10 },
            { hour: 12, value: 20 },
            { hour: 16, value: 15 },
            { hour: 20, value: 8 }
          ],
          fillArea: 'rgba(34, 197, 94, 0.15)'
        }
      ]
    });
    assert.ok(trendSvg.includes('stroke-linecap="round"'), 'Trend chart lines must have round linecaps for fluid rendering');
    assert.ok(trendSvg.includes('stroke-linejoin="round"'), 'Trend chart lines must have round linejoins');
    assert.ok(trendSvg.includes('d="M '), 'Must use SVG path with cubic curves');
    assert.ok(trendSvg.includes(' C '), 'Must contain cubic Bézier spline segments');
    assert.ok(!trendSvg.includes('<polyline'), 'Must not render jagged polyline');

    // 2. renderWindChart must output smooth paths for wind and gust
    const windChartSvg = controller.renderWindChart(DEFAULT_COMPRENSORI[0], weatherData, 170);
    assert.ok(windChartSvg.includes('id="forecast-wind-chart-box"'), 'Must render wind chart box');
    assert.ok(windChartSvg.includes('stroke-linecap="round"'), 'Wind chart must render rounded smooth lines');
    assert.ok(!windChartSvg.includes('<polyline'), 'Wind chart must not render jagged polylines');

    // 3. renderSoundingChart must output smooth paths for LCL and Ceiling
    const soundingChartSvg = controller.renderSoundingChart(DEFAULT_COMPRENSORI[0], weatherData, 1000);
    assert.ok(soundingChartSvg.includes('id="forecast-sounding-chart-box"'), 'Must render sounding chart box');
    assert.ok(soundingChartSvg.includes('stroke-linecap="round"'), 'Sounding chart must render rounded smooth lines');
    assert.ok(!soundingChartSvg.includes('<polyline'), 'Sounding chart must not render jagged polylines');
  });

  it('should render contextual mini-map container, canvas, and expand button in spot card markup', () => {
    const mockStore = createStore({ selectedSpot: DEFAULT_COMPRENSORI[0] });
    const controller = new ForecastViewController({ store: mockStore });
    const html = controller.renderHtml();

    assert.ok(html.includes('id="forecast-mini-map-container"'), 'Must render mini-map container');
    assert.ok(html.includes('class="gm-mini-map-box"'), 'Must render mini-map box CSS class');
    assert.ok(html.includes('id="forecast-mini-map"'), 'Must render mini-map canvas element');
    assert.ok(html.includes('data-action="open-full-map"'), 'Must render 1-tap open full map action button');
    assert.ok(html.includes('aria-label="Apri mappa comprensori completa"'), 'Must include accessible label for map button');
    assert.ok(html.includes('id="forecast-spot-metrics-container"'), 'Must render decoupled spot metrics container');
  });

  it('should initialize miniMapEngine and update windsock in place on setHour without destroying map DOM', () => {
    const mockStore = createStore({ selectedSpot: DEFAULT_COMPRENSORI[0] });
    const controller = new ForecastViewController({ store: mockStore });

    let metricsHtml = '';
    const mockMiniMapEl = { innerHTML: '', style: {} };
    const mockMetricsContainer = {
      set innerHTML(val) { metricsHtml = val; },
      get innerHTML() { return metricsHtml; }
    };
    const mockParamsContainer = { innerHTML: '' };

    const mockContainer = {
      innerHTML: '',
      addEventListener() {},
      removeEventListener() {},
      querySelector(sel) {
        if (sel === '#forecast-mini-map') return mockMiniMapEl;
        if (sel === '#forecast-spot-metrics-container') return mockMetricsContainer;
        if (sel === '#forecast-params-container') return mockParamsContainer;
        if (sel === '#forecast-timeline-strip') return null;
        if (sel === '#forecast-wind-panel-container') return null;
        if (sel === '#forecast-sounding-panel-container') return null;
        if (sel === '#forecast-scroll-container') return null;
        return null;
      }
    };

    controller.mount(mockContainer);

    assert.ok(controller.miniMapEngine, 'Must initialize miniMapEngine on mount');
    assert.equal(controller.miniMapEngine.renderedMode, 'minimap', 'Must render in minimap mode');
    assert.ok(controller.miniMapEngine.activeMiniMapSpotData, 'Must store active spot data');

    // Hourly scrubbing: must update windsock and glide line without re-initializing or wiping map
    const initialEngine = controller.miniMapEngine;
    controller.setHour(15);

    assert.equal(controller.selectedHour, 15);
    assert.equal(controller.miniMapEngine, initialEngine, 'miniMapEngine instance must be preserved across setHour');
    assert.ok(controller.miniMapEngine.lastWindsockUpdate, 'Must update windsock marker on setHour');
    assert.ok(controller.miniMapEngine.lastWindsockUpdate.weatherSnapshot.windDirection != null, 'weatherSnapshot must have windDirection');
    assert.ok(controller.miniMapEngine.lastWindsockUpdate.takeoff, 'Must pass active or evaluated takeoff');
    assert.ok(controller.miniMapEngine.lastGlideUpdate, 'Must update glide line on setHour');
    assert.ok(metricsHtml.includes('15:00'), 'Must update metrics text with active hour');

    // Unmount: must cleanly destroy miniMapEngine
    controller.unmount();
    assert.equal(controller.miniMapEngine, null, 'miniMapEngine must be cleaned up and set to null on unmount');
  });

  it('should dynamically update miniMapEngine theme on store theme changes', () => {
    const mockStore = createStore({
      selectedSpot: DEFAULT_COMPRENSORI[0],
      ui: { theme: 'dark' }
    });
    const controller = new ForecastViewController({ store: mockStore });

    const mockMiniMapEl = { innerHTML: '', style: {} };
    const mockContainer = {
      innerHTML: '',
      addEventListener() {},
      removeEventListener() {},
      querySelector(sel) {
        if (sel === '#forecast-mini-map') return mockMiniMapEl;
        return null;
      }
    };

    controller.mount(mockContainer);
    assert.equal(controller.miniMapEngine.theme, 'dark', 'Default theme must be dark');

    // Update theme in store
    mockStore.setState({ ui: { theme: 'light' } });
    assert.equal(controller.miniMapEngine.theme, 'light', 'miniMapEngine theme must update reactively to light');

    controller.unmount();
  });

  it('should render map layer switcher in mini-map box with all available basemap layers', () => {
    const mockStore = createStore({
      selectedSpot: DEFAULT_COMPRENSORI[0],
      ui: { theme: 'dark', mapLayer: 'satellite' }
    });
    const controller = new ForecastViewController({ store: mockStore });

    const html = controller.renderHtml();
    assert.ok(html.includes('id="forecast-minimap-layer-select"'), 'Must render layer selector element');
    assert.ok(html.includes('value="topo"'), 'Must include topo option');
    assert.ok(html.includes('>OpenTopo</option>'), 'Must display OpenTopo label');
    assert.ok(html.includes('value="satellite" selected'), 'Must select satellite option based on store');
    assert.ok(html.includes('value="dark"'), 'Must include dark option');
    assert.ok(html.includes('value="streets"'), 'Must include streets option');
    assert.ok(html.includes('>CyclOSM</option>'), 'Must display CyclOSM label');
  });

  it('should update miniMapEngine layer and persist to store when layer is switched via select', () => {
    const mockStore = createStore({
      selectedSpot: DEFAULT_COMPRENSORI[0],
      ui: { theme: 'dark', mapLayer: 'dark' }
    });
    const controller = new ForecastViewController({ store: mockStore });

    const mockMiniMapEl = { innerHTML: '', style: {} };
    const mockContainer = {
      innerHTML: '',
      addEventListener() {},
      removeEventListener() {},
      querySelector(sel) {
        if (sel === '#forecast-mini-map') return mockMiniMapEl;
        return null;
      }
    };

    controller.mount(mockContainer);
    assert.equal(controller.miniMapEngine.currentLayerId, 'dark', 'Initial layer must be dark');

    // Simulate change event on forecast-minimap-layer-select
    controller.handleChange({
      target: {
        id: 'forecast-minimap-layer-select',
        value: 'topo'
      }
    });

    assert.equal(controller.miniMapEngine.currentLayerId, 'topo', 'miniMapEngine must update to topo');
    assert.equal(mockStore.getState().ui.mapLayer, 'topo', 'Store ui.mapLayer must be updated to topo');

    // Simulate store update for mapLayer
    mockStore.setState({ ui: { ...mockStore.getState().ui, mapLayer: 'satellite' } });
    assert.equal(controller.miniMapEngine.currentLayerId, 'satellite', 'miniMapEngine must react to store mapLayer change');

    controller.unmount();
  });

  it('should render unobtrusive mini-map controls with SVG expand icon and adaptive frosted glass micro-capsules', () => {
    const mockStore = createStore({
      selectedSpot: DEFAULT_COMPRENSORI[0],
      ui: { theme: 'dark', mapLayer: 'satellite' }
    });
    const controller = new ForecastViewController({ store: mockStore });
    const html = controller.renderHtml();

    assert.ok(html.includes('data-map-layer="satellite"'), 'Mini-map container must declare data-map-layer attribute');
    assert.ok(html.includes('<svg width="14" height="14" viewBox="0 0 24 24"'), 'Expand button must contain clean SVG icon');
    assert.ok(!html.includes('class="gm-mini-map-expand-btn">\n          ⤢'), 'Must not use raw unicode glyph ⤢');

    // Verify CSS styles in theme.css for frosted glass micro-capsules and non-invasive layout
    const themeCss = readFileSync(new URL('../../css/theme.css', import.meta.url), 'utf-8');
    assert.ok(themeCss.includes('.gm-mini-map-layer-select {'), 'Must define .gm-mini-map-layer-select');
    assert.ok(themeCss.includes('backdrop-filter: blur('), 'Must use backdrop-filter for frosted glass micro-capsule');
    assert.ok(themeCss.includes('.gm-mini-map-expand-btn {'), 'Must define .gm-mini-map-expand-btn');
    assert.ok(themeCss.includes('.gm-mini-map-layer-select::before'), 'Must provide touch expansion pseudo-element on layer select');
    assert.ok(themeCss.includes('.gm-mini-map-expand-btn::before'), 'Must provide touch expansion pseudo-element on expand button');
    assert.ok(themeCss.includes('.gm-mini-map-box[data-map-layer="topo"] .gm-mini-map-layer-select'), 'Must define adaptive light styling for topo basemap');
    assert.ok(themeCss.includes('.gm-mini-map-box[data-map-layer="satellite"] .gm-mini-map-layer-select'), 'Must define adaptive dark styling for satellite basemap');
  });

  it('should open and close flight analysis overlay, pausing and resuming miniMapEngine', () => {
    const mockStore = createStore({
      selectedSpot: DEFAULT_COMPRENSORI[0],
      ui: { theme: 'dark', mapLayer: 'topo' }
    });
    const controller = new ForecastViewController({ store: mockStore });

    const mockMiniMapEl = { innerHTML: '', style: {} };
    const mockContainer = {
      innerHTML: '',
      addEventListener() {},
      removeEventListener() {},
      querySelector(sel) {
        if (sel === '#forecast-mini-map') return mockMiniMapEl;
        return null;
      }
    };

    controller.mount(mockContainer);
    assert.ok(controller.miniMapEngine, 'miniMapEngine must be initialized');
    assert.equal(controller.miniMapEngine.isPaused, false, 'miniMapEngine must not be paused initially');
    assert.equal(controller.isFlightAnalysisOpen, false, 'Overlay must be closed initially');

    // Open flight analysis overlay
    controller.openFlightAnalysisOverlay();
    assert.equal(controller.isFlightAnalysisOpen, true, 'Overlay must be open');
    assert.equal(controller.miniMapEngine.isPaused, true, 'miniMapEngine must be paused when overlay is open');
    assert.ok(controller.flightAnalysisMapEngine, 'flightAnalysisMapEngine must be instantiated');
    assert.ok(controller.flightAnalysisMapEngine.procedures, 'flightAnalysisMapEngine must receive initial flight procedures');
    assert.equal(controller.flightAnalysisMapEngine.hasTakeoffSector, true, 'flightAnalysisMapEngine must render takeoff slope exposure sector');
    assert.equal(controller.flightAnalysisMapEngine.hasGlideLine, true, 'flightAnalysisMapEngine must render geodesic glide line');
    assert.ok(controller.flightAnalysisMapEngine.glideMetrics, 'flightAnalysisMapEngine must receive glide metrics');

    // Close flight analysis overlay
    controller.closeFlightAnalysisOverlay();
    assert.equal(controller.isFlightAnalysisOpen, false, 'Overlay must be closed');
    assert.equal(controller.flightAnalysisMapEngine, null, 'flightAnalysisMapEngine must be destroyed and nulled');
    assert.equal(controller.miniMapEngine.isPaused, false, 'miniMapEngine must be resumed');

    controller.unmount();
  });

  it('should update flight procedures in-place on flight analysis overlay when setHour is called', () => {
    const mockStore = createStore({
      selectedSpot: DEFAULT_COMPRENSORI[0],
      ui: { theme: 'dark', mapLayer: 'topo' }
    });
    const controller = new ForecastViewController({ store: mockStore });

    const mockMiniMapEl = { innerHTML: '', style: {} };
    const mockContainer = {
      innerHTML: '',
      addEventListener() {},
      removeEventListener() {},
      querySelector(sel) {
        if (sel === '#forecast-mini-map') return mockMiniMapEl;
        return null;
      }
    };

    controller.mount(mockContainer);
    controller.openFlightAnalysisOverlay();

    const initialProcedures = controller.flightAnalysisMapEngine.procedures;
    assert.ok(initialProcedures, 'Must have procedures before hour scrub');
    assert.equal(controller.flightAnalysisMapEngine.hasTakeoffSector, true);
    assert.equal(controller.flightAnalysisMapEngine.hasGlideLine, true);

    // Scrub hour to 16
    controller.setHour(16);
    assert.equal(controller.selectedHour, 16, 'Selected hour must update to 16');
    assert.ok(controller.flightAnalysisMapEngine.procedures, 'Procedures must be updated in-place on scrub');
    assert.ok(controller.flightAnalysisMapEngine.lastFlightUpdateOptions, 'Update options must be recorded');
    assert.ok(controller.flightAnalysisMapEngine.lastFlightUpdateOptions.takeoffWeather, 'Must receive takeoff weather update');
    assert.ok(controller.flightAnalysisMapEngine.lastFlightUpdateOptions.glideMetrics, 'Must receive glide metrics update');

    controller.closeFlightAnalysisOverlay();
    controller.unmount();
  });

  it('should handle open-full-map, close-flight-analysis, and flight-analysis-hour actions in handleClick', () => {
    const mockStore = createStore({
      selectedSpot: DEFAULT_COMPRENSORI[0],
      ui: { theme: 'dark', mapLayer: 'topo' }
    });
    const controller = new ForecastViewController({ store: mockStore });

    const mockMiniMapEl = { innerHTML: '', style: {} };
    const mockContainer = {
      innerHTML: '',
      addEventListener() {},
      removeEventListener() {},
      querySelector(sel) {
        if (sel === '#forecast-mini-map') return mockMiniMapEl;
        return null;
      }
    };

    controller.mount(mockContainer);

    // 1. Simulate click on open-full-map
    controller.handleClick({
      target: {
        closest: (sel) => {
          if (sel === '[data-action]') {
            return {
              getAttribute: (attr) => (attr === 'data-action' ? 'open-full-map' : null)
            };
          }
          return null;
        }
      },
      preventDefault() {}
    });
    assert.equal(controller.isFlightAnalysisOpen, true, 'open-full-map must open flight analysis overlay');

    // 2. Simulate click on flight-analysis-hour (hour 11)
    controller.handleClick({
      target: {
        closest: (sel) => {
          if (sel === '[data-action]') {
            return {
              getAttribute: (attr) => (attr === 'data-action' ? 'flight-analysis-hour' : (attr === 'data-hour' ? '11' : null))
            };
          }
          return null;
        }
      },
      preventDefault() {}
    });
    assert.equal(controller.selectedHour, 11, 'flight-analysis-hour must set hour to 11');

    // 3. Simulate click on close-flight-analysis
    controller.handleClick({
      target: {
        closest: (sel) => {
          if (sel === '[data-action]') {
            return {
              getAttribute: (attr) => (attr === 'data-action' ? 'close-flight-analysis' : null)
            };
          }
          return null;
        }
      },
      preventDefault() {}
    });
    assert.equal(controller.isFlightAnalysisOpen, false, 'close-flight-analysis must close flight analysis overlay');

    controller.unmount();
  });

  it('should close overlay on Escape key via handleFlightAnalysisKey', () => {
    const mockStore = createStore({
      selectedSpot: DEFAULT_COMPRENSORI[0],
      ui: { theme: 'dark', mapLayer: 'topo' }
    });
    const controller = new ForecastViewController({ store: mockStore });

    controller.openFlightAnalysisOverlay();
    assert.equal(controller.isFlightAnalysisOpen, true);

    let defaultPrevented = false;
    controller.handleFlightAnalysisKey({
      key: 'Escape',
      preventDefault() { defaultPrevented = true; }
    });

    assert.equal(defaultPrevented, true, 'Escape must call preventDefault');
    assert.equal(controller.isFlightAnalysisOpen, false, 'Escape must close flight analysis overlay');
  });

  it('should switch layer on flightAnalysisMapEngine when set-flight-analysis-layer change event occurs', () => {
    const mockStore = createStore({
      selectedSpot: DEFAULT_COMPRENSORI[0],
      ui: { theme: 'dark', mapLayer: 'topo' }
    });
    const controller = new ForecastViewController({ store: mockStore });

    controller.openFlightAnalysisOverlay();
    assert.equal(controller.flightAnalysisMapEngine.currentLayerId, 'topo');

    // Trigger layer switch to satellite
    controller.handleChange({
      target: {
        getAttribute: (attr) => (attr === 'data-action' ? 'set-flight-analysis-layer' : null),
        classList: { contains: () => false },
        value: 'satellite'
      }
    });

    assert.equal(controller.flightAnalysisMapEngine.currentLayerId, 'satellite', 'flightAnalysisMapEngine must update layer');
    assert.equal(mockStore.getState().ui.mapLayer, 'satellite', 'Store ui.mapLayer must be updated');

    controller.closeFlightAnalysisOverlay();
  });

  it('should declare responsive full-screen 100dvh overlay, touch targets, and banners in theme.css', () => {
    const themeCss = readFileSync(new URL('../../css/theme.css', import.meta.url), 'utf-8');

    assert.ok(themeCss.includes('.gm-flight-analysis-overlay {'), 'Must declare .gm-flight-analysis-overlay');
    assert.ok(themeCss.includes('height: 100dvh'), 'Overlay must use dynamic viewport 100dvh');
    assert.ok(themeCss.includes('z-index: 1050'), 'Overlay must use elevated modal z-index 1050');
    assert.ok(themeCss.includes('.gm-flight-analysis-close-btn {'), 'Must declare close button');
    assert.ok(themeCss.includes('min-width: var(--gm-touch-min, 48px)'), 'Close button must satisfy Fitts touch floor');
    assert.ok(themeCss.includes('.gm-flight-procedure-badge {'), 'Must declare flight procedure badge');
    assert.ok(themeCss.includes('.gm-flight-safety-warning-banner {'), 'Must declare flight safety warning banner');
    assert.ok(themeCss.includes('.gm-flight-analysis-slot {'), 'Must declare scrubber slots');
    assert.ok(themeCss.includes('touch-action: pan-x'), 'Scrubber must support single-row horizontal pan-x');
    assert.ok(themeCss.includes('.gm-flight-analysis-map-controls {'), 'Must declare floating map controls');
    assert.ok(themeCss.includes('.gm-flight-analysis-ctrl-btn {'), 'Must declare map control buttons');
    assert.ok(themeCss.includes('.gm-user-gps-marker {'), 'Must declare GPS user marker');
  });

  it('should render locality title in top header outside map and map controls inside map container', () => {
    const spot = DEFAULT_COMPRENSORI[0];
    const mockStore = createStore({
      selectedSpot: spot,
      ui: { theme: 'dark', mapLayer: 'topo' }
    });
    const controller = new ForecastViewController({ store: mockStore });

    controller.openFlightAnalysisOverlay();

    assert.ok(controller.flightAnalysisMapEngine, 'Map engine must be initialized');
    assert.equal(controller.flightAnalysisMapEngine.options.isFlightAnalysis, true, 'isFlightAnalysis must be true');
    assert.equal(controller.flightAnalysisMapEngine.options.zoomControl, false, 'zoomControl must be false');

    // Test center-comprensorio
    let centerCalled = false;
    controller.flightAnalysisMapEngine.centerOnComprensorio = () => { centerCalled = true; };
    controller.handleClick({
      target: {
        closest: (sel) => (sel === '[data-action]' ? { getAttribute: () => 'center-comprensorio' } : null)
      }
    });
    assert.strictEqual(centerCalled, true, 'Clicking center-comprensorio must invoke centerOnComprensorio');

    // Test center-gps
    let userLocationCalled = false;
    controller.flightAnalysisMapEngine.showUserLocation = () => { userLocationCalled = true; };
    assert.strictEqual(typeof controller.centerOnUserLocation, 'function');

    controller.closeFlightAnalysisOverlay();
  });

  it('should support touch swipe scrubbing on both main and flight analysis strips with clientX normalization', () => {
    const spot = DEFAULT_COMPRENSORI[0];
    const mockStore = createStore({
      selectedSpot: spot,
      ui: { theme: 'dark', mapLayer: 'topo' }
    });
    const controller = new ForecastViewController({ store: mockStore });

    // Open overlay
    controller.openFlightAnalysisOverlay();

    // Mock overlayStrip element for headless environment
    const overlayStrip = {
      id: 'flight-analysis-timeline-strip',
      classList: { contains: () => false },
      closest: (sel) => (sel === '.gm-timeline-grid-13' ? overlayStrip : null),
      contains: (target) => target === overlayStrip,
      getBoundingClientRect: () => ({ left: 100, width: 260 }),
      querySelectorAll: () => []
    };
    controller.flightAnalysisOverlayEl = {
      querySelector: (sel) => (sel === '#flight-analysis-timeline-strip' ? overlayStrip : null)
    };

    assert.ok(controller.findActiveTimelineStrip(overlayStrip), 'Active strip must be resolved from target');

    // Simulate touchstart at 14:00 (hour index 6, relX = 120 -> clientX = 220)
    // 8 + Math.floor((120 / 260) * 13) = 8 + Math.floor(6) = 14
    controller.handlePointerDown({
      target: overlayStrip,
      touches: [{ clientX: 220 }],
      cancelable: true,
      preventDefault: () => {}
    });

    assert.strictEqual(controller.selectedHour, 14, 'Selected hour must update to 14 on touchstart swipe');
    assert.strictEqual(controller.isScrubbing, true, 'Controller must enter scrubbing mode');

    // Simulate touchmove at 16:00 (hour index 8, relX = 170 -> clientX = 270)
    // 8 + Math.floor((170 / 260) * 13) = 8 + 8 = 16
    controller.handlePointerMove({
      touches: [{ clientX: 270 }],
      cancelable: true,
      preventDefault: () => {}
    });

    assert.strictEqual(controller.selectedHour, 16, 'Selected hour must update to 16 on touchmove swipe');

    // Release swipe
    controller.handlePointerUp({
      changedTouches: [{ clientX: 270 }]
    });

    assert.strictEqual(controller.isScrubbing, false, 'Controller must exit scrubbing mode on touchend');

    // Verify clientX normalization across Pointer, Touch, and Mouse events
    assert.strictEqual(controller.getClientX({ clientX: 150 }), 150);
    assert.strictEqual(controller.getClientX({ touches: [{ clientX: 180 }] }), 180);
    assert.strictEqual(controller.getClientX({ changedTouches: [{ clientX: 210 }] }), 210);
    assert.strictEqual(controller.getClientX({}), 0);

    controller.closeFlightAnalysisOverlay();
  });

  it('should render and toggle aim sub-menu with crosshair icon inside flight analysis overlay', () => {
    const spot = DEFAULT_COMPRENSORI[0];
    const mockStore = createStore({
      selectedSpot: spot,
      ui: { theme: 'dark', mapLayer: 'topo' }
    });
    const controller = new ForecastViewController({ store: mockStore });

    let triggerExpanded = 'false';
    const classSet = new Set(['hidden']);
    const mockTrigger = {
      setAttribute: (k, v) => { if (k === 'aria-expanded') triggerExpanded = String(v); },
      getAttribute: (k) => (k === 'aria-expanded' ? triggerExpanded : null),
      classList: {
        toggle: () => {}
      }
    };
    const mockDropdown = {
      classList: {
        contains: (cls) => classSet.has(cls),
        toggle: (cls, force) => {
          if (force === undefined) {
            if (classSet.has(cls)) classSet.delete(cls); else classSet.add(cls);
          } else if (force) {
            classSet.add(cls);
          } else {
            classSet.delete(cls);
          }
        }
      }
    };
    const mockWrap = { classList: { toggle: () => {} } };

    controller.flightAnalysisOverlayEl = {
      querySelector: (sel) => {
        if (sel === '.gm-aim-menu-wrap') return mockWrap;
        if (sel.includes('toggle-aim-menu') || sel.includes('gm-aim-menu-trigger')) return mockTrigger;
        if (sel === '.gm-aim-dropdown') return mockDropdown;
        return null;
      }
    };

    assert.strictEqual(controller.isFlightAnalysisAimMenuOpen, false);
    assert.strictEqual(mockTrigger.getAttribute('aria-expanded'), 'false');
    assert.strictEqual(mockDropdown.classList.contains('hidden'), true);

    // Toggle open
    controller.toggleFlightAnalysisAimMenu(true);
    assert.strictEqual(controller.isFlightAnalysisAimMenuOpen, true);
    assert.strictEqual(mockTrigger.getAttribute('aria-expanded'), 'true');
    assert.strictEqual(mockDropdown.classList.contains('hidden'), false);

    // Toggle close
    controller.closeFlightAnalysisAimMenu();
    assert.strictEqual(controller.isFlightAnalysisAimMenuOpen, false);
    assert.strictEqual(mockTrigger.getAttribute('aria-expanded'), 'false');
    assert.strictEqual(mockDropdown.classList.contains('hidden'), true);
  });

  it('should render unified timeline scrubber header with spot pill and active hour label in sticky scrubber and file source', () => {
    const spot = DEFAULT_COMPRENSORI[0];
    const mockStore = createStore({
      selectedSpot: spot,
      ui: { theme: 'dark', mapLayer: 'topo' }
    });
    const controller = new ForecastViewController({ store: mockStore });

    // Verify sticky scrubber header in main view HTML
    const html = controller.renderHtml();
    assert.ok(html.includes('id="forecast-timeline-scrubber"'), 'Must render sticky scrubber');
    assert.ok(html.includes('gm-map-scrubber-header'), 'Must contain gm-map-scrubber-header');
    assert.ok(html.includes('Timeline Volabilità'), 'Must contain Timeline Volabilità title');
    assert.ok(html.includes('id="forecast-scrubber-spot-pill"'), 'Must contain forecast-scrubber-spot-pill');
    assert.ok(html.includes('id="forecast-active-hour-label"'), 'Must contain forecast-active-hour-label');

    // Verify presence of unified timeline elements and aim menu in ForecastView.js source
    const src = readFileSync(new URL('../../ui/views/ForecastView.js', import.meta.url), 'utf-8');
    assert.ok(src.includes('id="flight-analysis-scrubber-spot-pill"'), 'Must define flight-analysis-scrubber-spot-pill');
    assert.ok(src.includes('id="flight-analysis-active-hour-label"'), 'Must define flight-analysis-active-hour-label');
    assert.ok(src.includes('data-action="toggle-aim-menu"'), 'Must define toggle-aim-menu trigger');
    assert.ok(src.includes('data-action="center-comprensorio"'), 'Must define center-comprensorio item');
    assert.ok(src.includes('data-action="center-gps"'), 'Must define center-gps item');
  });

  it('should render takeoff and landing selection chips in spot picker sheet when spot has multiple takeoffs or landings', () => {
    const multiSpot = {
      id: 'spot-multi-test',
      name: 'Monte Multiplo',
      location: 'Monte Multiplo (LC)',
      province: 'LC',
      region: 'Lombardia',
      takeoffs: [
        { id: 'to-1', name: 'Decollo Alto', altitude: 1200, heading: 180, isPrimary: true },
        { id: 'to-2', name: 'Decollo Basso', altitude: 900, heading: 170, isPrimary: false }
      ],
      landings: [
        { id: 'ld-1', name: 'Atterraggio Prato', altitude: 250, isPrimary: true, isOfficial: true },
        { id: 'ld-2', name: 'Atterraggio Lago', altitude: 200, isPrimary: false, isOfficial: false }
      ]
    };
    const singleSpot = {
      id: 'spot-single-test',
      name: 'Monte Singolo',
      location: 'Monte Singolo (AQ)',
      province: 'AQ',
      region: 'Abruzzo',
      takeoffs: [
        { id: 'to-single', name: 'Decollo Unico', altitude: 1000, heading: 180, isPrimary: true }
      ],
      landings: [
        { id: 'ld-single', name: 'Atterraggio Unico', altitude: 400, isPrimary: true, isOfficial: true }
      ]
    };

    const mockStore = createStore({
      selectedSpot: multiSpot,
      comprensori: [multiSpot, singleSpot]
    });
    const controller = new ForecastViewController({ store: mockStore });
    controller.comprensoriCatalog = [multiSpot, singleSpot];

    const pickerHtml = controller.renderPickerSections('');

    // Multi-spot assertions
    assert.ok(pickerHtml.includes('data-spot-id="spot-multi-test"'), 'Must render multi-spot card');
    assert.ok(pickerHtml.includes('2 decolli · 2 atterraggi'), 'Must render count badge for multi-subspots');
    assert.ok(pickerHtml.includes('gm-picker-subselection'), 'Must render subselection container');
    assert.ok(pickerHtml.includes('data-action="pick-spot-takeoff"'), 'Must render takeoff chips');
    assert.ok(pickerHtml.includes('data-action="pick-spot-landing"'), 'Must render landing chips');
    assert.ok(pickerHtml.includes('Decollo Alto'), 'Must render takeoff 1 name');
    assert.ok(pickerHtml.includes('Decollo Basso'), 'Must render takeoff 2 name');
    assert.ok(pickerHtml.includes('Atterraggio Prato'), 'Must render landing 1 name');
    assert.ok(pickerHtml.includes('Atterraggio Lago'), 'Must render landing 2 name');
    assert.ok(!pickerHtml.includes('data-action="pick-spot-apply"'), 'Must not render visualizza previsioni apply button');
    assert.ok(!pickerHtml.includes('Visualizza Previsioni'), 'Must not render visualizza previsioni text');
    assert.ok(pickerHtml.includes('data-action="pick-spot"'), 'Must render pick-spot action on card for direct tap');

    // Single-spot assertions
    assert.ok(pickerHtml.includes('data-spot-id="spot-single-test"'), 'Must render single-spot card');
    const singleCardMatch = pickerHtml.match(/data-spot-id="spot-single-test"[\s\S]*?<\/div>\s*<\/article>/);
    if (singleCardMatch) {
      assert.ok(!singleCardMatch[0].includes('gm-picker-subselection'), 'Single spot must not render subselection container');
      assert.ok(!singleCardMatch[0].includes('gm-picker-badge-count'), 'Single spot must not render count badge');
    }
  });

  it('should handle clicking takeoff and landing chips in picker sheet and applying selection', () => {
    const multiSpot = {
      id: 'spot-multi-test',
      name: 'Monte Multiplo',
      location: 'Monte Multiplo (LC)',
      province: 'LC',
      region: 'Lombardia',
      takeoffs: [
        { id: 'to-1', name: 'Decollo Alto', altitude: 1200, heading: 180, isPrimary: true },
        { id: 'to-2', name: 'Decollo Basso', altitude: 900, heading: 170, isPrimary: false }
      ],
      landings: [
        { id: 'ld-1', name: 'Atterraggio Prato', altitude: 250, isPrimary: true, isOfficial: true },
        { id: 'ld-2', name: 'Atterraggio Lago', altitude: 200, isPrimary: false, isOfficial: false }
      ]
    };

    const mockStore = createStore({
      selectedSpot: multiSpot,
      comprensori: [multiSpot]
    });
    const controller = new ForecastViewController({ store: mockStore });
    controller.comprensoriCatalog = [multiSpot];

    let rendered = false;
    controller.render = () => { rendered = true; };

    // Mock picker item card in DOM
    const cardAttrs = {
      'data-spot-id': 'spot-multi-test',
      'data-takeoff-id': 'to-1',
      'data-landing-id': 'ld-1'
    };
    const mockCard = {
      attributes: cardAttrs,
      setAttribute(k, v) { this.attributes[k] = v; },
      getAttribute(k) { return this.attributes[k]; },
      classList: {
        contains(c) { return c === 'gm-picker-item'; }
      },
      querySelectorAll(sel) {
        return [];
      }
    };

    // 1. Simulate clicking takeoff chip for 'to-2'
    const takeoffChipEvt = {
      stopPropagation: () => {},
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'pick-spot-takeoff';
                if (attr === 'data-takeoff-id') return 'to-2';
                return null;
              },
              closest(s) {
                if (s === '.gm-picker-item') return mockCard;
                return null;
              }
            };
          }
          return null;
        }
      }
    };
    controller.handleClick(takeoffChipEvt);
    assert.equal(mockCard.getAttribute('data-takeoff-id'), 'to-2', 'Card data-takeoff-id must be updated to to-2');
    assert.equal(mockStore.getState().activeTakeoffId, 'to-2', 'Store activeTakeoffId must be set immediately on takeoff chip tap');
    assert.equal(controller.activeTakeoffId, 'to-2', 'Controller activeTakeoffId must be set immediately on takeoff chip tap');
    assert.equal(rendered, true, 'Tapping takeoff chip must trigger immediate forecast render');

    // 2. Simulate clicking landing chip for 'ld-2'
    const landingChipEvt = {
      stopPropagation: () => {},
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'pick-spot-landing';
                if (attr === 'data-landing-id') return 'ld-2';
                return null;
              },
              closest(s) {
                if (s === '.gm-picker-item') return mockCard;
                return null;
              }
            };
          }
          return null;
        }
      }
    };
    controller.handleClick(landingChipEvt);
    assert.equal(mockCard.getAttribute('data-landing-id'), 'ld-2', 'Card data-landing-id must be updated to ld-2');

    // 3. Simulate clicking "Visualizza Previsioni" apply button
    const applyEvt = {
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'pick-spot-apply';
                if (attr === 'data-spot-id') return 'spot-multi-test';
                return null;
              },
              closest(s) {
                if (s === '.gm-picker-item') return mockCard;
                return null;
              }
            };
          }
          return null;
        }
      }
    };
    controller.handleClick(applyEvt);

    const updatedState = mockStore.getState();
    assert.equal(updatedState.selectedSpot.id, 'spot-multi-test');
    assert.equal(updatedState.activeTakeoffId, 'to-2', 'Store activeTakeoffId must be set to to-2');
    assert.equal(updatedState.activeLandingId, 'ld-2', 'Store activeLandingId must be set to ld-2');
    assert.equal(controller.activeTakeoffId, 'to-2');
    assert.equal(controller.activeLandingId, 'ld-2');
    assert.equal(rendered, true, 'Applying spot selection must trigger render');
  });

  it('should keep header clean without redundant subselection pills and allow switching subspots', () => {
    const multiSpot = {
      id: 'spot-multi-test',
      name: 'Monte Multiplo',
      location: 'Monte Multiplo (LC)',
      province: 'LC',
      region: 'Lombardia',
      takeoffs: [
        { id: 'to-1', name: 'Decollo Alto', altitude: 1200, heading: 180, isPrimary: true },
        { id: 'to-2', name: 'Decollo Basso', altitude: 900, heading: 170, isPrimary: false }
      ],
      landings: [
        { id: 'ld-1', name: 'Atterraggio Prato', altitude: 250, isPrimary: true, isOfficial: true },
        { id: 'ld-2', name: 'Atterraggio Lago', altitude: 200, isPrimary: false, isOfficial: false }
      ]
    };

    const mockStore = createStore({
      selectedSpot: multiSpot,
      activeTakeoffId: 'to-1',
      activeLandingId: 'ld-1'
    });
    const controller = new ForecastViewController({ store: mockStore });

    const html = controller.renderHtml();
    assert.ok(!html.includes('gm-spot-subselection-container'), 'Header must not contain redundant subselection container');
    assert.ok(html.includes('gm-unified-spot-bar'), 'Header must contain unified spot bar');

    // Verify sub-spots are organized in picker sheet sections
    const pickerHtml = controller.renderPickerSections('');
    assert.ok(pickerHtml.includes('gm-subspot-group'), 'Picker must render grouped subspots');
    assert.ok(pickerHtml.includes('Decolli (2)'), 'Picker must group takeoffs');
    assert.ok(pickerHtml.includes('Atterraggi (2)'), 'Picker must group landings');
    assert.ok(pickerHtml.includes('data-subspot-id="to-2"'), 'Must render option for to-2');
    assert.ok(pickerHtml.includes('data-subspot-id="ld-2"'), 'Must render option for ld-2');

    let rendered = false;
    controller.render = () => { rendered = true; };

    // Simulate clicking takeoff option 'to-2'
    const toClickEvt = {
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'select-subspot';
                if (attr === 'data-subspot-id') return 'to-2';
                return null;
              }
            };
          }
          return null;
        }
      }
    };
    controller.handleClick(toClickEvt);
    assert.equal(controller.activeTakeoffId, 'to-2');
    assert.equal(mockStore.getState().activeTakeoffId, 'to-2');
    assert.equal(rendered, true);

    // Simulate clicking landing option 'ld-2'
    rendered = false;
    const ldClickEvt = {
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'select-subspot';
                if (attr === 'data-subspot-id') return 'ld-2';
                return null;
              }
            };
          }
          return null;
        }
      }
    };
    controller.handleClick(ldClickEvt);
    assert.equal(controller.activeLandingId, 'ld-2');
    assert.equal(mockStore.getState().activeLandingId, 'ld-2');
    assert.equal(rendered, true);

    // Verify overview card reflects selected subspots when in overview mode
    controller.selectedSubSpot = 'overview';
    const updatedHtml = controller.renderHtml();
    assert.ok(updatedHtml.includes('id="forecast-summary-card"'), 'Must render #forecast-summary-card');
    assert.ok(updatedHtml.includes('Decollo Basso'), 'Overview card must reflect selected takeoff Decollo Basso');
    assert.ok(updatedHtml.includes('900m'), 'Overview card must reflect selected takeoff altitude 900m');
    assert.ok(updatedHtml.includes('Atterraggio Lago'), 'Overview card must reflect selected landing Atterraggio Lago');
    assert.ok(updatedHtml.includes('200m'), 'Overview card must reflect selected landing altitude 200m');
  });

  it('should update overview card when selecting takeoff and landing from spot picker sheet', () => {
    const multiSpot = {
      id: 'spot-multi-test-2',
      name: 'Monte Cornizzolo',
      province: 'CO',
      region: 'Lombardia',
      takeoffs: [
        { id: 'corn-sud', name: 'Decollo Sud', altitude: 1050, heading: 180, isPrimary: true },
        { id: 'corn-est', name: 'Decollo Est', altitude: 1100, heading: 90, isPrimary: false }
      ],
      landings: [
        { id: 'suello-campone', name: 'Atterraggio Suello', altitude: 270, isPrimary: true, isOfficial: true },
        { id: 'civate-campo', name: 'Atterraggio Civate', altitude: 220, isPrimary: false, isOfficial: false }
      ]
    };

    const mockStore = createStore({
      selectedSpot: multiSpot,
      activeTakeoffId: 'corn-sud',
      activeLandingId: 'suello-campone',
      locationsCatalog: [multiSpot]
    });
    const controller = new ForecastViewController({ store: mockStore });
    controller.comprensoriCatalog = [multiSpot];

    // Check initial overview card
    let html = controller.renderHtml();
    assert.ok(html.includes('Decollo Sud'));
    assert.ok(html.includes('1050m'));
    assert.ok(html.includes('Suello'));

    // Render picker sections and verify chips are rendered
    const pickerHtml = controller.renderPickerSections();
    assert.ok(pickerHtml.includes('data-action="pick-spot-takeoff"'));
    assert.ok(pickerHtml.includes('data-action="pick-spot-landing"'));
    assert.ok(!pickerHtml.includes('data-action="pick-spot-apply"'));
    assert.ok(pickerHtml.includes('data-action="pick-spot"'));

    // Simulate clicking takeoff chip 'corn-est' on the active spot item
    const mockCard = {
      getAttribute(attr) {
        if (attr === 'data-takeoff-id') return this.takeoffId || 'corn-sud';
        if (attr === 'data-landing-id') return this.landingId || 'suello-campone';
        return null;
      },
      setAttribute(attr, val) {
        if (attr === 'data-takeoff-id') this.takeoffId = val;
        if (attr === 'data-landing-id') this.landingId = val;
      },
      classList: {
        contains(cls) { return cls === 'active'; },
        toggle() {}
      },
      querySelectorAll() { return []; }
    };

    const takeoffChipEvt = {
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'pick-spot-takeoff';
                if (attr === 'data-takeoff-id') return 'corn-est';
                if (attr === 'data-spot-id') return 'spot-multi-test-2';
                return null;
              },
              closest(s) {
                if (s === '.gm-picker-item') return mockCard;
                return null;
              }
            };
          }
          return null;
        }
      }
    };
    controller.handleClick(takeoffChipEvt);
    assert.equal(controller.activeTakeoffId, 'corn-est');
    assert.equal(mockStore.getState().activeTakeoffId, 'corn-est');

    // Simulate clicking landing chip 'civate-campo'
    const landingChipEvt = {
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'pick-spot-landing';
                if (attr === 'data-landing-id') return 'civate-campo';
                if (attr === 'data-spot-id') return 'spot-multi-test-2';
                return null;
              },
              closest(s) {
                if (s === '.gm-picker-item') return mockCard;
                return null;
              }
            };
          }
          return null;
        }
      }
    };
    controller.handleClick(landingChipEvt);
    assert.equal(controller.activeLandingId, 'civate-campo');
    assert.equal(mockStore.getState().activeLandingId, 'civate-campo');

    // Simulate clicking apply
    const applyEvt = {
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'pick-spot-apply';
                if (attr === 'data-spot-id') return 'spot-multi-test-2';
                return null;
              },
              closest(s) {
                if (s === '.gm-picker-item') return mockCard;
                return null;
              }
            };
          }
          return null;
        }
      }
    };
    controller.handleClick(applyEvt);

    // Verify overview card displays Cornizzolo Est and Civate
    html = controller.renderHtml();
    assert.ok(html.includes('id="forecast-summary-card"'));
    assert.ok(html.includes('Decollo Est'));
    assert.ok(html.includes('1100m'));
    assert.ok(html.includes('Civate'));
    assert.ok(html.includes('220m'));
  });

  it('should update overview card when selecting takeoff or landing from level-2 dropdown', () => {
    const multiSpot = {
      id: 'spot-multi-dropdown',
      name: 'Monte Grappa',
      province: 'TV',
      region: 'Veneto',
      takeoffs: [
        { id: 'grappa-costalunga', name: 'Costalunga', altitude: 750, heading: 190, isPrimary: true },
        { id: 'grappa-panettone', name: 'Panettone', altitude: 1550, heading: 170, isPrimary: false }
      ],
      landings: [
        { id: 'semonzo-paradiso', name: 'Paradiso', altitude: 180, isPrimary: true, isOfficial: true },
        { id: 'semonzo-garden', name: 'Garden Relais', altitude: 190, isPrimary: false, isOfficial: false }
      ]
    };

    const mockStore = createStore({
      selectedSpot: multiSpot,
      activeTakeoffId: 'grappa-costalunga',
      activeLandingId: 'semonzo-paradiso',
      locationsCatalog: [multiSpot]
    });
    const controller = new ForecastViewController({ store: mockStore });
    controller.comprensoriCatalog = [multiSpot];

    // Select 'grappa-panettone' via change-subspot
    controller.handleChange({
      target: {
        id: 'forecast-subspot-select',
        value: 'grappa-panettone'
      }
    });

    assert.equal(controller.activeTakeoffId, 'grappa-panettone');
    assert.equal(mockStore.getState().activeTakeoffId, 'grappa-panettone');

    let html = controller.renderHtml();
    assert.ok(html.includes('id="forecast-summary-card"'));
    assert.ok(html.includes('Panettone'));
    assert.ok(html.includes('1550m'));

    // Select 'semonzo-garden' via custom popover click
    const selectPopoverEvt = {
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'select-subspot';
                if (attr === 'data-subspot-id') return 'semonzo-garden';
                return null;
              }
            };
          }
          return null;
        }
      }
    };
    controller.handleClick(selectPopoverEvt);

    assert.equal(controller.activeLandingId, 'semonzo-garden');
    assert.equal(mockStore.getState().activeLandingId, 'semonzo-garden');

    html = controller.renderHtml();
    assert.ok(html.includes('id="forecast-summary-card"'));
    assert.ok(html.includes('Garden Relais'));
    assert.ok(html.includes('190m'));
  });

  describe('Takeoff Exposure and Calm Wind Regression Tests', () => {
    const spotWithExp = {
      id: 'ciavanis-spot',
      name: 'Ciavanis',
      takeoffs: [
        { id: 'ciavanis-1780', name: 'Ciavanis', altitude: 1780, heading: 180, coordinates: '45.362, 7.501', spotType: 'takeoff' }
      ],
      landings: [
        { id: 'ciavanis-land', name: 'Chialamberto', altitude: 600, coordinates: '45.360, 7.520', spotType: 'landing' }
      ]
    };

    const spotWithoutExp = {
      id: 'spot-no-heading',
      name: 'Valle Segreta',
      takeoffs: [
        { id: 'takeoff-unknown', name: 'Decollo Ignoto', altitude: 1100, heading: null, coordinates: '46.000, 11.000', spotType: 'takeoff' }
      ],
      landings: [
        { id: 'landing-standard', name: 'Atterraggio', altitude: 400, coordinates: '46.010, 11.010', spotType: 'landing' }
      ]
    };

    it('evaluates Ciavanis 2 km/h calm wind (101° wind on 180° slope) as flyable and Vento Calmo in computeParamMetrics', () => {
      const mockStore = createStore({
        selectedSpot: spotWithExp,
        activeTakeoffId: 'ciavanis-1780'
      });
      const controller = new ForecastViewController({ store: mockStore });
      controller.selectedHour = 8;

      const weatherData = {
        hourly: {
          time: Array.from({ length: 13 }, (_, i) => `2026-10-10T${String(i + 8).padStart(2, '0')}:00`),
          wind_speed_10m: Array(13).fill(2),
          wind_direction_10m: Array(13).fill(101),
          wind_gusts_10m: Array(13).fill(4),
          surface_pressure: Array(13).fill(1013),
          cape: Array(13).fill(0),
          precipitation: Array(13).fill(0),
          cloud_cover: Array(13).fill(10)
        }
      };

      const evalData = {
        takeoff: spotWithExp.takeoffs[0],
        landing: spotWithExp.landings[0],
        status: 'flyable'
      };

      const { params } = controller.computeParamMetrics(
        evalData,
        weatherData,
        spotWithExp,
        GLIDER_CLASSES.EN_A,
        spotWithExp.takeoffs[0]
      );

      const windParam = params.find(p => p.id === 'vento-decollo');
      assert.ok(windParam, 'vento-decollo card must exist');
      assert.equal(windParam.status, 'flyable');
      assert.equal(windParam.statusLabel, 'Vento Calmo');
      assert.ok(windParam.advice.includes('Vento debole o calmo'));
    });

    it('evaluates spot without heading accurately in computeParamMetrics without false alignment claims', () => {
      const mockStore = createStore({
        selectedSpot: spotWithoutExp,
        activeTakeoffId: 'takeoff-unknown'
      });
      const controller = new ForecastViewController({ store: mockStore });
      controller.selectedHour = 12;

      const weatherData = {
        hourly: {
          time: Array.from({ length: 13 }, (_, i) => `2026-10-10T${String(i + 8).padStart(2, '0')}:00`),
          wind_speed_10m: Array(13).fill(10),
          wind_direction_10m: Array(13).fill(90),
          wind_gusts_10m: Array(13).fill(12),
          surface_pressure: Array(13).fill(1013),
          cape: Array(13).fill(0),
          precipitation: Array(13).fill(0),
          cloud_cover: Array(13).fill(10)
        }
      };

      const evalData = {
        takeoff: spotWithoutExp.takeoffs[0],
        landing: spotWithoutExp.landings[0],
        status: 'flyable'
      };

      const { params } = controller.computeParamMetrics(
        evalData,
        weatherData,
        spotWithoutExp,
        GLIDER_CLASSES.EN_A,
        spotWithoutExp.takeoffs[0]
      );

      const windParam = params.find(p => p.id === 'vento-decollo');
      assert.ok(windParam);
      assert.equal(windParam.status, 'flyable');
      assert.equal(windParam.takeoffHeading, null);

      const offsetDetail = windParam.details.find(d => d.label === 'Scostamento Decollo');
      assert.ok(offsetDetail);
      assert.equal(offsetDetail.value, 'N/D (Esposizione non nota)');
      assert.ok(windParam.advice.includes('Esposizione del pendio non nota nel catalogo'));
    });

    it('renders Azimut Pendio: N/D in renderSpecificSpotMetrics when takeoff heading is null', () => {
      const mockStore = createStore();
      const controller = new ForecastViewController({ store: mockStore });
      const html = controller.renderSpecificSpotMetrics(spotWithoutExp.takeoffs[0], {
        takeoff: spotWithoutExp.takeoffs[0],
        landing: spotWithoutExp.landings[0]
      });

      assert.ok(html.includes('Azimut Pendio:'));
      assert.ok(html.includes('N/D'));
      assert.ok(!html.includes('null°'));
    });

    it('renders Esposizione N/D and Azimut Decollo: N/D in renderWindCompass when heading is null', () => {
      const mockStore = createStore();
      const controller = new ForecastViewController({ store: mockStore });
      const html = controller.renderWindCompass(spotWithoutExp, {
        current: {
          wind_speed_10m: 10,
          wind_direction_10m: 90,
          wind_gusts_10m: 12
        }
      }, null);

      assert.ok(html.includes('Esposizione N/D'));
      assert.ok(html.includes('Azimut Decollo'));
      assert.ok(html.includes('N/D'));
      assert.ok(!html.includes('rgba(34, 197, 94, 0.25)')); // No sector cone
      assert.ok(!html.includes('y2="33"')); // No takeoff notch line (cy - radius + 8 = 100 - 75 + 8 = 33)
    });
  });

  describe('Unified Comprensorio and Sub-Spot Control Architecture', () => {
    it('should render unified spot bar compressing comprensorio and subspot into single control', () => {
      const mockStore = createStore({
        selectedSpot: DEFAULT_COMPRENSORI[0] // Monte Cornizzolo
      });
      const controller = new ForecastViewController({ store: mockStore });
      const html = controller.renderHtml();

      assert.ok(html.includes('gm-unified-spot-bar'), 'Must render .gm-unified-spot-bar');
      assert.ok(html.includes('data-action="open-picker-sheet"'), 'Must trigger open-picker-sheet on tap');
      assert.ok(html.includes('Monte Cornizzolo'), 'Must display active comprensorio name');
      assert.ok(html.includes('gm-unified-subspot-badge'), 'Must display active sub-spot badge');
      assert.ok(html.includes('Panoramica'), 'Must default to Panoramica in sub-spot badge');
      // Verify sr-only compatibility select is rendered
      assert.ok(html.includes('id="forecast-subspot-select"'), 'Must retain accessible select for compatibility');
    });

    it('should render active sub-spots section in picker sheet for 1-tap switching', () => {
      const mockStore = createStore({
        selectedSpot: DEFAULT_COMPRENSORI[0]
      });
      const controller = new ForecastViewController({ store: mockStore });
      const sheetHtml = controller.renderPickerSections('');

      assert.ok(sheetHtml.includes('gm-picker-current-spot-section'), 'Picker sheet must render current sub-spots section');
      assert.ok(sheetHtml.includes('Punto di Volo Attivo'), 'Must have descriptive section title');
      assert.ok(sheetHtml.includes('gm-subspot-group-overview'), 'Must divide into overview group');
      assert.ok(sheetHtml.includes('gm-subspot-group-takeoffs'), 'Must divide into takeoffs group');
      assert.ok(sheetHtml.includes('gm-subspot-group-landings'), 'Must divide into landings group');
      assert.ok(sheetHtml.includes('Decolli ('), 'Must render Decolli header with count');
      assert.ok(sheetHtml.includes('Atterraggi ('), 'Must render Atterraggi header with count');
      assert.ok(sheetHtml.includes('data-action="select-subspot"'), 'Must have select-subspot buttons');
      assert.ok(sheetHtml.includes('data-subspot-id="overview"'), 'Must include Panoramica option');
      // Must include takeoffs from Cornizzolo
      assert.ok(sheetHtml.includes('Risparmio') || sheetHtml.includes('Centrale'), 'Must list current takeoffs');
      assert.ok(sheetHtml.includes('Suello'), 'Must list current landing');
    });

    it('should switch sub-spot when clicking sub-spot option in sheet and close sheet', () => {
      const spot = DEFAULT_COMPRENSORI[0];
      const takeoff = spot.takeoffs[0];
      const mockStore = createStore({
        selectedSpot: spot
      });
      const controller = new ForecastViewController({ store: mockStore });

      let rendered = false;
      controller.render = () => { rendered = true; };

      const clickEvt = {
        target: {
          closest(sel) {
            if (sel === '[data-action]') {
              return {
                getAttribute(attr) {
                  if (attr === 'data-action') return 'select-subspot';
                  if (attr === 'data-subspot-id') return takeoff.id;
                  return null;
                }
              };
            }
            return null;
          }
        }
      };

      controller.handleClick(clickEvt);
      assert.equal(controller.selectedSubSpot, takeoff.id);
      assert.equal(controller.activeTakeoffId, takeoff.id);
      assert.equal(rendered, true, 'Must trigger render after subspot selection');
    });
  });
});



