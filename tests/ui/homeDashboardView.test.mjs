import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HomeDashboardViewController } from '../../ui/views/HomeDashboardView.js';
import { createStore } from '../../core/store.js';

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
    assert.ok(html.includes('Monte Cornizzolo'), 'Must render reference spot name');
    assert.ok(html.includes('gm-spot-flight-row'), 'Must show flight metrics row');
    assert.ok(html.includes('gm-spot-explain'), 'Must include Explainability callout');

    // Strict check: No PIN or favorites elements
    assert.equal(html.includes('data-action="unpin"'), false, 'Must NOT contain unpin action');
    assert.equal(html.includes('★'), false, 'Must NOT contain star favorite icon');
    assert.equal(html.includes('Comprensori Preferiti'), false, 'Must NOT refer to Preferiti in heading');
    assert.equal(html.includes('home-toast-anchor'), false, 'Must NOT contain unpin toast anchor');

    // Search bar check: clean "Ricerca..." placeholder without redundant words
    assert.ok(html.includes('placeholder="Ricerca..."'), 'Search bar placeholder must be simple Ricerca...');

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

    assert.equal(takeoffMatches ? takeoffMatches.length : 0, 4, 'Must have exactly 4 takeoff indicators (1 per card)');
    assert.equal(landingMatches ? landingMatches.length : 0, 4, 'Must have exactly 4 landing indicators (1 per card)');

    // Verify explicit names are rendered (not cryptic symbols or just "Decollo")
    assert.ok(html.includes('Costalunga'), 'Bassano takeoff name must be explicit');
    assert.ok(html.includes('Garden Relais'), 'Bassano landing name must be explicit');
    assert.ok(html.includes('Monte Valinis'), 'Meduno takeoff name must be explicit');
    assert.ok(html.includes('Risparmio'), 'Cornizzolo takeoff name must be explicit');
    assert.ok(html.includes('Rocca Calascio'), 'Calascio takeoff name must be explicit');

    // Verify glide efficiency label and ratio format
    assert.ok(html.includes('gm-glide-label">Efficienza</span>'), 'Landing glide efficiency label must exist');
    assert.ok(/1:\d+\.\d+/.test(html), 'Landing glide ratio must be formatted as 1:X.X');
  });

  it('should filter comprensori via instant search input (NN/G #6)', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });

    // Initial check: all 4 default spots present
    let list = controller.getEvaluatedComprensori();
    assert.equal(list.length, 4);

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
    assert.equal(list.length, 4);
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
    assert.equal(evaluated[0].badge, 'Aperto');
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
  });
});
