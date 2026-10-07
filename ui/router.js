/**
 * GlideMind - 5-Tab Navigation Router & View Lifecycle Manager (UI Layer)
 * Manages routes: home, forecast, map, logbook, settings.
 * Synchronizes with core/store.js, window hash, and responsive nav bars.
 * Enforces keyboard shortcuts with input guard.
 */

import { store } from '../core/store.js';

export const VALID_ROUTES = Object.freeze(['home', 'forecast', 'map', 'logbook', 'settings']);
export const DEFAULT_ROUTE = 'home';

export const KEYBOARD_SHORTCUTS = Object.freeze({
  h: 'home',
  f: 'forecast',
  m: 'map',
  l: 'logbook',
  s: 'settings'
});

/**
 * Normalizes an arbitrary hash string or path into a valid GlideMind route name.
 * @param {string|null|undefined} hash
 * @returns {typeof VALID_ROUTES[number]}
 */
export function normalizeRoute(hash) {
  if (!hash || typeof hash !== 'string') {
    return DEFAULT_ROUTE;
  }
  const clean = hash.replace(/^#\/?/, '').split('?')[0].toLowerCase().trim();
  return VALID_ROUTES.includes(clean) ? clean : DEFAULT_ROUTE;
}

/**
 * Checks whether an event target is an interactive input where shortcuts should be ignored.
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
export function isInputTarget(target) {
  if (!target || typeof target !== 'object') {
    return false;
  }
  const element = /** @type {HTMLElement} */ (target);
  if (element.isContentEditable) {
    return true;
  }
  const tagName = element.tagName ? element.tagName.toUpperCase() : '';
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }
  if (typeof element.getAttribute === 'function') {
    const role = element.getAttribute('role');
    if (role === 'textbox' || role === 'searchbox') {
      return true;
    }
  }
  return false;
}

/**
 * Creates a Router instance.
 * @param {Object} [options]
 * @param {HTMLElement|null} [options.container] - Mounting target container (#main-view).
 * @param {typeof store} [options.storeInstance] - Injected store.
 * @param {boolean} [options.listenToHash=true] - Whether to bind hashchange event on window.
 */
export function createRouter(options = {}) {
  const targetStore = options.storeInstance || store;
  let containerEl = options.container || null;
  const viewRegistry = new Map();
  let currentRoute = null;
  let currentMountedView = null;
  let isNavigating = false;

  /**
   * Registers a view controller for a specific route.
   * @param {string} route
   * @param {{ mount: (container: HTMLElement, params?: any) => void, unmount?: () => void }} viewController
   */
  function registerView(route, viewController) {
    if (!VALID_ROUTES.includes(route)) {
      throw new Error(`[GlideMind Router] Invalid route '${route}'. Valid routes: ${VALID_ROUTES.join(', ')}`);
    }
    viewRegistry.set(route, viewController);
  }

  /**
   * Updates visual active states in desktop header and mobile bottom tab bar.
   * @param {string} route
   */
  function updateNavUI(route) {
    if (typeof document === 'undefined') return;

    const navItems = document.querySelectorAll('[data-route], a[href^="#"]');
    navItems.forEach((el) => {
      const targetRoute = el.getAttribute('data-route') || el.getAttribute('href')?.replace(/^#\/?/, '');
      if (targetRoute === route) {
        el.classList.add('active');
        el.setAttribute('aria-current', 'page');
      } else if (VALID_ROUTES.includes(targetRoute)) {
        el.classList.remove('active');
        el.removeAttribute('aria-current');
      }
    });
  }

  /**
   * Navigates to a specific route.
   * @param {string} route
   * @param {Object} [params={}]
   */
  function navigate(route, params = {}) {
    const validRoute = normalizeRoute(route);
    if (validRoute === currentRoute) {
      return;
    }

    if (isNavigating) return;
    isNavigating = true;

    try {
      // 1. Unmount previous view
      if (currentMountedView && typeof currentMountedView.unmount === 'function') {
        try {
          currentMountedView.unmount();
        } catch (err) {
          console.error(`[GlideMind Router] Error unmounting '${currentRoute}':`, err);
        }
      }

      currentRoute = validRoute;

      // 2. Synchronize store state
      if (targetStore && targetStore.getState().activeView !== validRoute) {
        targetStore.setState({ activeView: validRoute });
      }

      // 3. Update window hash if in browser
      if (typeof window !== 'undefined' && window.location) {
        const targetHash = `#${validRoute}`;
        if (window.location.hash !== targetHash) {
          window.location.hash = targetHash;
        }
      }

      // 4. Update UI nav indicators
      updateNavUI(validRoute);

      // 5. Mount view into container
      if (!containerEl && typeof document !== 'undefined') {
        containerEl = document.getElementById('main-view');
      }

      const registeredView = viewRegistry.get(validRoute);
      if (registeredView && typeof registeredView.mount === 'function') {
        currentMountedView = registeredView;
        registeredView.mount(containerEl, params);
      } else if (containerEl) {
        // Render placeholder shell for unimplemented views
        currentMountedView = null;
        renderRoutePlaceholder(containerEl, validRoute);
      }
    } finally {
      isNavigating = false;
    }
  }

  /**
   * Renders a default view container shell when a specialized view is not yet registered.
   * @param {HTMLElement} container
   * @param {string} route
   */
  function renderRoutePlaceholder(container, route) {
    const routeTitles = {
      home: 'Home Dashboard',
      forecast: 'Meteo & Volabilità',
      map: 'Mappa Decolli & Spot',
      logbook: 'Libretto di Volo & Telemetria',
      settings: 'Impostazioni & Strumenti'
    };

    container.innerHTML = `
      <section id="view-${route}" class="gm-view-placeholder" aria-label="${routeTitles[route] || route}">
        <div class="gm-card" style="margin-top: 16px;">
          <h2 style="margin: 0 0 8px 0; font-size: 1.3rem;">${routeTitles[route] || route}</h2>
          <p style="color: var(--gm-text-secondary); margin: 0 0 16px 0;">
            Modulo architetturale configurato nella shell GlideMind. In attesa di montaggio componente dedicato.
          </p>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <span class="gm-badge gm-badge-flyable">Shell Attiva</span>
            <span class="gm-badge gm-badge-caution">Fase 2 Pronta</span>
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Initializes router listeners on window and DOM.
   */
  function init() {
    if (typeof window === 'undefined') return;

    if (!containerEl && typeof document !== 'undefined') {
      containerEl = document.getElementById('main-view');
    }

    // Listen to hashchange
    window.addEventListener('hashchange', () => {
      const routeFromHash = normalizeRoute(window.location.hash);
      if (routeFromHash !== currentRoute) {
        navigate(routeFromHash);
      }
    });

    // Listen to store updates for activeView
    if (targetStore && typeof targetStore.subscribeSlice === 'function') {
      targetStore.subscribeSlice('activeView', (newView) => {
        if (newView && newView !== currentRoute) {
          navigate(newView);
        }
      });
    }

    // Desktop keyboard shortcuts listener
    window.addEventListener('keydown', (e) => {
      // Ignore if modifier keys are active
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      // Ignore if typing inside input / textarea / editable
      if (isInputTarget(e.target)) {
        return;
      }

      const key = e.key ? e.key.toLowerCase() : '';
      const matchedRoute = KEYBOARD_SHORTCUTS[key];
      if (matchedRoute) {
        e.preventDefault();
        navigate(matchedRoute);
      }
    });

    // Intercept clicks on internal data-route links
    if (typeof document !== 'undefined') {
      document.addEventListener('click', (e) => {
        const link = /** @type {HTMLElement} */ (e.target)?.closest('[data-route]');
        if (link) {
          const route = link.getAttribute('data-route');
          if (route && VALID_ROUTES.includes(route)) {
            e.preventDefault();
            navigate(route);
          }
        }
      });
    }

    // Initial navigation based on starting hash or store state
    const initialRoute = normalizeRoute(window.location.hash || targetStore.getState().activeView);
    navigate(initialRoute);
  }

  return {
    navigate,
    registerView,
    getCurrentRoute: () => currentRoute,
    getViewRegistry: () => viewRegistry,
    init
  };
}

/**
 * Shared singleton router instance.
 */
export const router = createRouter();
