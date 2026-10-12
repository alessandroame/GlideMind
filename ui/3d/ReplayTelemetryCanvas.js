/**
 * GlideMind - 2D Telemetry & Timeline Canvas (Decoupled 60 FPS Engine)
 * 
 * Renders the altitude profile, variometer FAI gradient, flight phase track,
 * event milestone markers, and interactive scrubber on a dedicated 2D HTML5 Canvas element
 * completely separated from the WebGL context.
 * 
 * Prevents UI thread stutter and frame-drops during touch scrubbing.
 * Governed by MEMORY.md (#90, #99) and laws-of-ux (Fitts's law, Doherty threshold).
 */

import {
  sampleVarioRgb,
  generateFlightPhaseGradient,
  FLIGHT_PHASE_COLORS
} from '../../core/flightTelemetry.js';

export class ReplayTelemetryCanvas {
  constructor() {
    this.containerEl = null;
    this.canvasEl = null;
    this.ctx = null;
    this.hudEl = null;
    this.phaseBarEl = null;
    this.markersEl = null;
    this.trackPoints = [];
    this.flight = null;
    this.flightEvents = [];
    this.progress = 0; // 0.0 -> 1.0
    this.currentSample = null;
    this.onSeekCallback = null;
    this.isPointerDown = false;
    this.width = 300;
    this.height = 64;
    this.minAlt = 0;
    this.maxAlt = 1000;
    this.totalDurationSec = 0;
    this._boundPointerDown = this._onPointerDown.bind(this);
    this._boundPointerMove = this._onPointerMove.bind(this);
    this._boundPointerUp = this._onPointerUp.bind(this);
    this._boundResize = this._onResize.bind(this);
  }

  /**
   * Mounts the telemetry canvas, cockpit HUD, and dual-track scrubber into the parent container.
   * @param {HTMLElement} containerEl
   * @param {Array<object>} trackPoints
   * @param {object} [options]
   * @param {(fraction: number) => void} [options.onSeek]
   * @param {object} [options.flight] Flight record or bundle
   * @param {Array<object>} [options.events] Chronological flight events
   */
  mount(containerEl, trackPoints = [], options = {}) {
    this.containerEl = containerEl;
    this.trackPoints = Array.isArray(trackPoints) ? trackPoints : [];
    this.flight = options.flight || null;
    this.flightEvents = Array.isArray(options.events) ? options.events : [];
    this.onSeekCallback = typeof options.onSeek === 'function' ? options.onSeek : null;

    this._computeAltRange();

    if (!containerEl || typeof document === 'undefined') {
      return;
    }

    containerEl.innerHTML = '';
    containerEl.className = 'gm-replay-telemetry-container';

    // 1. Full Cockpit Telemetry HUD Strip
    this.hudEl = document.createElement('div');
    this.hudEl.className = 'gm-replay-hud-strip';
    this.hudEl.innerHTML = `
      <div class="gm-replay-hud-group">
        <span class="gm-replay-hud-badge gm-hud-phase" id="hud-phase" style="color: ${FLIGHT_PHASE_COLORS.glide}; border: 1px solid ${FLIGHT_PHASE_COLORS.glide}80; background: ${FLIGHT_PHASE_COLORS.glide}26; padding: 2px 7px; border-radius: 4px; font-size: 0.72rem; letter-spacing: 0.05em; font-weight: 800;">PLANATA</span>
        <span class="gm-replay-hud-badge gm-hud-vario" id="hud-vario" style="padding: 2px 6px; border-radius: 4px; font-weight: 800;">+0.0 m/s</span>
        <span class="gm-replay-hud-badge" id="hud-speed">-- km/h</span>
      </div>
      <div class="gm-replay-hud-group">
        <span class="gm-replay-hud-badge" id="hud-alt-msl">-- m MSL</span>
        <span class="gm-replay-hud-badge" id="hud-alt" style="display:none;">-- m</span>
        <span class="gm-replay-hud-badge" id="hud-alt-agl" title="Quota stimata su suolo">+-- m AGL</span>
        <span class="gm-replay-hud-badge gm-hud-heading" id="hud-heading">
          <svg id="hud-compass-needle" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="display:inline-block; vertical-align:middle; transition:transform 0.1s linear; margin-right: 2px;" aria-hidden="true">
            <polygon points="12,2 19,21 12,17 5,21"></polygon>
          </svg>
          <span id="hud-heading-val">000°</span>
        </span>
        <span class="gm-replay-hud-badge" id="hud-time">00:00 / 00:00</span>
      </div>
    `;
    containerEl.appendChild(this.hudEl);

    // 2. Dual-Track Scrubber Wrapper
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'gm-replay-canvas-wrapper';
    canvasWrap.style.cssText = 'position: relative; width: 100%; height: 64px; touch-action: pan-y; cursor: ew-resize; overflow: hidden; border-radius: var(--gm-radius-sm, 6px);';

    // Top Phase Gradient Track
    const phaseGradient = this.flight ? generateFlightPhaseGradient(this.flight) : `linear-gradient(to right, ${FLIGHT_PHASE_COLORS.glide} 0%, ${FLIGHT_PHASE_COLORS.glide} 100%)`;
    this.phaseBarEl = document.createElement('div');
    this.phaseBarEl.className = 'gm-replay-phase-track';
    this.phaseBarEl.style.cssText = `position: absolute; top: 0; left: 0; right: 0; height: 5px; background: ${phaseGradient}; pointer-events: none; z-index: 2; opacity: 0.9;`;
    canvasWrap.appendChild(this.phaseBarEl);

    // 2D Canvas Altitude Profile
    this.canvasEl = document.createElement('canvas');
    this.canvasEl.className = 'gm-replay-telemetry-canvas';
    this.canvasEl.style.cssText = 'display: block; width: 100%; height: 100%;';
    canvasWrap.appendChild(this.canvasEl);

    // Event Milestone Tick Markers Overlay
    this.markersEl = document.createElement('div');
    this.markersEl.className = 'gm-replay-event-markers';
    this.markersEl.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: 3;';
    this._renderEventMarkers(this.markersEl);
    canvasWrap.appendChild(this.markersEl);

    containerEl.appendChild(canvasWrap);

    if (this.canvasEl.getContext) {
      this.ctx = this.canvasEl.getContext('2d');
    }

    // Attach pointer interaction
    canvasWrap.addEventListener('pointerdown', this._boundPointerDown);
    canvasWrap.addEventListener('pointermove', this._boundPointerMove);
    canvasWrap.addEventListener('pointerup', this._boundPointerUp);
    canvasWrap.addEventListener('pointercancel', this._boundPointerUp);

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this._boundResize);
    }

    this._onResize();
    this.render();
  }

  /**
   * Renders vertical tick markers on the scrubber for each flight event.
   * @param {HTMLElement} container
   */
  _renderEventMarkers(container) {
    if (!container || !Array.isArray(this.flightEvents) || this.flightEvents.length === 0) {
      return;
    }

    container.innerHTML = this.flightEvents.map(ev => {
      const pct = (ev.progress * 100).toFixed(2);
      return `
        <div data-event-id="${ev.id}" data-event-progress="${ev.progress}"
             class="replay-event-marker"
             style="position: absolute; top: 0; bottom: 0; width: 3px; margin-left: -1.5px; left: ${pct}%; background-color: ${ev.color}; opacity: 0.85; pointer-events: auto; cursor: pointer; transition: transform 0.15s ease;"
             title="${ev.label}: ${ev.detail}"></div>
      `;
    }).join('');

    container.querySelectorAll('.replay-event-marker').forEach(marker => {
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = parseFloat(marker.getAttribute('data-event-progress'));
        if (!isNaN(p) && this.onSeekCallback) {
          this.progress = p;
          this.onSeekCallback(p);
        }
      });
    });
  }

  /**
   * Computes min/max altitude and total flight duration.
   */
  _computeAltRange() {
    if (!this.trackPoints || this.trackPoints.length === 0) {
      this.minAlt = 0;
      this.maxAlt = 1000;
      this.totalDurationSec = 0;
      return;
    }

    let minA = Infinity;
    let maxA = -Infinity;

    for (let i = 0; i < this.trackPoints.length; i++) {
      const a = this.trackPoints[i].alt || 0;
      if (a < minA) minA = a;
      if (a > maxA) maxA = a;
    }

    this.minAlt = Math.max(0, Math.floor(minA - 30));
    this.maxAlt = Math.ceil(maxA + 40);

    const firstTime = this.trackPoints[0].timeSeconds ?? 0;
    const lastTime = this.trackPoints[this.trackPoints.length - 1].timeSeconds ?? (this.trackPoints.length - 1);
    this.totalDurationSec = Math.max(1, lastTime - firstTime);
  }

  /**
   * Resizes canvas to match container pixel density.
   */
  _onResize() {
    if (!this.canvasEl || !this.canvasEl.parentElement) return;
    const rect = this.canvasEl.parentElement.getBoundingClientRect();
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    this.width = Math.max(100, Math.floor(rect.width || 300));
    this.height = Math.max(40, Math.floor(rect.height || 64));

    this.canvasEl.width = this.width * dpr;
    this.canvasEl.height = this.height * dpr;

    if (this.ctx) {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    this.render();
  }

  _onPointerDown(e) {
    this.isPointerDown = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    this._handlePointerSeek(e);
  }

  _onPointerMove(e) {
    if (!this.isPointerDown) return;
    this._handlePointerSeek(e);
  }

  _onPointerUp(e) {
    if (!this.isPointerDown) return;
    this.isPointerDown = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  }

  _handlePointerSeek(e) {
    if (!this.canvasEl) return;
    const rect = this.canvasEl.getBoundingClientRect();
    if (!rect.width) return;

    const x = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, x / rect.width));

    this.progress = fraction;
    if (this.onSeekCallback) {
      this.onSeekCallback(fraction);
    }
  }

  /**
   * Updates playback progress and cockpit HUD metrics.
   * @param {number} progress Fraction [0.0, 1.0]
   * @param {object|null} [currentSample]
   */
  setProgress(progress, currentSample = null) {
    this.progress = Math.max(0, Math.min(1, progress || 0));
    this.currentSample = currentSample;
    this._updateHud();
    this.render();
  }

  _formatTime(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const hours = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;

    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  _getPhaseDisplay(phaseKey) {
    const k = String(phaseKey || 'glide').toLowerCase();
    if (k.startsWith('thermal')) {
      return { label: 'TERMICA', color: FLIGHT_PHASE_COLORS.thermal };
    }
    if (k === 'takeoff') {
      return { label: 'DECOLLO', color: FLIGHT_PHASE_COLORS.takeoff };
    }
    if (k === 'soaring') {
      return { label: 'DINAMICA', color: FLIGHT_PHASE_COLORS.soaring };
    }
    if (k === 'descent') {
      return { label: 'DISCESA', color: FLIGHT_PHASE_COLORS.descent };
    }
    if (k === 'maneuver') {
      return { label: 'MANOVRA', color: FLIGHT_PHASE_COLORS.maneuver };
    }
    if (k === 'landing') {
      return { label: 'ATTERRAGGIO', color: FLIGHT_PHASE_COLORS.landing };
    }
    return { label: 'PLANATA', color: FLIGHT_PHASE_COLORS.glide };
  }

  _detectPhaseAtProgress(progress) {
    const timeline = this.flight?.telemetry?.phases?.timeline;
    if (Array.isArray(timeline) && timeline.length > 0) {
      const targetSec = (this.trackPoints[0]?.timeSeconds || 0) + (progress * this.totalDurationSec);
      for (const seg of timeline) {
        if (targetSec >= seg.startTimeSeconds && targetSec <= seg.endTimeSeconds) {
          return seg.phase;
        }
      }
    }
    if (progress <= 0.05) return 'takeoff';
    if (progress >= 0.95) return 'landing';
    return 'glide';
  }

  /**
   * Updates Cockpit HUD metrics in DOM.
   */
  _updateHud() {
    if (!this.hudEl) return;

    const sample = this.currentSample;
    const phaseEl = this.hudEl.querySelector('#hud-phase');
    const altEl = this.hudEl.querySelector('#hud-alt');
    const altMslEl = this.hudEl.querySelector('#hud-alt-msl');
    const altAglEl = this.hudEl.querySelector('#hud-alt-agl');
    const varioEl = this.hudEl.querySelector('#hud-vario');
    const speedEl = this.hudEl.querySelector('#hud-speed');
    const headingValEl = this.hudEl.querySelector('#hud-heading-val');
    const needleEl = this.hudEl.querySelector('#hud-compass-needle');
    const timeEl = this.hudEl.querySelector('#hud-time');

    if (sample) {
      const altMsl = Math.round(sample.alt || 0);
      if (altEl) altEl.textContent = `${altMsl} m`;
      if (altMslEl) altMslEl.textContent = `${altMsl} m MSL`;

      // AGL Altitude: ground clearance
      const groundAlt = typeof sample.groundAlt === 'number' ? sample.groundAlt : this.minAlt;
      const altAgl = Math.max(0, Math.round(altMsl - groundAlt));
      if (altAglEl) altAglEl.textContent = `+${altAgl} m AGL`;

      if (speedEl) speedEl.textContent = `${Math.round(sample.speedKmh || 0)} km/h`;

      const hdg = Math.round(((sample.heading || 0) % 360 + 360) % 360);
      if (headingValEl) headingValEl.textContent = `${String(hdg).padStart(3, '0')}°`;
      if (needleEl) needleEl.style.transform = `rotate(${hdg}deg)`;

      if (varioEl) {
        const v = typeof sample.vario === 'number' ? sample.vario : 0;
        const colorData = sampleVarioRgb(v);
        varioEl.textContent = `${v >= 0 ? '+' : ''}${v.toFixed(1)} m/s`;
        varioEl.style.backgroundColor = colorData.css;
        varioEl.style.color = '#ffffff';
      }

      if (phaseEl) {
        const phaseKey = sample.phase || this._detectPhaseAtProgress(this.progress);
        const { label, color } = this._getPhaseDisplay(phaseKey);
        phaseEl.textContent = label;
        phaseEl.style.color = color;
        phaseEl.style.borderColor = `${color}80`;
        phaseEl.style.backgroundColor = `${color}26`;
      }

      if (timeEl) {
        const currentSec = sample.timeSeconds ?? Math.round(this.progress * this.totalDurationSec);
        timeEl.textContent = `${this._formatTime(currentSec)} / ${this._formatTime(this.totalDurationSec)}`;
      }
    } else {
      if (timeEl) {
        const currentSec = Math.round(this.progress * this.totalDurationSec);
        timeEl.textContent = `${this._formatTime(currentSec)} / ${this._formatTime(this.totalDurationSec)}`;
      }
    }
  }

  /**
   * Renders the 2D altitude profile, FAI color bands, and vertical tracking cursor.
   */
  render() {
    if (!this.ctx || !this.width || !this.height) return;

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Clear background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(11, 17, 32, 0.85)';
    ctx.fillRect(0, 0, w, h);

    const pts = this.trackPoints;
    const n = pts.length;
    if (n < 2) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      return;
    }

    const altRange = Math.max(10, this.maxAlt - this.minAlt);
    const padTop = 8;
    const padBottom = 6;
    const drawH = h - padTop - padBottom;

    const getY = (alt) => {
      const normalized = ((alt || 0) - this.minAlt) / altRange;
      return h - padBottom - (normalized * drawH);
    };

    // Draw altitude area fill
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const y = getY(pts[i].alt);
      if (i === 0) ctx.lineTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();

    const areaGrad = ctx.createLinearGradient(0, 0, 0, h);
    areaGrad.addColorStop(0, 'rgba(14, 165, 233, 0.35)');
    areaGrad.addColorStop(1, 'rgba(14, 165, 233, 0.05)');
    ctx.fillStyle = areaGrad;
    ctx.fill();

    // Draw line segments with FAI vario coloring
    ctx.lineWidth = 2;
    for (let i = 0; i < n - 1; i++) {
      const x1 = (i / (n - 1)) * w;
      const y1 = getY(pts[i].alt);
      const x2 = ((i + 1) / (n - 1)) * w;
      const y2 = getY(pts[i + 1].alt);

      const vario = pts[i].vario ?? 0;
      const color = sampleVarioRgb(vario).css;

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Draw vertical tracking cursor
    const cursorX = Math.max(0, Math.min(w, this.progress * w));
    ctx.beginPath();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.moveTo(cursorX, 0);
    ctx.lineTo(cursorX, h);
    ctx.stroke();

    // Draw cursor circle head
    const cursorAlt = this.currentSample?.alt ?? pts[Math.min(n - 1, Math.floor(this.progress * (n - 1)))].alt;
    const cursorY = getY(cursorAlt);

    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(cursorX, cursorY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  /**
   * Destroys DOM elements and removes event listeners.
   */
  destroy() {
    if (this.canvasEl && this.canvasEl.parentElement) {
      const wrap = this.canvasEl.parentElement;
      wrap.removeEventListener('pointerdown', this._boundPointerDown);
      wrap.removeEventListener('pointermove', this._boundPointerMove);
      wrap.removeEventListener('pointerup', this._boundPointerUp);
      wrap.removeEventListener('pointercancel', this._boundPointerUp);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this._boundResize);
    }
    if (this.containerEl) {
      this.containerEl.innerHTML = '';
    }
    this.canvasEl = null;
    this.ctx = null;
    this.hudEl = null;
    this.phaseBarEl = null;
    this.markersEl = null;
    this.trackPoints = [];
    this.flightEvents = [];
    this.currentSample = null;
    this.onSeekCallback = null;
  }
}
