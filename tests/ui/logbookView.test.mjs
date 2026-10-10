import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { LogbookViewController } from '../../ui/views/LogbookView.js';
import { createStore, createInMemoryStorageAdapter } from '../../core/store.js';
import { createMemoryDbAdapter } from '../../core/logbookDb.js';

/**
 * Creates a mock DOM container element supporting basic event handling and queries for headless Node.js tests.
 */
function createMockContainer() {
  const listeners = new Map();
  const element = {
    tagName: 'DIV',
    id: 'main-view',
    innerHTML: '',
    children: [],
    addEventListener(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
    },
    removeEventListener(event, handler) {
      if (listeners.has(event)) {
        listeners.get(event).delete(handler);
      }
    },
    dispatchEvent(event) {
      const type = event.type || event;
      if (listeners.has(type)) {
        for (const h of listeners.get(type)) {
          h(event);
        }
      }
    },
    querySelector(selector) {
      if (selector === '#gm-logbook-file-input') {
        let clicked = false;
        return {
          id: 'gm-logbook-file-input',
          type: 'file',
          value: '',
          click() { clicked = true; },
          get wasClicked() { return clicked; },
          addEventListener() {},
          removeEventListener() {}
        };
      }
      if (selector === '#gm-logbook-dropzone') {
        return {
          id: 'gm-logbook-dropzone',
          classList: {
            classes: new Set(),
            add(c) { this.classes.add(c); },
            remove(c) { this.classes.delete(c); },
            contains(c) { return this.classes.has(c); }
          }
        };
      }
      if (selector === '#gm-logbook-progress-wrap') {
        return { style: { display: 'none' } };
      }
      if (selector === '#gm-logbook-progress-bar') {
        return { style: { width: '0%' } };
      }
      if (selector.includes('gm-logbook-undo-banner')) {
        return {
          textContent: '(5s)'
        };
      }
      return null;
    }
  };
  return element;
}

describe('LogbookView Controller & Outdoor Ergonomics (UI Layer)', () => {
  let storeInstance;
  let mockLogbookManager;
  let controller;
  let container;

  const mockFlight1 = {
    id: 'fl_20261010_120000_c347d9b186',
    date: '2026-10-10',
    takeoffTime: '12:00',
    landingTime: '12:45',
    durationMinutes: 45,
    site: 'Monte Cornizzolo',
    siteName: 'Decollo Risparmio -> Atterraggio Ufficiale Suello',
    glider: 'Axis Compact 4',
    gliderClass: 'EN-A',
    maxAltMsl: 1480,
    maxGainMeters: 420,
    maxClimbRate: 3.2,
    thermalsCount: 1,
    maneuversCount: 0,
    distanceKm: 3.1,
    sparklineSvgPoints: '0,28 20,18 40,8 60,12 80,22 100,28'
  };

  const mockFlight2 = {
    id: 'fl_20260928_143000_a1b2c3d4e5',
    date: '2026-09-28',
    takeoffTime: '14:30',
    landingTime: '15:40',
    durationMinutes: 70,
    site: 'Bassano del Grappa',
    siteName: 'Decollo Stella -> Atterraggio Garden Relais',
    glider: 'Ozone Rush 6',
    gliderClass: 'EN-B',
    maxAltMsl: 1750,
    maxGainMeters: 850,
    maxClimbRate: 4.0,
    thermalsCount: 3,
    maneuversCount: 2,
    distanceKm: 18.5,
    sparklineSvgPoints: '0,30 25,12 50,4 75,18 100,30'
  };

  beforeEach(() => {
    storeInstance = createStore({ flights: [] }, createInMemoryStorageAdapter());

    const mockDb = createMemoryDbAdapter();
    mockLogbookManager = {
      adapter: mockDb,
      async getAllFlights() {
        return mockDb.getAllFlightMetas();
      },
      async exportFlightIgc(id) {
        return { rawIgc: 'AXCT001\n', fileName: `${id}.igc` };
      },
      async deleteFlight(id) {
        return mockDb.deleteFlight(id);
      },
      async importParaMeteoBackup(jsonContent, options = {}) {
        return {
          success: true,
          importedFlightsCount: 2,
          tracksImportedCount: 1,
          newFlightsCount: 2
        };
      }
    };

    controller = new LogbookViewController({
      store: storeInstance,
      logbookManager: mockLogbookManager
    });

    container = createMockContainer();
  });

  afterEach(() => {
    controller.unmount();
  });

  it('should mount into container and render initial empty state with career KPIs', async () => {
    await controller.mount(container);

    assert.ok(container.innerHTML.includes('gm-logbook-view'), 'Must render root logbook view');
    assert.ok(container.innerHTML.includes('Statistiche di Carriera'), 'Must render career KPIs heading');
    assert.ok(container.innerHTML.includes('Ore Volate'), 'Must render Ore Volate KPI');
    assert.ok(container.innerHTML.includes('Numero Voli'), 'Must render Numero Voli KPI');
    assert.ok(container.innerHTML.includes('Quota Max MSL'), 'Must render Quota Max KPI');
    assert.ok(container.innerHTML.includes('Distanza Max'), 'Must render Distanza Max KPI');

    // Empty state
    assert.ok(container.innerHTML.includes('Nessun volo memorizzato'), 'Must render clean empty state');
    assert.ok(container.innerHTML.includes('Carica il tuo primo file .IGC'));

    // Upload action
    assert.ok(container.innerHTML.includes('+ Importa Traccia IGC'), 'Must render prominent upload CTA');
    assert.ok(container.innerHTML.includes('gm-logbook-dropzone'), 'Must render drag & drop zone');
  });

  it('should render flight list with responsive cards, altimetric sparklines, and glider classes', async () => {
    storeInstance.setState({ flights: [mockFlight1, mockFlight2] });
    await controller.mount(container);

    const html = container.innerHTML;

    // Career KPIs with 2 flights
    assert.ok(html.includes('I Miei Voli (2)'));
    assert.ok(html.includes('1.9 h') || html.includes('2 h'), 'Must show total formatted flight hours');

    // Flight 1 Card
    assert.ok(html.includes('Decollo Risparmio') && html.includes('Atterraggio Ufficiale Suello'));
    assert.ok(html.includes('Axis Compact 4'));
    assert.ok(html.includes('EN-A'));
    assert.ok(html.includes('1480 m'), 'Must show max altitude');
    assert.ok(html.includes('+420 m'), 'Must show altitude gain');
    assert.ok(html.includes('3.2 m/s'), 'Must show climb rate');
    assert.ok(html.includes('1 termica'), 'Must show thermal count');
    assert.ok(html.includes('3.1 km'), 'Must show distance');

    // Altimetric Sparkline SVG polyline
    assert.ok(html.includes('gm-flight-sparkline'));
    assert.ok(html.includes('0,28 20,18 40,8 60,12 80,22 100,28'));

    // Flight 2 Card
    assert.ok(html.includes('Bassano del Grappa'));
    assert.ok(html.includes('Ozone Rush 6'));
    assert.ok(html.includes('EN-B'));
    assert.ok(html.includes('1750 m'));
    assert.ok(html.includes('3 termiche'));

    // Action buttons
    assert.ok(html.includes('Visualizza Replay 3D'));
    assert.ok(html.includes('Scarica IGC'));
    assert.ok(html.includes('Elimina'));
  });

  it('should adhere to Laws of UX (Von Restorff, Fitts >= 48px, WAI-ARIA and no banned emojis)', async () => {
    storeInstance.setState({ flights: [mockFlight1] });
    await controller.mount(container);

    const html = container.innerHTML;

    // WAI-ARIA accessibility landmarks
    assert.ok(html.includes('role="region"'));
    assert.ok(html.includes('role="list"'));
    assert.ok(html.includes('role="listitem"'));
    assert.ok(html.includes('aria-label="Libretto di Volo e Telemetria"'));
    assert.ok(html.includes('aria-label="Caricamento Traccia IGC"'));

    // Fitts's Law touch target floor
    assert.ok(html.includes('--gm-touch-min, 48px'));

    // Banned decorative emojis audit (Sobriety & Clean Microcopy)
    const banned = ['📈', '🎙️', '⏱️', 'ℹ️', '🚀', '✨', '🔥', '🎉'];
    for (const emoji of banned) {
      assert.ok(!html.includes(emoji), `LogbookView must not contain banned emoji "${emoji}"`);
    }
  });

  it('should support Undo grace window (NN/G #3) when deleting a flight', async () => {
    storeInstance.setState({ flights: [mockFlight1] });
    await controller.mount(container);

    assert.ok(container.innerHTML.includes(mockFlight1.id));

    // Simulate clicking "Elimina"
    const deleteBtn = {
      target: {
        closest: (sel) => {
          if (sel === '[data-action]') {
            return {
              getAttribute: (attr) => {
                if (attr === 'data-action') return 'delete-flight';
                if (attr === 'data-flight-id') return mockFlight1.id;
                return null;
              }
            };
          }
          return null;
        }
      }
    };

    await controller.handleClick(deleteBtn);

    // Optimistically hidden from flight list, undo banner visible
    assert.ok(!container.innerHTML.includes('fl-title-fl_20261010_120000_c347d9b186'));
    assert.ok(container.innerHTML.includes('gm-logbook-undo-banner'));
    assert.ok(container.innerHTML.includes('Volo eliminato'));
    assert.ok(container.innerHTML.includes('Annulla'));

    // Simulate clicking "Annulla"
    const undoBtn = {
      target: {
        closest: (sel) => {
          if (sel === '[data-action]') {
            return {
              getAttribute: (attr) => (attr === 'data-action' ? 'undo-delete' : null)
            };
          }
          return null;
        }
      }
    };

    await controller.handleClick(undoBtn);

    // Flight restored!
    assert.ok(container.innerHTML.includes('Decollo Risparmio'));
    assert.ok(!container.innerHTML.includes('gm-logbook-undo-banner'));
  });

  it('should unmount cleanly and cancel pending undo timers without memory leaks', async () => {
    storeInstance.setState({ flights: [mockFlight1] });
    await controller.mount(container);

    // Start deletion
    controller.startPendingDeletion(mockFlight1.id);
    assert.ok(controller.pendingDeleteFlight);

    // Unmount commits pending deletion and cleans up
    controller.unmount();
    assert.equal(controller.containerEl, null);
    assert.equal(controller.pendingDeleteInterval, null);
  });

  it('should process uploaded ParaMeteo JSON backups and render notification banner', async () => {
    await controller.mount(container);

    const mockFile = {
      name: 'parameteo_backup_2026-04-15_1200.json',
      async text() {
        return JSON.stringify({ app: 'ParaMeteo', version: 2, database: { flights: [] } });
      }
    };

    await controller.processUploadedFiles([mockFile]);

    // Check banner was rendered
    assert.ok(container.innerHTML.includes('gm-import-summary-banner'));
    assert.ok(container.innerHTML.includes('Importazione completata'));
    assert.ok(container.innerHTML.includes('2 voli importati (1 con traccia GPS)'));

    // Dismiss banner
    const dismissBtn = {
      target: {
        closest: (sel) => {
          if (sel === '[data-action]') {
            return {
              getAttribute: (attr) => (attr === 'data-action' ? 'dismiss-import-summary' : null)
            };
          }
          return null;
        }
      }
    };

    await controller.handleClick(dismissBtn);
    assert.ok(!container.innerHTML.includes('gm-import-summary-banner'));
  });
});
