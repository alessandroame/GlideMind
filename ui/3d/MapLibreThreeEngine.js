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
  calculateRibbonDimensions
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
    this.trackRibbonMesh = null;
    this.centerLineMesh = null;
    this.takeoffMarker = null;
    this.landingMarker = null;
    this.curtainMesh = null;
    this._ribbonNormals = null;
    this._currentRibbonZoom = null;

    // Trajectory & Geodesic Projection State
    this.rawPoints = [];
    this.projectedTrack = null;
    this.origin = null; // { lat, lon, alt, meterScale }
    this.modelTransform = null;

    // Playback State
    this.isPlaying = false;
    this.progress = 0;
    this.currentTimeSec = 0;
    this.playbackSpeed = 1;
    this.cameraMode = this.options.initialCameraMode || 'chase';
    this.elevationOffset = 0;
    this.terrainDelta = 0;
    this._hasSnappedTerrain = false;
    this._lastValidCenterElevation = 0;

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
      const activeLayerKey = this.options.mapLayer || (isLight ? 'topo' : 'dark');
      const baseConfig = BASEMAP_LAYERS_3D[activeLayerKey] || (isLight ? BASEMAP_LAYERS_3D.topo : BASEMAP_LAYERS_3D.dark);

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
        this.terrainDelta = terrainElev - this.origin.alt;
        this._hasSnappedTerrain = true;
        if (this.modelTransform) {
          const effectiveAlt = this.origin.alt + this.terrainDelta;
          this.modelTransform.translateZ = effectiveAlt * this.modelTransform.meterScale;
        }
        return true;
      }
    }
    return false;
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

    if (this.isHeadless || !this.map || !this.THREE || !this.maplibregl) {
      this._emitTimeUpdate(this.projectedTrack.points[0]);
      return;
    }

    // Single-Shot Origin Alignment (P0)
    const p0 = points[0];

    // Check if DEM terrain elevation is available at takeoff origin
    this.terrainDelta = 0;
    this._hasSnappedTerrain = false;
    this._trySnapTerrain();

    // Listen for idle event to re-check when DEM raster tiles have finished decoding
    if (!this._hasSnappedTerrain && this.map && typeof this.map.once === 'function') {
      this.map.once('idle', () => {
        if (!this._hasSnappedTerrain) {
          const snapped = this._trySnapTerrain();
          if (snapped && this.map) {
            this.map.triggerRepaint();
          }
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

    // Fit map bounds to flight path
    let minLon = p0.lon, maxLon = p0.lon, minLat = p0.lat, maxLat = p0.lat;
    for (const pt of points) {
      if (pt.lon < minLon) minLon = pt.lon;
      if (pt.lon > maxLon) maxLon = pt.lon;
      if (pt.lat < minLat) minLat = pt.lat;
      if (pt.lat > maxLat) maxLat = pt.lat;
    }

    this.map.fitBounds([[minLon, minLat], [maxLon, maxLat]], {
      padding: { top: 60, bottom: 120, left: 40, right: 40 },
      pitch: 62,
      bearing: p0.heading || 0,
      duration: 1200
    });

    this._updateCurrentFrame(this.projectedTrack.points[0]);
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

        // 2. Trajectory Ribbon
        self._buildTrackRibbon();

        // 3. Drop Curtain Lines
        self._buildDropCurtain();

        // 4. Paraglider Avatar Mesh
        self.avatarGroup = createParagliderMesh(THREE);
        self.threeScene.add(self.avatarGroup);

        // Initial avatar position with dynamic scale
        if (self.projectedTrack && self.projectedTrack.points.length > 0) {
          self._updateCurrentFrame(self.projectedTrack.points[0]);
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

        // Auto-snap origin altitude to DEM terrain elevation if terrain finished loading
        if (!self._hasSnappedTerrain) {
          self._trySnapTerrain();
        }

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
        }

        const effectiveAlt = (self.origin ? self.origin.alt : 0) + self.terrainDelta + self.elevationOffset;
        const currentTranslateZ = (effectiveAlt - centerElevation) * mt.meterScale;

        // Mathematical MVP Matrix construction conforming to geodesy_webgl_3d_spec.md & Lesson 116:
        // Maps local Three.js (X: East, Y: Up, Z: South) to MapLibre Mercator (X: East, Y: South, Z: Up)
        // Swap Y and Z via basis matrix, scale by meterScale, translate to P0 Mercator coords
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
        const currentZoom = (self.map && typeof self.map.getZoom === 'function') ? self.map.getZoom() : null;
        if (currentZoom !== null && self.trackRibbonMesh && self._currentRibbonZoom !== null) {
          if (Math.abs(currentZoom - self._currentRibbonZoom) > 0.08) {
            self._updateRibbonDimensions(currentZoom);
          }
        }

        self.threeRenderer.resetState();
        self.threeRenderer.render(self.threeScene, self.threeCamera);

        if (self.isPlaying) {
          map.triggerRepaint();
        }
      }
    };

    try {
      this.map.addLayer(this.glCustomLayer);
    } catch {
      // Handled gracefully
    }
  }

  /**
   * Builds the 3D trajectory ribbon mesh with vertex colors derived from vario
   * and dynamic zoom-adaptive width/height dimensions.
   */
  _buildTrackRibbon() {
    if (!this.THREE || !this.projectedTrack || !this.projectedTrack.points.length) return;
    const THREE = this.THREE;
    const pts = this.projectedTrack.points;
    const n = pts.length;
    if (n < 2) return;

    const currentZoom = (this.map && typeof this.map.getZoom === 'function')
      ? this.map.getZoom()
      : (this.cameraMode === 'cockpit' ? 16.5 : 14);

    const dims = calculateRibbonDimensions(currentZoom, this.origin?.lat);
    const ribbonHalfWidth = dims.halfWidth;
    const ribbonHalfHeight = dims.halfHeight;
    this._currentRibbonZoom = currentZoom;

    // Cache precomputed heading unit normals for 60 FPS zoom-adaptive updates
    this._ribbonNormals = new Float32Array(n * 2);

    const positions = [];
    const colors = [];
    const indices = [];

    const linePositions = [];
    const lineColors = [];

    for (let i = 0; i < n; i++) {
      const pt = pts[i];
      const varioCol = sampleVarioRgb(pt.vario);
      const r = varioCol.r;
      const g = varioCol.g;
      const b = varioCol.b;

      // Centerline points colored by FAI variometer
      linePositions.push(pt.x, pt.y, pt.z);
      lineColors.push(r, g, b);

      // Compute normal to horizontal segment (heading + 90 deg)
      const headingRad = ((pt.heading || 0) * Math.PI) / 180;
      const nx = Math.cos(headingRad);
      const nz = Math.sin(headingRad);
      this._ribbonNormals[i * 2] = nx;
      this._ribbonNormals[i * 2 + 1] = nz;

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

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geom.setIndex(indices);

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -4.0
    });

    this.trackRibbonMesh = new THREE.Mesh(geom, mat);
    this.threeScene.add(this.trackRibbonMesh);

    // Variometer-colored centerline spine
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeom.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.98,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -2.0
    });
    this.centerLineMesh = new THREE.Line(lineGeom, lineMat);
    this.threeScene.add(this.centerLineMesh);

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

    const pos = posAttr.array;
    const pts = this.projectedTrack.points;
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

      idx += 12;
    }

    posAttr.needsUpdate = true;
  }

  /**
   * Builds vertical drop curtain lines from track to ground for depth perception.
   * Lines are colored matching the FAI variometer value at each point.
   */
  _buildDropCurtain() {
    if (!this.THREE || !this.projectedTrack) return;
    const THREE = this.THREE;
    const pts = this.projectedTrack.points;
    const n = pts.length;
    if (n < 2) return;

    // Place vertical pylon lines every ~10-15 points
    const step = Math.max(4, Math.floor(n / 40));
    const linePositions = [];
    const lineColors = [];

    const originAlt = this.origin?.alt ?? this.projectedTrack?.origin?.alt ?? 0;

    for (let i = 0; i < n; i += step) {
      const pt = pts[i];
      let groundMsl = originAlt;
      if (this.map && typeof this.map.queryTerrainElevation === 'function') {
        const queryElev = this.map.queryTerrainElevation([pt.lon, pt.lat]);
        if (typeof queryElev === 'number' && !isNaN(queryElev)) {
          groundMsl = queryElev;
        }
      }
      const groundY = groundMsl - originAlt;
      const targetY = Math.min(pt.y, groundY);

      const varioCol = sampleVarioRgb(pt.vario);

      linePositions.push(pt.x, pt.y, pt.z);
      linePositions.push(pt.x, targetY, pt.z);

      lineColors.push(varioCol.r, varioCol.g, varioCol.b);
      lineColors.push(varioCol.r, varioCol.g, varioCol.b);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.40,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0
    });

    this.curtainMesh = new THREE.LineSegments(geom, mat);
    this.threeScene.add(this.curtainMesh);
  }



  /**
   * Starts playback animation loop.
   */
  play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this._lastFrameTimeMs = Date.now();
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
      this._updateCurrentFrame(pts[pts.length - 1]);
      this.pause();
      this.emit('ended');
      return;
    }

    this.progress = Math.max(0, Math.min(1, (this.currentTimeSec - startSec) / totalDuration));
    const currentPoint = this._interpolatePointAtTime(this.currentTimeSec);
    this._updateCurrentFrame(currentPoint);

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
    const pts = this.projectedTrack.points;
    const startSec = pts[0].timeSeconds || 0;
    const endSec = pts[pts.length - 1].timeSeconds || (pts.length - 1);
    const totalDuration = Math.max(1, endSec - startSec);

    this.progress = Math.max(0, Math.min(1, progressFraction));
    this.currentTimeSec = startSec + this.progress * totalDuration;

    const currentPoint = this._interpolatePointAtTime(this.currentTimeSec);
    this._updateCurrentFrame(currentPoint);

    if (this.map) {
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
   * Updates 3D paraglider avatar pose and MapLibre camera for the current frame.
   */
  _updateCurrentFrame(pt) {
    if (!pt) return;

    if (this.avatarGroup && this.map) {
      // Perspective scale multiplier
      const cameraCenter = this.map.getCenter();
      const zoom = this.map.getZoom();
      // Approximate camera distance from zoom
      const cameraDistMeters = Math.max(20, 5000000 / Math.pow(2, zoom));
      const scale = calculateAvatarMinScale(cameraDistMeters, 60, 800, 36, 10.5);

      updateAvatarPose(this.avatarGroup, {
        x: pt.x,
        y: pt.y + this.elevationOffset,
        z: pt.z,
        headingDeg: pt.heading,
        pitchDeg: pt.pitchAngle,
        bankDeg: pt.bankAngle,
        scale
      });

      this._updateCameraForFrame(pt);
    }

    this._emitTimeUpdate(pt);
  }

  /**
   * Synchronizes MapLibre camera according to active cameraMode.
   */
  _updateCameraForFrame(pt) {
    if (!this.map || this.isHeadless) return;

    if (this.cameraMode === 'chase') {
      this.map.jumpTo({
        center: [pt.lon, pt.lat],
        bearing: pt.heading,
        pitch: 62
      });
    } else if (this.cameraMode === 'cockpit') {
      this.map.jumpTo({
        center: [pt.lon, pt.lat],
        bearing: pt.heading,
        pitch: 75,
        zoom: 16.5
      });
    }
    // 'free' mode: map camera is controlled interactively by user gestures
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
   * @param {'chase'|'cockpit'|'free'} mode
   */
  setCameraMode(mode) {
    if (!['chase', 'cockpit', 'free'].includes(mode)) return;
    this.cameraMode = mode;
    this.emit('camerachange', { mode });

    if (this.projectedTrack) {
      const currentPoint = this._interpolatePointAtTime(this.currentTimeSec);
      this._updateCameraForFrame(currentPoint);
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
      this._updateCurrentFrame(currentPoint);
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
    this.pause();

    this._mProj = null;
    this._coordTransform = null;
    this._reusableVec3A = null;
    this._reusableVec3B = null;
    this._lastValidCenterElevation = 0;
    this._ribbonNormals = null;
    this._currentRibbonZoom = null;

    if (this.map) {
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
