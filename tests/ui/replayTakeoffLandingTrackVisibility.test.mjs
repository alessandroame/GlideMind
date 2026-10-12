import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { FlightReplayView } from '../../ui/views/FlightReplayView.js';
import { MapLibreThreeEngine } from '../../ui/3d/MapLibreThreeEngine.js';
import { HeadlessReplayEngine } from '../../ui/3d/HeadlessReplayEngine.js';
import { DEFAULT_COMPRENSORI, parseCoordinates } from '../../core/comprensorio.js';
import { DEFAULT_SEED_FLIGHTS } from '../../core/logbook.js';
import { createStore } from '../../core/store.js';

describe('3D Flight Replay - Headless Takeoff & Landing Track Visibility Contracts', () => {
  let view;
  let mockStore;

  beforeEach(() => {
    mockStore = createStore({ flights: DEFAULT_SEED_FLIGHTS });
    view = new FlightReplayView();
  });

  describe('1. Site Location Resolution & Coordinate Grounding', () => {
    it('should resolve Monte Cornizzolo takeoff and landing coordinates from DEFAULT_COMPRENSORI', () => {
      const cornizzoloMeta = DEFAULT_SEED_FLIGHTS[0]; // fl-1 (Monte Cornizzolo)
      assert.equal(cornizzoloMeta.site, 'Monte Cornizzolo');

      const loc = view._resolveSiteLocation(cornizzoloMeta);
      assert.ok(loc);
      // Monte Cornizzolo Decollo Risparmio
      assert.ok(Math.abs(loc.takeoffLat - 45.833) < 0.005, `Expected lat ~45.833, got ${loc.takeoffLat}`);
      assert.ok(Math.abs(loc.takeoffLon - 9.302) < 0.005, `Expected lon ~9.302, got ${loc.takeoffLon}`);
      assert.equal(loc.takeoffAlt, 1060);

      // Suello Official Landing
      assert.ok(Math.abs(loc.landingLat - 45.817) < 0.005, `Expected landing lat ~45.817, got ${loc.landingLat}`);
      assert.ok(Math.abs(loc.landingLon - 9.318) < 0.005, `Expected landing lon ~9.318, got ${loc.landingLon}`);
      assert.equal(loc.landingAlt, 260);
    });

    it('should resolve Bassano del Grappa takeoff and landing coordinates', () => {
      const bassanoMeta = DEFAULT_SEED_FLIGHTS[1]; // fl-2 (Bassano)
      assert.equal(bassanoMeta.site, 'Bassano del Grappa');

      const loc = view._resolveSiteLocation(bassanoMeta);
      assert.ok(loc);
      assert.ok(loc.takeoffLat > 45.7 && loc.takeoffLat < 45.9);
      assert.ok(loc.takeoffLon > 11.6 && loc.takeoffLon < 11.9);
      assert.ok(loc.takeoffAlt > 700);
      assert.ok(loc.landingAlt < 300);
    });

    it('should resolve Meduno takeoff and landing coordinates', () => {
      const medunoMeta = DEFAULT_SEED_FLIGHTS[2]; // fl-3 (Meduno)
      assert.equal(medunoMeta.site, 'Meduno');

      const loc = view._resolveSiteLocation(medunoMeta);
      assert.ok(loc);
      assert.ok(loc.takeoffLat > 46.1 && loc.takeoffLat < 46.3);
      assert.ok(loc.takeoffLon > 12.7 && loc.takeoffLon < 12.9);
      assert.ok(loc.takeoffAlt >= 900);
      assert.ok(loc.landingAlt <= 300);
    });
  });

  describe('2. Ground-Hugging Trajectory Kinematics (Takeoff to Landing)', () => {
    it('should start track point 0 exactly at the takeoff turf and end point N-1 at landing field', () => {
      const cornizzoloFlight = DEFAULT_SEED_FLIGHTS[0];
      const pts = view._generateFallbackTrackPoints(cornizzoloFlight);

      assert.ok(Array.isArray(pts));
      assert.ok(pts.length >= 60, 'Track must contain at least 60 samples for smooth rendering');

      const p0 = pts[0];
      const pLast = pts[pts.length - 1];

      // Point 0 MUST match takeoff coordinates exactly (no offset)
      const loc = view._resolveSiteLocation(cornizzoloFlight);
      assert.equal(p0.lat, loc.takeoffLat);
      assert.equal(p0.lon, loc.takeoffLon);
      assert.equal(p0.alt, loc.takeoffAlt);
      assert.equal(p0.timeSeconds, 0);

      // Point N-1 MUST match landing coordinates exactly (touchdown)
      assert.equal(pLast.lat, loc.landingLat);
      assert.equal(pLast.lon, loc.landingLon);
      assert.equal(pLast.alt, loc.landingAlt);
      assert.ok(pLast.timeSeconds > 0);
    });

    it('should maintain realistic clearance above mountain ridge during thermal phase without stratospheric disconnect', () => {
      const cornizzoloFlight = DEFAULT_SEED_FLIGHTS[0];
      const pts = view._generateFallbackTrackPoints(cornizzoloFlight);
      const loc = view._resolveSiteLocation(cornizzoloFlight);

      let maxAlt = -Infinity;
      let minAlt = Infinity;

      for (const pt of pts) {
        if (pt.alt > maxAlt) maxAlt = pt.alt;
        if (pt.alt < minAlt) minAlt = pt.alt;
      }

      // Cornizzolo summit is 1241m. Takeoff is 1060m.
      // Flight climb should not exceed 1360m (reasonable ~200-300m climb above ridge)
      assert.ok(maxAlt <= loc.takeoffAlt + 300, `Max altitude ${maxAlt} exceeds mountain envelope`);
      assert.ok(maxAlt >= loc.takeoffAlt + 80, `Max altitude ${maxAlt} should climb above takeoff`);

      // Lowest altitude must be the landing field (260m)
      assert.equal(minAlt, loc.landingAlt);

      // During soaring (first 60% of points), coordinates should stay near ridge
      const soaringCount = Math.floor(pts.length * 0.6);
      for (let i = 0; i < soaringCount; i++) {
        const dLat = Math.abs(pts[i].lat - loc.takeoffLat);
        const dLon = Math.abs(pts[i].lon - loc.takeoffLon);
        // Distance from takeoff should be within ~0.005 degrees (~400m)
        assert.ok(dLat < 0.006, `Point ${i} drifted too far from ridge (dLat=${dLat})`);
        assert.ok(dLon < 0.006, `Point ${i} drifted too far from ridge (dLon=${dLon})`);
      }
    });

    it('should continuously descend during glide phase without unrealistic altitude spikes', () => {
      const cornizzoloFlight = DEFAULT_SEED_FLIGHTS[0];
      const pts = view._generateFallbackTrackPoints(cornizzoloFlight);

      const glideStartIdx = Math.floor(pts.length * 0.65);
      const glideEndIdx = pts.length - 1;

      // Start of glide altitude must be significantly higher than landing
      assert.ok(pts[glideStartIdx].alt > pts[glideEndIdx].alt + 400);

      // Overall slope during glide must be negative (descending to valley)
      const altDelta = pts[glideEndIdx].alt - pts[glideStartIdx].alt;
      assert.ok(altDelta < -400, `Expected descent of >400m during glide, got delta ${altDelta}`);
      assert.equal(pts[glideEndIdx].alt, 260); // Official landing elevation
    });
  });

function createMockThree() {
  return {
    Scene: class {
      constructor() {
        this.children = [];
      }
      add(obj) { this.children.push(obj); }
      traverse(fn) {
        const visit = (o) => {
          fn(o);
          if (o.children) o.children.forEach(visit);
        };
        this.children.forEach(visit);
      }
    },
    Camera: class {
      constructor() {
        this.projectionMatrix = { multiply: () => this.projectionMatrix };
        this.matrixWorldInverse = { identity: () => {} };
      }
    },
    WebGLRenderer: class {
      constructor() { this.autoClear = true; }
      resetState() {}
      render() {}
      dispose() {}
    },
    AmbientLight: class { constructor() {} },
    DirectionalLight: class { constructor() { this.position = { set: () => {} }; } },
    BufferGeometry: class {
      constructor() {
        this.attributes = {};
        this.indices = [];
        this.drawRange = { start: 0, count: Infinity };
      }
      setAttribute(name, attr) { this.attributes[name] = attr; }
      getAttribute(name) { return this.attributes[name]; }
      setIndex(idx) { this.indices = idx; }
      setDrawRange(start, count) { this.drawRange = { start, count }; }
      dispose() {}
    },
    Float32BufferAttribute: class {
      constructor(array, itemSize) {
        this.array = array;
        this.itemSize = itemSize;
        this.count = array.length / itemSize;
        this.needsUpdate = false;
      }
    },
    MeshBasicMaterial: class {
      constructor(opts) { Object.assign(this, opts); }
      dispose() {}
    },
    MeshStandardMaterial: class {
      constructor(opts) { Object.assign(this, opts); }
      dispose() {}
    },
    LineBasicMaterial: class {
      constructor(opts) { Object.assign(this, opts); }
      dispose() {}
    },
    Mesh: class {
      constructor(geom, mat) {
        this.geometry = geom;
        this.material = mat;
        this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
        this.rotation = { set() {} };
        this.scale = { setScalar() {} };
        this.children = [];
      }
    },
    Line: class {
      constructor(geom, mat) {
        this.geometry = geom;
        this.material = mat;
      }
    },
    LineSegments: class {
      constructor(geom, mat) {
        this.geometry = geom;
        this.material = mat;
      }
    },
    Group: class {
      constructor() {
        this.children = [];
        this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
        this.rotation = { set() {} };
        this.scale = { setScalar() {} };
      }
      add(child) { this.children.push(child); }
    },
    Vector3: class {
      constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
      set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
      applyMatrix4() { return this; }
    },
    RingGeometry: class {
      constructor(inner, outer, segs) {
        this.innerRadius = inner;
        this.outerRadius = outer;
        this.segments = segs;
      }
      rotateX() {}
      dispose() {}
    },
    CylinderGeometry: class {
      constructor() {}
      rotateX() {}
      dispose() {}
    },
    SphereGeometry: class {
      constructor() {}
      dispose() {}
    },
    Matrix4: class {
      constructor() { this.elements = new Float32Array(16); this.lastSetArgs = null; }
      fromArray(arr) { return this; }
      set(...args) { this.lastSetArgs = args; return this; }
      multiply(m) { return this; }
      copy(m) { return this; }
    },
    DoubleSide: 2
  };
}

  describe('3. MapLibreThreeEngine - 3D Volumetric Track & Ground Marker Contracts', () => {
    let engine;
    let mockThree;

    beforeEach(() => {
      engine = new MapLibreThreeEngine();
      mockThree = createMockThree();
    });

    it('should project flight points with P0 origin grounded at (0, 0, 0) topocentric space', async () => {
      const cornizzoloFlight = DEFAULT_SEED_FLIGHTS[0];
      const pts = view._generateFallbackTrackPoints(cornizzoloFlight);

      await engine.loadTrack(pts);

      assert.ok(engine.projectedTrack);
      assert.ok(engine.origin);
      assert.equal(engine.origin.alt, 1060);

      // P0 must be at (0, 0, 0)
      const p0 = engine.projectedTrack.points[0];
      assert.equal(p0.x, 0, 'P0 east offset must be 0');
      assert.equal(p0.y, 0, 'P0 relative altitude must be 0 (attached to takeoff)');
      assert.equal(p0.z, 0, 'P0 north offset must be 0');

      // Last point (landing) must have negative relative altitude matching valley descent
      const pLast = engine.projectedTrack.points[engine.projectedTrack.points.length - 1];
      assert.equal(pLast.y, 260 - 1060, 'Last point must be at -800m relative to takeoff');
    });

    it('should build a volumetric 3D diamond tube with FAI variometer vertex colors and dynamic zoom-adaptive width', () => {
      engine.THREE = mockThree;
      const cornizzoloFlight = DEFAULT_SEED_FLIGHTS[0];
      const pts = view._generateFallbackTrackPoints(cornizzoloFlight);
      engine.projectedTrack = {
        origin: { lat: 45.833, lon: 9.302, alt: 1060, meterScale: 1 },
        points: pts.map((p, i) => ({
          x: i * 10,
          y: p.alt - 1060,
          z: -i * 10,
          heading: 170,
          vario: i === 0 ? 3.5 : (i === 1 ? -2.5 : p.vario)
        }))
      };
      engine.origin = engine.projectedTrack.origin;
      engine.threeScene = new mockThree.Scene();

      engine._buildTrackRibbon();

      assert.ok(engine.trackRibbonMesh, 'Track ribbon mesh must be created');
      const geom = engine.trackRibbonMesh.geometry;
      assert.ok(geom.attributes.position, 'Must have position attribute');
      assert.ok(geom.attributes.color, 'Must have color attribute for FAI vario coloring');

      const posArray = geom.attributes.position.array;
      const colorArray = geom.attributes.color.array;
      const n = pts.length;
      // 4 vertices per track point (Top, Right, Bottom, Left) * 3 coords (x, y, z)
      assert.equal(posArray.length, n * 4 * 3, `Expected ${n * 4 * 3} position floats, got ${posArray.length}`);
      assert.equal(colorArray.length, n * 4 * 3, `Expected ${n * 4 * 3} color floats, got ${colorArray.length}`);

      // First point has strong climb vario = 3.5 m/s -> Salita Forte (#dc2626: r=0.86, g=0.15, b=0.15)
      assert.ok(Math.abs(colorArray[0] - 0.86) < 0.05, `First point color R must be ~0.86, got ${colorArray[0]}`);

      // Second point has strong sink vario = -2.5 m/s -> Discesa Forte (#4338ca: r=0.26, g=0.22, b=0.79)
      const p1ColorStart = 4 * 3; // 4 vertices * 3 coords
      assert.ok(Math.abs(colorArray[p1ColorStart + 2] - 0.79) < 0.05, `Second point color B must be ~0.79, got ${colorArray[p1ColorStart + 2]}`);

      // Indices must form 8 triangles (4 quads) per segment
      const numSegments = n - 1;
      assert.equal(geom.indices.length, numSegments * 4 * 6, `Expected ${numSegments * 24} indices for 4 quads`);

      // Test dynamic zoom adaptation: zooming in to 18 should shrink the ribbon cross-section
      const initV0y = posArray[1];
      const initV2y = posArray[7];
      const initialThickness = initV0y - initV2y;

      engine._updateRibbonDimensions(18);
      const zoomedV0y = posArray[1];
      const zoomedV2y = posArray[7];
      const zoomedThickness = zoomedV0y - zoomedV2y;

      assert.ok(zoomedThickness < initialThickness,
        `Zooming in must shrink ribbon thickness: zoomed (${zoomedThickness}m) < initial (${initialThickness}m)`);
      assert.ok(zoomedThickness < 2.5,
        `Zoomed in ribbon thickness must be slender (< 2.5m), got ${zoomedThickness}m`);
    });

    it('should create takeoff marker at P0 (green ring) and landing marker at PN (cyan ring)', () => {
      engine.THREE = mockThree;
      const pts = [
        { x: 0, y: 0, z: 0, heading: 170, vario: 1.0, alt: 1060 },
        { x: 50, y: 100, z: -50, heading: 170, vario: 2.0, alt: 1160 },
        { x: 100, y: -800, z: -100, heading: 170, vario: -1.5, alt: 260 }
      ];
      engine.projectedTrack = {
        origin: { lat: 45.833, lon: 9.302, alt: 1060, meterScale: 1 },
        points: pts
      };
      engine.threeScene = new mockThree.Scene();

      engine._buildTrackRibbon();

      // Takeoff marker
      assert.ok(engine.takeoffMarker, 'Takeoff marker mesh must be created');
      assert.equal(engine.takeoffMarker.position.x, 0);
      assert.equal(engine.takeoffMarker.position.y, 0.5, 'Takeoff marker must sit directly on ground turf (+0.5m)');
      assert.equal(engine.takeoffMarker.position.z, 0);

      // Landing marker
      assert.ok(engine.landingMarker, 'Landing marker mesh must be created');
      assert.equal(engine.landingMarker.position.x, 100);
      assert.equal(engine.landingMarker.position.y, -799.5, 'Landing marker must sit on landing field (+0.5m)');
      assert.equal(engine.landingMarker.position.z, -100);
    });

    it('should snap takeoff altitude rigidly to DEM terrain elevation when queryTerrainElevation is available', async () => {
      engine.THREE = mockThree;
      const mockMap = {
        queryTerrainElevation(coords) {
          // Simulate Terrarium DEM elevation: 1045m (15m below barometric 1060m)
          if (Math.abs(coords[0] - 9.302) < 0.01 && Math.abs(coords[1] - 45.833) < 0.01) {
            return 1045;
          }
          return 500;
        },
        getLayer() { return null; },
        removeLayer() {},
        addLayer() {},
        getCanvas() { return null; },
        fitBounds() {},
        triggerRepaint() {}
      };

      engine.map = mockMap;
      engine.maplibregl = {
        MercatorCoordinate: {
          fromLngLat(lngLat, alt) {
            return {
              x: 0.5,
              y: 0.5,
              z: alt * 1e-7,
              meterInMercatorCoordinateUnits: () => 1e-7
            };
          }
        }
      };

      const pts = [
        { lat: 45.833, lon: 9.302, alt: 1060, timeSeconds: 0, vario: 1.0, heading: 170 },
        { lat: 45.817, lon: 9.318, alt: 260, timeSeconds: 1200, vario: -1.0, heading: 170 }
      ];

      await engine.loadTrack(pts);

      assert.equal(engine._hasSnappedTerrain, true, 'Must snap terrain elevation');
      assert.equal(engine.terrainDelta, 1045 - 1060, 'Terrain delta must be 1045 - 1060 = -15m');

      // Model transform translateZ must use the snapped DEM elevation
      assert.ok(engine.modelTransform);
      assert.equal(engine.modelTransform.translateZ, 1045 * 1e-7, 'translateZ must match snapped DEM ground height');
    });

    it('should reject invalid, 0m or implausible DEM terrain elevations to prevent track collapsing to sea level', async () => {
      engine.THREE = mockThree;
      let queryCount = 0;
      const mockMap = {
        queryTerrainElevation(coords) {
          queryCount++;
          // First return 0 (tiles still decoding)
          if (queryCount === 1) return 0;
          // Then return NaN
          if (queryCount === 2) return NaN;
          // Then return implausible altitude delta (>600m from 1060m)
          if (queryCount === 3) return 3000;
          // Finally return correct terrain altitude (1050m)
          return 1050;
        },
        getLayer() { return null; },
        removeLayer() {},
        addLayer() {},
        getCanvas() { return null; },
        fitBounds() {},
        triggerRepaint() {},
        once(event, fn) { this._idleFn = fn; }
      };

      engine.map = mockMap;
      engine.maplibregl = {
        MercatorCoordinate: {
          fromLngLat(lngLat, alt) {
            return {
              x: 0.5,
              y: 0.5,
              z: alt * 1e-7,
              meterInMercatorCoordinateUnits: () => 1e-7
            };
          }
        }
      };

      const pts = [
        { lat: 45.833, lon: 9.302, alt: 1060, timeSeconds: 0, vario: 1.0, heading: 170 },
        { lat: 45.817, lon: 9.318, alt: 260, timeSeconds: 1200, vario: -1.0, heading: 170 }
      ];

      await engine.loadTrack(pts);

      // Attempt 1: 0m elevation must be rejected
      assert.equal(engine._hasSnappedTerrain, false, '0m DEM elevation must be rejected');
      assert.equal(engine.terrainDelta, 0, 'terrainDelta must remain 0');

      // Attempt 2: NaN must be rejected
      assert.equal(engine._trySnapTerrain(), false);
      assert.equal(engine._hasSnappedTerrain, false);

      // Attempt 3: Out-of-envelope delta must be rejected
      assert.equal(engine._trySnapTerrain(), false);
      assert.equal(engine._hasSnappedTerrain, false);

      // Attempt 4: Plausible DEM elevation (1050m, delta = -10m)
      assert.equal(engine._trySnapTerrain(), true);
      assert.equal(engine._hasSnappedTerrain, true);
      assert.equal(engine.terrainDelta, -10);
      assert.equal(engine.modelTransform.translateZ, (1060 - 10) * 1e-7);
    });

    it('should compensate screen center elevation in render loop according to Lesson 116', async () => {
      engine.THREE = mockThree;
      const mockMap = {
        transform: {
          elevation: 1500 // Center crosshair is over a 1500m mountain
        },
        getPitch: () => 60,
        getCenter: () => ({ lng: 9.302, lat: 45.833 }),
        getZoom: () => 14,
        jumpTo: () => {},
        getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
        getLayer: () => null,
        removeLayer: () => {},
        addLayer: () => {},
        fitBounds: () => {},
        triggerRepaint: () => {},
        on: () => {}
      };

      engine.map = mockMap;
      engine.maplibregl = {
        MercatorCoordinate: {
          fromLngLat(lngLat, alt) {
            return {
              x: 0.5,
              y: 0.5,
              z: alt * 1e-7,
              meterInMercatorCoordinateUnits: () => 1e-7
            };
          }
        }
      };

      const pts = [
        { lat: 45.833, lon: 9.302, alt: 1060, timeSeconds: 0, vario: 1.0, heading: 170 },
        { lat: 45.817, lon: 9.318, alt: 260, timeSeconds: 1200, vario: -1.0, heading: 170 }
      ];

      await engine.loadTrack(pts);

      // Initialize the CustomLayer
      assert.ok(engine.glCustomLayer);
      const mockGl = {};
      engine.glCustomLayer.onAdd(mockMap, mockGl);

      // Render with centerElevation = 1500m
      const dummyMatrix = new Float32Array(16);
      engine.glCustomLayer.render(mockGl, dummyMatrix);

      // In coordTransform.set(...), the 11th argument is currentTranslateZ
      // effectiveAlt = origin.alt (1060) + terrainDelta (0) + elevationOffset (0) = 1060m
      // centerElevation = 1500m
      // currentTranslateZ = (effectiveAlt - centerElevation) * meterScale = (1060 - 1500) * 1e-7 = -440 * 1e-7
      assert.ok(engine._coordTransform.lastSetArgs);
      const currentTranslateZ = engine._coordTransform.lastSetArgs[11];
      const expectedTranslateZ = (1060 - 1500) * 1e-7;
      assert.ok(Math.abs(currentTranslateZ - expectedTranslateZ) < 1e-12,
        `Expected currentTranslateZ ${expectedTranslateZ}, got ${currentTranslateZ}`);

      // Now shift camera center to valley at 400m
      mockMap.transform.elevation = 400;
      engine.glCustomLayer.render(mockGl, dummyMatrix);
      const valleyTranslateZ = engine._coordTransform.lastSetArgs[11];
      const expectedValleyZ = (1060 - 400) * 1e-7;
      assert.ok(Math.abs(valleyTranslateZ - expectedValleyZ) < 1e-12,
        `Expected currentTranslateZ ${expectedValleyZ}, got ${valleyTranslateZ}`);
    });

    it('should preserve last valid center elevation when pitch exceeds 75 degrees or looking towards horizon', async () => {
      engine.THREE = mockThree;
      const mockMap = {
        transform: {
          elevation: 1200
        },
        _pitch: 60,
        getPitch() { return this._pitch; },
        getCenter: () => ({ lng: 9.302, lat: 45.833 }),
        getZoom: () => 14,
        jumpTo: () => {},
        getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
        getLayer: () => null,
        removeLayer: () => {},
        addLayer: () => {},
        fitBounds: () => {},
        triggerRepaint: () => {},
        on: () => {}
      };

      engine.map = mockMap;
      engine.maplibregl = {
        MercatorCoordinate: {
          fromLngLat(lngLat, alt) {
            return {
              x: 0.5,
              y: 0.5,
              z: alt * 1e-7,
              meterInMercatorCoordinateUnits: () => 1e-7
            };
          }
        }
      };

      const pts = [
        { lat: 45.833, lon: 9.302, alt: 1060, timeSeconds: 0, vario: 1.0, heading: 170 },
        { lat: 45.817, lon: 9.318, alt: 260, timeSeconds: 1200, vario: -1.0, heading: 170 }
      ];

      await engine.loadTrack(pts);
      const mockGl = {};
      engine.glCustomLayer.onAdd(mockMap, mockGl);

      const dummyMatrix = new Float32Array(16);

      // Frame 1: valid center elevation = 1200m
      engine.glCustomLayer.render(mockGl, dummyMatrix);
      assert.equal(engine._lastValidCenterElevation, 1200);

      // Frame 2: pitch tilts up to 77° towards sky and map.transform.elevation drops to 0 or becomes invalid
      mockMap._pitch = 77;
      mockMap.transform.elevation = 0;
      engine.glCustomLayer.render(mockGl, dummyMatrix);

      // currentTranslateZ must NOT drop to (1060 - 0), it must preserve (1060 - 1200)
      const currentTranslateZ = engine._coordTransform.lastSetArgs[11];
      const expectedTranslateZ = (1060 - 1200) * 1e-7;
      assert.ok(Math.abs(currentTranslateZ - expectedTranslateZ) < 1e-12,
        `Expected frozen center elevation 1200m, but got ${currentTranslateZ}`);
    });

    it('should configure depthTest and polygonOffset on all ground-contact materials', () => {
      engine.THREE = mockThree;
      const pts = [
        { x: 0, y: 0, z: 0, heading: 170, vario: 1.0, alt: 1060 },
        { x: 50, y: 100, z: -50, heading: 170, vario: 2.0, alt: 1160 },
        { x: 100, y: -800, z: -100, heading: 170, vario: -1.5, alt: 260 }
      ];
      engine.projectedTrack = {
        origin: { lat: 45.833, lon: 9.302, alt: 1060, meterScale: 1 },
        points: pts
      };
      engine.origin = engine.projectedTrack.origin;
      engine.threeScene = new mockThree.Scene();

      engine._buildTrackRibbon();
      engine._buildDropCurtain();

      // Ribbon
      assert.equal(engine.trackRibbonMesh.material.depthTest, true);
      assert.equal(engine.trackRibbonMesh.material.polygonOffset, true);

      // Center Line
      assert.equal(engine.centerLineMesh.material.depthTest, true);
      assert.equal(engine.centerLineMesh.material.polygonOffset, true);

      // Takeoff and Landing rings
      assert.equal(engine.takeoffMarker.material.depthTest, true);
      assert.equal(engine.takeoffMarker.material.polygonOffset, true);
      assert.equal(engine.landingMarker.material.depthTest, true);
      assert.equal(engine.landingMarker.material.polygonOffset, true);

      // Curtain
      assert.equal(engine.curtainMesh.material.depthTest, true);
      assert.equal(engine.curtainMesh.material.polygonOffset, true);
    });
  });

  describe('4. Dynamic Traveled Track Rendering (Playback Instant Contracts)', () => {
    let engine;
    let mockThree;

    beforeEach(() => {
      mockThree = createMockThree();
      engine = new MapLibreThreeEngine();
      engine.THREE = mockThree;
      engine.threeScene = new mockThree.Scene();
    });

    it('should start with 0 track drawRange when progress is 0 (at takeoff)', async () => {
      const cornizzoloFlight = DEFAULT_SEED_FLIGHTS[0];
      const pts = view._generateFallbackTrackPoints(cornizzoloFlight);
      await engine.loadTrack(pts);

      engine.seek(0);

      assert.equal(engine.trackRibbonMesh.geometry.drawRange.count, 0, 'Ribbon must have 0 drawn indices at takeoff');
      assert.equal(engine.centerLineMesh.geometry.drawRange.count, 0, 'Centerline must have 0 drawn vertices at takeoff');
      assert.equal(engine.curtainMesh.geometry.drawRange.count, 0, 'Curtain must have 0 drawn vertices at takeoff');
    });

    it('should dynamically render traveled track up to currentPoint during playback', async () => {
      const cornizzoloFlight = DEFAULT_SEED_FLIGHTS[0];
      const pts = view._generateFallbackTrackPoints(cornizzoloFlight);
      await engine.loadTrack(pts);

      const n = engine.projectedTrack.points.length;
      const targetIdx = 10;
      const progress = targetIdx / (n - 1);
      engine.seek(progress);

      const expectedIndices = (targetIdx + 1) * 24;
      assert.equal(engine.trackRibbonMesh.geometry.drawRange.count, expectedIndices);
      assert.equal(engine.centerLineMesh.geometry.drawRange.count, targetIdx + 2);
      assert.ok(engine.curtainMesh.geometry.drawRange.count > 0);
    });

    it('should seamlessly extend ribbon and centerline when seeking across the timeline', async () => {
      const cornizzoloFlight = DEFAULT_SEED_FLIGHTS[0];
      const pts = view._generateFallbackTrackPoints(cornizzoloFlight);
      await engine.loadTrack(pts);

      engine.seek(0.25);
      const count25 = engine.trackRibbonMesh.geometry.drawRange.count;

      engine.seek(0.75);
      const count75 = engine.trackRibbonMesh.geometry.drawRange.count;

      assert.ok(count75 > count25, `Expected count at 75% (${count75}) to exceed count at 25% (${count25})`);
    });

    it('should restore previously modified vertices when seeking backward', async () => {
      const cornizzoloFlight = DEFAULT_SEED_FLIGHTS[0];
      const pts = view._generateFallbackTrackPoints(cornizzoloFlight);
      await engine.loadTrack(pts);

      engine.seek(0.5);
      const midPoint = engine.projectedTrack.points[20];
      const originalX = midPoint.x;

      engine.seek(0.2);
      const posAttr = engine.trackRibbonMesh.geometry.getAttribute('position');
      assert.equal(posAttr.array[20 * 12], originalX);
    });

    it('should render full track when progress reaches 1.0 (touchdown at landing)', async () => {
      const cornizzoloFlight = DEFAULT_SEED_FLIGHTS[0];
      const pts = view._generateFallbackTrackPoints(cornizzoloFlight);
      await engine.loadTrack(pts);

      engine.seek(1.0);

      const n = engine.projectedTrack.points.length;
      const totalIndices = (n - 1) * 24;
      assert.equal(engine.trackRibbonMesh.geometry.drawRange.count, totalIndices);
      assert.equal(engine.centerLineMesh.geometry.drawRange.count, n);
      assert.equal(engine.curtainMesh.geometry.drawRange.count, engine._totalCurtainVertices);
    });

    it('HeadlessReplayEngine should return traveledPoints array reflecting playback progress', async () => {
      const headless = new HeadlessReplayEngine();
      const cornizzoloFlight = DEFAULT_SEED_FLIGHTS[0];
      const pts = view._generateFallbackTrackPoints(cornizzoloFlight);
      await headless.loadTrack(pts);

      headless.seek(0);
      assert.equal(headless.getTraveledPoints().length, 0);

      headless.seek(0.5);
      const midPoints = headless.getTraveledPoints();
      assert.ok(midPoints.length > 0 && midPoints.length < pts.length);

      headless.seek(1.0);
      assert.equal(headless.getTraveledPoints().length, pts.length);
    });
  });
});
