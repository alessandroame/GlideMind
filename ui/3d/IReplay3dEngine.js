/**
 * GlideMind - 3D Flight Replay Engine Abstract Interface
 * 
 * Standard contract for all 3D flight trajectory visualization engines:
 * - MapLibreThreeEngine (Primary: MapLibre GL 3D + Three.js DEM Terrarium)
 * - CesiumReplayEngine (Fallback: WGS84 Cartesian)
 * - HeadlessReplayEngine (Node.js test mock)
 * 
 * Governed by MEMORY.md (#23, #90) and geodesy_webgl_3d_spec.md.
 */

export class IReplay3dEngine {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
    this.isDestroyed = false;
    this.isContextLost = false;
  }

  /**
   * Subscribes to an engine event.
   * @param {string} event Event name ('timeupdate', 'play', 'pause', 'ended', 'camerachange', 'speedchange', 'contextlost', 'contextrestored', 'error')
   * @param {Function} callback Handler function
   * @returns {() => void} Unsubscribe function
   */
  on(event, callback) {
    if (typeof callback !== 'function') {
      throw new TypeError(`[IReplay3dEngine] Callback for '${event}' must be a function.`);
    }
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribes from an engine event.
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    const set = this._listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        this._listeners.delete(event);
      }
    }
  }

  /**
   * Dispatches an event to registered listeners.
   * @param {string} event
   * @param {any} [data]
   */
  emit(event, data) {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return;
    for (const listener of set) {
      try {
        listener(data);
      } catch (err) {
        console.error(`[IReplay3dEngine] Error in listener for '${event}':`, err);
      }
    }
  }

  /**
   * Initializes the 3D graphics canvas and scene within the container element.
   * @param {HTMLElement|object} containerEl
   * @param {object} [options]
   * @returns {Promise<void>}
   */
  async init(containerEl, options = {}) {
    throw new Error('[IReplay3dEngine] init() must be implemented by concrete subclass.');
  }

  /**
   * Loads a flight trajectory track and prepares geometry buffers.
   * @param {Array<object>} points Track points with lat, lon, alt, timeSeconds, speedKmh, vario
   * @param {object} [options] Metadata (flightId, pilot, glider, etc.)
   * @returns {Promise<void>}
   */
  async loadTrack(points, options = {}) {
    throw new Error('[IReplay3dEngine] loadTrack() must be implemented by concrete subclass.');
  }

  /**
   * Seeks playback to a specific progress fraction [0.0, 1.0].
   * @param {number} progressFraction
   */
  seek(progressFraction) {
    throw new Error('[IReplay3dEngine] seek() must be implemented by concrete subclass.');
  }

  /**
   * Sets the playback speed multiplier.
   * @param {number} speedMultiplier (e.g. 1, 2, 5, 10, 20)
   */
  setPlaybackSpeed(speedMultiplier) {
    throw new Error('[IReplay3dEngine] setPlaybackSpeed() must be implemented by concrete subclass.');
  }

  /**
   * Sets camera viewpoint mode ('chase', 'cockpit', 'free').
   * @param {'chase'|'cockpit'|'free'} mode
   */
  setCameraMode(mode) {
    throw new Error('[IReplay3dEngine] setCameraMode() must be implemented by concrete subclass.');
  }

  /**
   * Applies an elevation offset (Delta H in meters) to align flight with DEM terrain.
   * @param {number} deltaMeters
   */
  setElevationOffset(deltaMeters) {
    throw new Error('[IReplay3dEngine] setElevationOffset() must be implemented by concrete subclass.');
  }

  /**
   * Starts or resumes playback.
   */
  play() {
    throw new Error('[IReplay3dEngine] play() must be implemented by concrete subclass.');
  }

  /**
   * Pauses playback.
   */
  pause() {
    throw new Error('[IReplay3dEngine] pause() must be implemented by concrete subclass.');
  }

  /**
   * Destroys all WebGL resources, listeners, and child elements.
   */
  destroy() {
    this.isDestroyed = true;
    this._listeners.clear();
  }
}
