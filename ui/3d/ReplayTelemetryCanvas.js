/**
 * GlideMind - 2D Telemetry & Timeline Canvas (Decoupled 60 FPS Engine)
 * 
 * Renders the altitude profile, variometer FAI gradient, and interactive scrubber
 * on a dedicated 2D HTML5 Canvas element completely separated from the WebGL context.
 * 
 * Prevents UI thread stutter and frame-drops during touch scrubbing.
 * Governed by MEMORY.md (#90, #99) and laws-of-ux (Fitts's law, Doherty threshold).
 */

import { sampleVarioRgb } from '../../core/flightTelemetry.js';

export class ReplayTelemetryCanvas {
  constructor() {
    this.containerEl = null;
    this.canvasEl = null;
    this.ctx = null;
    this.hudEl = null;
    this.trackPoints = [];
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
   * Mounts the telemetry canvas and HUD into the parent container.
   * @param {HTMLElement} containerEl
   * @param {Array<object>} trackPoints
   * @param {object} [options]
   * @param {(fraction: number) => void} [options.onSeek]
   */
  mount(containerEl, trackPoints = [], options = {}) {
    this.containerEl = containerEl;
    this.trackPoints = Array.isArray(trackPoints) ? trackPoints : [];
    this.onSeekCallback = typeof options.onSeek === 'function' ? options.onSeek : null;

    this._computeAltRange();

    if (!containerEl || typeof document === 'undefined') {
      return;
    }

    containerEl.innerHTML = '';
    containerEl.className = 'gm-replay-telemetry-container';

    // 1. HUD Strip
    this.hudEl = document.createElement('div');
    this.hudEl.className = 'gm-replay-hud-strip';
    this.hudEl.innerHTML = `
      <div class="gm-replay-hud-group">
        <span class="gm-replay-hud-badge" id="hud-alt">-- m</span>
        <span class="gm-replay-hud-badge" id="hud-vario">-- m/s</span>
      </div>
      <div class="gm-replay-hud-group">
        <span class="gm-replay-hud-badge" id="hud-speed">-- km/h</span>
        <span class="gm-replay-hud-badge" id="hud-time">00:00 / 00:00</span>
      </div>
    `;
    containerEl.appendChild(this.hudEl);

    // 2. Canvas Scrubber wrapper
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'gm-replay-canvas-wrapper';
    canvasWrap.style.cssText = 'position: relative; width: 100%; height: 64px; touch-action: pan-y; cursor: ew-resize;';

    this.canvasEl = document.createElement('canvas');
    this.canvasEl.className = 'gm-replay-telemetry-canvas';
    this.canvasEl.style.cssText = 'display: block; width: 100%; height: 100%; border-radius: var(--gm-radius-sm, 6px);';
    canvasWrap.appendChild(this.canvasEl);
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

    // Margin of 50m above and below
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

  /**
   * Pointer down handler: initiates scrubbing.
   */
  _onPointerDown(e) {
    this.isPointerDown = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture not supported
    }
    this._handlePointerSeek(e);
  }

  /**
   * Pointer move handler: continuous scrubbing.
   */
  _onPointerMove(e) {
    if (!this.isPointerDown) return;
    this._handlePointerSeek(e);
  }

  /**
   * Pointer up / cancel handler.
   */
  _onPointerUp(e) {
    if (!this.isPointerDown) return;
    this.isPointerDown = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  }

  /**
   * Computes progress fraction and invokes seek callback.
   */
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
   * Updates playback progress and HUD metrics.
   * @param {number} progress Fraction [0.0, 1.0]
   * @param {object|null} [currentSample]
   */
  setProgress(progress, currentSample = null) {
    this.progress = Math.max(0, Math.min(1, progress || 0));
    this.currentSample = currentSample;
    this._updateHud();
    this.render();
  }

  /**
   * Formats seconds into mm:ss or hh:mm:ss.
   */
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

  /**
   * Updates HUD labels in DOM without thrashing.
   */
  _updateHud() {
    if (!this.hudEl) return;

    const sample = this.currentSample;
    const altEl = this.hudEl.querySelector('#hud-alt');
    const varioEl = this.hudEl.querySelector('#hud-vario');
    const speedEl = this.hudEl.querySelector('#hud-speed');
    const timeEl = this.hudEl.querySelector('#hud-time');

    if (sample) {
      if (altEl) altEl.textContent = `${Math.round(sample.alt || 0)} m`;
      if (speedEl) speedEl.textContent = `${Math.round(sample.speedKmh || 0)} km/h`;

      if (varioEl) {
        const v = typeof sample.vario === 'number' ? sample.vario : 0;
        const colorData = sampleVarioRgb(v);
        varioEl.textContent = `${v >= 0 ? '+' : ''}${v.toFixed(1)} m/s`;
        varioEl.style.color = colorData.css;
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
      // Draw placeholder line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      return;
    }

    const altRange = Math.max(10, this.maxAlt - this.minAlt);
    const padTop = 6;
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
    this.trackPoints = [];
    this.currentSample = null;
    this.onSeekCallback = null;
  }
}
