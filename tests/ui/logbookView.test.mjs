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
      if (selector === '#gm-logbook-search-input') {
        return {
          id: 'gm-logbook-search-input',
          value: '',
          addEventListener() {},
          removeEventListener() {}
        };
      }
      if (selector === '#gm-flight-list-container') {
        return {
          innerHTML: ''
        };
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
      },
      async importIgcTrack(text, options = {}) {
        return { success: true };
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

  it('should mount into container and render initial empty state with segmented control', async () => {
    await controller.mount(container);

    const html = container.innerHTML;
    assert.ok(html.includes('gm-logbook-view'), 'Must render root logbook view');
    assert.ok(html.includes('gm-segmented-control'), 'Must render segmented control');
    assert.ok(html.includes('Voli (0)'), 'Must render Voli tab with 0 count');
    assert.ok(html.includes('Statistiche'), 'Must render Statistiche tab');

    // Header upload trigger
    assert.ok(html.includes('+ Importa'), 'Must render + Importa header button');

    // Empty state
    assert.ok(html.includes('Nessun volo memorizzato nel Flight Log'), 'Must render clean empty state');
    assert.ok(html.includes('+ Importa Traccia IGC / Backup'), 'Must render primary upload button in empty state');
  });

  it('should render flight list with lean cards and glider classes without altimetric sparkline', async () => {
    storeInstance.setState({ flights: [mockFlight1, mockFlight2] });
    await controller.mount(container);

    const html = container.innerHTML;

    // Segmented tab shows count (2)
    assert.ok(html.includes('Voli (2)'));

    // Flight 1 Card (Latest = #2)
    assert.ok(html.includes('gm-flight-number-badge'), 'Must render flight number badge');
    assert.ok(html.includes('#2'), 'Must render progressive flight number #2 for newest flight');
    assert.ok(html.includes('#1'), 'Must render progressive flight number #1 for older flight');
    assert.ok(html.includes('Decollo Risparmio → Atterraggio Ufficiale Suello'));
    assert.ok(html.includes('Axis Compact 4'));
    assert.ok(html.includes('EN-A'));
    assert.ok(html.includes('1480 m'), 'Must show max altitude');
    assert.ok(html.includes('+420 m'), 'Must show altitude gain');
    assert.ok(html.includes('45 min'), 'Must show duration');
    assert.ok(html.includes('Termiche'), 'Must show 4th KPI column for thermals count');

    // Altimetric sparkline removed from flight list cards
    assert.ok(!html.includes('gm-flight-sparkline'), 'Must not render altimetric sparkline in flight list cards');
    assert.ok(!html.includes('gm-flight-sparkline-wrap'), 'Must not render sparkline container');

    // Flight 2 Card
    assert.ok(html.includes('Bassano del Grappa'));
    assert.ok(html.includes('Ozone Rush 6'));
    assert.ok(html.includes('EN-B'));
    assert.ok(html.includes('1750 m'));
    assert.ok(html.includes('+850 m'));
    assert.ok(html.includes('70 min'));
    assert.ok(html.includes('gm-flight-metric-val-thermal">3</span>'), 'Must show 3 thermals for flight 2');

    // Entire card is touch interactive (Card-as-Target); delete button moved inside FlightDetailSheet
    assert.ok(html.includes('data-action="open-flight-detail"'));
    assert.ok(!html.includes('gm-flight-delete-btn'), 'Card header must not contain delete button (moved to detail sheet)');

    // Button clutter eliminated from feed (moved to detail sheet)
    assert.ok(!html.includes('Visualizza Replay 3D'), 'Must not clutter card with 3D replay button');
    assert.ok(!html.includes('Scarica IGC'), 'Must not clutter card with download button');
  });

  it('should prevent redundant takeoff in subtitle, format +0 m gain and exclude EN category badge from card header', async () => {
    const flightWithTakeoffInTitle = {
      id: 'fl_ciavanis_94',
      date: '2026-10-11',
      takeoffTime: '16:42',
      durationMinutes: 11,
      site: 'Decollo Ciavanis',
      siteName: 'Decollo Ciavanis -> PeterPan Santa Elisabetta',
      takeoffLocationName: 'Decollo Ciavanis',
      landingLocationName: 'PeterPan Santa Elisabetta',
      glider: 'Axis Pluto 4',
      gliderClass: 'EN-B',
      maxAltMsl: 1775,
      maxGainMeters: 0,
      thermalsCount: 0
    };

    storeInstance.setState({ flights: [flightWithTakeoffInTitle] });
    await controller.mount(container);

    const cardHtml = controller.renderFlightCard(flightWithTakeoffInTitle, 94);

    // Card header must NOT contain the EN-B pill badge (avoids horizontal overcrowding)
    assert.ok(!cardHtml.includes('gm-glider-pill-badge'), 'Flight card must not contain redundant glider pill badge');
    assert.ok(!cardHtml.includes('EN-B'), 'Flight card header must not display EN-B pill badge');

    // Subtitle must NOT repeat "Decollo Ciavanis"
    assert.ok(!cardHtml.includes('• Decollo Ciavanis •'), 'Subtitle must not repeat takeoff when already in title');
    assert.ok(cardHtml.includes('Decollo Ciavanis → PeterPan Santa Elisabetta'));
    assert.ok(cardHtml.includes('2026-10-11'));
    assert.ok(cardHtml.includes('16:42'));
    assert.ok(cardHtml.includes('Axis Pluto 4'));
    assert.ok(cardHtml.includes('+0 m'), 'Zero altitude gain must render as +0 m instead of --');
  });

  it('should filter flights by category chips and search query', async () => {
    storeInstance.setState({ flights: [mockFlight1, mockFlight2] });
    await controller.mount(container);

    // Initial: both visible
    assert.equal(controller.filterFlights([mockFlight1, mockFlight2]).length, 2);

    // Filter by EN-A
    controller.activeFilter = 'EN-A';
    const enAFlights = controller.filterFlights([mockFlight1, mockFlight2]);
    assert.equal(enAFlights.length, 1);
    assert.equal(enAFlights[0].id, mockFlight1.id);

    // Filter by EN-B
    controller.activeFilter = 'EN-B';
    const enBFlights = controller.filterFlights([mockFlight1, mockFlight2]);
    assert.equal(enBFlights.length, 1);
    assert.equal(enBFlights[0].id, mockFlight2.id);

    // Filter by Track Presence (with-track / no-track)
    const flightWithTrack = { ...mockFlight1, id: 'fl_track_yes', hasDecimatedTrack: true };
    const flightNoTrack = { ...mockFlight2, id: 'fl_track_no', hasDecimatedTrack: false };
    const flightReconstructed = { ...mockFlight1, id: 'fl_track_recon', hasDecimatedTrack: true, isReconstructed: true };

    controller.activeFilter = 'with-track';
    const withTrackFlights = controller.filterFlights([flightWithTrack, flightNoTrack, flightReconstructed]);
    assert.equal(withTrackFlights.length, 1);
    assert.equal(withTrackFlights[0].id, 'fl_track_yes');

    controller.activeFilter = 'no-track';
    const noTrackFlights = controller.filterFlights([flightWithTrack, flightNoTrack, flightReconstructed]);
    assert.equal(noTrackFlights.length, 2);
    assert.deepEqual(noTrackFlights.map((f) => f.id), ['fl_track_no', 'fl_track_recon']);

    // Filter by Search Query
    controller.activeFilter = 'all';
    controller.searchQuery = 'Cornizzolo';
    const searchResult = controller.filterFlights([mockFlight1, mockFlight2]);
    assert.equal(searchResult.length, 1);
    assert.equal(searchResult[0].site, 'Monte Cornizzolo');

    // Reset filters
    controller.searchQuery = '';
    assert.equal(controller.filterFlights([mockFlight1, mockFlight2]).length, 2);
  });

  it('should render track presence badge only when track exists, omitting badge when absent', async () => {
    const flightWithTrack = {
      ...mockFlight1,
      id: 'fl_card_with_track',
      hasDecimatedTrack: true
    };
    const flightWithoutTrack = {
      ...mockFlight2,
      id: 'fl_card_no_track',
      hasDecimatedTrack: false
    };
    const flightWithSyntheticTrack = {
      ...mockFlight1,
      id: 'fl_card_synthetic',
      hasDecimatedTrack: true,
      isReconstructed: true
    };

    storeInstance.setState({ flights: [flightWithTrack, flightWithoutTrack] });
    await controller.mount(container);

    const cardWithTrackHtml = controller.renderFlightCard(flightWithTrack, 1);
    assert.ok(cardWithTrackHtml.includes('gm-track-badge-present'), 'Must render present badge for authentic track');
    assert.ok(cardWithTrackHtml.includes('Traccia'), 'Must render "Traccia" label');
    assert.ok(cardWithTrackHtml.includes('polyline points='), 'Must render polyline track SVG icon');

    const cardNoTrackHtml = controller.renderFlightCard(flightWithoutTrack, 2);
    assert.ok(!cardNoTrackHtml.includes('gm-track-badge'), 'Must NOT render any track badge when no track attached');
    assert.ok(!cardNoTrackHtml.includes('No traccia'), 'Must NOT render "No traccia" label');

    const cardSyntheticHtml = controller.renderFlightCard(flightWithSyntheticTrack, 3);
    assert.ok(!cardSyntheticHtml.includes('gm-track-badge'), 'Synthetic reconstructed track must NOT render any track badge');
    assert.ok(!cardSyntheticHtml.includes('No traccia'), 'Must NOT render "No traccia" label for synthetic tracks');

    // Check filter chips in rendered tab
    const tabHtml = container.innerHTML;
    assert.ok(tabHtml.includes('data-filter="with-track"'), 'Must render Con traccia filter chip');
    assert.ok(tabHtml.includes('data-filter="no-track"'), 'Must render Senza traccia filter chip');
  });

  it('should render Pilot Statistics and Currency Dashboard when switching to stats tab', async () => {
    storeInstance.setState({ flights: [mockFlight1, mockFlight2] });
    await controller.mount(container);

    // Switch to stats sub-tab
    controller.activeTab = 'stats';
    controller.render();

    const html = container.innerHTML;

    // Currency Card & 30 Giorni / Anno Toggle
    assert.ok(html.includes('Valuta &amp; Continuità Pilota'));
    assert.ok(html.includes('gm-currency-card'));
    assert.ok(html.includes('Voli (ultimi 30 gg)'));
    assert.ok(html.includes('Ore (ultimi 30 gg)'));
    assert.ok(html.includes('data-action="set-pilot-period"'));
    assert.ok(html.includes('data-period="month"'));
    assert.ok(html.includes('data-period="year"'));

    // Simulate switching period to 'year'
    await controller.handleClick({
      stopPropagation() {},
      preventDefault() {},
      target: {
        closest(sel) {
          if (sel === '[data-action]') {
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
    });
    assert.equal(controller.pilotPeriod, 'year');
    assert.ok(container.innerHTML.includes('Voli (ultimo anno)'));
    assert.ok(container.innerHTML.includes('Ore (ultimo anno)'));

    // Career Totals
    assert.ok(html.includes('Totali di Carriera'));
    assert.ok(html.includes('Ore Totali'));
    assert.ok(html.includes('Voli Totali'));
    assert.ok(html.includes('Termiche Agganciate'));

    // Personal Records
    assert.ok(html.includes('Migliori Prestazioni Personali'));
    assert.ok(html.includes('Quota Max MSL'));
    assert.ok(html.includes('1750 m'), 'Must show highest altitude among flights');
    assert.ok(html.includes('Maggior Guadagno'));
    assert.ok(html.includes('+850 m'), 'Must show max gain');
    assert.ok(html.includes('Volo Più Lungo'));
    assert.ok(html.includes('70 min'), 'Must show max duration');

    // Top Sites and Gliders Donut Cards
    assert.ok(html.includes('Decolli Più Frequentati'));
    assert.ok(html.includes('Vele Utilizzate'));
    assert.ok(html.includes('gm-donut-card'));
    assert.ok(html.includes('gm-donut-svg'));

    // Mixed Monthly Activity SVG Chart (Dual-Axis Hours + Flights)
    assert.ok(html.includes('Attività Mensile'));
    assert.ok(html.includes('gm-chart-card'));
    assert.ok(html.includes('gm-chart-svg'));
    assert.ok(html.includes('gm-mixed-chart-legend'));
    assert.ok(html.includes('Ore di Volo'));
    assert.ok(html.includes('Numero Voli'));

    // Verify unified ImportFlightSheet contains both IGC dropzone and Manual Flight registration form
    const { renderImportSheetHtml } = await import('../../ui/views/ImportFlightSheet.js');
    const sheetHtml = renderImportSheetHtml();
    assert.ok(sheetHtml.includes('id="gm-import-sheet-dropzone"'), 'Unified sheet must contain IGC/JSON dropzone');
    assert.ok(sheetHtml.includes('id="gm-manual-flight-form"'), 'Unified sheet must contain manual flight entry form');
    assert.ok(sheetHtml.includes('Registra Volo Manualmente (Senza Traccia)'), 'Unified sheet must label manual flight entry');
  });

  it('should adhere to Laws of UX (Von Restorff, Fitts >= 48px, WAI-ARIA and no banned emojis)', async () => {
    storeInstance.setState({ flights: [mockFlight1] });
    await controller.mount(container);

    const html = container.innerHTML;

    // WAI-ARIA accessibility landmarks
    assert.ok(html.includes('role="region"'));
    assert.ok(html.includes('role="tablist"'));
    assert.ok(html.includes('role="tab"'));
    assert.ok(html.includes('role="list"'));
    assert.ok(html.includes('role="listitem"'));
    assert.ok(html.includes('aria-label="Flight Log e Telemetria"'));

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
      stopPropagation() {},
      preventDefault() {},
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
      stopPropagation() {},
      preventDefault() {},
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
      stopPropagation() {},
      preventDefault() {},
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

  it('should scroll and apply focus state to requested flight card via focusFlight and route params', async () => {
    storeInstance.setState({ flights: [mockFlight1, mockFlight2] });
    await controller.mount(container, { focusFlightId: mockFlight2.id });

    let focused = false;
    let scrolled = false;
    let cardClassList = null;

    const originalQuery = container.querySelector;
    container.querySelector = (selector) => {
      if (selector === `[data-flight-id="${mockFlight1.id}"]`) {
        cardClassList = new Set();
        return {
          id: mockFlight1.id,
          isConnected: true,
          offsetWidth: 100,
          classList: {
            add(c) { cardClassList.add(c); },
            remove(c) { cardClassList.delete(c); },
            contains(c) { return cardClassList.has(c); }
          },
          scrollIntoView({ behavior, block }) {
            scrolled = true;
            assert.equal(behavior, 'smooth');
            assert.equal(block, 'center');
          },
          focus() {
            focused = true;
          }
        };
      }
      return originalQuery(selector);
    };

    controller.handleRouteParams({ focusFlightId: mockFlight1.id });

    // Wait for microtask/timer in focusFlight
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.ok(scrolled, 'Target flight card must be scrolled into view');
    assert.ok(focused, 'Target flight card must receive keyboard focus');
    assert.ok(cardClassList.has('gm-flight-card-focused'), 'Card must receive gm-flight-card-focused class');
  });
});
