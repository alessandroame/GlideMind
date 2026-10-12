/**
 * GlideMind - Headless 3D Replay Engine (Mock / Testing Adapter)
 * 
 * Implements IReplay3dEngine for 0ms execution in pure Node.js environments
 * without DOM, WebGL, or Canvas dependencies.
 * 
 * Provides deterministic simulation of playback, scrubbing, camera switching,
 * and context loss resilience.
 */

import { IReplay3dEngine } from './IReplay3dEngine.js';
import { projectTrackToThreeLocal, interpolateTrackSample } from '../../core/flightReplayMath.js';

export class HeadlessReplayEngine extends IReplay3dEngine {
  constructor() {
    super();
    this.containerEl = null;
    this.options = {};
    this.trackPoints = [];
    this.projected = null;
    this.progress = 0; // 0.0 -> 1.0
    this.currentTimeSec = 0;
    this.totalDurationSec = 0;
    this.speed = 1;
    this.cameraMode = 'chase';
    this.isPlaying = false;
    this.elevationOffset = 0;
    this.currentSample = null;
    this._stepTimer = null;
  }

  /**
   * Initializes headless mock engine.
   * @param {any} containerEl
   * @param {object} [options]
   */
  async init(containerEl, options = {}) {
    this.containerEl = containerEl;
    this.options = { ...options };
    this.isDestroyed = false;
    this.isContextLost = false;
  }

  /**
   * Loads track points and prepares projected trajectory.
   * @param {Array<object>} points
   * @param {object} [options]
   */
  async loadTrack(points = [], options = {}) {
    this.trackPoints = Array.isArray(points) ? points : [];
    this.options = { ...this.options, ...options };
    this.projected = projectTrackToThreeLocal(this.trackPoints);

    if (this.trackPoints.length > 0) {
      const firstTime = this.trackPoints[0].timeSeconds ?? 0;
      const lastTime = this.trackPoints[this.trackPoints.length - 1].timeSeconds ?? (this.trackPoints.length - 1);
      this.totalDurationSec = Math.max(1, lastTime - firstTime);
    } else {
      this.totalDurationSec = 0;
    }

    this.seek(0);
  }

  /**
   * Seeks to a specific progress fraction [0.0, 1.0].
   * @param {number} progressFraction
   */
  seek(progressFraction) {
    if (this.isDestroyed || this.isContextLost) return;

    this.progress = Math.max(0, Math.min(1, progressFraction || 0));
    this.currentTimeSec = Math.round(this.progress * this.totalDurationSec * 10) / 10;

    const points = this.projected?.points || [];
    if (points.length === 0) {
      this.currentSample = null;
    } else if (points.length === 1) {
      this.currentSample = { ...points[0] };
    } else {
      const rawIndex = this.progress * (points.length - 1);
      const idx = Math.floor(rawIndex);
      const frac = rawIndex - idx;

      if (idx >= points.length - 1) {
        this.currentSample = { ...points[points.length - 1] };
      } else {
        const pPrevPrev = idx > 0 ? points[idx - 1] : null;
        const pPrev = points[idx];
        const pNext = points[idx + 1];
        const pNextNext = idx + 2 < points.length ? points[idx + 2] : null;

        this.currentSample = interpolateTrackSample(pPrev, pNext, frac, pPrevPrev, pNextNext);
      }
    }

    // Apply elevation offset
    if (this.currentSample && typeof this.currentSample.y === 'number') {
      this.currentSample.effectiveY = this.currentSample.y + this.elevationOffset;
    }

    this.emit('timeupdate', {
      progress: this.progress,
      currentTimeSec: this.currentTimeSec,
      totalDurationSec: this.totalDurationSec,
      currentPoint: this.currentSample
    });
  }

  /**
   * Returns array of track points traveled up to the current playback instant.
   * @returns {Array<object>}
   */
  getTraveledPoints() {
    if (!this.trackPoints || this.trackPoints.length === 0) return [];
    if (this.progress <= 0) return [];
    if (this.progress >= 1.0) return [...this.trackPoints];
    const n = this.trackPoints.length;
    const maxIdx = Math.floor(this.progress * (n - 1));
    return this.trackPoints.slice(0, maxIdx + 1);
  }

  /**
   * Sets playback speed multiplier.
   * @param {number} speedMultiplier (1, 2, 5, 10, 20)
   */
  setPlaybackSpeed(speedMultiplier) {
    const validSpeeds = [1, 2, 5, 10, 20];
    const target = Number(speedMultiplier) || 1;
    this.speed = validSpeeds.includes(target) ? target : Math.max(0.25, Math.min(50, target));
    this.emit('speedchange', { speed: this.speed });
  }

  /**
   * Sets camera viewpoint mode.
   * @param {'chase'|'cockpit'|'free'} mode
   */
  setCameraMode(mode) {
    const validModes = ['chase', 'cockpit', 'free'];
    this.cameraMode = validModes.includes(mode) ? mode : 'chase';
    this.emit('camerachange', { cameraMode: this.cameraMode });
  }

  /**
   * Sets elevation offset in meters.
   * @param {number} deltaMeters
   */
  setElevationOffset(deltaMeters) {
    this.elevationOffset = Number(deltaMeters) || 0;
    if (this.currentSample) {
      this.currentSample.effectiveY = (this.currentSample.y || 0) + this.elevationOffset;
    }
  }

  /**
   * Starts playback simulation.
   */
  play() {
    if (this.isDestroyed || this.isContextLost) return;
    if (this.progress >= 1.0) {
      this.seek(0);
    }
    this.isPlaying = true;
    this.emit('play');
  }

  /**
   * Pauses playback simulation.
   */
  pause() {
    this.isPlaying = false;
    this.emit('pause');
  }

  /**
   * Advances playback deterministically by dtSeconds (real seconds).
   * @param {number} [dtSeconds=1]
   */
  step(dtSeconds = 1) {
    if (!this.isPlaying || this.totalDurationSec <= 0) return;
    const deltaProgress = (dtSeconds * this.speed) / this.totalDurationSec;
    const nextProgress = this.progress + deltaProgress;

    if (nextProgress >= 1.0) {
      this.seek(1.0);
      this.pause();
      this.emit('ended');
    } else {
      this.seek(nextProgress);
    }
  }

  /**
   * Simulates WebGL context loss for resilience testing.
   */
  simulateContextLost() {
    this.isContextLost = true;
    this.pause();
    this.emit('contextlost');
  }

  /**
   * Simulates WebGL context restoration for resilience testing.
   */
  simulateContextRestored() {
    this.isContextLost = false;
    this.emit('contextrestored');
  }

  /**
   * Cleans up engine resources.
   */
  destroy() {
    this.pause();
    this.trackPoints = [];
    this.projected = null;
    this.currentSample = null;
    super.destroy();
  }
}
