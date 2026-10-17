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

  it('should support manual camera orbit offsets in chase mode and reset them when re-selecting chase', async () => {
    await engine.init(null);
    await engine.loadTrack(mockTrackPoints);

    assert.ok(engine._cameraState, 'Engine should initialize spring-damper camera state on loadTrack');
    const initialBearing = engine._cameraState.bearing;

    engine.applyUserCameraOrbit(35, -8, 0.5);
    assert.equal(engine.userBearingOffsetDeg, 35);
    assert.equal(engine.userPitchOffsetDeg, -8);
    assert.equal(engine.userZoomOffset, 0.5);

    engine.seek(0.5);
    assert.ok(Math.abs(engine._cameraState.bearing - initialBearing) > 10, 'Camera bearing should incorporate user orbit offset');

    // Re-tapping Segui (setCameraMode('chase')) resets manual orbit offsets
    engine.setCameraMode('chase');
    assert.equal(engine.userBearingOffsetDeg, 0);
    assert.equal(engine.userPitchOffsetDeg, 0);
    assert.equal(engine.userZoomOffset, 0);
  });

  it('should compute negative _minTrackY when flight descends below takeoff altitude so drop curtain never collapses at y=0', async () => {
    await engine.init(null);
    const sledRideTrack = [
      { lat: 46.5000, lon: 11.5000, alt: 1800, timeSeconds: 0 },
      { lat: 46.5050, lon: 11.5080, alt: 1400, timeSeconds: 120 },
      { lat: 46.5100, lon: 11.5160, alt: 950, timeSeconds: 240 }
    ];
    await engine.loadTrack(sledRideTrack);
    assert.equal(engine._minTrackY, -850, 'Landing 850m below takeoff must set _minTrackY = -850');
  });

  it('should converge ray-terrain intersection on steep uphill slopes (slope * tan(pitch) > 1) without vertical cobweb vibration', async () => {
    engine.isHeadless = false;
    const metersPerDegLat = (Math.PI / 180) * 6378137.0;

    // Steep 38-degree south-facing mountain wall: terrain rises North at 0.78m per horizontal meter
    // Since tan(60°) = 1.732, |T'(E)| = 0.78 * 1.732 = 1.35 > 1, which diverges under naive fixed-point cobweb iteration
    const queryDem = ([lon, lat]) => {
      const northMeters = (lat - 46.5000) * metersPerDegLat;
      return Math.max(300, Math.min(2800, 1200 + 0.78 * northMeters));
    };

    const mockMap = {
      transform: { elevation: 1200, cameraToCenterDistance: 900 },
      queryTerrainElevation: queryDem,
      jumpTo(opts) {
        if (opts?.center) {
          this.transform.elevation = queryDem(opts.center);
        }
      },
      getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
      getZoom: () => 14.3,
      getPitch: () => 60,
      getBearing: () => 0,
      triggerRepaint: () => {}
    };
    engine.map = mockMap;
    engine.origin = { lat: 46.5000, lon: 11.5000, alt: 1800, meterScale: 1e-7 };
    engine.terrainDelta = 0;
    engine._hasSnappedTerrain = true;
    engine.isPlaying = true;

    const opticalErrors = [];
    const refElevHistory = [];

    for (let step = 0; step < 30; step++) {
      const pt = {
        lat: 46.5000 + (step * 2.5) / metersPerDegLat,
        lon: 11.5000,
        alt: 1800 + step * 0.8,
        y: step * 0.8,
        heading: 90,
        smoothHeading: 90,
        guideHeading: 90,
        valleyBearingDeg: 180
      };
      engine._updateCameraForFrame(pt, 0.05);

      const state = engine._cameraState;
      const actualCenterTerr = mockMap.transform.elevation;
      const opticalErrorMeters = Math.abs(actualCenterTerr - state.referenceElevationMsl);
      opticalErrors.push(opticalErrorMeters);
      refElevHistory.push(state.referenceElevationMsl);

      assert.ok(
        opticalErrorMeters < 0.5,
        `Frame ${step}: expected |centerElevation (${actualCenterTerr.toFixed(2)}) - referenceElevationMsl (${state.referenceElevationMsl.toFixed(2)})| < 0.5m, got ${opticalErrorMeters.toFixed(2)}m`
      );
    }

    // Verify smooth monotonic progression of referenceElevationMsl without frame-to-frame sign-alternating oscillation
    for (let i = 2; i < refElevHistory.length; i++) {
      const d1 = refElevHistory[i - 1] - refElevHistory[i - 2];
      const d2 = refElevHistory[i] - refElevHistory[i - 1];
      assert.ok(
        d1 * d2 >= -0.05,
        `Detected frame-to-frame vertical ping-pong between frames ${i - 2}..${i}: d1=${d1.toFixed(2)}, d2=${d2.toFixed(2)}`
      );
    }
  });

  it('should maintain camera gaze locked on the paraglider when paused across seek, pause, user orbit/pitch/zoom/pan, and async DEM updates', async () => {
    engine.isHeadless = false;
    const listeners = {};
    let dragPanDisabled = false;
    let centerDemElev = 950;

    const mockMap = {
      transform: { elevation: centerDemElev, cameraToCenterDistance: 900 },
      _center: [11.5000, 46.5000],
      _bearing: 0,
      _pitch: 60,
      _zoom: 14.3,
      dragPan: {
        disable() { dragPanDisabled = true; },
        enable() { dragPanDisabled = false; }
      },
      jumpTo(opts) {
        if (opts.center) this._center = opts.center;
        if (typeof opts.bearing === 'number') this._bearing = opts.bearing;
        if (typeof opts.pitch === 'number') this._pitch = opts.pitch;
        if (typeof opts.zoom === 'number') this._zoom = opts.zoom;
        this.transform.elevation = centerDemElev;
      },
      getZoom() { return this._zoom; },
      getBearing() { return this._bearing; },
      getPitch() { return this._pitch; },
      getCenter() { return { lng: this._center[0], lat: this._center[1] }; },
      getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
      getLayer: () => null,
      removeLayer: () => {},
      addLayer: () => {},
      fitBounds: () => {},
      triggerRepaint: () => {},
      on(evt, cb) { listeners[evt] = cb; },
      off(evt) { delete listeners[evt]; },
      once(evt, cb) { listeners[`once_${evt}`] = cb; }
    };

    engine.map = mockMap;
    engine.THREE = {};
    engine.maplibregl = {
      MercatorCoordinate: {
        fromLngLat(lngLat, alt) {
          return {
            x: 0.5,
            y: 0.5,
            z: (alt || 0) * 1e-7,
            meterInMercatorCoordinateUnits: () => 1e-7
          };
        }
      }
    };

    const thermalTrack = [
      { lat: 46.5000, lon: 11.5000, alt: 1800, timeSeconds: 0, speedKmh: 36, vario: 1.5, heading: 45 },
      { lat: 46.5040, lon: 11.5060, alt: 1950, timeSeconds: 30, speedKmh: 36, vario: 2.8, heading: 180 },
      { lat: 46.5080, lon: 11.5120, alt: 2100, timeSeconds: 60, speedKmh: 38, vario: 1.2, heading: 310 }
    ];

    await engine.loadTrack(thermalTrack);
    assert.equal(dragPanDisabled, true, 'dragPan must be disabled in chase mode so dragging does not pan away from glider');

    // Helper to verify that the 3D optical ray from map.center at centerDemElev along (-bearing, pitch) passes directly through the 3D glider
    const assertRayHitsGlider = (label) => {
      const st = engine._cameraState;
      const metersPerDegLat = (Math.PI / 180) * 6378137.0;
      const metersPerDegLon = metersPerDegLat * Math.cos((st.focusLat * Math.PI) / 180);
      const dEast = (mockMap._center[0] - st.focusLon) * metersPerDegLon;
      const dNorth = (mockMap._center[1] - st.focusLat) * metersPerDegLat;
      const bRad = (mockMap._bearing * Math.PI) / 180;
      const pRad = (mockMap._pitch * Math.PI) / 180;
      const expectedForward = (st.focusAlt - mockMap.transform.elevation) * Math.tan(pRad);
      const expectedEast = Math.sin(bRad) * expectedForward;
      const expectedNorth = Math.cos(bRad) * expectedForward;
      const horizRayErr = Math.hypot(dEast - expectedEast, dNorth - expectedNorth);
      assert.ok(
        horizRayErr < 1.0,
        `${label}: optical ray missed 3D glider by ${horizRayErr.toFixed(2)}m`
      );
      assert.equal(st.anchorLat, st.focusLat, `${label}: paused anchorLat must lock to focusLat`);
      assert.equal(st.anchorLon, st.focusLon, `${label}: paused anchorLon must lock to focusLon`);
      assert.equal(st.anchorAlt, st.focusAlt, `${label}: paused anchorAlt must lock to focusAlt`);
    };

    // 1. Initial load before play
    assertRayHitsGlider('Initial paused load');

    // 2. Seek while paused to 50%
    engine.seek(0.5);
    assertRayHitsGlider('Seek to 50% while paused');

    // 3. User rotates camera by +40° while paused via map rotate gesture
    mockMap._bearing = (mockMap._bearing + 40) % 360;
    listeners.rotate({ originalEvent: {} });
    assertRayHitsGlider('User rotate gesture while paused');

    // 4. User pitches camera by -10° while paused via map pitch gesture
    mockMap._pitch = Math.max(15, mockMap._pitch - 10);
    listeners.pitch({ originalEvent: {} });
    assertRayHitsGlider('User pitch gesture while paused');

    // 5. User zooms camera by +0.6 while paused via map zoom gesture
    mockMap._zoom += 0.6;
    listeners.zoom({ originalEvent: {} });
    assertRayHitsGlider('User zoom gesture while paused');

    // 6. Accidental map pan while paused is immediately re-centered onto the glider
    mockMap._center = [11.5500, 46.5500];
    listeners.move({ originalEvent: {} });
    assertRayHitsGlider('Accidental pan recovery while paused');

    // 7. Async DEM tile updates elevation while paused and fires idle
    centerDemElev = 1320;
    mockMap.transform.elevation = 1320;
    listeners.idle();
    assertRayHitsGlider('Async DEM idle update while paused');

    // 8. Switching to free mode enables dragPan; switching back to chase disables it and re-locks gaze
    engine.setCameraMode('free');
    assert.equal(dragPanDisabled, false, 'dragPan must be enabled in free mode');
    engine.setCameraMode('chase');
    assert.equal(dragPanDisabled, true, 'dragPan must be disabled when returning to chase mode');
    assertRayHitsGlider('Return to chase mode while paused');
  });

  it('should converge on a non-monotonic knife-edge ridge without post-loop cobweb oscillation and preserve autoRigBearing on pause', async () => {
    engine.isHeadless = false;
    const listeners = {};
    // Non-monotonic knife-edge ridge: terrain rises steeply up to a crest then drops off
    const evalKnifeRidge = (lon, lat) => {
      const northMeters = (lat - 46.5000) * 111320;
      const crestDist = Math.abs(northMeters - 1100);
      return Math.max(400, 1720 - 1.6 * crestDist);
    };

    const mockMap = {
      transform: { elevation: 900, cameraToCenterDistance: 900 },
      _center: [11.5000, 46.5000],
      _bearing: 0,
      _pitch: 60,
      _zoom: 14.3,
      dragPan: { disable() {}, enable() {} },
      queryTerrainElevation([lon, lat]) {
        return evalKnifeRidge(lon, lat);
      },
      jumpTo(opts) {
        if (opts.center) this._center = opts.center;
        if (typeof opts.bearing === 'number') this._bearing = opts.bearing;
        if (typeof opts.pitch === 'number') this._pitch = opts.pitch;
        if (typeof opts.zoom === 'number') this._zoom = opts.zoom;
        this.transform.elevation = evalKnifeRidge(this._center[0], this._center[1]);
      },
      getZoom() { return this._zoom; },
      getBearing() { return this._bearing; },
      getPitch() { return this._pitch; },
      getCenter() { return { lng: this._center[0], lat: this._center[1] }; },
      getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
      getLayer: () => null,
      removeLayer: () => {},
      addLayer: () => {},
      fitBounds: () => {},
      triggerRepaint: () => {},
      on(evt, cb) { listeners[evt] = cb; },
      off(evt) { delete listeners[evt]; },
      once(evt, cb) { listeners[`once_${evt}`] = cb; }
    };

    engine.map = mockMap;
    engine.THREE = {};
    engine.maplibregl = {
      MercatorCoordinate: {
        fromLngLat(lngLat, alt) {
          return {
            x: 0.5,
            y: 0.5,
            z: (alt || 0) * 1e-7,
            meterInMercatorCoordinateUnits: () => 1e-7
          };
        }
      }
    };

    await engine.loadTrack([
      { lat: 46.5000, lon: 11.5000, alt: 1900, timeSeconds: 0, speedKmh: 36, vario: 2.5, heading: 0 },
      { lat: 46.5005, lon: 11.5005, alt: 1950, timeSeconds: 20, speedKmh: 36, vario: 2.5, heading: 165 }
    ]);

    const refElevs = [];
    for (let i = 0; i < 15; i++) {
      engine._updateCurrentFrame(engine.projectedTrack.points[0], 0.05);
      refElevs.push(engine._cameraState.referenceElevationMsl);
    }

    const residual = Math.abs(mockMap.transform.elevation - engine._cameraState.referenceElevationMsl);
    assert.ok(residual < 0.2, `Expected knife-edge ridge residual < 0.2m, got ${residual.toFixed(4)}m`);
    const maxStepDiff = Math.max(...refElevs.slice(1).map((v, i) => Math.abs(v - refElevs[i])));
    assert.ok(maxStepDiff < 0.05, `Expected zero cobweb oscillation on knife-edge ridge, got ${maxStepDiff.toFixed(4)}m`);

    // Simulate playing into a thermal where autoRigBearing is rotationally locked while glider heading changes to 165°
    engine.isPlaying = true;
    engine._cameraState.isThermalMode = true;
    engine._cameraState.thermalEntryProgress = 1.0;
    engine._cameraState.autoRigBearing = 12;
    engine._cameraState.bearing = 12;
    engine.currentTimeSec = 20;

    // Pausing must preserve the locked autoRigBearing (12°) rather than snapping to current point heading (165°)
    engine.pause();
    assert.ok(
      Math.abs(engine._cameraState.bearing - 12) < 1.0,
      `Expected pause() to preserve camera bearing ~12°, got ${engine._cameraState.bearing.toFixed(2)}°`
    );
  });
});
