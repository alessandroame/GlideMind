import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadScriptOnce,
  isScriptLoaded,
  clearScriptLoaderCache
} from '../../ui/scriptLoader.js';

describe('Script Loader - Dynamic Library Ingestion', () => {

  beforeEach(() => {
    clearScriptLoaderCache();
  });

  it('should return null safely in Node.js when window or document is undefined', async () => {
    assert.equal(isScriptLoaded('https://unpkg.com/three@0.128.0/build/three.min.js'), false);
    const res = await loadScriptOnce('https://unpkg.com/three@0.128.0/build/three.min.js');
    assert.equal(res, null);
  });

  it('should load script, deduplicate concurrent requests, and resolve in browser environment', async () => {
    const appendedScripts = [];
    const mockDocument = {
      querySelector: (sel) => appendedScripts.find(s => `script[src="${s.src}"]` === sel) || null,
      head: {
        appendChild: (el) => {
          appendedScripts.push(el);
          // Simulate async load
          setTimeout(() => {
            if (globalThis.window) {
              globalThis.window.THREE = { version: 'r128' };
            }
            if (el.onload) el.onload();
          }, 5);
        }
      },
      createElement: (tag) => ({
        tagName: tag.toUpperCase(),
        src: '',
        async: false,
        onload: null,
        onerror: null,
        addEventListener: () => {}
      })
    };

    // Temporarily mount mock globals
    globalThis.window = {};
    globalThis.document = mockDocument;

    try {
      // First load
      const p1 = loadScriptOnce('https://cdn.example.com/three.js', 'THREE');
      // Concurrent load of same URL
      const p2 = loadScriptOnce('https://cdn.example.com/three.js', 'THREE');

      const [res1, res2] = await Promise.all([p1, p2]);
      assert.deepEqual(res1, { version: 'r128' });
      assert.deepEqual(res2, { version: 'r128' });

      // Should only have created 1 script tag
      assert.equal(appendedScripts.length, 1);
      assert.equal(isScriptLoaded('https://cdn.example.com/three.js'), true);
    } finally {
      delete globalThis.window;
      delete globalThis.document;
    }
  });

  it('should reject promise on script loading failure', async () => {
    const mockDocument = {
      querySelector: () => null,
      head: {
        appendChild: (el) => {
          setTimeout(() => {
            if (el.onerror) el.onerror(new Error('Network 404'));
          }, 5);
        }
      },
      createElement: (tag) => ({
        tagName: tag.toUpperCase(),
        src: '',
        onload: null,
        onerror: null
      })
    };

    globalThis.window = {};
    globalThis.document = mockDocument;

    try {
      await assert.rejects(async () => {
        await loadScriptOnce('https://cdn.example.com/missing.js');
      }, /Failed to load external script/);
    } finally {
      delete globalThis.window;
      delete globalThis.document;
    }
  });
});
