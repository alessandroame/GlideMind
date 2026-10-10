import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, createInMemoryStorageAdapter } from '../../core/store.js';
import { SettingsViewController, SETTINGS_MAP_LAYERS } from '../../ui/views/SettingsView.js';

describe('GlideMind Phase 8-bis - SettingsView Architecture & Map Layer Persistence', () => {
  it('should initialize with default contracts and render all core settings sections', () => {
    const mockStore = createStore();
    const controller = new SettingsViewController({ store: mockStore });

    assert.ok(controller, 'Controller must instantiate');
    assert.equal(typeof controller.mount, 'function');
    assert.equal(typeof controller.unmount, 'function');

    const html = controller.renderHtml();
    assert.ok(html.includes('Impostazioni &amp; Preferenze') || html.includes('Impostazioni & Preferenze'), 'Must render settings title');
    assert.ok(html.includes('Cartografia &amp; Layer Mappa') || html.includes('Cartografia & Layer Mappa'), 'Must render cartography section');
    assert.ok(html.includes('Tema Visivo'), 'Must render visual theme section');
    assert.ok(html.includes('Unità di Misura'), 'Must render measurement units section');
    assert.ok(html.includes('Vela Attiva'), 'Must render glider hangar section');
  });

  it('should render all 4 cartographic layer options with active indicator matching store', () => {
    const mockStore = createStore({
      ui: { theme: 'dark', mapLayer: 'satellite' }
    });
    const controller = new SettingsViewController({ store: mockStore });
    const html = controller.renderHtml();

    for (const layer of SETTINGS_MAP_LAYERS) {
      assert.ok(html.includes(`data-layer="${layer.id}"`), `Must include layer option for ${layer.id}`);
      assert.ok(html.includes(layer.name), `Must display name for ${layer.name}`);
    }

    // Satellite must be marked active
    assert.ok(html.includes('data-layer="satellite"\n                  aria-checked="true"'), 'Satellite layer must have aria-checked="true"');
    assert.ok(html.includes('data-layer="topo"\n                  aria-checked="false"'), 'Topo layer must have aria-checked="false"');
  });

  it('should update store ui.mapLayer and persist when a map layer is selected', () => {
    const storageAdapter = createInMemoryStorageAdapter();
    const mockStore = createStore({ ui: { theme: 'dark', mapLayer: 'dark' } }, storageAdapter);
    const controller = new SettingsViewController({ store: mockStore });

    const mockContainer = {
      innerHTML: '',
      addEventListener() {},
      removeEventListener() {}
    };

    controller.mount(mockContainer);
    assert.equal(mockStore.getState().ui.mapLayer, 'dark');

    // Simulate clicking the OpenTopo map layer
    controller.handleClick({
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
            return {
              getAttribute(attr) {
                if (attr === 'data-action') return 'set-map-layer';
                if (attr === 'data-layer') return 'topo';
                return null;
              }
            };
          }
          return null;
        }
      }
    });

    assert.equal(mockStore.getState().ui.mapLayer, 'topo', 'Store ui.mapLayer must be updated to topo');

    // Verify persistence in storage adapter
    const persistedUiRaw = storageAdapter.getItem('glidemind_store_ui');
    assert.ok(persistedUiRaw, 'Storage adapter must contain persisted ui slice');
    const persistedUi = JSON.parse(persistedUiRaw);
    assert.equal(persistedUi.mapLayer, 'topo', 'Persisted ui.mapLayer must be topo');

    // Simulate clicking Satellite layer
    controller.setMapLayer('satellite');
    assert.equal(mockStore.getState().ui.mapLayer, 'satellite', 'Store ui.mapLayer must be updated to satellite');

    const updatedPersistedUi = JSON.parse(storageAdapter.getItem('glidemind_store_ui'));
    assert.equal(updatedPersistedUi.mapLayer, 'satellite', 'Persisted ui.mapLayer must be updated to satellite');

    controller.unmount();
  });

  it('should react to external store mapLayer mutations (e.g. from mini-map or full map)', () => {
    const mockStore = createStore({ ui: { theme: 'dark', mapLayer: 'dark' } });
    const controller = new SettingsViewController({ store: mockStore });

    let lastHtml = '';
    const mockContainer = {
      set innerHTML(val) { lastHtml = val; },
      get innerHTML() { return lastHtml; },
      addEventListener() {},
      removeEventListener() {}
    };

    controller.mount(mockContainer);
    assert.equal(controller.getActiveMapLayer(), 'dark');

    // Simulate external store update from ForecastView mini-map or SpotMapView
    mockStore.setState({
      ui: { ...mockStore.getState().ui, mapLayer: 'streets' }
    });

    assert.equal(controller.getActiveMapLayer(), 'streets', 'SettingsView must reflect externally changed mapLayer');
    assert.ok(lastHtml.includes('data-layer="streets"\n                  aria-checked="true"'), 'Markup must update with streets as active layer');

    controller.unmount();
  });

  it('should update visual theme and units in store when toggled', () => {
    const mockStore = createStore();
    const controller = new SettingsViewController({ store: mockStore });

    controller.setTheme('light');
    assert.equal(mockStore.getState().ui.theme, 'light');

    controller.setUnit('speed', 'knots');
    assert.equal(mockStore.getState().units.speed, 'knots');

    controller.setUnit('altitude', 'ft');
    assert.equal(mockStore.getState().units.altitude, 'ft');

    controller.setUnit('vario', 'fpm');
    assert.equal(mockStore.getState().units.vario, 'fpm');

    // Reset preferences
    controller.resetPreferences();
    assert.equal(mockStore.getState().ui.theme, 'dark');
    assert.equal(mockStore.getState().ui.mapLayer, 'dark');
    assert.equal(mockStore.getState().units.speed, 'km/h');
  });

  it('should clean up listeners and DOM on unmount without memory leaks', () => {
    const mockStore = createStore();
    const controller = new SettingsViewController({ store: mockStore });

    let listenerRemoved = false;
    const mockContainer = {
      innerHTML: 'initial',
      addEventListener() {},
      removeEventListener(type) {
        if (type === 'click') listenerRemoved = true;
      }
    };

    controller.mount(mockContainer);
    assert.ok(controller.storeUnsub, 'Must have active store subscription');

    controller.unmount();
    assert.equal(controller.container, null);
    assert.equal(controller.storeUnsub, null);
    assert.ok(listenerRemoved, 'Must remove click event listener');
  });
});
