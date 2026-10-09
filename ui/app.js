/**
 * GlideMind - Application Entry Point & Bootstrap
 * Orchestrates Store, Router, and SheetManager upon DOM readiness.
 */

import { store } from '../core/store.js';
import { router } from './router.js';
import { initSheetManager } from './sheetManager.js';
import { homeDashboardView } from './views/HomeDashboardView.js';
import { forecastView } from './views/ForecastView.js';

/**
 * Initializes the GlideMind client application shell.
 */
export function bootstrapApp() {
  // Load persisted user preferences and cached spots
  store.loadPersistedState();

  // Register view controllers
  router.registerView('home', homeDashboardView);
  router.registerView('forecast', forecastView);

  // Initialize sheet manager
  initSheetManager();

  // Initialize router
  router.init();

  // Expose global debug interface for automated tests and dev inspection
  if (typeof window !== 'undefined') {
    window.__GLIDEMIND__ = {
      store,
      router,
      version: '2.0.0'
    };
  }
}

// Auto-bootstrap when document is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapApp);
  } else {
    bootstrapApp();
  }
}
