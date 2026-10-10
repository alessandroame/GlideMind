import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { store, createStore } from '../../core/store.js';
import { DEFAULT_COMPRENSORI, normalizeLocationsCatalog } from '../../core/comprensorio.js';
import { HomeDashboardViewController } from '../../ui/views/HomeDashboardView.js';
import { ForecastViewController } from '../../ui/views/ForecastView.js';
import { loadLocationsCatalog } from '../../ui/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

describe('Master Locations Catalog Hydration & Runtime Integration', () => {
  let originalFetch;
  let originalWindow;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalWindow = globalThis.window;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    store.setState({ locationsCatalog: null });
  });

  it('should safely fallback to DEFAULT_COMPRENSORI when window or fetch is not available (Node.js)', async () => {
    globalThis.window = undefined;
    const result = await loadLocationsCatalog();
    assert.ok(Array.isArray(result));
    assert.equal(result.length, DEFAULT_COMPRENSORI.length);
  });

  it('should load real locations.json and populate store and view controllers when in browser environment', async () => {
    const rawLocations = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'data/locations.json'), 'utf8'));

    // Mock browser environment
    globalThis.window = {
      fetch: async (url) => {
        if (url === './data/locations.json' || url === '/data/locations.json') {
          return {
            ok: true,
            status: 200,
            json: async () => rawLocations
          };
        }
        return { ok: false, status: 404 };
      }
    };

    const homeController = new HomeDashboardViewController({ store });
    const forecastController = new ForecastViewController({ store });

    // Initial state before hydration: only defaults
    assert.equal(homeController.comprensoriCatalog.length, DEFAULT_COMPRENSORI.length);
    assert.equal(forecastController.comprensoriCatalog.length, DEFAULT_COMPRENSORI.length);

    // Mount controllers to subscribe to store
    homeController.mount(null);
    forecastController.mount(null);

    // Execute catalog loading
    const loaded = await loadLocationsCatalog();
    assert.ok(Array.isArray(loaded));
    assert.ok(loaded.length >= 130, `Expected at least 130 sites, got ${loaded.length}`);

    // Verify store has full catalog
    const state = store.getState();
    assert.ok(Array.isArray(state.locationsCatalog));
    assert.equal(state.locationsCatalog.length, loaded.length);

    // Verify both view controllers reactively received the full catalog
    assert.equal(homeController.comprensoriCatalog.length, loaded.length);
    assert.equal(forecastController.comprensoriCatalog.length, loaded.length);

    // Verify search in HomeDashboardViewController finds real sites
    homeController.searchQuery = 'Grappa';
    const grappaResults = homeController.getEvaluatedComprensori();
    assert.ok(grappaResults.length >= 1, 'Expected at least 1 spot matching Grappa');
    assert.ok(grappaResults.some(s => s.name.includes('Grappa')));

    // Cleanup
    homeController.unmount();
    forecastController.unmount();
  });

  it('should update catalog via setComprensoriCatalog and preserve search input focus', () => {
    const homeController = new HomeDashboardViewController();
    const customCatalog = [
      ...DEFAULT_COMPRENSORI,
      {
        id: 'spot-extra',
        name: 'Spot Extra Alpino',
        province: 'BL',
        region: 'Veneto',
        location: 'Spot Extra Alpino (Feltre - BL)',
        takeoffs: [{ id: 't1', name: 'Decollo', coordinates: '46.0, 11.9', altitude: 1200, heading: 180, isPrimary: true }],
        landings: [{ id: 'l1', name: 'Atterraggio', coordinates: '46.0, 11.92', altitude: 300, isPrimary: true, isSafe: true }]
      }
    ];

    homeController.setComprensoriCatalog(customCatalog);
    assert.equal(homeController.comprensoriCatalog.length, customCatalog.length);

    homeController.searchQuery = 'Feltre';
    const results = homeController.getEvaluatedComprensori();
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'Spot Extra Alpino');
  });

  it('should match current spot by name if old id format is in store', () => {
    const rawLocations = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'data/locations.json'), 'utf8'));
    const fullCatalog = normalizeLocationsCatalog(rawLocations);

    // Old id: 'monte-cornizzolo-lc', New id in master catalog: 'monte-cornizzolo-suello-lc-lc'
    const customStore = {
      getState: () => ({
        selectedSpot: { id: 'monte-cornizzolo-lc', name: 'Monte Cornizzolo' },
        activeDate: '2026-06-15'
      }),
      subscribe: () => () => {}
    };

    const forecastController = new ForecastViewController({
      store: customStore,
      comprensoriCatalog: fullCatalog
    });

    const current = forecastController.getCurrentSpot();
    assert.ok(current);
    assert.equal(current.name, 'Monte Cornizzolo');
    assert.equal(current.province, 'LC');
    assert.ok(current.takeoffs.length >= 1);
  });

  it('should accurately filter comprensori when searching in Forecast picker without frozen input bug', () => {
    const rawLocations = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'data/locations.json'), 'utf8'));
    const fullCatalog = normalizeLocationsCatalog(rawLocations);

    const forecastController = new ForecastViewController({
      store: createStore(),
      comprensoriCatalog: fullCatalog
    });

    // Test search for "cornizzo"
    const cornizzoHtml = forecastController.renderPickerSections('cornizzo');
    assert.ok(cornizzoHtml.includes('Risultati Ricerca (1)'), 'Must return exactly 1 match for cornizzo');
    assert.ok(cornizzoHtml.includes('Monte Cornizzolo'), 'Must include Monte Cornizzolo');
    assert.ok(!cornizzoHtml.includes('Calascio / Rocca Calascio'), 'Must NOT include Calascio in cornizzo search');

    // Test empty search returns Preferiti and Altri Comprensori
    const defaultHtml = forecastController.renderPickerSections('');
    assert.ok(defaultHtml.includes('Preferiti (3)'), 'Must render 3 real default preferiti');
    assert.ok(defaultHtml.includes('Chialamberto'));
    assert.ok(defaultHtml.includes('Martiniana Po'));
    assert.ok(defaultHtml.includes('Monte Cavallaria'));
    const expectedUnpinned = fullCatalog.length - 3;
    assert.ok(defaultHtml.includes(`Altri Comprensori (${expectedUnpinned})`), `Must render ${expectedUnpinned} non-pinned spots`);
  });

  it('should select spot from picker sheet and update store when sheet click is triggered', () => {
    const rawLocations = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'data/locations.json'), 'utf8'));
    const fullCatalog = normalizeLocationsCatalog(rawLocations);
    const mockStore = createStore();
    mockStore.setState({ locationsCatalog: fullCatalog });

    const forecastController = new ForecastViewController({
      store: mockStore,
      comprensoriCatalog: fullCatalog
    });

    let sheetListener = null;
    const mockSheetContainer = {
      addEventListener(evt, fn) {
        if (evt === 'click') sheetListener = fn;
      },
      removeEventListener(evt, fn) {
        if (evt === 'click' && sheetListener === fn) sheetListener = null;
      }
    };

    // Mount controller with mockSheetContainer injected
    globalThis.document = {
      getElementById(id) {
        if (id === 'sheet-container') return mockSheetContainer;
        return null;
      }
    };

    const mockMainContainer = {
      innerHTML: '',
      addEventListener() {},
      removeEventListener() {}
    };

    forecastController.mount(mockMainContainer);
    assert.ok(sheetListener, 'Must register click listener on sheet-container');

    // Simulate clicking Meduno in the sheet
    const medunoSpot = fullCatalog.find(c => c.name.includes('Meduno'));
    assert.ok(medunoSpot);

    const mockEvt = {
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'pick-spot';
                if (attr === 'data-spot-id') return medunoSpot.id;
                return null;
              }
            };
          }
          return null;
        }
      }
    };

    sheetListener(mockEvt);

    assert.equal(mockStore.getState().selectedSpot.id, medunoSpot.id);
    assert.equal(forecastController.getCurrentSpot().name, medunoSpot.name);
    assert.ok(mockStore.getState().recentSpotIds.includes(medunoSpot.id));

    // Cleanup
    forecastController.unmount();
    assert.equal(sheetListener, null, 'Must unbind click listener on unmount');
    delete globalThis.document;
  });
});
