import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRIMARY_NAV_ROUTES,
  VALID_ROUTES,
  DEFAULT_ROUTE,
  KEYBOARD_SHORTCUTS,
  normalizeRoute,
  parseHashParams,
  isInputTarget,
  createRouter
} from '../../ui/router.js';
import { createStore } from '../../core/store.js';

describe('GlideMind Router - Route Management & Contracts', () => {
  it('should define the 5 standard aeronautical application routes and full valid routes', () => {
    assert.deepEqual(PRIMARY_NAV_ROUTES, ['home', 'forecast', 'map', 'logbook', 'settings']);
    assert.deepEqual(VALID_ROUTES, ['home', 'forecast', 'map', 'logbook', 'settings', 'replay']);
    assert.equal(DEFAULT_ROUTE, 'home');
  });

  it('should normalize arbitrary route hash formats safely including replay', () => {
    assert.equal(normalizeRoute('#home'), 'home');
    assert.equal(normalizeRoute('#/forecast'), 'forecast');
    assert.equal(normalizeRoute('#map?spot=123'), 'map');
    assert.equal(normalizeRoute('logbook'), 'logbook');
    assert.equal(normalizeRoute('#SETTINGS'), 'settings');
    assert.equal(normalizeRoute('#replay?flightId=fl_123'), 'replay');

    // Unknown or falsy routes must fallback to DEFAULT_ROUTE
    assert.equal(normalizeRoute(null), 'home');
    assert.equal(normalizeRoute(''), 'home');
    assert.equal(normalizeRoute('#unknown_view'), 'home');
  });

  it('should detect input targets to prevent accidental keyboard shortcut triggers', () => {
    assert.equal(isInputTarget({ tagName: 'INPUT' }), true);
    assert.equal(isInputTarget({ tagName: 'TEXTAREA' }), true);
    assert.equal(isInputTarget({ tagName: 'SELECT' }), true);
    assert.equal(isInputTarget({ isContentEditable: true }), true);
    assert.equal(isInputTarget({ tagName: 'DIV', getAttribute: (attr) => (attr === 'role' ? 'textbox' : null) }), true);

    // Non-input targets should return false
    assert.equal(isInputTarget({ tagName: 'BUTTON', isContentEditable: false, getAttribute: () => null }), false);
    assert.equal(isInputTarget({ tagName: 'DIV', isContentEditable: false, getAttribute: () => null }), false);
    assert.equal(isInputTarget(null), false);
  });

  it('should map desktop keyboard shortcuts correctly', () => {
    assert.equal(KEYBOARD_SHORTCUTS.h, 'home');
    assert.equal(KEYBOARD_SHORTCUTS.f, 'forecast');
    assert.equal(KEYBOARD_SHORTCUTS.m, 'map');
    assert.equal(KEYBOARD_SHORTCUTS.l, 'logbook');
    assert.equal(KEYBOARD_SHORTCUTS.s, 'settings');
  });

  it('should coordinate view mounting lifecycle and synchronize with store', () => {
    const store = createStore();
    const router = createRouter({ storeInstance: store });

    let homeMounted = 0;
    let homeUnmounted = 0;
    let forecastMounted = 0;

    router.registerView('home', {
      mount: () => {
        homeMounted++;
      },
      unmount: () => {
        homeUnmounted++;
      }
    });

    router.registerView('forecast', {
      mount: () => {
        forecastMounted++;
      }
    });

    router.navigate('home');
    assert.equal(router.getCurrentRoute(), 'home');
    assert.equal(store.getState().activeView, 'home');
    assert.equal(homeMounted, 1);
    assert.equal(homeUnmounted, 0);

    router.navigate('forecast');
    assert.equal(router.getCurrentRoute(), 'forecast');
    assert.equal(store.getState().activeView, 'forecast');
    assert.equal(homeUnmounted, 1);
    assert.equal(forecastMounted, 1);
  });

  it('should reject invalid route registration', () => {
    const router = createRouter();
    assert.throws(
      () => {
        router.registerView('invalid_screen', { mount: () => {} });
      },
      {
        message: /Invalid route 'invalid_screen'/
      }
    );
  });

  it('should support navigateTo as an alias to navigate', () => {
    const router = createRouter();
    assert.equal(typeof router.navigateTo, 'function', 'router.navigateTo must be a function');
    assert.equal(router.navigateTo, router.navigate, 'router.navigateTo must alias router.navigate');
  });

  it('should parse hash parameters correctly via parseHashParams', () => {
    assert.deepEqual(parseHashParams('#logbook?focusFlightId=fl_50'), { focusFlightId: 'fl_50' });
    assert.deepEqual(parseHashParams('#logbook?focusFlightId=fl_50&tab=stats'), { focusFlightId: 'fl_50', tab: 'stats' });
    assert.deepEqual(parseHashParams('#logbook'), {});
    assert.deepEqual(parseHashParams(''), {});
    assert.deepEqual(parseHashParams(null), {});
  });

  it('should forward route parameters to handleRouteParams when navigating to the current active route', () => {
    const store = createStore();
    const router = createRouter({ storeInstance: store });

    let mountedParams = null;
    let handledParams = null;

    router.registerView('logbook', {
      mount: (_container, params) => {
        mountedParams = params;
      },
      handleRouteParams: (params) => {
        handledParams = params;
      }
    });

    router.navigate('logbook', { focusFlightId: 'fl_10' });
    assert.equal(router.getCurrentRoute(), 'logbook');
    assert.deepEqual(mountedParams, { focusFlightId: 'fl_10' });

    // Navigate to same route with updated params
    router.navigate('logbook', { focusFlightId: 'fl_50' });
    assert.deepEqual(handledParams, { focusFlightId: 'fl_50' });
  });
});
