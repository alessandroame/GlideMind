import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { HomeDashboardViewController } from '../../ui/views/HomeDashboardView.js';
import { createStore } from '../../core/store.js';
import { GLIDER_CLASSES, DEFAULT_GLIDER } from '../../core/flyability.js';
import { initSheetManager } from '../../ui/sheetManager.js';

describe('GlideMind Phase 3 - HomeDashboardView Architecture & Contracts (No PIN/Favorites)', () => {
  it('should initialize and implement view controller lifecycle contract', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });

    assert.equal(typeof controller.mount, 'function');
    assert.equal(typeof controller.unmount, 'function');
    assert.equal(typeof controller.renderHtml, 'function');
  });

  it('should render the minimal 2-block architecture without PIN or favorites icons', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });
    const html = controller.renderHtml();

    // Block 1: Volabilità SITI
    assert.ok(html.includes('Volabilità</h2>'), 'Must include clean Volabilità section heading');
    assert.ok(html.includes('Chialamberto'), 'Must render default favorite spot name');
    assert.ok(html.includes('gm-spot-flight-row'), 'Must show flight metrics row');
    assert.ok(html.includes('gm-spot-explain'), 'Must include Explainability callout');

    // Strict check: No PIN or favorites elements
    assert.equal(html.includes('data-action="unpin"'), false, 'Must NOT contain unpin action');
    assert.equal(html.includes('★'), false, 'Must NOT contain star favorite icon');
    assert.equal(html.includes('Comprensori Preferiti'), false, 'Must NOT refer to Preferiti in heading');
    assert.equal(html.includes('home-toast-anchor'), false, 'Must NOT contain unpin toast anchor');

    // Search bar check: clean "Ricerca..." placeholder without redundant words
    assert.ok(html.includes('placeholder="Ricerca..."'), 'Search bar placeholder must be simple Ricerca...');

    // Header check: Brand icon next to GlideMind title, version badge and build stamp
    assert.ok(html.includes('assets/icons/icon-192.png'), 'Must render real brand icon in header');
    assert.ok(html.includes('gm-brand-icon'), 'Must include gm-brand-icon class');
    assert.ok(html.includes('gm-header-title'), 'Must include gm-header-title class');
    assert.ok(html.includes('GlideMind'), 'Must render GlideMind title');
    assert.ok(html.includes('gm-header-version'), 'Must include gm-header-version class');
    assert.ok(html.includes('v2.0.0'), 'Must render current app version near title');
    assert.ok(html.includes('gm-header-build'), 'Must include gm-header-build class');
    assert.ok(html.includes('build'), 'Must render build tag in header');

    // Header must NOT contain redundant date string in title bar
    const headerMatch = html.match(/<header[\s\S]*?<\/header>/);
    assert.ok(headerMatch, 'Header must exist');
    assert.equal(/\b\d{4}-\d{2}-\d{2}\b/.test(headerMatch[0]), false, 'Header must NOT contain date string');

    // Block 2: Pilot Activity & Logbook KPIs
    assert.ok(html.includes('Attività Pilota'), 'Must include Pilot Activity section');
    assert.ok(html.includes('Ore di Volo'), 'Must include flight hours KPI tile');
    assert.ok(html.includes('Termica'), 'Must include thermal sessions KPI tile');
    assert.ok(html.includes('Esercizi'), 'Must include exercise sessions KPI tile');
    assert.ok(html.includes('30 Giorni'), 'Must include 30-day period toggle');
    assert.ok(html.includes('Anno'), 'Must include year period toggle');
    assert.ok(html.includes('Registra Volo'), 'Must include manual flight log registration action');
    assert.ok(html.includes('Traccia IGC'), 'Must include IGC track upload action');
  });

  it('should render Attività Pilota as the first section before Volabilità', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });
    const html = controller.renderHtml();

    const pilotIdx = html.indexOf('heading-pilot-currency');
    const spotsIdx = html.indexOf('heading-comprensori');

    assert.ok(pilotIdx > 0, 'Pilot currency heading must exist');
    assert.ok(spotsIdx > 0, 'Volabilità spots heading must exist');
    assert.ok(pilotIdx < spotsIdx, 'Attività Pilota must appear before Volabilità spots');
  });

  it('should strictly enforce the Unico Binomio contract (1 takeoff, 1 landing) with explicit names per card', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });
    const html = controller.renderHtml();

    // Verify all 4 cards contain exactly 1 takeoff arrow (↗) and 1 landing arrow (↘)
    const takeoffMatches = html.match(/class="gm-flight-icon">↗<\/span>/g);
    const landingMatches = html.match(/class="gm-flight-icon">↘<\/span>/g);

    assert.equal(takeoffMatches ? takeoffMatches.length : 0, 3, 'Must have exactly 3 takeoff indicators (1 per card)');
    assert.equal(landingMatches ? landingMatches.length : 0, 3, 'Must have exactly 3 landing indicators (1 per card)');

    // Verify explicit names are rendered (not cryptic symbols or just "Decollo")
    assert.ok(html.includes('Ciavanis') || html.includes('Cossiglia'), 'Chialamberto takeoff name must be explicit');
    assert.ok(html.includes('Baratonga') || html.includes('PeterPan'), 'Chialamberto landing name must be explicit');
    assert.ok(html.includes('Martiniana'), 'Martiniana takeoff/landing name must be explicit');
    assert.ok(html.includes('Manifestazione') || html.includes('Cavallaria'), 'Cavallaria takeoff name must be explicit');
    assert.ok(html.includes('Lessolo'), 'Cavallaria landing name must be explicit');

    // Verify glide efficiency label and ratio format
    assert.ok(html.includes('gm-glide-label">Efficienza</span>'), 'Landing glide efficiency label must exist');
    assert.ok(/1:\d+\.\d+/.test(html), 'Landing glide ratio must be formatted as 1:X.X');
  });

  it('should filter comprensori via instant search input (NN/G #6)', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });

    // Initial check: all 3 default favorite spots present
    let list = controller.getEvaluatedComprensori();
    assert.equal(list.length, 3);

    // Apply search filter
    controller.searchQuery = 'cornizzolo';
    list = controller.getEvaluatedComprensori();
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Monte Cornizzolo');

    // Filter by province
    controller.searchQuery = 'AQ';
    list = controller.getEvaluatedComprensori();
    assert.equal(list.length, 1);
    assert.equal(list[0].province, 'AQ');

    // Clear filter
    controller.searchQuery = '';
    list = controller.getEvaluatedComprensori();
    assert.equal(list.length, 3);
  });

  it('should sort comprensori dynamically by flyability descending (Flyable -> Caution -> Unflyable)', () => {
    // Mock weather where South is flyable (Cornizzolo South 170°), but North is extreme tailwind
    const mockStore = createStore({
      weatherData: {
        hourly: {
          time: ['2026-10-08T14:00'],
          wind_speed_10m: [14],
          wind_gusts_10m: [18],
          wind_direction_10m: [175],
          precipitation: [0],
          cape: [120],
          turbulence_edr: [0.12],
          temperature_2m: [21]
        }
      }
    });

    const controller = new HomeDashboardViewController({ store: mockStore });
    const evaluated = controller.getEvaluatedComprensori();

    assert.ok(evaluated.length >= 2);
    assert.equal(evaluated[0].status, 'flyable', 'First evaluated item should be flyable');
    assert.equal(evaluated[0].badge, 'Volabile');
  });

  it('should route to forecast when a comprensorio is clicked', () => {
    let routedTo = null;
    const mockRouter = {
      navigateTo(route) {
        routedTo = route;
      }
    };
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({
      store: mockStore,
      router: mockRouter
    });

    // Simulate click event delegation
    const mockEvent = {
      target: {
        closest(selector) {
          if (selector === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'view-forecast';
                if (attr === 'data-id') return 'monte-cornizzolo-lc';
                return null;
              }
            };
          }
          return null;
        }
      },
      stopPropagation() {}
    };

    controller.handleClick(mockEvent);

    assert.equal(routedTo, 'forecast', 'Should navigate to forecast view');
    assert.ok(mockStore.getState().selectedSpot, 'Selected spot must be set in store');
    assert.equal(mockStore.getState().selectedSpot.id, 'monte-cornizzolo-lc');
  });

  it('should route to forecast when router implements navigate (standard API)', () => {
    let navigatedTo = null;
    const mockRouter = {
      navigate(route) {
        navigatedTo = route;
      }
    };
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({
      store: mockStore,
      router: mockRouter
    });

    const mockEvent = {
      target: {
        closest(selector) {
          if (selector === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'view-forecast';
                if (attr === 'data-id') return 'monte-cornizzolo-lc';
                return null;
              }
            };
          }
          return null;
        }
      },
      stopPropagation() {}
    };

    controller.handleClick(mockEvent);

    assert.equal(navigatedTo, 'forecast', 'Should navigate to forecast view via navigate()');
    assert.ok(mockStore.getState().selectedSpot, 'Selected spot must be set in store');
    assert.equal(mockStore.getState().selectedSpot.id, 'monte-cornizzolo-lc');
  });

  it('should clean up subscriptions and listeners safely on unmount', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });

    let listenerRemoved = false;
    const mockContainer = {
      innerHTML: '',
      addEventListener() {},
      removeEventListener() {
        listenerRemoved = true;
      },
      querySelector() { return null; }
    };

    controller.mount(mockContainer);
    assert.ok(controller.containerEl);

    controller.unmount();
    assert.equal(controller.containerEl, null);
    assert.equal(listenerRemoved, true);
  });

  it('should toggle pilot period between 30 Giorni and Anno, recalculating flight hours and sessions', () => {
    const mockStore = createStore({
      activeDate: '2026-10-08'
    });
    const controller = new HomeDashboardViewController({ store: mockStore });

    // Initial state: 30 Giorni (month)
    assert.equal(controller.pilotPeriod, 'month');
    let html = controller.renderHtml();
    assert.ok(html.includes('3 h</span>'), 'Month should show 3 h total');
    assert.equal(html.includes('gm-kpi-sub'), false, 'Must not render cluttered sub-line');

    // Simulate clicking period toggle: 'year'
    const mockEventYear = {
      target: {
        closest(selector) {
          if (selector === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'set-pilot-period';
                if (attr === 'data-period') return 'year';
                return null;
              }
            };
          }
          return null;
        }
      }
    };

    controller.handleClick(mockEventYear);
    assert.equal(controller.pilotPeriod, 'year');
    html = controller.renderHtml();
    assert.ok(html.includes('7.4 h</span>'), 'Year should show 7.4 h total');
    assert.equal(html.includes('gm-kpi-sub'), false, 'Year view must not render cluttered sub-line');

    // Toggle back to 'month'
    const mockEventMonth = {
      target: {
        closest(selector) {
          if (selector === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'set-pilot-period';
                if (attr === 'data-period') return 'month';
                return null;
              }
            };
          }
          return null;
        }
      }
    };

    controller.handleClick(mockEventMonth);
    assert.equal(controller.pilotPeriod, 'month');
    html = controller.renderHtml();
    assert.ok(html.includes('3 h</span>'), 'Month should revert to 3 h total');
  });

  it('should not ask the pilot for session type in flight log entry sheet and support automated activity deduction', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });

    // Mock openSheet to inspect passed contentHtml
    let sheetConfig = null;
    const originalOpenSheet = globalThis.__mockOpenSheet;
    
    // We can call openAddFlightSheet and capture the sheet content
    let capturedContent = '';
    // Temporarily spy on openSheet
    const sheetManagerModule = import('../../ui/sheetManager.js');
    
    // Check renderHtml does not contain any session type prompt on the main dashboard
    const html = controller.renderHtml();
    assert.equal(html.includes('gm-type-selector'), false, 'Main dashboard must not contain session type selector');

    // Call openAddFlightSheet and verify the DOM if in browser, or verify sheet config
    // Let's inspect the openAddFlightSheet code string directly via controller
    const methodStr = controller.openAddFlightSheet.toString();
    assert.equal(methodStr.includes('Tipo Sessione'), false, 'Must NOT contain Tipo Sessione label');
    assert.equal(methodStr.includes('gm-type-selector'), false, 'Must NOT contain gm-type-selector');
    assert.ok(methodStr.includes('flight-igc-input'), 'Must provide optional IGC track input');
    assert.ok(methodStr.includes('dedotte in automatico'), 'Must explain automatic activity deduction from track');
    assert.ok(methodStr.includes('gm-past-presets'), 'Must provide fast past date presets (Oggi, Ieri, Weekend)');
  });

  it('should render smart date bar in Section 2 (Volabilità) and allow switching date', () => {
    const mockStore = createStore({ activeDate: '2026-10-09' });
    const controller = new HomeDashboardViewController({ store: mockStore });

    const html = controller.renderHtml();
    assert.ok(html.includes('gm-date-tabs'), 'Must render smart date tabs in Home');
    assert.ok(html.includes('data-action="open-date-picker-sheet"'), 'Must render calendar button in Home');

    // Simulate clicking a date preset
    controller.handleClick({
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'select-date';
                if (attr === 'data-date') return '2026-10-10';
                return null;
              }
            };
          }
          return null;
        }
      }
    });

    assert.equal(mockStore.getState().activeDate, '2026-10-10');
  });

  it('should open the 14-day date picker sheet with clean neutral dates in HomeDashboard', async () => {
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
    const controller = new HomeDashboardViewController({ store: mockStore });

    controller.openDatePickerSheet();

    assert.ok(capturedHtml.includes('Calendario Previsioni (Prossimi 14 Giorni)'));
    assert.ok(capturedHtml.includes('data-action="pick-calendar-date"'));
    assert.ok(!capturedHtml.includes('grid-fly-status'), 'Home calendar should not include spot-specific flyability badges');
    assert.ok(!capturedHtml.includes('gm-date-sheet-legend'), 'Home calendar should not include single-spot flyability legend');
  });

  it('should display only favorite spots and react to store pinnedSpotIds changes', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });

    // Initially 3 defaults
    assert.deepEqual(
      controller.getEvaluatedComprensori().map(s => s.name).sort(),
      ['Chialamberto', 'Martiniana Po', 'Monte Cavallaria'].sort()
    );

    // Change favorites in store to Monte Cornizzolo and Bassano del Grappa
    mockStore.setState({
      pinnedSpotIds: ['monte-cornizzolo-lc', 'bassano-borso-del-grappa-tv']
    });

    assert.deepEqual(
      controller.getEvaluatedComprensori().map(s => s.name).sort(),
      ['Bassano del Grappa', 'Monte Cornizzolo'].sort()
    );

    // Clear all favorites -> empty list
    mockStore.setState({ pinnedSpotIds: [] });
    assert.equal(controller.getEvaluatedComprensori().length, 0);

    const emptyHtml = controller.renderHtml();
    assert.ok(emptyHtml.includes('Nessuna località tra i preferiti'));
    assert.ok(emptyHtml.includes('data-action="go-to-forecast"'));
  });

  it('should render the active glider pill in Pilot Currency section', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });
    const html = controller.renderHtml();

    assert.ok(html.includes('gm-pilot-glider-row'), 'Must contain glider selector row');
    assert.ok(html.includes('Vela Attiva'), 'Must contain Vela Attiva label');
    assert.ok(html.includes('btn-home-select-glider'), 'Must contain select glider button');
    assert.ok(html.includes('EN-A'), 'Default glider class badge must be EN-A');
  });

  it('should open glider selection sheet and display all 4 certification classes (EN-A to EN-D)', async () => {
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
    const controller = new HomeDashboardViewController({ store: mockStore });

    controller.openGliderSheet();

    assert.ok(capturedHtml.includes('gm-glider-sheet'), 'Must render glider selection sheet');
    assert.ok(capturedHtml.includes('EN-A'), 'Must list EN-A class');
    assert.ok(capturedHtml.includes('EN-B'), 'Must list EN-B class');
    assert.ok(capturedHtml.includes('EN-C'), 'Must list EN-C class');
    assert.ok(capturedHtml.includes('EN-D'), 'Must list EN-D class');
    assert.ok(capturedHtml.includes('data-action="select-glider"'), 'Must have select-glider actions');
  });

  it('should update active glider in store and trigger dynamic re-evaluation on selection', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });

    // Simulate clicking on EN-C class in glider sheet
    const mockClickEvent = {
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'select-glider';
                if (attr === 'data-category') return 'EN-C';
                return null;
              }
            };
          }
          return null;
        }
      }
    };

    controller.handleClick(mockClickEvent);

    const updatedState = mockStore.getState();
    assert.equal(updatedState.activeGlider.category, 'EN-C');
    assert.equal(updatedState.glider.category, 'EN-C');

    // UI render must now reflect the new EN-C glider class in the pill
    const html = controller.renderHtml();
    assert.ok(html.includes('EN-C'), 'Must reflect EN-C in glider pill');
    assert.ok(html.includes(GLIDER_CLASSES.EN_C.name), 'Must reflect EN-C full name');
  });

  it('should render paraglider brand chips, search input, and popular models in glider sheet', () => {
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
    const controller = new HomeDashboardViewController({ store: mockStore });

    controller.openGliderSheet();

    // Verify search bar and brand filter chips
    assert.ok(capturedHtml.includes('id="glider-search-input"'), 'Must render glider search input');
    assert.ok(capturedHtml.includes('gm-glider-brand-chips'), 'Must render brand filter chips container');
    assert.ok(capturedHtml.includes('data-brand="Ozone"'), 'Must include Ozone brand chip');
    assert.ok(capturedHtml.includes('data-brand="Advance"'), 'Must include Advance brand chip');
    assert.ok(capturedHtml.includes('data-brand="Axis"'), 'Must include Axis brand chip');
    assert.ok(capturedHtml.includes('data-brand="Niviuk"'), 'Must include Niviuk brand chip');

    // Verify model cards list
    assert.ok(capturedHtml.includes('id="glider-models-list"'), 'Must render glider models list');
    assert.ok(capturedHtml.includes('data-action="select-glider-model"'), 'Must have select-glider-model actions');
    assert.ok(capturedHtml.includes('Buzz Z7') || capturedHtml.includes('Mojo 6'), 'Must include popular Ozone models');

    // Verify custom glider section
    assert.ok(capturedHtml.includes('gm-glider-custom-details'), 'Must include custom glider configuration details');
    assert.ok(capturedHtml.includes('data-action="save-custom-glider"'), 'Must include save-custom-glider action');
  });

  it('should filter glider models by brand chip and search query including Axis wings', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });

    // Filter by brand Advance
    controller.gliderSelectedBrand = 'Advance';
    let modelsHtml = controller.renderGliderModelsList();
    assert.ok(modelsHtml.includes('Alpha 7'), 'Must include Advance Alpha 7');
    assert.ok(modelsHtml.includes('Iota DLS'), 'Must include Advance Iota DLS');
    assert.equal(modelsHtml.includes('Ozone Buzz'), false, 'Must not include Ozone when Advance is selected');

    // Filter by brand Axis
    controller.gliderSelectedBrand = 'Axis';
    modelsHtml = controller.renderGliderModelsList();
    assert.ok(modelsHtml.includes('Compact 4'), 'Must include Axis Compact 4');
    assert.ok(modelsHtml.includes('Pluto 4'), 'Must include Axis Pluto 4');
    assert.ok(modelsHtml.includes('Vega 6'), 'Must include Axis Vega 6');
    assert.ok(modelsHtml.includes('Venus 4'), 'Must include Axis Venus 4');
    assert.equal(modelsHtml.includes('Alpha 7'), false, 'Must not include Advance when Axis is selected');

    // Filter by text search "mentor"
    controller.gliderSelectedBrand = '';
    controller.gliderSearchQuery = 'mentor';
    modelsHtml = controller.renderGliderModelsList();
    assert.ok(modelsHtml.includes('Mentor 7'), 'Must include Nova Mentor 7');
    assert.equal(modelsHtml.includes('Alpha 7'), false, 'Must not include Alpha 7 in mentor search');

    // Filter by text search "pluto"
    controller.gliderSearchQuery = 'pluto';
    modelsHtml = controller.renderGliderModelsList();
    assert.ok(modelsHtml.includes('Pluto 4'), 'Must find Axis Pluto 4 by text search');
    assert.ok(modelsHtml.includes('Axis'), 'Must show Axis brand');
  });

  it('should select certified model from catalog and update active glider with full aerodynamic specs', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });

    const mockClickEvent = {
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'select-glider-model';
                if (attr === 'data-glider-id') return 'ozone-buzz-z7';
                return null;
              }
            };
          }
          return null;
        }
      }
    };

    controller.handleClick(mockClickEvent);

    const updatedState = mockStore.getState();
    assert.equal(updatedState.activeGlider.id, 'ozone-buzz-z7');
    assert.equal(updatedState.activeGlider.brand, 'Ozone');
    assert.equal(updatedState.activeGlider.model, 'Buzz Z7');
    assert.equal(updatedState.activeGlider.category, 'EN-B');
    assert.equal(updatedState.activeGlider.vTrim, 38);
    assert.equal(updatedState.activeGlider.glideRatio, 8.8);

    // Dashboard UI must now display the exact brand and model in the pill
    const html = controller.renderHtml();
    assert.ok(html.includes('Ozone Buzz Z7'), 'Must display Ozone Buzz Z7 in glider pill');
    assert.ok(html.includes('EN-B'), 'Must display EN-B badge in glider pill');
  });

  it('should support custom glider creation and automated aerodynamic deduction', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });

    const mockClickEvent = {
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'save-custom-glider';
                if (attr === 'data-brand') return 'Swing';
                if (attr === 'data-model') return 'Nyos 2 RS';
                if (attr === 'data-category') return 'EN-B';
                return null;
              }
            };
          }
          return null;
        }
      }
    };

    controller.handleClick(mockClickEvent);

    const updatedState = mockStore.getState();
    assert.equal(updatedState.activeGlider.brand, 'Swing');
    assert.equal(updatedState.activeGlider.model, 'Nyos 2 RS');
    assert.equal(updatedState.activeGlider.category, 'EN-B');
    assert.equal(updatedState.activeGlider.vTrim, 38); // Deduced from EN-B defaults
    assert.equal(updatedState.activeGlider.isCustom, true);

    // Dashboard UI must now display Swing Nyos 2 RS
    const html = controller.renderHtml();
    assert.ok(html.includes('Swing Nyos 2 RS'), 'Must display Swing Nyos 2 RS in glider pill');
  });

  it('should enforce accessibility attributes (role="button", tabindex="0") and keyboard activation on comprensorio cards (Jakob & WCAG POUR)', () => {
    const mockStore = createStore();
    let navigatedRoute = null;
    const mockRouter = {
      navigate(route) {
        navigatedRoute = route;
      }
    };
    const controller = new HomeDashboardViewController({
      store: mockStore,
      router: mockRouter
    });

    const html = controller.renderHtml();
    assert.ok(html.includes('role="button"'), 'Card must declare role="button" for screen readers');
    assert.ok(html.includes('tabindex="0"'), 'Card must declare tabindex="0" for keyboard focusability');
    assert.ok(html.includes('gm-spot-chevron'), 'Card must render chevron affordance for glanceable interaction');

    // Simulate keyboard activation via Enter key
    const mockEnterEvent = {
      key: 'Enter',
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'view-forecast';
                if (attr === 'data-id') return 'monte-cornizzolo-lc';
                return null;
              }
            };
          }
          return null;
        }
      },
      preventDefault() {}
    };

    controller.handleKeyDown(mockEnterEvent);
    assert.equal(navigatedRoute, 'forecast', 'Enter key on focused card must navigate to forecast');
    assert.equal(mockStore.getState().selectedSpot.id, 'monte-cornizzolo-lc');

    // Simulate keyboard activation via Space key
    navigatedRoute = null;
    const mockSpaceEvent = {
      key: ' ',
      target: {
        tagName: 'ARTICLE',
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'view-forecast';
                if (attr === 'data-id') return 'meduno-monte-valinis-pn';
                return null;
              }
            };
          }
          return null;
        }
      },
      preventDefault() {}
    };

    controller.handleKeyDown(mockSpaceEvent);
    assert.equal(navigatedRoute, 'forecast', 'Space key on focused card must navigate to forecast');
    assert.equal(mockStore.getState().selectedSpot.id, 'meduno-monte-valinis-pn');
  });

  it('should render search clear button and handle clearing search (Fitts, Cheap Takeover & NN/G #7)', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });

    // Initially search query is empty -> clear button has hidden class
    let html = controller.renderHtml();
    assert.ok(html.includes('id="home-search-clear-btn"'), 'Must render search clear button');
    assert.ok(html.includes('gm-search-clear hidden'), 'Clear button must be hidden when search is empty');

    // Search query is set -> clear button is not hidden
    controller.searchQuery = 'Cavallaria';
    html = controller.renderHtml();
    assert.ok(!html.includes('gm-search-clear hidden'), 'Clear button must be visible when query is present');

    // Simulate clicking clear-search
    let focused = false;
    controller.containerEl = {
      querySelector(sel) {
        if (sel === '#home-spot-search') {
          return {
            value: 'Cavallaria',
            focus() { focused = true; }
          };
        }
        if (sel === '#home-search-clear-btn') {
          return {
            classList: {
              add(cls) {
                assert.equal(cls, 'hidden');
              }
            }
          };
        }
        return null;
      }
    };

    const mockClickEvent = {
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'clear-search';
                return null;
              }
            };
          }
          return null;
        }
      }
    };

    controller.handleClick(mockClickEvent);
    assert.equal(controller.searchQuery, '', 'searchQuery must be reset to empty string');
    assert.equal(focused, true, 'Search input must regain focus after clearing');
  });

  it('should normalize search query removing accents and diacritics tolerantly (Postel\'s Law)', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });

    // Search with accent 'Cavallària'
    controller.searchQuery = 'Cavallària';
    let results = controller.getEvaluatedComprensori();
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'Monte Cavallaria');

    // Search without accent and extra whitespace '  cavallaria  '
    controller.searchQuery = '  cavallaria  ';
    results = controller.getEvaluatedComprensori();
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'Monte Cavallaria');
  });

  it('should provide 1-tap "Azzera ricerca" button in empty search state (NN/G #9 & Cheap Takeover)', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });

    controller.searchQuery = 'LocalitaInesistenteXYZ';
    const html = controller.renderHtml();

    assert.ok(html.includes('Nessuna località trovata per "LocalitaInesistenteXYZ"'), 'Empty state must declare accurate copy');
    assert.ok(html.includes('Azzera ricerca'), 'Must provide 1-tap reset action');
    assert.ok(html.includes('data-action="clear-search"'), 'Reset action must have clear-search attribute');
  });

  it('should enforce Fitts\'s Law touch target floor and focus-visible states in theme.css', () => {
    const cssContent = fs.readFileSync(path.resolve('css/theme.css'), 'utf-8');

    // Check search input touch height >= 44px
    assert.ok(
      cssContent.includes('.gm-search-input {\n  width: 100%;\n  height: 44px;') ||
      cssContent.includes('.gm-search-input {\r\n  width: 100%;\r\n  height: 44px;') ||
      /\.gm-search-input\s*\{[^}]*min-height:\s*44px/.test(cssContent),
      '.gm-search-input must enforce >= 44px touch height'
    );

    // Check search clear button touch size 44x44px
    assert.ok(
      /\.gm-search-clear\s*\{[^}]*width:\s*44px/.test(cssContent) &&
      /\.gm-search-clear\s*\{[^}]*height:\s*44px/.test(cssContent),
      '.gm-search-clear must enforce 44x44px touch area'
    );

    // Check spot card focus-visible declaration
    assert.ok(cssContent.includes('.gm-spot-card:focus-visible'), 'Must declare .gm-spot-card:focus-visible');

    // Check light theme contrast overrides
    assert.ok(cssContent.includes('[data-theme="light"] .gm-spot-flight-row'), 'Must declare light mode .gm-spot-flight-row override');
    assert.ok(cssContent.includes('[data-theme="light"] .gm-spot-prov'), 'Must declare light mode .gm-spot-prov override');

    // Check suppression of native browser search cancel button to prevent duplicate X
    assert.ok(
      cssContent.includes('::-webkit-search-cancel-button'),
      'Must suppress ::-webkit-search-cancel-button to prevent duplicate native clear button'
    );
  });

  it('should delegate input events on containerEl and preserve search functionality across re-renders', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });

    let inputDispatched = null;
    const listeners = new Map();
    const mockContainer = {
      innerHTML: '',
      addEventListener(type, fn) {
        listeners.set(type, fn);
      },
      removeEventListener(type) {
        listeners.delete(type);
      },
      querySelector(selector) {
        if (selector === '#home-search-clear-btn') {
          return { classList: { toggle() {}, add() {}, remove() {} } };
        }
        if (selector === 'section[aria-labelledby="heading-comprensori"]') {
          return {
            querySelector(s) {
              if (s === '#home-spots-count') return { textContent: '' };
              if (s === '#home-spots-list') return { outerHTML: '' };
              return null;
            }
          };
        }
        return null;
      }
    };

    controller.mount(mockContainer);
    assert.ok(listeners.has('input'), 'Container element must have delegated input listener attached');

    // Simulate input event bubbling to container
    const mockInputEvent = {
      target: {
        id: 'home-spot-search',
        value: 'cornizzolo'
      }
    };
    listeners.get('input')(mockInputEvent);
    assert.equal(controller.searchQuery, 'cornizzolo', 'Controller searchQuery must update via delegated input');

    // Simulate re-render
    controller.render();

    // Verify search query matching takeoff name
    const mockTakeoffInputEvent = {
      target: {
        id: 'home-spot-search',
        value: 'suello'
      }
    };
    listeners.get('input')(mockTakeoffInputEvent);
    assert.equal(controller.searchQuery, 'suello');
    const matched = controller.getEvaluatedComprensori();
    assert.ok(matched.length >= 1, 'Search query matching landing (Suello) must find Monte Cornizzolo');
    assert.equal(matched[0].name, 'Monte Cornizzolo');

    controller.unmount();
    assert.equal(listeners.has('input'), false, 'Container input listener must be cleaned up on unmount');
  });
});

