/**
 * GlideMind - Asynchronous On-Demand Script & Library Loader (UI Layer)
 * 
 * Injects external heavy dependencies (Three.js, MapLibre GL, etc.) dynamically
 * only when accessing specialized views (e.g. #replay), preserving the lightweight
 * shell startup budget (<100 KB) and respecting the Doherty threshold (<400ms).
 * 
 * Headless safe: Resolves immediately or gracefully returns in Node.js environments.
 */

const loadedScripts = new Set();
const pendingPromises = new Map();

/**
 * Loads an external JavaScript library dynamically via <script async>.
 * Deduplicates concurrent and subsequent requests.
 * 
 * @param {string} src URL or path of the script to load
 * @param {string} [globalCheckName] Optional window property name to check (e.g. 'THREE', 'maplibregl')
 * @returns {Promise<any>}
 */
export async function loadScriptOnce(src, globalCheckName = '') {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  if (globalCheckName && window[globalCheckName]) {
    return window[globalCheckName];
  }

  if (loadedScripts.has(src)) {
    return globalCheckName ? window[globalCheckName] : true;
  }

  if (pendingPromises.has(src)) {
    return pendingPromises.get(src);
  }

  const promise = new Promise((resolve, reject) => {
    // Check if script element is already present in DOM
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (globalCheckName && window[globalCheckName]) {
        loadedScripts.add(src);
        resolve(window[globalCheckName]);
        return;
      }
      existing.addEventListener('load', () => {
        loadedScripts.add(src);
        resolve(globalCheckName ? window[globalCheckName] : true);
      });
      existing.addEventListener('error', (err) => reject(err));
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      loadedScripts.add(src);
      pendingPromises.delete(src);
      resolve(globalCheckName ? window[globalCheckName] : true);
    };
    script.onerror = (err) => {
      pendingPromises.delete(src);
      reject(new Error(`[GlideMind ScriptLoader] Failed to load external script: ${src}`));
    };
    document.head.appendChild(script);
  });

  pendingPromises.set(src, promise);
  return promise;
}

/**
 * Checks whether a script URL has been marked as loaded.
 * @param {string} src
 * @returns {boolean}
 */
export function isScriptLoaded(src) {
  return loadedScripts.has(src);
}

/**
 * Clears loaded tracking (primarily for testing resets).
 */
export function clearScriptLoaderCache() {
  loadedScripts.clear();
  pendingPromises.clear();
}
