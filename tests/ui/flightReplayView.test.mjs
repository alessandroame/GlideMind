import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FlightReplayView } from '../../ui/views/FlightReplayView.js';
import { ReplayTelemetryCanvas } from '../../ui/3d/ReplayTelemetryCanvas.js';
import { HeadlessReplayEngine } from '../../ui/3d/HeadlessReplayEngine.js';
import { createStore } from '../../core/store.js';

describe('Flight Replay View & Telemetry Canvas (UI Layer)', () => {

  describe('ReplayTelemetryCanvas Component', () => {
    const mockPoints = [
      { alt: 1000, timeSeconds: 0, speedKmh: 36, vario: 1.0 },
      { alt: 1200, timeSeconds: 60, speedKmh: 40, vario: 2.5 },
      { alt: 1100, timeSeconds: 120, speedKmh: 38, vario: -1.0 }
    ];

    it('should compute altitude range and total duration correctly', () => {
      const canvas = new ReplayTelemetryCanvas();
      canvas.mount(null, mockPoints);

      assert.equal(canvas.totalDurationSec, 120);
      assert.ok(canvas.minAlt <= 970);
      assert.ok(canvas.maxAlt >= 1240);
    });

    it('should format time string correctly for mm:ss and hh:mm:ss', () => {
      const canvas = new ReplayTelemetryCanvas();
      assert.equal(canvas._formatTime(0), '00:00');
      assert.equal(canvas._formatTime(65), '01:05');
      assert.equal(canvas._formatTime(3665), '01:01:05');
    });

    it('should update progress and current sample without throwing', () => {
      const canvas = new ReplayTelemetryCanvas();
      canvas.mount(null, mockPoints);

      canvas.setProgress(0.5, { alt: 1150, speedKmh: 39, vario: 1.5, timeSeconds: 60 });
      assert.equal(canvas.progress, 0.5);
      assert.equal(canvas.currentSample.alt, 1150);

      canvas.destroy();
      assert.equal(canvas.trackPoints.length, 0);
    });
  });

  describe('FlightReplayView Controller Lifecycle & Contracts', () => {
    let mockContainer;

    beforeEach(() => {
      // Mock minimal container for Node.js test environment
      const elements = new Map();
      mockContainer = {
        innerHTML: '',
        querySelector(sel) {
          if (sel === '#gm-replay-viewport-3d') {
            return { id: 'gm-replay-viewport-3d', appendChild: () => {}, innerHTML: '' };
          }
          if (sel === '#gm-replay-telemetry-container') {
            return { id: 'gm-replay-telemetry-container', innerHTML: '', className: '', appendChild: () => {} };
          }
          if (sel === '[data-action="toggle-play"]') {
            return {
              querySelector: (sub) => ({ textContent: '' }),
              setAttribute: () => {}
            };
          }
          if (sel === '[data-action="toggle-offset"]') {
            return { textContent: '' };
          }
          return null;
        },
        querySelectorAll(sel) {
          return [];
        },
        addEventListener: () => {},
        removeEventListener: () => {}
      };
    });

    it('should resolve flight ID from various inputs', () => {
      const view = new FlightReplayView();

      assert.equal(view._resolveTargetFlightId('flight_abc'), 'flight_abc');
      assert.equal(view._resolveTargetFlightId({ flightId: 'flight_xyz' }), 'flight_xyz');
      assert.equal(view._resolveTargetFlightId({ id: 'flight_123' }), 'flight_123');
    });

    it('should mount with HeadlessReplayEngine in test runtime and render DOM landmarks', async () => {
      const view = new FlightReplayView();
      await view.mount(mockContainer, 'demo-flight');

      assert.ok(mockContainer.innerHTML.includes('gm-flight-replay-fullscreen'));
      assert.ok(mockContainer.innerHTML.includes('data-action="exit-replay"'));
      assert.ok(mockContainer.innerHTML.includes('data-camera="chase"'));
      assert.ok(mockContainer.innerHTML.includes('data-camera="cockpit"'));
      assert.ok(mockContainer.innerHTML.includes('data-camera="free"'));
      assert.ok(mockContainer.innerHTML.includes('gm-replay-viewport-3d'));
      assert.ok(mockContainer.innerHTML.includes('gm-replay-telemetry-container'));
      assert.ok(mockContainer.innerHTML.includes('data-action="toggle-play"'));
      assert.ok(mockContainer.innerHTML.includes('data-speed="1"'));
      assert.ok(mockContainer.innerHTML.includes('data-speed="20"'));

      assert.ok(view.engine instanceof HeadlessReplayEngine);
      assert.equal(view.activeCameraMode, 'chase');
      assert.equal(view.activeSpeed, 1);

      view.unmount();
      assert.equal(view.engine, null);
      assert.equal(view.containerEl, null);
    });

    it('should control playback state via handleTogglePlay', async () => {
      const view = new FlightReplayView();
      await view.mount(mockContainer, 'demo-flight');

      assert.equal(view.engine.isPlaying, false);

      view.handleTogglePlay();
      assert.equal(view.engine.isPlaying, true);

      view.handleTogglePlay();
      assert.equal(view.engine.isPlaying, false);

      view.unmount();
    });

    it('should handle speed changes across presets', async () => {
      const view = new FlightReplayView();
      await view.mount(mockContainer, 'demo-flight');

      view.handleSpeedChange(5);
      assert.equal(view.activeSpeed, 5);
      assert.equal(view.engine.speed, 5);

      view.handleSpeedChange(20);
      assert.equal(view.activeSpeed, 20);
      assert.equal(view.engine.speed, 20);

      view.unmount();
    });

    it('should handle camera mode switching', async () => {
      const view = new FlightReplayView();
      await view.mount(mockContainer, 'demo-flight');

      view.handleCameraChange('cockpit');
      assert.equal(view.activeCameraMode, 'cockpit');
      assert.equal(view.engine.cameraMode, 'cockpit');

      view.handleCameraChange('free');
      assert.equal(view.activeCameraMode, 'free');
      assert.equal(view.engine.cameraMode, 'free');

      view.unmount();
    });

    it('should toggle terrain elevation offset (0m, +50m, -50m)', async () => {
      const view = new FlightReplayView();
      await view.mount(mockContainer, 'demo-flight');

      assert.equal(view.elevationOffset, 0);

      view.handleToggleElevationOffset();
      assert.equal(view.elevationOffset, 50);
      assert.equal(view.engine.elevationOffset, 50);

      view.handleToggleElevationOffset();
      assert.equal(view.elevationOffset, -50);
      assert.equal(view.engine.elevationOffset, -50);

      view.handleToggleElevationOffset();
      assert.equal(view.elevationOffset, 0);
      assert.equal(view.engine.elevationOffset, 0);

      view.unmount();
    });

    it('should delegate seek requests to engine', async () => {
      const view = new FlightReplayView();
      await view.mount(mockContainer, 'demo-flight');

      view.handleSeek(0.75);
      assert.equal(view.engine.progress, 0.75);

      view.unmount();
    });
  });
});
