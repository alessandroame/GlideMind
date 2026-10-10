/**
 * GlideMind - Application Entry Point & Bootstrap
 * Orchestrates Store, Router, and SheetManager upon DOM readiness.
 */

import { store, createLocalStorageAdapter } from '../core/store.js';
import { router } from './router.js';
import { initSheetManager } from './sheetManager.js';
import { homeDashboardView } from './views/HomeDashboardView.js';
import { forecastView } from './views/ForecastView.js';
import { spotMapView } from './views/SpotMapView.js';
import { settingsView } from './views/SettingsView.js';
import { normalizeLocationsCatalog, DEFAULT_COMPRENSORI } from '../core/comprensorio.js';
import { APP_VERSION, APP_BUILD } from '../core/version.js';

// Mount browser localStorage adapter in UI shell to ensure cross-session persistence across page reloads
if (typeof window !== 'undefined' && window.localStorage && typeof store.setStorageAdapter === 'function') {
  store.setStorageAdapter(createLocalStorageAdapter(window.localStorage));
  store.loadPersistedState();
}

/**
 * Loads the master real locations catalog from /data/locations.json.
 * Falls back safely to DEFAULT_COMPRENSORI in offline or test environments.
 * @returns {Promise<Array<object>>}
 */
export async function loadLocationsCatalog() {
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    try {
      const response = await window.fetch('./data/locations.json');
      if (response.ok) {
        const rawJson = await response.json();
        const normalized = normalizeLocationsCatalog(rawJson);
        if (Array.isArray(normalized) && normalized.length > 0) {
          store.setState({ locationsCatalog: normalized });
          if (typeof homeDashboardView.setComprensoriCatalog === 'function') {
            homeDashboardView.setComprensoriCatalog(normalized);
          }
          if (typeof forecastView.setComprensoriCatalog === 'function') {
            forecastView.setComprensoriCatalog(normalized);
          }
          if (typeof spotMapView.setComprensoriCatalog === 'function') {
            spotMapView.setComprensoriCatalog(normalized);
          }
          return normalized;
        }
      }
    } catch (err) {
      console.warn('[GlideMind] Impossibile caricare /data/locations.json, fallback a DEFAULT_COMPRENSORI:', err);
    }
  }
  return DEFAULT_COMPRENSORI;
}

/**
 * Applies the visual theme (dark, light, or auto) to the root document.
 * @param {string} [theme='dark']
 */
export function applyTheme(theme = 'dark') {
  if (typeof document === 'undefined') return;
  let effectiveTheme = theme;
  if (theme === 'auto') {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } else {
      effectiveTheme = 'dark';
    }
  }
  const validTheme = effectiveTheme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', validTheme);
  document.documentElement.setAttribute('data-theme-mode', theme);
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', validTheme === 'light' ? '#f8fafc' : '#0b0d12');
  }
}

/**
 * Initializes the GlideMind client application shell.
 */
export function bootstrapApp() {
  // Ensure browser localStorage adapter is mounted in UI shell
  if (typeof window !== 'undefined' && window.localStorage && typeof store.setStorageAdapter === 'function') {
    store.setStorageAdapter(createLocalStorageAdapter(window.localStorage));
  }

  // Load persisted user preferences, cached spots, and active mapLayer
  store.loadPersistedState();

  // Synchronize visual theme
  const currentTheme = (store.getState().ui && store.getState().ui.theme) || 'dark';
  applyTheme(currentTheme);

  // Setup auto theme system preference listener
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const handleSystemThemeChange = () => {
      const activeThemeMode = (store.getState().ui && store.getState().ui.theme) || 'dark';
      if (activeThemeMode === 'auto') {
        applyTheme('auto');
      }
    };
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handleSystemThemeChange);
    } else if (typeof mql.addListener === 'function') {
      mql.addListener(handleSystemThemeChange);
    }
  }

  if (typeof store.subscribeSlice === 'function') {
    store.subscribeSlice('ui', (uiState) => {
      if (uiState && uiState.theme) {
        applyTheme(uiState.theme);
      }
    });
  }

  // Register view controllers
  router.registerView('home', homeDashboardView);
  router.registerView('forecast', forecastView);
  router.registerView('map', spotMapView);
  router.registerView('settings', settingsView);

  // Initialize sheet manager
  initSheetManager();

  // Initialize router
  router.init();

  // Asynchronously load real master locations catalog in background
  loadLocationsCatalog();

  // Dismiss splash screen within Doherty threshold (<400ms)
  dismissSplashScreen();

  // Expose global debug interface for automated tests and dev inspection
  if (typeof window !== 'undefined') {
    window.__GLIDEMIND__ = {
      store,
      router,
      loadLocationsCatalog,
      applyTheme,
      version: APP_VERSION,
      build: APP_BUILD
    };
  }
}

/**
 * Dismisses the initial zero-FOUC splash screen with a smooth transition
 * keeping time-to-interactive strictly within the Doherty threshold (<400ms).
 */
export function dismissSplashScreen() {
  if (typeof document === 'undefined') return;
  const splash = document.getElementById('gm-splash-screen');
  if (!splash) return;

  splash.classList.add('gm-splash-hidden');
  setTimeout(() => {
    if (splash && splash.parentNode) {
      splash.parentNode.removeChild(splash);
    }
  }, 350);
}

// Auto-bootstrap when document is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapApp);
  } else {
    bootstrapApp();
  }
}
