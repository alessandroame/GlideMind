/**
 * GlideMind - Centralized Sheet & Drawer Manager (UI Layer)
 * Manages contextual drawers, inspector sheets, and full-height overlays.
 * Enforces zero nested modals, focus restoration, backdrop tap, and Escape key dismissal.
 */

import { store } from '../core/store.js';

let containerEl = null;
let backdropEl = null;
let sheetEl = null;
let titleEl = null;
let contentEl = null;
let closeBtnEl = null;

let currentSheetConfig = null;
let previousActiveElement = null;
let activeStore = store;

/**
 * Initializes the SheetManager binding to the DOM container.
 * @param {HTMLElement} [container] - The `#sheet-container` element.
 * @param {typeof store} [customStore] - Optional injected store instance.
 */
export function initSheetManager(container = null, customStore = null) {
  if (customStore) {
    activeStore = customStore;
  }

  containerEl = container || (typeof document !== 'undefined' ? document.getElementById('sheet-container') : null);
  if (!containerEl) {
    return;
  }

  backdropEl = containerEl.querySelector('#sheet-backdrop');
  sheetEl = containerEl.querySelector('.gm-sheet');
  titleEl = containerEl.querySelector('.gm-sheet-title');
  contentEl = containerEl.querySelector('.gm-sheet-content');
  closeBtnEl = containerEl.querySelector('.gm-sheet-close-btn');

  // Backdrop tap dismissal
  if (backdropEl) {
    backdropEl.addEventListener('click', () => {
      closeSheet();
    });
  }

  // Close button tap dismissal
  if (closeBtnEl) {
    closeBtnEl.addEventListener('click', () => {
      closeSheet();
    });
  }

  // Escape key listener
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isSheetOpen()) {
        e.preventDefault();
        closeSheet();
      }
    });
  }
}

/**
 * Opens a modal sheet. Automatically closes any active sheet first (zero nested modals).
 * @param {Object} options
 * @param {string} [options.id] - Identifier for sheet state tracking.
 * @param {string} options.title - Header title.
 * @param {string|HTMLElement} options.content - HTML string or DOM node for the content body.
 * @param {() => void} [options.onOpen] - Callback invoked when opened.
 * @param {() => void} [options.onClose] - Callback invoked when closed.
 */
export function openSheet({ id = 'default', title, content, onOpen = null, onClose = null }) {
  if (!containerEl) {
    initSheetManager();
  }
  if (!containerEl || !sheetEl) {
    return;
  }

  // If a sheet is already open, cleanly close it first (Single Active Sheet Policy)
  if (isSheetOpen()) {
    closeSheet(true);
  }

  // Remember active element for focus restoration
  if (typeof document !== 'undefined') {
    previousActiveElement = document.activeElement;
  }

  currentSheetConfig = { id, title, content, onOpen, onClose };

  if (titleEl) {
    titleEl.textContent = title || '';
  }

  if (contentEl) {
    if (typeof content === 'string') {
      contentEl.innerHTML = content;
    } else if (content instanceof Node) {
      contentEl.innerHTML = '';
      contentEl.appendChild(content);
    }
  }

  containerEl.classList.add('active');
  containerEl.setAttribute('aria-hidden', 'false');

  if (activeStore && typeof activeStore.setState === 'function') {
    const uiState = activeStore.getState().ui || {};
    activeStore.setState({
      ui: { ...uiState, activeSheet: id }
    });
  }

  // Set focus to close button or title for accessibility
  if (closeBtnEl) {
    closeBtnEl.focus();
  }

  if (typeof onOpen === 'function') {
    try {
      onOpen();
    } catch (err) {
      console.error('[GlideMind SheetManager] onOpen error:', err);
    }
  }
}

/**
 * Closes the currently active sheet.
 * @param {boolean} [isReplacing=false] - If true, indicates an immediate replacement sheet will follow.
 */
export function closeSheet(isReplacing = false) {
  if (!containerEl || !containerEl.classList.contains('active')) {
    return;
  }

  const prevConfig = currentSheetConfig;
  currentSheetConfig = null;

  containerEl.classList.remove('active');
  containerEl.setAttribute('aria-hidden', 'true');

  if (!isReplacing && activeStore && typeof activeStore.setState === 'function') {
    const uiState = activeStore.getState().ui || {};
    activeStore.setState({
      ui: { ...uiState, activeSheet: null }
    });
  }

  // Clear content after animation
  if (contentEl && !isReplacing) {
    setTimeout(() => {
      if (!isSheetOpen() && contentEl) {
        contentEl.innerHTML = '';
      }
    }, 300);
  }

  // Restore previous focus
  if (!isReplacing && previousActiveElement && typeof previousActiveElement.focus === 'function') {
    try {
      previousActiveElement.focus();
    } catch {
      // Ignore focus restoration errors
    }
    previousActiveElement = null;
  }

  if (prevConfig && typeof prevConfig.onClose === 'function') {
    try {
      prevConfig.onClose();
    } catch (err) {
      console.error('[GlideMind SheetManager] onClose error:', err);
    }
  }
}

/**
 * Checks if a sheet is currently open.
 * @returns {boolean}
 */
export function isSheetOpen() {
  return containerEl ? containerEl.classList.contains('active') : false;
}

/**
 * Returns the active sheet metadata.
 * @returns {Object|null}
 */
export function getActiveSheet() {
  return currentSheetConfig;
}
