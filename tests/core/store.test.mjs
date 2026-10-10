import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore,
  createInMemoryStorageAdapter,
  createLocalStorageAdapter,
  DEFAULT_INITIAL_STATE
} from '../../core/store.js';

describe('GlideMind Reactive Store - Architecture & Contracts', () => {
  it('should initialize with default initial state', () => {
    const store = createStore();
    const state = store.getState();

    assert.equal(state.activeView, 'home');
    assert.equal(state.selectedSpot, null);
    assert.deepEqual(state.pinnedSpots, []);
    assert.equal(state.units.speed, 'km/h');
    assert.equal(state.units.altitude, 'm');
    assert.equal(state.ui.theme, 'dark');
    assert.equal(state.ui.highContrast, true);
  });

  it('should accept custom initial state overrides', () => {
    const store = createStore({
      activeView: 'forecast',
      selectedSpot: { id: 'spot-1', name: 'Bassano del Grappa' }
    });
    const state = store.getState();

    assert.equal(state.activeView, 'forecast');
    assert.equal(state.selectedSpot.name, 'Bassano del Grappa');
    assert.equal(state.units.speed, 'km/h');
  });

  it('should maintain immutability and prevent external mutations of internal state', () => {
    const store = createStore();
    const state1 = store.getState();
    state1.activeView = 'mutated_externally';
    state1.units.speed = 'mph';

    const state2 = store.getState();
    assert.equal(state2.activeView, 'home');
    assert.equal(state2.units.speed, 'km/h');
  });

  it('should update state with partial object', () => {
    const store = createStore();
    store.setState({ activeView: 'map' });

    assert.equal(store.getState().activeView, 'map');
    assert.equal(store.getState().units.speed, 'km/h');
  });

  it('should update state using updater function', () => {
    const store = createStore();
    store.setState((prev) => ({
      pinnedSpots: [...prev.pinnedSpots, { id: 'spot-1', name: 'Monte Avena' }]
    }));

    const state = store.getState();
    assert.equal(state.pinnedSpots.length, 1);
    assert.equal(state.pinnedSpots[0].name, 'Monte Avena');
  });

  it('should notify global subscribers on state changes', () => {
    const store = createStore();
    const calls = [];

    const unsubscribe = store.subscribe((newState, prevState) => {
      calls.push({ newView: newState.activeView, oldView: prevState.activeView });
    });

    store.setState({ activeView: 'logbook' });
    store.setState({ activeView: 'settings' });
    unsubscribe();
    store.setState({ activeView: 'home' });

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], { newView: 'logbook', oldView: 'home' });
    assert.deepEqual(calls[1], { newView: 'settings', oldView: 'logbook' });
  });

  it('should notify slice subscribers only when specific slice changes', () => {
    const store = createStore();
    const viewCalls = [];
    const unitsCalls = [];

    const unview = store.subscribeSlice('activeView', (newVal, prevVal) => {
      viewCalls.push({ newVal, prevVal });
    });

    const ununits = store.subscribeSlice('units', (newVal, prevVal) => {
      unitsCalls.push({ newVal, prevVal });
    });

    store.setState({ activeView: 'forecast' });
    store.setState({ selectedSpot: { id: 'spot-2' } });
    store.setState({ units: { speed: 'm/s', altitude: 'm', temperature: 'C', vario: 'm/s' } });

    unview();
    ununits();

    store.setState({ activeView: 'home' });

    assert.equal(viewCalls.length, 1);
    assert.deepEqual(viewCalls[0], { newVal: 'forecast', prevVal: 'home' });

    assert.equal(unitsCalls.length, 1);
    assert.equal(unitsCalls[0].newVal.speed, 'm/s');
    assert.equal(unitsCalls[0].prevVal.speed, 'km/h');
  });

  it('should not notify listeners when state mutation is a no-op / identical', () => {
    const store = createStore({ activeView: 'home' });
    let notifyCount = 0;

    store.subscribe(() => {
      notifyCount++;
    });

    store.setState({ activeView: 'home' });
    assert.equal(notifyCount, 0);
  });

  it('should support setSlice convenience method', () => {
    const store = createStore();
    store.setSlice('activeView', 'map');
    assert.equal(store.getState().activeView, 'map');
  });

  it('should persist and restore state via storage adapter', () => {
    const memoryAdapter = createInMemoryStorageAdapter();
    const store1 = createStore({}, memoryAdapter);

    store1.setState({
      pinnedSpots: [{ id: 'spot-99', name: 'Col Rodella' }],
      units: { speed: 'knots', altitude: 'ft', temperature: 'F', vario: 'fpm' },
      activeGlider: { category: 'EN-C', name: 'Sport (EN-C)', vTrim: 40, glideRatio: 9.8 },
      ui: { theme: 'light', mapLayer: 'satellite' }
    });

    // Create a new store instance sharing the same storage adapter
    const store2 = createStore({}, memoryAdapter);
    assert.deepEqual(store2.getState().pinnedSpots, []);

    store2.loadPersistedState();
    const state2 = store2.getState();
    assert.equal(state2.pinnedSpots.length, 1);
    assert.equal(state2.pinnedSpots[0].name, 'Col Rodella');
    assert.equal(state2.units.speed, 'knots');
    assert.equal(state2.activeGlider.category, 'EN-C');
    assert.equal(state2.ui.theme, 'light');
    assert.equal(state2.ui.mapLayer, 'satellite', 'ui.mapLayer must be persisted and restored');
  });

  it('should reset state back to defaults or custom defaults', () => {
    const store = createStore();
    store.setState({ activeView: 'logbook', selectedSpot: { id: 'test' } });

    store.resetState();
    assert.equal(store.getState().activeView, 'home');
    assert.equal(store.getState().selectedSpot, null);
  });

  it('should isolate listener errors and prevent application crash', () => {
    const store = createStore();
    let secondListenerExecuted = false;

    store.subscribe(() => {
      throw new Error('Explosive subscriber error');
    });

    store.subscribe(() => {
      secondListenerExecuted = true;
    });

    assert.doesNotThrow(() => {
      store.setState({ activeView: 'settings' });
    });
    assert.equal(secondListenerExecuted, true);
  });

  it('should handle createLocalStorageAdapter fallback under Node.js', () => {
    const adapter = createLocalStorageAdapter(null);
    adapter.setItem('test_key', 'test_value');
    assert.equal(adapter.getItem('test_key'), 'test_value');
    adapter.removeItem('test_key');
    assert.equal(adapter.getItem('test_key'), null);
  });
});
