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

  it('should render Volabilità as the primary Above-the-Fold section without the 4-row pilot activity card', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });
    const html = controller.renderHtml();

    // Primary section: Volabilità SITI
    assert.ok(html.includes('Volabilità</h2>'), 'Must include clean Volabilità section heading');
    assert.ok(html.includes('Chialamberto'), 'Must render default favorite spot name');
    assert.ok(html.includes('gm-home-timeline'), 'Must show diurnal flyability timeline row (Option A)');
    assert.ok(html.includes('gm-spot-explain'), 'Must include compact micro-reason in header');

    // Strict check: Default Home card header does not render search pin button when not searching
    assert.equal(html.includes('data-action="unpin"'), false, 'Must NOT contain legacy unpin action');
    assert.equal(html.includes('gm-star-pin-btn'), false, 'Must NOT render search star pin button in card header when not searching');
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

    // Home must NOT render the heavy 4-row .gm-pilot-card Above-the-Fold
    assert.equal(html.includes('gm-pilot-card'), false, 'Home must not render the 4-row pilot card Above-the-Fold');
    assert.ok(html.includes('id="btn-home-select-glider"'), 'Must render compact active glider pill on filter bar');
  });

  it('should render Volabilità immediately after the header for instant meteorological triage', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });
    const html = controller.renderHtml();

    const headerEndIdx = html.indexOf('</header>');
    const spotsIdx = html.indexOf('heading-comprensori');

    assert.ok(headerEndIdx > 0, 'Header must exist');
    assert.ok(spotsIdx > headerEndIdx, 'Volabilità spots heading must appear right after header');
    assert.equal(html.includes('heading-pilot-currency'), false, 'Pilot currency section heading must be moved out of Home');
  });

  it('should strictly enforce the Unico Binomio contract (1 takeoff, 1 landing) and render diurnal flyability timeline per card', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });
    const html = controller.renderHtml();

    // Verify all 3 cards expose 1 takeoff and 1 landing via semantic data attributes and aria-label, plus a diurnal timeline
    const timelineMatches = html.match(/class="gm-home-timeline"/g);
    assert.equal(timelineMatches ? timelineMatches.length : 0, 3, 'Must render 1 diurnal timeline per comprensorio card');

    // Verify explicit binomio names are bound in aria-label / data attributes without cluttering visible card text
    assert.ok(html.includes('Ciavanis') || html.includes('Cossiglia'), 'Chialamberto takeoff name must be bound');
    assert.ok(html.includes('Baratonga') || html.includes('PeterPan'), 'Chialamberto landing name must be bound');
    assert.ok(html.includes('Martiniana'), 'Martiniana name must be bound');
    assert.ok(html.includes('Manifestazione') || html.includes('Cavallaria'), 'Cavallaria takeoff name must be bound');
    assert.ok(html.includes('Lessolo'), 'Cavallaria landing name must be bound');
    assert.ok(html.includes('data-action="view-forecast-hour"'), 'Must render interactive hourly slots in diurnal timeline');
  });

  it('should filter comprensori via instant search input and display sub-spot match context when searching by takeoff name (NN/G #6)', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });

    // Initial check: all 3 default favorite spots present
    let list = controller.getEvaluatedComprensori();
    assert.equal(list.length, 3);

    // Apply search filter by comprensorio name
    controller.searchQuery = 'cornizzolo';
    list = controller.getEvaluatedComprensori();
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Monte Cornizzolo');
    assert.equal(list[0].searchMatch, null);

    // Search by sub-spot takeoff name ("felci" -> Pian delle Felci in Monte Cavallaria)
    controller.searchQuery = 'felci';
    list = controller.getEvaluatedComprensori();
    assert.ok(list.length >= 1, 'Must find Monte Cavallaria when searching for takeoff Pian delle Felci');
    const cavallaria = list.find(c => c.name.includes('Cavallaria'));
    assert.ok(cavallaria, 'Monte Cavallaria must be returned');
    assert.ok(cavallaria.searchMatch, 'Must attach searchMatch context when query matches a sub-spot');
    assert.equal(cavallaria.searchMatch.type, 'takeoff');
    assert.ok(cavallaria.searchMatch.label.toLowerCase().includes('felci'), 'searchMatch label must display the matched takeoff name');

    const searchHtml = controller.renderHtml();
    assert.ok(searchHtml.includes('gm-spot-search-match'), 'Card header must render .gm-spot-search-match pill');
    assert.ok(searchHtml.includes('data-matched-takeoff-id='), 'Card must bind data-matched-takeoff-id for direct navigation');

    // Filter by province
    controller.searchQuery = 'AQ';
    list = controller.getEvaluatedComprensori();
    assert.equal(list.length, 1);
    assert.equal(list[0].province, 'AQ');

    // Clear filter
    controller.searchQuery = '';
    list = controller.getEvaluatedComprensori();
    assert.equal(list.length, 3);

    // Verify expandable determinant reason pills ([NOTE-001]) on badge toggle
    const firstSpotId = list[0].comprensorioId;
    controller.handleClick({
      target: {
        closest: (sel) => sel === '[data-action]' ? {
          getAttribute: (attr) => attr === 'data-action' ? 'toggle-spot-reasons' : (attr === 'data-id' ? firstSpotId : null)
        } : null
      },
      preventDefault: () => {}
    });
    assert.ok(controller.expandedReasonSpotIds.has(firstSpotId), 'Must mark spot reasons as expanded on badge click');
    const expandedHtml = controller.renderHtml();
    assert.ok(expandedHtml.includes('gm-spot-reasons-drawer') && expandedHtml.includes('is-expanded'), 'Must expand determinant factor pills drawer');
    assert.ok(expandedHtml.includes('gm-reason-pill'), 'Must render determinant factor pills inside drawer');
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

  it('should toggle optional Pilot Currency & Experience factor and apply conservative derating to flyability with explainability', () => {
    const mockStore = createStore({
      activeDate: '2026-10-10',
      usePilotCurrencyFactor: false,
      flights: [
        { id: 'f-lapsed', date: '2026-05-01', durationMinutes: 40 }
      ],
      weatherData: {
        hourly: {
          time: ['2026-10-10T14:00'],
          wind_speed_10m: [14],
          wind_gusts_10m: [21], // 7 km/h spread: optimal for standard EN-A (<=8), but caution when derated by 0.75x (limit 6 km/h)
          wind_direction_10m: [180], // aligned with Chialamberto South (180 deg)
          precipitation: [0],
          cape: [100],
          turbulence_edr: [0.10],
          temperature_2m: [20]
        }
      }
    });
    const controller = new HomeDashboardViewController({ store: mockStore });

    // With factor disabled: Chialamberto is flyable
    let evaluated = controller.getEvaluatedComprensori();
    const chialambertoPure = evaluated.find(s => s.id === 'chialamberto-valli-di-lanzo-to-to' || s.name === 'Chialamberto');
    assert.ok(chialambertoPure);
    assert.equal(chialambertoPure.status, 'flyable');

    // Simulate toggling the pilot currency factor ON
    controller.handleClick({
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'toggle-pilot-currency-factor';
                return null;
              }
            };
          }
          return null;
        }
      }
    });

    assert.equal(mockStore.getState().usePilotCurrencyFactor, true);
    evaluated = controller.getEvaluatedComprensori();
    const chialambertoDerated = evaluated.find(s => s.id === 'chialamberto-valli-di-lanzo-to-to' || s.name === 'Chialamberto');
    assert.ok(chialambertoDerated);
    assert.equal(chialambertoDerated.status, 'caution', 'Should downgrade from flyable to caution when pilot is lapsed (>90d) and factor is enabled');
    assert.ok(
      chialambertoDerated.reason.includes('Prudenza pilota') || chialambertoDerated.reason.includes('Meteo favorevole per la vela'),
      'Reason must explicitly explain that downgrade is due to pilot currency/experience factor'
    );
  });

  it('should not ask the pilot for session type in flight log entry sheet and support automated activity deduction', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });

    // Check renderHtml does not contain any session type prompt on the main dashboard
    const html = controller.renderHtml();
    assert.equal(html.includes('gm-type-selector'), false, 'Main dashboard must not contain session type selector');

    const methodStr = controller.openAddFlightSheet.toString();
    assert.equal(methodStr.includes('Tipo Sessione'), false, 'Must NOT contain Tipo Sessione label');
    assert.equal(methodStr.includes('gm-type-selector'), false, 'Must NOT contain gm-type-selector');
    assert.ok(methodStr.includes('flight-igc-input'), 'Must provide optional IGC track input');
    assert.ok(methodStr.includes('dedotte in automatico'), 'Must explain automatic activity deduction from track');
    assert.ok(methodStr.includes('gm-past-presets'), 'Must provide fast past date presets (Oggi, Ieri, Weekend)');
  });

  it('should render smart date bar in Volabilità section and allow switching date and stepping prev/next', () => {
    const mockStore = createStore({ activeDate: '2026-10-18' });
    const controller = new HomeDashboardViewController({ store: mockStore });

    const html = controller.renderHtml();
    assert.ok(html.includes('gm-date-tabs'), 'Must render smart date tabs in Home');
    assert.ok(html.includes('gm-date-stepper'), 'Must render compact prev/next stepper in Home');
    assert.ok(html.includes('data-action="prev-date"'), 'Must render prev-date button in Home');
    assert.ok(html.includes('data-action="next-date"'), 'Must render next-date button in Home');
    assert.ok(html.includes('data-action="open-date-picker-sheet"'), 'Must render calendar button in Home');

    // Simulate clicking a date preset
    controller.handleClick({
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'select-date';
                if (attr === 'data-date') return '2026-10-19';
                return null;
              }
            };
          }
          return null;
        }
      }
    });

    assert.equal(mockStore.getState().activeDate, '2026-10-19');

    // Simulate clicking next-date stepper button
    controller.handleClick({
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              disabled: false,
              getAttribute(attr) {
                if (attr === 'data-action') return 'next-date';
                if (attr === 'data-date') return '2026-10-20';
                return null;
              }
            };
          }
          return null;
        }
      }
    });

    assert.equal(mockStore.getState().activeDate, '2026-10-20');
  });

  it('should open the 14-day date picker sheet with 7-column Mon-Sun grid, symmetric flyability status badges and legend in HomeDashboard', async () => {
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
    assert.ok(capturedHtml.includes('gm-date-weekday-header'), 'Must include 7-column Mon-Sun weekday header');
    assert.ok(capturedHtml.includes('data-action="pick-calendar-date"'));
    assert.ok(capturedHtml.includes('grid-fly-status'), 'Home calendar must include 14-day flyability status badges symmetric with ForecastView');
    assert.ok(capturedHtml.includes('gm-date-sheet-legend'), 'Home calendar must include semantic 4-color flyability legend');
    assert.ok(!capturedHtml.includes('id="custom-date-native-input"'), 'Should not include redundant secondary native date input');
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

  it('should render the compact active glider pill on the filter bar at zero vertical cost', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });
    const html = controller.renderHtml();

    assert.ok(html.includes('gm-filter-chips-right'), 'Must contain right-aligned filter bar container');
    assert.ok(html.includes('btn-home-select-glider'), 'Must contain select glider button');
    assert.ok(html.includes('gm-glider-pill-compact'), 'Must use compact glider pill class');
    assert.ok(html.includes('EN-A'), 'Default glider class badge must be EN-A');
  });

  it('should render conditional pilot continuity warning badge in Home only when non-optimal (Option B)', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });

    // 1. Empty flights -> 'Nessun volo' with gm-badge-nd
    mockStore.setState({ flights: [] });
    let html = controller.renderHtml();
    assert.ok(html.includes('id="home-pilot-currency-alert"'));
    assert.ok(html.includes('gm-badge gm-badge-nd'));
    assert.ok(html.includes('Nessun volo'));
    assert.ok(html.includes('Nessun volo registrato nel libretto'));

    // 2. Recent flight (<=35 days) -> 'In attività' is optimal, so NO warning badge in Home (0px cost)
    mockStore.setState({
      activeDate: '2026-10-10',
      flights: [
        { id: 'f-1', date: '2026-10-05', durationMinutes: 60 }
      ]
    });
    html = controller.renderHtml();
    assert.equal(html.includes('id="home-pilot-currency-alert"'), false, 'Optimal currency must not clutter Home filter bar');

    // 3. Reentry (36-90 days) -> 'Ripresa graduale' with gm-badge-caution
    mockStore.setState({
      activeDate: '2026-10-10',
      flights: [
        { id: 'f-2', date: '2026-08-20', durationMinutes: 45 }
      ]
    });
    html = controller.renderHtml();
    assert.ok(html.includes('id="home-pilot-currency-alert"'));
    assert.ok(html.includes('gm-badge gm-badge-caution'));
    assert.ok(html.includes('Ripresa graduale'));
    assert.ok(html.includes('Consigliata ripresa con condizioni tranquille'));

    // 4. Lapsed (>90 days) -> 'Fermo prolungato' with gm-badge-alert
    mockStore.setState({
      activeDate: '2026-10-10',
      flights: [
        { id: 'f-3', date: '2026-05-10', durationMinutes: 45 }
      ]
    });
    html = controller.renderHtml();
    assert.ok(html.includes('id="home-pilot-currency-alert"'));
    assert.ok(html.includes('gm-badge gm-badge-alert'));
    assert.ok(html.includes('Fermo prolungato'));
    assert.ok(html.includes('Consigliata cautela, campetto di gonfiaggio'));
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

    // Dashboard UI must now display the exact brand and model in the pill without certification badge (NOTE-004)
    const html = controller.renderHtml();
    assert.ok(html.includes('Ozone Buzz Z7'), 'Must display Ozone Buzz Z7 in glider pill');
    assert.ok(html.includes('VTrim: 38 km/h'), 'Must include physical aerodynamic specs in tooltip');
    assert.ok(!html.includes('gm-glider-pill-badge'), 'Must not display certification class badge in Home glider pill');
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

    // Check search input touch height >= 44px / 48px
    assert.ok(
      cssContent.includes('.gm-search-input {\n  width: 100%;\n  height: 44px;') ||
      cssContent.includes('.gm-search-input {\r\n  width: 100%;\r\n  height: 44px;') ||
      /\.gm-search-input\s*\{[^}]*min-height:\s*(?:var\(--gm-touch-min|44px|48px)/.test(cssContent),
      '.gm-search-input must enforce >= 44px touch height'
    );

    // Check search clear button touch size >= 44x44px / 48x48px
    assert.ok(
      /\.gm-search-clear\s*\{[^}]*width:\s*(?:var\(--gm-touch-min|44px|48px)/.test(cssContent) &&
      /\.gm-search-clear\s*\{[^}]*height:\s*(?:var\(--gm-touch-min|44px|48px)/.test(cssContent),
      '.gm-search-clear must enforce 44x44px or 48x48px touch area'
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

  it('should render expandable theme selector in header next to build number and switch between chiaro, scuro, auto', () => {
    const mockStore = createStore({ ui: { theme: 'dark' } });
    const controller = new HomeDashboardViewController({ store: mockStore });

    const html = controller.renderHtml();
    assert.ok(html.includes('gm-theme-selector'), 'Header must contain gm-theme-selector');
    assert.ok(html.includes('gm-theme-menu-trigger'), 'Must have expandable menu trigger button');
    assert.ok(html.includes('data-action="toggle-theme-menu"'), 'Must declare data-action toggle-theme-menu');
    assert.ok(html.includes('aria-expanded="false"'), 'Trigger must initially have aria-expanded false');
    assert.ok(html.includes('data-theme="light"'), 'Theme selector must contain light (Chiaro) option');
    assert.ok(html.includes('data-theme="dark"'), 'Theme selector must contain dark (Scuro) option');
    assert.ok(html.includes('data-theme="auto"'), 'Theme selector must contain auto (Auto) option');
    assert.ok(html.includes('gm-header-build'), 'Must have build number preceding theme selector');

    // Toggle menu open
    controller.handleClick({
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'toggle-theme-menu';
                return null;
              }
            };
          }
          return null;
        }
      }
    });
    assert.equal(controller.isThemeMenuOpen, true, 'isThemeMenuOpen must be true after toggle');

    // Simulate clicking "Chiaro" (light theme) - should switch theme and close menu
    controller.handleClick({
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'set-theme';
                if (attr === 'data-theme') return 'light';
                return null;
              }
            };
          }
          return null;
        }
      }
    });

    assert.equal(mockStore.getState().ui.theme, 'light', 'Store ui.theme must update to light');
    assert.equal(controller.isThemeMenuOpen, false, 'Theme menu must be closed after selecting option');

    // Test Escape closes theme menu
    controller.toggleThemeMenu(true);
    assert.equal(controller.isThemeMenuOpen, true);
    controller.handleKeyDown({ key: 'Escape' });
    assert.equal(controller.isThemeMenuOpen, false, 'Escape key must close theme menu');

    // Test click outside closes theme menu
    controller.toggleThemeMenu(true);
    assert.equal(controller.isThemeMenuOpen, true);
    controller.handleDocumentClick({ target: {} });
    assert.equal(controller.isThemeMenuOpen, false, 'Clicking outside must close theme menu');

    // Simulate clicking "Auto" (system auto theme)
    controller.handleClick({
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'set-theme';
                if (attr === 'data-theme') return 'auto';
                return null;
              }
            };
          }
          return null;
        }
      }
    });

    assert.equal(mockStore.getState().ui.theme, 'auto', 'Store ui.theme must update to auto');
  });

  it('should enforce date picker ergonomics, touch-action pan-x, and focus-visible in theme.css', async () => {
    const fs = await import('fs');
    const css = fs.readFileSync('css/theme.css', 'utf-8');

    // Verify .gm-date-tabs horizontal scroll and touch-action pan-x
    assert.ok(css.includes('touch-action: pan-x'), 'theme.css must declare touch-action: pan-x for date tabs');
    assert.ok(css.includes('scroll-snap-type: x mandatory'), 'theme.css must declare scroll-snap-type: x mandatory for date tabs');

    // Verify .gm-date-grid-item:focus-visible
    assert.ok(css.includes('.gm-date-grid-item:focus-visible'), 'theme.css must declare :focus-visible for calendar grid items');

    // Verify light theme contrast override for active date items
    assert.ok(css.includes('[data-theme="light"] .gm-date-tab.active'), 'theme.css must declare light theme contrast override for active date tab');
    assert.ok(css.includes('[data-theme="light"] .gm-date-grid-item.active'), 'theme.css must declare light theme contrast override for active date grid item');

    // Verify selected calendar day (.gm-date-grid-item.active) preserves 4-color flyability bottom bar and badge
    assert.ok(css.includes('.gm-date-grid-item.fly-flyable {'), 'theme.css must apply fly-flyable border even when .active');
    assert.ok(!css.includes('.gm-date-grid-item.fly-flyable:not(.active)'), 'theme.css must not suppress flyability border on .active calendar day');
    assert.ok(!css.includes('.gm-date-grid-item.active .grid-fly-status'), 'theme.css must not overwrite semantic .grid-fly-status badge colors on .active day');

    // Verify theme switcher dropdown styling
    assert.ok(css.includes('.gm-theme-selector'), 'theme.css must declare .gm-theme-selector styles');
    assert.ok(css.includes('.gm-theme-menu-trigger'), 'theme.css must declare .gm-theme-menu-trigger styles');
    assert.ok(css.includes('.gm-theme-dropdown'), 'theme.css must declare .gm-theme-dropdown styles');
    assert.ok(css.includes('.gm-theme-menu-item'), 'theme.css must declare .gm-theme-menu-item styles');
  });

  it('should render symbiotic single-row toolbar with search, single flyability toggle pill, and hide filter toggle when searching (Hick\'s Law & Baymard Facet Filtering)', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });

    let html = controller.renderHtml();
    assert.ok(html.includes('id="home-symbiotic-toolbar"'), 'Must render symbiotic single-row toolbar');
    assert.ok(html.includes('id="btn-home-fly-filter-toggle"'), 'Must render single flyability toggle pill');
    assert.ok(html.includes('data-action="toggle-fly-filter"'), 'Must bind toggle-fly-filter action');
    assert.ok(html.includes('Tutti ('), 'Default toggle pill must show Tutti (N)');

    // Default state: all spots
    assert.equal(controller.flyabilityFilter, 'all');

    // Simulate clicking single toggle pill to switch to "flyable"
    const mockToggleToFlyable = {
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'toggle-fly-filter';
                if (attr === 'data-filter') return 'flyable';
                return null;
              }
            };
          }
          return null;
        }
      }
    };

    controller.handleClick(mockToggleToFlyable);
    assert.equal(controller.flyabilityFilter, 'flyable');
    html = controller.renderHtml();
    assert.ok(html.includes('Volabili ('), 'Active toggle pill must show Volabili (M)');

    // When starting a search, the flyability filter toggle must hide to give space to search box
    controller.handleSearchInput({ target: { value: 'lecco' } });
    html = controller.renderHtml();
    assert.ok(html.includes('gm-symbiotic-toolbar is-searching'), 'Toolbar must have is-searching class during active search');
    assert.ok(html.includes('gm-fly-filter-toggle active hidden') || html.includes('gm-fly-filter-toggle hidden'), 'Flyability filter toggle pill must be hidden when searching');

    // Clear search -> filter toggle reappears
    controller.clearSearch();
    html = controller.renderHtml();
    assert.equal(html.includes('is-searching'), false, 'Toolbar must remove is-searching after clearing search');

    // Switch back to "all"
    const mockAllEvent = {
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'toggle-fly-filter';
                if (attr === 'data-filter') return 'all';
                return null;
              }
            };
          }
          return null;
        }
      }
    };
    controller.handleClick(mockAllEvent);
    assert.equal(controller.flyabilityFilter, 'all');
  });

  it('should enforce solid pill badges for outdoor glanceability and calm nominal indicators in theme.css', () => {
    const css = fs.readFileSync(path.resolve('css/theme.css'), 'utf-8');

    // Verify solid pill styling on spot header badges (WCAG AA sunlight contrast)
    assert.ok(css.includes('.gm-spot-header .gm-badge'), 'Must declare .gm-spot-header .gm-badge');
    assert.ok(css.includes('.gm-spot-header .gm-badge-flyable'), 'Must declare solid green badge for flyable');
    assert.ok(css.includes('.gm-spot-header .gm-badge-caution'), 'Must declare solid amber badge for caution');
    assert.ok(css.includes('.gm-spot-header .gm-badge-unflyable'), 'Must declare solid red badge for unflyable');

    // Verify light mode solid pill overrides
    assert.ok(css.includes('[data-theme="light"] .gm-spot-header .gm-badge-flyable'), 'Must declare light mode flyable solid pill');
    assert.ok(css.includes('[data-theme="light"] .gm-spot-header .gm-badge-unflyable'), 'Must declare light mode unflyable solid pill');

    // Verify calm nominal indicators (no glow, secondary text)
    assert.ok(css.includes('.gm-ind-flyable .gm-ind-dot'), 'Must declare calm emerald dot for flyable indicator');

    // Verify filter chips styling
    assert.ok(css.includes('.gm-filter-chips'), 'Must declare .gm-filter-chips layout styles');
    assert.ok(css.includes('.gm-filter-chip.active'), 'Must declare active state for filter chips');
  });

  it('should render synoptic horizon notice as a floating bottom panel with a working close button', () => {
    const css = fs.readFileSync(path.resolve('css/theme.css'), 'utf-8');
    assert.ok(css.includes('.gm-horizon-notice {'), 'Must declare .gm-horizon-notice');
    assert.ok(css.includes('.gm-warning-close-btn'), 'Must declare .gm-warning-close-btn');
    assert.ok(css.includes('.gm-floating-warning-stack'), 'Must declare .gm-floating-warning-stack for Logbook floating banners');

    const mockStore = createStore();
    const synopticDate = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    mockStore.setState({ activeDate: synopticDate });
    const controller = new HomeDashboardViewController({ store: mockStore });

    let dateBarHtml = controller.renderDateBar();
    assert.ok(dateBarHtml.includes('gm-horizon-notice'), 'Must render horizon notice for synoptic date (>7d)');
    assert.ok(dateBarHtml.includes('data-action="dismiss-horizon-notice"'), 'Must render close button on horizon notice');

    // Click close button
    controller.handleClick({
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'dismiss-horizon-notice';
                return null;
              }
            };
          }
          return null;
        }
      }
    });

    assert.equal(controller.dismissedHorizonDate, synopticDate, 'Must record dismissed horizon date');
    dateBarHtml = controller.renderDateBar();
    assert.equal(dateBarHtml.includes('gm-horizon-notice'), false, 'Must hide horizon notice after dismissal');
  });

  it('should render visually lightweight timeline bars without hour numbers or selected-hour highlight on Home cards', () => {
    const css = fs.readFileSync(path.resolve('css/theme.css'), 'utf-8');
    const mockStore = createStore({
      selectedSpot: { id: 'chialamberto-valli-di-lanzo-to-to' },
      selectedHour: 12
    });
    const controller = new HomeDashboardViewController({ store: mockStore });
    const html = controller.renderHtml();

    // 1. No hour numbers or selected-hour highlight on Home timelines
    assert.equal(html.includes('gm-home-timeline-hour'), false, 'Home timeline slots must NOT render hour numbers');
    assert.equal(html.includes('gm-home-time-axis'), false, 'Home must NOT render time axis hour numbers');
    assert.equal(html.includes('is-selected-hour'), false, 'Home timeline slots must NOT render visible selection on selectedHour');

    // 2. Slim timeline bar geometry (height: 3.5px) and calibrated status opacity (unflyable de-emphasized)
    assert.ok(
      /\.gm-home-timeline-bar\s*\{[^}]*height:\s*3\.5px/.test(css),
      '.gm-home-timeline-bar must use slim 3.5px height instead of heavy 8px blocks'
    );
    assert.ok(
      /\.gm-home-timeline-slot\.status-unflyable\s+\.gm-home-timeline-bar\s*\{[^}]*opacity:\s*0\.28/.test(css),
      'Unflyable timeline bars must be visually de-emphasized (opacity: 0.28) to avoid visual noise'
    );

    // 3. CSS custom properties integrity and light-mode contrast
    assert.ok(css.includes('--gm-bg-surface-alt:'), 'Must define --gm-bg-surface-alt in theme.css');
    assert.ok(css.includes('--gm-border-subtle:'), 'Must define --gm-border-subtle in theme.css');
    assert.ok(css.includes('#15803d'), 'Light mode EN-A glider badge must use high-contrast dark green (#15803d)');

    // 4. Vertical accordion chevron (downward polyline 6 9 12 15 18 9 rotating 180deg when expanded)
    assert.ok(html.includes('points="6 9 12 15 18 9"'), 'Comprensorio card chevron must be vertical (accordion style) pointing down when collapsed');
    assert.equal(html.includes('points="9 18 15 12 9 6"'), false, 'Comprensorio card chevron must not use horizontal right-pointing arrow');
    assert.ok(css.includes('transform: rotate(180deg)'), 'Vertical chevron must rotate 180deg when accordion drawer is expanded');
  });

  it('aligns Home card verdict with diurnal timeline when Open-Meteo payload uses windspeed_10m and shares multi-day batch cache', async () => {
    const targetDate = '2026-10-18';
    const mockStore = createStore({
      activeDate: targetDate
    });
    const controller = new HomeDashboardViewController({ store: mockStore });
    const chialamberto = controller.comprensoriCatalog.find(c => c.id.includes('chialamberto')) || controller.comprensoriCatalog[0];
    mockStore.setState({ pinnedSpotIds: [chialamberto.id] });

    const hours = Array.from({ length: 24 }, (_, h) => `${targetDate}T${String(h).padStart(2, '0')}:00`);
    const windspeed_10m = hours.map((_, h) => (h === 14 ? 26 : 10));
    const windgusts_10m = hours.map((_, h) => (h === 14 ? 36 : 13));
    const heading = chialamberto.takeoffs?.[0]?.heading ?? 135;

    controller.cachedWeatherMap.set(`${chialamberto.id}_${targetDate}`, {
      hourly: {
        time: hours,
        windspeed_10m,
        windgusts_10m,
        winddirection_10m: Array(24).fill(heading),
        temperature_2m: Array(24).fill(18),
        cape: Array(24).fill(120),
        precipitation: Array(24).fill(0)
      }
    });

    const evaluated = controller.getEvaluatedComprensori(false);
    const item = evaluated.find(e => e.id === chialamberto.id);
    assert.ok(item, 'Must evaluate Chialamberto comprensorio');
    assert.equal(item.status, 'flyable', 'Card verdict must align to flyable when daylight timeline has >= 2 flyable hours despite 14:00 spike');
  });

  it('should render clear search filter indicator banner and distinguish pinned favorite spots from catalog search results using the star icon', () => {
    const mockStore = createStore({
      pinnedSpotIds: ['monte-cornizzolo-lc']
    });
    const controller = new HomeDashboardViewController({ store: mockStore });

    // 1. Default Home mode (no search query): no search filter banner, no is-search-filtered class
    let html = controller.renderHtml();
    assert.equal(html.includes('id="home-search-filter-banner"'), false, 'Must NOT render search filter banner in default Home view');
    assert.equal(html.includes('is-search-filtered'), false, 'List container must NOT have is-search-filtered class when not searching');
    assert.ok(html.includes('id="home-spots-count" aria-live="polite">1 siti</span>'), 'Counter must show "1 siti" in normal Home view');

    // 2. Active search query ("Monte") matching both pinned (Monte Cornizzolo) and unpinned catalog spots (e.g. Monte Cavallaria)
    controller.searchQuery = 'Monte';
    html = controller.renderHtml();

    assert.ok(html.includes('id="home-search-filter-banner"'), 'Must render #home-search-filter-banner when search query is active');
    assert.ok(html.includes('is-search-filtered'), 'Spots list container must have is-search-filtered class when searching');
    assert.ok(html.includes('Filtro ricerca') && html.includes('Catalogo per'), 'Banner must explicitly state that list is filtered from full catalog');
    assert.ok(html.includes('★ nei preferiti'), 'Banner must summarize favorites count with star icon');
    assert.ok(html.includes('Chiudi filtro'), 'Banner must provide 1-tap exit button');
    assert.ok(html.includes('Filtro: '), 'Counter badge must display "Filtro: X siti" during active search');

    // 3. Individual cards must distinguish pinned items from unpinned catalog items via unified star button (★ / ☆) without redundant "In Home" pills
    assert.ok(html.includes('is-pinned-home is-search-result'), 'Pinned spot in search results must have is-pinned-home is-search-result classes');
    assert.ok(html.includes('is-unpinned-search is-search-result'), 'Unpinned spot in search results must have is-unpinned-search is-search-result classes');
    assert.ok(!html.includes('gm-spot-origin-badge'), 'Must NOT render redundant "✓ In Home" origin badge alongside star button');
    assert.ok(html.includes('gm-star-pin-btn is-pinned'), 'Pinned spot must display active star button (★) during search');
    assert.ok(html.includes('gm-star-pin-btn is-unpinned'), 'Unpinned spot must display outline star button (☆) during search');
    assert.ok(html.includes('data-action="toggle-pin-spot"'), 'Cards must expose 1-tap toggle-pin-spot button');
  });

  it('should add and remove a comprensorio from Home via 1-tap toggle-pin-spot action', () => {
    const mockStore = createStore({
      pinnedSpotIds: ['monte-cornizzolo-lc']
    });
    const controller = new HomeDashboardViewController({ store: mockStore });

    // 1. Add 'monte-cavallaria-to' to Home via toggle-pin-spot
    controller.handleClick({
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'toggle-pin-spot';
                if (attr === 'data-id') return 'monte-cavallaria-to';
                return null;
              }
            };
          }
          return null;
        }
      }
    });

    assert.ok(
      mockStore.getState().pinnedSpotIds.includes('monte-cavallaria-to'),
      'Toggling unpinned spot must add its ID to store pinnedSpotIds'
    );

    // 2. Remove 'monte-cavallaria-to' from Home via toggle-pin-spot
    controller.handleClick({
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'toggle-pin-spot';
                if (attr === 'data-id') return 'monte-cavallaria-to';
                return null;
              }
            };
          }
          return null;
        }
      }
    });

    assert.equal(
      mockStore.getState().pinnedSpotIds.includes('monte-cavallaria-to'),
      false,
      'Toggling pinned spot must remove its ID from store pinnedSpotIds'
    );
  });
});
