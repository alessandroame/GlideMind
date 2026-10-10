import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spotMapView, SpotMapView } from '../../ui/views/SpotMapView.js';
import { store } from '../../core/store.js';
import { MACRO_REGIONS } from '../../core/mapDataPartition.js';
import { DEFAULT_COMPRENSORI } from '../../core/comprensorio.js';

// Minimal mock DOM node generator for headless testing
function createMockElement(tagName = 'div', attributes = {}) {
  const children = [];
  const classList = new Set();
  const eventListeners = new Map();
  const dataset = {};
  let textContent = '';
  let innerHTML = '';

  const el = {
    tagName: tagName.toUpperCase(),
    attributes: { ...attributes },
    dataset,
    style: {},
    classList: {
      add: (...names) => names.forEach(n => classList.add(n)),
      remove: (...names) => names.forEach(n => classList.delete(n)),
      contains: (n) => classList.contains(n),
      toggle: (n) => classList.has(n) ? classList.delete(n) : classList.add(n)
    },
    getAttribute: (k) => el.attributes[k] ?? null,
    setAttribute: (k, v) => { el.attributes[k] = String(v); },
    hasAttribute: (k) => k in el.attributes,
    removeAttribute: (k) => { delete el.attributes[k]; },
    addEventListener: (type, fn) => {
      if (!eventListeners.has(type)) eventListeners.set(type, new Set());
      eventListeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => {
      if (eventListeners.has(type)) eventListeners.get(type).delete(fn);
    },
    dispatchEvent: (event) => {
      const type = event.type || event;
      if (eventListeners.has(type)) {
        eventListeners.get(type).forEach(fn => fn(event));
      }
      return true;
    },
    appendChild: (child) => {
      children.push(child);
      return child;
    },
    querySelector: (selector) => {
      // Basic mock selector matching for test inspection
      if (selector.startsWith('#')) {
        const id = selector.slice(1);
        if (el.attributes.id === id) return el;
        for (const c of children) {
          const found = c.querySelector?.(selector);
          if (found) return found;
        }
      }
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        if (classList.has(cls)) return el;
        for (const c of children) {
          const found = c.querySelector?.(selector);
          if (found) return found;
        }
      }
      return null;
    },
    querySelectorAll: (selector) => {
      const results = [];
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        if (classList.has(cls)) results.push(el);
      }
      for (const c of children) {
        if (c.querySelectorAll) {
          results.push(...c.querySelectorAll(selector));
        }
      }
      return results;
    }
  };

  Object.defineProperty(el, 'innerHTML', {
    get: () => innerHTML,
    set: (html) => {
      innerHTML = html;
      // Extract text content and basic child elements for query matching
      textContent = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  });

  Object.defineProperty(el, 'textContent', {
    get: () => textContent,
    set: (txt) => { textContent = txt; }
  });

  return el;
}

describe('Spot Map View - Controller & Cartography Contracts (UI Layer)', () => {
  let mockContainer;

  beforeEach(() => {
    mockContainer = createMockElement('main');
  });

  afterEach(() => {
    spotMapView.unmount();
  });

  it('should mount with valid application landmarks, canvas container, and toolbar', () => {
    spotMapView.mount(mockContainer);

    assert.ok(mockContainer.innerHTML.includes('id="gm-map-canvas"'), 'Must contain map canvas mount point');
    assert.ok(mockContainer.innerHTML.includes('role="application"'), 'Map canvas must declare application role');
    assert.ok(mockContainer.innerHTML.includes('id="gm-map-macro-region-select"'), 'Must contain macro-region selector');
    assert.ok(mockContainer.innerHTML.includes('id="gm-map-top-spot-btn"'), 'Must contain 1-tap top spot recommendation button');
    assert.ok(mockContainer.innerHTML.includes('gm-map-scrubber-slots'), 'Must contain hourly scrubber container');
  });

  it('should initialize a HeadlessMockMapEngine in pure Node.js runtime without DOM errors', () => {
    spotMapView.mount(mockContainer);

    assert.ok(spotMapView.mapEngine);
    const view = spotMapView.mapEngine.getView();
    assert.ok(typeof view.zoom === 'number');
    assert.ok(typeof view.center.lat === 'number');
    assert.ok(typeof view.center.lon === 'number');
  });

  it('should always render circular markers across all zoom levels as specified in screenshot', () => {
    spotMapView.mount(mockContainer);
    const engine = spotMapView.mapEngine;

    // Macro Zoom (< 7.5): circular mode
    spotMapView.handleMapMove({ zoom: 6.5, center: { lat: 45.4, lon: 8.0 } });
    assert.equal(engine.renderedMode, 'circular', 'Zoom 6.5 must render in circular marker mode');

    // Medium Zoom (7.5 - 8.9): circular mode
    spotMapView.handleMapMove({ zoom: 8.0, center: { lat: 45.4, lon: 8.0 } });
    assert.equal(engine.renderedMode, 'circular', 'Zoom 8.0 must render in circular marker mode');

    // Micro Zoom (>= 9.0): circular mode
    spotMapView.handleMapMove({ zoom: 9.5, center: { lat: 45.4, lon: 8.0 } });
    assert.equal(engine.renderedMode, 'circular', 'Zoom 9.5 must render in circular marker mode');
  });

  it('should support Canvas marker mode for high-density rendering without DOM bloat', () => {
    spotMapView.mount(mockContainer);
    const engine = spotMapView.mapEngine;

    // Simulate high density dataset (> 50 spots)
    const mockSpots = Array.from({ length: 65 }, (_, i) => ({
      id: `spot-${i}`,
      name: `Spot ${i}`,
      status: i % 2 === 0 ? 'flyable' : 'caution',
      takeoff: { coordinates: `45.${i}, 7.${i}`, altitude: 1000 + i }
    }));

    engine.renderOverlays(mockSpots, 7, null, 'spot-0');
    assert.equal(engine.renderedMode, 'circular');
    assert.equal(engine.isCanvasRendered, true, 'Datasets with >50 spots must activate Canvas mode');
    assert.equal(engine.renderedOverlays.length, 65);
  });

  it('should support spot selection and opening speech bubble popup on tap', () => {
    spotMapView.mount(mockContainer);
    const engine = spotMapView.mapEngine;

    const spots = spotMapView.getEvaluatedSpotsForActiveRegion();
    assert.ok(spots.length > 0, 'Must have evaluated spots for active region');

    const firstSpot = spots[0];
    const spotId = firstSpot.id || firstSpot.comprensorio?.id;

    spotMapView.handleSpotFocus(firstSpot);
    assert.equal(spotMapView.focusedSpotId, spotId);
    assert.equal(store.getState().selectedSpotId, spotId);

    assert.equal(typeof engine.openSpotPopup, 'function');
    engine.openSpotPopup(spotId);
    assert.equal(engine.activePopupSpotId, spotId);
  });

  it('should synchronize active hour with store and scrubber slots', () => {
    spotMapView.mount(mockContainer);

    spotMapView.setActiveHour(14, true);
    assert.equal(spotMapView.activeHour, 14);
    assert.equal(store.getState().activeHourIndex, 14);

    const activeHourText = mockContainer.innerHTML;
    assert.ok(activeHourText.includes('data-hour="14"'));
  });

  it('should dynamically update map theme on store theme changes', () => {
    spotMapView.mount(mockContainer);

    store.setState({ ui: { theme: 'light' } });
    assert.equal(spotMapView.mapEngine.theme, 'light');

    store.setState({ ui: { theme: 'dark' } });
    assert.equal(spotMapView.mapEngine.theme, 'dark');
  });

  it('should update active macro-region and recenter map', () => {
    spotMapView.mount(mockContainer);

    spotMapView.setMacroRegion('centre');
    assert.equal(spotMapView.activeMacroRegion, 'centre');

    const view = spotMapView.mapEngine.getView();
    assert.equal(view.center.lat, MACRO_REGIONS.CENTRE.defaultCenter.lat);
    assert.equal(view.center.lon, MACRO_REGIONS.CENTRE.defaultCenter.lon);
  });

  it('should cull markers and restrict rendering strictly to visible viewport bounds on map move', () => {
    spotMapView.mount(mockContainer);
    const engine = spotMapView.mapEngine;

    // Simulate panning/zooming to a tight bounding box in Piemonte
    const tightPiemonteBounds = {
      south: 45.2,
      north: 45.6,
      west: 7.2,
      east: 7.9,
      getSouth: () => 45.2,
      getNorth: () => 45.6,
      getWest: () => 7.2,
      getEast: () => 7.9
    };

    spotMapView.handleMapMove({
      zoom: 10,
      center: { lat: 45.4, lon: 7.5 },
      bounds: tightPiemonteBounds
    });

    // Overlays should contain only spots inside the Piemonte bbox
    assert.ok(engine.renderedOverlays.length > 0, 'Must render matching spots in Piemonte');
    // Cornizzolo in Lombardia (~lon 9.3) or Bassano in Veneto (~lon 11.7) must NOT be present
    assert.equal(
      engine.renderedOverlays.some(s => (s.id || s.comprensorio?.id) === 'monte-cornizzolo-lc'),
      false,
      'Monte Cornizzolo must be culled out of western Piemonte viewport'
    );
    assert.equal(
      engine.renderedOverlays.some(s => (s.id || s.comprensorio?.id) === 'bassano-borso-del-grappa-tv'),
      false,
      'Bassano must be culled out of western Piemonte viewport'
    );
  });

  it('should clean up on unmount without memory leaks', () => {
    spotMapView.mount(mockContainer);
    assert.ok(spotMapView.mapEngine);

    spotMapView.unmount();
    assert.equal(spotMapView.mapEngine, null);
    assert.equal(spotMapView.container, null);
    assert.equal(spotMapView.storeUnsub, null);
    assert.equal(spotMapView.moveDebounceTimer, null);
  });
});
