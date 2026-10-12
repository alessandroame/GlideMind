import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { LogbookViewController } from '../../ui/views/LogbookView.js';
import { openFlightDetailSheet, closeFlightDetailView } from '../../ui/views/FlightDetailSheet.js';
import { createStore, createInMemoryStorageAdapter } from '../../core/store.js';
import { createMemoryDbAdapter, logbookManager } from '../../core/logbookDb.js';
import { DEFAULT_SEED_FLIGHTS } from '../../core/logbook.js';

// Void HTML elements that self-close without explicit closing tag
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
  'line', 'polyline', 'polygon', 'circle', 'path'
]);

/**
 * Lightweight headless DOM Element mock supporting querySelector, closest,
 * event bubbling, and attributes for realistic UI interaction tests.
 */
class MockElement {
  constructor(tagName = 'div', attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.id = attributes.id || '';
    this.children = [];
    this.parentElement = null;
    this.parentNode = null;
    this.style = { overflow: '' };
    this._value = attributes.value !== undefined ? String(attributes.value) : null;
    this.disabled = Boolean(attributes.disabled);
    this._textContent = '';
    this.eventListeners = new Map();
    this.classList = new Set(
      attributes.class ? attributes.class.trim().split(/\s+/).filter(Boolean) : []
    );
  }

  get value() {
    if (this._value !== null) return this._value;
    if (this.tagName === 'TEXTAREA') return this.textContent;
    return '';
  }

  set value(val) {
    this._value = String(val);
  }

  get textContent() {
    if (this.children.length === 0) return this._textContent;
    return this.children.map((c) => c.textContent).join('');
  }

  set textContent(val) {
    this._textContent = String(val);
    this.children = [];
  }

  get firstElementChild() {
    return this.children[0] || null;
  }

  get innerHTML() {
    return this.children.map((c) => c.outerHTML || c.textContent).join('');
  }

  set innerHTML(htmlStr) {
    this.children = [];
    this._textContent = '';
    if (!htmlStr || typeof htmlStr !== 'string') return;
    const parsedNodes = parseHtmlToMockElements(htmlStr);
    for (const node of parsedNodes) {
      this.appendChild(node);
    }
  }

  get outerHTML() {
    const attrs = Object.entries(this.attributes)
      .map(([k, v]) => ` ${k}="${String(v).replace(/"/g, '&quot;')}"`)
      .join('');
    const tag = this.tagName.toLowerCase();
    if (VOID_TAGS.has(tag)) return `<${tag}${attrs} />`;
    return `<${tag}${attrs}>${this.innerHTML || this._textContent}</${tag}>`;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
    if (name === 'id') this.id = String(val);
    if (name === 'class') {
      this.classList = new Set(String(val).trim().split(/\s+/).filter(Boolean));
    }
  }

  hasAttribute(name) {
    return name in this.attributes;
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'id') this.id = '';
    if (name === 'class') this.classList.clear();
  }

  appendChild(child) {
    if (!child) return;
    child.parentElement = this;
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
      child.parentNode = null;
      return child;
    }
    return null;
  }

  addEventListener(type, fn, options = {}) {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type).add(fn);
  }

  removeEventListener(type, fn) {
    if (this.eventListeners.has(type)) {
      this.eventListeners.get(type).delete(fn);
    }
  }

  dispatchEvent(event) {
    const type = event.type || event;
    event.target = this;
    if (this.eventListeners.has(type)) {
      for (const listener of this.eventListeners.get(type)) {
        listener.call(this, event);
      }
    }
    // Bubble up to parent if bubbles is true
    if (event.bubbles && this.parentElement) {
      this.parentElement.dispatchEvent(event);
    }
  }

  focus() {
    if (typeof globalThis.document !== 'undefined') {
      globalThis.document.activeElement = this;
    }
  }

  matches(selector) {
    return matchesSelector(this, selector);
  }

  closest(selector) {
    let cur = this;
    while (cur && cur instanceof MockElement) {
      if (cur.matches(selector)) return cur;
      cur = cur.parentElement || cur.parentNode;
    }
    return null;
  }

  querySelector(selector) {
    const results = this.querySelectorAll(selector);
    return results.length > 0 ? results[0] : null;
  }

  querySelectorAll(selector) {
    const matched = [];
    const parts = selector.trim().split(/\s+/);

    const checkNode = (node, partIdx) => {
      const currentSelector = parts[partIdx];
      const isMatch = matchesSelector(node, currentSelector);

      if (isMatch) {
        if (partIdx === parts.length - 1) {
          matched.push(node);
        } else {
          for (const child of node.children) {
            checkNode(child, partIdx + 1);
          }
          return;
        }
      }

      for (const child of node.children) {
        checkNode(child, partIdx);
      }
    };

    for (const child of this.children) {
      checkNode(child, 0);
    }

    return matched;
  }
}

/**
 * Checks if a mock element matches a simple CSS selector (#id, .class, [attr], [attr=val], or tagName).
 */
function matchesSelector(el, selector) {
  if (!el || !(el instanceof MockElement)) return false;
  selector = selector.trim();

  // ID selector #foo
  if (selector.startsWith('#')) {
    return el.id === selector.slice(1) || el.attributes.id === selector.slice(1);
  }

  // Class selector .bar
  if (selector.startsWith('.')) {
    return el.classList.has(selector.slice(1));
  }

  // Attribute selector [attr=val] or [attr]
  if (selector.startsWith('[') && selector.endsWith(']')) {
    const inner = selector.slice(1, -1);
    if (inner.includes('=')) {
      const [attrName, rawVal] = inner.split('=');
      const expectedVal = rawVal.replace(/^['"]|['"]$/g, '');
      return el.getAttribute(attrName.trim()) === expectedVal;
    }
    return el.hasAttribute(inner.trim());
  }

  // Tag name
  return el.tagName === selector.toUpperCase();
}

/**
 * Parses an HTML snippet into a tree of MockElements.
 */
function parseHtmlToMockElements(html) {
  const rootNodes = [];
  const stack = [];

  const tokenRegex = /<!--[\s\S]*?-->|<([^>]+)>|([^<]+)/g;
  let match;

  while ((match = tokenRegex.exec(html)) !== null) {
    const [fullMatch, tagContent, textContent] = match;

    if (fullMatch.startsWith('<!--')) {
      continue; // Skip comments
    }

    if (textContent) {
      if (stack.length > 0) {
        stack[stack.length - 1]._textContent += textContent;
      }
      continue;
    }

    if (tagContent) {
      const trimmedTag = tagContent.trim();
      if (trimmedTag.startsWith('/')) {
        // Closing tag
        const closingTagName = trimmedTag.slice(1).trim().split(/\s+/)[0].toLowerCase();
        if (stack.length > 0 && stack[stack.length - 1].tagName.toLowerCase() === closingTagName) {
          stack.pop();
        }
      } else {
        // Opening or self-closing tag
        const isSelfClosing = trimmedTag.endsWith('/');
        const tagBody = isSelfClosing ? trimmedTag.slice(0, -1).trim() : trimmedTag;
        const firstSpace = tagBody.search(/\s/);
        const tagName = firstSpace === -1 ? tagBody : tagBody.slice(0, firstSpace);
        const attrString = firstSpace === -1 ? '' : tagBody.slice(firstSpace).trim();

        const attributes = {};
        if (attrString) {
          const attrRegex = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
          let attrMatch;
          while ((attrMatch = attrRegex.exec(attrString)) !== null) {
            const name = attrMatch[1];
            const val = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
            attributes[name] = val;
          }
        }

        const element = new MockElement(tagName, attributes);

        if (stack.length > 0) {
          stack[stack.length - 1].appendChild(element);
        } else {
          rootNodes.push(element);
        }

        const isVoid = VOID_TAGS.has(tagName.toLowerCase()) || isSelfClosing;
        if (!isVoid) {
          stack.push(element);
        }
      }
    }
  }

  return rootNodes;
}

describe('LogbookView to FlightDetailSheet Interaction (Headless Integration)', () => {
  let originalDocument;
  let originalWindow;
  let mockDocument;
  let mockWindow;
  let storeInstance;
  let controller;
  let logbookContainer;

  beforeEach(async () => {
    // Save original globals
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;

    // Build mock document and window
    const bodyEl = new MockElement('body');
    const windowListeners = new Map();

    mockDocument = {
      body: bodyEl,
      activeElement: null,
      createElement(tag) {
        return new MockElement(tag);
      },
      getElementById(id) {
        return bodyEl.querySelector(`#${id}`);
      },
      querySelector(sel) {
        return bodyEl.querySelector(sel);
      },
      querySelectorAll(sel) {
        return bodyEl.querySelectorAll(sel);
      }
    };

    mockWindow = {
      location: { hash: '' },
      addEventListener(event, fn, opts) {
        if (!windowListeners.has(event)) windowListeners.set(event, new Set());
        windowListeners.get(event).add(fn);
      },
      removeEventListener(event, fn) {
        if (windowListeners.has(event)) windowListeners.get(event).delete(fn);
      },
      dispatchEvent(event) {
        const type = event.type || event;
        if (windowListeners.has(type)) {
          for (const fn of windowListeners.get(type)) {
            fn(event);
          }
        }
      }
    };

    globalThis.document = mockDocument;
    globalThis.window = mockWindow;

    // Reset logbookManager with clean in-memory adapter
    logbookManager.setAdapter(createMemoryDbAdapter());
    await logbookManager.clearAll();

    // Initialize reactive store with realistic DEFAULT_SEED_FLIGHTS (e.g. fl-1 Monte Cornizzolo)
    storeInstance = createStore(
      { flights: [...DEFAULT_SEED_FLIGHTS] },
      createInMemoryStorageAdapter()
    );

    controller = new LogbookViewController({
      store: storeInstance,
      logbookManager
    });

    logbookContainer = new MockElement('div', { id: 'logbook-view-mount' });
    mockDocument.body.appendChild(logbookContainer);
  });

  afterEach(() => {
    closeFlightDetailView();
    if (controller) controller.unmount();
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  });

  it('should render flight list with seed flights from store and have interactive flight card attributes', async () => {
    await controller.mount(logbookContainer);

    const flightCards = logbookContainer.querySelectorAll('.gm-flight-card-compact');
    assert.ok(flightCards.length >= 1, 'Must render at least one flight card from DEFAULT_SEED_FLIGHTS');

    const firstCard = flightCards[0];
    assert.equal(firstCard.getAttribute('data-action'), 'open-flight-detail');
    assert.equal(firstCard.getAttribute('data-flight-id'), 'fl-1');
    assert.equal(firstCard.getAttribute('tabindex'), '0');

    // Title should be Monte Cornizzolo
    const titleEl = firstCard.querySelector('.gm-flight-site-title');
    assert.ok(titleEl, 'Card must have title element');
    assert.ok(titleEl.textContent.includes('Monte Cornizzolo'));
  });

  it('should open full-screen FlightDetailSheet when tapping directly on a seed flight card (fl-1)', async () => {
    await controller.mount(logbookContainer);

    const flightCard = logbookContainer.querySelector('[data-flight-id="fl-1"]');
    assert.ok(flightCard, 'Flight card for fl-1 must exist');

    // Verify detail overlay is not open yet
    assert.equal(mockDocument.getElementById('flight-detail-overlay'), null);
    assert.equal(mockDocument.body.style.overflow, '');

    // Simulate click event on card
    const clickEvent = {
      type: 'click',
      target: flightCard,
      bubbles: true,
      stopPropagation() {},
      preventDefault() {}
    };

    await controller.handleClick(clickEvent);

    // Verify detail sheet is mounted in body with id="flight-detail-overlay"
    const overlay = mockDocument.getElementById('flight-detail-overlay');
    assert.ok(overlay, 'FlightDetailSheet must be mounted in document.body');
    assert.equal(overlay.getAttribute('data-flight-id'), 'fl-1');
    assert.equal(mockDocument.body.style.overflow, 'hidden', 'Body scroll must be locked');

    // Verify flight information is presented in full detail
    const titleText = overlay.querySelector('#gm-flight-detail-title-text');
    assert.ok(titleText && titleText.textContent.includes('Monte Cornizzolo'));

    // Verify altimetric SVG chart was synthesized and rendered
    const svgChart = overlay.querySelector('svg');
    assert.ok(svgChart, 'Must render altimetric SVG chart');

    // Verify educational debriefing of Instructor Guido
    const debrief = overlay.querySelector('#gm-debrief-content');
    assert.ok(debrief, 'Must render Instructor Guido debriefing');

    // Verify pilot notes textarea is pre-filled with notes from seed flight
    const notesInput = overlay.querySelector('#gm-flight-notes-input');
    assert.ok(notesInput, 'Must have personal notes textarea');
    assert.ok(notesInput.value.includes('Corno Birone') || notesInput.value.includes('1420m'));
  });

  it('should open FlightDetailSheet when tapping on child elements inside the flight card (event bubbling & closest)', async () => {
    await controller.mount(logbookContainer);

    const flightCard = logbookContainer.querySelector('[data-flight-id="fl-1"]');
    assert.ok(flightCard);

    // Pick child elements: title and metric span
    const titleEl = flightCard.querySelector('.gm-flight-site-title');
    const metricVal = flightCard.querySelector('.gm-flight-metric-val');
    assert.ok(titleEl && metricVal);

    // Tap on metric span inside card
    const childClickEvent = {
      type: 'click',
      target: metricVal,
      bubbles: true,
      stopPropagation() {},
      preventDefault() {}
    };

    await controller.handleClick(childClickEvent);

    const overlay = mockDocument.getElementById('flight-detail-overlay');
    assert.ok(overlay, 'FlightDetailSheet must open when tapping inner child element of card');
    assert.equal(overlay.getAttribute('data-flight-id'), 'fl-1');
  });

  it('should NOT open FlightDetailSheet when tapping the delete button on the card', async () => {
    await controller.mount(logbookContainer);

    const flightCard = logbookContainer.querySelector('[data-flight-id="fl-1"]');
    const deleteBtn = flightCard.querySelector('[data-action="delete-flight"]');
    assert.ok(deleteBtn);

    let stopPropagationCalled = false;
    const deleteClickEvent = {
      type: 'click',
      target: deleteBtn,
      bubbles: true,
      stopPropagation() { stopPropagationCalled = true; },
      preventDefault() {}
    };

    await controller.handleClick(deleteClickEvent);

    // Detail overlay must NOT open
    assert.equal(mockDocument.getElementById('flight-detail-overlay'), null);
    assert.equal(stopPropagationCalled, true);

    // Undo banner must appear
    const undoBanner = logbookContainer.querySelector('.gm-logbook-undo-banner');
    assert.ok(undoBanner, 'Undo banner should be active instead of detail overlay');
  });

  it('should open FlightDetailSheet on keyboard Enter and Space (WCAG 2.1 AA)', async () => {
    await controller.mount(logbookContainer);

    const flightCard = logbookContainer.querySelector('[data-flight-id="fl-1"]');
    assert.ok(flightCard);

    // 1. Enter key
    let preventedDefault = false;
    await controller.handleKeyDown({
      key: 'Enter',
      target: flightCard,
      preventDefault() { preventedDefault = true; }
    });

    assert.equal(preventedDefault, true);
    let overlay = mockDocument.getElementById('flight-detail-overlay');
    assert.ok(overlay, 'Detail overlay must open on Enter key');

    // Close overlay
    closeFlightDetailView();
    assert.equal(mockDocument.getElementById('flight-detail-overlay'), null);

    // 2. Space key
    preventedDefault = false;
    await controller.handleKeyDown({
      key: ' ',
      target: flightCard,
      preventDefault() { preventedDefault = true; }
    });

    assert.equal(preventedDefault, true);
    overlay = mockDocument.getElementById('flight-detail-overlay');
    assert.ok(overlay, 'Detail overlay must open on Space key');
  });

  it('should close FlightDetailSheet and restore body scroll when tapping Back button', async () => {
    await controller.mount(logbookContainer);

    await controller.handleOpenFlightDetail('fl-1');

    const overlay = mockDocument.getElementById('flight-detail-overlay');
    assert.ok(overlay);
    assert.equal(mockDocument.body.style.overflow, 'hidden');

    const backBtn = overlay.querySelector('#btn-flight-detail-back');
    assert.ok(backBtn, 'Must render back navigation button');

    // Tap back button
    backBtn.dispatchEvent({ type: 'click' });

    // Overlay removed from DOM and scroll restored
    assert.equal(mockDocument.getElementById('flight-detail-overlay'), null);
    assert.equal(mockDocument.body.style.overflow, '');
  });

  it('should close FlightDetailSheet on Escape key', async () => {
    await controller.mount(logbookContainer);

    await controller.handleOpenFlightDetail('fl-1');
    assert.ok(mockDocument.getElementById('flight-detail-overlay'));

    // Trigger window keydown Escape
    let preventedDefault = false;
    mockWindow.dispatchEvent({
      type: 'keydown',
      key: 'Escape',
      preventDefault() { preventedDefault = true; }
    });

    assert.equal(preventedDefault, true);
    assert.equal(mockDocument.getElementById('flight-detail-overlay'), null);
    assert.equal(mockDocument.body.style.overflow, '');
  });

  it('should navigate to 3D replay and set store state when tapping Replay 3D button in detail sheet', async () => {
    await controller.mount(logbookContainer);

    await controller.handleOpenFlightDetail('fl-1');
    const overlay = mockDocument.getElementById('flight-detail-overlay');
    assert.ok(overlay);

    const replayBtn = overlay.querySelector('#btn-replay-from-detail');
    assert.ok(replayBtn, 'Must render Replay 3D CTA button');

    replayBtn.dispatchEvent({ type: 'click' });

    // Overlay should close and hash should update to replay view with flightId
    assert.equal(mockDocument.getElementById('flight-detail-overlay'), null);
    assert.equal(storeInstance.getState().activeReplayFlightId, 'fl-1');
    assert.equal(mockWindow.location.hash, '#replay?flightId=fl-1');
  });

  it('should open detail sheet with IndexedDB track data when flight is saved in database', async () => {
    // Save a custom flight into IndexedDB adapter
    const dbFlightMeta = {
      id: 'flight_custom_db_1',
      siteName: 'Col Rodella',
      site: 'Val di Fassa (TN)',
      date: '2026-10-09',
      durationMinutes: 52,
      glider: 'Nova Ion 6',
      gliderClass: 'EN-B',
      maxAltMsl: 2480,
      maxGainMeters: 560,
      maxClimbRate: 3.8,
      notes: 'Super termica nel canalone.'
    };
    const dbFlightRaw = {
      id: 'flight_custom_db_1',
      decimatedPoints: [
        { timeSeconds: 0, alt: 1450, lat: 46.49, lon: 11.75 },
        { timeSeconds: 1500, alt: 2480, lat: 46.50, lon: 11.76 },
        { timeSeconds: 3120, alt: 1440, lat: 46.48, lon: 11.74 }
      ]
    };
    await logbookManager.saveFlight(dbFlightMeta, dbFlightRaw);

    // Update store with this flight too
    storeInstance.setState({ flights: [dbFlightMeta, ...DEFAULT_SEED_FLIGHTS] });

    await controller.mount(logbookContainer);

    const dbCard = logbookContainer.querySelector('[data-flight-id="flight_custom_db_1"]');
    assert.ok(dbCard, 'Card for DB flight must exist');

    await controller.handleClick({
      type: 'click',
      target: dbCard,
      bubbles: true,
      stopPropagation() {},
      preventDefault() {}
    });

    const overlay = mockDocument.getElementById('flight-detail-overlay');
    assert.ok(overlay, 'Flight detail overlay must open for DB flight');
    assert.equal(overlay.getAttribute('data-flight-id'), 'flight_custom_db_1');

    const titleText = overlay.querySelector('#gm-flight-detail-title-text');
    assert.ok(titleText && titleText.textContent.includes('Col Rodella'));
  });

  it('should open FlightDetailSheet when clicking a personal record card in the Stats tab', async () => {
    await controller.mount(logbookContainer);

    // Switch to stats tab
    const statsTabBtn = logbookContainer.querySelector('[data-tab="stats"]');
    assert.ok(statsTabBtn, 'Stats tab button must exist');
    await controller.handleClick({
      type: 'click',
      target: statsTabBtn,
      bubbles: true,
      stopPropagation() {},
      preventDefault() {}
    });

    // Check that personal record cards are rendered with open-flight-detail action and flight numbers
    const recordCard = logbookContainer.querySelector('.gm-stats-record-clickable');
    assert.ok(recordCard, 'At least one clickable personal record card must exist in Stats tab');
    assert.strictEqual(recordCard.getAttribute('data-action'), 'open-flight-detail');
    assert.strictEqual(recordCard.getAttribute('role'), 'button');
    assert.strictEqual(recordCard.getAttribute('tabindex'), '0');

    const flightId = recordCard.getAttribute('data-flight-id');
    assert.ok(flightId, 'Record card must have data-flight-id attribute');

    const badge = recordCard.querySelector('.gm-flight-number-badge');
    assert.ok(badge, 'Record card must display flight number badge');

    // Click the personal record card
    await controller.handleClick({
      type: 'click',
      target: recordCard,
      bubbles: true,
      stopPropagation() {},
      preventDefault() {}
    });

    // Flight detail overlay must open for the corresponding flight
    const overlay = mockDocument.getElementById('flight-detail-overlay');
    assert.ok(overlay, 'Flight detail overlay must open when clicking personal record card');
    assert.strictEqual(overlay.getAttribute('data-flight-id'), flightId);

    // Keyboard navigation (Enter / Space) on record card
    closeFlightDetailView();
    assert.strictEqual(mockDocument.getElementById('flight-detail-overlay'), null);

    let preventedDefault = false;
    await controller.handleKeyDown({
      key: 'Enter',
      target: recordCard,
      preventDefault() { preventedDefault = true; }
    });
    assert.strictEqual(preventedDefault, true);
    assert.ok(mockDocument.getElementById('flight-detail-overlay'), 'Flight detail must open on Enter key from record card');
  });
});
