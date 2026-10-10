/**
 * GlideMind - 3D Flight Replay View Controller (UI Layer)
 * 
 * Provides a dedicated 100dvh full-screen paragliding flight trajectory visualization.
 * Integrates:
 * - 3D Replay Engine (MapLibreThreeEngine / HeadlessReplayEngine)
 * - Decoupled 60 FPS 2D Telemetry & Timeline Scrubber Canvas
 * - Thumb-zone controls: Play/Pause, Speed multipliers (1x-20x), Camera modes (Chase, Cockpit, Free)
 * - Navigation return link (>= 48px) to #logbook
 * 
 * Strictly decoupled and 100% testable in Node.js environments.
 */

import { store } from '../../core/store.js';
import { logbookManager } from '../../core/logbookDb.js';
import { HeadlessReplayEngine } from '../3d/HeadlessReplayEngine.js';
import { ReplayTelemetryCanvas } from '../3d/ReplayTelemetryCanvas.js';

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class FlightReplayView {
  constructor(options = {}) {
    this.containerEl = null;
    this.engine = options.engine || null;
    this.telemetryCanvas = new ReplayTelemetryCanvas();
    this.currentFlightId = null;
    this.currentBundle = null;
    this.activeCameraMode = 'chase';
    this.activeSpeed = 1;
    this.isPlaying = false;
    this.elevationOffset = 0;
    this._boundKeyDown = this._onKeyDown.bind(this);
    this._boundStoreListener = null;
  }

  /**
   * Factory method to obtain or initialize 3D replay engine.
   * In Node.js or test environments, returns a HeadlessReplayEngine instance.
   */
  _createEngine() {
    if (this.engine) return this.engine;
    return new HeadlessReplayEngine();
  }

  /**
   * Resolves target flight ID from parameters, store state, or logbook seed.
   * @param {string|object} [params]
   * @returns {string|null}
   */
  _resolveTargetFlightId(params) {
    if (typeof params === 'string' && params.trim()) {
      return params.trim();
    }
    if (params && typeof params === 'object') {
      if (params.flightId) return String(params.flightId);
      if (params.id) return String(params.id);
    }

    // Check query params in window hash
    if (typeof window !== 'undefined' && window.location && window.location.hash) {
      const match = window.location.hash.match(/[?&]flightId=([^&]+)/);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }

    const state = store.getState();
    if (state.activeReplayFlightId) {
      return state.activeReplayFlightId;
    }

    if (Array.isArray(state.flights) && state.flights.length > 0) {
      return state.flights[0].id || state.flights[0].flightId;
    }

    return null;
  }

  /**
   * Loads flight track bundle from database or store.
   * @param {string} flightId
   * @returns {Promise<{ meta: object, raw: object, points: Array<object> }>}
   */
  async _loadFlightData(flightId) {
    if (!flightId) {
      return this._generateFallbackFlight();
    }

    try {
      const detail = await logbookManager.getFlightDetail(flightId);
      if (detail && detail.meta) {
        const rawPoints = detail.raw?.decimatedPoints || detail.raw?.points || [];
        return {
          meta: detail.meta,
          raw: detail.raw || {},
          points: rawPoints.length > 0 ? rawPoints : this._generateFallbackTrackPoints(detail.meta)
        };
      }
    } catch {
      // Fallback to store cache
    }

    const state = store.getState();
    const cachedFlight = Array.isArray(state.flights)
      ? state.flights.find(f => (f.id === flightId || f.flightId === flightId))
      : null;

    if (cachedFlight) {
      return {
        meta: cachedFlight,
        raw: {},
        points: this._generateFallbackTrackPoints(cachedFlight)
      };
    }

    return this._generateFallbackFlight();
  }

  /**
   * Generates realistic synthetic track points for fallback when raw points are absent.
   */
  _generateFallbackTrackPoints(meta = {}) {
    const lat0 = meta.takeoffLat || 45.4983;
    const lon0 = meta.takeoffLon || 7.8283;
    const alt0 = meta.takeoffAlt || 1200;
    const maxAlt = meta.maxAlt || 1850;
    const duration = meta.durationSeconds || 3600;

    const count = 30;
    const pts = new Array(count);

    for (let i = 0; i < count; i++) {
      const frac = i / (count - 1);
      const angle = frac * Math.PI * 4;
      const r = 0.005 * (1 + frac);
      const currentAlt = alt0 + (maxAlt - alt0) * Math.sin(frac * Math.PI);

      pts[i] = {
        lat: lat0 + Math.sin(angle) * r,
        lon: lon0 + Math.cos(angle) * r,
        alt: Math.round(currentAlt),
        timeSeconds: Math.round(frac * duration),
        speedKmh: Math.round(36 + Math.sin(angle * 2) * 6),
        vario: Math.round(Math.cos(frac * Math.PI) * 2.5 * 10) / 10,
        heading: Math.round(((angle * 180 / Math.PI) + 360) % 360)
      };
    }

    return pts;
  }

  _generateFallbackFlight() {
    const meta = {
      id: 'demo-flight',
      siteName: 'Monte Cavallaria',
      date: 'Oggi',
      glider: 'Skywalk Tequila 5',
      pilot: 'Pilota GlideMind',
      durationSeconds: 2700,
      maxAlt: 1680,
      takeoffAlt: 1250
    };
    return {
      meta,
      raw: {},
      points: this._generateFallbackTrackPoints(meta)
    };
  }

  /**
   * Mounts the flight replay view into the container.
   * @param {HTMLElement} containerEl
   * @param {string|object} [params]
   */
  async mount(containerEl, params = null) {
    this.containerEl = containerEl;
    if (!containerEl) {
      return;
    }

    this.currentFlightId = this._resolveTargetFlightId(params);
    this.currentBundle = await this._loadFlightData(this.currentFlightId);

    this.render();

    // Initialize 3D Engine
    this.engine = this._createEngine();
    const viewport3dEl = containerEl.querySelector('#gm-replay-viewport-3d');
    await this.engine.init(viewport3dEl, { flightId: this.currentFlightId });
    await this.engine.loadTrack(this.currentBundle.points, { meta: this.currentBundle.meta });

    // Mount 2D Telemetry Canvas
    const telemetryContainer = containerEl.querySelector('#gm-replay-telemetry-container');
    if (telemetryContainer) {
      this.telemetryCanvas.mount(telemetryContainer, this.currentBundle.points, {
        onSeek: (frac) => this.handleSeek(frac)
      });
    }

    // Connect Engine timeupdate event to Telemetry Canvas
    this.engine.on('timeupdate', (data) => {
      this.telemetryCanvas.setProgress(data.progress, data.currentPoint);
      if (store && typeof store.setState === 'function') {
        store.setState((prev) => ({
          replay: {
            ...prev.replay,
            progress: data.progress,
            currentTimeSec: data.currentTimeSec,
            isPlaying: this.engine.isPlaying
          }
        }));
      }
    });

    this.engine.on('play', () => this._updatePlayButtonState(true));
    this.engine.on('pause', () => this._updatePlayButtonState(false));
    this.engine.on('ended', () => this._updatePlayButtonState(false));

    // Attach delegated event listeners
    this._attachEventListeners();

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._boundKeyDown);
    }
  }

  /**
   * Attaches click listeners for replay controls.
   */
  _attachEventListeners() {
    if (!this.containerEl) return;

    this.containerEl.addEventListener('click', (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (!target) return;

      const exitBtn = target.closest('[data-action="exit-replay"]');
      if (exitBtn) {
        e.preventDefault();
        this.handleExitReplay();
        return;
      }

      const playBtn = target.closest('[data-action="toggle-play"]');
      if (playBtn) {
        e.preventDefault();
        this.handleTogglePlay();
        return;
      }

      const camBtn = target.closest('[data-camera]');
      if (camBtn) {
        e.preventDefault();
        const mode = camBtn.getAttribute('data-camera');
        this.handleCameraChange(mode);
        return;
      }

      const speedBtn = target.closest('[data-speed]');
      if (speedBtn) {
        e.preventDefault();
        const speed = Number(speedBtn.getAttribute('data-speed')) || 1;
        this.handleSpeedChange(speed);
        return;
      }

      const offsetBtn = target.closest('[data-action="toggle-offset"]');
      if (offsetBtn) {
        e.preventDefault();
        this.handleToggleElevationOffset();
        return;
      }
    });
  }

  /**
   * Handles keyboard shortcuts (Space for Play/Pause, Escape for exit).
   */
  _onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.handleExitReplay();
    } else if (e.key === ' ' && e.target?.tagName !== 'INPUT' && e.target?.tagName !== 'TEXTAREA') {
      e.preventDefault();
      this.handleTogglePlay();
    }
  }

  /**
   * Toggles Play / Pause.
   */
  handleTogglePlay() {
    if (!this.engine) return;
    if (this.engine.isPlaying) {
      this.engine.pause();
    } else {
      this.engine.play();
    }
  }

  /**
   * Updates play button UI label and icon.
   */
  _updatePlayButtonState(isPlaying) {
    this.isPlaying = isPlaying;
    if (!this.containerEl) return;
    const playBtn = this.containerEl.querySelector('[data-action="toggle-play"]');
    if (!playBtn) return;

    const iconEl = playBtn.querySelector('.gm-replay-play-icon');
    const labelEl = playBtn.querySelector('.gm-replay-play-label');

    if (isPlaying) {
      if (iconEl) iconEl.textContent = '⏸';
      if (labelEl) labelEl.textContent = 'Pausa';
      playBtn.setAttribute('aria-label', 'Metti in pausa riproduzione');
    } else {
      if (iconEl) iconEl.textContent = '▶';
      if (labelEl) labelEl.textContent = 'Play';
      playBtn.setAttribute('aria-label', 'Avvia riproduzione');
    }
  }

  /**
   * Changes playback speed.
   * @param {number} speed (1, 2, 5, 10, 20)
   */
  handleSpeedChange(speed) {
    this.activeSpeed = speed;
    if (this.engine) {
      this.engine.setPlaybackSpeed(speed);
    }
    if (this.containerEl) {
      const speedBtns = this.containerEl.querySelectorAll('[data-speed]');
      speedBtns.forEach(btn => {
        const btnSpeed = Number(btn.getAttribute('data-speed'));
        if (btnSpeed === speed) {
          btn.classList.add('gm-active');
          btn.setAttribute('aria-pressed', 'true');
        } else {
          btn.classList.remove('gm-active');
          btn.setAttribute('aria-pressed', 'false');
        }
      });
    }
  }

  /**
   * Changes 3D camera mode.
   * @param {'chase'|'cockpit'|'free'} mode
   */
  handleCameraChange(mode) {
    this.activeCameraMode = mode;
    if (this.engine) {
      this.engine.setCameraMode(mode);
    }
    if (this.containerEl) {
      const camBtns = this.containerEl.querySelectorAll('[data-camera]');
      camBtns.forEach(btn => {
        const btnMode = btn.getAttribute('data-camera');
        if (btnMode === mode) {
          btn.classList.add('gm-active');
          btn.setAttribute('aria-pressed', 'true');
        } else {
          btn.classList.remove('gm-active');
          btn.setAttribute('aria-pressed', 'false');
        }
      });
    }
  }

  /**
   * Toggles terrain elevation offset between 0m, +50m, -50m.
   */
  handleToggleElevationOffset() {
    const offsets = [0, 50, -50];
    const currentIdx = offsets.indexOf(this.elevationOffset);
    const nextOffset = offsets[(currentIdx + 1) % offsets.length];
    this.elevationOffset = nextOffset;

    if (this.engine) {
      this.engine.setElevationOffset(nextOffset);
    }
    if (this.containerEl) {
      const btn = this.containerEl.querySelector('[data-action="toggle-offset"]');
      if (btn) {
        btn.textContent = nextOffset === 0 ? 'ΔH 0m' : `ΔH ${nextOffset > 0 ? '+' : ''}${nextOffset}m`;
      }
    }
  }

  /**
   * Seeks playback from timeline canvas.
   * @param {number} fraction [0.0, 1.0]
   */
  handleSeek(fraction) {
    if (this.engine) {
      this.engine.seek(fraction);
    }
  }

  /**
   * Exits 3D replay view and navigates back to logbook.
   */
  handleExitReplay() {
    if (typeof window !== 'undefined' && window.location) {
      window.location.hash = '#logbook';
    }
  }

  /**
   * Unmounts view, stops engine and cleans up listeners.
   */
  unmount() {
    if (this.engine) {
      this.engine.destroy();
      this.engine = null;
    }
    if (this.telemetryCanvas) {
      this.telemetryCanvas.destroy();
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._boundKeyDown);
    }
    if (this.containerEl) {
      this.containerEl.innerHTML = '';
      this.containerEl = null;
    }
  }

  /**
   * Renders the complete HTML shell of the 3D Replay view.
   */
  render() {
    if (!this.containerEl) return;

    const meta = this.currentBundle?.meta || {};
    const siteTitle = meta.siteName || meta.site || 'Volo Libero';
    const dateStr = meta.date || 'Data N/D';
    const gliderStr = meta.glider || meta.gliderModel || 'Parapendio';

    this.containerEl.innerHTML = `
      <section id="view-replay" class="gm-flight-replay-fullscreen" aria-label="Visualizzatore 3D Traiettoria">
        <!-- Top Navigation & Camera Bar -->
        <header class="gm-replay-top-bar">
          <div class="gm-replay-top-left">
            <button type="button" class="gm-btn gm-btn-ghost gm-replay-back-btn" data-action="exit-replay" aria-label="Torna al Libretto di Volo">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              <span>Libretto</span>
            </button>
            <div class="gm-replay-flight-meta">
              <h1 class="gm-replay-flight-title" id="replay-flight-title">${escapeHtml(siteTitle)}</h1>
              <span class="gm-replay-flight-subtitle" id="replay-flight-subtitle">${escapeHtml(dateStr)} • ${escapeHtml(gliderStr)}</span>
            </div>
          </div>
          <div class="gm-replay-camera-group" role="radiogroup" aria-label="Modalità Telecamera">
            <button type="button" class="gm-replay-cam-btn gm-active" data-camera="chase" aria-pressed="true">Inseguimento</button>
            <button type="button" class="gm-replay-cam-btn" data-camera="cockpit" aria-pressed="false">Cockpit</button>
            <button type="button" class="gm-replay-cam-btn" data-camera="free" aria-pressed="false">Libera</button>
          </div>
        </header>

        <!-- 3D Viewport Area -->
        <div id="gm-replay-viewport-3d" class="gm-replay-viewport-3d" tabindex="-1">
          <div class="gm-replay-viewport-hint" aria-hidden="true">
            <span>Trascina con il tocco per ruotare la visuale 3D</span>
          </div>
        </div>

        <!-- Sticky Bottom Bar: Telemetry & Controls (Thumb Zone) -->
        <footer class="gm-replay-bottom-bar">
          <div id="gm-replay-telemetry-container" class="gm-replay-telemetry-slot"></div>
          <div class="gm-replay-controls-row">
            <button type="button" class="gm-btn gm-btn-primary gm-replay-play-btn" data-action="toggle-play" aria-label="Avvia riproduzione">
              <span class="gm-replay-play-icon">▶</span>
              <span class="gm-replay-play-label">Play</span>
            </button>

            <div class="gm-replay-speed-group" role="group" aria-label="Velocità Riproduzione">
              <button type="button" class="gm-replay-speed-btn gm-active" data-speed="1" aria-pressed="true">1x</button>
              <button type="button" class="gm-replay-speed-btn" data-speed="2" aria-pressed="false">2x</button>
              <button type="button" class="gm-replay-speed-btn" data-speed="5" aria-pressed="false">5x</button>
              <button type="button" class="gm-replay-speed-btn" data-speed="10" aria-pressed="false">10x</button>
              <button type="button" class="gm-replay-speed-btn" data-speed="20" aria-pressed="false">20x</button>
            </div>

            <button type="button" class="gm-btn gm-btn-ghost gm-replay-offset-btn" data-action="toggle-offset" aria-label="Regola dislivello terreno">
              ΔH 0m
            </button>
          </div>
        </footer>
      </section>
    `;
  }
}

export const flightReplayView = new FlightReplayView();
