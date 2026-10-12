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
import { DEFAULT_COMPRENSORI, parseCoordinates } from '../../core/comprensorio.js';
import { DEFAULT_SEED_FLIGHTS } from '../../core/logbook.js';
import { HeadlessReplayEngine } from '../3d/HeadlessReplayEngine.js';
import { MapLibreThreeEngine } from '../3d/MapLibreThreeEngine.js';
import { ReplayTelemetryCanvas } from '../3d/ReplayTelemetryCanvas.js';
import { extractFlightEvents } from '../../core/flightTelemetry.js';
import { renderLayerToggleIcon, getNextMapLayer, getMapLayerLabel } from '../map/mapEngineAdapter.js';

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
    this.activeLayer = options.mapLayer === 'satellite' ? 'satellite' : 'topo';
    this.isPlaying = false;
    this.elevationOffset = 0;
    this.flightEvents = [];
    this._boundKeyDown = this._onKeyDown.bind(this);
    this._boundLayerChange = this._onLayerChange.bind(this);
    this._boundReplayToggle = null;
    this._boundStoreListener = null;
  }

  /**
   * Factory method to obtain or initialize 3D replay engine.
   * In Node.js or test environments, returns a HeadlessReplayEngine instance.
   */
  _createEngine() {
    if (this.engine) return this.engine;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const state = (store && typeof store.getState === 'function') ? store.getState() : {};
      const layerId = (this.activeLayer === 'satellite' || state.ui?.mapLayer === 'satellite') ? 'satellite' : 'topo';
      return new MapLibreThreeEngine({ mapLayer: layerId });
    }
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
        const isSimulated = rawPoints.length === 0;
        return {
          meta: detail.meta,
          raw: detail.raw || {},
          points: rawPoints.length > 0 ? rawPoints : this._generateFallbackTrackPoints(detail.meta),
          isSimulated
        };
      }
    } catch {
      // Fallback to store cache
    }

    const state = store.getState();
    let cachedFlight = Array.isArray(state.flights)
      ? state.flights.find(f => (f.id === flightId || f.flightId === flightId))
      : null;

    if (!cachedFlight && Array.isArray(DEFAULT_SEED_FLIGHTS)) {
      cachedFlight = DEFAULT_SEED_FLIGHTS.find(f => (f.id === flightId || f.flightId === flightId));
    }

    if (cachedFlight) {
      return {
        meta: cachedFlight,
        raw: {},
        points: this._generateFallbackTrackPoints(cachedFlight),
        isSimulated: true
      };
    }

    return this._generateFallbackFlight();
  }

  /**
   * Resolves physical coordinates for site from meta or DEFAULT_COMPRENSORI.
   * @param {object} meta
   * @returns {{ takeoffLat: number, takeoffLon: number, takeoffAlt: number, landingLat: number, landingLon: number, landingAlt: number }}
   */
  _resolveSiteLocation(meta = {}) {
    const siteQuery = (meta.site || meta.siteName || meta.comprensorio || '').toLowerCase();
    if (siteQuery && Array.isArray(DEFAULT_COMPRENSORI)) {
      const match = DEFAULT_COMPRENSORI.find(c =>
        c.name.toLowerCase().includes(siteQuery) ||
        siteQuery.includes(c.name.toLowerCase()) ||
        c.id === meta.comprensorioId
      );
      if (match) {
        const primaryTakeoff = match.takeoffs?.[0];
        const primaryLanding = match.landings?.[0];
        const parsedT = primaryTakeoff ? parseCoordinates(primaryTakeoff.coordinates) : null;
        const parsedL = primaryLanding ? parseCoordinates(primaryLanding.coordinates) : null;
        return {
          takeoffLat: parsedT ? parsedT.lat : 45.833,
          takeoffLon: parsedT ? parsedT.lon : 9.302,
          takeoffAlt: primaryTakeoff?.altitude || 1060,
          landingLat: parsedL ? parsedL.lat : (parsedT ? parsedT.lat - 0.015 : 45.817),
          landingLon: parsedL ? parsedL.lon : (parsedT ? parsedT.lon + 0.015 : 9.318),
          landingAlt: primaryLanding?.altitude || 260
        };
      }
    }
    return {
      takeoffLat: meta.takeoffLat || 45.833,
      takeoffLon: meta.takeoffLon || 9.302,
      takeoffAlt: meta.takeoffAlt || 1060,
      landingLat: meta.takeoffLat ? meta.takeoffLat - 0.015 : 45.817,
      landingLon: meta.takeoffLon ? meta.takeoffLon + 0.015 : 9.318,
      landingAlt: 260
    };
  }

  /**
   * Generates realistic synthetic track points for fallback when raw points are absent.
   */
  _generateFallbackTrackPoints(meta = {}) {
    const loc = this._resolveSiteLocation(meta);
    const lat0 = meta.takeoffLat || loc.takeoffLat;
    const lon0 = meta.takeoffLon || loc.takeoffLon;
    const alt0 = meta.takeoffAlt || loc.takeoffAlt;
    const landingLat = loc.landingLat;
    const landingLon = loc.landingLon;
    const landingAlt = loc.landingAlt || Math.max(220, alt0 - 700);

    // Realistic altitude envelope:
    // Monte Cornizzolo summit is ~1240m. Takeoff is 1060m.
    // Climb up to ~1280m (+220m above takeoff), then glide down to landing (~260m).
    const maxClimbMeters = meta.maxAlt ? (meta.maxAlt - alt0) : 220;
    const maxAlt = alt0 + Math.max(80, Math.min(300, maxClimbMeters));
    const duration = meta.durationSeconds || ((meta.durationMinutes ? meta.durationMinutes * 60 : null) || 2700);

    const count = 90;
    const pts = new Array(count);

    for (let i = 0; i < count; i++) {
      const frac = i / (count - 1);

      // Phase 1: Ridge soaring & thermal climb (0% to 60% of flight)
      // Phase 2: Transition & final glide to landing (60% to 100%)
      let lat, lon, alt, vario;

      if (frac <= 0.60) {
        // Soaring phase: staying close to the mountain ridge (within 150-250m)
        const pFrac = frac / 0.60;
        // Thermal circles / figures of 8 along the ridge:
        // Use sin/cos with phase so that at pFrac = 0, displacement from takeoff is 0
        const turns = 4;
        const angle = pFrac * Math.PI * 2 * turns;
        // Radius ramps up smoothly from 0 at takeoff up to ~180m radius
        const rLat = 0.0016 * Math.sin(pFrac * Math.PI * 0.5);
        const rLon = 0.0022 * Math.sin(pFrac * Math.PI * 0.5);

        // Fly out slightly south from ridge (into wind/slope)
        const forwardPush = -0.0010 * Math.sin(pFrac * Math.PI * 0.5);

        lat = lat0 + forwardPush + Math.sin(angle) * rLat;
        lon = lon0 + (1 - Math.cos(angle)) * rLon * 0.5;

        // Altitude climbs smoothly from alt0 up to maxAlt
        const climbProfile = Math.sin(pFrac * Math.PI * 0.5);
        alt = alt0 + (maxAlt - alt0) * climbProfile;
        vario = Math.round((1.4 + Math.sin(angle * 2) * 0.8) * 10) / 10;
      } else {
        // Glide to landing phase
        const gFrac = (frac - 0.60) / 0.40; // 0.0 -> 1.0
        // Departure point at end of ridge soaring
        const exitLat = lat0 - 0.0010;
        const exitLon = lon0 + 0.0011;

        // Smooth glide path from exit point to landing point
        // S-turns during descent
        const sTurns = Math.sin(gFrac * Math.PI * 5) * 0.0012 * (1 - gFrac);

        lat = exitLat + (landingLat - exitLat) * gFrac + sTurns * 0.5;
        lon = exitLon + (landingLon - exitLon) * gFrac + sTurns;

        // Altitude descends steadily from maxAlt down to landingAlt
        alt = maxAlt - (maxAlt - landingAlt) * gFrac;
        vario = Math.round((-1.2 - Math.sin(gFrac * Math.PI * 3) * 0.4) * 10) / 10;
      }

      pts[i] = {
        lat: Math.round(lat * 1e6) / 1e6,
        lon: Math.round(lon * 1e6) / 1e6,
        alt: Math.round(alt),
        timeSeconds: Math.round(frac * duration),
        speedKmh: Math.round(36 + Math.sin(frac * Math.PI * 8) * 4),
        vario,
        heading: 0
      };
    }

    // Ensure first point is exactly at takeoff coordinates and altitude
    pts[0].lat = lat0;
    pts[0].lon = lon0;
    pts[0].alt = alt0;

    // Ensure last point is exactly at landing coordinates and altitude
    pts[count - 1].lat = landingLat;
    pts[count - 1].lon = landingLon;
    pts[count - 1].alt = landingAlt;

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
      points: this._generateFallbackTrackPoints(meta),
      isSimulated: true
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

    this.flightEvents = extractFlightEvents({
      points: this.currentBundle.points,
      telemetry: this.currentBundle.telemetry || this.currentBundle.raw?.telemetry
    });

    const state = (store && typeof store.getState === 'function') ? store.getState() : {};
    this.activeLayer = (state.ui?.mapLayer === 'satellite' || this.activeLayer === 'satellite') ? 'satellite' : 'topo';

    if (store && typeof store.subscribe === 'function') {
      this._boundStoreListener = store.subscribe(() => {
        const s = store.getState();
        if (s.ui?.mapLayer && s.ui.mapLayer !== this.activeLayer) {
          const validLayer = s.ui.mapLayer === 'satellite' ? 'satellite' : 'topo';
          this.activeLayer = validLayer;
          if (this.engine && typeof this.engine.setMapLayer === 'function') {
            this.engine.setMapLayer(validLayer);
          }
          this.updateLayerToggleUi();
        }
      });
    }

    this.render();
    this._renderEventsStrip();

    // Initialize 3D Engine
    this.engine = this._createEngine();
    const viewport3dEl = containerEl.querySelector('#gm-replay-viewport-3d');
    await this.engine.init(viewport3dEl, { flightId: this.currentFlightId });
    await this.engine.loadTrack(this.currentBundle.points, { meta: this.currentBundle.meta });

    // Mount 2D Telemetry Canvas
    const telemetryContainer = containerEl.querySelector('#gm-replay-telemetry-container');
    if (telemetryContainer) {
      this.telemetryCanvas.mount(telemetryContainer, this.currentBundle.points, {
        onSeek: (frac) => this.handleSeek(frac),
        flight: this.currentBundle,
        events: this.flightEvents
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

      const eventBtn = target.closest('[data-event-progress]');
      if (eventBtn) {
        e.preventDefault();
        const p = parseFloat(eventBtn.getAttribute('data-event-progress'));
        if (!isNaN(p)) {
          this.handleSeek(p);
        }
        return;
      }
    });

    const layerToggle = this.containerEl.querySelector('#gm-replay-layer-toggle');
    if (layerToggle) {
      this._boundReplayToggle = () => {
        const nextLayer = getNextMapLayer(this.activeLayer);
        this.handleLayerChange(nextLayer);
      };
      layerToggle.addEventListener('click', this._boundReplayToggle);
    }

    const layerSelect = this.containerEl.querySelector('#gm-replay-layer-select');
    if (layerSelect) {
      layerSelect.addEventListener('change', this._boundLayerChange);
    }
  }

  /**
   * Renders the interactive milestone events strip above the scrubber.
   */
  _renderEventsStrip() {
    if (!this.containerEl) return;
    const stripEl = this.containerEl.querySelector('#replay-3d-events-strip');
    if (!stripEl) return;

    if (!Array.isArray(this.flightEvents) || this.flightEvents.length === 0) {
      stripEl.innerHTML = '';
      stripEl.style.display = 'none';
      return;
    }

    stripEl.style.display = 'flex';
    stripEl.innerHTML = this.flightEvents.map(ev => `
      <button type="button" class="gm-btn-replay-event" data-event-id="${ev.id}" data-event-progress="${ev.progress}" aria-label="${escapeHtml(ev.label)}: ${escapeHtml(ev.detail)}">
        <span class="gm-event-color-dot" style="background-color: ${ev.color}; width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0;"></span>
        <span class="gm-event-name" style="font-weight: 700; white-space: nowrap;">${escapeHtml(ev.shortLabel || ev.label)}</span>
        <span class="gm-event-detail" style="font-size: 0.72rem; opacity: 0.8; font-family: monospace; white-space: nowrap;">${escapeHtml(ev.detail)}</span>
      </button>
    `).join('');
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
   * Event listener for 3D map layer dropdown change.
   * @param {Event} e
   */
  _onLayerChange(e) {
    const target = /** @type {HTMLSelectElement} */ (e.target);
    if (target && target.value) {
      this.handleLayerChange(target.value);
    }
  }

  /**
   * Switches active 3D cartographic basemap layer and updates store.
   * @param {string} layerId ('topo' | 'satellite')
   */
  handleLayerChange(layerId) {
    const validLayer = layerId === 'satellite' ? 'satellite' : 'topo';
    this.activeLayer = validLayer;
    if (this.engine && typeof this.engine.setMapLayer === 'function') {
      this.engine.setMapLayer(validLayer);
    }
    if (store && typeof store.setState === 'function') {
      store.setState((prev) => ({
        ui: {
          ...prev.ui,
          mapLayer: validLayer
        }
      }));
    }
    this.updateLayerToggleUi();
  }

  /**
   * Updates the 3D replay layer toggle button UI.
   */
  updateLayerToggleUi() {
    if (!this.containerEl) return;
    const toggleBtn = this.containerEl.querySelector('#gm-replay-layer-toggle');
    if (!toggleBtn) return;
    const isSat = this.activeLayer === 'satellite';
    const curLabel = isSat ? 'Satellite' : 'OpenTopo';
    const nextLabel = isSat ? 'OpenTopo' : 'Satellite';
    toggleBtn.setAttribute('data-layer', this.activeLayer);
    toggleBtn.setAttribute('aria-label', `Layer mappa: ${curLabel} (tocca per ${nextLabel})`);
    toggleBtn.setAttribute('title', `Layer mappa: ${curLabel} (tocca per ${nextLabel})`);
    toggleBtn.innerHTML = `
      ${renderLayerToggleIcon(this.activeLayer)}
      <span class="gm-layer-toggle-label">${curLabel}</span>
    `;
    const select = this.containerEl.querySelector('#gm-replay-layer-select');
    if (select) select.value = this.activeLayer;
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
    if (this._boundStoreListener) {
      this._boundStoreListener();
      this._boundStoreListener = null;
    }
    if (this.containerEl) {
      const layerToggle = this.containerEl.querySelector('#gm-replay-layer-toggle');
      if (layerToggle && this._boundReplayToggle) {
        layerToggle.removeEventListener('click', this._boundReplayToggle);
      }
      const layerSelect = this.containerEl.querySelector('#gm-replay-layer-select');
      if (layerSelect) {
        layerSelect.removeEventListener('change', this._boundLayerChange);
      }
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
            <button type="button" class="gm-btn gm-btn-ghost gm-replay-back-btn" data-action="exit-replay" aria-label="Torna al Flight Log">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              <span>Flight Log</span>
            </button>
            <div class="gm-replay-flight-meta">
              <h1 class="gm-replay-flight-title" id="replay-flight-title">${escapeHtml(siteTitle)}</h1>
              <span class="gm-replay-flight-subtitle" id="replay-flight-subtitle">
                ${escapeHtml(dateStr)} • ${escapeHtml(gliderStr)}${this.currentBundle?.isSimulated ? ' • <span class="gm-simulated-badge">Traccia Simulata</span>' : ''}
              </span>
            </div>
          </div>
          <div class="gm-replay-top-right">
            <div class="gm-replay-layer-wrap">
              <button 
                type="button" 
                id="gm-replay-layer-toggle" 
                class="gm-replay-layer-toggle" 
                data-action="toggle-replay-layer" 
                data-layer="${this.activeLayer}" 
                aria-label="Layer mappa: ${this.activeLayer === 'satellite' ? 'Satellite (tocca per OpenTopo)' : 'OpenTopo (tocca per Satellite)'}" 
                title="Layer mappa: ${this.activeLayer === 'satellite' ? 'Satellite (tocca per OpenTopo)' : 'OpenTopo (tocca per Satellite)'}"
              >
                ${renderLayerToggleIcon(this.activeLayer)}
                <span class="gm-layer-toggle-label">${getMapLayerLabel(this.activeLayer)}</span>
              </button>
            </div>
            <div class="gm-replay-camera-group" role="radiogroup" aria-label="Modalità Telecamera">
              <button type="button" class="gm-replay-cam-btn ${this.activeCameraMode === 'chase' ? 'gm-active' : ''}" data-camera="chase" aria-pressed="${this.activeCameraMode === 'chase'}">Inseguimento</button>
              <button type="button" class="gm-replay-cam-btn ${this.activeCameraMode === 'cockpit' ? 'gm-active' : ''}" data-camera="cockpit" aria-pressed="${this.activeCameraMode === 'cockpit'}">Pilota</button>
              <button type="button" class="gm-replay-cam-btn ${this.activeCameraMode === 'free' ? 'gm-active' : ''}" data-camera="free" aria-pressed="${this.activeCameraMode === 'free'}">Libera</button>
            </div>
          </div>
        </header>

        <!-- 3D Viewport Area -->
        <div id="gm-replay-viewport-3d" class="gm-replay-viewport-3d" tabindex="-1">
          <div class="gm-replay-viewport-hint" aria-hidden="true">
            <span>Trascina con il tocco per ruotare la visuale 3D</span>
          </div>
        </div>

        <!-- Sticky Bottom Bar: Events, Telemetry & Controls (Thumb Zone) -->
        <footer class="gm-replay-bottom-bar">
          <div id="replay-3d-events-strip" class="gm-replay-events-strip" role="region" aria-label="Eventi salienti del volo"></div>
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
