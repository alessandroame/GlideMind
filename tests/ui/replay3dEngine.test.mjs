import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IReplay3dEngine } from '../../ui/3d/IReplay3dEngine.js';
import { HeadlessReplayEngine } from '../../ui/3d/HeadlessReplayEngine.js';

describe('3D Flight Replay Engine Contracts & Headless Engine', () => {

  describe('IReplay3dEngine Abstract Contract', () => {
    it('should throw on unimplemented lifecycle and control methods in base class', async () => {
      const base = new IReplay3dEngine();

      await assert.rejects(async () => base.init({}), /must be implemented/);
      await assert.rejects(async () => base.loadTrack([]), /must be implemented/);
      assert.throws(() => base.seek(0.5), /must be implemented/);
      assert.throws(() => base.setPlaybackSpeed(2), /must be implemented/);
      assert.throws(() => base.setCameraMode('cockpit'), /must be implemented/);
      assert.throws(() => base.setElevationOffset(10), /must be implemented/);
      assert.throws(() => base.play(), /must be implemented/);
      assert.throws(() => base.pause(), /must be implemented/);
    });

    it('should support event subscription, dispatching, and unsubscription', () => {
      const engine = new IReplay3dEngine();
      let eventPayload = null;

      const unsubscribe = engine.on('test-event', (data) => {
        eventPayload = data;
      });

      engine.emit('test-event', { value: 42 });
      assert.deepEqual(eventPayload, { value: 42 });

      // Unsubscribe
      unsubscribe();
      engine.emit('test-event', { value: 99 });
      assert.deepEqual(eventPayload, { value: 42 }); // Unchanged
    });
  });

  describe('HeadlessReplayEngine Concrete Implementation', () => {
    const sampleTrack = [
      { lat: 45.5000000, lon: 7.8000000, alt: 1200, timeSeconds: 100, speedKmh: 36, vario: 1.0, heading: 90 },
      { lat: 45.5010000, lon: 7.8010000, alt: 1250, timeSeconds: 120, speedKmh: 40, vario: 2.5, heading: 100 },
      { lat: 45.5020000, lon: 7.8020000, alt: 1300, timeSeconds: 140, speedKmh: 38, vario: 1.5, heading: 110 }
    ];

    it('should initialize and load track calculating total duration and project points', async () => {
      const engine = new HeadlessReplayEngine();
      await engine.init({});
      await engine.loadTrack(sampleTrack);

      assert.equal(engine.totalDurationSec, 40); // 140 - 100
      assert.equal(engine.trackPoints.length, 3);
      assert.ok(engine.projected);
      assert.equal(engine.projected.points.length, 3);
    });

    it('should seek deterministically and emit timeupdate with interpolated samples', async () => {
      const engine = new HeadlessReplayEngine();
      await engine.init({});
      await engine.loadTrack(sampleTrack);

      let timeUpdateData = null;
      engine.on('timeupdate', (data) => {
        timeUpdateData = data;
      });

      // Seek to midpoint (0.5)
      engine.seek(0.5);

      assert.equal(engine.progress, 0.5);
      assert.equal(engine.currentTimeSec, 20); // 0.5 * 40s
      assert.ok(timeUpdateData);
      assert.equal(timeUpdateData.progress, 0.5);
      assert.equal(timeUpdateData.currentTimeSec, 20);
      assert.ok(timeUpdateData.currentPoint);
      assert.equal(timeUpdateData.currentPoint.lat, 45.501);
      assert.equal(timeUpdateData.currentPoint.alt, 1250);
    });

    it('should support playback simulation and step advancing until ended', async () => {
      const engine = new HeadlessReplayEngine();
      await engine.init({});
      await engine.loadTrack(sampleTrack);

      let playFired = false;
      let pauseFired = false;
      let endedFired = false;

      engine.on('play', () => { playFired = true; });
      engine.on('pause', () => { pauseFired = true; });
      engine.on('ended', () => { endedFired = true; });

      engine.play();
      assert.equal(engine.isPlaying, true);
      assert.equal(playFired, true);

      // Step by 20s (half of 40s duration at speed 1x)
      engine.step(20);
      assert.equal(engine.progress, 0.5);

      // Pause
      engine.pause();
      assert.equal(engine.isPlaying, false);
      assert.equal(pauseFired, true);

      // Resume and step past the end
      engine.play();
      engine.step(25); // 20 + 25 = 45 > 40s
      assert.equal(engine.progress, 1.0);
      assert.equal(engine.isPlaying, false);
      assert.equal(endedFired, true);
    });

    it('should set speed multipliers and camera modes emitting events', async () => {
      const engine = new HeadlessReplayEngine();
      await engine.init({});

      let speedEvent = null;
      engine.on('speedchange', (d) => { speedEvent = d; });
      engine.setPlaybackSpeed(5);
      assert.equal(engine.speed, 5);
      assert.deepEqual(speedEvent, { speed: 5 });

      let cameraEvent = null;
      engine.on('camerachange', (d) => { cameraEvent = d; });
      engine.setCameraMode('cockpit');
      assert.equal(engine.cameraMode, 'cockpit');
      assert.deepEqual(cameraEvent, { cameraMode: 'cockpit' });
    });

    it('should apply elevation offset to current sample effective altitude', async () => {
      const engine = new HeadlessReplayEngine();
      await engine.init({});
      await engine.loadTrack(sampleTrack);

      engine.seek(0);
      assert.equal(engine.currentSample.y, 1200);
      assert.equal(engine.currentSample.effectiveY, 1200);

      engine.setElevationOffset(-50);
      assert.equal(engine.elevationOffset, -50);
      assert.equal(engine.currentSample.effectiveY, 1150);
    });

    it('should simulate context loss and restoration gracefully', async () => {
      const engine = new HeadlessReplayEngine();
      await engine.init({});
      await engine.loadTrack(sampleTrack);
      engine.play();

      let lostFired = false;
      let restoredFired = false;

      engine.on('contextlost', () => { lostFired = true; });
      engine.on('contextrestored', () => { restoredFired = true; });

      engine.simulateContextLost();
      assert.equal(engine.isContextLost, true);
      assert.equal(engine.isPlaying, false);
      assert.equal(lostFired, true);

      // Seek should be blocked during context loss
      engine.seek(0.8);
      assert.equal(engine.progress, 0);

      engine.simulateContextRestored();
      assert.equal(engine.isContextLost, false);
      assert.equal(restoredFired, true);
    });

    it('should destroy resources cleanly', async () => {
      const engine = new HeadlessReplayEngine();
      await engine.init({});
      await engine.loadTrack(sampleTrack);
      engine.play();

      engine.destroy();
      assert.equal(engine.isDestroyed, true);
      assert.equal(engine.isPlaying, false);
      assert.equal(engine.trackPoints.length, 0);
    });
  });
});
