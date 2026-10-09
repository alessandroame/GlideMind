import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { store } from '../../core/store.js';
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
        if (url === '/data/locations.json') {
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
    assert.equal(homeController.comprensoriCatalog.length, 5);

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
});
