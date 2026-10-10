import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { renderImportSheetHtml, processImportFiles } from '../../ui/views/ImportFlightSheet.js';
import { createStore, createInMemoryStorageAdapter } from '../../core/store.js';

describe('ImportFlightSheet Component & Workflows (UI Layer)', () => {
  let mockStore;
  let mockLogbookManager;

  beforeEach(() => {
    mockStore = createStore({ flights: [] }, createInMemoryStorageAdapter());
    mockLogbookManager = {
      async importParaMeteoBackup(jsonText, options = {}) {
        if (typeof options.onProgress === 'function') {
          options.onProgress(50);
          options.onProgress(100);
        }
        return {
          success: true,
          importedFlightsCount: 5,
          tracksImportedCount: 3,
          newFlightsCount: 5
        };
      },
      async importIgcTrack(igcText, options = {}) {
        if (typeof options.onProgress === 'function') {
          options.onProgress(100);
        }
        return { success: true };
      },
      async getAllFlights() {
        return [{ id: 'fl-1', siteName: 'Test Flight' }];
      }
    };
  });

  it('should render accessible markup with dropzone, browse CTA and compatibility details', () => {
    const html = renderImportSheetHtml();

    assert.ok(html.includes('gm-import-sheet-content'), 'Must render content container');
    assert.ok(html.includes('gm-import-sheet-dropzone'), 'Must render drag & drop area');
    assert.ok(html.includes('gm-import-compat-card'), 'Must render formats compatibility guide');
    assert.ok(html.includes('Tracce FAI IGC'), 'Must mention FAI IGC support');
    assert.ok(html.includes('Backup ParaMeteo'), 'Must mention ParaMeteo backup support');
    assert.ok(html.includes('gm-import-progress-section'), 'Must render progress elements');
    assert.ok(html.includes('gm-import-summary-wrap'), 'Must render outcome summary container');

    // Fitts's law touch targets floor
    assert.ok(html.includes('--gm-touch-min, 48px'));

    // Banned emojis check
    const banned = ['📈', '🎙️', '⏱️', 'ℹ️', '🚀', '✨', '🔥', '🎉'];
    for (const emoji of banned) {
      assert.ok(!html.includes(emoji), `ImportSheet must not contain banned emoji "${emoji}"`);
    }
  });

  it('should process IGC and ParaMeteo files and trigger onSuccess callback with stats', async () => {
    const mockFiles = [
      {
        name: 'volo_cornizzolo.igc',
        async text() {
          return 'AXCT001\nB1200004550000N00915000EA0140001400\n';
        }
      },
      {
        name: 'parameteo_backup.json',
        async text() {
          return JSON.stringify({ app: 'ParaMeteo', version: 2, database: { flights: [] } });
        }
      }
    ];

    let callbackCalled = false;
    let callbackResult = null;

    await processImportFiles(mockFiles, {
      manager: mockLogbookManager,
      storeInstance: mockStore,
      onSuccess: (res) => {
        callbackCalled = true;
        callbackResult = res;
      }
    });

    assert.ok(callbackCalled, 'Must invoke onSuccess callback');
    assert.equal(callbackResult.importedFlightsCount, 6, 'Total imported flights must equal 1 IGC + 5 ParaMeteo');
    assert.equal(callbackResult.tracksImportedCount, 3);

    // Verify store was refreshed
    const state = mockStore.getState();
    assert.equal(state.flights.length, 1);
  });
});
