import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MapLibreThreeEngine, BASEMAP_LAYERS_3D } from '../../ui/3d/MapLibreThreeEngine.js';

describe('MapLibreThreeEngine - 3D MapLibre & Three Engine Contracts', () => {
  let engine;

  const mockTrackPoints = [
    { lat: 46.5000, lon: 11.5000, alt: 1800, timeSeconds: 0, speedKmh: 36, vario: 1.2, heading: 45 },
    { lat: 46.5050, lon: 11.5080, alt: 1850, timeSeconds: 30, speedKmh: 40, vario: 1.8, heading: 50 },
    { lat: 46.5100, lon: 11.5160, alt: 1900, timeSeconds: 60, speedKmh: 38, vario: 0.5, heading: 60 }
  ];

  beforeEach(() => {
    engine = new MapLibreThreeEngine();
  });

  it('should initialize with default playback state and options', () => {
    assert.equal(engine.isPlaying, false);
    assert.equal(engine.progress, 0);
    assert.equal(engine.currentTimeSec, 0);
    assert.equal(engine.playbackSpeed, 1);
    assert.equal(engine.cameraMode, 'chase');
    assert.equal(engine.elevationOffset, 0);
    assert.equal(engine.isContextLost, false);
    assert.equal(engine.isDestroyed, false);
  });

  it('should initialize gracefully in Node.js without crashing', async () => {
    const success = await engine.init('#mock-viewport');
    assert.equal(success, true);
    assert.equal(engine.isHeadless, true);
  });

  it('should load track points, project to Three.js topocentric local space, and emit initial timeupdate', async () => {
    await engine.init(null);

    let emittedUpdate = null;
    engine.on('timeupdate', (data) => {
      emittedUpdate = data;
    });

    await engine.loadTrack(mockTrackPoints);

    assert.ok(engine.projectedTrack);
    assert.equal(engine.projectedTrack.points.length, 3);
    assert.ok(engine.origin);
    assert.equal(engine.origin.lat, 46.5000);
    assert.equal(engine.origin.lon, 11.5000);
    assert.equal(engine.origin.alt, 1800);
    assert.ok(engine.origin.meterScale > 0);

    // Initial origin point is (0, 0, 0) relative to P0 altitude space
    const p0 = engine.projectedTrack.points[0];
    assert.equal(p0.x, 0);
    assert.equal(p0.y, 0);
    assert.equal(p0.z, 0);
    assert.equal(p0.alt, 1800);

    assert.ok(emittedUpdate);
    assert.equal(emittedUpdate.progress, 0);
    assert.equal(emittedUpdate.currentTimeSec, 0);
  });

  it('should handle seek and interpolate samples across track', async () => {
    await engine.init(null);
    await engine.loadTrack(mockTrackPoints);

    let latestUpdate = null;
    engine.on('timeupdate', (data) => {
      latestUpdate = data;
    });

    // Seek to 50%
    engine.seek(0.5);

    assert.equal(engine.progress, 0.5);
    assert.equal(engine.currentTimeSec, 30);
    assert.ok(latestUpdate);
    assert.equal(latestUpdate.progress, 0.5);
    assert.equal(latestUpdate.currentTimeSec, 30);
    assert.ok(latestUpdate.currentPoint);
    assert.equal(latestUpdate.currentPoint.alt, 1850);
  });

  it('should control playback state and emit play, pause, and ended events', async () => {
    await engine.init(null);
    await engine.loadTrack(mockTrackPoints);

    let played = false;
    let paused = false;

    engine.on('play', () => { played = true; });
    engine.on('pause', () => { paused = true; });

    engine.play();
    assert.equal(engine.isPlaying, true);
    assert.equal(played, true);

    engine.pause();
    assert.equal(engine.isPlaying, false);
    assert.equal(paused, true);
  });

  it('should update playback speed and clamp to valid values', () => {
    engine.setPlaybackSpeed(5);
    assert.equal(engine.playbackSpeed, 5);

    engine.setPlaybackSpeed(20);
    assert.equal(engine.playbackSpeed, 20);

    engine.setPlaybackSpeed(-2);
    assert.equal(engine.playbackSpeed, 0.25);
  });

  it('should switch camera mode and emit camerachange event', () => {
    let modeChanged = null;
    engine.on('camerachange', (data) => {
      modeChanged = data.mode;
    });

    engine.setCameraMode('cockpit');
    assert.equal(engine.cameraMode, 'cockpit');
    assert.equal(modeChanged, 'cockpit');

    engine.setCameraMode('free');
    assert.equal(engine.cameraMode, 'free');
    assert.equal(modeChanged, 'free');

    // Invalid mode should be ignored
    engine.setCameraMode('invalid_mode');
    assert.equal(engine.cameraMode, 'free');
  });

  it('should set elevation offset and update state', () => {
    engine.setElevationOffset(15);
    assert.equal(engine.elevationOffset, 15);
  });

  it('should handle WebGL context lost and restored lifecycle safely', () => {
    let lostEmitted = false;
    let restoredEmitted = false;

    engine.on('contextlost', () => { lostEmitted = true; });
    engine.on('contextrestored', () => { restoredEmitted = true; });

    engine._handleContextLost({ preventDefault: () => {} });
    assert.equal(engine.isContextLost, true);
    assert.equal(lostEmitted, true);
    assert.equal(engine.isPlaying, false);

    engine._handleContextRestored();
    assert.equal(engine.isContextLost, false);
    assert.equal(restoredEmitted, true);
  });

  it('should cleanly destroy engine and clean resources', async () => {
    await engine.init(null);
    await engine.loadTrack(mockTrackPoints);
    engine.play();

    engine.destroy();

    assert.equal(engine.isDestroyed, true);
    assert.equal(engine.isPlaying, false);
    assert.equal(engine.container, null);
    assert.equal(engine._listeners.size, 0);
  });

  it('should expose keyless 3D basemaps without CARTO or API key query parameters', () => {
    assert.ok(BASEMAP_LAYERS_3D.dark, 'Must provide dark basemap');
    assert.ok(BASEMAP_LAYERS_3D.satellite, 'Must provide satellite basemap');
    assert.ok(BASEMAP_LAYERS_3D.topo, 'Must provide topo basemap');
    assert.ok(BASEMAP_LAYERS_3D.streets, 'Must provide streets basemap');

    for (const [key, config] of Object.entries(BASEMAP_LAYERS_3D)) {
      for (const tileUrl of config.tiles) {
        assert.ok(!tileUrl.includes('cartocdn.com'), `Layer ${key} must not use CARTO (API key required)`);
        assert.ok(!tileUrl.includes('key='), `Layer ${key} must not require an API key in query`);
        assert.ok(!tileUrl.includes('token='), `Layer ${key} must not require an access token`);
      }
    }
  });

  it('should switch map layer and update engine options via setMapLayer', () => {
    engine.setMapLayer('satellite');
    assert.equal(engine.options.mapLayer, 'satellite');

    engine.setMapLayer('topo');
    assert.equal(engine.options.mapLayer, 'topo');

    // Invalid layer is ignored
    engine.setMapLayer('unknown_layer');
    assert.equal(engine.options.mapLayer, 'topo');
  });
});
