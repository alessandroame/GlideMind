/**
 * GlideMind - MapLibre GL 3D + Three.js Flight Replay Engine (UI 3D Layer)
 * 
 * Implements IReplay3dEngine with:
 * 1. MapLibre GL JS (v4.7.1) with 3D Terrarium DEM terrain
 * 2. Three.js (r128) CustomLayer with single-shot P0 origin alignment
 * 3. 3D flight trajectory ribbon with FAI variometer vertex coloring
 * 4. Ground drop curtain lines for vertical depth perception
 * 5. 3D Paraglider avatar with aerodynamic roll, pitch, heading, and distance scaling
 * 6. Chase, Cockpit, and Free camera modes
 * 7. WebGL context loss recovery (webglcontextlost / webglcontextrestored)
 * 8. Pure Node.js & offline fallback resilience (zero DOM crash)
 * 
 * Strictly adheres to geodesy_webgl_3d_spec.md and laws-of-ux outdoor ergonomics.
 */

import { IReplay3dEngine } from './IReplay3dEngine.js';
import {
  projectTrackToThreeLocal,
  interpolateTrackSample,
  calculateAvatarMinScale,
  calculateRibbonDimensions,
  stepCameraSpringDamper,
  computeCameraGroundTargetForAltitude,
  buildSmoothTrackGeometryData
} from '../../core/flightReplayMath.js';
import { sampleVarioRgb } from '../../core/flightTelemetry.js';
import { loadScriptOnce } from '../scriptLoader.js';
import { createParagliderMesh, updateAvatarPose } from './models/paragliderModel.js';

export const CDN_ASSETS = Object.freeze({
  MAPLIBRE_JS: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
  MAPLIBRE_CSS: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
  THREE_JS: 'https://unpkg.com/three@0.128.0/build/three.min.js',
  TERRARIUM_DEM: 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'
});

/**
 * High-resolution 3D raster basemaps requiring ZERO API keys (no watermark, no rate limit blocks).
 */
export const BASEMAP_LAYERS_3D = Object.freeze({
  dark: Object.freeze({
    id: 'dark',
    name: 'Scuro',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Dark Gray Canvas',
    maxzoom: 16
  }),
  satellite: Object.freeze({
    id: 'satellite',
    name: 'Satellite',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a> &mdash; World Imagery',
    maxzoom: 19
  }),
  topo: Object.freeze({
    id: 'topo',
    name: 'OpenTopo',
    tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'],
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    maxzoom: 17
  }),
  streets: Object.freeze({
    id: 'streets',
    name: 'CyclOSM / OSM',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxzoom: 19
  })
});

export class MapLibreThreeEngine extends IReplay3dEngine {
  constructor(options = {}) {
    super();
    this.options = {
      terrainUrl: CDN_ASSETS.TERRARIUM_DEM,
      demEncoding: 'terrarium',
      initialCameraMode: 'chase',
      mapLayer: options.mapLayer || null,
      ...options
    };

    this.container = null;
    this.map = null;
    this.THREE = null;
    this.maplibregl = null;

    // Three.js Scene Entities
    this.threeScene = null;
    this.threeCamera = null;
    this.threeRenderer = null;
    this.glCustomLayer = null;
    this.avatarGroup = null;
    this.avatarGroundLine = null;
    this.avatarShadowRing = null;
    this.trackRibbonMesh = null;
    this.ghostRibbonMesh = null;
    this.centerLineMesh = null;
    this.ghostLineMesh = null;
    this.wakeTrailMesh = null;
    this.takeoffMarker = null;
    this.landingMarker = null;
    this.curtainMesh = null;
    this._ribbonPoints = null;
    this._ribbonNormals = null;
    this._currentRibbonZoom = null;
    this._lastModifiedIndex = null;
    this._lastCurrentPoint = null;
    this._totalCurtainVertices = 0;
    this._curtainStep = 10;
    this._curtainPointIndices = null;
    this._minTrackY = 0;

    // Trajectory & Geodesic Projection State
    this.rawPoints = [];
    this.projectedTrack = null;
    this.origin = null; // { lat, lon, alt, meterScale }
    this.modelTransform = null;

    // Playback & Camera Controller State
    this.isPlaying = false;
    this.progress = 0;
    this.currentTimeSec = 0;
    this.playbackSpeed = 1;
    this.cameraMode = this.options.initialCameraMode || 'chase';
    this._cameraState = null;
    this.userBearingOffsetDeg = 0;
    this.userPitchOffsetDeg = 0;
    this.userZoomOffset = 0;
    this._isProgrammaticCameraMove = false;
    this.elevationOffset = 0;
    this.terrainDelta = 0;
    this._hasSnappedTerrain = false;
    this._lastValidCenterElevation = 0;
    this.hasPlaybackStarted = false;

    // Preallocated reusable scratch objects for 60 FPS render loop (Lesson 116)
    this._mProj = null;
    this._coordTransform = null;
    this._reusableVec3A = null;
    this._reusableVec3B = null;

    // Loop & Recovery Guards
    this._animationFrameId = null;
    this._lastFrameTimeMs = null;
    this.isContextLost = false;
    this.isDestroyed = false;
    this.isHeadless = false;

    // Bound handlers
    this._onContextLost = this._handleContextLost.bind(this);
    this._onContextRestored = this._handleContextRestored.bind(this);
  }

  /**
   * Initializes MapLibre and Three.js environments inside target container.
   * 
   * @param {HTMLElement|string} canvasContainer
   * @param {object} [initOptions]
   * @returns {Promise<boolean>}
   */
  async init(canvasContainer, initOptions = {}) {
    if (typeof canvasContainer === 'string' && typeof document !== 'undefined') {
      this.container = document.querySelector(canvasContainer);
    } else {
      this.container = canvasContainer;
    }

    // Node.js / Headless environment detection
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      this.isHeadless = true;
      return true;
    }

    try {
      // 1. Load CSS stylesheet
      this._injectStyles();

      // 2. Load Libraries concurrently
      const [maplibreModule, threeModule] = await Promise.all([
        loadScriptOnce(CDN_ASSETS.MAPLIBRE_JS, 'maplibregl'),
        loadScriptOnce(CDN_ASSETS.THREE_JS, 'THREE')
      ]);

      this.maplibregl = maplibreModule || window.maplibregl;
      this.THREE = threeModule || window.THREE;

      if (!this.maplibregl || !this.THREE) {
        this.isHeadless = true;
        return true;
      }

      // Check WebGL availability
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
      if (!gl) {
        this.isHeadless = true;
        return true;
      }

      // 3. Instantiate MapLibre Map
      if (!this.container) return true;

      const mapContainer = document.createElement('div');
      mapContainer.className = 'gm-maplibre-3d-viewport';
      mapContainer.style.width = '100%';
      mapContainer.style.height = '100%';
      mapContainer.style.position = 'absolute';
      mapContainer.style.top = '0';
      mapContainer.style.left = '0';
      this.container.innerHTML = '';
      this.container.appendChild(mapContainer);

      const isLight = document.documentElement && document.documentElement.getAttribute('data-theme') === 'light';
      const activeLayerKey = this.options.mapLayer || 'satellite';
      const baseConfig = BASEMAP_LAYERS_3D[activeLayerKey] || BASEMAP_LAYERS_3D.satellite;

      const defaultStyle = {
        version: 8,
        sources: {
          'base-raster-tiles': {
            type: 'raster',
            tiles: baseConfig.tiles,
            tileSize: 256,
            attribution: baseConfig.attribution
          }
        },
        layers: [
          {
            id: 'base-raster-layer',
            type: 'raster',
            source: 'base-raster-tiles',
            minzoom: 0,
            maxzoom: baseConfig.maxzoom || 19
          }
        ]
      };

      this.map = new this.maplibregl.Map({
        container: mapContainer,
        style: defaultStyle,
        center: [11.5, 46.5], // Default Dolomites coordinates
        zoom: 12,
        pitch: 60,
        bearing: 0,
        maxPitch: 78,
        antialias: true
      });

      // 4. Setup Terrain & Context Listeners when style loads
      await new Promise((resolve) => {
        if (this.map.isStyleLoaded()) {
          this._setupTerrainSource();
          resolve();
        } else {
          this.map.once('load', () => {
            this._setupTerrainSource();
            resolve();
          });
        }
      });

      const mapCanvas = this.map.getCanvas();
      if (mapCanvas) {
        mapCanvas.addEventListener('webglcontextlost', this._onContextLost, false);
        mapCanvas.addEventListener('webglcontextrestored', this._onContextRestored, false);
      }

      return true;
    } catch {
      // Graceful degradation to headless mock
      this.isHeadless = true;
      return true;
    }
  }

  /**
   * Configures Terrarium DEM raster terrain source on the active map.
   */
  _setupTerrainSource() {
    if (!this.map || !this.maplibregl) return;
    try {
      if (!this.map.getSource('terrarium-dem')) {
        this.map.addSource('terrarium-dem', {
          type: 'raster-dem',
          tiles: [this.options.terrainUrl],
          encoding: this.options.demEncoding,
          tileSize: 256,
          maxzoom: 15
        });
      }

      this.map.setTerrain({
        source: 'terrarium-dem',
        exaggeration: 1.0
      });
    } catch {
      // Offline or network failure: map remains 3D planar without crashing
    }
  }

  /**
   * Dynamically switches the basemap raster layer in 3D.
   * @param {string} layerId - 'dark' | 'satellite' | 'topo' | 'streets'
   */
  setMapLayer(layerId) {
    const config = BASEMAP_LAYERS_3D[layerId];
    if (!config) return;
    this.options.mapLayer = layerId;
    if (!this.map || this.isHeadless) return;

    try {
      if (this.map.getLayer('base-raster-layer')) {
        this.map.removeLayer('base-raster-layer');
      }
      if (this.map.getSource('base-raster-tiles')) {
        this.map.removeSource('base-raster-tiles');
      }

      this.map.addSource('base-raster-tiles', {
        type: 'raster',
        tiles: config.tiles,
        tileSize: 256,
        attribution: config.attribution
      });

      const beforeLayerId = this.glCustomLayer ? this.glCustomLayer.id : undefined;
      this.map.addLayer(
        {
          id: 'base-raster-layer',
          type: 'raster',
          source: 'base-raster-tiles',
          minzoom: 0,
          maxzoom: config.maxzoom || 19
        },
        beforeLayerId
      );
    } catch (err) {
      console.warn('[MapLibreThreeEngine] Warning updating basemap layer:', err);
    }
  }

  /**
   * Attempts to snap takeoff origin altitude to DEM terrain elevation.
   * Conforms strictly to Lesson 116: only snaps when elevation is strictly positive
   * and within plausible envelope (<600m delta from barometric altitude).
   * 
   * @returns {boolean} True if snapped successfully
   */
  _trySnapTerrain() {
    if (!this.map || !this.origin || typeof this.map.queryTerrainElevation !== 'function') {
      return false;
    }
    const terrainElev = this.map.queryTerrainElevation([this.origin.lon, this.origin.lat]);
    if (typeof terrainElev === 'number' && !isNaN(terrainElev) && terrainElev > 0) {
      if (Math.abs(terrainElev - this.origin.alt) < 600) {
        const nextDelta = terrainElev - this.origin.alt;
        // Once snapped, only refine terrainDelta when higher-LOD DEM tiles bring the origin
        // closer to the GPS takeoff altitude, preventing mid-flight origin tile LOD downgrades
        // from shaking the entire 3D scene vertically.
        const shouldUpdate = !this._hasSnappedTerrain || Math.abs(nextDelta) < Math.abs(this.terrainDelta) - 0.25;
        if (shouldUpdate) {
          const deltaChanged = !this._hasSnappedTerrain || Math.abs(nextDelta - this.terrainDelta) > 0.25;
          this.terrainDelta = nextDelta;
          this._hasSnappedTerrain = true;
          if (this.modelTransform) {
            const effectiveAlt = this.origin.alt + this.terrainDelta;
            this.modelTransform.translateZ = effectiveAlt * this.modelTransform.meterScale;
          }
          if (deltaChanged) {
            this._needsPausedFrameSync = true;
            this._clampTrackAboveTerrain();
            this._refreshDropCurtainElevations();
          }
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Ensures every projected track point and takeoff/landing 3D marker maintains a positive
   * clearance (>= +4.5m) above the local 3D DEM terrain mesh so steep slope takeoffs
   * and ridge segments never clip beneath DEM triangles, while smoothing local cliff
   * clearance lifts temporally to prevent vertical sawtooth oscillation.
   */
  _clampTrackAboveTerrain() {
    if (!this._hasSnappedTerrain || !this.projectedTrack || !this.origin || !this.map?.transform || typeof this.map.queryTerrainElevation !== 'function') {
      return;
    }
    const pts = this.projectedTrack.points;
    const n = pts.length;
    if (n === 0) return;

    const effectiveOriginAlt = (this.origin.alt ?? 0) + this.terrainDelta;
    const minClearanceMeters = 5.5;
    const rawLifts = new Float64Array(n);
    const envelopeLifts = new Float64Array(n);
    let anyClamped = false;

    for (let i = 0; i < n; i++) {
      const pt = pts[i];
      if (pt._rawY === undefined) {
        pt._rawY = pt.y;
      }
      if (typeof pt.lon === 'number' && typeof pt.lat === 'number') {
        const demElev = this.map.queryTerrainElevation([pt.lon, pt.lat]);
        if (typeof demElev === 'number' && !isNaN(demElev) && demElev > 0) {
          const localGroundY = demElev - effectiveOriginAlt;
          const minSafeY = localGroundY + minClearanceMeters;
          rawLifts[i] = Math.max(0, minSafeY - pt._rawY);
        }
      }
    }

    // Stage 1: Tapered local upper envelope so narrow DEM triangle ridges remain safely cleared
    for (let i = 0; i < n; i++) {
      const tCenter = pts[i].timeSeconds ?? i;
      let maxEnv = rawLifts[i];
      for (let j = Math.max(0, i - 5); j <= Math.min(n - 1, i + 5); j++) {
        const dt = Math.abs((pts[j].timeSeconds ?? j) - tCenter);
        const envWeight = Math.exp(-0.5 * (dt / 4.0) * (dt / 4.0));
        const candidate = rawLifts[j] * envWeight;
        if (candidate > maxEnv) maxEnv = candidate;
      }
      envelopeLifts[i] = maxEnv;
    }

    // Stage 2: Pure C-infinity Gaussian smoothing of the upper envelope (eliminates 1 Hz DEM sawtooth)
    for (let i = 0; i < n; i++) {
      const pt = pts[i];
      let lift = envelopeLifts[i];
      if (n >= 5 && i > 0 && i < n - 1) {
        let wSum = 0;
        let valSum = 0;
        const tCenter = pt.timeSeconds ?? i;
        for (let j = Math.max(0, i - 8); j <= Math.min(n - 1, i + 8); j++) {
          const dt = Math.abs((pts[j].timeSeconds ?? j) - tCenter);
          const w = Math.exp(-0.5 * (dt / 5.0) * (dt / 5.0));
          wSum += w;
          valSum += envelopeLifts[j] * w;
        }
        if (wSum > 0) {
          lift = valSum / wSum;
        }
      }
      const nextY = Math.round((pt._rawY + lift) * 1000) / 1000;
      if (Math.abs(nextY - pt.y) > 0.01) {
        pt.y = nextY;
        anyClamped = true;
      }
    }

    if (!anyClamped) return;
    this._needsPausedFrameSync = true;

    if (this.trackRibbonMesh) {
      this._updateRibbonDimensions(this._currentRibbonZoom || 14);
    }

    for (const lineMesh of [this.centerLineMesh, this.ghostLineMesh, this.wakeTrailMesh]) {
      if (!lineMesh?.geometry) continue;
      const posAttr = (typeof lineMesh.geometry.getAttribute === 'function')
        ? lineMesh.geometry.getAttribute('position')
        : lineMesh.geometry.attributes?.position;
      if (posAttr?.array) {
        for (let i = 0; i < n; i++) {
          posAttr.array[i * 3 + 1] = pts[i].y;
        }
        posAttr.needsUpdate = true;
      }
    }

    if (this.takeoffMarker && pts[0]) {
      this.takeoffMarker.position.set(pts[0].x, pts[0].y + 0.5, pts[0].z);
    }
    if (this.landingMarker && pts[n - 1]) {
      this.landingMarker.position.set(pts[n - 1].x, pts[n - 1].y + 0.5, pts[n - 1].z);
    }
  }

  /**
   * Fits MapLibre camera bounds over the full loaded flight trajectory.
   * @param {number} [duration=1200]
   */
  fitTrackBounds(duration = 1200) {
    if (!this.map || this.isHeadless || !this.rawPoints || this.rawPoints.length === 0) return;
    const p0 = this.rawPoints[0];
    let minLon = p0.lon, maxLon = p0.lon, minLat = p0.lat, maxLat = p0.lat;
    for (const pt of this.rawPoints) {
      if (pt.lon < minLon) minLon = pt.lon;
      if (pt.lon > maxLon) maxLon = pt.lon;
      if (pt.lat < minLat) minLat = pt.lat;
      if (pt.lat > maxLat) maxLat = pt.lat;
    }
    if (typeof this.map.fitBounds === 'function') {
      this._isProgrammaticCameraMove = true;
      try {
        this.map.fitBounds([[minLon, minLat], [maxLon, maxLat]], {
          padding: { top: 60, bottom: 120, left: 40, right: 40 },
          pitch: 62,
          bearing: p0.smoothHeading ?? p0.heading ?? 0,
          duration
        });
      } finally {
        this._isProgrammaticCameraMove = false;
      }
    }
  }

  /**
   * Applies user manual orbit offsets around the glider in Chase mode.
   * Re-selecting 'chase' camera mode resets these offsets to zero.
   *
   * @param {number} [deltaBearingDeg=0]
   * @param {number} [deltaPitchDeg=0]
   * @param {number} [deltaZoom=0]
   */
  applyUserCameraOrbit(deltaBearingDeg = 0, deltaPitchDeg = 0, deltaZoom = 0) {
    this.userBearingOffsetDeg = (((this.userBearingOffsetDeg + (Number(deltaBearingDeg) || 0)) + 180) % 360 + 360) % 360 - 180;
    this.userPitchOffsetDeg = Math.max(-35, Math.min(20, this.userPitchOffsetDeg + (Number(deltaPitchDeg) || 0)));
    this.userZoomOffset = Math.max(-3.0, Math.min(3.0, this.userZoomOffset + (Number(deltaZoom) || 0)));
    this._syncCameraGazeWhenPaused();
  }

  /**
   * Synchronizes MapLibre dragPan interaction handler with the active cameraMode:
   * disables ground panning in 'chase' and 'cockpit' modes so user touch/mouse drags
   * never pan the camera center away from the paraglider, and enables it in 'free' mode.
   */
  _syncMapInteractionMode() {
    if (!this.map || this.isHeadless) return;
    const panHandler = this.map.dragPan;
    if (panHandler) {
      try {
        if (this.cameraMode === 'free') {
          if (typeof panHandler.enable === 'function') panHandler.enable();
        } else {
          if (typeof panHandler.disable === 'function') panHandler.disable();
        }
      } catch {}
    }
  }

  /**
   * Re-centers and re-orients the camera onto the 3D paraglider immediately when playback is not running.
   */
  _syncCameraGazeWhenPaused() {
    if (this.isDestroyed || this.isPlaying || !this.projectedTrack || this.projectedTrack.points.length === 0) {
      return;
    }
    if (this.cameraMode !== 'chase' && this.cameraMode !== 'cockpit') {
      return;
    }
    this._needsPausedFrameSync = false;
    const currentPt = this._interpolatePointAtTime(this.currentTimeSec);
    this._updateCurrentFrame(currentPt, 2.5, { preserveAutoRigBearing: true });
    if (this.map && typeof this.map.triggerRepaint === 'function') {
      this.map.triggerRepaint();
    }
  }

  /**
   * Loads flight track coordinates, projects into local Cartesian space,
   * and creates Three.js geometries and paraglider avatar.
   * 
   * @param {Array<object>} points Array of WGS84 GPS track points
   * @param {object} [options]
   */
  async loadTrack(points, options = {}) {
    if (!Array.isArray(points) || points.length === 0) {
      return;
    }

    this.rawPoints = points;
    this.projectedTrack = projectTrackToThreeLocal(points, null, { relativeAltitude: true });
    this.origin = this.projectedTrack.origin;
    this.currentTimeSec = this.projectedTrack.points[0].timeSeconds || 0;
    this.progress = 0;
    this.hasPlaybackStarted = false;
    this._cameraState = null;
    this._lastPausedSyncElevation = -1;
    this.userBearingOffsetDeg = 0;
    this.userPitchOffsetDeg = 0;
    this.userZoomOffset = 0;

    let minY = 0;
    for (const pt of this.projectedTrack.points) {
      if (typeof pt.y === 'number' && pt.y < minY) minY = pt.y;
    }
    this._minTrackY = minY;

    if (this.isHeadless || !this.map || !this.THREE || !this.maplibregl) {
      this._updateCameraForFrame(this.projectedTrack.points[0], 10.0);
      this._emitTimeUpdate(this.projectedTrack.points[0]);
      return;
    }

    // Check if DEM terrain elevation is available at takeoff origin
    this.terrainDelta = 0;
    this._hasSnappedTerrain = false;
    this._trySnapTerrain();

    // Listen for idle event to re-check when high-resolution DEM raster tiles have finished decoding
    if (this.map && typeof this.map.once === 'function') {
      this.map.once('idle', () => {
        this._trySnapTerrain();
        this._clampTrackAboveTerrain();
        this._refreshDropCurtainElevations();
        if (this.projectedTrack && this.projectedTrack.points.length > 0) {
          const currentPt = this._interpolatePointAtTime(this.currentTimeSec);
          this._updateCurrentFrame(currentPt, 10.0);
        }
        if (this.map && typeof this.map.triggerRepaint === 'function') {
          this.map.triggerRepaint();
        }
      });
    }

    const effectiveAlt = this.origin.alt + this.terrainDelta;
    const mercatorCoord = this.maplibregl.MercatorCoordinate.fromLngLat(
      [this.origin.lon, this.origin.lat],
      effectiveAlt
    );
    const meterScale = mercatorCoord.meterInMercatorCoordinateUnits();

    this.modelTransform = {
      translateX: mercatorCoord.x,
      translateY: mercatorCoord.y,
      translateZ: mercatorCoord.z,
      meterScale
    };

    // Build or Rebuild Three.js Scene and Custom Layer
    this._setupThreeCustomLayer();
    this._syncMapInteractionMode();

    // Fit map bounds to flight path only when starting in 'free' mode;
    // in 'chase' or 'cockpit' mode, frame the paraglider at takeoff immediately
    if (this.cameraMode === 'free') {
      this.fitTrackBounds(1200);
    }

    this._updateCurrentFrame(this.projectedTrack.points[0], 10.0);
    this.map.triggerRepaint();
  }

  /**
   * Constructs the MapLibre CustomLayer integrating Three.js rendering.
   */
  _setupThreeCustomLayer() {
    if (!this.map || !this.THREE) return;

    if (this.map.getLayer('3d-replay-layer')) {
      this.map.removeLayer('3d-replay-layer');
    }

    const self = this;
    const THREE = this.THREE;

    this.glCustomLayer = {
      id: '3d-replay-layer',
      type: 'custom',
      renderingMode: '3d',

      onAdd(map, gl) {
        self.threeCamera = new THREE.Camera();
        self.threeScene = new THREE.Scene();

        // 1. Ambient & Directional Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
        self.threeScene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
        dirLight.position.set(200, 800, 300);
        self.threeScene.add(dirLight);

        // 2. Trajectory Ribbon (Catmull-Rom Spline + Miter Normals + Ghost Track + Wake Trail)
        self._buildTrackRibbon();

        // 3. Drop Curtain Lines
        self._buildDropCurtain();

        // 4. Paraglider Avatar Mesh + Ground AGL Drop Indicator
        self.avatarGroup = createParagliderMesh(THREE);
        self.avatarGroup.renderOrder = 10;
        self.threeScene.add(self.avatarGroup);
        self._buildAvatarGroundIndicator();

        // Initial avatar position with dynamic scale and traveled track alignment
        if (self.projectedTrack && self.projectedTrack.points.length > 0) {
          const currentPt = self._interpolatePointAtTime(self.currentTimeSec);
          self._updateCurrentFrame(currentPt, 10.0);
        }

        // WebGL Renderer
        self.threeRenderer = new THREE.WebGLRenderer({
          canvas: map.getCanvas(),
          context: gl,
          antialias: true
        });
        self.threeRenderer.autoClear = false;

        // Preallocate reusable scratch matrices and vectors to avoid GC pressure at 60 FPS
        self._mProj = (typeof THREE.Matrix4 === 'function') ? new THREE.Matrix4() : null;
        self._coordTransform = (typeof THREE.Matrix4 === 'function') ? new THREE.Matrix4() : null;
        self._reusableVec3A = (typeof THREE.Vector3 === 'function') ? new THREE.Vector3() : null;
        self._reusableVec3B = (typeof THREE.Vector3 === 'function') ? new THREE.Vector3() : null;
      },

      render(gl, matrix) {
        if (!self.threeRenderer || !self.threeCamera || !self.threeScene || !self.modelTransform) {
          return;
        }

        const mt = self.modelTransform;

        // Auto-snap and refine origin altitude to DEM terrain elevation as higher-LOD DEM tiles load
        self._trySnapTerrain();

        const effectiveAlt = (self.origin ? self.origin.alt : 0) + self.terrainDelta + self.elevationOffset;

        // Retrieve and compensate screen center terrain elevation (Lesson 116)
        const currentPitch = (self.map && typeof self.map.getPitch === 'function') ? self.map.getPitch() : 0;
        let centerElevation = (self.map?.transform && typeof self.map.transform.elevation === 'number' && !isNaN(self.map.transform.elevation))
          ? self.map.transform.elevation
          : 0;

        if (centerElevation > 0) {
          self._lastValidCenterElevation = centerElevation;
        } else if (self._lastValidCenterElevation > 0 && (currentPitch > 75 || centerElevation <= 0)) {
          // If pitched towards the sky or elevation is momentarily invalid, preserve last valid elevation
          centerElevation = self._lastValidCenterElevation;
        } else if (centerElevation <= 0 && self._lastValidCenterElevation <= 0) {
          // Before DEM tiles stream in, anchor Three.js origin directly on MapLibre's Z=0 plane
          centerElevation = effectiveAlt;
        }

        const currentTranslateZ = (effectiveAlt - centerElevation) * mt.meterScale;

        // Mathematical MVP Matrix construction conforming to geodesy_webgl_3d_spec.md & Lesson 116:
        // Maps local Three.js (X: East, Y: Up, Z: South) to MapLibre Mercator (X: East, Y: South, Z: Up)
        if (!self._mProj && typeof THREE.Matrix4 === 'function') self._mProj = new THREE.Matrix4();
        if (!self._coordTransform && typeof THREE.Matrix4 === 'function') self._coordTransform = new THREE.Matrix4();

        if (self._mProj && self._coordTransform) {
          self._mProj.fromArray(matrix);
          self._coordTransform.set(
            mt.meterScale, 0, 0, mt.translateX,
            0, 0, mt.meterScale, mt.translateY,
            0, mt.meterScale, 0, currentTranslateZ,
            0, 0, 0, 1
          );

          self.threeCamera.projectionMatrix = self._mProj.multiply(self._coordTransform);
        } else {
          const mProj = new THREE.Matrix4().fromArray(matrix);
          const coordTransform = new THREE.Matrix4().set(
            mt.meterScale, 0, 0, mt.translateX,
            0, 0, mt.meterScale, mt.translateY,
            0, mt.meterScale, 0, currentTranslateZ,
            0, 0, 0, 1
          );
          self.threeCamera.projectionMatrix = mProj.multiply(coordTransform);
        }

        // Check for zoom changes to dynamically adapt ribbon width and height
        const rawZoom = (self.map && typeof self.map.getZoom === 'function') ? self.map.getZoom() : null;
        const currentZoom = (self.cameraMode !== 'free' && self._cameraState?.zoom) ? self._cameraState.zoom : rawZoom;
        if (currentZoom !== null && self.trackRibbonMesh && self._currentRibbonZoom !== null) {
          if (Math.abs(currentZoom - self._currentRibbonZoom) > 0.02) {
            self._updateRibbonDimensions(currentZoom);
          }
        }

        self.threeRenderer.resetState();
        self.threeRenderer.render(self.threeScene, self.threeCamera);

        if (self.isPlaying) {
          if (self.map && typeof self.map.triggerRepaint === 'function') {
            self.map.triggerRepaint();
          }
        } else if ((self.cameraMode === 'chase' || self.cameraMode === 'cockpit') && self._cameraState && self.projectedTrack?.points?.length > 0) {
          // If playback is paused and newly streamed DEM tiles changed terrainDelta or centerElevation relative to
          // the camera's referenceElevationMsl, re-project the camera ground target for the next frame so gaze stays on the glider
          const refElev = self._cameraState.referenceElevationMsl ?? centerElevation;
          const elevChanged = centerElevation > 0 &&
            Math.abs(centerElevation - refElev) > 0.5 &&
            Math.abs(centerElevation - (self._lastPausedSyncElevation ?? -1)) > 0.25;
          if (self._needsPausedFrameSync || elevChanged) {
            self._needsPausedFrameSync = false;
            if (centerElevation > 0) {
              self._lastPausedSyncElevation = centerElevation;
            }
            const currentPt = self._interpolatePointAtTime(self.currentTimeSec);
            self._updateCurrentFrame(currentPt, 2.5, { preserveAutoRigBearing: true });
            const refreshedElev = self.map?.transform?.elevation;
            if (typeof refreshedElev === 'number' && !isNaN(refreshedElev) && refreshedElev > 0) {
              self._lastValidCenterElevation = refreshedElev;
              self._lastPausedSyncElevation = refreshedElev;
            }
            if (self.map && typeof self.map.triggerRepaint === 'function') {
              self.map.triggerRepaint();
            }
          }
        }
      }
    };

    if (this.map && typeof this.map.on === 'function' && !this._onMapZoom) {
      const handleUserCameraGesture = (evt) => {
        if (this._isProgrammaticCameraMove || (this.cameraMode !== 'chase' && this.cameraMode !== 'cockpit') || !this._cameraState) {
          return;
        }
        // During active playback, only respond to direct user input events; when paused, also respond
        // to inertia/wheel-zoom easing frames (where originalEvent is omitted) so the gaze never drifts.
        if (this.isPlaying && !evt?.originalEvent) {
          return;
        }

        if (typeof this.map.getBearing === 'function') {
          const b = this.map.getBearing();
          const deltaB = (((b - this._cameraState.bearing) + 180) % 360 + 360) % 360 - 180;
          if (Math.abs(deltaB) > 1e-4) {
            this.userBearingOffsetDeg = (((this.userBearingOffsetDeg + deltaB) + 180) % 360 + 360) % 360 - 180;
            this._cameraState.bearing = b;
            if (typeof this._cameraState.rigBearing === 'number') {
              this._cameraState.rigBearing = (((this._cameraState.rigBearing + deltaB) % 360) + 360) % 360;
            }
          }
        }

        if (typeof this.map.getPitch === 'function') {
          const p = this.map.getPitch();
          const deltaP = p - this._cameraState.pitch;
          if (Math.abs(deltaP) > 1e-4) {
            this.userPitchOffsetDeg = Math.max(-35, Math.min(20, this.userPitchOffsetDeg + deltaP));
            this._cameraState.pitch = p;
            if (typeof this._cameraState.rigPitch === 'number') {
              this._cameraState.rigPitch = Math.max(15, Math.min(78, this._cameraState.rigPitch + deltaP));
            }
          }
        }

        if (typeof this.map.getZoom === 'function') {
          const z = this.map.getZoom();
          const refZoom = this._cameraState.compensatedZoom ?? this._cameraState.zoom;
          const deltaZ = z - refZoom;
          if (Math.abs(deltaZ) > 1e-4) {
            this.userZoomOffset = Math.max(-3.0, Math.min(3.0, this.userZoomOffset + deltaZ));
            this._cameraState.zoom += deltaZ;
            this._cameraState.compensatedZoom = z;
          }
        }

        if (!this.isPlaying) {
          this._syncCameraGazeWhenPaused();
        }
      };

      this._onMapZoom = (evt) => {
        if (typeof this.map.getZoom === 'function') {
          const z = this.map.getZoom();
          if (this.trackRibbonMesh && Math.abs(z - (this._currentRibbonZoom ?? 0)) > 0.02) {
            this._updateRibbonDimensions(z);
          }
        }
        handleUserCameraGesture(evt);
      };
      this._onMapRotate = (evt) => {
        handleUserCameraGesture(evt);
      };
      this._onMapPitch = (evt) => {
        handleUserCameraGesture(evt);
      };
      this._onMapMove = (evt) => {
        if (!this.isPlaying) {
          handleUserCameraGesture(evt);
        }
      };
      this._onMapIdle = () => {
        if (this.isDestroyed || !this.projectedTrack || this.projectedTrack.points.length === 0) return;
        const prevDelta = this.terrainDelta;
        const prevSnapped = this._hasSnappedTerrain;
        this._trySnapTerrain();
        const deltaChanged = Boolean(this._needsPausedFrameSync) || (this._hasSnappedTerrain !== prevSnapped) || Math.abs(this.terrainDelta - prevDelta) > 0.25;
        const liveElev = this.map?.transform?.elevation;
        const refElev = this._cameraState?.referenceElevationMsl ?? liveElev;
        const elevMismatch = typeof liveElev === 'number' && !isNaN(liveElev) && liveElev > 0 && Math.abs(liveElev - refElev) > 0.5;
        if (!this.isPlaying && (deltaChanged || elevMismatch)) {
          this._needsPausedFrameSync = false;
          const currentPt = this._interpolatePointAtTime(this.currentTimeSec);
          this._updateCurrentFrame(currentPt, 2.5, { preserveAutoRigBearing: true });
          if (this.map && typeof this.map.triggerRepaint === 'function') {
            this.map.triggerRepaint();
          }
        }
      };
      this.map.on('zoom', this._onMapZoom);
      this.map.on('rotate', this._onMapRotate);
      this.map.on('pitch', this._onMapPitch);
      this.map.on('move', this._onMapMove);
      this.map.on('idle', this._onMapIdle);
    }

    try {
      this.map.addLayer(this.glCustomLayer);
    } catch {
      // Handled gracefully
    }
  }

  /**
   * Builds vertical ground drop-line and target shadow ring directly under the glider
   * to provide continuous visual AGL height perception above the 3D terrain.
   */
  _buildAvatarGroundIndicator() {
    if (!this.THREE || !this.threeScene) return;
    const THREE = this.THREE;

    const lineGeom = new THREE.BufferGeometry();
    const linePos = new Float32Array([0, 0, 0, 0, 0, 0]);
    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55,
      depthTest: true
    });
    this.avatarGroundLine = new THREE.Line(lineGeom, lineMat);
    this.avatarGroundLine.renderOrder = 8;
    this.threeScene.add(this.avatarGroundLine);

    if (typeof THREE.RingGeometry === 'function') {
      const ringGeom = new THREE.RingGeometry(2.0, 5.5, 24);
      ringGeom.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -1.0
      });
      this.avatarShadowRing = new THREE.Mesh(ringGeom, ringMat);
      this.avatarShadowRing.renderOrder = 8;
      this.threeScene.add(this.avatarShadowRing);
    }
  }

  /**
   * Updates the glider's vertical AGL drop-line and ground target ring for the current point.
   * @param {object} pt
   */
  _updateAvatarGroundIndicator(pt) {
    if (!pt) return;
    const originAlt = this.origin?.alt ?? this.projectedTrack?.origin?.alt ?? 0;
    let groundY = this._minTrackY ?? 0;

    if (this._hasSnappedTerrain && this.map && typeof this.map.queryTerrainElevation === 'function' && typeof pt.lon === 'number' && typeof pt.lat === 'number') {
      const queryElev = this.map.queryTerrainElevation([pt.lon, pt.lat]);
      if (typeof queryElev === 'number' && !isNaN(queryElev) && queryElev > 0) {
        groundY = (queryElev - this.terrainDelta) - originAlt;
      }
    }

    const gliderY = (pt.y || 0) + this.elevationOffset;
    const targetGroundY = Math.min(gliderY, groundY);

    if (this.avatarGroundLine) {
      this.avatarGroundLine.visible = this.cameraMode !== 'cockpit';
      const geom = this.avatarGroundLine.geometry;
      const posAttr = (geom && typeof geom.getAttribute === 'function')
        ? geom.getAttribute('position')
        : geom?.attributes?.position;
      if (posAttr && posAttr.array) {
        posAttr.array[0] = pt.x;
        posAttr.array[1] = gliderY;
        posAttr.array[2] = pt.z;
        posAttr.array[3] = pt.x;
        posAttr.array[4] = targetGroundY;
        posAttr.array[5] = pt.z;
        posAttr.needsUpdate = true;
      }
    }

    if (this.avatarShadowRing) {
      this.avatarShadowRing.visible = this.cameraMode !== 'cockpit';
      this.avatarShadowRing.position.set(pt.x, targetGroundY + 0.4, pt.z);
    }
  }

  /**
   * Builds the 3D trajectory ribbon mesh with miter-bisector horizontal normals,
   * FAI variometer vertex coloring, Future Ghost Track, and Aerodynamic Wake Trail.
   */
  _buildTrackRibbon() {
    if (!this.THREE || !this.projectedTrack || !this.projectedTrack.points.length) return;
    const THREE = this.THREE;
    const rawPts = this.projectedTrack.points;
    if (rawPts.length < 2) return;

    const currentZoom = (this.map && typeof this.map.getZoom === 'function')
      ? this.map.getZoom()
      : (this.cameraMode === 'cockpit' ? 17.1 : 14);

    const dims = calculateRibbonDimensions(currentZoom, this.origin?.lat);
    const ribbonHalfWidth = dims.halfWidth;
    const ribbonHalfHeight = dims.halfHeight;
    this._currentRibbonZoom = currentZoom;

    // Generate miter-bisector horizontal normals while preserving 1:1 vertex mapping
    const smoothData = buildSmoothTrackGeometryData(rawPts, { maxSubdivisionsPerSegment: 1 });
    const pts = rawPts;
    const n = pts.length;
    this._ribbonPoints = pts;
    this._ribbonNormals = smoothData.normals.length === n * 2 ? smoothData.normals : new Float32Array(n * 2);

    const positions = [];
    const colors = [];
    const indices = [];

    const linePositions = [];
    const lineColors = [];
    const wakeColors = [];

    for (let i = 0; i < n; i++) {
      const pt = pts[i];
      const varioCol = sampleVarioRgb(pt.smoothVario ?? pt.vario);
      const r = varioCol.r;
      const g = varioCol.g;
      const b = varioCol.b;

      // Centerline points colored by smoothed FAI variometer
      linePositions.push(pt.x, pt.y, pt.z);
      lineColors.push(r, g, b);
      wakeColors.push(0.95, 0.98, 1.0);

      const nx = this._ribbonNormals[i * 2];
      const nz = this._ribbonNormals[i * 2 + 1];

      const dx = nx * ribbonHalfWidth;
      const dz = nz * ribbonHalfWidth;

      // 4 Vertices forming a 3D Diamond Prism cross-section (FAI variometer vertex colors):
      // V0: Top (+Y)
      positions.push(pt.x, pt.y + ribbonHalfHeight, pt.z);
      colors.push(r, g, b);

      // V1: Right (+X/Z lateral)
      positions.push(pt.x + dx, pt.y, pt.z + dz);
      colors.push(r, g, b);

      // V2: Bottom (-Y)
      positions.push(pt.x, pt.y - ribbonHalfHeight, pt.z);
      colors.push(r, g, b);

      // V3: Left (-X/Z lateral)
      positions.push(pt.x - dx, pt.y, pt.z - dz);
      colors.push(r, g, b);
    }

    for (let i = 0; i < n - 1; i++) {
      const a0 = i * 4;     // Top
      const a1 = a0 + 1;    // Right
      const a2 = a0 + 2;    // Bottom
      const a3 = a0 + 3;    // Left

      const b0 = (i + 1) * 4; // Next Top
      const b1 = b0 + 1;      // Next Right
      const b2 = b0 + 2;      // Next Bottom
      const b3 = b0 + 3;      // Next Left

      // Face 0: Top-Right
      indices.push(a0, a1, b0);
      indices.push(a1, b1, b0);

      // Face 1: Right-Bottom
      indices.push(a1, a2, b1);
      indices.push(a2, b2, b1);

      // Face 2: Bottom-Left
      indices.push(a2, a3, b2);
      indices.push(a3, b3, b2);

      // Face 3: Left-Top
      indices.push(a3, a0, b3);
      indices.push(a0, b0, b3);
    }

    const totalIndices = (n - 1) * 24;
    const initialIndices = !this.hasPlaybackStarted
      ? totalIndices
      : ((this.progress > 0) ? Math.floor(this.progress * (n - 1)) * 24 : 0);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geom.setIndex(indices);

    if (typeof geom.setDrawRange === 'function') {
      geom.setDrawRange(0, initialIndices);
    }

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -0.25,
      polygonOffsetUnits: -1.0
    });

    this.trackRibbonMesh = new THREE.Mesh(geom, mat);
    this.trackRibbonMesh.renderOrder = 2;
    this.threeScene.add(this.trackRibbonMesh);

    // Future Ghost Track Ribbon (16% opacity for upcoming flight path during playback)
    const ghostGeom = new THREE.BufferGeometry();
    ghostGeom.setAttribute('position', new THREE.Float32BufferAttribute([...positions], 3));
    ghostGeom.setAttribute('color', new THREE.Float32BufferAttribute([...colors], 3));
    ghostGeom.setIndex([...indices]);
    if (typeof ghostGeom.setDrawRange === 'function') {
      ghostGeom.setDrawRange(0, 0);
    }
    const ghostMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.16,
      depthTest: true,
      depthWrite: false
    });
    this.ghostRibbonMesh = new THREE.Mesh(ghostGeom, ghostMat);
    this.ghostRibbonMesh.renderOrder = 1;
    this.threeScene.add(this.ghostRibbonMesh);

    // Variometer-colored centerline spine (traveled path)
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeom.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

    if (typeof lineGeom.setDrawRange === 'function') {
      const initialLineCount = !this.hasPlaybackStarted
        ? n
        : ((this.progress > 0) ? Math.floor(this.progress * (n - 1)) + 1 : 0);
      lineGeom.setDrawRange(0, initialLineCount);
    }

    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.98,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -0.25,
      polygonOffsetUnits: -1.0
    });
    this.centerLineMesh = new THREE.Line(lineGeom, lineMat);
    this.centerLineMesh.renderOrder = 3;
    this.threeScene.add(this.centerLineMesh);

    // Future Ghost Centerline (24% opacity)
    const ghostLineGeom = new THREE.BufferGeometry();
    ghostLineGeom.setAttribute('position', new THREE.Float32BufferAttribute([...linePositions], 3));
    ghostLineGeom.setAttribute('color', new THREE.Float32BufferAttribute([...lineColors], 3));
    if (typeof ghostLineGeom.setDrawRange === 'function') {
      ghostLineGeom.setDrawRange(0, 0);
    }
    const ghostLineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.24,
      depthTest: true
    });
    this.ghostLineMesh = new THREE.Line(ghostLineGeom, ghostLineMat);
    this.ghostLineMesh.renderOrder = 1;
    this.threeScene.add(this.ghostLineMesh);

    // Aerodynamic Wake Trail (last ~12s behind the glider)
    const wakeGeom = new THREE.BufferGeometry();
    wakeGeom.setAttribute('position', new THREE.Float32BufferAttribute([...linePositions], 3));
    wakeGeom.setAttribute('color', new THREE.Float32BufferAttribute(wakeColors, 3));
    if (typeof wakeGeom.setDrawRange === 'function') {
      wakeGeom.setDrawRange(0, 0);
    }
    const wakeMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthTest: true
    });
    this.wakeTrailMesh = new THREE.Line(wakeGeom, wakeMat);
    this.wakeTrailMesh.renderOrder = 4;
    this.threeScene.add(this.wakeTrailMesh);

    // Takeoff 3D Marker (Glowing Neon Green ring)
    if (typeof THREE.RingGeometry === 'function') {
      const p0 = pts[0];
      const startGeom = new THREE.RingGeometry(3, 16, 24);
      startGeom.rotateX(-Math.PI / 2);
      const startMat = new THREE.MeshBasicMaterial({
        color: 0x00ff66,
        side: THREE.DoubleSide,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -1.0
      });
      this.takeoffMarker = new THREE.Mesh(startGeom, startMat);
      this.takeoffMarker.position.set(p0.x, p0.y + 0.5, p0.z);
      this.threeScene.add(this.takeoffMarker);

      // Landing 3D Marker (Glowing Neon Cyan ring)
      const pEnd = pts[n - 1];
      const endGeom = new THREE.RingGeometry(3, 16, 24);
      endGeom.rotateX(-Math.PI / 2);
      const endMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        side: THREE.DoubleSide,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -1.0
      });
      this.landingMarker = new THREE.Mesh(endGeom, endMat);
      this.landingMarker.position.set(pEnd.x, pEnd.y + 0.5, pEnd.z);
      this.threeScene.add(this.landingMarker);
    }
  }

  /**
   * Dynamically adjusts ribbon cross-section dimensions in response to zoom changes,
   * maintaining a constant, elegant visual screen thickness without GPU re-allocation.
   * 
   * @param {number} zoom
   */
  _updateRibbonDimensions(zoom) {
    if (!this.trackRibbonMesh || !this.projectedTrack || !this._ribbonNormals) return;
    const dims = calculateRibbonDimensions(zoom, this.origin?.lat);
    this._currentRibbonZoom = zoom;

    const geom = this.trackRibbonMesh.geometry;
    const posAttr = (geom && typeof geom.getAttribute === 'function')
      ? geom.getAttribute('position')
      : geom?.attributes?.position;
    if (!posAttr || !posAttr.array) return;

    const ghostGeom = this.ghostRibbonMesh?.geometry;
    const ghostPosAttr = (ghostGeom && typeof ghostGeom.getAttribute === 'function')
      ? ghostGeom.getAttribute('position')
      : ghostGeom?.attributes?.position;

    const pos = posAttr.array;
    const ghostPos = ghostPosAttr?.array || null;
    const pts = this._ribbonPoints || this.projectedTrack.points;
    const n = pts.length;
    const hw = dims.halfWidth;
    const hh = dims.halfHeight;
    const normals = this._ribbonNormals;

    let idx = 0;
    for (let i = 0; i < n; i++) {
      const pt = pts[i];
      const nx = normals[i * 2];
      const nz = normals[i * 2 + 1];

      // V0: Top (+Y)
      pos[idx]     = pt.x;
      pos[idx + 1] = pt.y + hh;
      pos[idx + 2] = pt.z;

      // V1: Right (+X/Z lateral)
      pos[idx + 3] = pt.x + nx * hw;
      pos[idx + 4] = pt.y;
      pos[idx + 5] = pt.z + nz * hw;

      // V2: Bottom (-Y)
      pos[idx + 6] = pt.x;
      pos[idx + 7] = pt.y - hh;
      pos[idx + 8] = pt.z;

      // V3: Left (-X/Z lateral)
      pos[idx + 9]  = pt.x - nx * hw;
      pos[idx + 10] = pt.y;
      pos[idx + 11] = pt.z - nz * hw;

      if (ghostPos) {
        for (let k = 0; k < 12; k++) {
          ghostPos[idx + k] = pos[idx + k];
        }
      }

      idx += 12;
    }

    posAttr.needsUpdate = true;
    if (ghostPosAttr) ghostPosAttr.needsUpdate = true;

    if (this._lastCurrentPoint) {
      this._updateTraveledTrack(this._lastCurrentPoint);
    }
  }

  /**
   * Builds vertical drop curtain lines from track to ground for depth perception.
   * Uses _minTrackY fallback when DEM tiles have not finished loading so pylons
   * below takeoff altitude never collapse to zero length.
   */
  _buildDropCurtain() {
    if (!this.THREE || !this.projectedTrack) return;
    const THREE = this.THREE;
    const pts = this.projectedTrack.points;
    const n = pts.length;
    if (n < 2) return;

    // Place vertical pylon lines every ~10-15 points
    const step = Math.max(4, Math.floor(n / 40));
    this._curtainStep = step;
    this._curtainPointIndices = [];
    const linePositions = [];
    const lineColors = [];

    const originAlt = this.origin?.alt ?? this.projectedTrack?.origin?.alt ?? 0;
    const fallbackGroundY = this._minTrackY ?? 0;

    for (let i = 0; i < n; i += step) {
      const pt = pts[i];
      this._curtainPointIndices.push(i);
      let groundY = fallbackGroundY;
      if (this._hasSnappedTerrain && this.map && typeof this.map.queryTerrainElevation === 'function') {
        const queryElev = this.map.queryTerrainElevation([pt.lon, pt.lat]);
        if (typeof queryElev === 'number' && !isNaN(queryElev) && queryElev > 0) {
          groundY = (queryElev - this.terrainDelta) - originAlt;
        }
      }
      const targetY = Math.min(pt.y, groundY);

      const varioCol = sampleVarioRgb(pt.smoothVario ?? pt.vario);

      linePositions.push(pt.x, pt.y, pt.z);
      linePositions.push(pt.x, targetY, pt.z);

      lineColors.push(varioCol.r, varioCol.g, varioCol.b);
      lineColors.push(varioCol.r, varioCol.g, varioCol.b);
    }

    this._totalCurtainVertices = linePositions.length / 3;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

    if (typeof geom.setDrawRange === 'function') {
      const initialCurtainCount = !this.hasPlaybackStarted
        ? this._totalCurtainVertices
        : ((this.progress > 0)
          ? Math.min(this._totalCurtainVertices, (Math.floor((this.progress * (n - 1)) / step) + 1) * 2)
          : 0);
      geom.setDrawRange(0, initialCurtainCount);
    }

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.25,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0
    });

    this.curtainMesh = new THREE.LineSegments(geom, mat);
    this.curtainMesh.renderOrder = 0;
    this.threeScene.add(this.curtainMesh);
  }

  /**
   * Re-evaluates drop curtain bottom vertices against loaded DEM terrain elevation.
   */
  _refreshDropCurtainElevations() {
    if (!this.curtainMesh || !this.projectedTrack || !this._curtainPointIndices || !this.map || typeof this.map.queryTerrainElevation !== 'function') {
      return;
    }
    const geom = this.curtainMesh.geometry;
    const posAttr = (geom && typeof geom.getAttribute === 'function')
      ? geom.getAttribute('position')
      : geom?.attributes?.position;
    if (!posAttr || !posAttr.array) return;

    const pts = this.projectedTrack.points;
    const originAlt = this.origin?.alt ?? this.projectedTrack?.origin?.alt ?? 0;
    const fallbackGroundY = this._minTrackY ?? 0;
    let updated = false;

    for (let k = 0; k < this._curtainPointIndices.length; k++) {
      const ptIdx = this._curtainPointIndices[k];
      const pt = pts[ptIdx];
      if (!pt) continue;
      let groundY = fallbackGroundY;
      const queryElev = this.map.queryTerrainElevation([pt.lon, pt.lat]);
      if (typeof queryElev === 'number' && !isNaN(queryElev) && queryElev > 0) {
        groundY = (queryElev - this.terrainDelta) - originAlt;
        updated = true;
      }
      posAttr.array[k * 6 + 4] = Math.min(pt.y, groundY);
    }

    if (updated) {
      posAttr.needsUpdate = true;
    }
  }

  /**
   * Restores a ribbon point and centerline vertex to its precomputed coordinates and FAI colors.
   * 
   * @param {number} i Point index in _ribbonPoints
   */
  _restoreRibbonPoint(i) {
    if (i == null || !this.trackRibbonMesh || !this.projectedTrack || !this._ribbonNormals) return;
    const pts = this._ribbonPoints || this.projectedTrack.points;
    if (i < 0 || i >= pts.length) return;

    const pt = pts[i];
    const geom = this.trackRibbonMesh.geometry;
    const posAttr = (geom && typeof geom.getAttribute === 'function')
      ? geom.getAttribute('position')
      : geom?.attributes?.position;
    const colAttr = (geom && typeof geom.getAttribute === 'function')
      ? geom.getAttribute('color')
      : geom?.attributes?.color;

    const currentZoom = (this.map && typeof this.map.getZoom === 'function')
      ? this.map.getZoom()
      : (this._currentRibbonZoom || 14);
    const dims = calculateRibbonDimensions(currentZoom, this.origin?.lat);
    const hw = dims.halfWidth;
    const hh = dims.halfHeight;

    const nx = this._ribbonNormals[i * 2];
    const nz = this._ribbonNormals[i * 2 + 1];

    const varioCol = sampleVarioRgb(pt.smoothVario ?? pt.vario);
    const r = varioCol.r;
    const g = varioCol.g;
    const b = varioCol.b;

    if (posAttr && posAttr.array) {
      const baseIdx = i * 12;
      posAttr.array[baseIdx]     = pt.x;
      posAttr.array[baseIdx + 1] = pt.y + hh;
      posAttr.array[baseIdx + 2] = pt.z;

      posAttr.array[baseIdx + 3] = pt.x + nx * hw;
      posAttr.array[baseIdx + 4] = pt.y;
      posAttr.array[baseIdx + 5] = pt.z + nz * hw;

      posAttr.array[baseIdx + 6] = pt.x;
      posAttr.array[baseIdx + 7] = pt.y - hh;
      posAttr.array[baseIdx + 8] = pt.z;

      posAttr.array[baseIdx + 9]  = pt.x - nx * hw;
      posAttr.array[baseIdx + 10] = pt.y;
      posAttr.array[baseIdx + 11] = pt.z - nz * hw;
      posAttr.needsUpdate = true;
    }

    if (colAttr && colAttr.array) {
      for (let c = 0; c < 4; c++) {
        colAttr.array[i * 12 + c * 3]     = r;
        colAttr.array[i * 12 + c * 3 + 1] = g;
        colAttr.array[i * 12 + c * 3 + 2] = b;
      }
      colAttr.needsUpdate = true;
    }

    for (const lineMesh of [this.centerLineMesh, this.wakeTrailMesh]) {
      if (!lineMesh) continue;
      const lineGeom = lineMesh.geometry;
      const linePos = (lineGeom && typeof lineGeom.getAttribute === 'function')
        ? lineGeom.getAttribute('position')
        : lineGeom?.attributes?.position;
      if (linePos && linePos.array) {
        linePos.array[i * 3]     = pt.x;
        linePos.array[i * 3 + 1] = pt.y;
        linePos.array[i * 3 + 2] = pt.z;
        linePos.needsUpdate = true;
      }
      if (lineMesh === this.centerLineMesh) {
        const lineCol = (lineGeom && typeof lineGeom.getAttribute === 'function')
          ? lineGeom.getAttribute('color')
          : lineGeom?.attributes?.color;
        if (lineCol && lineCol.array) {
          lineCol.array[i * 3]     = r;
          lineCol.array[i * 3 + 1] = g;
          lineCol.array[i * 3 + 2] = b;
          lineCol.needsUpdate = true;
        }
      }
    }
  }

  /**
   * Dynamically renders traveled flight track (full opacity), future Ghost Track (~18% opacity),
   * and recent aerodynamic wake trail (~12s behind the wing).
   * 
   * @param {object} currentPoint Interpolated track point at current playback time
   */
  _updateTraveledTrack(currentPoint) {
    if (!this.trackRibbonMesh || !this.projectedTrack || !this.projectedTrack.points.length) return;
    const pts = this._ribbonPoints || this.projectedTrack.points;
    const n = pts.length;
    if (n < 2) return;

    this._lastCurrentPoint = currentPoint;
    const totalIndices = (n - 1) * 24;

    // Case 0: Initial overview before playback starts - show full flight trajectory
    if (!this.hasPlaybackStarted) {
      if (this._lastModifiedIndex !== null) {
        this._restoreRibbonPoint(this._lastModifiedIndex);
        this._lastModifiedIndex = null;
      }
      if (typeof this.trackRibbonMesh.geometry.setDrawRange === 'function') {
        this.trackRibbonMesh.geometry.setDrawRange(0, totalIndices);
      }
      if (this.ghostRibbonMesh && typeof this.ghostRibbonMesh.geometry.setDrawRange === 'function') {
        this.ghostRibbonMesh.geometry.setDrawRange(0, 0);
      }
      if (this.centerLineMesh && typeof this.centerLineMesh.geometry.setDrawRange === 'function') {
        this.centerLineMesh.geometry.setDrawRange(0, n);
      }
      if (this.ghostLineMesh && typeof this.ghostLineMesh.geometry.setDrawRange === 'function') {
        this.ghostLineMesh.geometry.setDrawRange(0, 0);
      }
      if (this.wakeTrailMesh && typeof this.wakeTrailMesh.geometry.setDrawRange === 'function') {
        this.wakeTrailMesh.geometry.setDrawRange(0, 0);
      }
      if (this.curtainMesh && typeof this.curtainMesh.geometry.setDrawRange === 'function') {
        this.curtainMesh.geometry.setDrawRange(0, this._totalCurtainVertices || 0);
      }
      return;
    }

    const startSec = pts[0].timeSeconds || 0;
    const endSec = pts[n - 1].timeSeconds || (n - 1);

    // Case 1: At takeoff / progress <= 0
    if (this.currentTimeSec <= startSec || this.progress <= 0) {
      if (this._lastModifiedIndex !== null) {
        this._restoreRibbonPoint(this._lastModifiedIndex);
        this._lastModifiedIndex = null;
      }
      if (typeof this.trackRibbonMesh.geometry.setDrawRange === 'function') {
        this.trackRibbonMesh.geometry.setDrawRange(0, 0);
      }
      if (this.ghostRibbonMesh && typeof this.ghostRibbonMesh.geometry.setDrawRange === 'function') {
        this.ghostRibbonMesh.geometry.setDrawRange(0, totalIndices);
      }
      if (this.centerLineMesh && typeof this.centerLineMesh.geometry.setDrawRange === 'function') {
        this.centerLineMesh.geometry.setDrawRange(0, 0);
      }
      if (this.ghostLineMesh && typeof this.ghostLineMesh.geometry.setDrawRange === 'function') {
        this.ghostLineMesh.geometry.setDrawRange(0, n);
      }
      if (this.wakeTrailMesh && typeof this.wakeTrailMesh.geometry.setDrawRange === 'function') {
        this.wakeTrailMesh.geometry.setDrawRange(0, 0);
      }
      if (this.curtainMesh && typeof this.curtainMesh.geometry.setDrawRange === 'function') {
        this.curtainMesh.geometry.setDrawRange(0, 0);
      }
      return;
    }

    // Case 2: Flight finished / progress >= 1.0
    if (this.currentTimeSec >= endSec || this.progress >= 1.0) {
      if (this._lastModifiedIndex !== null) {
        this._restoreRibbonPoint(this._lastModifiedIndex);
        this._lastModifiedIndex = null;
      }
      if (typeof this.trackRibbonMesh.geometry.setDrawRange === 'function') {
        this.trackRibbonMesh.geometry.setDrawRange(0, totalIndices);
      }
      if (this.ghostRibbonMesh && typeof this.ghostRibbonMesh.geometry.setDrawRange === 'function') {
        this.ghostRibbonMesh.geometry.setDrawRange(0, 0);
      }
      if (this.centerLineMesh && typeof this.centerLineMesh.geometry.setDrawRange === 'function') {
        this.centerLineMesh.geometry.setDrawRange(0, n);
      }
      if (this.ghostLineMesh && typeof this.ghostLineMesh.geometry.setDrawRange === 'function') {
        this.ghostLineMesh.geometry.setDrawRange(0, 0);
      }
      if (this.wakeTrailMesh && typeof this.wakeTrailMesh.geometry.setDrawRange === 'function') {
        this.wakeTrailMesh.geometry.setDrawRange(0, 0);
      }
      if (this.curtainMesh && typeof this.curtainMesh.geometry.setDrawRange === 'function') {
        this.curtainMesh.geometry.setDrawRange(0, this._totalCurtainVertices || 0);
      }
      return;
    }

    // Case 3: In-flight intermediate segment (binary search for current spline segment)
    let low = 0;
    let high = n - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midTime = pts[mid].timeSeconds ?? mid;
      if (midTime < this.currentTimeSec) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    const idx = Math.max(0, Math.min(n - 2, high));
    const nextIdx = idx + 1;

    // If active segment moved to a different point, restore previously modified point
    if (this._lastModifiedIndex !== null && this._lastModifiedIndex !== nextIdx) {
      this._restoreRibbonPoint(this._lastModifiedIndex);
    }

    // Update nextIdx vertices to match currentPoint (connecting track seamlessly to avatar)
    const geom = this.trackRibbonMesh.geometry;
    const posAttr = (geom && typeof geom.getAttribute === 'function')
      ? geom.getAttribute('position')
      : geom?.attributes?.position;
    const colAttr = (geom && typeof geom.getAttribute === 'function')
      ? geom.getAttribute('color')
      : geom?.attributes?.color;

    const currentZoom = (this.cameraMode !== 'free' && this._cameraState?.zoom)
      ? this._cameraState.zoom
      : ((this.map && typeof this.map.getZoom === 'function')
        ? this.map.getZoom()
        : (this._currentRibbonZoom || 14));
    const dims = calculateRibbonDimensions(currentZoom, this.origin?.lat);
    const hw = dims.halfWidth;
    const hh = dims.halfHeight;

    const cp = currentPoint || pts[nextIdx];
    const effectiveHeading = (cp && (cp.smoothHeading ?? cp.heading)) || 0;
    const headingRad = (effectiveHeading * Math.PI) / 180;
    const nx = Math.cos(headingRad);
    const nz = Math.sin(headingRad);

    const varioCol = sampleVarioRgb(cp.smoothVario ?? cp.vario);
    const r = varioCol.r;
    const g = varioCol.g;
    const b = varioCol.b;

    // Pencil-tip aerodynamic tapering at the active connection to the avatar
    const hwHead = Math.min(0.04, hw * 0.15);
    const hhHead = Math.min(0.02, hh * 0.15);

    // Compute contained scale and backward offset towards harness tail cone
    const cameraDistMeters = Math.max(20, 5000000 / Math.pow(2, currentZoom));
    const avatarScale = calculateAvatarMinScale(cameraDistMeters, 60, 800, 22, 13.2, 6.5);
    const tailOffset = 0.85 * avatarScale;
    const attachX = cp.x - Math.sin(headingRad) * tailOffset;
    const attachZ = cp.z + Math.cos(headingRad) * tailOffset;
    const attachY = cp.y + 0.35 * avatarScale;

    if (posAttr && posAttr.array) {
      const baseIdx = nextIdx * 12;
      posAttr.array[baseIdx]     = attachX;
      posAttr.array[baseIdx + 1] = attachY + hhHead;
      posAttr.array[baseIdx + 2] = attachZ;

      posAttr.array[baseIdx + 3] = attachX + nx * hwHead;
      posAttr.array[baseIdx + 4] = attachY;
      posAttr.array[baseIdx + 5] = attachZ + nz * hwHead;

      posAttr.array[baseIdx + 6] = attachX;
      posAttr.array[baseIdx + 7] = attachY - hhHead;
      posAttr.array[baseIdx + 8] = attachZ;

      posAttr.array[baseIdx + 9]  = attachX - nx * hwHead;
      posAttr.array[baseIdx + 10] = attachY;
      posAttr.array[baseIdx + 11] = attachZ - nz * hwHead;
      posAttr.needsUpdate = true;
    }

    if (colAttr && colAttr.array) {
      for (let c = 0; c < 4; c++) {
        colAttr.array[nextIdx * 12 + c * 3]     = r;
        colAttr.array[nextIdx * 12 + c * 3 + 1] = g;
        colAttr.array[nextIdx * 12 + c * 3 + 2] = b;
      }
      colAttr.needsUpdate = true;
    }

    for (const lineMesh of [this.centerLineMesh, this.wakeTrailMesh]) {
      if (!lineMesh) continue;
      const lineGeom = lineMesh.geometry;
      const linePos = (lineGeom && typeof lineGeom.getAttribute === 'function')
        ? lineGeom.getAttribute('position')
        : lineGeom?.attributes?.position;
      if (linePos && linePos.array) {
        linePos.array[nextIdx * 3]     = attachX;
        linePos.array[nextIdx * 3 + 1] = attachY;
        linePos.array[nextIdx * 3 + 2] = attachZ;
        linePos.needsUpdate = true;
      }
      if (lineMesh === this.centerLineMesh) {
        const lineCol = (lineGeom && typeof lineGeom.getAttribute === 'function')
          ? lineGeom.getAttribute('color')
          : lineGeom?.attributes?.color;
        if (lineCol && lineCol.array) {
          lineCol.array[nextIdx * 3]     = r;
          lineCol.array[nextIdx * 3 + 1] = g;
          lineCol.array[nextIdx * 3 + 2] = b;
          lineCol.needsUpdate = true;
        }
      }
    }

    // Set draw range for traveled ribbon: segments 0 through idx (idx + 1 segments * 24 indices)
    const drawIndices = (idx + 1) * 24;
    if (typeof this.trackRibbonMesh.geometry.setDrawRange === 'function') {
      this.trackRibbonMesh.geometry.setDrawRange(0, drawIndices);
    }

    // Set draw range for Future Ghost Track Ribbon: from drawIndices to totalIndices
    if (this.ghostRibbonMesh && typeof this.ghostRibbonMesh.geometry.setDrawRange === 'function') {
      this.ghostRibbonMesh.geometry.setDrawRange(drawIndices, Math.max(0, totalIndices - drawIndices));
    }

    // Set draw range for traveled centerline: vertices 0 through nextIdx (nextIdx + 1 vertices)
    if (this.centerLineMesh && typeof this.centerLineMesh.geometry.setDrawRange === 'function') {
      this.centerLineMesh.geometry.setDrawRange(0, nextIdx + 1);
    }

    // Set draw range for Future Ghost Centerline: from nextIdx to n
    if (this.ghostLineMesh && typeof this.ghostLineMesh.geometry.setDrawRange === 'function') {
      this.ghostLineMesh.geometry.setDrawRange(nextIdx, Math.max(0, n - nextIdx));
    }

    // Set draw range for Aerodynamic Wake Trail (last 12 seconds behind glider)
    if (this.wakeTrailMesh && typeof this.wakeTrailMesh.geometry.setDrawRange === 'function') {
      const wakeTargetSec = this.currentTimeSec - 12;
      let wakeStartIdx = idx;
      while (wakeStartIdx > 0 && (pts[wakeStartIdx].timeSeconds ?? 0) > wakeTargetSec) {
        wakeStartIdx--;
      }
      this.wakeTrailMesh.geometry.setDrawRange(wakeStartIdx, Math.max(0, nextIdx - wakeStartIdx + 1));
    }

    // Set draw range for drop curtain: pylons up to current progress on raw projected points
    if (this.curtainMesh && typeof this.curtainMesh.geometry.setDrawRange === 'function') {
      const rawCount = this.projectedTrack.points.length;
      const rawIdx = Math.floor(this.progress * Math.max(1, rawCount - 1));
      const step = this._curtainStep || Math.max(4, Math.floor(rawCount / 40));
      const pylonCount = Math.floor(rawIdx / step) + 1;
      const curtainDrawCount = Math.min(this._totalCurtainVertices || 0, pylonCount * 2);
      this.curtainMesh.geometry.setDrawRange(0, curtainDrawCount);
    }

    this._lastModifiedIndex = nextIdx;
  }

  /**
   * Starts playback animation loop.
   */
  play() {
    if (this.isPlaying) return;
    this.hasPlaybackStarted = true;
    if (this.progress >= 1.0 && this.projectedTrack && this.projectedTrack.points.length > 0) {
      this.seek(0);
    } else if (this.projectedTrack && this.projectedTrack.points.length > 0) {
      const currentPoint = this._interpolatePointAtTime(this.currentTimeSec);
      this._updateTraveledTrack(currentPoint);
    }
    this.isPlaying = true;
    this._lastFrameTimeMs = Date.now();
    if (this.map && typeof this.map.triggerRepaint === 'function') {
      this.map.triggerRepaint();
    }
    this._runLoop();
    this.emit('play');
  }

  /**
   * Pauses playback animation loop.
   */
  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this._animationFrameId) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this._animationFrameId);
      } else {
        clearTimeout(this._animationFrameId);
      }
      this._animationFrameId = null;
    }
    if (!this.isDestroyed && this.projectedTrack && this.projectedTrack.points.length > 0) {
      if (this._cameraState && typeof this._cameraState.bearing === 'number') {
        this._cameraState.autoRigBearing = (((this._cameraState.bearing - this.userBearingOffsetDeg) % 360) + 360) % 360;
      }
      const currentPt = this._interpolatePointAtTime(this.currentTimeSec);
      this._updateCurrentFrame(currentPt, 2.5, { preserveAutoRigBearing: true });
    }
    if (this.map && typeof this.map.triggerRepaint === 'function') {
      this.map.triggerRepaint();
    }
    this.emit('pause');
  }

  /**
   * Internal requestAnimationFrame playback step.
   */
  _runLoop() {
    if (!this.isPlaying || this.isDestroyed) return;

    const now = Date.now();
    const dtSeconds = Math.min(0.2, (now - (this._lastFrameTimeMs || now)) / 1000);
    this._lastFrameTimeMs = now;

    if (!this.projectedTrack || this.projectedTrack.points.length < 2) {
      return;
    }

    const pts = this.projectedTrack.points;
    const startSec = pts[0].timeSeconds || 0;
    const endSec = pts[pts.length - 1].timeSeconds || (pts.length - 1);
    const totalDuration = Math.max(1, endSec - startSec);

    // Advance time by dt * playbackSpeed
    this.currentTimeSec += dtSeconds * this.playbackSpeed;

    if (this.currentTimeSec >= endSec) {
      this.currentTimeSec = endSec;
      this.progress = 1.0;
      this._updateCurrentFrame(pts[pts.length - 1], dtSeconds);
      if (this.map && typeof this.map.triggerRepaint === 'function') {
        this.map.triggerRepaint();
      }
      this.pause();
      this.emit('ended');
      return;
    }

    this.progress = Math.max(0, Math.min(1, (this.currentTimeSec - startSec) / totalDuration));
    const currentPoint = this._interpolatePointAtTime(this.currentTimeSec);
    this._updateCurrentFrame(currentPoint, dtSeconds);

    if (this.map && typeof this.map.triggerRepaint === 'function') {
      this.map.triggerRepaint();
    }

    if (typeof requestAnimationFrame === 'function') {
      this._animationFrameId = requestAnimationFrame(() => this._runLoop());
    } else {
      this._animationFrameId = setTimeout(() => this._runLoop(), 16);
    }
  }

  /**
   * Seeks to fractional progress [0, 1].
   * 
   * @param {number} progressFraction
   */
  seek(progressFraction) {
    if (!this.projectedTrack || this.projectedTrack.points.length === 0) return;
    this.hasPlaybackStarted = true;
    const pts = this.projectedTrack.points;
    const startSec = pts[0].timeSeconds || 0;
    const endSec = pts[pts.length - 1].timeSeconds || (pts.length - 1);
    const totalDuration = Math.max(1, endSec - startSec);

    this.progress = Math.max(0, Math.min(1, progressFraction));
    this.currentTimeSec = startSec + this.progress * totalDuration;

    const currentPoint = this._interpolatePointAtTime(this.currentTimeSec);
    const seekDt = this.isPlaying ? 0.35 : 2.5;
    this._updateCurrentFrame(currentPoint, seekDt);

    if (this.map && typeof this.map.triggerRepaint === 'function') {
      this.map.triggerRepaint();
    }
  }

  /**
   * Interpolates track sample at a specific time in seconds.
   */
  _interpolatePointAtTime(targetSec) {
    const pts = this.projectedTrack.points;
    const n = pts.length;
    if (n === 1) return pts[0];

    // Binary search for segment
    let low = 0;
    let high = n - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midTime = pts[mid].timeSeconds ?? mid;

      if (midTime < targetSec) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const idx = Math.max(0, Math.min(n - 2, high));
    const pPrev = pts[idx];
    const pNext = pts[idx + 1];

    const tPrev = pPrev.timeSeconds ?? idx;
    const tNext = pNext.timeSeconds ?? (idx + 1);
    const dt = Math.max(0.001, tNext - tPrev);
    const frac = Math.max(0, Math.min(1, (targetSec - tPrev) / dt));

    const pPrevPrev = idx > 0 ? pts[idx - 1] : null;
    const pNextNext = idx + 2 < n ? pts[idx + 2] : null;

    return interpolateTrackSample(pPrev, pNext, frac, pPrevPrev, pNextNext);
  }

  /**
   * Updates 3D paraglider avatar pose, AGL ground drop-line, and MapLibre camera for the current frame.
   * @param {object} pt
   * @param {number} [dtSeconds=0.05]
   * @param {object} [options]
   */
  _updateCurrentFrame(pt, dtSeconds = 0.05, options = {}) {
    if (!pt) return;

    this._updateCameraForFrame(pt, dtSeconds, options);

    if (this.map) {
      const rawMapZoom = (typeof this.map.getZoom === 'function') ? this.map.getZoom() : 14;
      const uncompensatedZoom = (this.cameraMode !== 'free' && this._cameraState?.zoom)
        ? this._cameraState.zoom
        : rawMapZoom;
      const cameraDistMeters = Math.max(20, 5000000 / Math.pow(2, uncompensatedZoom));
      const scale = calculateAvatarMinScale(cameraDistMeters, 60, 800, 22, 13.2, 6.5);

      if (this.avatarGroup) {
        updateAvatarPose(this.avatarGroup, {
          x: pt.x,
          y: pt.y,
          z: pt.z,
          headingDeg: pt.smoothHeading ?? pt.heading,
          pitchDeg: pt.aerodynamicPitchAngle ?? pt.pitchAngle,
          bankDeg: pt.smoothBankAngle ?? pt.bankAngle,
          brakeLeft: pt.brakeLeft ?? 0,
          brakeRight: pt.brakeRight ?? 0,
          cameraMode: this.cameraMode,
          scale
        });
      }

      this._updateAvatarGroundIndicator(pt);
    }

    this._updateTraveledTrack(pt);
    this._emitTimeUpdate(pt);
  }

  /**
   * Synchronizes MapLibre camera according to active cameraMode using exponential spring-damper,
   * thermal horizon stabilization, and safeguarded Secant-Bisection 3D ray-terrain intersection.
   *
   * @param {object} pt
   * @param {number} [dtSeconds=0.05]
   * @param {object} [options]
   */
  _updateCameraForFrame(pt, dtSeconds = 0.05, options = {}) {
    if (!pt) return;

    const effectiveOriginAlt = (this.origin?.alt ?? pt.alt ?? 0) + this.terrainDelta + this.elevationOffset;
    const relativeY = typeof pt.y === 'number' ? pt.y : ((pt.alt ?? 0) - (this.origin?.alt ?? pt.alt ?? 0));
    const gliderAltMsl = effectiveOriginAlt + relativeY;

    const canvasHeightPx = this.map?.getCanvas?.()?.clientHeight || this.container?.clientHeight || 600;
    const viewportHeightPx = (this.map?.transform?.cameraToCenterDistance > 50)
      ? (this.map.transform.cameraToCenterDistance / 1.5)
      : canvasHeightPx;

    const liveTransformElev = (this.map?.transform && typeof this.map.transform.elevation === 'number' && !isNaN(this.map.transform.elevation) && this.map.transform.elevation > 0)
      ? this.map.transform.elevation
      : 0;
    if (liveTransformElev > 0) {
      this._lastValidCenterElevation = liveTransformElev;
    }

    let groundAltMsl = effectiveOriginAlt;
    if (typeof this._cameraState?.referenceElevationMsl === 'number' && this._cameraState.referenceElevationMsl > 0 && typeof this.map?.queryTerrainElevation === 'function') {
      groundAltMsl = this._cameraState.referenceElevationMsl;
    } else if (liveTransformElev > 0) {
      groundAltMsl = liveTransformElev;
    } else if (this._lastValidCenterElevation > 0) {
      groundAltMsl = this._lastValidCenterElevation;
    } else if (this._hasSnappedTerrain && this.map && typeof this.map.queryTerrainElevation === 'function' && typeof pt.lon === 'number' && typeof pt.lat === 'number') {
      const queryElev = this.map.queryTerrainElevation([pt.lon, pt.lat]);
      if (typeof queryElev === 'number' && !isNaN(queryElev) && queryElev > 0) {
        groundAltMsl = queryElev;
      }
    }

    let valleyBearingDeg = typeof pt.valleyBearingDeg === 'number' ? pt.valleyBearingDeg : undefined;
    if (this._hasSnappedTerrain && this.map && typeof this.map.queryTerrainElevation === 'function' && typeof pt.lon === 'number' && typeof pt.lat === 'number') {
      const sampleLon = this._cameraState?.anchorLon ?? pt.lon;
      const sampleLat = this._cameraState?.anchorLat ?? pt.lat;
      const eN = this.map.queryTerrainElevation([sampleLon, sampleLat + 0.0025]);
      const eS = this.map.queryTerrainElevation([sampleLon, sampleLat - 0.0025]);
      const eE = this.map.queryTerrainElevation([sampleLon + 0.0032, sampleLat]);
      const eW = this.map.queryTerrainElevation([sampleLon - 0.0032, sampleLat]);
      if (eN > 0 && eS > 0 && eE > 0 && eW > 0) {
        const downEast = eW - eE;
        const downNorth = eS - eN;
        if (Math.hypot(downEast, downNorth) > 15) {
          valleyBearingDeg = ((Math.atan2(downEast, downNorth) * 180) / Math.PI + 360) % 360;
        }
      }
    }

    const cameraTargetPt = {
      ...pt,
      alt: gliderAltMsl
    };

    const effectiveDt = this.isPlaying ? dtSeconds : Math.max(Number(dtSeconds) || 0.05, 2.0);

    this._cameraState = stepCameraSpringDamper(this._cameraState, cameraTargetPt, effectiveDt, {
      mode: this.cameraMode,
      baseZoom: 14.3,
      basePitch: 60,
      playbackSpeed: this.playbackSpeed,
      valleyBearingDeg,
      userBearingOffsetDeg: this.userBearingOffsetDeg,
      userPitchOffsetDeg: this.userPitchOffsetDeg,
      userZoomOffset: this.userZoomOffset,
      viewportHeightPx,
      lockAnchorToFocus: !this.isPlaying,
      preserveAutoRigBearing: Boolean(options?.preserveAutoRigBearing),
      groundAltMsl
    });

    if (!this.map || this.isHeadless) return;

    if ((this.cameraMode === 'chase' || this.cameraMode === 'cockpit') && typeof this.map.jumpTo === 'function' && this._cameraState) {
      this._isProgrammaticCameraMove = true;
      try {
        this._solveAndApplyCameraGroundTarget(groundAltMsl, viewportHeightPx);
      } finally {
        this._isProgrammaticCameraMove = false;
      }
    }
    // 'free' mode: map camera is controlled interactively by user gestures
  }

  /**
   * Solves the ray-terrain intersection fixed point T(E*) = E* along the camera's 3D optical ray
   * using a safeguarded Secant-Bisection (Illinois Regula Falsi) solver so that `referenceElevationMsl`
   * matches the actual terrain elevation at `[centerLon, centerLat]`, preventing cobweb divergence on steep slopes.
   *
   * @param {number} initialElev
   * @param {number} viewportHeightPx
   */
  _solveAndApplyCameraGroundTarget(initialElev, viewportHeightPx) {
    const evalCandidate = (eRef) => computeCameraGroundTargetForAltitude({
      lat: this._cameraState.focusLat,
      lon: this._cameraState.focusLon,
      altMsl: this._cameraState.focusAlt,
      referenceElevationMsl: eRef,
      pitchDeg: this._cameraState.pitch,
      bearingDeg: this._cameraState.bearing,
      zoom: this._cameraState.zoom,
      cameraMode: this.cameraMode,
      viewportHeightPx,
      rayDistanceMeters: this._cameraState.rayDistanceMeters
    });

    const applyCandidateToState = (cand, refElev) => {
      this._cameraState.centerLon = cand.lon;
      this._cameraState.centerLat = cand.lat;
      this._cameraState.forwardOffsetMeters = cand.forwardOffsetMeters;
      this._cameraState.altitudeDeltaMeters = cand.altitudeDeltaMeters;
      this._cameraState.compensatedZoom = cand.compensatedZoom;
      this._cameraState.referenceElevationMsl = Math.round(refElev * 100) / 100;
    };

    const hasQueryFn = typeof this.map?.queryTerrainElevation === 'function';
    if (hasQueryFn) {
      const e0 = initialElev;
      const cand0 = evalCandidate(e0);
      const t0 = this.map.queryTerrainElevation([cand0.lon, cand0.lat]);

      if (typeof t0 === 'number' && !isNaN(t0) && t0 > 0) {
        const f0 = t0 - e0;
        let bestE = e0;
        let bestCand = cand0;
        let bestResidual = Math.abs(f0);

        if (bestResidual > 0.02) {
          const probe = (eVal) => {
            const c = evalCandidate(eVal);
            const t = this.map.queryTerrainElevation([c.lon, c.lat]);
            if (typeof t !== 'number' || isNaN(t) || t <= 0) return null;
            const f = t - eVal;
            if (Math.abs(f) < bestResidual) {
              bestE = eVal;
              bestCand = c;
              bestResidual = Math.abs(f);
            }
            return { e: eVal, f, cand: c, t };
          };

          const p1 = probe(Math.max(0, Math.min(this._cameraState.focusAlt + 400, e0 + 0.5 * f0)));
          if (p1 && bestResidual > 0.02) {
            let aE = e0;
            let aF = f0;
            let bE = p1.e;
            let bF = p1.f;
            let hasBracket = (aF > 0 && bF < 0) || (aF < 0 && bF > 0);

            if (!hasBracket) {
              const pFull = probe(Math.max(0, Math.min(this._cameraState.focusAlt + 400, t0)));
              if (pFull) {
                if ((aF > 0 && pFull.f < 0) || (aF < 0 && pFull.f > 0)) {
                  bE = pFull.e;
                  bF = pFull.f;
                  hasBracket = true;
                } else if ((bF > 0 && pFull.f < 0) || (bF < 0 && pFull.f > 0)) {
                  aE = bE;
                  aF = bF;
                  bE = pFull.e;
                  bF = pFull.f;
                  hasBracket = true;
                } else {
                  aE = bE;
                  aF = bF;
                  bE = pFull.e;
                  bF = pFull.f;
                }
              }
            }

            if (!hasBracket && bestResidual > 0.02) {
              const boundaryProbes = [this._cameraState.focusAlt, 0];
              for (const bProbeElev of boundaryProbes) {
                const pBound = probe(bProbeElev);
                if (pBound && ((bF > 0 && pBound.f < 0) || (bF < 0 && pBound.f > 0))) {
                  aE = bE;
                  aF = bF;
                  bE = pBound.e;
                  bF = pBound.f;
                  hasBracket = true;
                  break;
                }
              }
            }

            let sameSideCount = 0;
            for (let iter = 0; iter < 12 && bestResidual > 0.02; iter++) {
              const denom = bF - aF;
              let eNext = Math.abs(denom) > 1e-4
                ? (bE - bF * ((bE - aE) / denom))
                : (0.5 * (aE + bE));

              if (hasBracket) {
                const minB = Math.min(aE, bE);
                const maxB = Math.max(aE, bE);
                const span = maxB - minB;
                if (sameSideCount >= 2 || eNext <= minB + 0.1 * span || eNext >= maxB - 0.1 * span) {
                  eNext = 0.5 * (aE + bE);
                  sameSideCount = 0;
                }
              } else {
                const step = Math.max(-350, Math.min(350, eNext - bE));
                eNext = Math.max(0, Math.min(this._cameraState.focusAlt + 400, bE + step));
              }

              const pNext = probe(eNext);
              if (!pNext) break;

              if (hasBracket) {
                if ((pNext.f > 0 && bF < 0) || (pNext.f < 0 && bF > 0)) {
                  aE = bE;
                  aF = bF;
                  bE = pNext.e;
                  bF = pNext.f;
                  sameSideCount = 0;
                } else {
                  bE = pNext.e;
                  bF = pNext.f;
                  aF *= 0.5;
                  sameSideCount++;
                }
              } else if ((pNext.f > 0 && bF < 0) || (pNext.f < 0 && bF > 0)) {
                hasBracket = true;
                aE = bE;
                aF = bF;
                bE = pNext.e;
                bF = pNext.f;
                sameSideCount = 0;
              } else {
                aE = bE;
                aF = bF;
                bE = pNext.e;
                bF = pNext.f;
              }
            }
          }
        }

        // Preserve the converged (bestCand, bestE) pair without taking an unbracketed cobweb step
        applyCandidateToState(bestCand, bestE);
        this._lastValidCenterElevation = bestE;

        this.map.jumpTo({
          center: [this._cameraState.centerLon, this._cameraState.centerLat],
          bearing: this._cameraState.bearing,
          pitch: this._cameraState.pitch,
          zoom: this._cameraState.compensatedZoom ?? this._cameraState.zoom
        });
        return;
      }
    }

    // Fallback when queryTerrainElevation is unavailable or returns 0: use map.transform.elevation with Secant-Bisection damping
    let bestE = initialElev;
    let bestCand = evalCandidate(bestE);
    applyCandidateToState(bestCand, bestE);
    this.map.jumpTo({
      center: [this._cameraState.centerLon, this._cameraState.centerLat],
      bearing: this._cameraState.bearing,
      pitch: this._cameraState.pitch,
      zoom: this._cameraState.compensatedZoom ?? this._cameraState.zoom
    });

    const t0 = this.map?.transform?.elevation;
    if (typeof t0 === 'number' && !isNaN(t0) && t0 > 0) {
      this._lastValidCenterElevation = t0;
      const e0 = initialElev;
      const f0 = t0 - e0;
      let bestResidual = Math.abs(f0);
      if (bestResidual > 0.2) {
        let aE = e0;
        let aF = f0;
        let bE = Math.max(0, Math.min(this._cameraState.focusAlt + 400, e0 + 0.5 * f0));
        const cand1 = evalCandidate(bE);
        applyCandidateToState(cand1, bE);
        this.map.jumpTo({
          center: [this._cameraState.centerLon, this._cameraState.centerLat],
          bearing: this._cameraState.bearing,
          pitch: this._cameraState.pitch,
          zoom: this._cameraState.compensatedZoom ?? this._cameraState.zoom
        });

        const t1 = this.map?.transform?.elevation;
        if (typeof t1 === 'number' && !isNaN(t1) && t1 > 0) {
          this._lastValidCenterElevation = t1;
          let bF = t1 - bE;
          if (Math.abs(bF) < bestResidual) {
            bestE = bE;
            bestCand = cand1;
            bestResidual = Math.abs(bF);
          }

          let hasBracket = (aF > 0 && bF < 0) || (aF < 0 && bF > 0);
          for (let iter = 0; iter < 3 && bestResidual > 0.2; iter++) {
            const denom = bF - aF;
            let eNext = Math.abs(denom) > 1e-4
              ? (bE - bF * ((bE - aE) / denom))
              : (bE + 0.5 * bF);
            if (hasBracket) {
              const minB = Math.min(aE, bE);
              const maxB = Math.max(aE, bE);
              const span = maxB - minB;
              if (eNext <= minB + 0.1 * span || eNext >= maxB - 0.1 * span) {
                eNext = 0.5 * (aE + bE);
              }
            } else {
              const step = Math.max(-350, Math.min(350, eNext - bE));
              eNext = Math.max(0, Math.min(this._cameraState.focusAlt + 400, bE + step));
            }

            const candNext = evalCandidate(eNext);
            applyCandidateToState(candNext, eNext);
            this.map.jumpTo({
              center: [this._cameraState.centerLon, this._cameraState.centerLat],
              bearing: this._cameraState.bearing,
              pitch: this._cameraState.pitch,
              zoom: this._cameraState.compensatedZoom ?? this._cameraState.zoom
            });

            const tNext = this.map?.transform?.elevation;
            if (typeof tNext !== 'number' || isNaN(tNext) || tNext <= 0) break;
            this._lastValidCenterElevation = tNext;
            const fNext = tNext - eNext;
            if (Math.abs(fNext) < bestResidual) {
              bestE = eNext;
              bestCand = candNext;
              bestResidual = Math.abs(fNext);
            }

            if (hasBracket) {
              if ((fNext > 0 && bF < 0) || (fNext < 0 && bF > 0)) {
                aE = bE;
                aF = bF;
                bE = eNext;
                bF = fNext;
              } else {
                bE = eNext;
                bF = fNext;
                aF *= 0.5;
              }
            } else if ((fNext > 0 && bF < 0) || (fNext < 0 && bF > 0)) {
              hasBracket = true;
              aE = bE;
              aF = bF;
              bE = eNext;
              bF = fNext;
            } else {
              aE = bE;
              aF = bF;
              bE = eNext;
              bF = fNext;
            }
          }

          applyCandidateToState(bestCand, bestE);
          this.map.jumpTo({
            center: [this._cameraState.centerLon, this._cameraState.centerLat],
            bearing: this._cameraState.bearing,
            pitch: this._cameraState.pitch,
            zoom: this._cameraState.compensatedZoom ?? this._cameraState.zoom
          });
        }
      }
    }
  }

  /**
   * Sets playback speed multiplier.
   * @param {number} speed 1, 2, 5, 10, 20
   */
  setPlaybackSpeed(speed) {
    this.playbackSpeed = Math.max(0.25, Number(speed) || 1);
  }

  /**
   * Sets active camera perspective mode.
   * - 'chase': Resets manual touch orbit offsets and locks smooth chase camera behind the wing
   * - 'cockpit': Switches to 1st-person helmet POV (hiding PilotPod/PilotHead to prevent clipping)
   * - 'free': Unlocks camera for free exploration; re-tapping 'free' frames the entire track
   *
   * @param {'chase'|'cockpit'|'free'} mode
   */
  setCameraMode(mode) {
    if (!['chase', 'cockpit', 'free'].includes(mode)) return;
    const wasSameMode = this.cameraMode === mode;
    this.cameraMode = mode;

    this._syncMapInteractionMode();

    if (mode === 'chase') {
      this.userBearingOffsetDeg = 0;
      this.userPitchOffsetDeg = 0;
      this.userZoomOffset = 0;
    } else if (mode === 'free' && wasSameMode) {
      this.fitTrackBounds(900);
    }

    this.emit('camerachange', { mode });

    if (this.projectedTrack) {
      const currentPoint = this._interpolatePointAtTime(this.currentTimeSec);
      this._updateCurrentFrame(currentPoint, 2.5);
      if (this.map && typeof this.map.triggerRepaint === 'function') {
        this.map.triggerRepaint();
      }
    }
  }

  /**
   * Sets terrain elevation offset in meters to lift avatar above DEM surface.
   * @param {number} deltaMeters
   */
  setElevationOffset(deltaMeters) {
    this.elevationOffset = Number(deltaMeters) || 0;
    if (this.projectedTrack) {
      const currentPoint = this._interpolatePointAtTime(this.currentTimeSec);
      const offsetDt = this.isPlaying ? 0.05 : 2.5;
      this._updateCurrentFrame(currentPoint, offsetDt);
      if (this.map && typeof this.map.triggerRepaint === 'function') {
        this.map.triggerRepaint();
      }
    }
  }

  /**
   * Injects MapLibre stylesheet into document head if missing.
   */
  _injectStyles() {
    if (typeof document === 'undefined') return;
    const existing = document.querySelector(`link[href*="maplibre-gl.css"]`);
    if (!existing) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CDN_ASSETS.MAPLIBRE_CSS;
      document.head.appendChild(link);
    }
  }

  /**
   * Handles WebGL Context Lost event without crashing.
   */
  _handleContextLost(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    this.isContextLost = true;
    this.pause();
    this.emit('contextlost');
  }

  /**
   * Handles WebGL Context Restored event.
   */
  _handleContextRestored() {
    this.isContextLost = false;
    this._setupThreeCustomLayer();
    this.emit('contextrestored');
  }

  /**
   * Dispatches timeupdate event with progress and current telemetry point.
   */
  _emitTimeUpdate(currentPoint) {
    this.emit('timeupdate', {
      progress: this.progress,
      currentTimeSec: this.currentTimeSec,
      currentPoint: currentPoint || null
    });
  }

  /**
   * Destroys engine, removes layers, disposes WebGL textures, and cleans memory.
   */
  destroy() {
    this.isDestroyed = true;
    this.hasPlaybackStarted = false;
    this.pause();

    this._mProj = null;
    this._coordTransform = null;
    this._reusableVec3A = null;
    this._reusableVec3B = null;
    this._lastValidCenterElevation = 0;
    this._lastPausedSyncElevation = -1;
    this._ribbonPoints = null;
    this._ribbonNormals = null;
    this._currentRibbonZoom = null;
    this._lastModifiedIndex = null;
    this._lastCurrentPoint = null;
    this._curtainPointIndices = null;
    this._cameraState = null;

    if (this.map) {
      if (typeof this.map.off === 'function') {
        if (this._onMapZoom) this.map.off('zoom', this._onMapZoom);
        if (this._onMapRotate) this.map.off('rotate', this._onMapRotate);
        if (this._onMapPitch) this.map.off('pitch', this._onMapPitch);
        if (this._onMapMove) this.map.off('move', this._onMapMove);
        if (this._onMapIdle) this.map.off('idle', this._onMapIdle);
        this._onMapZoom = null;
        this._onMapRotate = null;
        this._onMapPitch = null;
        this._onMapMove = null;
        this._onMapIdle = null;
      }
      const mapCanvas = this.map.getCanvas();
      if (mapCanvas) {
        mapCanvas.removeEventListener('webglcontextlost', this._onContextLost);
        mapCanvas.removeEventListener('webglcontextrestored', this._onContextRestored);
      }

      if (this.glCustomLayer && this.map.getLayer('3d-replay-layer')) {
        try {
          this.map.removeLayer('3d-replay-layer');
        } catch {}
      }

      try {
        this.map.remove();
      } catch {}
      this.map = null;
    }

    if (this.threeRenderer) {
      try {
        this.threeRenderer.dispose();
      } catch {}
      this.threeRenderer = null;
    }

    if (this.threeScene) {
      this.threeScene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      this.threeScene = null;
    }

    this.container = null;
    super.destroy();
  }
}

