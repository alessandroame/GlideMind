/**
 * GlideMind - Centralized Reactive State Engine (Headless Core)
 * Single Source of Truth (SSOT) with Pub/Sub subscriptions and injectable storage adapters.
 * Strictly decoupled from DOM, window, and browser-specific globals.
 */

/**
 * Creates an in-memory storage adapter suitable for Node.js environments and automated tests.
 * @returns {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void, removeItem: (key: string) => void, clear: () => void }}
 */
export function createInMemoryStorageAdapter() {
  const memoryMap = new Map();
  return {
    getItem(key) {
      return memoryMap.has(key) ? memoryMap.get(key) : null;
    },
    setItem(key, value) {
      memoryMap.set(key, String(value));
    },
    removeItem(key) {
      memoryMap.delete(key);
    },
    clear() {
      memoryMap.clear();
    }
  };
}

/**
 * Creates a browser-compatible localStorage adapter with safe fallback.
 * @param {Storage|null} [storage] - Optional explicit storage instance (e.g. window.localStorage).
 * @returns {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void, removeItem: (key: string) => void, clear: () => void }}
 */
export function createLocalStorageAdapter(storage = null) {
  let targetStorage = storage;
  if (!targetStorage && typeof globalThis !== 'undefined' && globalThis.localStorage) {
    targetStorage = globalThis.localStorage;
  }

  if (!targetStorage) {
    return createInMemoryStorageAdapter();
  }

  return {
    getItem(key) {
      try {
        return targetStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        targetStorage.setItem(key, String(value));
      } catch {
        // Handle storage quota or private browsing exceptions gracefully
      }
    },
    removeItem(key) {
      try {
        targetStorage.removeItem(key);
      } catch {
        // Silently catch storage errors
      }
    },
    clear() {
      try {
        targetStorage.clear();
      } catch {
        // Silently catch storage errors
      }
    }
  };
}

import { DEFAULT_SEED_FLIGHTS } from './logbook.js';

/**
 * Default initial state for GlideMind application.
 */
export const DEFAULT_INITIAL_STATE = Object.freeze({
  activeView: 'home',
  selectedSpot: null,
  activeDate: new Date().toISOString().split('T')[0],
  weatherData: null,
  pinnedSpots: Object.freeze([]),
  pinnedSpotIds: Object.freeze(['monte-cornizzolo-lc']),
  recentSpotIds: Object.freeze([]),
  flights: DEFAULT_SEED_FLIGHTS,
  pilotPeriod: 'month',
  units: Object.freeze({
    speed: 'km/h',
    altitude: 'm',
    temperature: 'C',
    vario: 'm/s'
  }),
  ui: Object.freeze({
    activeSheet: null,
    drawerOpen: false,
    highContrast: true,
    theme: 'dark'
  })
});

/**
 * Clones a plain object or primitive value safely.
 * @template T
 * @param {T} obj
 * @returns {T}
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(deepClone);
  }
  const copy = {};
  for (const [key, value] of Object.entries(obj)) {
    copy[key] = deepClone(value);
  }
  return copy;
}

/**
 * Creates a reactive GlideMind store instance.
 * @param {Partial<typeof DEFAULT_INITIAL_STATE>} [initialStateOverrides={}]
 * @param {ReturnType<typeof createInMemoryStorageAdapter>|null} [customStorageAdapter=null]
 */
export function createStore(initialStateOverrides = {}, customStorageAdapter = null) {
  const storageAdapter = customStorageAdapter || createInMemoryStorageAdapter();
  let persistedKeys = new Set(['pinnedSpots', 'pinnedSpotIds', 'recentSpotIds', 'units', 'selectedSpot', 'flights', 'pilotPeriod']);
  const STORAGE_PREFIX = 'glidemind_store_';

  // Deep clone defaults and apply overrides
  let state = {
    ...deepClone(DEFAULT_INITIAL_STATE),
    ...deepClone(initialStateOverrides)
  };

  /** @type {Set<(state: typeof DEFAULT_INITIAL_STATE, prevState: typeof DEFAULT_INITIAL_STATE) => void>} */
  const globalListeners = new Set();

  /** @type {Map<string, Set<(newValue: any, prevValue: any, fullState: typeof DEFAULT_INITIAL_STATE) => void>>} */
  const sliceListeners = new Map();

  /**
   * Persists registered slices to the storage adapter.
   */
  function persistKeys(keysToPersist) {
    if (!storageAdapter) return;
    for (const key of keysToPersist) {
      if (persistedKeys.has(key)) {
        try {
          const val = state[key];
          if (val === undefined) {
            storageAdapter.removeItem(STORAGE_PREFIX + key);
          } else {
            storageAdapter.setItem(STORAGE_PREFIX + key, JSON.stringify(val));
          }
        } catch {
          // Persistence failure should not crash application flow
        }
      }
    }
  }

  /**
   * Loads persisted state slices from storage adapter.
   */
  function loadPersistedState() {
    if (!storageAdapter) return;
    const loadedSlice = {};
    for (const key of persistedKeys) {
      try {
        const item = storageAdapter.getItem(STORAGE_PREFIX + key);
        if (item !== null && item !== undefined) {
          loadedSlice[key] = JSON.parse(item);
        }
      } catch {
        // Discard corrupted persisted records
      }
    }
    if (Object.keys(loadedSlice).length > 0) {
      setState(loadedSlice);
    }
  }

  /**
   * Returns a copy of the current state.
   * @returns {typeof DEFAULT_INITIAL_STATE}
   */
  function getState() {
    return deepClone(state);
  }

  /**
   * Updates state with partial changes or an updater function.
   * Notifies global and slice-specific subscribers synchronously.
   * @param {Partial<typeof DEFAULT_INITIAL_STATE> | ((prevState: typeof DEFAULT_INITIAL_STATE) => Partial<typeof DEFAULT_INITIAL_STATE>)} partialOrUpdater
   */
  function setState(partialOrUpdater) {
    const prevState = state;
    const changes = typeof partialOrUpdater === 'function'
      ? partialOrUpdater(deepClone(state))
      : partialOrUpdater;

    if (!changes || typeof changes !== 'object') {
      return;
    }

    const changedSliceKeys = [];
    const nextState = { ...state };

    for (const [key, value] of Object.entries(changes)) {
      if (JSON.stringify(state[key]) !== JSON.stringify(value)) {
        nextState[key] = deepClone(value);
        changedSliceKeys.push(key);
      }
    }

    if (changedSliceKeys.length === 0) {
      return; // No detectable state mutation
    }

    state = nextState;

    // Persist relevant slices
    persistKeys(changedSliceKeys);

    // Notify global listeners
    const frozenNewState = getState();
    const frozenPrevState = deepClone(prevState);
    for (const listener of globalListeners) {
      try {
        listener(frozenNewState, frozenPrevState);
      } catch (err) {
        console.error('[GlideMind Store] Global listener error:', err);
      }
    }

    // Notify slice listeners
    for (const key of changedSliceKeys) {
      const listeners = sliceListeners.get(key);
      if (listeners && listeners.size > 0) {
        const newVal = frozenNewState[key];
        const prevVal = frozenPrevState[key];
        for (const listener of listeners) {
          try {
            listener(newVal, prevVal, frozenNewState);
          } catch (err) {
            console.error(`[GlideMind Store] Slice listener error on '${key}':`, err);
          }
        }
      }
    }
  }

  /**
   * Convenience method to update a single state slice.
   * @param {string} sliceKey
   * @param {any} value
   */
  function setSlice(sliceKey, value) {
    setState({ [sliceKey]: value });
  }

  /**
   * Subscribes to all state changes.
   * @param {(state: typeof DEFAULT_INITIAL_STATE, prevState: typeof DEFAULT_INITIAL_STATE) => void} listener
   * @returns {() => void} Unsubscribe function
   */
  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('[GlideMind Store] Subscriber must be a function.');
    }
    globalListeners.add(listener);
    return () => {
      globalListeners.delete(listener);
    };
  }

  /**
   * Subscribes specifically to changes of a single state slice.
   * @param {string} sliceKey
   * @param {(newValue: any, prevValue: any, fullState: typeof DEFAULT_INITIAL_STATE) => void} listener
   * @returns {() => void} Unsubscribe function
   */
  function subscribeSlice(sliceKey, listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('[GlideMind Store] Slice subscriber must be a function.');
    }
    if (!sliceListeners.has(sliceKey)) {
      sliceListeners.set(sliceKey, new Set());
    }
    const set = sliceListeners.get(sliceKey);
    set.add(listener);

    return () => {
      set.delete(listener);
      if (set.size === 0) {
        sliceListeners.delete(sliceKey);
      }
    };
  }

  /**
   * Configures which state keys are persisted via storage adapter.
   * @param {string[]} keys
   */
  function registerPersistedKeys(keys) {
    persistedKeys = new Set(keys);
  }

  /**
   * Resets state back to default initial state or provided defaults.
   * @param {Partial<typeof DEFAULT_INITIAL_STATE>|null} [customDefaults=null]
   */
  function resetState(customDefaults = null) {
    const targetDefaults = customDefaults
      ? { ...deepClone(DEFAULT_INITIAL_STATE), ...deepClone(customDefaults) }
      : deepClone(DEFAULT_INITIAL_STATE);
    setState(targetDefaults);
  }

  return {
    getState,
    setState,
    setSlice,
    subscribe,
    subscribeSlice,
    loadPersistedState,
    registerPersistedKeys,
    resetState,
    getStorageAdapter: () => storageAdapter
  };
}

/**
 * Shared singleton store instance for browser runtime (or default Node.js instance).
 */
export const store = createStore();
