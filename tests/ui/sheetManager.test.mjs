import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initSheetManager, openSheet, closeSheet, isSheetOpen, getActiveSheet } from '../../ui/sheetManager.js';
import { createStore } from '../../core/store.js';

describe('GlideMind SheetManager - Accessibility & Overlay Lifecycle', () => {
  let mockContainer;
  let mockBackdrop;
  let mockSheet;
  let mockTitle;
  let mockContent;
  let mockCloseBtn;
  let attributes;
  let classList;
  let children;

  beforeEach(() => {
    attributes = {};
    classList = new Set();
    children = [];

    mockBackdrop = {
      addEventListener: () => {}
    };
    mockSheet = {
      addEventListener: () => {},
      setAttribute: (k, v) => { attributes[k] = v; }
    };
    mockTitle = {
      textContent: ''
    };
    mockContent = {
      innerHTML: '',
      appendChild: (node) => children.push(node)
    };
    mockCloseBtn = {
      addEventListener: () => {},
      focus: () => {}
    };

    mockContainer = {
      inert: false,
      classList: {
        add: (c) => classList.add(c),
        remove: (c) => classList.delete(c),
        contains: (c) => classList.has(c)
      },
      setAttribute: (k, v) => { attributes[k] = v; },
      removeAttribute: (k) => { delete attributes[k]; },
      getAttribute: (k) => attributes[k],
      querySelector: (sel) => {
        if (sel === '#sheet-backdrop') return mockBackdrop;
        if (sel === '.gm-sheet') return mockSheet;
        if (sel === '.gm-sheet-title') return mockTitle;
        if (sel === '.gm-sheet-content') return mockContent;
        if (sel === '.gm-sheet-close-btn') return mockCloseBtn;
        return null;
      },
      contains: (node) => children.includes(node)
    };
  });

  it('should initialize closed sheet container with aria-hidden="true" and inert attribute', () => {
    initSheetManager(mockContainer);
    assert.equal(mockContainer.getAttribute('aria-hidden'), 'true');
    assert.equal(mockContainer.getAttribute('inert'), '');
    assert.equal(mockContainer.inert, true);
  });

  it('should open sheet, update aria-hidden to "false", remove inert, and sync store', () => {
    const store = createStore();
    initSheetManager(mockContainer, store);

    openSheet({
      id: 'glider-selector',
      title: 'Seleziona Vela',
      content: '<p>Contenuto</p>'
    });

    assert.equal(isSheetOpen(), true);
    assert.equal(mockContainer.getAttribute('aria-hidden'), 'false');
    assert.equal(mockContainer.getAttribute('inert'), undefined);
    assert.equal(mockContainer.inert, false);
    assert.equal(mockTitle.textContent, 'Seleziona Vela');
    assert.equal(store.getState().ui.activeSheet, 'glider-selector');
    assert.equal(getActiveSheet().id, 'glider-selector');
  });

  it('should blur descendant element inside sheet before setting aria-hidden="true" on close', () => {
    const store = createStore();
    initSheetManager(mockContainer, store);

    // Mock an active element inside the container
    let blurred = false;
    const focusedDescendant = {
      blur: () => { blurred = true; }
    };
    children.push(focusedDescendant);

    // Simulate browser global document.activeElement
    const originalDocument = globalThis.document;
    globalThis.document = {
      activeElement: focusedDescendant,
      body: {
        contains: () => true
      }
    };

    try {
      openSheet({ id: 'test', title: 'Test', content: 'hello' });
      assert.equal(isSheetOpen(), true);

      closeSheet();

      assert.equal(blurred, true, 'Focused descendant inside sheet must be blurred before applying aria-hidden');
      assert.equal(isSheetOpen(), false);
      assert.equal(mockContainer.getAttribute('aria-hidden'), 'true');
      assert.equal(mockContainer.getAttribute('inert'), '');
      assert.equal(mockContainer.inert, true);
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it('should restore focus to external trigger button on close if valid', () => {
    const store = createStore();
    initSheetManager(mockContainer, store);

    let restoredFocus = false;
    const externalTrigger = {
      focus: () => { restoredFocus = true; }
    };

    const originalDocument = globalThis.document;
    globalThis.document = {
      activeElement: externalTrigger,
      body: {
        contains: (node) => node === externalTrigger
      }
    };

    try {
      openSheet({ id: 'test-restore', title: 'Test Restore', content: 'test' });
      // Now close
      closeSheet();
      assert.equal(restoredFocus, true, 'Should restore focus to previousActiveElement outside container');
    } finally {
      globalThis.document = originalDocument;
    }
  });
});
